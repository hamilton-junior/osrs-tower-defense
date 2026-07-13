import { describe, it, expect } from 'vitest';
import {
  ZULRAH_PHASES,
  ZULRAH_PHASE_SECS,
  ZULRAH_WEAK_BONUS,
  zulrahPhaseIndex,
  zulrahStyleMult,
  recentDamageSum,
  pruneDamageEvents,
  jadHealPerTick,
  freshBossState,
  bossStyleMult,
  JAD_HEAL_FRAC,
  JAD_HEAL_WINDOW_SECS,
  JAD_HEAL_TICK_SECS,
  VORKATH_ICE_INTERVAL,
  HYDRA_PHASES,
  HYDRA_VENT_THRESHOLDS,
  HYDRA_VENT_DAMAGE_MULT,
  HYDRA_VENT_BREAK_FRAC,
  HYDRA_VENT_HEAL_PER_SEC,
  HYDRA_ENRAGE_HP,
  hydraPhase,
  hydraNextThreshold,
  hydraShouldVent,
  hydraBreakTarget,
  hydraVentHeal,
  hydraIsEnraged,
  hydraZapChain,
  MECHANIC_BOSSES,
  SCHEDULABLE_BOSSES,
  MOLE_BURROW_INTERVAL,
  MOLE_FRENZY_HP,
  MOLE_FRENZY_INTERVAL_MULT,
  MOLE_BURROW_FRAC,
  MOLE_MIN_TAIL_FRAC,
  moleBurrowInterval,
  moleBurrowTarget,
  moleIsHidden,
  moleIsBurrowing,
  isGuardian,
  guardianTwin,
  guardianReviveHp,
  GUARDIAN_LINK_DAMAGE_MULT,
  GUARDIAN_REVIVE_SECS,
  GUARDIAN_REVIVE_HP_FRAC,
} from './boss-mechanics';
import { pathTotalLength, remainingPathDistance } from './geometry';

describe('Zulrah phases', () => {
  it('covers all three combat styles exactly once', () => {
    const weaks = ZULRAH_PHASES.map((p) => p.weak).sort();
    expect(weaks).toEqual(['magic', 'melee', 'ranged']);
  });
  it('rotates by ZULRAH_PHASE_SECS and wraps', () => {
    expect(zulrahPhaseIndex(0)).toBe(0);
    expect(zulrahPhaseIndex(ZULRAH_PHASE_SECS - 0.01)).toBe(0);
    expect(zulrahPhaseIndex(ZULRAH_PHASE_SECS)).toBe(1);
    expect(zulrahPhaseIndex(ZULRAH_PHASE_SECS * 2)).toBe(2);
    expect(zulrahPhaseIndex(ZULRAH_PHASE_SECS * 3)).toBe(0); // wrap
  });
});

describe('zulrahStyleMult', () => {
  it('boosts the weak style and resists the others by the same magnitude', () => {
    expect(zulrahStyleMult('magic', 'magic')).toBeCloseTo(1 + ZULRAH_WEAK_BONUS);
    expect(zulrahStyleMult('magic', 'ranged')).toBeCloseTo(1 - ZULRAH_WEAK_BONUS);
    expect(zulrahStyleMult('magic', 'melee')).toBeCloseTo(1 - ZULRAH_WEAK_BONUS);
  });
  it('is symmetric: the bonus up equals the penalty down', () => {
    const up = zulrahStyleMult('ranged', 'ranged') - 1;
    const down = 1 - zulrahStyleMult('ranged', 'magic');
    expect(up).toBeCloseTo(down);
  });
  it('is neutral for styleless damage (DoT)', () => {
    expect(zulrahStyleMult('melee', undefined)).toBe(1);
  });
});

describe('recent-damage window', () => {
  const events = [
    { t: 0, amount: 100 },
    { t: 3, amount: 50 },
    { t: 7, amount: 30 },
  ];
  it('sums only events within the window', () => {
    expect(recentDamageSum(events, 8, JAD_HEAL_WINDOW_SECS)).toBe(80); // t=3 and t=7 are within 5s of now=8
    expect(recentDamageSum(events, 100, JAD_HEAL_WINDOW_SECS)).toBe(0); // all stale
  });
  it('prunes stale events', () => {
    expect(pruneDamageEvents([...events], 8, JAD_HEAL_WINDOW_SECS)).toEqual([
      { t: 3, amount: 50 },
      { t: 7, amount: 30 },
    ]);
  });
});

