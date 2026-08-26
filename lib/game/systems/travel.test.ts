import { describe, expect, it } from 'vitest';
import { BIOME_LIST } from '../data/biomes';
import { BOSS_WAVE_INTERVAL } from './wave-generation';
import { TRAVEL_CHOICES, travelOffer } from './travel';

describe('travelOffer', () => {
  const ids = BIOME_LIST.map((b) => b.id);

  it('offers exactly TRAVEL_CHOICES distinct regions', () => {
    for (let turn = 1; turn < 40; turn++) {
      const offer = travelOffer(12345, turn, 'lumbridge');
      expect(offer).toHaveLength(TRAVEL_CHOICES);
      expect(new Set(offer).size).toBe(TRAVEL_CHOICES);
      for (const id of offer) expect(ids).toContain(id);
    }
  });

  it('never offers where the run already stands', () => {
    for (const current of ids) {
      for (let turn = 1; turn < 20; turn++) {
        expect(travelOffer(7, turn, current)).not.toContain(current);
      }
    }
  });

  it('avoids the region just left, so a fork is never a there-and-back', () => {
    for (let turn = 1; turn < 20; turn++) {
      const offer = travelOffer(99, turn, 'karamja', 'morytania');
      expect(offer).not.toContain('karamja');
      expect(offer).not.toContain('morytania');
    }
  });

  it('is deterministic in seed + turn — a resumed save sees the same fork', () => {
    const a = travelOffer(0xbeef, 3, 'wilderness', 'tzhaar');
    const b = travelOffer(0xbeef, 3, 'wilderness', 'tzhaar');
    expect(a).toEqual(b);
  });

  it('does not hand every boss the same fork', () => {
    // The engine keys the fork on the wave the boss fell on: 11, 21, 31 … for the
    // scheduled ones. Those must not all reach the same two roads.
    const seen = new Set<string>();
    for (let n = 1; n < 12; n++) {
      seen.add(travelOffer(4242, n * BOSS_WAVE_INTERVAL + 1, 'lumbridge').join(','));
    }
    expect(seen.size).toBeGreaterThan(1);
  });
});
