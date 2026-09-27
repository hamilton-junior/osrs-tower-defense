import { describe, it, expect } from 'vitest';
import { clipSamples, frameDurations, HOLD_MS } from './clip-timing.mjs';

// A jogre-like walk: four frames of 180ms each, stacked the way the exporter does.
const WALK = [0.18, 0.36, 0.54, 0.72];

const durations = (times, loop) => {
  const s = clipSamples(times, loop);
  return frameDurations(s.map((x) => x.at), times[times.length - 1]);
};

describe('clipSamples', () => {
  it('starts every clip on its first pose and moves off it at once', () => {
    const s = clipSamples(WALK, true);
    expect(s[0]).toEqual({ at: 0, t: WALK[0], t2: 0, w: 0 });
    // The very next frame is already a step towards pose 1.
    expect(s[1].at).toBeCloseTo(0.02, 9);
    expect(s[1].t).toBeGreaterThan(WALK[0]);
    expect(s[1].t).toBeLessThan(WALK[1]);
  });

  it('never holds a frame longer than one client cycle while moving', () => {
    for (const loop of [true, false]) {
      const ms = durations(WALK, loop);
      const moving = loop ? ms : ms.slice(0, -1);
      expect(Math.max(...moving)).toBeLessThanOrEqual(HOLD_MS);
    }
  });

  it("tweens a loop's last frame back round to its first pose", () => {
    const tail = clipSamples(WALK, true).filter((x) => x.w > 0);
    expect(tail.length).toBe(8);
    for (const x of tail) {
      expect(x.t).toBe(WALK[3]);
      expect(x.t2).toBe(WALK[0]);
    }
    expect(tail[tail.length - 1].w).toBeCloseTo(8 / 9, 9);
  });

  it("holds a one-shot's last pose", () => {
    const s = clipSamples(WALK, false);
    const last = s[s.length - 1];
    expect(last).toEqual({ at: WALK[2], t: WALK[3], t2: WALK[0], w: 0 });
    expect(s.filter((x) => x.t === WALK[3]).length).toBe(1);
  });

  it('keeps the clip exactly as long as the cache says', () => {
    for (const loop of [true, false]) {
      const total = durations(WALK, loop).reduce((a, b) => a + b, 0);
      expect(total).toBe(720);
    }
  });

  it('holds a rest as one still frame', () => {
    // A death: three quick frames, then the corpse lies there for 400 seconds.
    const s = clipSamples([0.06, 0.12, 400.12], false);
    const rest = s.filter((x) => x.at >= 0.12);
    expect(rest).toHaveLength(1);
    expect(rest[0].t).toBe(400.12);
  });

  it('skips a frame of no length', () => {
    const s = clipSamples([0, 0.06, 0.12], true);
    expect(s[0].at).toBe(0);
    expect(s[0].t).toBe(0.06);
  });
});

describe('frameDurations', () => {
  it('rounds on the running total, so the steps add up to the span', () => {
    const starts = Array.from({ length: 10 }, (_, i) => i * 0.0185);
    const ms = frameDurations(starts, 0.185);
    expect(ms.reduce((a, b) => a + b, 0)).toBe(185);
  });
});
