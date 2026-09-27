/**
 * The music soundbank the game ships: everything the synth needs out of the cache,
 * in one small file the bake writes (`scripts/extract-osrs-music.mjs`) and the
 * browser fetches once.
 *
 * It holds the bytes as the cache stores them — the Vorbis setup header, the raw
 * patch files and the raw Vorbis sample files — so the decoding happens here, with
 * the client's own decoders, and the bank stays a fraction of the size of the audio
 * it produces. Only patches the baked tracks select, and only samples for keys
 * those tracks actually play, go in. The one exception is the handful of samples
 * that are synthesised sound effects (cache index 4): the bake renders those with
 * the existing JagFX port and stores their PCM, so the browser never needs a synth
 * for them.
 */

import { decodeMusicPatch, sampleRef } from './patch.ts';
import { VorbisSetup, decodeVorbisSample, type RawSound } from './vorbis.ts';
import type { Instrument } from './synth.ts';

export interface BankContents {
  /** Vorbis setup header (index 14, group 0, file 0). */
  setup: Uint8Array;
  /** Program number → raw patch file (index 15). */
  patches: Map<number, Uint8Array>;
  /** Sample id → raw Vorbis sample file (index 14). */
  vorbis: Map<number, Uint8Array>;
  /** Sample id → rendered synth effect (index 4). */
  sfx: Map<number, RawSound>;
}

const MAGIC = 0x424d534f; // "OSMB", little-endian
const VERSION = 1;

export function encodeBank(c: BankContents): Uint8Array {
  let size = 4 + 1 + 4 + c.setup.length + 2 + 2 + 2;
  for (const d of c.patches.values()) size += 2 + 4 + d.length;
  for (const d of c.vorbis.values()) size += 4 + 4 + d.length;
  for (const s of c.sfx.values()) size += 4 + 12 + 4 + s.samples.length;
  const out = new Uint8Array(size);
  const v = new DataView(out.buffer);
  let o = 0;
  const bytes = (b: Uint8Array | Int8Array) => {
    out.set(new Uint8Array(b.buffer, b.byteOffset, b.byteLength), o);
    o += b.byteLength;
  };
  v.setUint32(o, MAGIC, true); o += 4;
  v.setUint8(o, VERSION); o += 1;
  v.setUint32(o, c.setup.length, true); o += 4;
  bytes(c.setup);
  v.setUint16(o, c.patches.size, true); o += 2;
  for (const [program, d] of c.patches) {
    v.setUint16(o, program, true); o += 2;
    v.setUint32(o, d.length, true); o += 4;
    bytes(d);
  }
  v.setUint16(o, c.vorbis.size, true); o += 2;
  for (const [id, d] of c.vorbis) {
    v.setUint32(o, id, true); o += 4;
    v.setUint32(o, d.length, true); o += 4;
    bytes(d);
  }
  v.setUint16(o, c.sfx.size, true); o += 2;
  for (const [id, s] of c.sfx) {
    v.setUint32(o, id, true); o += 4;
    v.setInt32(o, s.sampleRate, true); o += 4;
    v.setInt32(o, s.start, true); o += 4;
    v.setInt32(o, s.end, true); o += 4;
    v.setUint32(o, s.samples.length, true); o += 4;
    bytes(s.samples);
  }
  return out;
}

export function decodeBank(data: Uint8Array): BankContents {
  const v = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let o = 0;
  const u8 = () => v.getUint8(o++);
  const u16 = () => { const x = v.getUint16(o, true); o += 2; return x; };
  const u32 = () => { const x = v.getUint32(o, true); o += 4; return x; };
  const i32 = () => { const x = v.getInt32(o, true); o += 4; return x; };
  const take = (n: number) => { const b = data.slice(o, o + n); o += n; return b; };

  if (u32() !== MAGIC) throw new Error('music bank: bad magic');
  const version = u8();
  if (version !== VERSION) throw new Error(`music bank: version ${version}`);
  const setup = take(u32());
  const patches = new Map<number, Uint8Array>();
  for (let n = u16(); n > 0; n--) {
    const program = u16();
    patches.set(program, take(u32()));
  }
  const vorbis = new Map<number, Uint8Array>();
  for (let n = u16(); n > 0; n--) {
    const id = u32();
    vorbis.set(id, take(u32()));
  }
  const sfx = new Map<number, RawSound>();
  for (let n = u16(); n > 0; n--) {
    const id = u32();
    const sampleRate = i32();
    const start = i32();
    const end = i32();
    const b = take(u32());
    sfx.set(id, { sampleRate, samples: new Int8Array(b.buffer, b.byteOffset, b.length), start, end, pingPong: false });
  }
  return { setup, patches, vorbis, sfx };
}

/**
 * A decoded bank, handing the synth its instruments. Patches and samples decode
 * on first use and stay cached, so switching tracks re-uses every shared drum kit
 * and string section.
 */
export class SoundBank {
  private readonly contents: BankContents;
  private setup: VorbisSetup | null = null;
  private readonly instruments = new Map<number, Instrument | null>();
  private readonly sounds = new Map<number, RawSound | null>();

  constructor(contents: BankContents) {
    this.contents = contents;
  }

  static fromBytes(data: Uint8Array) {
    return new SoundBank(decodeBank(data));
  }

  /** The synth's `InstrumentSource`: program → patch with its samples resolved. */
  readonly instrument = (program: number): Instrument | null => {
    const cached = this.instruments.get(program);
    if (cached !== undefined) return cached;
    const raw = this.contents.patches.get(program);
    let inst: Instrument | null = null;
    if (raw) {
      const patch = decodeMusicPatch(raw);
      const sounds: (RawSound | null)[] = new Array(128).fill(null);
      for (let k = 0; k < 128; k++) if (patch.sampleIds[k]) sounds[k] = this.sound(patch.sampleIds[k]);
      inst = { patch, sounds };
    }
    this.instruments.set(program, inst);
    return inst;
  };

  private sound(packed: number): RawSound | null {
    const cached = this.sounds.get(packed);
    if (cached !== undefined) return cached;
    const ref = sampleRef(packed)!;
    let s: RawSound | null = null;
    if (ref.kind === 'sfx') {
      s = this.contents.sfx.get(ref.id) ?? null;
    } else {
      const raw = this.contents.vorbis.get(ref.id);
      if (raw) {
        this.setup ??= new VorbisSetup(this.contents.setup);
        s = decodeVorbisSample(this.setup, raw);
      }
    }
    this.sounds.set(packed, s);
    return s;
  }
}