describe('jadHealPerTick', () => {
  it('prorates the heal fraction to the tick length', () => {
    expect(jadHealPerTick(1000)).toBe(Math.round(1000 * JAD_HEAL_FRAC * (JAD_HEAL_TICK_SECS / JAD_HEAL_WINDOW_SECS)));
  });
  it('is zero with no recent damage', () => {
    expect(jadHealPerTick(0)).toBe(0);
  });
});

describe('freshBossState / bossStyleMult', () => {
  it('seeds Vorkath with its ice timer', () => {
    expect(freshBossState('vorkath').iceTimer).toBe(VORKATH_ICE_INTERVAL);
  });
  it('seeds Jad with an empty damage window', () => {
    expect(freshBossState('jad').recentDamage).toEqual([]);
  });
  it('applies the Zulrah style bias through bossStyleMult', () => {
    const st = freshBossState('zulrah'); // phase 0 = serpentine, weak to magic
    expect(bossStyleMult(st, 'magic')).toBeCloseTo(1 + ZULRAH_WEAK_BONUS);
    expect(bossStyleMult(st, 'ranged')).toBeCloseTo(1 - ZULRAH_WEAK_BONUS);
  });
  it('returns 0 while immune (Vorkath ice shield)', () => {
    const st = freshBossState('vorkath');
    st.immune = true;
    expect(bossStyleMult(st, 'ranged')).toBe(0);
  });
  it('is neutral with no state', () => {
    expect(bossStyleMult(undefined, 'magic')).toBe(1);
  });
  it('seeds the Hydra unshattered with an empty vent tally', () => {
    const st = freshBossState('hydra');
    expect(st.shattered).toBe(0);
    expect(st.ventDamage).toBe(0);
    expect(st.venting).toBeFalsy();
  });
  it('hardens a venting Hydra against every style, DoT included', () => {
    const st = freshBossState('hydra');
    expect(bossStyleMult(st, 'magic')).toBe(1); // not venting yet
    st.venting = true;
    expect(bossStyleMult(st, 'magic')).toBe(HYDRA_VENT_DAMAGE_MULT);
    expect(bossStyleMult(st, 'melee')).toBe(HYDRA_VENT_DAMAGE_MULT);
    expect(bossStyleMult(st, undefined)).toBe(HYDRA_VENT_DAMAGE_MULT); // burst check, not a style check
  });
});

describe('Hydra phases', () => {
  it('advances with each shattered vent, and clamps at the last', () => {
    expect(hydraPhase(0).id).toBe('serpentine');
    expect(hydraPhase(1).id).toBe('electric');
    expect(hydraPhase(2).id).toBe('flame');
    expect(hydraPhase(99).id).toBe('flame');
  });
  it('has one more phase than it has vents (each vent is a boundary)', () => {
    expect(HYDRA_PHASES.length).toBe(HYDRA_VENT_THRESHOLDS.length + 1);
  });
  it('walks the thresholds in order, then runs out', () => {
    expect(hydraNextThreshold(0)).toBe(HYDRA_VENT_THRESHOLDS[0]);
    expect(hydraNextThreshold(1)).toBe(HYDRA_VENT_THRESHOLDS[1]);
    expect(hydraNextThreshold(2)).toBeNull();
  });
});

describe('hydraShouldVent', () => {
  it('opens once HP crosses the next threshold', () => {
    expect(hydraShouldVent(0.9, 0, false)).toBe(false);
    expect(hydraShouldVent(0.66, 0, false)).toBe(true);
  });
  it('does not re-open while one is already open', () => {
    expect(hydraShouldVent(0.5, 0, true)).toBe(false);
  });
  it('re-opens the same threshold after a failed break — the stall loop', () => {
    // Vent 1 failed: it healed back over 66%, then got knocked down again.
    expect(hydraShouldVent(0.6, 0, false)).toBe(true);
  });
  it('waits for the second threshold once the first is shattered', () => {
    expect(hydraShouldVent(0.5, 1, false)).toBe(false);
    expect(hydraShouldVent(0.33, 1, false)).toBe(true);
  });
  it('never opens again once every vent is shattered', () => {
    expect(hydraShouldVent(0.01, 2, false)).toBe(false);
  });
});

