import { describe, it, expect } from 'vitest';
import { MidiSynth, SoundStream, renderTrackLoop, renderChunk, normalize, SYNTH_RATE, type Instrument } from './synth.ts';
import type { MusicPatch, PatchEnvelope } from './patch.ts';
import type { RawSound } from './vorbis.ts';

function midiFile(division: number, ...tracks: number[][]) {
  const out = [0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 1, 0, tracks.length, division >> 8, division & 0xff];
  for (const t of tracks) {
    out.push(0x4d, 0x54, 0x72, 0x6b, (t.length >> 24) & 0xff, (t.length >> 16) & 0xff, (t.length >> 8) & 0xff, t.length & 0xff, ...t);
  }
  return new Uint8Array(out);
}

/** MIDI variable-length quantity. */
function vlq(n: number) {
  const bytes = [n & 0x7f];
  while ((n >>= 7) > 0) bytes.unshift((n & 0x7f) | 0x80);
  return bytes;
}

/** A looping sine at exactly `period` samples per cycle, 8-bit like the cache's. */
function sine(period: number, cycles = 40): RawSound {
  const samples = new Int8Array(period * cycles);
  for (let i = 0; i < samples.length; i++) samples[i] = Math.round(100 * Math.sin((2 * Math.PI * i) / period));
  return { sampleRate: SYNTH_RATE, samples, start: 0, end: samples.length, pingPong: false };
}

/** One instrument: every key plays `sound`, recorded at `rootKey`, looped. */
function instrument(sound: RawSound, rootKey: number, env: Partial<PatchEnvelope> = {}): Instrument {
  const envelope: PatchEnvelope = {
    volume: null, release: new Int8Array([0, 64, 10, 0]), decayRate: 0, decayKeyScale: 0,
    volumeKeyScale: 0, releaseKeyScale: 0, vibratoRate: 0, vibratoDepth: 0, vibratoDelay: 0, ...env,
  };
  const patch: MusicPatch = {
    pitchOffsets: new Int16Array(128).fill((rootKey << 8) | 0x8000),
    sampleIds: new Int32Array(128).fill(2),
    volumes: new Int8Array(128).fill(64),
    pans: new Int8Array(128).fill(64),
    exclusiveClasses: new Int8Array(128).fill(-1),
    envelopes: new Array(128).fill(envelope),
    globalVolume: 128,
  };
  return { patch, sounds: new Array(128).fill(sound) };
}

/** One track: program 0, `key` held from tick 0 to `offAt`, ending at `endAt` (division 480, 120 bpm). */
function singleNote(key: number, offAt: number, endAt: number) {
  return midiFile(480, [0x00, 0xc0, 0x00, 0x00, 0x90, key, 100, ...vlq(offAt), 0x80, key, 0, ...vlq(endAt - offAt), 0xff, 0x2f, 0x00]);
}

function render(synth: MidiSynth, frames: number) {
  const buf = new Int32Array(frames * 2);
  synth.render(buf, 0, frames);
  return buf;
}

/** Strongest period (in samples) of the left channel over a window, by autocorrelation. */
function period(buf: Int32Array, from: number, len: number) {
  let best = 0;
  let lag = 0;
  for (let l = 10; l < 200; l++) {
    let s = 0;
    for (let i = from; i < from + len; i++) s += buf[i * 2] * buf[(i + l) * 2];
    if (s > best) { best = s; lag = l; }
  }
  return lag;
}

function energy(buf: Int32Array, from: number, to: number) {
  let e = 0;
  for (let i = from; i < to; i++) e += Math.abs(buf[i * 2]) + Math.abs(buf[i * 2 + 1]);
  return e;
}

