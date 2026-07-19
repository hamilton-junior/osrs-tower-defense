import { describe, it, expect } from 'vitest';
import {
  rollAffixes,
  rollBossAffixes,
  eliteChanceForWave,
  extraAffixChance,
  rollArmoredStyle,
  affixSpeedMult,
  affixSpawnHpMult,
  affixRenderScaleMult,
  shieldHpFor,
  regenPerSec,
  regenFracForWave,
  bossRegenWaveMult,
  BOSS_REGEN_MIN_MULT,
  BOSS_REGEN_DECAY_PER_WAVE,
  leakLifeCost,
  bossLeakCost,
  BOSS_LEAK_BASE,
  BOSS_LEAK_MAX,
  isCcImmune,
  styleDamageMult,
  absorbWithShield,
  ALL_AFFIXES,
  AFFIX_DEFS,
  AFFIX_UNLOCK_WAVE,
  ELITE_CHANCE_STEP,
  ELITE_CHANCE_CAP,
  EXTRA_AFFIX_MAX,
  EXTRA_AFFIX_RAMP_WAVES,
  EXTRA_AFFIX_UNLOCK_WAVE,
  MAX_AFFIXES,
  BANNED_PAIRS,
  BOSS_AFFIX_POOL,
  BOSS_AFFIX_CHANCE,
  SHIELD_HP_FRAC,
  ARMORED_RESIST,
  REGEN_UNLOCK_WAVE,
  REGEN_FRAC_MIN,
  REGEN_FRAC_MAX,
  REGEN_RAMP_END_WAVE,
  HASTE_SPEED_MULT,
  COLOSSAL_HP_MULT,
  COLOSSAL_SPEED_MULT,
  SWARM_HP_MULT,
  protectedDamageMult,
  PROTECTED_MULT,
  DORMANT_AFFIXES,
} from './affixes';

/** A deterministic RNG that yields the given sequence, then 0 forever. */
const seq = (...values: number[]) => {
  let i = 0;
  return () => (i < values.length ? values[i++] : 0);
};

describe('eliteChanceForWave', () => {
  it('is 0 before the unlock wave', () => {
    expect(eliteChanceForWave(AFFIX_UNLOCK_WAVE - 1)).toBe(0);
    expect(eliteChanceForWave(1)).toBe(0);
  });
  it('starts at one step on the unlock wave and ramps', () => {
    expect(eliteChanceForWave(AFFIX_UNLOCK_WAVE)).toBeCloseTo(ELITE_CHANCE_STEP);
    expect(eliteChanceForWave(AFFIX_UNLOCK_WAVE + 2)).toBeCloseTo(3 * ELITE_CHANCE_STEP);
  });
  it('caps at the ceiling', () => {
    expect(eliteChanceForWave(999)).toBe(ELITE_CHANCE_CAP);
  });
});

