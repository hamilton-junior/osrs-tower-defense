import { describe, it, expect } from 'vitest';
import {
  DIVERSION_MOOD_PRIORITY,
  DIVERSION_WALK_SPEED,
  diversionEssence,
  diversionGold,
  diversionLine,
  offBoardPoint,
  pickDiversionDef,
  pickDiversionSpot,
  resolvePayload,
  rollDiversionMoods,
  eventChance,
  sanitizeDiversionsMet,
  sanitizeDiversionGains,
  diversionGainKey,
  diversionRewardOptions,
  payloadReward,
  rollNestPayload,
  NEST_PAYLOADS,
  sendDiversionOff,
  stepDiversion,
  turnDiversion,
  nearestDiversionSpot,
  mostWornTrap,
  formatPlayTime,
  runFactLines,
  hansLine,
  balloonCount,
  pickBalloonSpots,
  rollBalloonGift,
  balloonReward,
  BALLOON_GOLD_SHARE,
  BALLOON_ESSENCE_SHARE,
  lampXp,
  lampLevelTo,
  drillXp,
  rollPlantGift,
  rollJekyllHerb,
  rollDiversionGift,
  plantGiftText,
  diversionGiftText,
  rewardImageKey,
  PLANT_OVERLOAD_CHANCE,
  GIFT_HERB_MIN_LEVEL,
  type Diversion,
  type RunFacts,
} from './diversions';
import {
  DIVERSIONS, DIVERSION_BY_ID, DIVERSION_CHANCE, DRILL_LEVELS, EVENT_CHANCE_CAP, EVENT_CHANCE_STEP, LAMP_LEVELS,
  MAX_DIVERSIONS, rewardLook,
} from '../data/diversions';
import { HUNTER_MAX_LEVEL, gainHunterXp, hunterXpForLevel } from './hunter-traps';
import { gainFishingXp, fishingXpForLevel } from './fishing';
import { FISHING_MAX_LEVEL } from '../data/fishing';
import { SEEDS, SEED_BY_ID } from '../data/farming';
import { waveClearBonus } from './rewards';
import { essenceForWave } from './meta-progression';
import { towerXpForLevel } from './leveling';
import { MAX_TOWER_LEVEL, trainSkill } from './tower-xp';

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

  it('lets a dry spell turn a missed event roll into a hit', () => {
    const roll = DIVERSION_CHANCE.event + EVENT_CHANCE_STEP * 2.5;
    expect(rollDiversionMoods(scripted(roll, 0.99, 0.99), [], false, 2)).toEqual([]);
    expect(rollDiversionMoods(scripted(roll, 0.99, 0.99), [], false, 3)).toEqual(['event']);
  });

  it('still bars an overdue event before a boss', () => {
    expect(rollDiversionMoods(scripted(0, 0.99, 0.99), [], true, 50)).toEqual([]);
  });
});

describe('eventChance', () => {
  it('starts at the base chance and rises a step per wave without an event', () => {
    expect(eventChance(0)).toBe(DIVERSION_CHANCE.event);
    expect(eventChance(4)).toBeCloseTo(DIVERSION_CHANCE.event + 4 * EVENT_CHANCE_STEP);
  });

  it('stops at the cap', () => {
    expect(eventChance(1000)).toBe(EVENT_CHANCE_CAP);
    expect(EVENT_CHANCE_CAP).toBeGreaterThan(DIVERSION_CHANCE.event);
    expect(EVENT_CHANCE_CAP).toBeLessThan(1);
  });

  it('reads a bad count as no dry spell at all', () => {
    expect(eventChance(-3)).toBe(DIVERSION_CHANCE.event);
    expect(eventChance(Number.NaN)).toBe(DIVERSION_CHANCE.event);
  });
});