describe('MidiSynth', () => {
  it('plays a key at its sample\'s own rate on the root key, an octave up at +12', () => {
    const inst = instrument(sine(50), 69);
    const root = render(new MidiSynth(singleNote(69, 960, 1920), () => inst, { loop: false }), 8192);
    expect(period(root, 2048, 2048)).toBe(50);
    const octave = render(new MidiSynth(singleNote(81, 960, 1920), () => inst, { loop: false }), 8192);
    expect(period(octave, 2048, 2048)).toBe(25);
  });

  it('sounds while the key is held and falls silent once the release envelope runs out', () => {
    const inst = instrument(sine(50), 69);
    // held for 0.5 s (480 ticks), release envelope ~200 ms, track ends at 2 s
    const buf = render(new MidiSynth(singleNote(69, 480, 1920), () => inst, { loop: false }), SYNTH_RATE * 2);
    expect(energy(buf, 2205, 11025)).toBeGreaterThan(0);
    expect(energy(buf, Math.round(SYNTH_RATE * 1.0), SYNTH_RATE * 2)).toBe(0);
  });

  it('is silent for a program with no instrument, without throwing', () => {
    const buf = render(new MidiSynth(singleNote(60, 480, 960), () => null, { loop: false }), SYNTH_RATE);
    expect(energy(buf, 0, SYNTH_RATE)).toBe(0);
  });

  it('honours channel volume (CC 7): zero volume is silence', () => {
    const inst = instrument(sine(50), 69);
    const midi = midiFile(480, [0x00, 0xb0, 7, 0, 0x00, 0x90, 69, 100, ...vlq(480), 0x80, 69, 0, 0x00, 0xff, 0x2f, 0x00]);
    const buf = render(new MidiSynth(midi, () => inst, { loop: false }), SYNTH_RATE);
    expect(energy(buf, 0, SYNTH_RATE)).toBe(0);
  });

  it('pans a note by the channel pan (CC 10)', () => {
    const inst = instrument(sine(50), 69);
    const midi = midiFile(480, [0x00, 0xb0, 10, 0, 0x00, 0x90, 69, 100, ...vlq(480), 0x80, 69, 0, 0x00, 0xff, 0x2f, 0x00]);
    const buf = render(new MidiSynth(midi, () => inst, { loop: false }), 8192);
    let left = 0;
    let right = 0;
    for (let i = 2048; i < 8192; i++) { left += Math.abs(buf[i * 2]); right += Math.abs(buf[i * 2 + 1]); }
    expect(left).toBeGreaterThan(0);
    expect(right).toBe(0);
  });

  it('marks the frame the track comes round at, once per pass', () => {
    const inst = instrument(sine(50), 69);
    const synth = new MidiSynth(singleNote(69, 240, 960), () => inst, { loop: true });
    render(synth, SYNTH_RATE * 3);
    // 960 ticks at 480/quarter and 120 bpm = 1 s per pass
    expect(synth.loopFrames.length).toBeGreaterThanOrEqual(2);
    expect(Math.abs(synth.loopFrames[0] - SYNTH_RATE)).toBeLessThanOrEqual(2);
    expect(Math.abs(synth.loopFrames[1] - synth.loopFrames[0] - SYNTH_RATE)).toBeLessThanOrEqual(2);
  });

  it('stops for good at the end when not looping', () => {
    const inst = instrument(sine(50), 69);
    const synth = new MidiSynth(singleNote(69, 240, 480), () => inst, { loop: false });
    render(synth, SYNTH_RATE);
    expect(synth.done).toBe(true);
  });
});

describe('renderTrackLoop', () => {
  it('returns exactly one pass of the track, levelled to the asked loudness', () => {
    const inst = instrument(sine(50), 69);
    const r = renderTrackLoop(singleNote(69, 480, 960), () => inst, { targetRms: 0.1 });
    expect(r.looped).toBe(true);
    expect(Math.abs(r.left.length - SYNTH_RATE)).toBeLessThanOrEqual(2);
    let sum = 0;
    for (let i = 0; i < r.left.length; i++) sum += r.left[i] ** 2 + r.right[i] ** 2;
    expect(Math.sqrt(sum / (r.left.length * 2))).toBeCloseTo(0.1, 3);
    expect(r.gain).toBeGreaterThan(0);
  });

  it('gives up cleanly on an empty track', () => {
    const r = renderTrackLoop(midiFile(480, [0x00, 0xff, 0x2f, 0x00]), () => null);
    expect(r.looped).toBe(false);
    expect(r.left.length).toBe(0);
  });
});

describe('renderChunk', () => {
  it('streams a looping track past its end without running dry', () => {
    const inst = instrument(sine(50), 69);
    const synth = new MidiSynth(singleNote(69, 240, 480), () => inst, { loop: true });
    let loud = 0;
    for (let i = 0; i < 6; i++) {
      const { left } = renderChunk(synth, SYNTH_RATE / 2);
      if (left.some((v) => v !== 0)) loud++;
    }
    expect(loud).toBe(6);
  });
});

describe('normalize', () => {
  it('never pushes the peak past 0.98', () => {
    const l = new Float32Array([0.5, -0.5, 0, 0]);
    const r = new Float32Array([0, 0, 0, 0]);
    normalize(l, r, 10);
    expect(Math.max(...l.map(Math.abs))).toBeCloseTo(0.98, 5);
  });
});

describe('SoundStream', () => {
  it('bounces a ping-pong loop between its points instead of running off the end', () => {
    const s = sine(50, 4);
    const pp: RawSound = { ...s, start: 50, end: 150, pingPong: true };
    const stream = new SoundStream(pp, 256 * 3, 64 * 64, 8192);
    stream.setLoops(-1);
    const buf = new Int32Array(22050 * 2);
    stream.read(buf, 0, 22050);
    expect(stream.active).toBe(true);
    expect(stream.finished).toBe(false);
  });

  it('plays a one-shot sample once and stops', () => {
    const s = sine(50, 4);
    const stream = new SoundStream(s, 256, 64 * 64, 8192);
    const buf = new Int32Array(1000 * 2);
    stream.read(buf, 0, 1000);
    expect(stream.active).toBe(false);
    expect(energy(buf, 0, 190)).toBeGreaterThan(0);
    expect(energy(buf, 200, 1000)).toBe(0);
  });

  it('fades to silence and stops', () => {
    const stream = new SoundStream(sine(50), 256, 64 * 64, 8192);
    stream.setLoops(-1);
    stream.fadeOut(100);
    const buf = new Int32Array(400 * 2);
    stream.read(buf, 0, 400);
    expect(stream.active).toBe(false);
    expect(energy(buf, 150, 400)).toBe(0);
  });
});
