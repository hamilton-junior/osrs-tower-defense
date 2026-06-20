/**
 * Offline sound-extraction PoC — decodes OSRS **synthesised sound effects**
 * straight from a local game cache and writes them as 8-bit / 22050 Hz mono WAVs
 * into `public/`, so the game no longer depends on the (sparse) set of clips the
 * wiki happens to host.
 *
 * Index 4 (SOUNDEFFECTS) doesn't store ready audio — each file is a tiny synth
 * program (oscillator + envelope + filter "tones") the client renders at runtime.
 * osrscachereader has no decoder for it, so we port the canonical synthesizer
 * (LostCityRS/Client-TS `sound/Envelope|Tone|JagFX`, itself the de-obfuscated
 * Jagex algorithm) here and run it offline. Output is plain RIFF/WAVE PCM that
 * any browser can play through the existing SoundManager.
 *
 *   node scripts/extract-osrs-sounds.mjs                 # render curated TARGETS → public/
 *   node scripts/extract-osrs-sounds.mjs --dump 0 200    # dump a sound-id range → tmp/ for discovery
 *   node scripts/extract-osrs-sounds.mjs --only 1568     # render a single id → tmp/ (audition)
 *   OSRS_CACHE_DIR="/path/to/LIVE" node scripts/extract-osrs-sounds.mjs
 *
 * Sound-effect IDs aren't in a tidy enum like sprites; use `--dump` to audition
 * ranges and note the ones you want, then add them to TARGETS.
 */
import { RSCache, IndexType } from 'osrscachereader';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, '..');

const DEFAULT_CACHE = join(homedir(), '.runelite', 'jagexcache', 'oldschool', 'LIVE');
const CACHE_DIR = process.env.OSRS_CACHE_DIR || DEFAULT_CACHE;

const SAMPLE_RATE = 22050;

/**
 * Curated sound-effect IDs → output basename. Empty by default: populate it from
 * `--dump` auditions. Each entry renders to `public/assets/sounds/<slug>.wav` and
 * can then be referenced from `lib/game/assets.ts`.
 */
const TARGETS = {
  // example: archer_shot: 2693,
};

// --------------------------------------------------------------------------
// Minimal big-endian reader (the handful of Packet ops the synth loader uses).
// --------------------------------------------------------------------------
class Reader {
  constructor(bytes) {
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    this.pos = 0;
  }
  g1() { return this.view.getUint8(this.pos++); }
  g2() { const v = this.view.getUint16(this.pos); this.pos += 2; return v; }
  g4() { const v = this.view.getInt32(this.pos); this.pos += 4; return v; }
  // "smart" — 1 or 2 bytes depending on the top bit of the next byte.
  gsmart() { return this.view.getUint8(this.pos) < 0x80 ? this.g1() - 0x40 : this.g2() - 0xc000; }
  gsmarts() { return this.view.getUint8(this.pos) < 0x80 ? this.g1() : this.g2() - 0x8000; }
}

// Java's java.util.Random — needed so the noise table matches the client exactly.
class JavaRandom {
  constructor(seed) { this.seed = (BigInt(seed) ^ 0x5deece66dn) & ((1n << 48n) - 1n); }
  next(bits) {
    this.seed = (this.seed * 0x5deece66dn + 0xbn) & ((1n << 48n) - 1n);
    const r = Number(this.seed >> BigInt(48 - bits));
    return bits === 32 ? r | 0 : r;
  }
  nextInt() { return this.next(32); }
}

// --------------------------------------------------------------------------
// Synth — ported 1:1 from LostCityRS/Client-TS (Envelope / Tone / JagFX).
// --------------------------------------------------------------------------
class Envelope {
  constructor() {
    this.length = 2;
    this.shapeDelta = new Int32Array([0, 65535]);
    this.shapePeak = new Int32Array([0, 65535]);
    this.start = this.end = this.form = 0;
    this.threshold = this.position = this.delta = this.amplitude = this.ticks = 0;
  }
  load(dat) {
    this.form = dat.g1();
    this.start = dat.g4();
    this.end = dat.g4();
    this.length = dat.g1();
    this.shapeDelta = new Int32Array(this.length);
    this.shapePeak = new Int32Array(this.length);
    for (let i = 0; i < this.length; i++) {
      this.shapeDelta[i] = dat.g2();
      this.shapePeak[i] = dat.g2();
    }
  }
  genInit() { this.threshold = this.position = this.delta = this.amplitude = this.ticks = 0; }
  genNext(delta) {
    if (this.ticks >= this.threshold) {
      this.amplitude = this.shapePeak[this.position++] << 15;
      if (this.position >= this.length) this.position = this.length - 1;
      this.threshold = ((this.shapeDelta[this.position] / 65536.0) * delta) | 0;
      if (this.threshold > this.ticks) {
        this.delta = (((this.shapePeak[this.position] << 15) - this.amplitude) / (this.threshold - this.ticks)) | 0;
      }
    }
    this.amplitude += this.delta;
    this.ticks++;
    return (this.amplitude - this.delta) >> 15;
  }
}