describe('rollAffixes', () => {
  it('never affixes a boss', () => {
    expect(rollAffixes(50, true, () => 0).affixes).toEqual([]);
  });
  it('returns nothing before the unlock wave', () => {
    expect(rollAffixes(AFFIX_UNLOCK_WAVE - 1, false, () => 0).affixes).toEqual([]);
  });
  it('returns nothing when the elite roll fails', () => {
    // chance on the unlock wave is small; an rng >= chance fails the gate.
    expect(rollAffixes(AFFIX_UNLOCK_WAVE, false, () => 0.99).affixes).toEqual([]);
  });
  it('rolls a single affix when the gate passes', () => {
    // first rng() = 0 passes the elite gate; second picks index 0 of the pool.
    const roll = rollAffixes(AFFIX_UNLOCK_WAVE, false, seq(0, 0));
    expect(roll.affixes).toHaveLength(1);
    expect(ALL_AFFIXES).toContain(roll.affixes[0]);
  });
  it('grants exactly one affix before the extra unlock wave even with all-pass rolls', () => {
    // extraAffixChance is 0 before wave 30, so no extra can stack — the
    // player is guaranteed at most one affix per enemy until wave 30.
    const roll = rollAffixes(EXTRA_AFFIX_UNLOCK_WAVE - 1, false, seq(0, 0, 0, 0, 0, 0));
    expect(roll.affixes).toHaveLength(1);
  });
  it('stacks extra affixes deep in the run when the extra rolls pass', () => {
    // Full-ramp wave after extra unlock: gate(0), pick1(0), extra1(0<0.5 ✓), pick2(0), extra2(0.9 ✗ stop).
    const wave = EXTRA_AFFIX_UNLOCK_WAVE + EXTRA_AFFIX_RAMP_WAVES;
    const roll = rollAffixes(wave, false, seq(0, 0, 0, 0, 0.9));
    expect(roll.affixes).toHaveLength(2);
    expect(roll.affixes[0]).not.toBe(roll.affixes[1]); // distinct (drawn without replacement)
  });
  it('enforces the hard cap of MAX_AFFIXES even with every extra roll passing', () => {
    const wave = EXTRA_AFFIX_UNLOCK_WAVE + EXTRA_AFFIX_RAMP_WAVES;
    const roll = rollAffixes(wave, false, () => 0); // every roll passes
    expect(roll.affixes.length).toBe(MAX_AFFIXES); // stops exactly at the cap, not the pool size
  });
  it('attaches an armoredStyle whenever armored is rolled', () => {
    // Force index of "armored" within the pool for the pick; stop after one.
    const armoredIdx = ALL_AFFIXES.indexOf('armored');
    const pickFrac = (armoredIdx + 0.5) / ALL_AFFIXES.length;
    const roll = rollAffixes(AFFIX_UNLOCK_WAVE, false, seq(0, pickFrac, 0));
    expect(roll.affixes).toEqual(['armored']);
    expect(roll.armoredStyle).toBeDefined();
  });
});

describe('extraAffixChance', () => {
  it('is 0 before the extra unlock wave', () => {
    expect(extraAffixChance(EXTRA_AFFIX_UNLOCK_WAVE - 1, 1)).toBe(0);
  });
  it('is 0 on the extra unlock wave (guaranteed single before ramp)', () => {
    expect(extraAffixChance(EXTRA_AFFIX_UNLOCK_WAVE, 1)).toBeCloseTo(0);
  });
  it('ramps to the max for the first extra at full ramp', () => {
    expect(extraAffixChance(EXTRA_AFFIX_UNLOCK_WAVE + EXTRA_AFFIX_RAMP_WAVES, 1)).toBeCloseTo(EXTRA_AFFIX_MAX);
  });
  it('decays for each affix already granted (up to the cap)', () => {
    const wave = EXTRA_AFFIX_UNLOCK_WAVE + EXTRA_AFFIX_RAMP_WAVES;
    expect(extraAffixChance(wave, 1)).toBeCloseTo(EXTRA_AFFIX_MAX); // no decay on first extra
    expect(extraAffixChance(wave, 2)).toBe(0); // at cap, no more allowed
  });
  it('is 0 once MAX_AFFIXES is already granted', () => {
    expect(extraAffixChance(999, MAX_AFFIXES)).toBe(0);
    expect(extraAffixChance(999, MAX_AFFIXES + 1)).toBe(0);
  });
  it('never exceeds the ramp ceiling past full ramp', () => {
    expect(extraAffixChance(999, 1)).toBeCloseTo(EXTRA_AFFIX_MAX);
  });
});

describe('rollBossAffixes', () => {
  it('returns nothing when the boss roll fails', () => {
    expect(rollBossAffixes(() => 0.99, 50).affixes).toEqual([]);
  });
  it('grants one boss-pool affix when the roll passes', () => {
    // gate(0 < CHANCE ✓), pick(0), extra(0.99 ✗ stop)
    const roll = rollBossAffixes(seq(0, 0, 0.99), 50);
    expect(roll.affixes).toHaveLength(1);
    expect(BOSS_AFFIX_POOL).toContain(roll.affixes[0]);
  });
  it('only ever draws from the boss pool (no swarm/colossal/volatile)', () => {
    const roll = rollBossAffixes(() => 0, 50); // every roll passes → drains boss pool
    for (const a of roll.affixes) expect(BOSS_AFFIX_POOL).toContain(a);
    expect(roll.affixes).not.toContain('swarm');
    expect(roll.affixes).not.toContain('colossal');
    expect(roll.affixes).not.toContain('volatile');
  });
  it('uses BOSS_AFFIX_CHANCE as the gate', () => {
    // Just below the gate passes; at/above fails.
    expect(rollBossAffixes(() => BOSS_AFFIX_CHANCE - 0.001, 50).affixes.length).toBeGreaterThan(0);
    expect(rollBossAffixes(() => BOSS_AFFIX_CHANCE, 50).affixes).toEqual([]);
  });
});

