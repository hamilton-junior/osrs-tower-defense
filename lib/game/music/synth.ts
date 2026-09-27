/**
 * The OSRS client's MIDI synthesizer, ported so a track can be rendered from the
 * cache's own instruments instead of shipped as a recording.
 *
 * Three client classes live here, each keeping its arithmetic:
 *
 * - `SoundStream` — the client's `RawPcmStream`: one sample played at a rate, with
 *   linear interpolation, forward or ping-pong loops, and a volume/pan ramp.
 * - `Note` + the note loop in `MidiSynth.mixNotes` — `MusicPatchNode` and
 *   `MusicPatchPcmStream`: every 10 ms each sounding note re-evaluates its pitch
 *   (portamento, bend, vibrato) and volume (decay, attack and release envelopes)
 *   and ramps its stream there.
 * - `MidiSynth` — `MidiPcmStream`: the MIDI clock, channel state and controllers.
 *
 * The output is what the client's sound device receives: 16-bit stereo at the
 * client's own rate (22050 Hz), which is why OSRS music sounds the way it does.
 */

import { MidiReader, MIDI_END_OF_TRACK } from './midi.ts';
import type { MusicPatch, PatchEnvelope } from './patch.ts';
import type { RawSound } from './vorbis.ts';

/** The client's output rate. Everything the synth times is in samples of this. */
export const SYNTH_RATE = 22050;

/** A patch with its samples resolved: `sounds[key]` is null for a silent key. */
export interface Instrument {
  patch: MusicPatch;
  sounds: (RawSound | null)[];
}

/** Looks an instrument up by program number (bank × 128 + program). */
export type InstrumentSource = (program: number) => Instrument | null;

/** Left/right gains for a volume and a pan (0 left … 8192 centre … 16384 right). */
function leftGain(vol: number, pan: number) {
  return pan < 0 ? vol : Math.trunc(vol * Math.sqrt((16384 - pan) * 1.220703125e-4) + 0.5);
}
function rightGain(vol: number, pan: number) {
  return pan < 0 ? -vol : Math.trunc(vol * Math.sqrt(pan * 1.220703125e-4) + 0.5);
}

/**
 * One sample playing (`RawPcmStream`). Position and rate are 24.8 fixed point, in
 * the sample's own frames; a negative rate plays it backward.
 */
export class SoundStream {
  readonly sound: RawSound;
  active = true;
  private pos = 0;
  private rate: number;
  private loops = 0;
  /** Target volume and pan; `volume === null` means "fade out, then stop". */
  private volume: number | null;
  private pan: number;
  /** Current gains: the mono level (only used to size ramps) and left/right. */
  private mono: number;
  private left: number;
  private right: number;
  private rampLeft = 0;
  private dm = 0;
  private dl = 0;
  private dr = 0;

  constructor(sound: RawSound, rate: number, volume: number, pan: number) {
    this.sound = sound;
    this.rate = rate;
    this.volume = volume;
    this.pan = pan;
    this.mono = volume;
    this.left = leftGain(volume, pan);
    this.right = rightGain(volume, pan);
  }

  static create(sound: RawSound, rate: number, volume: number, pan: number) {
    return sound.samples.length === 0 ? null : new SoundStream(sound, rate, volume, pan);
  }

  setLoops(n: number) {
    this.loops = n;
  }

  get absRate() {
    return this.rate < 0 ? -this.rate : this.rate;
  }

  setRate(r: number) {
    this.rate = this.rate < 0 ? -r : r;
  }

  reverse() {
    this.rate = -(this.rate < 0 ? -this.rate : this.rate);
  }

  setPosition(p: number) {
    const max = this.sound.samples.length << 8;
    this.pos = p < -1 ? -1 : p > max ? max : p;
  }

  /** The target volume (0 while fading out). */
  get targetVolume() {
    return this.volume ?? 0;
  }

  get targetPan() {
    return this.pan;
  }

  /** Played past either end of the sample. */
  get finished() {
    return this.pos < 0 || this.pos >= this.sound.samples.length << 8;
  }

  /** A volume ramp (or fade-out) is still running. */
  get ramping() {
    return this.rampLeft !== 0;
  }

