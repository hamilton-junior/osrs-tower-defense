import { describe, it, expect } from 'vitest';
import { capWavePreview, WAVE_PREVIEW_MAX } from './wave-preview';

const mob = (name: string, isBoss = false) => ({ name, isBoss });

describe('capWavePreview', () => {
  it('leaves a short wave untouched', () => {
    const p = [mob('a'), mob('b'), mob('c')];
    expect(capWavePreview(p)).toEqual(p);
  });

  it('caps a long wave — the panel stops growing with the run', () => {
    const p = Array.from({ length: 40 }, (_, i) => mob(`m${i}`));
    expect(capWavePreview(p)).toHaveLength(WAVE_PREVIEW_MAX);
  });

  it('never hides a boss, however late it appears in the list', () => {
    // The boss sits past the cap: a naive slice would drop it, which is the one
    // entry the player is actually reading the strip for.
    const p = [...Array.from({ length: 30 }, (_, i) => mob(`m${i}`)), mob('Zulrah', true)];
    const out = capWavePreview(p);
    expect(out).toHaveLength(WAVE_PREVIEW_MAX);
    expect(out.some((m) => m.name === 'Zulrah')).toBe(true);
  });

  it('shows every boss even when they alone exceed the cap', () => {
    const p = Array.from({ length: 15 }, (_, i) => mob(`boss${i}`, true));
    expect(capWavePreview(p)).toHaveLength(15);
  });

  it('keeps the wave\'s own order, so the strip does not reshuffle', () => {
    const p = [mob('a'), mob('b'), mob('Jad', true), mob('c'), mob('d')];
    expect(capWavePreview(p, 3).map((m) => m.name)).toEqual(['a', 'b', 'Jad']);
  });
});
