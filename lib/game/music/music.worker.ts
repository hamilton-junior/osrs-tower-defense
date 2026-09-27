/**
 * The music synth's thread. The main thread hands it the soundbank once, then
 * starts a track and pulls audio a second or so at a time; the synth keeps its
 * place between pulls and loops the track itself, exactly as the client's does,
 * so a track streams for as long as it plays and nothing is rendered ahead of use.
 *
 * Keeping it off the main thread matters: a second of an orchestral track costs a
 * few milliseconds, which is nothing here and a dropped frame in the game loop.
 */
import { SoundBank } from './bank.ts';
import { MidiSynth, renderChunk } from './synth.ts';

export type MusicWorkerIn =
  | { type: 'bank'; bytes: ArrayBuffer }
  | { type: 'start'; token: number; midi: ArrayBuffer; gain: number }
  | { type: 'pull'; token: number; frames: number }
  | { type: 'stop'; token: number };

export type MusicWorkerOut = { type: 'chunk'; token: number; left: Float32Array; right: Float32Array };

let bank: SoundBank | null = null;
const playing = new Map<number, { synth: MidiSynth; gain: number }>();
const port = self as unknown as Worker;

port.onmessage = (e: MessageEvent<MusicWorkerIn>) => {
  const msg = e.data;
  switch (msg.type) {
    case 'bank':
      bank = SoundBank.fromBytes(new Uint8Array(msg.bytes));
      break;
    case 'start':
      if (!bank) return;
      playing.set(msg.token, { synth: new MidiSynth(new Uint8Array(msg.midi), bank.instrument, { loop: true }), gain: msg.gain });
      break;
    case 'pull': {
      const p = playing.get(msg.token);
      if (!p) return;
      const { left, right } = renderChunk(p.synth, msg.frames, p.gain);
      const out: MusicWorkerOut = { type: 'chunk', token: msg.token, left, right };
      port.postMessage(out, [left.buffer, right.buffer]);
      break;
    }
    case 'stop':
      playing.delete(msg.token);
      break;
  }
};
