/**
 * An OSRS music patch — one instrument of the client's soundbank (cache index 15),
 * decoded the way the client's `MusicPatch` constructor does it.
 *
 * A patch maps each of the 128 MIDI keys to a sample (a Vorbis clip from index 14,
 * or a synthesised sound effect from index 4), the pitch that sample was recorded
 * at, a volume, a pan, an exclusive class (a hi-hat that chokes the open hi-hat)
 * and a shared envelope. The file stores all of that run-length packed and
 * interleaved; the order of the reads below *is* the format, so it follows the
 * client's line for line.
 *
 * The byte arrays keep Java's signed-byte semantics on purpose (`Int8Array`): the
 * synth multiplies by them as signed values, and a volume the packing pushed past
 * 127 wraps exactly as it does in the client.
 */

export interface PatchEnvelope {
  /** Attack/sustain curve: [time, level] pairs, time in 1/256 of the rate unit. */
  volume: Int8Array | null;
  /** Release curve, started by note-off; it always opens at level 64 (unity). */
  release: Int8Array | null;
  /** Exponential decay while the note sounds (0 = none) and its key scaling. */
  decayRate: number;
  decayKeyScale: number;
  volumeKeyScale: number;
  releaseKeyScale: number;
  vibratoRate: number;
  vibratoDepth: number;
  vibratoDelay: number;
}

export interface MusicPatch {
  /** Per key: the sample's root pitch in 1/256 semitones; the sign bit means "loop". */
  pitchOffsets: Int16Array;
  /** Per key: (sample reference + 1), 0 for a key with no sample. See `sampleRef`. */
  sampleIds: Int32Array;
  volumes: Int8Array;
  pans: Int8Array;
  exclusiveClasses: Int8Array;
  envelopes: (PatchEnvelope | null)[];
  globalVolume: number;
}

/** What a key's sample id points at: a Vorbis clip (index 14) or a synth effect (index 4). */
export interface SampleRef {
  kind: 'vorbis' | 'sfx';
  id: number;
}

/** Decode the packed sample id of one key (0 → no sample). */
export function sampleRef(packed: number): SampleRef | null {
  if (packed === 0) return null;
  const v = packed - 1;
  return { kind: (v & 1) === 0 ? 'sfx' : 'vorbis', id: v >> 2 };
}

/** Every distinct sample a patch plays, in key order. */
export function patchSamples(patch: MusicPatch): SampleRef[] {
  const out: SampleRef[] = [];
  const seen = new Set<number>();
  for (const packed of patch.sampleIds) {
    if (packed === 0 || seen.has(packed)) continue;
    seen.add(packed);
    out.push(sampleRef(packed)!);
  }
  return out;
}

/** Java's `readVarInt` / MIDI variable-length quantity. */
function varInt(data: Uint8Array, pos: { o: number }) {
  let b = data[pos.o++];
  let v = 0;
  while (b & 0x80) {
    v = (v | (b & 0x7f)) << 7;
    b = data[pos.o++];
  }
  return v | b;
}

/** Floor division, the client's `(a + (a >>> 31)) / b - (a >>> 31)`. */
function floorDiv(a: number, b: number) {
  const s = a >>> 31;
  return Math.trunc((a + s) / b) - s;
}

const sb = (b: number) => (b << 24) >> 24;