describe('pickDiversionDef', () => {
  it('only ever returns a member of the mood asked for', () => {
    for (const mood of DIVERSION_MOOD_PRIORITY) {
      for (const r of [0, 0.25, 0.5, 0.75, 0.999999]) {
        expect(pickDiversionDef(mood, () => r)!.mood).toBe(mood);
      }
    }
  });

  it('cannot run off the end of the pool on a rand that returns 1', () => {
    expect(pickDiversionDef('event', () => 1)).toBeDefined();
  });

  it('leaves out whoever has nothing to do, so the rest share the visit', () => {
    for (const r of [0, 0.3, 0.6, 0.999]) {
      expect(pickDiversionDef('walkby', () => r, d => d.id !== 'hunting_expert')!.id).not.toBe('hunting_expert');
    }
  });

  it('comes back empty when nobody in the mood is eligible', () => {
    expect(pickDiversionDef('walkby', () => 0, () => false)).toBeNull();
  });
});

describe('nearestDiversionSpot', () => {
  const GRID = 32;
  const centre = (col: number, row: number) => ({ x: col * GRID + GRID / 2, y: row * GRID + GRID / 2 });

  it('stands beside the point, never on it', () => {
    const p = centre(10, 10);
    const spot = nearestDiversionSpot(p.x, p.y, () => true, 45, 20, GRID)!;
    expect(spot).not.toEqual(p);
    expect(Math.hypot(spot.x - p.x, spot.y - p.y)).toBe(GRID);
  });

  it('skips blocked tiles for the next nearest free one', () => {
    const p = centre(10, 10);
    const isFree = (x: number, y: number) => Math.abs(x - p.x) >= 2 * GRID || Math.abs(y - p.y) >= 2 * GRID;
    const spot = nearestDiversionSpot(p.x, p.y, isFree, 45, 20, GRID)!;
    expect(Math.hypot(spot.x - p.x, spot.y - p.y)).toBe(2 * GRID);
  });

  it('keeps off the border tiles and gives up past its reach', () => {
    const p = centre(1, 1);
    const spot = nearestDiversionSpot(p.x, p.y, () => true, 45, 20, GRID)!;
    expect(spot.x).toBeGreaterThan(2 * GRID);
    expect(spot.y).toBeGreaterThan(2 * GRID);
    expect(nearestDiversionSpot(p.x, p.y, () => false, 45, 20, GRID)).toBeNull();
  });
});

describe('mostWornTrap', () => {
  it('picks the lowest share of charges left', () => {
    expect(mostWornTrap([
      { id: 'a', charges: 3, max: 4 },
      { id: 'b', charges: 2, max: 6 },
      { id: 'c', charges: 1, max: 2 },
    ])).toBe('b');
  });

  it('breaks a tie on fewer charges left', () => {
    expect(mostWornTrap([
      { id: 'a', charges: 2, max: 4 },
      { id: 'b', charges: 1, max: 2 },
    ])).toBe('b');
  });

  it('ignores fresh traps and has nothing to say without a worn one', () => {
    expect(mostWornTrap([{ id: 'a', charges: 4, max: 4 }])).toBeNull();
    expect(mostWornTrap([])).toBeNull();
  });
});

