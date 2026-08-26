import { describe, expect, it } from 'vitest';
import { BIOME_LIST } from '../data/biomes';
import {
  TRAVEL_CHOICES,
  TRAVEL_INTERVAL,
  isTravelWave,
  legOfWave,
  travelOffer,
  wavesUntilTravel,
} from './travel';

describe('isTravelWave', () => {
  it('never fires on the opening wave — the opening region is rolled, not chosen', () => {
    expect(isTravelWave(1)).toBe(false);
    expect(isTravelWave(0)).toBe(false);
  });

  it('fires on the wave that opens each leg', () => {
    expect(isTravelWave(TRAVEL_INTERVAL + 1)).toBe(true);
    expect(isTravelWave(TRAVEL_INTERVAL * 2 + 1)).toBe(true);
    expect(isTravelWave(TRAVEL_INTERVAL * 7 + 1)).toBe(true);
  });

  it('does not fire mid-leg', () => {
    for (let w = 2; w <= TRAVEL_INTERVAL; w++) expect(isTravelWave(w)).toBe(false);
  });
});

describe('legOfWave', () => {
  it('keeps a whole leg on one index', () => {
    for (let w = 1; w <= TRAVEL_INTERVAL; w++) expect(legOfWave(w)).toBe(0);
    for (let w = TRAVEL_INTERVAL + 1; w <= TRAVEL_INTERVAL * 2; w++) expect(legOfWave(w)).toBe(1);
  });

  it('advances exactly on the travel waves', () => {
    expect(legOfWave(TRAVEL_INTERVAL)).toBe(0);
    expect(legOfWave(TRAVEL_INTERVAL + 1)).toBe(1);
  });
});

describe('wavesUntilTravel', () => {
  it('counts the current wave down to the turn', () => {
    expect(wavesUntilTravel(1)).toBe(TRAVEL_INTERVAL);
    expect(wavesUntilTravel(TRAVEL_INTERVAL)).toBe(1);
    expect(wavesUntilTravel(TRAVEL_INTERVAL + 1)).toBe(TRAVEL_INTERVAL);
  });
});

describe('travelOffer', () => {
  const ids = BIOME_LIST.map((b) => b.id);

  it('offers exactly TRAVEL_CHOICES distinct regions', () => {
    for (let leg = 1; leg < 40; leg++) {
      const offer = travelOffer(12345, leg, 'lumbridge');
      expect(offer).toHaveLength(TRAVEL_CHOICES);
      expect(new Set(offer).size).toBe(TRAVEL_CHOICES);
      for (const id of offer) expect(ids).toContain(id);
    }
  });

  it('never offers where the run already stands', () => {
    for (const current of ids) {
      for (let leg = 1; leg < 20; leg++) {
        expect(travelOffer(7, leg, current)).not.toContain(current);
      }
    }
  });

  it('avoids the region just left, so a fork is never a there-and-back', () => {
    for (let leg = 1; leg < 20; leg++) {
      const offer = travelOffer(99, leg, 'karamja', 'morytania');
      expect(offer).not.toContain('karamja');
      expect(offer).not.toContain('morytania');
    }
  });

  it('is deterministic in seed + leg — a resumed save sees the same fork', () => {
    const a = travelOffer(0xbeef, 3, 'wilderness', 'tzhaar');
    const b = travelOffer(0xbeef, 3, 'wilderness', 'tzhaar');
    expect(a).toEqual(b);
  });

  it('does not hand every leg the same fork', () => {
    const seen = new Set<string>();
    for (let leg = 1; leg < 12; leg++) seen.add(travelOffer(4242, leg, 'lumbridge').join(','));
    expect(seen.size).toBeGreaterThan(1);
  });
});