  /** Ramp to `vol`/`pan` over `n` samples (`RawPcmStream.method931`). */
  rampTo(n: number, vol: number, pan: number) {
    if (n === 0) {
      this.set(vol, pan);
      return;
    }
    const l = leftGain(vol, pan);
    const r = rightGain(vol, pan);
    if (this.left === l && this.right === r) {
      this.rampLeft = 0;
      return;
    }
    const most = Math.max(Math.abs(vol - this.mono), Math.abs(l - this.left), Math.abs(r - this.right));
    if (n > most) n = most;
    this.rampLeft = n;
    this.volume = vol;
    this.pan = pan;
    this.dm = Math.trunc((vol - this.mono) / n);
    this.dl = Math.trunc((l - this.left) / n);
    this.dr = Math.trunc((r - this.right) / n);
  }

  /** Fade to silence over `n` samples, then stop (`method1022`). */
  fadeOut(n: number) {
    if (n === 0 || (this.left === 0 && this.right === 0)) {
      this.volume = 0;
      this.rampLeft = 0;
      this.active = false;
      return;
    }
    const most = Math.max(Math.abs(this.mono), Math.abs(this.left), Math.abs(this.right));
    if (n > most) n = most;
    this.rampLeft = n;
    this.volume = null;
    this.dm = Math.trunc(-this.mono / n);
    this.dl = Math.trunc(-this.left / n);
    this.dr = Math.trunc(-this.right / n);
  }

  private set(vol: number, pan: number) {
    this.volume = vol;
    this.pan = pan;
    this.rampLeft = 0;
    this.mono = vol;
    this.left = leftGain(vol, pan);
    this.right = rightGain(vol, pan);
  }

  /** The sample after frame `i`, as the client's kernels pick it at a boundary. */
  private next(i: number) {
    const s = this.sound;
    if (this.loops !== 0 && this.rate > 0 && i + 1 >= s.end) {
      return s.pingPong ? s.samples[s.end - 1] : s.samples[s.start];
    }
    return i + 1 < s.samples.length ? s.samples[i + 1] : 0;
  }

  /** Mix `len` frames into the interleaved stereo `buf` from frame `off`. */
  read(buf: Int32Array, off: number, len: number) {
    if (!this.active) return;
    const s = this.sound;
    const data = s.samples;
    const lenF = data.length << 8;
    const startF = s.start << 8;
    const endF = s.end << 8;
    const loopLen = endF - startF;
    if (loopLen <= 0) this.loops = 0;
    if (this.pos < 0) {
      if (this.rate <= 0) { this.active = false; return; }
      this.pos = 0;
    }
    if (this.pos >= lenF) {
      if (this.rate >= 0) { this.active = false; return; }
      this.pos = lenF - 1;
    }
    let o = off * 2;
    for (let n = 0; n < len; n++, o += 2) {
      const i = this.pos >> 8;
      const s0 = data[i];
      const v = (s0 << 8) + (this.next(i) - s0) * (this.pos & 0xff);
      buf[o] += Math.imul(v, this.left) >> 6;
      buf[o + 1] += Math.imul(v, this.right) >> 6;

      if (this.rampLeft > 0) {
        this.mono += this.dm;
        this.left += this.dl;
        this.right += this.dr;
        if (--this.rampLeft === 0) {
          if (this.volume === null) {
            this.mono = this.left = this.right = 0;
            this.volume = 0;
            this.active = false;
            return;
          }
          this.mono = this.volume;
          this.left = leftGain(this.volume, this.pan);
          this.right = rightGain(this.volume, this.pan);
        }
      }

      this.pos += this.rate;
      if (this.loops !== 0) {
        if (s.pingPong) {
          if (this.rate > 0 && this.pos >= endF) {
            this.pos = endF + endF - this.pos - 1;
            this.rate = -this.rate;
          } else if (this.rate < 0 && this.pos < startF) {
            this.pos = startF + startF - this.pos - 1;
            this.rate = -this.rate;
          }
        } else if (this.rate > 0 && this.pos >= endF) {
          this.pos = startF + ((this.pos - startF) % loopLen);
        } else if (this.rate < 0 && this.pos < startF) {
          this.pos = endF - ((endF - 1 - this.pos) % loopLen) - 1;
        }
      }
      if (this.pos < 0 || this.pos >= lenF) {
        this.active = false;
        return;
      }
    }
  }
}

/** One sounding note (`MusicPatchNode`). */
class Note {
  alive = true;
  stream: SoundStream | null = null;
  /** Samples left until this note's next 10 ms update. */
  ticksLeft = 0;
  /** -1 while held; counts up through the release envelope once let go. */
  release = -1;
  attackPos = 0;
  attackIdx = 0;
  releaseIdx = 0;
  decayPos = 0;
  portaAmt = 0;
  portaRange = 0;
  vibPhase = 0;
  age = 0;
  retrig = 0;
  readonly channel: number;
  key: number;
  readonly instrument: Instrument;
  readonly sound: RawSound;
  readonly env: PatchEnvelope;
  readonly exclusive: number;
  readonly volume: number;
  readonly pan: number;
  base: number;

