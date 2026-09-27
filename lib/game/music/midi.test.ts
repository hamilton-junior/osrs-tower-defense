import { describe, it, expect } from 'vitest';
import { MidiReader, MIDI_END_OF_TRACK } from './midi.ts';

/** A MIDI file from raw track event bytes (delta-times included). */
function midiFile(division: number, ...tracks: number[][]) {
  const out = [0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 1, 0, tracks.length, division >> 8, division & 0xff];
  for (const t of tracks) {
    out.push(0x4d, 0x54, 0x72, 0x6b, (t.length >> 24) & 0xff, (t.length >> 16) & 0xff, (t.length >> 8) & 0xff, t.length & 0xff, ...t);
  }
  return new Uint8Array(out);
}

/** Read every event of a file in the synth's order: [track, tick, event]. */
function drain(r: MidiReader) {
  const seen: [number, number, number][] = [];
  for (let t = 0; t < r.trackCount; t++) {
    r.seekTrack(t);
    r.addDelta(t);
    r.saveTrack(t);
  }
  for (let guard = 0; guard < 1000 && !r.allTracksDone(); guard++) {
    const t = r.nextTrack();
    const tick = r.times[t];
    r.seekTrack(t);
    const ev = r.readEvent(t);
    seen.push([t, tick, ev]);
    if (ev === MIDI_END_OF_TRACK) {
      r.endTrack();
      r.saveTrack(t);
      continue;
    }
    r.addDelta(t);
    r.saveTrack(t);
  }
  return seen;
}

describe('MidiReader', () => {
  it('reads the header and packs channel messages as status | d1 << 8 | d2 << 16', () => {
    const r = new MidiReader(midiFile(480, [0x00, 0x90, 60, 100, 0x00, 0xff, 0x2f, 0x00]));
    expect(r.division).toBe(480);
    expect(r.trackCount).toBe(1);
    const events = drain(r);
    expect(events[0]).toEqual([0, 0, 0x90 | (60 << 8) | (100 << 16)]);
    expect(events[1][2]).toBe(MIDI_END_OF_TRACK);
  });

  it('carries running status, and reads multi-byte delta times', () => {
    // note on, then a second note on 200 ticks later with the status byte omitted
    const r = new MidiReader(midiFile(96, [0x00, 0x91, 60, 90, 0x81, 0x48, 64, 80, 0x00, 0xff, 0x2f, 0x00]));
    const events = drain(r);
    expect(events[0]).toEqual([0, 0, 0x91 | (60 << 8) | (90 << 16)]);
    expect(events[1]).toEqual([0, 200, 0x91 | (64 << 8) | (80 << 16)]);
  });

  it('merges tracks by time, earlier track first on a tie', () => {
    const r = new MidiReader(midiFile(96,
      [0x10, 0x90, 1, 1, 0x00, 0xff, 0x2f, 0x00],
      [0x08, 0x90, 2, 1, 0x08, 0x90, 3, 1, 0x00, 0xff, 0x2f, 0x00],
    ));
    const notes = drain(r).filter(([, , ev]) => (ev & 0xf0) === 0x90).map(([t, tick, ev]) => [t, tick, (ev >> 8) & 0x7f]);
    expect(notes).toEqual([[1, 8, 2], [0, 16, 1], [1, 16, 3]]);
  });

  it('folds tempo changes into one running clock, the way the client times events', () => {
    // 100 ticks at the default 500000µs/quarter, then a tempo of 250000
    const r = new MidiReader(midiFile(100, [0x64, 0xff, 0x51, 0x03, 0x03, 0xd0, 0x90, 0x64, 0xff, 0x2f, 0x00]));
    for (let t = 0; t < r.trackCount; t++) { r.seekTrack(t); r.addDelta(t); r.saveTrack(t); }
    r.seekTrack(0);
    expect(r.readEvent(0)).toBe(2);
    // the clock is continuous at the change, then runs at the new tempo
    expect(r.timeMicros(100)).toBe(100 * 500000);
    expect(r.timeMicros(200)).toBe(100 * 500000 + 100 * 250000);
  });

  it('rewinds every track and restarts the clock from a given point', () => {
    const r = new MidiReader(midiFile(96, [0x20, 0x90, 60, 1, 0x00, 0xff, 0x2f, 0x00]));
    drain(r);
    expect(r.allTracksDone()).toBe(true);
    r.rewind(12345);
    expect(r.allTracksDone()).toBe(false);
    expect(r.times[0]).toBe(0x20);
    expect(r.timeMicros(0)).toBe(12345);
  });
});