const NOISE = new Int32Array(32768);
const SINE = new Int32Array(32768);
{
  const rand = new JavaRandom(0);
  for (let i = 0; i < 32768; i++) NOISE[i] = (rand.nextInt() & 0x2) - 1;
  for (let i = 0; i < 32768; i++) SINE[i] = (Math.sin(i / 5215.1903) * 16384.0) | 0;
}

class Tone {
  constructor() {
    this.frequencyBase = new Envelope();
    this.amplitudeBase = new Envelope();
    this.frequencyModRate = this.frequencyModRange = null;
    this.amplitudeModRate = this.amplitudeModRange = null;
    this.release = this.attack = null;
    this.harmonicVolume = new Int32Array(5);
    this.harmonicSemitone = new Int32Array(5);
    this.harmonicDelay = new Int32Array(5);
    this.reverbDelay = 0;
    this.reverbVolume = 100;
    this.length = 500;
    this.start = 0;
  }

  static buf = new Int32Array(SAMPLE_RATE * 10);
  static fPos = new Int32Array(5);
  static fDel = new Int32Array(5);
  static fAmp = new Int32Array(5);
  static fMulti = new Int32Array(5);
  static fOffset = new Int32Array(5);

  waveFunc(amplitude, phase, form) {
    if (form === 1) return (phase & 0x7fff) < 16384 ? amplitude : -amplitude;
    if (form === 2) return (SINE[phase & 0x7fff] * amplitude) >> 14;
    if (form === 3) return (((phase & 0x7fff) * amplitude) >> 14) - amplitude;
    if (form === 4) return NOISE[((phase / 2607) | 0) & 0x7fff] * amplitude;
    return 0;
  }

  generate(sampleCount, length) {
    for (let s = 0; s < sampleCount; s++) Tone.buf[s] = 0;
    if (length < 10) return Tone.buf;

    const samplesPerStep = sampleCount / length;
    this.frequencyBase.genInit();
    this.amplitudeBase.genInit();

    let frequencyStart = 0, frequencyDuration = 0, frequencyPhase = 0;
    if (this.frequencyModRate && this.frequencyModRange) {
      this.frequencyModRate.genInit();
      this.frequencyModRange.genInit();
      frequencyStart = (((this.frequencyModRate.end - this.frequencyModRate.start) * 32.768) / samplesPerStep) | 0;
      frequencyDuration = ((this.frequencyModRate.start * 32.768) / samplesPerStep) | 0;
    }

    let amplitudeStart = 0, amplitudeDuration = 0, amplitudePhase = 0;
    if (this.amplitudeModRate && this.amplitudeModRange) {
      this.amplitudeModRate.genInit();
      this.amplitudeModRange.genInit();
      amplitudeStart = (((this.amplitudeModRate.end - this.amplitudeModRate.start) * 32.768) / samplesPerStep) | 0;
      amplitudeDuration = ((this.amplitudeModRate.start * 32.768) / samplesPerStep) | 0;
    }

    for (let h = 0; h < 5; h++) {
      if (this.harmonicVolume[h] !== 0) {
        Tone.fPos[h] = 0;
        Tone.fDel[h] = this.harmonicDelay[h] * samplesPerStep;
        Tone.fAmp[h] = ((this.harmonicVolume[h] << 14) / 100) | 0;
        Tone.fMulti[h] = (((this.frequencyBase.end - this.frequencyBase.start) * 32.768 * Math.pow(1.0057929410678534, this.harmonicSemitone[h])) / samplesPerStep) | 0;
        Tone.fOffset[h] = ((this.frequencyBase.start * 32.768) / samplesPerStep) | 0;
      }
    }

    for (let sample = 0; sample < sampleCount; sample++) {
      let frequency = this.frequencyBase.genNext(sampleCount);
      let amplitude = this.amplitudeBase.genNext(sampleCount);

      if (this.frequencyModRate && this.frequencyModRange) {
        const rate = this.frequencyModRate.genNext(sampleCount);
        const range = this.frequencyModRange.genNext(sampleCount);
        frequency += this.waveFunc(range, frequencyPhase, this.frequencyModRate.form) >> 1;
        frequencyPhase += ((rate * frequencyStart) >> 16) + frequencyDuration;
      }

      if (this.amplitudeModRate && this.amplitudeModRange) {
        const rate = this.amplitudeModRate.genNext(sampleCount);
        const range = this.amplitudeModRange.genNext(sampleCount);
        amplitude = (amplitude * ((this.waveFunc(range, amplitudePhase, this.amplitudeModRate.form) >> 1) + 32768)) >> 15;
        amplitudePhase += ((rate * amplitudeStart) >> 16) + amplitudeDuration;
      }

      for (let h = 0; h < 5; h++) {
        if (this.harmonicVolume[h] !== 0) {
          const position = sample + Tone.fDel[h];
          if (position < sampleCount) {
            Tone.buf[position] += this.waveFunc((amplitude * Tone.fAmp[h]) >> 15, Tone.fPos[h], this.frequencyBase.form);
            Tone.fPos[h] += ((frequency * Tone.fMulti[h]) >> 16) + Tone.fOffset[h];
          }
        }
      }
    }

    if (this.release && this.attack) {
      this.release.genInit();
      this.attack.genInit();
      let counter = 0, muted = true;
      for (let sample = 0; sample < sampleCount; sample++) {
        const releaseValue = this.release.genNext(sampleCount);
        const attackValue = this.attack.genNext(sampleCount);
        const threshold = muted
          ? this.release.start + (((this.release.end - this.release.start) * releaseValue) >> 8)
          : this.release.start + (((this.release.end - this.release.start) * attackValue) >> 8);
        counter += 256;
        if (counter >= threshold) { counter = 0; muted = !muted; }
        if (muted) Tone.buf[sample] = 0;
      }
    }

    if (this.reverbDelay > 0 && this.reverbVolume > 0) {
      const start = (this.reverbDelay * samplesPerStep) | 0;
      for (let sample = start; sample < sampleCount; sample++) {
        Tone.buf[sample] += ((Tone.buf[sample - start] * this.reverbVolume) / 100) | 0;
      }
    }

    for (let s = 0; s < sampleCount; s++) {
      if (Tone.buf[s] < -32768) Tone.buf[s] = -32768;
      else if (Tone.buf[s] > 32767) Tone.buf[s] = 32767;
    }
    return Tone.buf;
  }