  constructor(channel: number, key: number, instrument: Instrument, sound: RawSound, env: PatchEnvelope, exclusive: number, volume: number, pan: number, base: number) {
    this.channel = channel;
    this.key = key;
    this.instrument = instrument;
    this.sound = sound;
    this.env = env;
    this.exclusive = exclusive;
    this.volume = volume;
    this.pan = pan;
    this.base = base;
  }
}

export interface MidiSynthOptions {
  /** The track restarts when every MIDI track has ended (the client's music loops). */
  loop?: boolean;
  /** Master music volume, 0–256 (the client's `setPcmStreamVolume`). */
  masterVolume?: number;
}

/** The MIDI player (`MidiPcmStream`). */
export class MidiSynth {
  private readonly reader = new MidiReader();
  private readonly notes: Note[] = [];
  private readonly mixer: SoundStream[] = [];
  private readonly held: (Note | null)[][] = [];
  private readonly exclusive: (Note | null)[][] = [];

  private readonly volume = new Int32Array(16);
  private readonly pan = new Int32Array(16);
  private readonly expression = new Int32Array(16);
  private readonly bend = new Int32Array(16);
  private readonly modulation = new Int32Array(16);
  private readonly portaTime = new Int32Array(16);
  readonly flags = new Int32Array(16);
  private readonly rpn = new Int32Array(16);
  private readonly bendRange = new Int32Array(16);
  private readonly sampleOffset = new Int32Array(16);
  private readonly retrigValue = new Int32Array(16);
  private readonly retrigRate = new Int32Array(16);
  private readonly program = new Int32Array(16);
  private readonly bank = new Int32Array(16);
  private readonly defaultProgram = new Int32Array(16);

  private readonly instruments: InstrumentSource;
  private readonly master: number;
  private readonly loop: boolean;
  private track = 0;
  private trackTime = 0;
  private eventMicros = 0;
  private clock = 0;
  /** Output frames produced so far, and the frame each loop restart happened at. */
  frames = 0;
  readonly loopFrames: number[] = [];

  constructor(midi: Uint8Array, instruments: InstrumentSource, opts: MidiSynthOptions = {}) {
    this.instruments = instruments;
    this.master = opts.masterVolume ?? 256;
    this.loop = opts.loop ?? true;
    for (let c = 0; c < 16; c++) {
      this.held.push(new Array(128).fill(null));
      this.exclusive.push(new Array(128).fill(null));
    }
    // The client puts the drum kit (patch 128) on channel 10 before any track plays.
    this.defaultProgram[9] = 128;
    this.hardReset();
    const r = this.reader;
    r.load(midi);
    for (let t = 0; t < r.trackCount; t++) {
      r.seekTrack(t);
      r.addDelta(t);
      r.saveTrack(t);
    }
    this.track = r.nextTrack();
    this.trackTime = r.times[this.track];
    this.eventMicros = r.timeMicros(this.trackTime);
  }

  /** The MIDI has played out (only when not looping). */
  get done() {
    return !this.reader.loaded;
  }

  /** Render `len` frames into interleaved stereo `buf` (which the caller zeroes). */
  render(buf: Int32Array, off: number, len: number) {
    const r = this.reader;
    if (r.loaded) {
      const step = Math.floor((r.division * 1000000) / SYNTH_RATE);
      do {
        const next = this.clock + len * step;
        if (this.eventMicros - next >= 0) {
          this.clock = next;
          break;
        }
        const n = Math.floor((this.eventMicros - this.clock + step - 1) / step);
        this.clock += step * n;
        this.mixNotes(buf, off, n);
        off += n;
        len -= n;
        this.frames += n;
        this.processEvents();
      } while (r.loaded);
    }
    this.mixNotes(buf, off, len);
    this.frames += len;
  }

  private processEvents() {
    const r = this.reader;
    let track = this.track;
    let time = this.trackTime;
    let micros = this.eventMicros;
    while (this.trackTime === time) {
      while (time === r.times[track]) {
        r.seekTrack(track);
        const ev = r.readEvent(track);
        if (ev === MIDI_END_OF_TRACK) {
          r.endTrack();
          r.saveTrack(track);
          if (r.allTracksDone()) {
            if (!this.loop || time === 0) {
              this.hardReset();
              r.release();
              return;
            }
            r.rewind(micros);
            this.loopFrames.push(this.frames);
          }
          break;
        }
        if (ev & 0x80) this.handle(ev);
        r.addDelta(track);
        r.saveTrack(track);
      }
      track = r.nextTrack();
      time = r.times[track];
      micros = r.timeMicros(time);
    }
    this.track = track;
    this.eventMicros = micros;
    this.trackTime = time;
  }