describe('vent break / heal maths', () => {
  it('scales the break target off max HP and never asks for zero', () => {
    expect(hydraBreakTarget(2000)).toBe(Math.round(2000 * HYDRA_VENT_BREAK_FRAC));
    expect(hydraBreakTarget(1)).toBeGreaterThanOrEqual(1);
  });
  it('regenerates a fixed fraction of max HP per second', () => {
    expect(hydraVentHeal(1000, 1)).toBeCloseTo(1000 * HYDRA_VENT_HEAL_PER_SEC);
    expect(hydraVentHeal(1000, 0.5)).toBeCloseTo(1000 * HYDRA_VENT_HEAL_PER_SEC * 0.5);
  });
});

describe('hydraIsEnraged', () => {
  it('flips at the enrage threshold', () => {
    expect(hydraIsEnraged(HYDRA_ENRAGE_HP + 0.01)).toBe(false);
    expect(hydraIsEnraged(HYDRA_ENRAGE_HP)).toBe(true);
    expect(hydraIsEnraged(0)).toBe(true);
  });
});

describe('hydraZapChain', () => {
  const towers = [
    { id: 'a', x: 10, y: 0 },
    { id: 'b', x: 20, y: 0 },
    { id: 'c', x: 400, y: 0 },
    { id: 'd', x: 30, y: 0 },
  ];
  it('strikes the nearest tower, then hops to the nearest unhit one', () => {
    // From the origin: a (10) is nearest; from a the nearest unhit is b (20); from b, d (30).
    expect(hydraZapChain(towers, 0, 0, 3).map((t) => t.id)).toEqual(['a', 'b', 'd']);
  });
  it('hops from the last tower, not from the Hydra', () => {
    // Standing right on c, the chain must walk back down the cluster: c → d → b.
    expect(hydraZapChain(towers, 400, 0, 3).map((t) => t.id)).toEqual(['c', 'd', 'b']);
  });
  it('never hits the same tower twice', () => {
    const ids = hydraZapChain(towers, 0, 0, 4).map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it('returns what it can when the board holds fewer towers', () => {
    expect(hydraZapChain(towers.slice(0, 2), 0, 0, 3)).toHaveLength(2);
    expect(hydraZapChain([], 0, 0, 3)).toEqual([]);
  });
});

describe('boss id lists', () => {
  it('schedules every boss that has state, except the ones that only arrive as companions', () => {
    // Every schedulable boss must have state (the engine gates `freshBossState` on
    // MECHANIC_BOSSES) — the reverse need not hold.
    for (const b of SCHEDULABLE_BOSSES) expect(MECHANIC_BOSSES).toContain(b);
  });
  it('introduces the Giant Mole first and the Hydra last', () => {
    expect(SCHEDULABLE_BOSSES[0]).toBe('giant_mole');
    expect(SCHEDULABLE_BOSSES.at(-1)).toBe('hydra');
  });
});

describe('Giant Mole burrow', () => {
  // A straight 1000px road. Deliberately few waypoints — the real maps are procedural
  // and come out around 7–20, which is exactly why the burrow is measured in distance.
  const road = [
    { x: 0, y: 0 }, { x: 250, y: 0 }, { x: 500, y: 0 }, { x: 750, y: 0 }, { x: 1000, y: 0 },
  ];
  const TOTAL = 1000;

  it('starts above ground with a full interval banked', () => {
    const st = freshBossState('giant_mole');
    expect(st.molePhase).toBe('above');
    expect(st.moleTimer).toBe(MOLE_BURROW_INTERVAL);
    expect(st.burrows).toBe(0);
  });

  it('digs more often once frenzied', () => {
    expect(moleBurrowInterval(1)).toBe(MOLE_BURROW_INTERVAL);
    expect(moleBurrowInterval(MOLE_FRENZY_HP + 0.01)).toBe(MOLE_BURROW_INTERVAL);
    expect(moleBurrowInterval(MOLE_FRENZY_HP)).toBeCloseTo(MOLE_BURROW_INTERVAL * MOLE_FRENZY_INTERVAL_MULT);
    expect(moleBurrowInterval(0.01)).toBeLessThan(MOLE_BURROW_INTERVAL);
  });

  it('skips a fixed fraction of the road, not a number of waypoints', () => {
    const t = moleBurrowTarget(road, 0, 0, 0)!;
    expect(t).not.toBeNull();
    // It travelled MOLE_BURROW_FRAC of the whole road...
    expect(t.x).toBeCloseTo(TOTAL * MOLE_BURROW_FRAC);
    // ...which lands *inside* the first segment: no snapping to a waypoint.
    expect(t.pathIndex).toBe(0);
  });

  it('lands part-way into a later segment, carrying the waypoint index with it', () => {
    // Starting at 200px along, +120px = 320px, which is inside the second segment.
    const t = moleBurrowTarget(road, 0, 200, 0)!;
    expect(t.x).toBeCloseTo(200 + TOTAL * MOLE_BURROW_FRAC);
    expect(t.pathIndex).toBe(1);
  });

  it('never surfaces inside the final approach', () => {
    const tail = TOTAL * MOLE_MIN_TAIL_FRAC;
    // Sweep the whole road: wherever it digs from, what is left to walk is never less
    // than the tail. That guarantee is the whole reason the mechanic is fair.
    for (let d = 0; d < TOTAL; d += 10) {
      const idx = Math.min(road.length - 2, Math.floor(d / 250));
      const t = moleBurrowTarget(road, idx, d, 0);
      if (!t) continue; // it refused to dig — the other half of the guarantee
      const left = remainingPathDistance(road, t.pathIndex, t.x, t.y);
      expect(left).toBeGreaterThanOrEqual(tail - 0.001);
    }
  });

  it('refuses to dig once it is on the final approach', () => {
    // Standing exactly on the tail line, and past it.
    const tailStart = TOTAL * (1 - MOLE_MIN_TAIL_FRAC);
    expect(moleBurrowTarget(road, 3, tailStart, 0)).toBeNull();
    expect(moleBurrowTarget(road, 3, 950, 0)).toBeNull();
  });

  it('refuses a dig that would barely move it', () => {
    // Just before the tail: the room left is a sliver, not worth the whole animation.
    const almost = TOTAL * (1 - MOLE_MIN_TAIL_FRAC) - 5;
    expect(moleBurrowTarget(road, 3, almost, 0)).toBeNull();
  });

  it('never moves backwards, and never off the end', () => {
    for (let d = 0; d < TOTAL; d += 25) {
      const idx = Math.min(road.length - 2, Math.floor(d / 250));
      const t = moleBurrowTarget(road, idx, d, 0);
      if (!t) continue;
      expect(t.x).toBeGreaterThan(d);
      expect(t.x).toBeLessThanOrEqual(TOTAL);
    }
  });

  it('handles a degenerate road without throwing', () => {
    expect(moleBurrowTarget([], 0, 0, 0)).toBeNull();
    expect(moleBurrowTarget([{ x: 0, y: 0 }], 0, 0, 0)).toBeNull();
  });

  it('is hidden only while underground, but frozen for the whole cycle', () => {
    const st = freshBossState('giant_mole');
    expect(moleIsHidden(st)).toBe(false);
    expect(moleIsBurrowing(st)).toBe(false); // 'above' — it walks

    st.molePhase = 'dig';
    expect(moleIsHidden(st)).toBe(false);   // still visible and hittable
    expect(moleIsBurrowing(st)).toBe(true); // but not walking

    st.molePhase = 'under';
    expect(moleIsHidden(st)).toBe(true);
    expect(moleIsBurrowing(st)).toBe(true);

    st.molePhase = 'emerge';
    expect(moleIsHidden(st)).toBe(false);   // climbing out: hittable again
    expect(moleIsBurrowing(st)).toBe(true);
  });

  it('does not mistake another boss (or nothing) for a burrowing Mole', () => {
    expect(moleIsHidden(undefined)).toBe(false);
    expect(moleIsBurrowing(undefined)).toBe(false);
    expect(moleIsHidden(freshBossState('vorkath'))).toBe(false);
    expect(moleIsBurrowing(freshBossState('jad'))).toBe(false);
  });

  it('takes no damage underground, and full damage everywhere else in the cycle', () => {
    const st = freshBossState('giant_mole');
    expect(bossStyleMult(st, 'melee')).toBe(1);
    // The engine raises the shared `immune` flag when it goes under.
    st.molePhase = 'under';
    st.immune = true;
    for (const style of ['melee', 'ranged', 'magic', undefined] as const) {
      expect(bossStyleMult(st, style)).toBe(0);
    }
    st.molePhase = 'emerge';
    st.immune = false;
    expect(bossStyleMult(st, 'magic')).toBe(1);
  });

  it('works the same on a short procedural road as on a long one', () => {
    // The bug this guards: waypoint-counting constants made the Mole unable to burrow
    // at all on a 7-waypoint map, which is what the real generator produces.
    const short = [{ x: 0, y: 0 }, { x: 500, y: 0 }, { x: 1000, y: 0 }];
    const long = Array.from({ length: 21 }, (_, i) => ({ x: i * 50, y: 0 }));
    expect(pathTotalLength(short)).toBe(pathTotalLength(long)); // same road, different waypoints
    const a = moleBurrowTarget(short, 0, 0, 0)!;
    const b = moleBurrowTarget(long, 0, 0, 0)!;
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    expect(a.x).toBeCloseTo(b.x); // it travels the same distance on both
  });
});

describe('Grotesque Guardians', () => {
  it('knows its own, and only its own', () => {
    expect(isGuardian('dusk')).toBe(true);
    expect(isGuardian('dawn')).toBe(true);
    expect(isGuardian('jad')).toBe(false);
    expect(isGuardian(undefined)).toBe(false);
  });

  it('pairs each twin with the other', () => {
    expect(guardianTwin('dusk')).toBe('dawn');
    expect(guardianTwin('dawn')).toBe('dusk');
    expect(guardianTwin('hydra')).toBeUndefined();
  });

  it('seeds a fresh Guardian knowing who it arrives with', () => {
    expect(freshBossState('dusk').twinType).toBe('dawn');
    expect(freshBossState('dawn').twinType).toBe('dusk');
    expect(freshBossState('dusk').linked).toBeFalsy(); // the engine links them on summon
  });

  it('only Dusk can be drawn by a wave — Dawn never arrives alone', () => {
    expect(SCHEDULABLE_BOSSES).toContain('dusk');
    expect(SCHEDULABLE_BOSSES).not.toContain('dawn');
    // ...but she still carries phase state, which is exactly why the two lists differ.
    expect(MECHANIC_BOSSES).toContain('dawn');
  });

  it('halves damage while the pair stands, and stops halving the moment one falls', () => {
    const st = freshBossState('dusk');
    st.linked = true;
    for (const style of ['melee', 'ranged', 'magic'] as const) {
      expect(bossStyleMult(st, style)).toBe(GUARDIAN_LINK_DAMAGE_MULT);
    }
    // Styleless DoT is halved too: the pair asks about kill order, and letting poison
    // slip past the link would answer the question for free.
    expect(bossStyleMult(st, undefined)).toBe(GUARDIAN_LINK_DAMAGE_MULT);

    st.linked = false; // its twin is down — it takes everything now
    expect(bossStyleMult(st, 'melee')).toBe(1);
  });

  it('applies the link to both halves, not just Dusk', () => {
    const dawn = freshBossState('dawn');
    dawn.linked = true;
    expect(bossStyleMult(dawn, 'magic')).toBe(GUARDIAN_LINK_DAMAGE_MULT);
  });

  it('brings a twin back on half health, never on zero', () => {
    expect(guardianReviveHp(1100)).toBe(Math.round(1100 * GUARDIAN_REVIVE_HP_FRAC));
    expect(guardianReviveHp(1)).toBeGreaterThanOrEqual(1);
  });

  it('makes splitting them a real trade: half damage, or a clock', () => {
    // The design in one assertion — the link must be worth breaking (a real mitigation)
    // and the punishment for breaking it badly must be a finite race, not a wipe.
    expect(GUARDIAN_LINK_DAMAGE_MULT).toBeLessThan(1);
    expect(GUARDIAN_REVIVE_SECS).toBeGreaterThan(0);
    expect(GUARDIAN_REVIVE_HP_FRAC).toBeLessThan(1); // a revived twin comes back hurt
  });
});
