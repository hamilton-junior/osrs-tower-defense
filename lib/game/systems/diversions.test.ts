import { describe, it, expect } from 'vitest';
import {
  DIVERSION_MOOD_PRIORITY,
  diversionEssence,
  diversionGold,
  diversionLine,
  pickDiversionDef,
  pickDiversionSpot,
  resolvePayload,
  rollDiversionMoods,
  rollNestPayload,
} from './diversions';
import { DIVERSIONS, DIVERSION_BY_ID, DIVERSION_CHANCE, MAX_DIVERSIONS } from '../data/diversions';
import { waveClearBonus } from './rewards';
import { essenceForWave } from './meta-progression';

/** A rand that hands out a fixed script, then repeats its last value — so a test only
 *  has to spell out the rolls it actually cares about. */
function scripted(...values: number[]) {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)];
}

describe('rollDiversionMoods', () => {
  it('rolls each mood independently and caps what stands on the board', () => {
    const moods = rollDiversionMoods(scripted(0, 0, 0), [], false);
    expect(moods).toHaveLength(MAX_DIVERSIONS);
    // Rarest first when the cap bites: a walkby must never crowd out an event.
    expect(moods).toEqual(['event', 'nest']);
  });

  it('spawns nothing when every roll misses', () => {
    expect(rollDiversionMoods(scripted(0.99, 0.99, 0.99), [], false)).toEqual([]);
  });

  it('bars events before a boss but still lets the world walk past', () => {
    const moods = rollDiversionMoods(scripted(0, 0.99, 0), [], true);
    expect(moods).toEqual(['walkby']);
  });

  it('consumes a roll for a blocked mood so the others keep their own luck', () => {
    // Event is blocked and eats the 0.01; nest gets the 0.99 and misses. If the
    // blocked mood skipped its roll, the nest would have taken the 0.01 and spawned.
    expect(rollDiversionMoods(scripted(0.01, 0.99, 0.99), [], true)).toEqual([]);
  });

  it('never doubles up a mood already standing there', () => {
    expect(rollDiversionMoods(scripted(0, 0, 0), ['event'], false)).toEqual(['nest']);
    expect(rollDiversionMoods(scripted(0, 0, 0), ['event', 'nest'], false)).toEqual([]);
  });

  it('respects the board cap even when the present list is full', () => {
    expect(rollDiversionMoods(scripted(0, 0, 0), ['walkby', 'nest'], false)).toEqual([]);
  });

  it('prices every mood', () => {
    for (const mood of DIVERSION_MOOD_PRIORITY) {
      expect(DIVERSION_CHANCE[mood]).toBeGreaterThan(0);
      expect(DIVERSION_CHANCE[mood]).toBeLessThan(1);
    }
  });
});

describe('pickDiversionDef', () => {
  it('only ever returns a member of the mood asked for', () => {
    for (const mood of DIVERSION_MOOD_PRIORITY) {
      for (const r of [0, 0.25, 0.5, 0.75, 0.999999]) {
        expect(pickDiversionDef(mood, () => r).mood).toBe(mood);
      }
    }
  });

  it('cannot run off the end of the pool on a rand that returns 1', () => {
    expect(pickDiversionDef('event', () => 1)).toBeDefined();
  });
});

describe('pickDiversionSpot', () => {
  const GRID = 32;

  it('lands on the centre of a tile the engine says is free', () => {
    const spot = pickDiversionSpot(scripted(0.5, 0.5), () => true, 45, 20, GRID);
    expect(spot).not.toBeNull();
    expect((spot!.x - GRID / 2) % GRID).toBe(0);
    expect((spot!.y - GRID / 2) % GRID).toBe(0);
  });

  it('stays clear of the board edge', () => {
    for (let i = 0; i < 200; i++) {
      const spot = pickDiversionSpot(Math.random, () => true, 45, 20, GRID)!;
      expect(spot.x).toBeGreaterThan(GRID);
      expect(spot.y).toBeGreaterThan(GRID);
      expect(spot.x).toBeLessThan(45 * GRID - GRID);
      expect(spot.y).toBeLessThan(20 * GRID - GRID);
    }
  });

  it('gives up rather than standing on something when the board is full', () => {
    expect(pickDiversionSpot(Math.random, () => false, 45, 20, GRID)).toBeNull();
  });

  it('keeps looking past a blocked tile', () => {
    let calls = 0;
    const isFree = () => ++calls >= 4; // the first three rolls land on the road
    const spot = pickDiversionSpot(Math.random, isFree, 45, 20, GRID);
    expect(spot).not.toBeNull();
    expect(calls).toBe(4);
  });

  it('refuses a board too small to have a middle', () => {
    expect(pickDiversionSpot(Math.random, () => true, 3, 3, GRID)).toBeNull();
  });
});

