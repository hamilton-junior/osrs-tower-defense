import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MusicPlayer } from './player.ts';

/** Just enough Web Audio for the player: gains and a clock. */
class FakeAudioContext {
  static made = 0;
  currentTime = 0;
  destination = {};
  constructor() { FakeAudioContext.made++; }
  createGain() {
    const param = { value: 1, setTargetAtTime() {}, cancelScheduledValues() {}, setValueAtTime() {}, linearRampToValueAtTime() {} };
    return { gain: param, connect() {}, disconnect() {} };
  }
  resume() { return Promise.resolve(); }
  close() { return Promise.resolve(); }
}

class FakeWorker {
  static posted: string[] = [];
  onmessage: unknown = null;
  postMessage(msg: { type: string }) { FakeWorker.posted.push(msg.type); }
  terminate() {}
}

/** Every fetch waits until the test lets it through. */
let release: () => void;
let gate: Promise<void>;

const urls = { bank: 'bank.bin', levels: 'tracks.json', track: (id: string) => `${id}.mid` };
const settle = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  FakeAudioContext.made = 0;
  FakeWorker.posted = [];
  gate = new Promise((r) => { release = r; });
  vi.stubGlobal('window', { addEventListener() {}, removeEventListener() {} });
  vi.stubGlobal('AudioContext', FakeAudioContext);
  vi.stubGlobal('Worker', FakeWorker);
  vi.stubGlobal('fetch', vi.fn(async () => {
    await gate;
    return { ok: true, arrayBuffer: async () => new ArrayBuffer(8), json: async () => ({}) };
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('MusicPlayer', () => {
  it('starts the track once the bank and its MIDI arrive', async () => {
    const p = new MusicPlayer(urls);
    p.play('harmony');
    release();
    await settle();
    expect(FakeWorker.posted).toEqual(['bank', 'start', 'pull']);
    p.dispose();
  });

  // React's dev mode mounts, unmounts and mounts again: the first player is disposed
  // while its soundbank is still downloading.
  it('does nothing once disposed mid-load', async () => {
    const p = new MusicPlayer(urls);
    p.play('harmony');
    p.dispose();
    release();
    await settle();
    expect(FakeWorker.posted).toEqual([]);
  });

  it('does not wake up after dispose', async () => {
    const p = new MusicPlayer(urls);
    p.dispose();
    p.play('harmony');
    release();
    await settle();
    expect(FakeAudioContext.made).toBe(0);
  });
});