export function decodeMusicPatch(data: Uint8Array): MusicPatch {
  const p = { o: 0 };
  const u8 = () => data[p.o++];
  const s8 = () => sb(data[p.o++]);
  /** A zero-terminated run of signed bytes, and the offset just past it. */
  const run = () => {
    let len = 0;
    while (data[p.o + len] !== 0) len++;
    const bytes = new Int8Array(len);
    for (let i = 0; i < len; i++) bytes[i] = s8();
    p.o++;
    return bytes;
  };

  const exclusiveRuns = run();
  let exclusiveAt = p.o;
  p.o += exclusiveRuns.length + 1;

  const panRuns = run();
  let panAt = p.o;
  p.o += panRuns.length + 1;

  const envRuns = run();
  const envCount = envRuns.length + 1;
  const envIndex = new Int8Array(envCount);
  let nodes: number;
  if (envCount > 1) {
    envIndex[1] = 1;
    let last = 1;
    nodes = 2;
    for (let i = 2; i < envCount; i++) {
      let v = u8();
      if (v === 0) {
        last = nodes++;
      } else {
        if (v <= last) v--;
        last = v;
      }
      envIndex[i] = last;
    }
  } else {
    nodes = envCount;
  }

  const envs: PatchEnvelope[] = [];
  for (let i = 0; i < nodes; i++) {
    const env: PatchEnvelope = {
      volume: null, release: null, decayRate: 0, decayKeyScale: 0, volumeKeyScale: 0,
      releaseKeyScale: 0, vibratoRate: 0, vibratoDepth: 0, vibratoDelay: 0,
    };
    let n = u8();
    if (n > 0) env.volume = new Int8Array(n * 2);
    n = u8();
    if (n > 0) {
      env.release = new Int8Array(n * 2 + 2);
      env.release[1] = 64;
    }
    envs.push(env);
  }

  let n = u8();
  const volCurve = n > 0 ? new Int8Array(n * 2) : null;
  n = u8();
  const panCurve = n > 0 ? new Int8Array(n * 2) : null;

  const keyRuns = run();

  const pitchOffsets = new Int16Array(128);
  const sampleIds = new Int32Array(128);
  const volumes = new Int8Array(128);
  const pans = new Int8Array(128);
  const exclusiveClasses = new Int8Array(128);
  const envelopes: (PatchEnvelope | null)[] = new Array(128).fill(null);

  let acc = 0;
  for (let k = 0; k < 128; k++) {
    acc += u8();
    pitchOffsets[k] = acc;
  }
  acc = 0;
  for (let k = 0; k < 128; k++) {
    acc += u8();
    pitchOffsets[k] = pitchOffsets[k] + (acc << 8);
  }

  let left = 0;
  let r = 0;
  let cur = 0;
  for (let k = 0; k < 128; k++) {
    if (left === 0) {
      left = r < keyRuns.length ? keyRuns[r++] : -1;
      cur = varInt(data, p);
    }
    pitchOffsets[k] = pitchOffsets[k] + (((cur - 1) & 2) << 14);
    sampleIds[k] = cur;
    left--;
  }

  left = 0; r = 0; cur = 0;
  for (let k = 0; k < 128; k++) {
    if (sampleIds[k] === 0) continue;
    if (left === 0) {
      left = r < exclusiveRuns.length ? exclusiveRuns[r++] : -1;
      cur = sb(data[exclusiveAt++]) - 1;
    }
    exclusiveClasses[k] = cur;
    left--;
  }

  left = 0; r = 0; cur = 0;
  for (let k = 0; k < 128; k++) {
    if (sampleIds[k] === 0) continue;
    if (left === 0) {
      left = r < panRuns.length ? panRuns[r++] : -1;
      cur = (sb(data[panAt++]) + 16) << 2;
    }
    pans[k] = cur;
    left--;
  }

  left = 0; r = 0;
  let env: PatchEnvelope | null = null;
  for (let k = 0; k < 128; k++) {
    if (sampleIds[k] === 0) continue;
    if (left === 0) {
      env = envs[envIndex[r]];
      left = r < envRuns.length ? envRuns[r++] : -1;
    }
    envelopes[k] = env;
    left--;
  }

  left = 0; r = 0; cur = 0;
  for (let k = 0; k < 128; k++) {
    if (left === 0) {
      left = r < keyRuns.length ? keyRuns[r++] : -1;
      if (sampleIds[k] > 0) cur = u8() + 1;
    }
    volumes[k] = cur;
    left--;
  }

  const globalVolume = u8() + 1;

  for (const e of envs) {
    if (e.volume) for (let i = 1; i < e.volume.length; i += 2) e.volume[i] = s8();
    if (e.release) for (let i = 3; i < e.release.length - 2; i += 2) e.release[i] = s8();
  }
  if (volCurve) for (let i = 1; i < volCurve.length; i += 2) volCurve[i] = s8();
  if (panCurve) for (let i = 1; i < panCurve.length; i += 2) panCurve[i] = s8();

  for (const e of envs) {
    if (!e.release) continue;
    acc = 0;
    for (let i = 2; i < e.release.length; i += 2) {
      acc = acc + 1 + u8();
      e.release[i] = acc;
    }
  }
  for (const e of envs) {
    if (!e.volume) continue;
    acc = 0;
    for (let i = 2; i < e.volume.length; i += 2) {
      acc = acc + 1 + u8();
      e.volume[i] = acc;
    }
  }

  if (volCurve) {
    acc = u8();
    volCurve[0] = acc;
    for (let i = 2; i < volCurve.length; i += 2) {
      acc = acc + 1 + u8();
      volCurve[i] = acc;
    }
    let from = volCurve[0];
    let level = volCurve[1];
    for (let k = 0; k < from; k++) volumes[k] = (level * volumes[k] + 32) >> 6;
    for (let i = 2; i < volCurve.length; i += 2) {
      const to = volCurve[i];
      const next = volCurve[i + 1];
      let t = level * (to - from) + Math.trunc((to - from) / 2);
      for (let k = from; k < to; k++) {
        volumes[k] = (floorDiv(t, to - from) * volumes[k] + 32) >> 6;
        t += next - level;
      }
      from = to;
      level = next;
    }
    for (let k = from; k < 128; k++) volumes[k] = (level * volumes[k] + 32) >> 6;
  }

  if (panCurve) {
    acc = u8();
    panCurve[0] = acc;
    for (let i = 2; i < panCurve.length; i += 2) {
      acc = acc + 1 + u8();
      panCurve[i] = acc;
    }
    const clampPan = (v: number) => (v < 0 ? 0 : v > 128 ? 128 : v);
    let from = panCurve[0];
    let shift = panCurve[1] << 1;
    for (let k = 0; k < from; k++) pans[k] = clampPan(shift + (pans[k] & 0xff));
    for (let i = 2; i < panCurve.length; i += 2) {
      const to = panCurve[i];
      const next = panCurve[i + 1] << 1;
      let t = shift * (to - from) + Math.trunc((to - from) / 2);
      for (let k = from; k < to; k++) {
        pans[k] = clampPan(floorDiv(t, to - from) + (pans[k] & 0xff));
        t += next - shift;
      }
      from = to;
      shift = next;
    }
    for (let k = from; k < 128; k++) pans[k] = clampPan(shift + (pans[k] & 0xff));
  }

  for (const e of envs) e.decayRate = u8();
  for (const e of envs) {
    if (e.volume) e.volumeKeyScale = u8();
    if (e.release) e.releaseKeyScale = u8();
    if (e.decayRate > 0) e.decayKeyScale = u8();
  }
  for (const e of envs) e.vibratoRate = u8();
  for (const e of envs) if (e.vibratoRate > 0) e.vibratoDepth = u8();
  for (const e of envs) if (e.vibratoDepth > 0) e.vibratoDelay = u8();

  return { pitchOffsets, sampleIds, volumes, pans, exclusiveClasses, envelopes, globalVolume };
}