describe('diversionLine', () => {
  it('hands the Lumbridge Guide the read on the coming wave', () => {
    const guide = DIVERSION_BY_ID.lumbridge_guide;
    expect(diversionLine(guide, () => 0, 'General Graardor is next. Bring range.'))
      .toBe('General Graardor is next. Bring range.');
  });

  it('falls back to his own small talk when there is no hint', () => {
    const guide = DIVERSION_BY_ID.lumbridge_guide;
    expect(guide.lines).toContain(diversionLine(guide, () => 0));
  });

  it('never lets a hint put words in anyone else\'s mouth', () => {
    const hans = DIVERSION_BY_ID.hans;
    expect(hans.lines).toContain(diversionLine(hans, () => 0.5, 'a boss is next'));
  });

  it('cannot run off the end of a line list', () => {
    for (const def of DIVERSIONS) expect(def.lines).toContain(diversionLine(def, () => 1));
  });
});

describe('payouts', () => {
  it('pays a fraction of a wave clear, never more', () => {
    for (const wave of [1, 10, 25, 60]) {
      expect(diversionGold(wave, 0)).toBeLessThan(waveClearBonus(wave));
    }
  });

  it('pays more when there were more towers to see him off', () => {
    expect(diversionGold(20, 8)).toBeGreaterThan(diversionGold(20, 0));
  });

  it('stops counting towers past ten, so a full board is not a gold faucet', () => {
    expect(diversionGold(20, 40)).toBe(diversionGold(20, 10));
  });

  it('is always worth picking up, even on wave 1', () => {
    expect(diversionGold(1, 0)).toBeGreaterThanOrEqual(20);
  });

  it('grows with the wave', () => {
    expect(diversionGold(30, 0)).toBeGreaterThan(diversionGold(5, 0));
  });

  it('sizes a lamp against the wave essence and honours the mode faucet', () => {
    expect(diversionEssence(20, 1)).toBe(Math.round(essenceForWave(20) * 2.5));
    expect(diversionEssence(20, 0.5)).toBeLessThan(diversionEssence(20, 1));
    // Endless pays a tenth — the lamp goes through the same faucet, not around it.
    expect(diversionEssence(60, 0.1)).toBeLessThan(diversionEssence(60, 1));
  });

  it('never hands out an empty lamp', () => {
    expect(diversionEssence(1, 0.1)).toBeGreaterThanOrEqual(3);
  });
});

describe('nests', () => {
  it('holds gold most of the time and a potion rarely', () => {
    expect(rollNestPayload(() => 0)).toBe('gold');
    expect(rollNestPayload(() => 0.54)).toBe('gold');
    expect(rollNestPayload(() => 0.55)).toBe('essence');
    expect(rollNestPayload(() => 0.84)).toBe('essence');
    expect(rollNestPayload(() => 0.85)).toBe('potion');
    expect(rollNestPayload(() => 0.999999)).toBe('potion');
  });

  it('resolves the nest to something real and leaves the rest alone', () => {
    expect(resolvePayload('bird_nest', () => 0)).toBe('gold');
    expect(resolvePayload('bird_nest', () => 0.9)).toBe('potion');
    expect(resolvePayload('genie', () => 0.9)).toBe('essence');
    expect(resolvePayload('hans', () => 0.9)).toBe('none');
  });
});

describe('the cast', () => {
  it('has a unique id per member', () => {
    expect(new Set(DIVERSIONS.map(d => d.id)).size).toBe(DIVERSIONS.length);
  });

  it('fills every mood, so no roll can come up empty-handed', () => {
    for (const mood of DIVERSION_MOOD_PRIORITY) {
      expect(DIVERSIONS.filter(d => d.mood === mood).length).toBeGreaterThan(0);
    }
  });

  it('gives everyone something to say and something to read', () => {
    for (const def of DIVERSIONS) {
      expect(def.lines.length).toBeGreaterThan(0);
      expect(def.name.length).toBeGreaterThan(0);
      expect(def.tip.length).toBeGreaterThan(0);
    }
  });

  it('keeps walkbys free of rewards — they are scenery with dialogue', () => {
    for (const def of DIVERSIONS) {
      if (def.mood === 'walkby') expect(def.payload).toBe('none');
      else expect(def.payload).not.toBe('none');
    }
  });

  it('draws every sprite from a local OSRS bake', () => {
    for (const def of DIVERSIONS) {
      expect(def.sprite).toMatch(/\/assets\/(models|items)\/[a-z0-9_]+\.png$/);
      expect(def.sprite).not.toMatch(/^https?:/);
    }
  });
});