describe("Hans's run facts", () => {
  const facts = (over: Partial<RunFacts> = {}): RunFacts => ({
    seconds: 0, kills: 0, livesLost: 0, cleanStreak: 0, goldEarned: 0, topTower: null, ...over,
  });

  it('formats play time as m:ss, and h:mm:ss past the hour', () => {
    expect(formatPlayTime(0)).toBe('0:00');
    expect(formatPlayTime(75.9)).toBe('1:15');
    expect(formatPlayTime(3725)).toBe('1:02:05');
  });

  it('always has the time to fall back on', () => {
    expect(runFactLines(facts({ seconds: 90 }))).toEqual(["You've been defending this road for 1:30."]);
  });

  it('only mentions what has happened', () => {
    const lines = runFactLines(facts({
      kills: 1234, cleanStreak: 4, goldEarned: 5600, topTower: { name: 'Dwarf multicannon', kills: 88 },
    }));
    expect(lines).toContain('1,234 monsters have fallen on this road so far.');
    expect(lines).toContain('Nothing has got past you yet.');
    expect(lines).toContain('4 waves in a row without a leak.');
    expect(lines).toContain('Your Dwarf multicannon has 88 kills.');
    expect(lines).toContain("You've earned 5,600 gold this run.");
    expect(lines.some(l => l.includes('lost'))).toBe(false);
  });

  it('counts leaks instead of praising a clean run once lives are lost', () => {
    const lines = runFactLines(facts({ kills: 10, livesLost: 1, cleanStreak: 2, topTower: { name: 'Archer', kills: 4 } }));
    expect(lines).toContain("You've lost one life this run.");
    expect(lines).not.toContain('Nothing has got past you yet.');
    expect(lines.some(l => l.includes('in a row'))).toBe(false);
    expect(lines.some(l => l.includes('Archer'))).toBe(false);
  });

  it('picks one of them without running off the end', () => {
    const f = facts({ kills: 3, goldEarned: 10 });
    for (const r of [0, 0.5, 1]) expect(runFactLines(f)).toContain(hansLine(f, () => r));
  });
});