  load(dat) {
    this.frequencyBase = new Envelope(); this.frequencyBase.load(dat);
    this.amplitudeBase = new Envelope(); this.amplitudeBase.load(dat);
    if (dat.g1() !== 0) {
      dat.pos--;
      this.frequencyModRate = new Envelope(); this.frequencyModRate.load(dat);
      this.frequencyModRange = new Envelope(); this.frequencyModRange.load(dat);
    }
    if (dat.g1() !== 0) {
      dat.pos--;
      this.amplitudeModRate = new Envelope(); this.amplitudeModRate.load(dat);
      this.amplitudeModRange = new Envelope(); this.amplitudeModRange.load(dat);
    }
    if (dat.g1() !== 0) {
      dat.pos--;
      this.release = new Envelope(); this.release.load(dat);
      this.attack = new Envelope(); this.attack.load(dat);
    }
    // The client always advances the stream for up to 10 harmonics; only the
    // first 5 are actually synthesised (writes past index 4 are ignored, as in
    // the reference). Must read all of them or the byte position desyncs.
    for (let h = 0; h < 10; h++) {
      const volume = dat.gsmarts();
      if (volume === 0) break;
      const semitone = dat.gsmart();
      const delay = dat.gsmarts();
      if (h < 5) {
        this.harmonicVolume[h] = volume;
        this.harmonicSemitone[h] = semitone;
        this.harmonicDelay[h] = delay;
      }
    }
    this.reverbDelay = dat.gsmarts();
    this.reverbVolume = dat.gsmarts();
    this.length = dat.g2();
    this.start = dat.g2();
  }
}

class JagFX {
  constructor() { this.tones = new Array(10).fill(null); this.loopBegin = 0; this.loopEnd = 0; }

  load(dat) {
    for (let t = 0; t < 10; t++) {
      if (dat.g1() !== 0) {
        dat.pos--;
        this.tones[t] = new Tone();
        this.tones[t].load(dat);
      }
    }
    this.loopBegin = dat.g2();
    this.loopEnd = dat.g2();
  }

