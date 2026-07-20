import { describe, it, expect } from 'vitest';
import {
  stepBossStall,
  bossStallStacks,
  stallTenacityBonus,
  stallHealMult,
  BOSS_STALL_GRACE,
  BOSS_STALL_STEP,
  BOSS_STALL_PROGRESS,
  BOSS_STALL_MAX_STACKS,
  BOSS_STALL_HEAL_PER_STACK,
  BOSS_STALL_ENGAGE_WINDOW,
  bossIsEngaged,
  type StallState,
  ZULRAH_PHASES,
  ZULRAH_PHASE_SECS,
  ZULRAH_WEAK_BONUS,
  zulrahPhaseIndex,
  zulrahStyleMult,
  recentDamageSum,
  pruneDamageEvents,
  jadHealPerTick,
  freshBossState,
  brutusShouldRage,
  brutusDashDirection,
  brutusIsRampaging,
  brutusTrampled,
  bossAnimVariant,
  bossPhaseClip,
  BRUTUS_RAGE_DAMAGE_FRAC,
  BRUTUS_DEMONIC_SLUG,
  BRUTUS_BRACE_SECS,
  BRUTUS_DASH_SECS,
  SCURRIUS_SHEAR_FRAC,
  SCURRIUS_RAT_HP_FRAC,
  SCURRIUS_SHEAR_COOLDOWN,
  SCURRIUS_MAX_RATS,
  SCURRIUS_SHEAR_FLOOR,
  SCURRIUS_SQUEAK_INTERVAL,
  SCURRIUS_RAT_SPEED_MULT,
  SCURRIUS_WANDER_SECS,
  SCURRIUS_WANDER_LEASH,
  SCURRIUS_REFUND_RADIUS,
  SCURRIUS_SAY,
  scurriusShouldShear,
  scurriusRatHp,
  ratWanderTarget,
  ratRefund,
  MOLE_DIG_SECS,
  MOLE_EMERGE_SECS,
  bossStyleMult,
  phaseResistedStyles,
  escortDamageMult,
  ESCORT_AOE_DAMAGE_MULT,
  JAD_HEAL_FRAC,
  JAD_HEAL_WINDOW_SECS,
  JAD_HEAL_TICK_SECS,
  VORKATH_ICE_INTERVAL,
  HYDRA_PHASES,
  HYDRA_VENT_THRESHOLDS,
  HYDRA_VENT_COOLDOWN_SECS,
  HYDRA_VENT_DAMAGE_MULT,
  HYDRA_VENT_BREAK_FRAC,
  HYDRA_VENT_HEAL_PER_SEC,
  HYDRA_ENRAGE_HP,
  hydraPhase,
  hydraNextThreshold,
  hydraShouldVent,
  hydraBreakTarget,
  hydraVentCredit,
  hydraVentHeal,
  hydraIsEnraged,
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
  guardianLeakCost,
  guardianCanRevive,
  linkGuardianStates,
  guardianShouldSummonTwin,
  GUARDIAN_LINK_DAMAGE_MULT,
  GUARDIAN_REVIVE_SECS,
  GUARDIAN_REVIVE_HP_FRAC,
  GUARDIAN_LEAK_MULT,
  SOUL_STYLES,
  CERBERUS_SOUL_THRESHOLDS,
  CERBERUS_SOUL_LOCK_MULT,
  CERBERUS_ENRAGE_HP,
  cerberusShouldSummon,
  cerberusIsEnraged,
  soulLockMult,
  soulAnimSlug,
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

describe('escortDamageMult', () => {
  it('leaves every hit on a non-escort alone', () => {
    for (const tag of ['direct', 'splash', 'chain', 'burn', 'poison', 'venom'] as const) {
      expect(escortDamageMult(false, tag)).toBe(1);
    }
  });
  it('cuts area hits on an escort — the fire that was never aimed at it', () => {
    expect(escortDamageMult(true, 'splash')).toBe(ESCORT_AOE_DAMAGE_MULT);
    expect(escortDamageMult(true, 'chain')).toBe(ESCORT_AOE_DAMAGE_MULT);
  });
  it('leaves focused fire on an escort at full damage — focusing is the answer', () => {
    expect(escortDamageMult(true, 'direct')).toBe(1);
  });
  it('leaves DoTs already ticking on an escort alone', () => {
    for (const tag of ['burn', 'poison', 'venom'] as const) {
      expect(escortDamageMult(true, tag)).toBe(1);
    }
  });
  it('is neutral for an untagged hit (board FX with no source)', () => {
    expect(escortDamageMult(true, undefined)).toBe(1);
  });
  it('leaves focused fire strictly faster than splash — the whole point', () => {
    expect(escortDamageMult(true, 'direct')).toBeGreaterThan(escortDamageMult(true, 'splash'));
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
  it('holds the vent shut while the post-failure cooldown runs', () => {
    // The unkillable-Hydra regression: a failed vent left HP under the threshold, so
    // the vent re-opened on the next frame and the boss was hardened forever. The
    // cooldown is the board's full-damage window; only after it may the vent return.
    expect(hydraShouldVent(0.5, 0, false, HYDRA_VENT_COOLDOWN_SECS)).toBe(false);
    expect(hydraShouldVent(0.5, 0, false, 0.01)).toBe(false);
    expect(hydraShouldVent(0.5, 0, false, 0)).toBe(true);
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
  it('credits a landed hit at its pre-hardening value', () => {
    // A 100-damage hit lands for 20 while the vent hardens the Hydra; the break bar
    // must still see the 100 the towers put out.
    expect(hydraVentCredit(100 * HYDRA_VENT_DAMAGE_MULT)).toBeCloseTo(100);
    expect(hydraVentCredit(0)).toBe(0);
  });
  it('lets a board that deals the break target in raw damage actually break the vent', () => {
    // The regression: crediting the landed figure demanded 1/HYDRA_VENT_DAMAGE_MULT
    // times the advertised bar, so the vent never broke. Deal exactly the target in
    // raw damage across the window and it must shatter.
    const maxHp = 10_000;
    const raw = hydraBreakTarget(maxHp);
    const landed = raw * HYDRA_VENT_DAMAGE_MULT; // what the Hydra's HP bar loses
    expect(hydraVentCredit(landed)).toBeGreaterThanOrEqual(hydraBreakTarget(maxHp));
  });
});

describe('hydraIsEnraged', () => {
  it('flips at the enrage threshold', () => {
    expect(hydraIsEnraged(HYDRA_ENRAGE_HP + 0.01)).toBe(false);
    expect(hydraIsEnraged(HYDRA_ENRAGE_HP)).toBe(true);
    expect(hydraIsEnraged(0)).toBe(true);
  });
});

describe('boss id lists', () => {
  it('schedules every boss that has state, except the ones that only arrive as companions', () => {
    // Every schedulable boss must have state (the engine gates `freshBossState` on
    // MECHANIC_BOSSES) — the reverse need not hold.
    for (const b of SCHEDULABLE_BOSSES) expect(MECHANIC_BOSSES).toContain(b);
  });
  it('introduces Brutus first and the Hydra last', () => {
    // The ladder runs gentlest → hardest. Brutus opens it because his rampage costs the
    // player a damage window and nothing else — he cannot bypass a defence the way the
    // Mole can, which makes him the only boss safe to meet before you know what a boss is.
    expect(SCHEDULABLE_BOSSES[0]).toBe('brutus');
    expect(SCHEDULABLE_BOSSES.at(-1)).toBe('hydra');
  });
});

describe('Brutus rampage', () => {
  it('will not rage while the cooldown is running, however hard he is hit', () => {
    expect(brutusShouldRage(2, 1000, 1000)).toBe(false);
  });

  it('will not rage off cooldown until he has actually been hurt enough', () => {
    const maxHp = 1000;
    const justUnder = maxHp * BRUTUS_RAGE_DAMAGE_FRAC - 1;
    expect(brutusShouldRage(0, justUnder, maxHp)).toBe(false);
    expect(brutusShouldRage(0, maxHp * BRUTUS_RAGE_DAMAGE_FRAC, maxHp)).toBe(true);
  });

  it('charges straight at the tower, whichever side of the road it is on', () => {
    const from = { x: 0, y: 0 };
    const to = { x: 100, y: 0 };
    const self = { x: 50, y: 0 };
    // Tower due south → he runs south; due north → north. The road is irrelevant now.
    expect(brutusDashDirection(from, to, self, { x: 50, y: 200 })).toEqual({ x: 0, y: 1 });
    expect(brutusDashDirection(from, to, self, { x: 50, y: -200 })).toEqual({ x: 0, y: -1 });
  });

  it('aims off-axis rather than snapping to the nearest side', () => {
    // A tower ahead-and-to-the-right: the charge keeps its forward component instead of
    // being flattened onto the road's normal.
    const dir = brutusDashDirection({ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 0 }, { x: 30, y: 40 });
    expect(dir.x).toBeCloseTo(0.6);
    expect(dir.y).toBeCloseTo(0.8);
  });

  it('steps off the road perpendicular when there is no tower to charge', () => {
    // Empty board: a road running due east, so the fallback must have no eastward
    // component — he leaves the path rather than gaining (or losing) ground on it.
    const dir = brutusDashDirection({ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 50, y: 0 });
    expect(dir.x).toBeCloseTo(0);
    expect(Math.abs(dir.y)).toBeCloseTo(1);
  });

  it('returns a unit vector, so the dash distance is set by speed alone', () => {
    const aimed = brutusDashDirection({ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 0 }, { x: 300, y: -400 });
    expect(Math.hypot(aimed.x, aimed.y)).toBeCloseTo(1);
    const fallback = brutusDashDirection({ x: 0, y: 0 }, { x: 30, y: 40 }, { x: 15, y: 20 });
    expect(Math.hypot(fallback.x, fallback.y)).toBeCloseTo(1);
  });

  it('picks a defined side on a zero-length segment', () => {
    // The last waypoint has no `to`; the engine passes the boss's own position for both.
    const dir = brutusDashDirection({ x: 10, y: 10 }, { x: 10, y: 10 }, { x: 10, y: 10 });
    expect(Number.isFinite(dir.x)).toBe(true);
    expect(Number.isFinite(dir.y)).toBe(true);
  });

  it('falls back to the road normal for a tower standing on top of him', () => {
    // Zero distance gives no direction to normalise; he must not emit NaN.
    const dir = brutusDashDirection({ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 0 });
    expect(Math.hypot(dir.x, dir.y)).toBeCloseTo(1);
  });

  it('flattens the towers his body overlaps, and only those', () => {
    // Boss radius 28 + tower radius 16 = 44px of reach from his centre.
    const towers = [
      { id: 'touching', x: 40, y: 0 },
      { id: 'exactly-on-the-edge', x: 44, y: 0 },
      { id: 'clear', x: 45, y: 0 },
      { id: 'far', x: 500, y: 500 },
    ];
    const hit = brutusTrampled(towers, 0, 0, 28, 16).map((t) => t.id);
    expect(hit).toEqual(['touching', 'exactly-on-the-edge']);
  });

  it('measures contact in both axes, not just along the dash', () => {
    const towers = [{ id: 'diagonal', x: 30, y: 30 }]; // 42.4px away — inside 44
    expect(brutusTrampled(towers, 0, 0, 28, 16)).toHaveLength(1);
    expect(brutusTrampled(towers, 0, 0, 10, 16)).toHaveLength(0);
  });

  it('flattens an empty board without complaint', () => {
    expect(brutusTrampled([], 0, 0, 28, 16)).toEqual([]);
  });

  it('suspends path movement for every phase except calm', () => {
    const st = freshBossState('brutus');
    expect(brutusIsRampaging(st)).toBe(false);
    for (const phase of ['brace', 'dash', 'settle', 'return'] as const) {
      expect(brutusIsRampaging({ ...st, brutusPhase: phase })).toBe(true);
    }
  });

  it('leaves other bosses walking normally', () => {
    expect(brutusIsRampaging(freshBossState('giant_mole'))).toBe(false);
    expect(brutusIsRampaging(undefined)).toBe(false);
  });

  it('wears the demonic model for the telegraph and the lunge, and only then', () => {
    const st = freshBossState('brutus');
    expect(bossAnimVariant({ ...st, brutusPhase: 'brace' })).toBe(BRUTUS_DEMONIC_SLUG);
    expect(bossAnimVariant({ ...st, brutusPhase: 'dash' })).toBe(BRUTUS_DEMONIC_SLUG);
    // He calms down *before* he walks back — the player should see a plain dog trotting
    // home, not a demon, or the telegraph stops meaning "something is about to happen".
    expect(bossAnimVariant({ ...st, brutusPhase: 'settle' })).toBeUndefined();
    expect(bossAnimVariant({ ...st, brutusPhase: 'return' })).toBeUndefined();
    expect(bossAnimVariant({ ...st, brutusPhase: 'calm' })).toBeUndefined();
  });

  it('leaves every other boss on its own model', () => {
    for (const kind of MECHANIC_BOSSES) {
      if (kind === 'brutus') continue;
      expect(bossAnimVariant(freshBossState(kind))).toBeUndefined();
    }
    expect(bossAnimVariant(undefined)).toBeUndefined();
  });

  it('plays the paw-the-ground clip for the telegraph and the gallop for the charge', () => {
    const st = freshBossState('brutus');
    // `elapsed` counts up from 0 across the phase, so a full-timer brace is frame zero.
    expect(bossPhaseClip({ ...st, brutusPhase: 'brace', brutusTimer: BRUTUS_BRACE_SECS }))
      .toEqual({ name: 'rage', elapsed: 0 });
    expect(bossPhaseClip({ ...st, brutusPhase: 'dash', brutusTimer: 0 }))
      .toEqual({ name: 'charge', elapsed: BRUTUS_DASH_SECS });
    // Calming down and walking home are ordinary movement — the walk loop, not a clip.
    for (const phase of ['calm', 'settle', 'return'] as const) {
      expect(bossPhaseClip({ ...st, brutusPhase: phase })).toBeNull();
    }
  });

  it('still hands the Giant Mole its dig and surface clips', () => {
    // bossPhaseClip replaced a Mole-specific branch in the renderer; this is the
    // regression guard that generalising it did not drop the boss it came from.
    const st = freshBossState('giant_mole');
    expect(bossPhaseClip({ ...st, molePhase: 'dig', moleTimer: MOLE_DIG_SECS })?.name).toBe('burrow');
    expect(bossPhaseClip({ ...st, molePhase: 'emerge', moleTimer: MOLE_EMERGE_SECS })?.name).toBe('emerge');
    expect(bossPhaseClip({ ...st, molePhase: 'above' })).toBeNull();
  });

  it('leaves bosses with no mechanic clip on their walk loop', () => {
    for (const kind of MECHANIC_BOSSES) {
      if (kind === 'brutus' || kind === 'giant_mole') continue;
      expect(bossPhaseClip(freshBossState(kind))).toBeNull();
    }
    expect(bossPhaseClip(undefined)).toBeNull();
  });

  it('starts armed but not raging', () => {
    const st = freshBossState('brutus');
    expect(st.brutusPhase).toBe('calm');
    expect(st.brutusCooldown).toBe(0);
    expect(st.rageDamage).toBe(0);
    // Armed, but a Brutus nobody shoots never rampages.
    expect(brutusShouldRage(st.brutusCooldown!, st.rageDamage!, 1000)).toBe(false);
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

  it('opens the fight with Dusk fetching Dawn, and only once', () => {
    const dusk = freshBossState('dusk');
    expect(guardianShouldSummonTwin('dusk', dusk)).toBe(true);
    // Dawn is the one who gets fetched; she never fetches anyone.
    expect(guardianShouldSummonTwin('dawn', freshBossState('dawn'))).toBe(false);

    linkGuardianStates({ id: 'dusk-1', state: dusk }, { id: 'dawn-1', state: freshBossState('dawn') });
    expect(guardianShouldSummonTwin('dusk', dusk)).toBe(false);
  });

  it('a revived Dusk arrives already paired, so the Guardians never multiply', () => {
    // The player-reported bug: kill Dusk, let the revive window close, and a THIRD
    // boss appeared. A revived Dusk is a new enemy with a fresh state, so he read
    // "I haven't fetched Dawn yet" and fetched a second one — leaving the surviving
    // Dawn, the revived Dusk and a brand-new Dawn on the board together.
    const survivingDawn = freshBossState('dawn');
    const revivedDusk = freshBossState('dusk');
    expect(guardianShouldSummonTwin('dusk', revivedDusk)).toBe(true); // the trap, before pairing

    linkGuardianStates({ id: 'dawn-1', state: survivingDawn }, { id: 'dusk-2', state: revivedDusk });

    expect(guardianShouldSummonTwin('dusk', revivedDusk)).toBe(false);
    // ...and he is paired with the survivor, not off hunting a fresh twin.
    expect(revivedDusk.partnerId).toBe('dawn-1');
    expect(survivingDawn.partnerId).toBe('dusk-2');
    expect(revivedDusk.linked).toBe(true);
    expect(survivingDawn.linked).toBe(true);
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

  it('bumps the revive clock 10% (rounded up) over the old 12s', () => {
    expect(GUARDIAN_REVIVE_SECS).toBe(Math.ceil(12 * 1.1)); // 14
  });

  it('each twin leaks for 75% of a normal boss, never below 1', () => {
    expect(GUARDIAN_LEAK_MULT).toBe(0.75);
    expect(guardianLeakCost(8)).toBe(6);            // 8 × 0.75 = 6
    expect(guardianLeakCost(10)).toBe(8);           // 10 × 0.75 = 7.5 → 8
    expect(guardianLeakCost(1)).toBe(1);            // floor is 1, never 0
    // Both twins leaking still out-costs a single boss (2 × 0.75 = 1.5×).
    expect(guardianLeakCost(8) * 2).toBeGreaterThan(8);
  });

  // Players reported one Guardian charging them twice: it leaked, took its lives,
  // and the survivor then dragged it back up to leak again.
  it('only a killed twin is owed a resurrection — an escaped one is gone', () => {
    const st = freshBossState('dusk');
    expect(guardianCanRevive(st)).toBe(true);
    st.twinEscaped = true;
    expect(guardianCanRevive(st)).toBe(false);
  });
});

describe('Cerberus and the Summoned Souls', () => {
  it('has one soul per combat style, and no style twice', () => {
    expect([...SOUL_STYLES].sort()).toEqual(['magic', 'melee', 'ranged']);
  });

  it('names each clip after the style its soul locks', () => {
    expect(soulAnimSlug('melee')).toBe('soul_melee');
    expect(soulAnimSlug('ranged')).toBe('soul_ranged');
    expect(soulAnimSlug('magic')).toBe('soul_magic');
  });

  it('seeds him with no souls out and nothing locked', () => {
    const st = freshBossState('cerberus');
    expect(st.soulSummons).toBe(0);
    expect(st.lockedStyles).toEqual([]);
    expect(bossStyleMult(st, 'melee')).toBe(1);
  });

  it('summons a batch at each threshold, and only once each', () => {
    expect(cerberusShouldSummon(0.9, 0)).toBe(false);
    expect(cerberusShouldSummon(CERBERUS_SOUL_THRESHOLDS[0], 0)).toBe(true);
    // Already sent that batch: it won't re-send it just because HP is still low.
    expect(cerberusShouldSummon(0.5, 1)).toBe(false);
    expect(cerberusShouldSummon(CERBERUS_SOUL_THRESHOLDS[1], 1)).toBe(true);
    // Out of thresholds: no third batch, however low he goes.
    expect(cerberusShouldSummon(0.01, CERBERUS_SOUL_THRESHOLDS.length)).toBe(false);
  });

  it('locks exactly the styles whose souls are alive', () => {
    const st = freshBossState('cerberus');
    st.lockedStyles = ['melee', 'magic'];
    expect(bossStyleMult(st, 'melee')).toBe(CERBERUS_SOUL_LOCK_MULT);
    expect(bossStyleMult(st, 'magic')).toBe(CERBERUS_SOUL_LOCK_MULT);
    // The ranged soul is dead, so ranged is back to full: that is the reward for
    // picking the right one to kill.
    expect(bossStyleMult(st, 'ranged')).toBe(1);
  });

  it('is armoured against everything with all three souls up', () => {
    const st = freshBossState('cerberus');
    st.lockedStyles = [...SOUL_STYLES];
    for (const style of SOUL_STYLES) {
      expect(bossStyleMult(st, style)).toBe(CERBERUS_SOUL_LOCK_MULT);
    }
    // But never to *zero*: a board with no answer grinds badly, it does not hard-lock.
    expect(CERBERUS_SOUL_LOCK_MULT).toBeGreaterThan(0);
  });

  it('leaves styleless damage alone — a soul locks a style, and a burn has none', () => {
    const st = freshBossState('cerberus');
    st.lockedStyles = [...SOUL_STYLES];
    expect(bossStyleMult(st, undefined)).toBe(1);
    expect(soulLockMult(SOUL_STYLES, undefined)).toBe(1);
  });

  it('locks nothing when no soul stands', () => {
    expect(soulLockMult([], 'melee')).toBe(1);
    expect(soulLockMult(undefined, 'melee')).toBe(1);
  });

  it('enrages at its threshold', () => {
    expect(cerberusIsEnraged(CERBERUS_ENRAGE_HP + 0.01)).toBe(false);
    expect(cerberusIsEnraged(CERBERUS_ENRAGE_HP)).toBe(true);
  });
});

describe('the stall breaker', () => {
  const DT = 0.1;
  /** Run the clock for `secs`, feeding it the HP fraction the boss is at each frame.
   *  The boss is under continuous fire unless `engaged` says otherwise — the clock only
   *  runs while it is being fought, so every stall scenario is a *fight* by definition. */
  const run = (
    secs: number,
    hpAt: (t: number) => number,
    from: StallState = { hpFloor: 1, stallTimer: 0, stallStacks: 0 },
    engaged = true,
  ) => {
    let s = from;
    for (let t = 0; t < secs; t += DT) {
      if (engaged) s = { ...s, sinceHit: 0 };
      s = stepBossStall(s, hpAt(t), DT);
    }
    return s;
  };

  it('leaves a boss that is being ground down alone, however slowly', () => {
    // 1% of max HP every 4s — a crawl, but it is *winning*, and a fight that is
    // progressing must never be escalated.
    const s = run(120, (t) => 1 - t * 0.0025);
    expect(s.stallStacks).toBe(0);
    expect(s.hpFloor).toBeLessThan(0.75);
  });

  it('escalates a boss whose HP is going nowhere', () => {
    expect(run(BOSS_STALL_GRACE - 1, () => 1).stallStacks).toBe(0); // still in the grace period
    expect(run(BOSS_STALL_GRACE + 1, () => 1).stallStacks).toBe(1);
    expect(run(BOSS_STALL_GRACE + BOSS_STALL_STEP + 1, () => 1).stallStacks).toBe(2);
  });

  it('escalates the Hydra heal loop — the softlock this exists for', () => {
    // The reported bug: control but no damage. The player strips the Hydra to its vent
    // threshold, the vent heals it back above, and they strip it again — forever. HP
    // oscillates and never reaches a new low, so no progress is ever made.
    const s = run(90, (t) => 0.66 + 0.15 * Math.abs(Math.sin(t / 3)));
    expect(s.stallStacks).toBe(BOSS_STALL_MAX_STACKS);
    // At full stacks its self-heal is gone and it is CC-immune: the loop cannot continue.
    expect(stallHealMult(s.stallStacks)).toBe(0);
    expect(stallTenacityBonus(s.stallStacks)).toBeGreaterThanOrEqual(0.5);
  });

  it('drops every stack the moment the boss takes a real step down', () => {
    const stalled = run(BOSS_STALL_GRACE + BOSS_STALL_STEP * 3, () => 1);
    expect(stalled.stallStacks).toBeGreaterThan(1);
    const freed = stepBossStall(stalled, 1 - BOSS_STALL_PROGRESS, DT);
    expect(freed.stallStacks).toBe(0);
    expect(freed.stallTimer).toBe(0);
    expect(freed.hpFloor).toBeCloseTo(1 - BOSS_STALL_PROGRESS);
  });

  it('does not accept chip damage inside the noise as progress', () => {
    // Below the progress threshold the floor must hold, or a boss healing 15% a cycle
    // could reset the clock forever on the 0.5% it loses in between.
    const s = stepBossStall({ hpFloor: 0.5, stallTimer: 30, stallStacks: 3 }, 0.5 - BOSS_STALL_PROGRESS / 2, DT);
    expect(s.hpFloor).toBe(0.5);
    expect(s.stallStacks).toBe(3);
  });

  it('never starts the clock on a boss nobody has hit yet', () => {
    // The report: the countdown began at the spawn portal, so a boss walking in
    // unopposed arrived already hardened against control. An untouched boss is not in
    // a stalemate — it is winning — and must be off the clock entirely.
    const s = run(BOSS_STALL_GRACE * 4, () => 1, { hpFloor: 1, stallTimer: 0, stallStacks: 0 }, false);
    expect(s.stallTimer).toBe(0);
    expect(s.stallStacks).toBe(0);
    expect(bossIsEngaged(s.sinceHit)).toBe(false);
  });

  it('keeps counting through a brief lull, and stops once the fire really stops', () => {
    const fighting = run(BOSS_STALL_GRACE + BOSS_STALL_STEP + 1, () => 1);
    expect(fighting.stallStacks).toBe(2);
    // A gap shorter than the engage window is still the same fight.
    const blink = stepBossStall({ ...fighting, sinceHit: BOSS_STALL_ENGAGE_WINDOW - 1 }, 1, DT);
    expect(blink.stallStacks).toBe(2);
    expect(blink.stallTimer).toBeGreaterThan(fighting.stallTimer);
  });

  it('freezes the escalation when fire stops instead of refunding it', () => {
    // Freezing, not resetting: if disengaging wiped the stacks, a stalemated player could
    // hold fire for a moment and put the boss back to zero forever.
    const stalled = run(BOSS_STALL_GRACE + BOSS_STALL_STEP * 3, () => 1);
    const idle = run(60, () => 1, stalled, false);
    // A minute of silence buys at most the engage window, then the clock stops dead.
    expect(idle.stallTimer).toBeGreaterThanOrEqual(stalled.stallTimer);
    expect(idle.stallTimer).toBeLessThanOrEqual(stalled.stallTimer + BOSS_STALL_ENGAGE_WINDOW);
    // …and it resumes from there rather than from zero when the shooting starts again.
    expect(run(BOSS_STALL_STEP * 2, () => 1, idle).stallStacks)
      .toBeGreaterThan(stalled.stallStacks);
  });

  it('never lets the floor drift back up when the boss heals', () => {
    const s = run(20, (t) => (t < 5 ? 0.4 : 0.9)); // driven to 40%, then heals to 90%
    expect(s.hpFloor).toBeCloseTo(0.4);
  });

  it('caps the escalation', () => {
    expect(bossStallStacks(BOSS_STALL_GRACE + BOSS_STALL_STEP * 99)).toBe(BOSS_STALL_MAX_STACKS);
    expect(stallHealMult(BOSS_STALL_MAX_STACKS)).toBe(0); // floored, never negative
    expect(stallHealMult(0)).toBe(1);
    expect(stallHealMult(1)).toBeCloseTo(1 - BOSS_STALL_HEAL_PER_STACK);
  });

  it('arms the clock on every fresh boss', () => {
    const st = freshBossState('hydra');
    expect(st.hpFloor).toBe(1);
    expect(st.stallTimer).toBe(0);
    expect(st.stallStacks).toBe(0);
  });
});

describe('phaseResistedStyles (protection-prayer overheads)', () => {
  it('is empty for no boss state', () => {
    expect(phaseResistedStyles(undefined)).toEqual([]);
  });

  it('Zulrah prays against the two styles its form is NOT weak to', () => {
    const st = freshBossState('zulrah'); // phase 0 = serpentine, weak to magic
    expect(phaseResistedStyles(st).sort()).toEqual(['melee', 'ranged']);
    st.phaseIndex = 1; // tanzanite, weak to ranged
    expect(phaseResistedStyles(st).sort()).toEqual(['magic', 'melee']);
    st.phaseIndex = 2; // magma, weak to melee
    expect(phaseResistedStyles(st).sort()).toEqual(['magic', 'ranged']);
  });

  it('mirrors zulrahStyleMult — the resisted styles are exactly the cut ones', () => {
    const st = freshBossState('zulrah');
    const phase = ZULRAH_PHASES[st.phaseIndex];
    for (const s of ['melee', 'ranged', 'magic'] as const) {
      const cut = zulrahStyleMult(phase.weak, s) < 1;
      expect(phaseResistedStyles(st).includes(s)).toBe(cut);
    }
  });

  it('Cerberus prays against whatever styles his souls have locked', () => {
    const st = freshBossState('cerberus');
    expect(phaseResistedStyles(st)).toEqual([]); // no souls out yet
    st.lockedStyles = ['melee', 'magic'];
    expect(phaseResistedStyles(st).sort()).toEqual(['magic', 'melee']);
  });

  it('all-source blocks are NOT prayers — Vorkath ice / Hydra vent show none', () => {
    const vork = freshBossState('vorkath');
    vork.immune = true;
    expect(phaseResistedStyles(vork)).toEqual([]);
    const hydra = freshBossState('hydra');
    hydra.venting = true;
    expect(phaseResistedStyles(hydra)).toEqual([]);
  });
});

describe('Scurrius — shearing', () => {
  const MAX = 1000;

  it('shears on a hit at or above the threshold', () => {
    expect(scurriusShouldShear(50, MAX, 1, 0, 0)).toBe(true);
    expect(scurriusShouldShear(49, MAX, 1, 0, 0)).toBe(false);
  });

  it('ignores chip damage however often it lands', () => {
    for (let i = 0; i < 50; i++) expect(scurriusShouldShear(5, MAX, 1, 0, 0)).toBe(false);
  });

  it('is blocked by the cooldown, so one AoE volley cannot produce a litter', () => {
    expect(scurriusShouldShear(200, MAX, 1, 0.4, 0)).toBe(false);
  });

  it('is blocked by the live-rat cap', () => {
    expect(scurriusShouldShear(200, MAX, 1, 0, SCURRIUS_MAX_RATS)).toBe(false);
    expect(scurriusShouldShear(200, MAX, 1, 0, SCURRIUS_MAX_RATS - 1)).toBe(true);
  });

  it('stops shearing below the floor, so the endgame is a clean fight', () => {
    expect(scurriusShouldShear(200, MAX, SCURRIUS_SHEAR_FLOOR, 0, 0)).toBe(false);
    expect(scurriusShouldShear(200, MAX, SCURRIUS_SHEAR_FLOOR + 0.01, 0, 0)).toBe(true);
  });
});

describe('Scurrius — HP is conserved, never created', () => {
  const MAX = 1000;

  it('a rat carries the designed share of his max HP', () => {
    expect(scurriusRatHp(MAX, MAX)).toBe(Math.round(MAX * SCURRIUS_RAT_HP_FRAC));
  });

  it('never takes him below the shear floor', () => {
    const justAbove = MAX * SCURRIUS_SHEAR_FLOOR + 5;
    expect(scurriusRatHp(MAX, justAbove)).toBe(5);
  });

  it('never returns a negative amount at or under the floor', () => {
    expect(scurriusRatHp(MAX, MAX * SCURRIUS_SHEAR_FLOOR)).toBe(0);
    expect(scurriusRatHp(MAX, 0)).toBe(0);
  });

  it('shear then full refund is a round trip — the total never grows', () => {
    let king = MAX;
    const rat = scurriusRatHp(MAX, king);
    king -= rat;
    king += ratRefund(rat, king, MAX);
    expect(king).toBe(MAX);
  });

  it('a refund never overheals him past full', () => {
    expect(ratRefund(500, MAX - 10, MAX)).toBe(10);
  });

  it('a dead rat refunds nothing', () => {
    expect(ratRefund(0, 500, MAX)).toBe(0);
    expect(ratRefund(-3, 500, MAX)).toBe(0);
  });
});

describe('Scurrius — rat wandering', () => {
  it('stays inside the leash', () => {
    let n = 0;
    const rand = () => [0.1, 0.9, 0.5, 0.3][n++ % 4];
    for (let i = 0; i < 20; i++) {
      const p = ratWanderTarget(800, 400, rand, 1728, 768);
      expect(Math.hypot(p.x - 800, p.y - 400)).toBeLessThanOrEqual(SCURRIUS_WANDER_LEASH + 0.001);
    }
  });

  it('is clamped to the board, so a rat sheared at the edge cannot leave it', () => {
    const p = ratWanderTarget(5, 5, () => 0.99, 1728, 768, 26);
    expect(p.x).toBeGreaterThanOrEqual(26);
    expect(p.y).toBeGreaterThanOrEqual(26);
  });

  it('leaves the road — successive targets are not the same point', () => {
    let n = 0;
    const rand = () => [0.2, 0.8, 0.7, 0.4][n++ % 4];
    const a = ratWanderTarget(800, 400, rand, 1728, 768);
    const b = ratWanderTarget(800, 400, rand, 1728, 768);
    expect(a.x !== b.x || a.y !== b.y).toBe(true);
  });
});