describe("Party Pete's balloons", () => {
  const GRID = 32;
  const cx = 10 * GRID + GRID / 2;
  const cy = 10 * GRID + GRID / 2;

  it('drops three to seven', () => {
    expect(balloonCount(() => 0)).toBe(3);
    expect(balloonCount(() => 0.999)).toBe(7);
    expect(balloonCount(() => 1)).toBe(7);
  });

  it('lands each on its own free tile near Pete, never on his own', () => {
    const spots = pickBalloonSpots(Math.random, cx, cy, () => true, 45, 20, GRID, 7);
    expect(spots).toHaveLength(7);
    expect(new Set(spots.map(s => `${s.x},${s.y}`)).size).toBe(7);
    for (const s of spots) {
      expect(s).not.toEqual({ x: cx, y: cy });
      expect(Math.max(Math.abs(s.x - cx), Math.abs(s.y - cy))).toBeLessThanOrEqual(2 * GRID);
    }
  });

  it('spills into the outer ring only when the near tiles are taken', () => {
    const isFree = (x: number, y: number) => Math.max(Math.abs(x - cx), Math.abs(y - cy)) !== GRID;
    const spots = pickBalloonSpots(Math.random, cx, cy, isFree, 45, 20, GRID, 20);
    expect(spots).toHaveLength(20);
    expect(spots.slice(0, 16).every(s => Math.max(Math.abs(s.x - cx), Math.abs(s.y - cy)) === 2 * GRID)).toBe(true);
    expect(spots.slice(16).every(s => Math.max(Math.abs(s.x - cx), Math.abs(s.y - cy)) === 3 * GRID)).toBe(true);
  });

  it('drops fewer when there is no room', () => {
    expect(pickBalloonSpots(Math.random, cx, cy, () => false, 45, 20, GRID, 5)).toEqual([]);
  });

  it("is empty half the time, and pays a slice of a purse or a nest's essence otherwise", () => {
    expect(rollBalloonGift(() => 0.49)).toBe('none');
    expect(rollBalloonGift(() => 0.5)).toBe('gold');
    expect(rollBalloonGift(() => 0.95)).toBe('essence');
    const ctx = { gold: 200, essence: 30 };
    expect(balloonReward('none', ctx)).toBeNull();
    expect(balloonReward('gold', ctx)).toEqual({ kind: 'gold', amount: Math.round(200 * BALLOON_GOLD_SHARE) });
    expect(balloonReward('essence', ctx)).toEqual({ kind: 'essence', amount: Math.round(30 * BALLOON_ESSENCE_SHARE) });
    expect(balloonReward('essence', { ...ctx, essence: 1 })!.amount).toBe(1);
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

  it('hands Hans his fact about the run', () => {
    expect(diversionLine(DIVERSION_BY_ID.hans, () => 0, 'Nothing has got past you yet.'))
      .toBe('Nothing has got past you yet.');
  });

  it('never lets a hint put words in anyone else\'s mouth', () => {
    const pete = DIVERSION_BY_ID.party_pete;
    expect(pete.lines).toContain(diversionLine(pete, () => 0.5, 'a boss is next'));
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

  it('never hands out an empty nest of essence', () => {
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
    expect(resolvePayload('genie', () => 0.9)).toBe('lamp');
    expect(resolvePayload('hans', () => 0.9)).toBe('none');
  });
});

describe('rewards', () => {
  const ctx = { gold: 180, essence: 42 };

  it('pays each payload in its own kind, at the live amount', () => {
    expect(payloadReward('kebab', ctx)).toEqual({ kind: 'kebab', amount: 1 });
    expect(payloadReward('lamp', ctx)).toEqual({ kind: 'lamp', amount: 1 });
    expect(payloadReward('gold', ctx)).toEqual({ kind: 'gold', amount: 180 });
    expect(payloadReward('essence', ctx)).toEqual({ kind: 'essence', amount: 42 });
    expect(payloadReward('potion', ctx)).toEqual({ kind: 'overload', amount: 1 });
    expect(payloadReward('drill', ctx)).toEqual({ kind: 'levels', amount: DRILL_LEVELS });
  });

  it('promises nothing for a walkby or an unopened nest', () => {
    expect(payloadReward('none', ctx)).toBeNull();
    expect(payloadReward('surprise', ctx)).toBeNull();
    expect(diversionRewardOptions('hans', ctx)).toEqual([]);
  });

  it("leaves the plant's gift to the plant, and Dr Jekyll's herb to him", () => {
    expect(payloadReward('plant', ctx)).toBeNull();
    expect(diversionRewardOptions('strange_plant', ctx)).toEqual([]);
    expect(payloadReward('herb', ctx)).toBeNull();
    expect(diversionRewardOptions('dr_jekyll', ctx)).toEqual([]);
  });

  it('lists everything a nest might hold, in the order it rolls them', () => {
    expect(diversionRewardOptions('bird_nest', ctx).map(r => r.kind)).toEqual(['gold', 'essence', 'overload']);
    expect(NEST_PAYLOADS).toHaveLength(3);
  });

  it('gives every other paying diversion exactly one answer', () => {
    for (const def of DIVERSIONS) {
      if (['none', 'surprise', 'plant', 'herb'].includes(def.payload)) continue;
      expect(diversionRewardOptions(def.id, ctx)).toHaveLength(1);
    }
  });
});

describe('the Strange Plant', () => {
  const seq = (...xs: number[]) => { let i = 0; return () => xs[i++]; };

  it('grows an Overload on the low half of the roll', () => {
    expect(rollPlantGift(() => 0)).toEqual({ kind: 'overload', amount: 1 });
    expect(rollPlantGift(() => PLANT_OVERLOAD_CHANCE - 0.001).kind).toBe('overload');
  });

  it('otherwise drops one seed from the top of the ladder, ends included', () => {
    const pool = SEEDS.filter(s => s.level >= GIFT_HERB_MIN_LEVEL);
    expect(rollPlantGift(seq(PLANT_OVERLOAD_CHANCE, 0))).toEqual({ kind: 'seed', amount: 1, id: pool[0].id });
    expect(rollPlantGift(seq(0.9, 0.999999)).id).toBe(pool[pool.length - 1].id);
    for (let r = 0; r < 1; r += 0.05) {
      const gift = rollPlantGift(seq(0.9, r));
      expect(SEED_BY_ID[gift.id as keyof typeof SEED_BY_ID].level).toBeGreaterThanOrEqual(GIFT_HERB_MIN_LEVEL);
    }
  });

  it('names the gift, with the right article', () => {
    expect(plantGiftText({ kind: 'overload', amount: 1 })).toEqual({
      tip: 'Click to pick an Overload.',
      line: 'The plant bears an Overload.',
    });
    expect(plantGiftText({ kind: 'seed', amount: 1, id: 'avantoe' }).tip).toBe('Click to pick an Avantoe seed.');
    expect(plantGiftText({ kind: 'seed', amount: 1, id: 'torstol' }).line).toBe('The plant bears a Torstol seed.');
  });

  it("floats a seed off the board as that seed's own icon", () => {
    expect(rewardImageKey({ kind: 'seed', amount: 1, id: 'kwuarm' })).toBe('reward_seed_kwuarm');
    expect(rewardImageKey({ kind: 'overload', amount: 1 })).toBe('reward_overload');
  });

  it('keeps its seed totals in the Collection Log', () => {
    expect(sanitizeDiversionGains({ 'strange_plant:seed': 2 })).toEqual({ 'strange_plant:seed': 2 });
  });
});

describe("Dr Jekyll's herb", () => {
  it('hands over one clean herb from the top of the ladder, ends included', () => {
    const pool = SEEDS.filter(s => s.level >= GIFT_HERB_MIN_LEVEL);
    expect(rollJekyllHerb(() => 0)).toEqual({ kind: 'herb', amount: 1, id: pool[0].id });
    expect(rollJekyllHerb(() => 0.999999).id).toBe(pool[pool.length - 1].id);
    for (let r = 0; r < 1; r += 0.05) {
      const herb = rollJekyllHerb(() => r);
      expect(SEED_BY_ID[herb.id as keyof typeof SEED_BY_ID].level).toBeGreaterThanOrEqual(GIFT_HERB_MIN_LEVEL);
    }
  });

  it('decides a gift at spawn only for the payloads that carry one', () => {
    expect(rollDiversionGift('herb', () => 0)?.kind).toBe('herb');
    expect(rollDiversionGift('plant', () => 0)?.kind).toBe('overload');
    for (const p of ['none', 'kebab', 'lamp', 'gold', 'essence', 'potion', 'surprise', 'drill'] as const) {
      expect(rollDiversionGift(p, () => 0)).toBeUndefined();
    }
  });

  it('names the herb, with the right article', () => {
    expect(diversionGiftText('herb', { kind: 'herb', amount: 1, id: 'avantoe' })).toEqual({
      tip: 'Click for an Avantoe to use later.',
      line: 'Dr Jekyll hands you an Avantoe.',
    });
    expect(diversionGiftText('herb', { kind: 'herb', amount: 1, id: 'dwarf' }).line).toBe('Dr Jekyll hands you a Dwarf weed.');
    expect(diversionGiftText('plant', { kind: 'overload', amount: 1 }).line).toBe('The plant bears an Overload.');
  });

  it("shows and floats the herb as that herb's own icon", () => {
    expect(rewardLook({ kind: 'herb', id: 'torstol' })).toEqual({ icon: SEED_BY_ID.torstol.herbIcon, label: 'Torstol' });
    expect(rewardLook({ kind: 'seed', id: 'torstol' }).label).toBe('Torstol seed');
    expect(rewardImageKey({ kind: 'herb', amount: 1, id: 'kwuarm' })).toBe('reward_herb_kwuarm');
  });

  it('keeps its herb totals in the Collection Log', () => {
    expect(sanitizeDiversionGains({ 'dr_jekyll:herb': 3 })).toEqual({ 'dr_jekyll:herb': 3 });
  });
});

describe('the genie lamp', () => {
  it('costs exactly the next few levels, so a fresh skill climbs that many', () => {
    const xp = lampXp(1, HUNTER_MAX_LEVEL, hunterXpForLevel);
    expect(xp).toBe(hunterXpForLevel(1) + hunterXpForLevel(2) + hunterXpForLevel(3));
    expect(gainHunterXp(1, 0, xp)).toMatchObject({ level: 1 + LAMP_LEVELS, levels: LAMP_LEVELS });
  });

  it('climbs the same number of levels whatever is already banked', () => {
    const banked = fishingXpForLevel(40) - 1;
    const gain = gainFishingXp(40, banked, lampXp(40, FISHING_MAX_LEVEL, fishingXpForLevel));
    expect(gain).toMatchObject({ level: 40 + LAMP_LEVELS, levels: LAMP_LEVELS, xp: banked });
  });

  it('stops at the cap, and is worth nothing there', () => {
    expect(lampXp(98, 99, hunterXpForLevel)).toBe(hunterXpForLevel(98));
    expect(lampXp(99, 99, hunterXpForLevel)).toBe(0);
    expect(lampLevelTo(10, 99)).toBe(10 + LAMP_LEVELS);
    expect(lampLevelTo(98, 99)).toBe(99);
  });
});

describe("Sergeant Damien's drill", () => {
  it('lifts a tower exactly its drill levels, whatever it has banked', () => {
    const cases: [number, number][] = [[1, 0], [14, towerXpForLevel(14) - 1], [60, 1234]];
    for (const [level, banked] of cases) {
      expect(trainSkill({ level, xp: banked }, drillXp(level))).toEqual({
        level: level + DRILL_LEVELS, xp: banked, leveledUp: true,
      });
    }
  });

  it('stops at the cap, and is worth nothing there', () => {
    expect(trainSkill({ level: MAX_TOWER_LEVEL - 1, xp: 0 }, drillXp(MAX_TOWER_LEVEL - 1)).level).toBe(MAX_TOWER_LEVEL);
    expect(drillXp(MAX_TOWER_LEVEL)).toBe(0);
  });

  it('keeps its totals in the Collection Log', () => {
    expect(sanitizeDiversionGains({ 'sergeant_damien:levels': 4 })).toEqual({ 'sergeant_damien:levels': 4 });
  });
});

describe('sanitizeDiversionGains', () => {
  it('keeps totals whose diversion and kind both still exist', () => {
    const genie = diversionGainKey('genie', 'essence');
    expect(genie).toBe('genie:essence');
    expect(sanitizeDiversionGains({ [genie]: 120, 'bird_nest:overload': 2, 'tool_leprechaun:growth': 3 }))
      .toEqual({ 'genie:essence': 120, 'bird_nest:overload': 2, 'tool_leprechaun:growth': 3 });
  });

  it('drops retired ids, unknown kinds, malformed keys and non-counts', () => {
    expect(sanitizeDiversionGains({
      'wise_old_man:gold': 5,
      'genie:xp': 5,
      genie: 5,
      'genie:gold:extra': 5,
      'constructor:gold': 5,
      'bird_nest:gold': 0,
      'drunken_dwarf:life': 'lots',
      'drunken_dwarf:gold': 99.9,
    })).toEqual({ 'drunken_dwarf:gold': 99 });
  });

  it('reads garbage as no totals', () => {
    expect(sanitizeDiversionGains(null)).toEqual({});
    expect(sanitizeDiversionGains([1, 2])).toEqual({});
  });
});

describe('walking on and off', () => {
  const W = 1440, H = 640;

  /** One standing on its tile, ready to be sent somewhere. */
  function standing(x: number, y: number): Diversion {
    return {
      id: 'dv1', defId: 'hans', mood: 'walkby',
      x, y, homeX: x, homeY: y,
      phase: 'here', exit: null, facing: 'front', facingLeft: false, line: 'hello',
    };
  }

  it('comes in and goes out by the nearest edge, never the far one', () => {
    expect(offBoardPoint(80, 320, W, H)).toEqual({ x: -40, y: 320 });
    expect(offBoardPoint(1400, 320, W, H)).toEqual({ x: 1480, y: 320 });
    expect(offBoardPoint(700, 80, W, H)).toEqual({ x: 700, y: -40 });
    expect(offBoardPoint(700, 560, W, H)).toEqual({ x: 700, y: 680 });
  });

  it('walks to its tile and stops there', () => {
    const d = standing(200, 320);
    d.x = -40; d.phase = 'arriving';
    // Far more than the walk needs: it must land exactly on the tile, not past it.
    expect(stepDiversion(d, 10)).toBe(true);
    expect(d.phase).toBe('here');
    expect(d).toMatchObject({ x: 200, y: 320 });
  });

  it('covers its own speed in a second, and no more', () => {
    const d = standing(600, 320);
    d.x = 0; d.phase = 'arriving';
    stepDiversion(d, 1);
    expect(d.x).toBeCloseTo(DIVERSION_WALK_SPEED, 5);
    expect(d.phase).toBe('arriving');
  });

  it('turns to face the way it is going', () => {
    const d = standing(200, 320);
    d.x = -40; d.phase = 'arriving';
    stepDiversion(d, 0.1);
    expect(d).toMatchObject({ facing: 'side', facingLeft: false });
    sendDiversionOff(d, W, H);       // nearest edge from x≈-30 is the left one
    stepDiversion(d, 0.1);
    expect(d).toMatchObject({ facing: 'side', facingLeft: true });
  });

  it('shows its front walking down the board and its back walking up', () => {
    const down = standing(700, 500);
    down.y = -40; down.phase = 'arriving';
    stepDiversion(down, 0.1);
    expect(down.facing).toBe('front');

    const up = standing(700, 100);
    up.y = 680; up.phase = 'arriving';
    stepDiversion(up, 0.1);
    expect(up.facing).toBe('back');
  });

  it('turns to the player the moment it arrives, however it walked in', () => {
    const d = standing(200, 320);
    d.x = -40; d.phase = 'arriving';
    stepDiversion(d, 0.1);
    expect(d.facing).toBe('side');    // still crossing
    stepDiversion(d, 10);             // lands on the tile
    expect(d).toMatchObject({ phase: 'here', facing: 'front' });
  });

  it('picks the axis it is covering more of, so a diagonal does not flicker', () => {
    const d = standing(0, 0);
    turnDiversion(d, 10, 3);
    expect(d.facing).toBe('side');
    turnDiversion(d, 3, 10);
    expect(d.facing).toBe('front');
    // Noise at the end of a walk must not spin it on the spot.
    d.facing = 'back';
    turnDiversion(d, 0.2, -0.1);
    expect(d.facing).toBe('back');
  });

  it('standing still costs it nothing and moves it nowhere', () => {
    const d = standing(400, 300);
    expect(stepDiversion(d, 5)).toBe(true);
    expect(d).toMatchObject({ x: 400, y: 300, phase: 'here' });
  });

  it('is dropped only once it is off the board', () => {
    const d = standing(80, 320);
    sendDiversionOff(d, W, H);
    expect(d.phase).toBe('leaving');
    expect(stepDiversion(d, 0.5)).toBe(true);  // still on its way out
    expect(stepDiversion(d, 10)).toBe(false);  // gone
  });

  it('will not be sent off twice — the first exit stands', () => {
    const d = standing(80, 320);
    sendDiversionOff(d, W, H);
    const exit = d.exit;
    d.x = 1400; // dragged across the board somehow
    sendDiversionOff(d, W, H);
    expect(d.exit).toBe(exit);
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

describe('sanitizeDiversionsMet', () => {
  it('keeps positive whole counts for ids that still exist', () => {
    expect(sanitizeDiversionsMet({ hans: 3, genie: 1 })).toEqual({ hans: 3, genie: 1 });
  });

  it('drops ids the table no longer has, and anything that is not a count', () => {
    expect(sanitizeDiversionsMet({ hans: 2, wise_old_man: 9, bob: 0, genie: -1, party_pete: 'lots' }))
      .toEqual({ hans: 2 });
  });

  it('floors a fractional count rather than throwing the entry away', () => {
    expect(sanitizeDiversionsMet({ hans: 2.7 })).toEqual({ hans: 2 });
  });

  it('reads garbage as an empty log', () => {
    expect(sanitizeDiversionsMet(null)).toEqual({});
    expect(sanitizeDiversionsMet('hans')).toEqual({});
    expect(sanitizeDiversionsMet(undefined)).toEqual({});
  });
});