  /** Render to a Uint8Array of 8-bit unsigned PCM samples (no header). */
  makeSound(loopCount = 1) {
    let duration = 0;
    for (const tone of this.tones) {
      if (tone && tone.length + tone.start > duration) duration = tone.length + tone.start;
    }
    if (duration === 0) return new Uint8Array(0);

    const sampleCount = ((duration * SAMPLE_RATE) / 1000) | 0;
    let loopStart = ((this.loopBegin * SAMPLE_RATE) / 1000) | 0;
    let loopStop = ((this.loopEnd * SAMPLE_RATE) / 1000) | 0;
    if (loopStart < 0 || loopStop < 0 || loopStop > sampleCount || loopStart >= loopStop) loopCount = 0;

    const totalSampleCount = sampleCount + (loopStop - loopStart) * (loopCount - 1);
    const out = new Uint8Array(totalSampleCount);
    out.fill(128); // -128 in two's complement = unsigned-8 silence

    for (const tone of this.tones) {
      if (!tone) continue;
      const toneSampleCount = ((tone.length * SAMPLE_RATE) / 1000) | 0;
      const start = ((tone.start * SAMPLE_RATE) / 1000) | 0;
      const samples = tone.generate(toneSampleCount, tone.length);
      for (let s = 0; s < toneSampleCount; s++) {
        const idx = s + start;
        if (idx < out.length) out[idx] = (out[idx] + ((((samples[s] >> 8) << 24) >> 24))) & 0xff;
      }
    }

    if (loopCount > 1) {
      for (let loop = 1; loop < loopCount; loop++) {
        const offset = (loopStop - loopStart) * loop;
        for (let s = loopStart; s < loopStop; s++) out[s + offset] = out[s];
      }
    }
    return out;
  }
}

/** Wrap raw 8-bit unsigned PCM samples in a 44-byte RIFF/WAVE header. */
function toWav(samples) {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(36 + samples.length, 4);
  header.write('WAVE', 8, 'ascii');
  header.write('fmt ', 12, 'ascii');
  header.writeUInt32LE(16, 16);      // fmt chunk size
  header.writeUInt16LE(1, 20);       // PCM
  header.writeUInt16LE(1, 22);       // mono
  header.writeUInt32LE(SAMPLE_RATE, 24);
  header.writeUInt32LE(SAMPLE_RATE, 28); // byte rate (1 byte/sample)
  header.writeUInt16LE(1, 32);       // block align
  header.writeUInt16LE(8, 34);       // bits per sample
  header.write('data', 36, 'ascii');
  header.writeUInt32LE(samples.length, 40);
  return Buffer.concat([header, Buffer.from(samples)]);
}

async function renderId(cache, id) {
  const file = await cache.getFile(IndexType.SOUNDEFFECTS, id, 0).catch(() => null);
  const content = file?.content;
  if (!content || content.length < 4) return null;
  const bytes = content instanceof Uint8Array ? content : new Uint8Array(content);
  const fx = new JagFX();
  try {
    fx.load(new Reader(bytes));
  } catch {
    return null; // some ids aren't synth programs
  }
  const samples = fx.makeSound(1);
  if (samples.length === 0) return null;
  return { wav: toWav(samples), ms: Math.round((samples.length / SAMPLE_RATE) * 1000) };
}

async function main() {
  if (!existsSync(join(CACHE_DIR, 'main_file_cache.dat2'))) {
    console.error(`No cache at ${CACHE_DIR}\nSet OSRS_CACHE_DIR.`);
    process.exit(1);
  }
  console.log(`Loading cache: ${CACHE_DIR}`);
  const cache = new RSCache(CACHE_DIR);
  await cache.onload;

  const dumpIdx = process.argv.indexOf('--dump');
  const onlyIdx = process.argv.indexOf('--only');

  if (dumpIdx !== -1 || onlyIdx !== -1) {
    const from = dumpIdx !== -1 ? Number(process.argv[dumpIdx + 1] ?? 0) : Number(process.argv[onlyIdx + 1]);
    const to = dumpIdx !== -1 ? Number(process.argv[dumpIdx + 2] ?? from) : from;
    const dir = join(REPO, 'tmp', 'osrs-sounds');
    mkdirSync(dir, { recursive: true });
    let count = 0;
    for (let id = from; id <= to; id++) {
      const r = await renderId(cache, id);
      if (!r) continue;
      writeFileSync(join(dir, `${id}.wav`), r.wav);
      count++;
      console.log(`✓ ${id} → ${id}.wav (${r.ms}ms)`);
    }
    console.log(`Dumped ${count} sound(s) ${from}..${to} → ${dir}`);
    process.exit(0);
  }

  let ok = 0;
  for (const [slug, id] of Object.entries(TARGETS)) {
    const r = await renderId(cache, id);
    if (!r) { console.warn(`! sound ${id} (${slug}) empty/undecodable — skipped`); continue; }
    const outPath = join(REPO, 'public', 'assets', 'sounds', `${slug}.wav`);
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, r.wav);
    ok++;
    console.log(`✓ ${slug}: sound ${id} → public/assets/sounds/${slug}.wav (${r.ms}ms)`);
  }
  if (ok === 0 && Object.keys(TARGETS).length === 0) {
    console.log('No TARGETS configured. Use --dump <from> <to> to audition ids, then add them to TARGETS.');
  }
  process.exit(0);
}

main();
