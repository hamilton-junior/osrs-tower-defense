import { describe, expect, it } from 'vitest';
import { BIOME_LIST } from '../data/biomes';
import { BOSS_WAVE_INTERVAL } from './wave-generation';
import { TRAVEL_CHOICES, travelOffer, regionPoolRng } from './travel';

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

describe('regionPoolRng', () => {
  const draw = (rng: () => number, n = 8) => Array.from({ length: n }, rng);

  // The pools are re-rolled on every move between regions and again on every load,
  // so a run that leaves a region and comes back has to find its water where it was.
  it('deals the same water every time a run stands in the same region', () => {
    for (const b of BIOME_LIST) {
      expect(draw(regionPoolRng(4242, b.id))).toEqual(draw(regionPoolRng(4242, b.id)));
    }
  });

  it('gives each region its own water on the same map', () => {
    const seen = new Set(BIOME_LIST.map((b) => draw(regionPoolRng(4242, b.id)).join(',')));
    expect(seen.size).toBe(BIOME_LIST.length);
  });

  it('gives each map its own water in the same region', () => {
    const [a, b] = [regionPoolRng(1, BIOME_LIST[0].id), regionPoolRng(2, BIOME_LIST[0].id)];
    expect(draw(a)).not.toEqual(draw(b));
  });

  it('survives a seed that would overflow a signed int', () => {
    const rng = regionPoolRng(0xffffffff, BIOME_LIST[0].id);
    expect(draw(rng).every((v) => v >= 0 && v < 1)).toBe(true);
  });
});
