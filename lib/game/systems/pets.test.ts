import { describe, it, expect } from 'vitest';
import { PETS, PET_BY_BOSS, PET_BY_ID } from '../data/pets';
import { PET_LUCK_PER_TIER, petDropChance, petProgress, rollPetDrop, sanitizePets, validActivePet } from './pets';
import { ENEMIES } from '../data/enemies';

describe('pet data', () => {
  it('only drops from bosses that exist', () => {
    for (const pet of PETS) {
      expect(pet.from.length).toBeGreaterThan(0);
      for (const boss of pet.from) {
        expect(ENEMIES[boss], `${pet.id} drops from ${boss}`).toBeTruthy();
        expect(ENEMIES[boss].isBoss, `${boss} is a boss`).toBe(true);
      }
    }
  });

  it('gives each boss at most one pet', () => {
    const seen = new Set<string>();
    for (const pet of PETS) {
      for (const boss of pet.from) {
        expect(seen.has(boss), `${boss} listed twice`).toBe(false);
        seen.add(boss);
      }
    }
    expect(Object.keys(PET_BY_BOSS).length).toBe(seen.size);
  });

  // The Grotesque Guardians are one fight, so both halves of it hand back the
  // same pet — a player who kills Dawn last must not be chasing a second pet.
  it('pairs Dusk and Dawn on one pet', () => {
    expect(PET_BY_BOSS.dusk).toBe('noon');
    expect(PET_BY_BOSS.dawn).toBe('noon');
  });
});

describe('petDropChance', () => {
  it('is 1 in rate at Normal', () => {
    expect(petDropChance(100, 0)).toBeCloseTo(0.01, 10);
  });

  it('climbs with the difficulty tier', () => {
    expect(petDropChance(100, 1)).toBeCloseTo(0.01 * (1 + PET_LUCK_PER_TIER), 10);
    expect(petDropChance(100, 6)).toBeCloseTo(0.01 * (1 + 6 * PET_LUCK_PER_TIER), 10);
  });

  it('never exceeds certainty or goes negative', () => {
    expect(petDropChance(0.5, 6)).toBe(1);
    expect(petDropChance(0, 0)).toBe(0);
    expect(petDropChance(-10, 3)).toBe(0);
  });
});

describe('rollPetDrop', () => {
  it('pays nothing for an enemy with no pet', () => {
    expect(rollPetDrop('goblin', 0, () => 0)).toBeNull();
  });

  it('drops on a roll under the chance and not on one over it', () => {
    const rate = PET_BY_ID[PET_BY_BOSS.vorkath!].rate;
    expect(rollPetDrop('vorkath', 0, () => 1 / rate - 1e-9)).toBe('vorki');
    expect(rollPetDrop('vorkath', 0, () => 1 / rate + 1e-9)).toBeNull();
  });

  // The roll is not gated on owning the pet: a duplicate is a real drop, and the
  // engine (not this function) decides how loudly to say so.
  it('keeps rolling for a pet already owned', () => {
    expect(rollPetDrop('scurrius', 0, () => 0)).toBe('scurry');
  });
});

describe('petProgress', () => {
  it('counts distinct pets held', () => {
    expect(petProgress({})).toEqual({ owned: 0, total: PETS.length });
    expect(petProgress({ vorki: 3, scurry: 1, nope: 9 })).toEqual({ owned: 2, total: PETS.length });
  });
});

describe('validActivePet', () => {
  it('keeps a pet the account holds', () => {
    expect(validActivePet({ vorki: 1 }, 'vorki')).toBe('vorki');
  });

  it('drops one it does not, and anything that is not a pet id', () => {
    expect(validActivePet({ vorki: 1 }, 'noon')).toBeNull();
    expect(validActivePet({ vorki: 1 }, 'goblin')).toBeNull();
    expect(validActivePet({ vorki: 1 }, null)).toBeNull();
    expect(validActivePet({ vorki: 0 }, 'vorki')).toBeNull();
  });
});

describe('sanitizePets', () => {
  it('keeps known ids with positive whole counts', () => {
    expect(sanitizePets({ vorki: 2, scurry: 1.7 })).toEqual({ vorki: 2, scurry: 1 });
  });

  it('drops unknown ids, bad counts and non-objects', () => {
    expect(sanitizePets({ goblin: 4, vorki: 0, noon: 'x' })).toEqual({});
    expect(sanitizePets(null)).toEqual({});
    expect(sanitizePets([1, 2])).toEqual({});
    expect(sanitizePets('vorki')).toEqual({});
  });
});
