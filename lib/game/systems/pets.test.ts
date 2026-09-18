import { describe, it, expect } from 'vitest';
import { PETS, PET_BY_BOSS, PET_BY_ID, PET_BY_SOURCE, PET_SOURCE_LABEL, type PetSource } from '../data/pets';
import { PET_LUCK_PER_TIER, petDropChance, petProgress, rollPetDrop, rollSkillPet, sanitizePets, validActivePet } from './pets';
import { ENEMIES } from '../data/enemies';

describe('pet data', () => {
  it('only drops from bosses that exist', () => {
    for (const pet of PETS) {
      for (const boss of pet.from) {
        expect(ENEMIES[boss], `${pet.id} drops from ${boss}`).toBeTruthy();
        expect(ENEMIES[boss].isBoss, `${boss} is a boss`).toBe(true);
      }
    }
  });

  // Every pet is reachable, and reachable exactly one way: a boss list or a
  // skilling source. A pet with neither can never drop; one with both would be
  // two chases wearing one name.
  it('gives every pet exactly one kind of source', () => {
    for (const pet of PETS) {
      const bosses = pet.from.length > 0;
      expect(bosses !== (pet.source !== undefined), `${pet.id} has one source kind`).toBe(true);
    }
  });

  it('gives each skilling action at most one pet, and names its rate', () => {
    const seen = new Set<PetSource>();
    for (const pet of PETS) {
      if (!pet.source) continue;
      expect(seen.has(pet.source), `${pet.source} listed twice`).toBe(false);
      seen.add(pet.source);
      expect(PET_SOURCE_LABEL[pet.source]).toBeTruthy();
    }
    expect(Object.keys(PET_BY_SOURCE).length).toBe(seen.size);
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

describe('rollSkillPet', () => {
  it('drops on a roll under the chance and not on one over it', () => {
    const rate = PET_BY_ID[PET_BY_SOURCE.fishing!].rate;
    expect(rollSkillPet('fishing', 0, () => 1 / rate - 1e-9)).toBe('heron');
    expect(rollSkillPet('fishing', 0, () => 1 / rate + 1e-9)).toBeNull();
  });

  // Hunter's two traps are two chases, not one: a box trap can never hand back
  // the chinchompa's pet, however lucky the roll.
  it('keeps the two Hunter sources apart', () => {
    expect(rollSkillPet('hunter_trap', 0, () => 0)).toBe('herbi');
    expect(rollSkillPet('hunter_chin', 0, () => 0)).toBe('baby_chinchompa');
    expect(rollSkillPet('farming', 0, () => 0)).toBe('tangleroot');
  });

  it('takes the same difficulty luck as a boss pet', () => {
    const rate = PET_BY_ID[PET_BY_SOURCE.farming!].rate;
    const boosted = (1 + PET_LUCK_PER_TIER * 6) / rate;
    expect(rollSkillPet('farming', 6, () => boosted - 1e-12)).toBe('tangleroot');
    expect(rollSkillPet('farming', 0, () => boosted - 1e-12)).toBeNull();
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