  private handle(ev: number) {
    const type = ev & 0xf0;
    const ch = ev & 0xf;
    const d1 = (ev >> 8) & 0x7f;
    const d2 = (ev >> 16) & 0x7f;
    switch (type) {
      case 0x80:
        this.noteOff(ch, d1);
        return;
      case 0x90:
        if (d2 > 0) this.noteOn(ch, d1, d2);
        else this.noteOff(ch, d1);
        return;
      case 0xb0:
        this.control(ch, d1, d2);
        return;
      case 0xc0:
        this.setProgram(ch, this.bank[ch] + d1);
        return;
      case 0xe0:
        this.bend[ch] = d1 + ((ev >> 9) & 0x3f80);
        return;
      case 0xa0:
      case 0xd0:
        return;
      default:
        if ((ev & 0xff) === 0xff) this.hardReset();
    }
  }

  private control(ch: number, cc: number, v: number) {
    const hi = (x: number) => (v << 7) + (x & ~0x3f80);
    const lo = (x: number) => v + (x & ~0x7f);
    switch (cc) {
      case 0: this.bank[ch] = (v << 14) + (this.bank[ch] & ~0x1fc000); break;
      case 32: this.bank[ch] = (v << 7) + (this.bank[ch] & ~0x3f80); break;
      case 1: this.modulation[ch] = hi(this.modulation[ch]); break;
      case 33: this.modulation[ch] = lo(this.modulation[ch]); break;
      case 5: this.portaTime[ch] = hi(this.portaTime[ch]); break;
      case 37: this.portaTime[ch] = lo(this.portaTime[ch]); break;
      case 7: this.volume[ch] = hi(this.volume[ch]); break;
      case 39: this.volume[ch] = lo(this.volume[ch]); break;
      case 10: this.pan[ch] = hi(this.pan[ch]); break;
      case 42: this.pan[ch] = lo(this.pan[ch]); break;
      case 11: this.expression[ch] = hi(this.expression[ch]); break;
      case 43: this.expression[ch] = lo(this.expression[ch]); break;
      case 64:
        if (v >= 64) this.flags[ch] |= 1;
        else this.flags[ch] &= ~1;
        break;
      case 65:
        if (v >= 64) {
          this.flags[ch] |= 2;
        } else {
          this.endPortamento(ch);
          this.flags[ch] &= ~2;
        }
        break;
      case 99: this.rpn[ch] = (v << 7) + (this.rpn[ch] & 0x7f); break;
      case 98: this.rpn[ch] = (this.rpn[ch] & 0x3f80) + v; break;
      case 101: this.rpn[ch] = (v << 7) + (this.rpn[ch] & 0x7f) + 16384; break;
      case 100: this.rpn[ch] = (this.rpn[ch] & 0x3f80) + v + 16384; break;
      case 120: this.soundOff(ch); break;
      case 121: this.resetControllers(ch); break;
      case 123: this.allNotesOff(ch); break;
      case 6: if (this.rpn[ch] === 16384) this.bendRange[ch] = hi(this.bendRange[ch]); break;
      case 38: if (this.rpn[ch] === 16384) this.bendRange[ch] = lo(this.bendRange[ch]); break;
      case 16: this.sampleOffset[ch] = hi(this.sampleOffset[ch]); break;
      case 48: this.sampleOffset[ch] = lo(this.sampleOffset[ch]); break;
      case 81:
        if (v >= 64) {
          this.flags[ch] |= 4;
        } else {
          this.endRetrigger(ch);
          this.flags[ch] &= ~4;
        }
        break;
      case 17: this.setRetrigger(ch, (v << 7) + (this.retrigValue[ch] & ~0x3f80)); break;
      case 49: this.setRetrigger(ch, v + (this.retrigValue[ch] & ~0x7f)); break;
    }
  }

  private setProgram(ch: number, program: number) {
    if (this.program[ch] === program) return;
    this.program[ch] = program;
    this.exclusive[ch].fill(null);
  }

  private setRetrigger(ch: number, v: number) {
    this.retrigValue[ch] = v;
    this.retrigRate[ch] = Math.trunc(Math.pow(2, v * 5.4931640625e-4) * 2097152 + 0.5);
  }

