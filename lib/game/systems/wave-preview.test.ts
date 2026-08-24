import { describe, it, expect } from 'vitest';
import { capWavePreview, WAVE_PREVIEW_MAX, waveHintLines, waveHint } from './wave-preview';

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

describe('waveHintLines', () => {
  // Deterministic draws: always the first entry of whatever it is offered.
  const first = () => 0;

  it('says nothing but the boss when a boss is coming', () => {
    const lines = waveHintLines(
      [{ name: 'Cow', count: 20 }, { name: 'Zulrah', count: 1, isBoss: true }],
      40, first,
    );
    expect(lines).toEqual(['Zulrah comes down that road next. Be ready.']);
  });

  it('calls out a weakness most of the wave shares', () => {
    const lines = waveHintLines(
      [{ name: 'Ice giant', count: 12, weakness: 'fire' }, { name: 'Cow', count: 4 }],
      12, first,
    );
    expect(lines[0]).toBe('Most of that lot look weak to fire next wave.');
  });

  it('does not call out a weakness only a handful share', () => {
    const lines = waveHintLines(
      [{ name: 'Ice giant', count: 3, weakness: 'fire' }, { name: 'Cow', count: 30 }],
      12, first,
    );
    expect(lines.some((l) => l.includes('weak to'))).toBe(false);
  });

  // The bug that started this: forty monsters, the biggest group is six cows,
  // and the Guide announced “mostly cows”.
  it('never names a type that is not actually most of the wave', () => {
    const entries = Array.from({ length: 8 }, (_, i) => ({ name: `Mob${i}`, count: 5 }));
    const lines = waveHintLines(entries, 20, first);
    expect(lines.some((l) => l.startsWith('Mostly '))).toBe(false);
    expect(lines.length).toBeGreaterThan(0);
  });

  it('still names a type when it really is most of them', () => {
    const lines = waveHintLines([{ name: 'Goblin', count: 9 }, { name: 'Rat', count: 2 }], 2, first);
    expect(lines).toContain('Mostly Goblin next wave.');
  });

  it('counts the elites the wave is likely to roll', () => {
    const lines = waveHintLines([{ name: 'Cow', count: 40 }], 30, first);
    expect(lines.some((l) => /Reckon about \d+ elites/.test(l))).toBe(true);
  });

  it('promises no elites before affixes are unlocked', () => {
    const lines = waveHintLines([{ name: 'Cow', count: 40 }], 2, first);
    expect(lines.some((l) => l.includes('elite'))).toBe(false);
    expect(lines.some((l) => l.includes('could come through'))).toBe(false);
  });

  it('always has something to say about a wave with enemies in it', () => {
    for (let wave = 1; wave <= 60; wave++) {
      expect(waveHint([{ name: 'Cow', count: 6 }, { name: 'Rat', count: 5 }], wave, first)).toBeTruthy();
    }
  });

  it('has nothing to say about an empty wave', () => {
    expect(waveHintLines([], 10, first)).toEqual([]);
    expect(waveHint([], 10, first)).toBeUndefined();
  });
});
