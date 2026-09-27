/**
 * The in-game music player: streams OSRS tracks rendered live by the synth worker
 * into Web Audio, crossfading when the track changes.
 *
 * The worker renders; this side only schedules. It keeps a few seconds of audio
 * queued ahead of the audio clock, one `AudioBufferSourceNode` per chunk, each
 * started at the exact time the previous one ends — sample-accurate, so the chunks
 * join without a seam. Every track plays through its own gain node, which is what
 * a crossfade ramps; the master gain carries the volume slider and mute.
 *
 * Browsers hold audio until the page's first click or key press. The player asks
 * for the track straight away anyway: the audio context simply starts suspended,
 * the first seconds queue up, and they play the moment the page is touched.
 */
import type { MusicWorkerIn, MusicWorkerOut } from './music.worker.ts';
import { SYNTH_RATE } from './synth.ts';

/** Loudest the music gets, at slider 100% — kept under the effects, which carry the game. */
const MAX_GAIN = 0.4;
/** Audio kept queued ahead of the clock, and the size of each pull from the worker. */
const AHEAD_S = 4;
const CHUNK_FRAMES = SYNTH_RATE;
const FADE_IN_S = 1.5;
const FADE_OUT_S = 2;

export interface MusicUrls {
  bank: string;
  levels: string;
  track: (id: string) => string;
}

interface Playing {
  id: string;
  token: number;
  gain: GainNode;
  /** Audio-clock time the next chunk starts at. */
  nextTime: number;
  pending: boolean;
  sources: Set<AudioBufferSourceNode>;
}

export class MusicPlayer {
  private readonly urls: MusicUrls;
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private worker: Worker | null = null;
  private ready: Promise<boolean> | null = null;
  private levels: Record<string, { gain: number }> = {};
  private readonly midis = new Map<string, ArrayBuffer>();
  private current: Playing | null = null;
  private wanted: string | null = null;
  private token = 0;
  private volume = 0.5;
  private muted = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly unlock = () => { void this.ctx?.resume().catch(() => {}); };

  constructor(urls: MusicUrls) {
    this.urls = urls;
  }

  get level() {
    return this.volume;
  }

  setVolume(v: number) {
    this.volume = Math.max(0, Math.min(1, v));
    this.applyGain();
  }

  setMuted(m: boolean) {
    this.muted = m;
    this.applyGain();
  }

  /** Play a track (by `MUSIC_TRACKS` id), or nothing. The same id again is a no-op. */
  play(id: string | null) {
    this.wanted = id;
    if (this.current?.id === id) return;
    void this.switchTo(id);
  }

  dispose() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    window.removeEventListener('pointerdown', this.unlock);
    window.removeEventListener('keydown', this.unlock);
    this.worker?.terminate();
    this.worker = null;
    void this.ctx?.close().catch(() => {});
    this.ctx = null;
    this.current = null;
  }

  private applyGain() {
    if (!this.ctx || !this.master) return;
    const target = this.muted ? 0 : this.volume * MAX_GAIN;
    this.master.gain.setTargetAtTime(target, this.ctx.currentTime, 0.05);
  }

  /** Audio context, worker and soundbank, set up on the first track asked for. */
  private boot(): Promise<boolean> {
    this.ready ??= (async () => {
      if (typeof window === 'undefined' || typeof AudioContext === 'undefined' || typeof Worker === 'undefined') return false;
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : this.volume * MAX_GAIN;
      this.master.connect(this.ctx.destination);
      window.addEventListener('pointerdown', this.unlock);
      window.addEventListener('keydown', this.unlock);
      this.worker = new Worker(new URL('./music.worker.ts', import.meta.url));
      this.worker.onmessage = (e: MessageEvent<MusicWorkerOut>) => this.onChunk(e.data);
      const [bank, levels] = await Promise.all([
        fetch(this.urls.bank).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`music bank ${r.status}`)))),
        fetch(this.urls.levels).then((r) => (r.ok ? r.json() : {})).catch(() => ({})),
      ]);
      this.levels = levels;
      this.post({ type: 'bank', bytes: bank }, [bank]);
      this.timer = setInterval(() => this.pump(), 250);
      return true;
    })().catch(() => false);
    return this.ready;
  }

  private post(msg: MusicWorkerIn, transfer: Transferable[] = []) {
    this.worker?.postMessage(msg, transfer);
  }

  private async midi(id: string) {
    let m = this.midis.get(id);
    if (!m) {
      const r = await fetch(this.urls.track(id));
      if (!r.ok) throw new Error(`music track ${id}: ${r.status}`);
      m = await r.arrayBuffer();
      this.midis.set(id, m);
    }
    return m;
  }

  private async switchTo(id: string | null) {
    if (!(await this.boot())) return;
    let midi: ArrayBuffer | null = null;
    if (id) {
      try {
        midi = await this.midi(id);
      } catch {
        return;
      }
    }
    // Another request may have landed while this one was fetching.
    if (this.wanted !== id || this.current?.id === id) return;
    const ctx = this.ctx!;
    const now = ctx.currentTime;

    const old = this.current;
    this.current = null;
    if (old) {
      old.gain.gain.cancelScheduledValues(now);
      old.gain.gain.setValueAtTime(old.gain.gain.value, now);
      old.gain.gain.linearRampToValueAtTime(0, now + FADE_OUT_S);
      setTimeout(() => {
        for (const s of old.sources) {
          s.onended = null;
          try { s.stop(); } catch { /* context already closed */ }
        }
        old.gain.disconnect();
        this.post({ type: 'stop', token: old.token });
      }, FADE_OUT_S * 1000 + 100);
    }
    if (!id || !midi) return;

    const gain = ctx.createGain();
    gain.connect(this.master!);
    if (old) {
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(1, now + FADE_IN_S);
    }
    const token = ++this.token;
    this.current = { id, token, gain, nextTime: now + 0.1, pending: false, sources: new Set() };
    this.post({ type: 'start', token, midi: midi.slice(0), gain: this.levels[id]?.gain ?? 1 });
    this.pump();
  }

  /** Ask the worker for the next chunk while less than `AHEAD_S` is queued. */
  private pump() {
    const p = this.current;
    const ctx = this.ctx;
    if (!p || !ctx || p.pending) return;
    // Fell behind (a stalled tab): pick up from now rather than scheduling in the past.
    if (p.nextTime < ctx.currentTime) p.nextTime = ctx.currentTime + 0.05;
    if (p.nextTime - ctx.currentTime >= AHEAD_S) return;
    p.pending = true;
    this.post({ type: 'pull', token: p.token, frames: CHUNK_FRAMES });
  }

  private onChunk(msg: MusicWorkerOut) {
    const p = this.current;
    const ctx = this.ctx;
    if (!p || !ctx || msg.token !== p.token) return;
    p.pending = false;
    const buf = ctx.createBuffer(2, msg.left.length, SYNTH_RATE);
    buf.copyToChannel(msg.left as Float32Array<ArrayBuffer>, 0);
    buf.copyToChannel(msg.right as Float32Array<ArrayBuffer>, 1);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(p.gain);
    if (p.nextTime < ctx.currentTime) p.nextTime = ctx.currentTime + 0.05;
    src.start(p.nextTime);
    p.nextTime += buf.duration;
    p.sources.add(src);
    // Each chunk that finishes asks for the next as well as the timer does: a
    // background tab throttles timers to once a minute, but not these events.
    src.onended = () => {
      p.sources.delete(src);
      this.pump();
    };
    this.pump();
  }
}