  private resetControllers(ch: number) {
    this.volume[ch] = 12800;
    this.pan[ch] = 8192;
    this.expression[ch] = 16383;
    this.bend[ch] = 8192;
    this.modulation[ch] = 0;
    this.portaTime[ch] = 8192;
    this.endPortamento(ch);
    this.endRetrigger(ch);
    this.flags[ch] = 0;
    this.rpn[ch] = 32767;
    this.bendRange[ch] = 256;
    this.sampleOffset[ch] = 0;
    this.setRetrigger(ch, 8192);
  }

  /** Cut every note (fading each over one tick) and reset all channels. */
  private hardReset() {
    this.soundOff(-1);
    for (let c = 0; c < 16; c++) this.resetControllers(c);
    for (let c = 0; c < 16; c++) {
      this.program[c] = this.defaultProgram[c];
      this.bank[c] = this.defaultProgram[c] & ~0x7f;
    }
  }

  private soundOff(ch: number) {
    for (const n of this.notes) {
      if (!n.alive || (ch >= 0 && n.channel !== ch)) continue;
      if (n.stream) {
        n.stream.fadeOut(Math.floor(SYNTH_RATE / 100));
        if (n.stream.ramping) this.mixer.push(n.stream);
        n.stream = null;
      }
      if (n.release < 0) this.held[n.channel][n.key] = null;
      n.alive = false;
    }
    this.compact();
  }

  private allNotesOff(ch: number) {
    for (const n of this.notes) {
      if (!n.alive || (ch >= 0 && n.channel !== ch) || n.release >= 0) continue;
      this.held[n.channel][n.key] = null;
      n.release = 0;
    }
  }

  private endPortamento(ch: number) {
    if ((this.flags[ch] & 2) === 0) return;
    for (const n of this.notes) {
      if (n.alive && n.channel === ch && this.held[ch][n.key] === null && n.release < 0) n.release = 0;
    }
  }

  private endRetrigger(ch: number) {
    if ((this.flags[ch] & 4) === 0) return;
    for (const n of this.notes) if (n.alive && n.channel === ch) n.retrig = 0;
  }

  private noteOff(ch: number, key: number) {
    const n = this.held[ch][key];
    if (!n) return;
    this.held[ch][key] = null;
    if ((this.flags[ch] & 2) === 0) {
      n.release = 0;
      return;
    }
    for (const m of this.notes) {
      if (m.alive && m.channel === n.channel && m.release < 0 && m !== n) {
        n.release = 0;
        break;
      }
    }
  }

  private noteOn(ch: number, key: number, velocity: number) {
    this.noteOff(ch, key);
    if ((this.flags[ch] & 2) !== 0) {
      // Portamento: the held note on this channel glides to the new key.
      for (let i = this.notes.length - 1; i >= 0; i--) {
        const n = this.notes[i];
        if (!n.alive || n.channel !== ch || n.release >= 0) continue;
        this.held[ch][n.key] = null;
        this.held[ch][key] = n;
        const from = n.base + ((n.portaAmt * n.portaRange) >> 12);
        n.portaAmt = 4096;
        n.base += (key - n.key) << 8;
        n.portaRange = from - n.base;
        n.key = key;
        return;
      }
    }
    const inst = this.instruments(this.program[ch]);
    if (!inst) return;
    const sound = inst.sounds[key];
    const env = inst.patch.envelopes[key];
    if (!sound || !env) return;
    const p = inst.patch;
    const note = new Note(
      ch,
      key,
      inst,
      sound,
      env,
      p.exclusiveClasses[key],
      (velocity * velocity * p.volumes[key] * p.globalVolume + 1024) >> 11,
      p.pans[key] & 0xff,
      (key << 8) - (p.pitchOffsets[key] & 0x7fff),
    );
    const looped = p.pitchOffsets[key] < 0;
    if (this.sampleOffset[ch] === 0) {
      note.stream = SoundStream.create(sound, this.pitch(note), this.noteVolume(note), this.notePan(note));
    } else {
      note.stream = SoundStream.create(sound, this.pitch(note), 0, this.notePan(note));
      if (note.stream) this.applySampleOffset(note, looped);
    }
    if (looped) note.stream?.setLoops(-1);
    if (note.exclusive >= 0) {
      const prev = this.exclusive[ch][note.exclusive];
      if (prev && prev.release < 0) {
        this.held[ch][prev.key] = null;
        prev.release = 0;
      }
      this.exclusive[ch][note.exclusive] = note;
    }
    this.notes.push(note);
    this.held[ch][key] = note;
  }

