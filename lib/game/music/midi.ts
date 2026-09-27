/**
 * The OSRS client's own MIDI reader — a port of its `MidiFileReader`, which the
 * music synth walks one event at a time.
 *
 * It is not a general-purpose MIDI parser, and that is the point: the track bytes
 * the cache holds are rebuilt into MIDI by the client, and they lean on this
 * reader's quirks (running status carries across meta events; the tempo map is
 * folded into one running `startMicros` rather than kept as a list). Reading them
 * with anything else risks a track that drifts against the client's timing.
 *
 * Times are MIDI ticks; `timeMicros(ticks)` turns one into microseconds×division
 * the way the client does, so the synth compares it against its own sample clock
 * without ever dividing.
 */

/** Data bytes each channel status carries, indexed by `status - 0x80`. */
const STATUS_LENGTHS = new Int8Array([
  2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2,
  2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2,
  2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2,
  2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2,
  1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
  1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
  2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2,
  0, 1, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
]);

/** `readEvent` result for a track's end-of-track meta event. */
export const MIDI_END_OF_TRACK = 1;

export class MidiReader {
  /** Ticks per quarter note. */
  division = 0;
  /** Absolute tick of each track's next event. */
  times: number[] = [];
  private data: Uint8Array | null = null;
  private offset = 0;
  private positions: number[] = [];
  private startPositions: number[] = [];
  private statuses: number[] = [];
  private tempo = 500000;
  private startMicros = 0;

  constructor(bytes?: Uint8Array) {
    if (bytes) this.load(bytes);
  }

  load(bytes: Uint8Array) {
    this.data = bytes;
    this.offset = 10;
    const tracks = this.u16();
    this.division = this.u16();
    this.tempo = 500000;
    this.startPositions = new Array(tracks).fill(0);
    for (let i = 0; i < tracks;) {
      const id = this.i32();
      const len = this.i32();
      if (id === 0x4d54726b /* MTrk */) this.startPositions[i++] = this.offset;
      this.offset += len;
    }
    this.startMicros = 0;
    this.positions = this.startPositions.slice();
    this.times = new Array(tracks).fill(0);
    this.statuses = new Array(tracks).fill(0);
  }

  get loaded() {
    return this.data !== null;
  }

  get trackCount() {
    return this.positions.length;
  }

  release() {
    this.data = null;
  }

  /** Tick → the client's clock: microseconds × division, tempo changes folded in. */
  timeMicros(ticks: number) {
    return this.startMicros + ticks * this.tempo;
  }

  /** Every track has read its end-of-track event. */
  allTracksDone() {
    for (const p of this.positions) if (p >= 0) return false;
    return true;
  }

  /** Rewind every track to its start, keeping the clock running from `micros`. */
  rewind(micros: number) {
    this.startMicros = micros;
    for (let i = 0; i < this.positions.length; i++) {
      this.times[i] = 0;
      this.statuses[i] = 0;
      this.offset = this.startPositions[i];
      this.addDelta(i);
      this.positions[i] = this.offset;
    }
  }

  seekTrack(track: number) {
    this.offset = this.positions[track];
  }

  saveTrack(track: number) {
    this.positions[track] = this.offset;
  }

  /** Mark the current track finished (the client parks its cursor at -1). */
  endTrack() {
    this.offset = -1;
  }

  addDelta(track: number) {
    this.times[track] += this.varInt();
  }

  /** The unfinished track whose next event comes first, or -1. */
  nextTrack() {
    let track = -1;
    let min = Infinity;
    for (let i = 0; i < this.positions.length; i++) {
      if (this.positions[i] >= 0 && this.times[i] < min) {
        track = i;
        min = this.times[i];
      }
    }
    return track;
  }

  /**
   * Read the event under the cursor. A channel message comes back packed as
   * `status | data1 << 8 | data2 << 16`; `MIDI_END_OF_TRACK` (1), a tempo change
   * (2, already applied) or any other meta/sysex (0 or 3) otherwise.
   */
  readEvent(track: number) {
    const data = this.data!;
    const first = data[this.offset];
    let status: number;
    if (first >= 0x80) {
      status = first;
      this.statuses[track] = status;
      this.offset++;
    } else {
      status = this.statuses[track];
    }
    if (status !== 0xf0 && status !== 0xf7) return this.readMessage(track, status);
    const len = this.varInt();
    if (status === 0xf7 && len > 0) {
      const s = data[this.offset];
      if ((s >= 0xf1 && s <= 0xf3) || s === 0xf6 || s === 0xf8 || (s >= 0xfa && s <= 0xfc) || s === 0xfe) {
        this.offset++;
        this.statuses[track] = s;
        return this.readMessage(track, s);
      }
    }
    this.offset += len;
    return 0;
  }

  private readMessage(track: number, status: number) {
    const data = this.data!;
    if (status !== 0xff) {
      const len = STATUS_LENGTHS[status - 0x80];
      let event = status;
      if (len >= 1) event |= data[this.offset++] << 8;
      if (len >= 2) event |= data[this.offset++] << 16;
      return event;
    }
    const type = data[this.offset++];
    let skip = this.varInt();
    if (type === 0x2f) {
      this.offset += skip;
      return MIDI_END_OF_TRACK;
    }
    if (type === 0x51) {
      const tempo = (data[this.offset] << 16) | (data[this.offset + 1] << 8) | data[this.offset + 2];
      this.offset += 3;
      skip -= 3;
      this.startMicros += this.times[track] * (this.tempo - tempo);
      this.tempo = tempo;
      this.offset += skip;
      return 2;
    }
    this.offset += skip;
    return 3;
  }

  private u16() {
    const d = this.data!;
    const v = (d[this.offset] << 8) | d[this.offset + 1];
    this.offset += 2;
    return v;
  }

  private i32() {
    const d = this.data!;
    const v = (d[this.offset] << 24) | (d[this.offset + 1] << 16) | (d[this.offset + 2] << 8) | d[this.offset + 3];
    this.offset += 4;
    return v;
  }

  private varInt() {
    const d = this.data!;
    let b = d[this.offset++];
    let v = 0;
    while (b & 0x80) {
      v = (v | (b & 0x7f)) << 7;
      b = d[this.offset++];
    }
    return v | b;
  }
}