describe('rollArmoredStyle', () => {
  it('returns one of the three combat styles', () => {
    expect(['ranged', 'magic', 'melee']).toContain(rollArmoredStyle(() => 0));
    expect(['ranged', 'magic', 'melee']).toContain(rollArmoredStyle(() => 0.99));
  });
});

describe('stat helpers', () => {
  it('affixSpeedMult compounds hasted and colossal', () => {
    expect(affixSpeedMult([])).toBe(1);
    expect(affixSpeedMult(['hasted'])).toBeCloseTo(HASTE_SPEED_MULT);
    expect(affixSpeedMult(['colossal'])).toBeCloseTo(COLOSSAL_SPEED_MULT);
    expect(affixSpeedMult(['hasted', 'colossal'])).toBeCloseTo(HASTE_SPEED_MULT * COLOSSAL_SPEED_MULT);
  });
  it('affixSpawnHpMult compounds swarm and colossal', () => {
    expect(affixSpawnHpMult([])).toBe(1);
    expect(affixSpawnHpMult(['swarm'])).toBeCloseTo(SWARM_HP_MULT);
    expect(affixSpawnHpMult(['colossal'])).toBeCloseTo(COLOSSAL_HP_MULT);
  });
  it('affixRenderScaleMult only grows colossals', () => {
    expect(affixRenderScaleMult([])).toBe(1);
    expect(affixRenderScaleMult(['colossal'])).toBeGreaterThan(1);
  });
  it('shieldHpFor scales with max HP only when shielded', () => {
    expect(shieldHpFor([], 100)).toBe(0);
    expect(shieldHpFor(['shielded'], 100)).toBe(Math.round(100 * SHIELD_HP_FRAC));
  });
  it('regenPerSec scales with max HP only when regenerating', () => {
    expect(regenPerSec([], 100, REGEN_RAMP_END_WAVE)).toBe(0);
    expect(regenPerSec(['regenerating'], 100, REGEN_RAMP_END_WAVE)).toBeCloseTo(100 * REGEN_FRAC_MAX);
  });
  it('leakLifeCost is 2 for colossal, 1 otherwise', () => {
    expect(leakLifeCost([])).toBe(1);
    expect(leakLifeCost(['hasted'])).toBe(1);
    expect(leakLifeCost(['colossal'])).toBe(2);
  });
  it('bossLeakCost is base + prior sightings, capped at the max', () => {
    expect(bossLeakCost(0)).toBe(BOSS_LEAK_BASE); // first encounter: just the base
    expect(bossLeakCost(1)).toBe(BOSS_LEAK_BASE + 1);
    expect(bossLeakCost(5)).toBe(BOSS_LEAK_MAX);
    expect(bossLeakCost(99)).toBe(BOSS_LEAK_MAX); // never exceeds the cap
    expect(bossLeakCost(-3)).toBe(BOSS_LEAK_BASE); // negatives floor to base
  });
  it('isCcImmune only for warded', () => {
    expect(isCcImmune([])).toBe(false);
    expect(isCcImmune(['warded'])).toBe(true);
  });
  it('styleDamageMult halves only the matching armored style', () => {
    expect(styleDamageMult('ranged', 'ranged')).toBe(ARMORED_RESIST);
    expect(styleDamageMult('ranged', 'magic')).toBe(1);
    expect(styleDamageMult(undefined, 'magic')).toBe(1);
    expect(styleDamageMult('melee', undefined)).toBe(1);
  });
});