  /** Start a note part-way into its sample (CC 16/48). */
  private applySampleOffset(note: Note, looped: boolean) {
    const s = note.sound;
    let len = s.samples.length;
    let pos: number;
    if (looped && s.pingPong) {
      const span = len + len - s.start;
      pos = Math.floor((span * this.sampleOffset[note.channel]) / 64);
      len <<= 8;
      if (pos >= len) {
        note.stream!.reverse();
        pos = len + len - 1 - pos;
      }
    } else {
      pos = Math.floor((len * this.sampleOffset[note.channel]) / 64);
    }
    note.stream!.setPosition(pos);
  }

  /** Playback rate (24.8) for a note right now: key, glide, bend and vibrato. */
  private pitch(n: Note) {
    const env = n.env;
    let p = ((n.portaRange * n.portaAmt) >> 12) + n.base;
    p += (this.bendRange[n.channel] * (this.bend[n.channel] - 8192)) >> 12;
    if (env.vibratoRate > 0 && (env.vibratoDepth > 0 || this.modulation[n.channel] > 0)) {
      let depth = env.vibratoDepth << 2;
      const delay = env.vibratoDelay << 1;
      if (n.age < delay) depth = Math.trunc((depth * n.age) / delay);
      depth += this.modulation[n.channel] >> 7;
      p += Math.trunc(depth * Math.sin((n.vibPhase & 0x1ff) * 0.01227184630308513));
    }
    const rate = Math.trunc((n.sound.sampleRate * 256 * Math.pow(2, p * 3.255208333333333e-4)) / SYNTH_RATE + 0.5);
    return rate < 1 ? 1 : rate;
  }

  /** A note's volume right now: channel volume × expression, velocity, envelopes. */
  private noteVolume(n: Note) {
    const env = n.env;
    let v = (this.volume[n.channel] * this.expression[n.channel] + 4096) >> 13;
    v = (v * v + 16384) >> 15;
    v = (n.volume * v + 16384) >> 15;
    v = (v * this.master + 128) >> 8;
    if (env.decayRate > 0) {
      v = Math.trunc(Math.pow(0.5, n.decayPos * 1.953125e-5 * env.decayRate) * v + 0.5);
    }
    const att = env.volume;
    if (att) {
      let level = att[n.attackIdx + 1];
      if (n.attackIdx < att.length - 2) {
        const t0 = (att[n.attackIdx] & 0xff) << 8;
        const t1 = (att[n.attackIdx + 2] & 0xff) << 8;
        level += Math.trunc(((att[n.attackIdx + 3] - level) * (n.attackPos - t0)) / (t1 - t0));
      }
      v = (level * v + 32) >> 6;
    }
    const rel = env.release;
    if (n.release > 0 && rel) {
      let level = rel[n.releaseIdx + 1];
      if (n.releaseIdx < rel.length - 2) {
        const t0 = (rel[n.releaseIdx] & 0xff) << 8;
        const t1 = (rel[n.releaseIdx + 2] & 0xff) << 8;
        level += Math.trunc(((rel[n.releaseIdx + 3] - level) * (n.release - t0)) / (t1 - t0));
      }
      v = (v * level + 32) >> 6;
    }
    return v;
  }

  private notePan(n: Note) {
    const cp = this.pan[n.channel];
    return cp < 8192 ? (n.pan * cp + 32) >> 6 : 16384 - (((128 - n.pan) * (16384 - cp) + 32) >> 6);
  }

  /** Mix every note and fading stream for `len` frames. */
  private mixNotes(buf: Int32Array, off: number, len: number) {
    if (len <= 0) return;
    for (const s of this.mixer) s.read(buf, off, len);
    let dead = false;
    for (let i = 0; i < this.mixer.length; i++) if (!this.mixer[i].active || !this.mixer[i].ramping) dead = true;
    if (dead) {
      let w = 0;
      for (const s of this.mixer) if (s.active && s.ramping) this.mixer[w++] = s;
      this.mixer.length = w;
    }

    const count = this.notes.length;
    for (let i = 0; i < count; i++) {
      const n = this.notes[i];
      if (!n.alive) continue;
      if (!n.stream) {
        if (n.release >= 0) this.drop(n);
        continue;
      }
      let left = len;
      let at = off;
      for (;;) {
        if (left <= n.ticksLeft) {
          this.readNote(buf, n, at, left, at + left);
          n.ticksLeft -= left;
          break;
        }
        this.readNote(buf, n, at, n.ticksLeft, at + left);
        left -= n.ticksLeft;
        at += n.ticksLeft;
        if (this.tick(n, buf, at, left)) break;
      }
    }
    this.compact();
  }

  private readNote(buf: Int32Array, n: Note, at: number, len: number, end: number) {
    const ch = n.channel;
    if ((this.flags[ch] & 4) !== 0 && n.release < 0) {
      const step = Math.trunc(this.retrigRate[ch] / SYNTH_RATE);
      for (;;) {
        const until = Math.trunc((step + 1048575 - n.retrig) / step);
        if (len < until) {
          n.retrig += len * step;
          break;
        }
        len -= until;
        n.stream!.read(buf, at, until);
        let fade = Math.floor(SYNTH_RATE / 100);
        const limit = Math.trunc(262144 / step);
        if (limit < fade) fade = limit;
        const old = n.stream!;
        n.retrig += step * until - 1048576;
        const looped = n.instrument.patch.pitchOffsets[n.key] < 0;
        if (this.sampleOffset[ch] === 0) {
          n.stream = SoundStream.create(n.sound, old.absRate, old.targetVolume, old.targetPan);
        } else {
          n.stream = SoundStream.create(n.sound, old.absRate, 0, old.targetPan);
          if (n.stream) {
            this.applySampleOffset(n, looped);
            n.stream.rampTo(fade, old.targetVolume, n.stream.targetPan);
          }
        }
        if (looped) n.stream?.setLoops(-1);
        at += until;
        old.fadeOut(fade);
        old.read(buf, at, end - at);
        if (old.ramping) this.mixer.push(old);
        if (!n.stream) return;
      }
    }
    n.stream!.read(buf, at, len);
  }

  /** The 10 ms update. True when the note has ended (its tail already mixed). */
  private tick(n: Note, buf: Int32Array, at: number, left: number) {
    const tickLen = Math.floor(SYNTH_RATE / 100);
    n.ticksLeft = tickLen;
    const stream = n.stream!;
    if (n.release >= 0 && stream.finished) {
      this.drop(n);
      return true;
    }
    if (n.portaAmt > 0) {
      n.portaAmt -= Math.trunc(Math.pow(2, this.portaTime[n.channel] * 4.921259842519685e-4) * 16 + 0.5);
      if (n.portaAmt < 0) n.portaAmt = 0;
    }
    stream.setRate(this.pitch(n));
    const env = n.env;
    n.vibPhase += env.vibratoRate;
    n.age++;
    const keyScale = (((n.key - 60) << 8) + ((n.portaAmt * n.portaRange) >> 12)) * 5.086263020833333e-6;
    let ended = false;
    if (env.decayRate > 0) {
      n.decayPos += env.decayKeyScale > 0 ? Math.trunc(Math.pow(2, keyScale * env.decayKeyScale) * 128 + 0.5) : 128;
      if (n.decayPos * env.decayRate >= 819200) ended = true;
    }
    const att = env.volume;
    if (att) {
      n.attackPos += env.volumeKeyScale > 0 ? Math.trunc(Math.pow(2, env.volumeKeyScale * keyScale) * 128 + 0.5) : 128;
      while (n.attackIdx < att.length - 2 && n.attackPos > (att[n.attackIdx + 2] & 0xff) << 8) n.attackIdx += 2;
      if (att.length - 2 === n.attackIdx && att[n.attackIdx + 1] === 0) ended = true;
    }
    const rel = env.release;
    if (
      n.release >= 0 && rel && (this.flags[n.channel] & 1) === 0 &&
      (n.exclusive < 0 || this.exclusive[n.channel][n.exclusive] !== n)
    ) {
      n.release += env.releaseKeyScale > 0 ? Math.trunc(Math.pow(2, env.releaseKeyScale * keyScale) * 128 + 0.5) : 128;
      while (rel.length - 2 > n.releaseIdx && (rel[n.releaseIdx + 2] & 0xff) << 8 < n.release) n.releaseIdx += 2;
      if (n.releaseIdx === rel.length - 2) ended = true;
    }
    if (!ended) {
      stream.rampTo(tickLen, this.noteVolume(n), this.notePan(n));
      return false;
    }
    stream.fadeOut(tickLen);
    stream.read(buf, at, left);
    if (stream.ramping && stream.active) this.mixer.push(stream);
    this.drop(n);
    return true;
  }

  /** Unlink a finished note. Like the client, this leaves its held-key slot alone
   *  and only frees an exclusive class above 0. */
  private drop(n: Note) {
    n.alive = false;
    n.stream = null;
    if (n.exclusive > 0 && this.exclusive[n.channel][n.exclusive] === n) this.exclusive[n.channel][n.exclusive] = null;
  }