describe('absorbWithShield', () => {
  it('passes damage straight through when there is no shield', () => {
    expect(absorbWithShield(0, 30)).toEqual({ shield: 0, dmg: 30 });
  });
  it('absorbs fully when the shield outlasts the hit', () => {
    expect(absorbWithShield(50, 20)).toEqual({ shield: 30, dmg: 0 });
  });
  it('spills the remainder once the shield breaks', () => {
    expect(absorbWithShield(15, 20)).toEqual({ shield: 0, dmg: 5 });
  });
});

describe('affix stacking cap + banned pairs', () => {
  it('is a hard max-1 before the extra unlock wave', () => {
    for (let w = AFFIX_UNLOCK_WAVE; w < EXTRA_AFFIX_UNLOCK_WAVE; w++) {
      expect(extraAffixChance(w, 1)).toBe(0);
    }
    for (let i = 0; i < 300; i++) {
      const roll = rollAffixes(EXTRA_AFFIX_UNLOCK_WAVE - 1, false, seq(0, i / 300, 0, 0, 0));
      expect(roll.affixes.length).toBeLessThanOrEqual(1);
    }
  });
  it('re-anchors the ramp at the unlock wave (no cliff)', () => {
    expect(extraAffixChance(EXTRA_AFFIX_UNLOCK_WAVE, 1)).toBeCloseTo(0);
    expect(extraAffixChance(EXTRA_AFFIX_UNLOCK_WAVE + EXTRA_AFFIX_RAMP_WAVES, 1)).toBeCloseTo(EXTRA_AFFIX_MAX);
  });
  it('never exceeds MAX_AFFIXES even with an always-yes rng', () => {
    for (let i = 0; i < 300; i++) {
      const roll = rollAffixes(200, false, seq(0, i / 300, 0, 0, 0, 0, 0));
      expect(roll.affixes.length).toBeLessThanOrEqual(MAX_AFFIXES);
    }
  });
  it('banned pairs never co-occur, in either draw order', () => {
    for (let i = 0; i < 500; i++) {
      const affixes = rollAffixes(200, false, seq(0, i / 500, i % 100 / 100, 0)).affixes;
      for (const [a, b] of BANNED_PAIRS) {
        expect(affixes.includes(a) && affixes.includes(b)).toBe(false);
      }
    }
  });
  it('boss rolls respect the bans and the cap', () => {
    for (let i = 0; i < 500; i++) {
      const affixes = rollBossAffixes(seq(0, i / 500, 0, 0, 0), 200).affixes;
      expect(affixes.length).toBeLessThanOrEqual(MAX_AFFIXES);
      for (const [a, b] of BANNED_PAIRS) {
        expect(affixes.includes(a) && affixes.includes(b)).toBe(false);
      }
    }
  });
});