  private compact() {
    let w = 0;
    for (const n of this.notes) if (n.alive) this.notes[w++] = n;
    this.notes.length = w;
  }
}

/** The mix value of one full-scale 16-bit sample (the device writes `mix >> 8`). */
const FULL_SCALE = 256 * 32768;

export interface RenderedTrack {
  sampleRate: number;
  /** One loop of the track, planar stereo, full scale = ±1 (a loud passage may exceed it). */
  left: Float32Array;
  right: Float32Array;
  /** False when the MIDI never came round (nothing to loop); the buffers are then empty. */
  looped: boolean;
  /** The factor `targetRms` scaled the loop by (1 without it). */
  gain: number;
}

export interface RenderOptions {
  masterVolume?: number;
  /** Stop looking for the loop after this long (a malformed track never ends). */
  maxSeconds?: number;
  /** Scale the loop to this RMS level, never pushing its peak past 0.98. */
  targetRms?: number;
}

/**
 * Render one seamless loop of a track. The first pass is played and thrown away;
 * the second is kept, because it opens with the tails of the first pass's last
 * notes — exactly what the client plays each time the track comes round — so the
 * buffer loops with no seam.
 */
export function renderTrackLoop(midi: Uint8Array, instruments: InstrumentSource, opts: RenderOptions = {}): RenderedTrack {
  const synth = new MidiSynth(midi, instruments, { loop: true, masterVolume: opts.masterVolume });
  const maxFrames = SYNTH_RATE * (opts.maxSeconds ?? 900);
  const chunk = 2048;
  const buf = new Int32Array(chunk * 2);
  let left = new Float32Array(0);
  let right = new Float32Array(0);
  let base = -1;
  let kept = 0;
  while (synth.loopFrames.length < 2 && !synth.done && synth.frames < maxFrames) {
    const at = synth.frames;
    buf.fill(0);
    synth.render(buf, 0, chunk);
    if (synth.loopFrames.length === 0) continue;
    if (base < 0) {
      base = at;
      left = new Float32Array(SYNTH_RATE * 60);
      right = new Float32Array(SYNTH_RATE * 60);
    }
    if (kept + chunk > left.length) {
      const l = new Float32Array(left.length * 2);
      const r = new Float32Array(right.length * 2);
      l.set(left);
      r.set(right);
      left = l;
      right = r;
    }
    for (let i = 0; i < chunk; i++) {
      left[kept + i] = buf[i * 2] / FULL_SCALE;
      right[kept + i] = buf[i * 2 + 1] / FULL_SCALE;
    }
    kept += chunk;
  }
  if (synth.loopFrames.length < 2) {
    return { sampleRate: SYNTH_RATE, left: new Float32Array(0), right: new Float32Array(0), looped: false, gain: 1 };
  }
  const from = synth.loopFrames[0] - base;
  const to = synth.loopFrames[1] - base;
  const out = { sampleRate: SYNTH_RATE, left: left.slice(from, to), right: right.slice(from, to), looped: true, gain: 1 };
  if (opts.targetRms) out.gain = normalize(out.left, out.right, opts.targetRms);
  return out;
}

/**
 * The next `frames` of a playing synth as planar float stereo, scaled by `gain` —
 * the streaming player's unit of work. A looping synth never runs dry.
 */
export function renderChunk(synth: MidiSynth, frames: number, gain = 1) {
  const buf = new Int32Array(frames * 2);
  synth.render(buf, 0, frames);
  const left = new Float32Array(frames);
  const right = new Float32Array(frames);
  const k = gain / FULL_SCALE;
  for (let i = 0; i < frames; i++) {
    left[i] = buf[i * 2] * k;
    right[i] = buf[i * 2 + 1] * k;
  }
  return { left, right };
}

/** Scale a stereo buffer to an RMS level, capped so its peak stays under 0.98.
 *  Returns the factor applied. */
export function normalize(left: Float32Array, right: Float32Array, targetRms: number) {
  let sum = 0;
  let peak = 0;
  for (let i = 0; i < left.length; i++) {
    const a = left[i];
    const b = right[i];
    sum += a * a + b * b;
    const m = Math.max(Math.abs(a), Math.abs(b));
    if (m > peak) peak = m;
  }
  if (sum === 0) return 1;
  const rms = Math.sqrt(sum / (left.length * 2));
  const k = Math.min(targetRms / rms, 0.98 / peak);
  for (let i = 0; i < left.length; i++) {
    left[i] *= k;
    right[i] *= k;
  }
  return k;
}