describe('regenerating gating + ramp', () => {
  it('never rolls regenerating before its unlock wave', () => {
    for (let i = 0; i < 200; i++) {
      const roll = rollAffixes(REGEN_UNLOCK_WAVE - 1, false, seq(0, i / 200, 0.99));
      expect(roll.affixes).not.toContain('regenerating');
    }
  });
  it('can roll regenerating from its unlock wave', () => {
    const all: string[] = [];
    for (let i = 0; i < 200; i++) all.push(...rollAffixes(60, false, seq(0, i / 200, 0.99)).affixes);
    expect(all).toContain('regenerating');
  });
  it('ramps 1%/s at wave 12 to 2%/s at wave 30+, linearly', () => {
    expect(regenFracForWave(REGEN_UNLOCK_WAVE)).toBeCloseTo(REGEN_FRAC_MIN);
    expect(regenFracForWave(21)).toBeCloseTo((REGEN_FRAC_MIN + REGEN_FRAC_MAX) / 2);
    expect(regenFracForWave(30)).toBeCloseTo(REGEN_FRAC_MAX);
    expect(regenFracForWave(99)).toBeCloseTo(REGEN_FRAC_MAX);
  });
  it('regenPerSec applies the wave-scaled frac', () => {
    expect(regenPerSec(['regenerating'], 1000, REGEN_UNLOCK_WAVE)).toBeCloseTo(10);
    expect(regenPerSec(['regenerating'], 1000, 30)).toBeCloseTo(20);
    expect(regenPerSec(['hasted'], 1000, 30)).toBe(0);
  });
  // Players reported Regenerating bosses as unkillable walls late on: the affix ramps
  // up by wave while the boss's own HP pool grows, so the two compounded.
  it('bossRegenWaveMult sheds 1% per wave and never falls past half', () => {
    expect(bossRegenWaveMult(0)).toBeCloseTo(1);
    expect(bossRegenWaveMult(20)).toBeCloseTo(0.8);
    expect(bossRegenWaveMult(BOSS_REGEN_MIN_MULT / BOSS_REGEN_DECAY_PER_WAVE)).toBeCloseTo(BOSS_REGEN_MIN_MULT);
    expect(bossRegenWaveMult(500)).toBe(BOSS_REGEN_MIN_MULT);
  });
  it('regenPerSec decays for a boss but not for a normal enemy', () => {
    for (const wave of [12, 30, 60, 120]) {
      const normal = regenPerSec(['regenerating'], 1000, wave);
      expect(regenPerSec(['regenerating'], 1000, wave, true)).toBeCloseTo(normal * bossRegenWaveMult(wave));
      expect(regenPerSec(['regenerating'], 1000, wave, true)).toBeLessThan(normal);
    }
    // A boss deep in a run keeps exactly half, however far the run goes.
    expect(regenPerSec(['regenerating'], 1000, 300, true)).toBeCloseTo(1000 * REGEN_FRAC_MAX * BOSS_REGEN_MIN_MULT);
  });
  it('boss rolls also exclude regenerating before the unlock wave', () => {
    for (let i = 0; i < 200; i++) {
      expect(rollBossAffixes(seq(0, i / 200, 0.99), REGEN_UNLOCK_WAVE - 1).affixes).not.toContain('regenerating');
    }
  });
});

describe('AFFIX_DEFS', () => {
  it('has a complete def for every affix', () => {
    for (const a of ALL_AFFIXES) {
      const def = AFFIX_DEFS[a];
      expect(def.id).toBe(a);
      expect(def.name).toBeTruthy();
      expect(def.desc).toBeTruthy();
      expect(def.color).toMatch(/^#/);
      expect(def.icon).toMatch(/^(https?:\/\/|\/|\.\/)?\S+\.png$/); // baked local asset (or wiki fallback)
    }
  });

  it('defines the dormant affixes too (they exist, just never roll)', () => {
    for (const a of DORMANT_AFFIXES) {
      expect(AFFIX_DEFS[a]).toBeDefined();
      expect(AFFIX_DEFS[a].name).toBeTruthy();
    }
  });
});

describe('the protected affix (prayer)', () => {
  it('all but negates its prayed-against style, and leaves the others alone', () => {
    expect(protectedDamageMult('magic', 'magic')).toBe(PROTECTED_MULT);
    expect(protectedDamageMult('magic', 'ranged')).toBe(1);
    expect(protectedDamageMult('magic', 'melee')).toBe(1);
  });

  it('never touches a styleless hit (a DoT tick prays through nothing)', () => {
    expect(protectedDamageMult('magic', undefined)).toBe(1);
    expect(protectedDamageMult(undefined, 'magic')).toBe(1);
  });

  it('is dormant — never handed out by a random roll (normal or boss)', () => {
    // It exists as a def but is excluded from the rollable pool, so no amount of
    // rolling can produce it — it is reserved for monsters that declare it innately.
    expect(DORMANT_AFFIXES).toContain('protected');
    expect(ALL_AFFIXES).not.toContain('protected');
    expect(BOSS_AFFIX_POOL).not.toContain('protected');
    const always = () => 0; // rolls under every chance, at wave 999
    for (let i = 0; i < 200; i++) {
      expect(rollAffixes(999, false, always).affixes).not.toContain('protected');
      expect(rollBossAffixes(always, 999).affixes).not.toContain('protected');
    }
  });

  it('is banned alongside armored — the two style-cuts never stack', () => {
    const banned = BANNED_PAIRS.some(
      ([a, b]) => (a === 'protected' && b === 'armored') || (a === 'armored' && b === 'protected'),
    );
    expect(banned).toBe(true);
  });
});
