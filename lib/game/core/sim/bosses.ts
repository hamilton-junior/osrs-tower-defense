import type { Enemy, Point, EnemyType } from '../../types';
import { SPAWN_ANIM_SECONDS } from '../../types';
import { ENEMIES } from '../../data/enemies';
import { distanceSq, squareRange, advanceAlongPath, remainingPathDistance } from '../../systems/geometry';
import { GAME_SOUNDS } from '../sound';
import { zulrahPhaseIndex, recentDamageSum, pruneDamageEvents, jadHealPerTick, ZULRAH_PHASES, VORKATH_ICE_INTERVAL, VORKATH_ICE_DURATION, JAD_HEAL_THRESHOLD, JAD_HEALER_COUNT, JAD_HEALER_HP_FRAC, JAD_HEAL_WINDOW_SECS, JAD_HEAL_TICK_SECS, JAD_RESUMMON_COOLDOWN, hydraPhase, hydraShouldVent, hydraBreakTarget, hydraVentHeal, hydraHealSpoilsPerfect, hydraIsEnraged, HYDRA_VENT_SECS, HYDRA_VENT_COOLDOWN_SECS, HYDRA_SHATTER_VULN_SECS, HYDRA_ENRAGE_SPEED_MULT, moleBurrowInterval, moleBurrowTarget, MOLE_DIG_SECS, MOLE_UNDER_SECS, MOLE_EMERGE_SECS, stepStall, stallHealMult, isGuardian, guardianReviveHp, guardianCanRevive, linkGuardianStates, guardianShouldSummonTwin, GUARDIAN_REVIVE_SECS, GUARDIAN_ENRAGE_SPEED_MULT, GUARDIAN_PAIR_OFFSET, cerberusShouldSummon, cerberusIsEnraged, soulAnimSlug, SOUL_STYLES, CERBERUS_SOUL_HP_FRAC, CERBERUS_SOUL_ORBIT, CERBERUS_ENRAGE_SPEED_MULT, brutusShouldRage, brutusDashDirection, bossAnimVariant, BRUTUS_BRACE_SECS, BRUTUS_DASH_SECS, BRUTUS_SETTLE_SECS, BRUTUS_RAGE_COOLDOWN, BRUTUS_DASH_SPEED_MULT, BRUTUS_RETURN_SPEED_MULT, BRUTUS_EDGE_MARGIN, BRUTUS_SAY, BRUTUS_TRAMPLE_DISABLE_SECS, brutusTrampled, SCURRIUS_SHEAR_COOLDOWN, SCURRIUS_SQUEAK_INTERVAL, SCURRIUS_RAT_SPEED_MULT, SCURRIUS_WANDER_SECS, SCURRIUS_REFUND_RADIUS, SCURRIUS_SAY, SCURRIUS_MAX_RATS, SCURRIUS_SQUEAK_STOP, scurriusRatHp, ratWanderTarget, ratRefund, scorchSpan, pickScorchStart, scorchedTowers, breathBows, breathSlug, breathFlightTimes, litScorchPoints, KBD_FIRST_BREATH, KBD_BREATH_INTERVAL, KBD_INHALE_SECS, KBD_RECOVER_SECS, KBD_BURN_SECS, KBD_SCORCH_LENGTH, KBD_SAY, pickSiphonTarget, corpCoreHp, CORP_FIRST_CORE, CORP_CORE_INTERVAL, CORP_MAX_CORES, CORP_CORE_LATCH_DIST, CORP_SAY, GRAARDOR_GUARDS, GRAARDOR_SLAM_FIRST, GRAARDOR_SLAM_INTERVAL, GRAARDOR_SLAM_WINDUP, GRAARDOR_PRAYER_LOCK, GRAARDOR_SAY, graardorGuardHp, NEX_ACOLYTES, NEX_ACOLYTE_LEAD, NEX_WARD_MAX_SECS, NEX_SAY, nexAcolyteHp, nexNextWardIndex, type SiphonCandidate } from '../../systems/boss-mechanics';
import type { Scorch } from '../engine-state';
import { GRID, uid, enemyRadius, TOWER_BODY_RADIUS, ESCORT_ORBIT_DRIFT, JAD_HEALER_ORBIT, MOLE_DUST, GUARDIAN_LINK_COLOR, CORP_LINK_COLOR, HITSPLAT_LIFE } from '../engine-state';
import type { GameEngine } from '../engine';
import { makeEnemy, addRing, addBreath } from './waves';
import { bodyY } from '../../systems/enemy-anchor';

/**
 * Per-boss behaviour: the state machines that make each boss its own fight rather
 * than a bigger monster — Cerberus's souls, the Guardians' pair, the Mole's
 * burrow, Brutus's rage dash, the Hydra's vents, Vorkath's freeze, Jad's healers,
 * and Scurrius with his rats.
 *
 * The rules and thresholds are pure and tested in `systems/boss-mechanics.ts`;
 * this is where they touch the running world.
 */

/**
 * Drive the signature boss phases each frame (#4B). Zulrah rotates its weak
 * style; Vorkath raises a periodic ice shield (immune + freezes a tower); Jad
 * summons Yt-HurKot healers below half HP that claw back his recent damage
 * until killed. Pure phase maths live in `systems/boss-mechanics`; this owns
 * the timers, the healer entities, and the telegraph VFX.
 */
export function handleBossMechanics(eng: GameEngine, dt: number) {
  // Orphaned escorts (their boss died or leaked) serve no purpose, and since they
  // never walk the path they would otherwise sit there forever and block the wave
  // from ending. Keyed on the owner, so it holds for every kind of companion.
  for (let i = eng.enemies.length - 1; i >= 0; i--) {
    const e = eng.enemies[i];
    if (e.escort && !eng.enemies.some(o => o.id === e.ownerId)) eng.enemies.splice(i, 1);
  }
  // A tower is only siphoned for as long as the core holding it is standing there. The
  // link is cleared here rather than at the core's death, for the same reason the escort
  // cull above is: there are several ways for a core to stop existing (killed, its Beast
  // died, the wave ended), and one place that notices covers all of them.
  for (const t of eng.towers) {
    if (t.siphonedBy && !eng.enemies.some((c) => c.id === t.siphonedBy && c.coreLatched)) {
      t.siphonedBy = undefined;
    }
  }
  // Scurrius's rats are the opposite case: not escorts, so nothing above culls them,
  // and they drive themselves. Stepped over a snapshot because an absorbed rat splices
  // itself out — mutating the live array mid-walk would skip the enemy after it.
  for (const e of [...eng.enemies]) if (e.type === 'giant_rat') updateRat(eng, e, dt);
  for (const e of eng.enemies) {
    const st = e.bossState;
    if (!st) continue;
    st.timer += dt;
    stepStallClock(eng, e, dt);
    if (st.kind === 'zulrah') {
      const idx = zulrahPhaseIndex(st.timer);
      if (idx !== st.phaseIndex) {
        st.phaseIndex = idx;
        // A coloured shockwave in the new form's tint as it morphs.
        const pc = ZULRAH_PHASES[idx % ZULRAH_PHASES.length].color;
        addRing(eng, e.x, e.y, 8, 60, pc, 0.5, 4);
        // Morph cry: the boss's OWN voice (`bossphase_<kind>`), not the generic
        // teleport whoosh — and never its death clip, which would read as "it died"
        // on every form change. Falls back to the whoosh for a boss with no cry yet.
        const voice = `bossphase_${st.kind}`;
        eng.sound.play(voice in GAME_SOUNDS ? voice : 'wave', 55);
      }
    } else if (st.kind === 'vorkath') {
      updateVorkath(eng, e, dt);
    } else if (st.kind === 'jad') {
      updateJad(eng, e, dt);
    } else if (st.kind === 'hydra') {
      updateHydra(eng, e, dt);
    } else if (st.kind === 'giant_mole') {
      updateMole(eng, e, dt);
    } else if (isGuardian(st.kind)) {
      updateGuardian(eng, e, dt);
    } else if (st.kind === 'cerberus') {
      updateCerberus(eng, e, dt);
    } else if (st.kind === 'brutus') {
      updateBrutus(eng, e, dt);
    } else if (st.kind === 'scurrius') {
      updateScurrius(eng, e, dt);
    } else if (st.kind === 'kbd') {
      updateKbd(eng, e, dt);
    } else if (st.kind === 'corporeal_beast') {
      updateCorp(eng, e, dt);
    } else if (st.kind === 'graardor') {
      updateGraardor(eng, e, dt);
    } else if (st.kind === 'nex') {
      updateNex(eng, e, dt);
    }
    // The visual-state rule: a boss's current mechanic phase decides which model it is
    // drawn with. `animType` overrides the sprite/clip slug only, so stats, drops and
    // the Collection Log entry all stay on `type`. Assigned every frame (rather than
    // toggled at the phase edges) so there is exactly one place a phase→model mapping
    // can live, and no way for a boss to get stuck wearing the wrong one.
    e.animType = bossAnimVariant(st);
  }
}

/**
 * Advance a boss's stall clock — the guarantee that every boss fight *ends*.
 *
 * A board with control but no damage can otherwise hold a boss in place forever: it
 * never reaches the base (so the player never loses), it never dies (so they never
 * win), the wave never ends, and no gold comes in to build out of it. That is a run
 * with no exit, and a player who hits it has to reload and throw the run away.
 *
 * So the clock watches the one thing that decides the fight: is the boss being driven
 * to a new low? While it is, nothing happens here — a slow grind is still a win and
 * gets left alone. When it isn't, the boss starts shrugging off control and its
 * healing dries up, until it is either dead or walking. Both are endings.
 *
 * It only counts while the enemy is under fire (`sinceHit`). One nobody is shooting
 * isn't stuck — it is on its way to the base — so the clock never starts at the portal.
 *
 * **This is not a boss-only guarantee.** It was written for bosses, but the deadlock it
 * prevents needs neither a boss nor a healer: any enemy whose regeneration matches the
 * board's damage sits at a fixed HP forever, and a stun tower chain keeps it from
 * walking off, so the wave never ends. Every enemy runs the clock; a boss just keeps it
 * inside its {@link BossState} (which it needs for its phases anyway) while everything
 * else gets a bare {@link StallState} the first time this runs.
 */
export function stepStallClock(eng: GameEngine, e: Enemy, dt: number) {
  const st = e.bossState ?? (e.stall ??= { hpFloor: 1, stallTimer: 0, stallStacks: 0, sinceHit: Infinity });
  const before = st.stallStacks ?? 0;
  const next = stepStall(
    {
      hpFloor: st.hpFloor ?? 1,
      stallTimer: st.stallTimer ?? 0,
      stallStacks: before,
      sinceHit: st.sinceHit,
      stallFloor: st.stallFloor,
    },
    e.hp / e.maxHp,
    dt,
  );
  st.hpFloor = next.hpFloor;
  st.stallTimer = next.stallTimer;
  st.stallStacks = next.stallStacks;
  st.sinceHit = next.sinceHit;
  st.stallFloor = next.stallFloor;

  if (next.stallStacks <= before) return;
  // Announce only the first stack, and only for a boss — after that the boss bar carries
  // the count, and a toast per stalled imp would bury the mechanic it is explaining.
  // The ring still fires for anything, so a rank-and-file enemy shrugging off a stun
  // reads as a thing that happened rather than as the tower breaking.
  if (before === 0 && e.isBoss) {
    eng.notify(`${e.name} is breaking free of your control!`);
    eng.sound.play('wave', 60);
  }
  addRing(eng, e.x, e.y, 8, 72, '#ffcb05', 0.4, 3);
}

/** The enemy's stall-breaker escalation, wherever it keeps it. */
export function stallStacksOf(eng: GameEngine, e: Enemy): number {
  return e.bossState?.stallStacks ?? e.stall?.stallStacks ?? 0;
}

/**
 * Cerberus: the style-lock check. At each HP threshold he summons his three Summoned
 * Souls, and **each soul locks one combat style** — while the melee soul lives, melee
 * towers barely scratch him (see `soulLockMult` via `bossStyleMult`). With all three
 * standing he is armoured against everything.
 *
 * The decision that creates is *which soul to kill first*, and it depends on the board
 * you actually built: a mono-style board has exactly one soul that matters, a spread
 * board has to clear more of them. Jad's healers are interchangeable; these are not.
 */
export function updateCerberus(eng: GameEngine, e: Enemy, _dt: number) {
  const st = e.bossState!;
  const hpFrac = e.hp / e.maxHp;

  // Rebuild the locks from the souls still standing, every frame. Killing one frees its
  // style immediately — the reward has to be instant, or the player can't feel the
  // trade they just made.
  st.lockedStyles = eng.enemies
    .filter((s) => s.ownerId === e.id && s.soulStyle)
    .map((s) => s.soulStyle!);

  if (cerberusShouldSummon(hpFrac, st.soulSummons ?? 0)) {
    st.soulSummons = (st.soulSummons ?? 0) + 1;
    summonSouls(eng, e);
  }

  if (!st.enraged && cerberusIsEnraged(hpFrac)) {
    st.enraged = true;
    e.baseSpeed = Math.round(e.baseSpeed * CERBERUS_ENRAGE_SPEED_MULT);
    if (e.slowTimer <= 0) e.speed = e.baseSpeed;
    addRing(eng, e.x, e.y, 8, 90, '#ff6b3d', 0.7, 6);
    eng.notify('Cerberus enrages!');
    eng.sound.play('wave', 70);
  }
}

/** Summon Cerberus's trio: one soul per combat style, orbiting him. Any that were
 *  killed in the last batch come back — the threshold sends a *fresh* three. */
export function summonSouls(eng: GameEngine, cerb: Enemy) {
  // A soul still standing when the next trio is raised is one the player failed to
  // clear in time — read it before the filter below wipes the evidence.
  if (!cerb.debug && eng.enemies.some((s) => s.ownerId === cerb.id && s.soulStyle)) {
    eng.caStats.bossFlags.cerberusSoulSurvived = true;
  }
  // Whatever survives from the previous batch is cleared out, so the trio is always a
  // trio: three thresholds of one soul each would be a very different (and duller) fight.
  eng.enemies = eng.enemies.filter((s) => !(s.ownerId === cerb.id && s.soulStyle));
  const hp = Math.max(20, Math.round(cerb.maxHp * CERBERUS_SOUL_HP_FRAC));
  SOUL_STYLES.forEach((style, i) => {
    const ang = (i / SOUL_STYLES.length) * Math.PI * 2 - Math.PI / 2;
    eng.enemies.push({
      ...ENEMIES.summoned_soul,
      id: uid(),
      type: 'summoned_soul',
      // Each style is a different NPC in the cache, carrying that style's weapon — a
      // bow, a staff, a blade. The player reads which soul is which from the weapon,
      // not from a legend.
      animType: soulAnimSlug(style),
      name: `Summoned Soul (${style})`,
      escort: true,
      ownerId: cerb.id,
      soulStyle: style,
      orbit: ang,
      debug: cerb.debug, // a sandbox Cerberus summons sandbox souls
      x: cerb.x + Math.cos(ang) * CERBERUS_SOUL_ORBIT,
      y: cerb.y + Math.sin(ang) * CERBERUS_SOUL_ORBIT,
      hp,
      maxHp: hp,
      speed: 70,
      baseSpeed: 70,
      naturalSpeed: 70,
      pathIndex: cerb.pathIndex,
      slowTimer: 0,
      stunTimer: 0,
      tauntTimer: 0,
      groundTimer: 0,
      animTime: Math.random() * 2,
      spawnAnim: SPAWN_ANIM_SECONDS,
    });
  });
  addRing(eng, cerb.x, cerb.y, 10, 110, '#b7c6dd', 0.6, 5);
  eng.sound.play('wave', 65);
  eng.notify('Cerberus summons his Souls — each locks a combat style!');
}

/**
 * Grotesque Guardians: the kill-order check. Dusk arrives with Dawn, and while both
 * stand they share their stone — each takes halved damage (see `bossStyleMult`). Kill
 * one and the survivor breaks the link: full damage taken, but faster, and it starts
 * dragging its twin back up. Fail to finish it inside the window and the twin returns
 * on half health with the mitigation restored.
 *
 * So splitting them badly is a trap, and the intended play — bleed both, converge at
 * the end — is the one thing no other boss in the game asks for.
 */
export function updateGuardian(eng: GameEngine, e: Enemy, dt: number) {
  const st = e.bossState!;
  // Dusk brings his twin. Dawn is not in SCHEDULABLE_BOSSES precisely so that she can
  // never turn up without him; this is the only way she enters the field.
  if (guardianShouldSummonTwin(st.kind, st)) summonDawn(eng, e);

  // A failed lookup *is* the signal: the twin's id is still on the state after it
  // dies, and not finding it in `enemies` is how the survivor learns it is alone.
  const twin = st.partnerId ? eng.enemies.find((x) => x.id === st.partnerId) : undefined;
  const wasLinked = !!st.linked;
  st.linked = !!twin;

  if (twin) {
    // Reunited (or never parted): the stone is shared again and the rage subsides.
    if (st.enraged) {
      st.enraged = false;
      e.baseSpeed = Math.max(1, Math.round(e.baseSpeed / GUARDIAN_ENRAGE_SPEED_MULT));
      if (e.slowTimer <= 0) e.speed = e.baseSpeed;
    }
    st.reviveTimer = undefined;
    return;
  }

  // Alone. The moment it happens: enrage, and start hauling the twin back — unless
  // the twin escaped down the road, which is not a death and buys no resurrection.
  // `enraged` is the "I have already noticed I'm alone" flag: being reunited clears
  // it above, so this fires exactly once per separation. (It can't key off
  // `reviveTimer` any more — an escaped twin leaves that permanently unset.)
  const canRevive = guardianCanRevive(st);
  if (wasLinked || !st.enraged) {
    st.reviveTimer = canRevive ? GUARDIAN_REVIVE_SECS : undefined;
    if (!st.enraged) {
      st.enraged = true;
      e.baseSpeed = Math.round(e.baseSpeed * GUARDIAN_ENRAGE_SPEED_MULT);
      if (e.slowTimer <= 0) e.speed = e.baseSpeed;
    }
    addRing(eng, e.x, e.y, 8, 70, GUARDIAN_LINK_COLOR, 0.6, 5);
    eng.notify(canRevive
      ? `${e.name} enrages — kill it before it revives its twin!`
      : `${e.name} enrages — its twin is gone for good.`);
    eng.sound.play('wave', 60);
    return;
  }

  // No countdown to run: the twin escaped rather than died, so it never comes back.
  if (st.reviveTimer === undefined) return;
  st.reviveTimer -= dt;
  if (st.reviveTimer > 0) return;

  // The window closed with the survivor still standing: the twin comes back.
  reviveTwin(eng, e);
}

/** Dusk's opening move: Dawn joins him on the road, and the two are linked. */
export function summonDawn(eng: GameEngine, dusk: Enemy) {
  const st = dusk.bossState!;
  st.summonedTwin = true;
  const dawn = makeEnemy(eng, 'dawn', eng.wave);
  if (!dawn) return;
  dawn.debug = dusk.debug; // a sandbox Dusk brings a sandbox Dawn
  dawn.pathIndex = dusk.pathIndex;
  dawn.x = dusk.x;
  dawn.y = dusk.y - GUARDIAN_PAIR_OFFSET;
  dawn.laneOffset = -GUARDIAN_PAIR_OFFSET; // she flies a lane clear of him, the whole way
  dawn.spawnAnim = SPAWN_ANIM_SECONDS;
  linkGuardians(eng, dusk, dawn);
  eng.enemies.push(dawn);
  // She never comes through the wave queue, so count the sighting here or the
  // Collection Log would never learn she exists.
  if (!dawn.debug) {
    eng.bossesSeen = { ...eng.bossesSeen, dawn: (eng.bossesSeen.dawn ?? 0) + 1 };
  }
  addRing(eng, dawn.x, dawn.y, 6, 60, GUARDIAN_LINK_COLOR, 0.7, 5);
  eng.notify('Dawn joins Dusk — they share their stone!');
}

/** Haul a fallen Guardian back up beside its twin, on half health, link restored. */
export function reviveTwin(eng: GameEngine, survivor: Enemy) {
  eng.caStats.bossFlags.duskDawnClean = false;
  const st = survivor.bossState!;
  const type = st.twinType;
  if (!type) return;
  const twin = makeEnemy(eng, type as EnemyType, eng.wave);
  if (!twin) return;
  twin.debug = survivor.debug;
  twin.pathIndex = survivor.pathIndex;
  twin.x = survivor.x;
  twin.y = survivor.y - GUARDIAN_PAIR_OFFSET;
  // Dawn always flies the side lane; Dusk always walks the road. Whichever of them came
  // back, it comes back into its own lane, so the pair never merges into one silhouette.
  twin.laneOffset = type === 'dawn' ? -GUARDIAN_PAIR_OFFSET : 0;
  twin.hp = guardianReviveHp(twin.maxHp);
  twin.spawnAnim = SPAWN_ANIM_SECONDS;
  linkGuardians(eng, survivor, twin);
  eng.enemies.push(twin);
  // The rage was for being alone; it isn't any more.
  if (st.enraged) {
    st.enraged = false;
    survivor.baseSpeed = Math.max(1, Math.round(survivor.baseSpeed / GUARDIAN_ENRAGE_SPEED_MULT));
    if (survivor.slowTimer <= 0) survivor.speed = survivor.baseSpeed;
  }
  st.reviveTimer = undefined;
  addRing(eng, twin.x, twin.y, 4, 80, GUARDIAN_LINK_COLOR, 0.8, 6);
  eng.sound.play('wave', 70);
  eng.notify(`${twin.name} rises again!`);
}

/** Point two Guardians at each other and switch the shared-stone mitigation on. */
export function linkGuardians(eng: GameEngine, a: Enemy, b: Enemy) {
  linkGuardianStates({ id: a.id, state: a.bossState! }, { id: b.id, state: b.bossState! });
}

/**
 * Giant Mole: the mobility check. It walks for a while, then **burrows** — the real
 * OSRS dig animation, a beat underground where it is invisible, untargetable and
 * immune, and the surface animation several waypoints further along. It skips the
 * stretch you fortified, so a board that funnels everything into one kill-box watches
 * it reappear *past* the box.
 *
 * The fairness is in the guardrail and the tell: it will not dig once the final
 * approach is all that is left (`moleCanBurrow`), and while it is under, the churning
 * mound is drawn at the spot it will surface — so the player can see the reposition
 * coming and has the dig, the climb-out and the mound to shoot at. Below a quarter of
 * its health it digs more often. Cycle maths live in `systems/boss-mechanics`.
 */
export function updateMole(eng: GameEngine, e: Enemy, dt: number) {
  const st = e.bossState!;
  st.moleTimer = (st.moleTimer ?? 0) - dt;
  if (st.moleTimer > 0) return;

  if (st.molePhase === 'above') {
    // Nothing to gain (it's on the final approach, or the dig would barely move it) —
    // it walks the rest out. Re-arm rather than special-case: it only ever gets
    // closer to the base, so this simply keeps returning null.
    const target = moleBurrowTarget(eng.path, e.pathIndex, e.x, e.y);
    if (!target) {
      st.moleTimer = moleBurrowInterval(e.hp / e.maxHp);
      return;
    }
    st.molePhase = 'dig';
    st.moleTimer = MOLE_DIG_SECS;
    addRing(eng, e.x, e.y, 4, 42, MOLE_DUST, 0.6, 4);
    eng.sound.play('wave', 45);
    eng.notify('The Giant Mole starts digging!');
  } else if (st.molePhase === 'dig') {
    // Under it goes — and it comes up somewhere else. Moving it *now* (rather than on
    // surfacing) is what keeps it un-hittable in transit, and it puts the mound
    // telegraph at the destination for the whole underground beat. `null` can't
    // happen here (the `above` branch already checked), but if the road ever changed
    // mid-dig, standing still is the safe answer.
    const target = moleBurrowTarget(eng.path, e.pathIndex, e.x, e.y);
    st.molePhase = 'under';
    st.moleTimer = MOLE_UNDER_SECS;
    st.immune = true; // `bossStyleMult` short-circuits to 0 (shared with Vorkath's ice)
    // Drop it from every tower that had it locked. `fireTowers` would re-acquire on
    // its next pass anyway (`inReach` rejects a hidden Mole), but it runs *before*
    // this in the frame, so without the sweep a tower keeps its aim on a hole in the
    // ground for a frame and burns a shot into it for zero damage.
    for (const t of eng.towers) if (t.targetId === e.id) t.targetId = null;
    addRing(eng, e.x, e.y, 6, 34, MOLE_DUST, 0.7, 5); // the hole it leaves behind
    if (target) {
      e.pathIndex = target.pathIndex;
      e.x = target.x;
      e.y = target.y;
    }
  } else if (st.molePhase === 'under') {
    st.molePhase = 'emerge';
    st.moleTimer = MOLE_EMERGE_SECS;
    st.immune = false; // climbing out: hittable again, and it has not moved yet
    st.burrows = (st.burrows ?? 0) + 1;
    addRing(eng, e.x, e.y, 4, 48, MOLE_DUST, 0.6, 5);
    eng.sound.play('wave', 55);
    eng.notify('The Giant Mole surfaces ahead!');
  } else {
    st.molePhase = 'above';
    st.moleTimer = moleBurrowInterval(e.hp / e.maxHp);
  }
}

/**
 * Brutus: the first boss on the ladder, and the gentlest thing a boss can do.
 *
 * Hurt him past {@link BRUTUS_RAGE_DAMAGE_FRAC} of his health while he is off cooldown
 * and he **rampages**: stops dead and turns into Demonic Brutus (the telegraph, with an
 * overhead shout), picks the nearest tower and charges *off* the road straight at it,
 * calms back into a plain bull, then walks back to the exact point he left the path
 * from and carries on.
 *
 * He never gains ground — the charge leaves the road and the walk back is mandatory —
 * so unlike the Mole he cannot bypass anything. What he takes is the *damage window*
 * and, if you built tight against the road, a tower: anything his body ploughs through
 * is knocked offline for {@link BRUTUS_TRAMPLE_DISABLE_SECS} seconds. Cycle maths and
 * the phase→model mapping live in `systems/boss-mechanics`.
 */
export function updateBrutus(eng: GameEngine, e: Enemy, dt: number) {
  const st = e.bossState!;
  st.brutusCooldown = Math.max(0, (st.brutusCooldown ?? 0) - dt);

  // Calm: walking the road normally, waiting to be provoked.
  if (!st.brutusPhase || st.brutusPhase === 'calm') {
    if (!brutusShouldRage(st.brutusCooldown, st.rageDamage ?? 0, e.maxHp)) return;
    st.brutusPhase = 'brace';
    st.brutusTimer = BRUTUS_BRACE_SECS;
    st.rageDamage = 0;
    // The spot he must come back to. Captured *before* he moves, so it is always a
    // point he legitimately walked to along the path.
    st.homeX = e.x;
    st.homeY = e.y;
    // He picks a tower and runs at it. `from`/`to` describe the stretch of road he is
    // on and are only the empty-board fallback (step off the road perpendicular to it,
    // not to the screen); on the last segment there is no `to`, and a zero-length
    // segment still yields a defined side.
    const from = eng.path[e.pathIndex] ?? { x: e.x, y: e.y };
    const to = eng.path[e.pathIndex + 1] ?? { x: e.x, y: e.y };
    const dir = brutusDashDirection(from, to, e, nearestTower(eng, e));
    st.dashX = dir.x;
    st.dashY = dir.y;
    e.say = BRUTUS_SAY;
    e.sayTimer = BRUTUS_BRACE_SECS + BRUTUS_DASH_SECS;
    addRing(eng, e.x, e.y, 6, 46, '#d4452f', 0.5, 4);
    eng.sound.play('wave', 55);
    return;
  }

  // The walk home ends on arrival, not on a clock — the point is that he returns to
  // *exactly* where he left, however far the lunge carried him.
  if (st.brutusPhase === 'return') {
    const dx = (st.homeX ?? e.x) - e.x;
    const dy = (st.homeY ?? e.y) - e.y;
    const d = Math.hypot(dx, dy);
    if (d < 4) {
      e.x = st.homeX ?? e.x;
      e.y = st.homeY ?? e.y;
      st.brutusPhase = 'calm';
      st.brutusCooldown = BRUTUS_RAGE_COOLDOWN;
      st.rampages = (st.rampages ?? 0) + 1;
    } else {
      const step = e.speed * BRUTUS_RETURN_SPEED_MULT * dt;
      e.x += (dx / d) * step;
      e.y += (dy / d) * step;
    }
    return;
  }

  if (st.brutusPhase === 'dash') {
    // Off the road he goes. Clamped to the board so a lunge at the edge cannot park
    // him outside it, where nothing could reach him and he could never walk back.
    const step = e.speed * BRUTUS_DASH_SPEED_MULT * dt;
    e.x = Math.max(BRUTUS_EDGE_MARGIN, Math.min(eng.width - BRUTUS_EDGE_MARGIN, e.x + (st.dashX ?? 0) * step));
    e.y = Math.max(BRUTUS_EDGE_MARGIN, Math.min(eng.height - BRUTUS_EDGE_MARGIN, e.y + (st.dashY ?? 0) * step));
    // Anything standing in the charge gets flattened. Tested every frame of the dash,
    // not once at the end, because at 3.6× speed he crosses a tower between two frames.
    for (const tower of brutusTrampled(eng.towers, e.x, e.y, enemyRadius(e), TOWER_BODY_RADIUS)) {
      if (tower.disabledTimer > 0) continue; // already down — don't refresh it mid-charge
      tower.disabledTimer = BRUTUS_TRAMPLE_DISABLE_SECS;
      addRing(eng, tower.x, tower.y, 6, 34, '#d4452f', 0.4, 3);
      eng.sound.play('combat_block', 55);
    }
  }

  st.brutusTimer = (st.brutusTimer ?? 0) - dt;
  if (st.brutusTimer > 0) return;

  if (st.brutusPhase === 'brace') {
    st.brutusPhase = 'dash';
    st.brutusTimer = BRUTUS_DASH_SECS;
  } else if (st.brutusPhase === 'dash') {
    st.brutusPhase = 'settle';
    st.brutusTimer = BRUTUS_SETTLE_SECS;
    // The rage drops here: `bossAnimVariant` puts the plain bull back for `settle`, and
    // the shout goes with it. He stands still for a beat looking sheepish.
    e.say = undefined;
    e.sayTimer = 0;
    addRing(eng, e.x, e.y, 4, 30, '#8a5a3b', 0.4, 3);
  } else {
    st.brutusPhase = 'return';
  }
}

/**
 * The tower Brutus charges: the nearest one, measured to the tower itself rather than
 * to its range edge, because what he is running at is the building.
 *
 * Towers already knocked offline are passed over while any live tower remains. His
 * cooldown is longer than the disable, but not by much, and without this the same
 * unlucky tower nearest a bend would eat every charge in a row while the rest of the
 * board never learned the mechanic exists. If everything standing is already down he
 * charges the nearest anyway — refusing to charge would be the stranger reading.
 */
export function nearestTower(eng: GameEngine, e: Enemy): Point | null {
  let best: Point | null = null;
  let bestD = Infinity;
  let fallback: Point | null = null;
  let fallbackD = Infinity;
  for (const t of eng.towers) {
    const d = distanceSq(t.x, t.y, e.x, e.y);
    if (d < fallbackD) { fallbackD = d; fallback = { x: t.x, y: t.y }; }
    if (t.disabledTimer > 0) continue;
    if (d < bestD) { bestD = d; best = { x: t.x, y: t.y }; }
  }
  return best ?? fallback;
}

/**
 * Alchemical Hydra: the burst check. At each HP threshold it opens a chemical
 * vent — hardened (x0.2 damage, see `bossStyleMult`) and regenerating — and the
 * player has a short window to land enough damage to shatter it. Shattering
 * advances the phase, arcs lightning through a line of towers, and leaves the
 * Hydra briefly vulnerable. Failing lets the banked heal stand, and knocking it
 * back down simply re-opens the vent: a stall, never a wipe. Below a tenth of
 * its health it enrages. Vent/phase maths live in `systems/boss-mechanics`.
 */
export function updateHydra(eng: GameEngine, e: Enemy, dt: number) {
  const st = e.bossState!;
  const frac = e.hp / e.maxHp;

  if (st.ventCooldown && st.ventCooldown > 0) st.ventCooldown -= dt;

  if (st.venting) {
    // Regenerate while the vent holds, and check the break target. The stall-breaker
    // throttles the heal: this regen is precisely what lets a vent undo a whole cycle
    // of a thin board's damage, so a Hydra that has been going nowhere loses it and
    // the board that was *nearly* enough finally gets through.
    const heal = hydraVentHeal(e.maxHp, dt) * stallHealMult(st.stallStacks ?? 0);
    const before = e.hp;
    e.hp = Math.min(e.maxHp, e.hp + heal);
    // Perfect Hydra only breaks on HP that actually went back on the bar, and only
    // once it adds up — a vent shattered the instant it opened healed nothing worth
    // failing the task over.
    st.ventHealed = (st.ventHealed ?? 0) + (e.hp - before);
    if (hydraHealSpoilsPerfect(st.ventHealed, e.maxHp)) eng.caStats.bossFlags.hydraVentHealed = true;
    st.ventTimer = (st.ventTimer ?? 0) - dt;
    if ((st.ventDamage ?? 0) >= hydraBreakTarget(e.maxHp)) shatterHydraVent(eng, e);
    else if (st.ventTimer <= 0) {
      // Window closed unbroken: the heal it banked stands and the vent seals. It stays
      // open — full damage — for the cooldown, so the board always gets its swing back.
      st.venting = false;
      st.ventDamage = 0;
      st.ventCooldown = HYDRA_VENT_COOLDOWN_SECS;
      eng.notify('The Hydra seals its vent — not enough damage!');
      addRing(eng, e.x, e.y, 40, 6, hydraPhase(st.shattered ?? 0).color, 0.45, 3);
    }
  } else if (hydraShouldVent(frac, st.shattered ?? 0, false, st.ventCooldown ?? 0)) {
    st.venting = true;
    st.ventTimer = HYDRA_VENT_SECS;
    st.ventDamage = 0;
    eng.notify('The Hydra vents chemicals — break it!');
    addRing(eng, e.x, e.y, 8, 64, '#b6ff6a', 0.55, 4);
    eng.sound.play('hit', 65);
  }

  // Enrage: the final phase. Raise `baseSpeed` (not `speed`) so slows keep
  // working — they recompute off it — and leave `naturalSpeed` alone so the UI
  // correctly reads the Hydra as hastened.
  if (!st.enraged && hydraIsEnraged(frac)) {
    st.enraged = true;
    e.baseSpeed = Math.round(e.baseSpeed * HYDRA_ENRAGE_SPEED_MULT);
    if (e.slowTimer <= 0) e.speed = e.baseSpeed;
    eng.notify('The Hydra enrages!');
    addRing(eng, e.x, e.y, 10, 84, '#d4452f', 0.6, 5);
    eng.sound.play('wave', 70);
  }
}

/** A vent breaks: advance the phase and open a short vulnerability window as the
 *  reward for the burst. */
export function shatterHydraVent(eng: GameEngine, e: Enemy) {
  const st = e.bossState!;
  st.venting = false;
  st.ventDamage = 0;
  st.shattered = (st.shattered ?? 0) + 1;
  eng.caStats.bossFlags.hydraVentsBroken += 1;
  e.vulnTimer = Math.max(e.vulnTimer ?? 0, HYDRA_SHATTER_VULN_SECS);
  const phase = hydraPhase(st.shattered);
  addRing(eng, e.x, e.y, 6, 90, phase.color, 0.6, 5);
  eng.sound.play('wave', 60);
  eng.notify(`The Hydra's vent shatters — ${phase.name} phase!`);
}

/** Vorkath: alternate a vulnerable window and a short ice shield. While the
 *  shield is up Vorkath is immune — the player must weather it, not out-DPS it. */
export function updateVorkath(eng: GameEngine, e: Enemy, dt: number) {
  const st = e.bossState!;
  st.iceTimer = (st.iceTimer ?? VORKATH_ICE_INTERVAL) - dt;
  if (st.iceTimer > 0) return;
  if (st.immune) {
    // Shield ends → vulnerable again until the next interval.
    st.immune = false;
    st.iceTimer = VORKATH_ICE_INTERVAL;
  } else {
    // Raise the shield: immune for the duration.
    st.immune = true;
    st.iceTimer = VORKATH_ICE_DURATION;
    addRing(eng, e.x, e.y, 10, 70, '#bfe9ff', 0.5, 4); // a frost burst as the shield raises
    eng.notify('Vorkath raises an ice shield!');
    eng.sound.play('bossshield_vorkath', 70);
  }
}

/** Jad: below half HP he summons Yt-HurKot healers; while any live, he
 *  regenerates a slice of the damage dealt to him over the last few seconds.
 *  Recent damage is recorded in `damage()`; here we prune it, summon/re-summon,
 *  and apply the heal on a tick. */
export function updateJad(eng: GameEngine, e: Enemy, dt: number) {
  const st = e.bossState!;
  const now = eng.gameTime;
  st.recentDamage = pruneDamageEvents(st.recentDamage ?? [], now, JAD_HEAL_WINDOW_SECS);

  const healersAlive = eng.enemies.some(h => h.healer && h.ownerId === e.id);
  if (!healersAlive && st.healSummoned) {
    // Batch wiped — start the re-summon cooldown (once).
    st.healSummoned = false;
    st.resummonTimer = JAD_RESUMMON_COOLDOWN;
  }
  if (st.resummonTimer && st.resummonTimer > 0) st.resummonTimer -= dt;

  // Summon (or re-summon, once the cooldown elapses) while below the threshold.
  const belowThreshold = e.hp <= e.maxHp * JAD_HEAL_THRESHOLD;
  if (belowThreshold && !st.healSummoned && (st.resummonTimer ?? 0) <= 0) {
    st.healSummoned = true;
    summonJadHealers(eng, e);
    eng.notify('Jad summons Yt-HurKot healers!');
  }

  if (healersAlive && e.hp < e.maxHp) {
    st.healTickTimer = (st.healTickTimer ?? 0) + dt;
    if (st.healTickTimer >= JAD_HEAL_TICK_SECS) {
      st.healTickTimer -= JAD_HEAL_TICK_SECS;
      const heal = jadHealPerTick(recentDamageSum(st.recentDamage, now, JAD_HEAL_WINDOW_SECS));
      if (heal > 0) {
        e.hp = Math.min(e.maxHp, e.hp + heal);
        eng.caStats.bossFlags.jadHealed = true;
        // A green "heal" splat floats off Jad so the regen reads clearly.
        eng.hitsplats.push({ x: e.x + (Math.random() - 0.5) * 16, y: bodyY(e) - 18, value: heal, kind: 'heal', life: HITSPLAT_LIFE });
        for (let i = 0; i < 3; i++) {
          eng.particles.push({ x: e.x + (Math.random() - 0.5) * 20, y: e.y, vx: (Math.random() - 0.5) * 30, vy: -30 - Math.random() * 30, life: 0.5, maxLife: 0.5, color: '#48d04a', size: 2 });
        }
      }
    }
  }
}

/** Spawn Jad's ring of stationary healers. They don't walk the path or leak,
 *  award nothing on death (`debug`), and exist only to be cut down. */
export function summonJadHealers(eng: GameEngine, jad: Enemy) {
  const hp = Math.max(20, Math.round(jad.maxHp * JAD_HEALER_HP_FRAC));
  for (let i = 0; i < JAD_HEALER_COUNT; i++) {
    const ang = (i / JAD_HEALER_COUNT) * Math.PI * 2 - Math.PI / 2;
    eng.enemies.push({
      ...ENEMIES.yt_hurkot,
      id: uid(),
      type: 'yt_hurkot', // its own type now → its own Collection Log line + kill count
      name: 'Yt-HurKot',
      escort: true,
      ownerId: jad.id,
      healer: true,
      orbit: ang,
      debug: jad.debug, // inherit sandbox flag so a debug Jad spawns debug healers
      x: jad.x + Math.cos(ang) * JAD_HEALER_ORBIT,
      y: jad.y + Math.sin(ang) * JAD_HEALER_ORBIT,
      hp,
      maxHp: hp,
      // A follow speed (px/s): fast enough to keep formation as Jad advances.
      speed: 70,
      baseSpeed: 70,
      naturalSpeed: 70,
      renderScale: 0.7,
      pathIndex: jad.pathIndex,
      slowTimer: 0,
      stunTimer: 0,
      tauntTimer: 0,
      groundTimer: 0,
      animTime: Math.random() * 2,
      spawnAnim: SPAWN_ANIM_SECONDS,
    });
  }
  addRing(eng, jad.x, jad.y, 10, 80, '#48d04a', 0.55, 4); // a green summon pulse
  eng.sound.play('wave', 60); // summon vwoop
}

/** Rats currently alive that belong to this king. */
export function liveRatsOf(eng: GameEngine, kingId: string): number {
  let n = 0;
  for (const e of eng.enemies) if (e.type === 'giant_rat' && e.ownerId === kingId) n++;
  return n;
}

/**
 * Split a Giant rat off Scurrius: the rat's HP comes **out of his bar in the same
 * frame**, which is the whole mechanic made visible in one beat — a creature appears
 * and his health drops by exactly what it carries.
 *
 * The rat is a plain enemy, never an `escort`: it has to outlive him. See the note in
 * the plan — an escort would be culled the moment he dies, and the HP that left his
 * bar would vanish with it.
 */
export function shearRat(eng: GameEngine, king: Enemy) {
  const st = king.bossState!;
  const hp = scurriusRatHp(king.maxHp, king.hp);
  if (hp <= 0) return;
  king.hp -= hp;
  st.scurriusShearCooldown = SCURRIUS_SHEAR_COOLDOWN;
  st.ratsShorn = (st.ratsShorn ?? 0) + 1;
  const speed = king.speed * SCURRIUS_RAT_SPEED_MULT;
  const target = ratWanderTarget(king.x, king.y, Math.random, eng.width, eng.height);
  eng.enemies.push({
    ...ENEMIES.giant_rat,
    id: uid(),
    type: 'giant_rat',
    name: 'Giant Rat',
    ownerId: king.id,
    // The field renderer resolves clips off `animType`, never the data table's
    // `animSlug` (that names the Collection Log's face). Carry the table's slug
    // across explicitly or the rat falls back to a static sprite and the baked
    // `rat` clips it deliberately points at go unused — same move as a Cerberus soul.
    animType: ENEMIES.giant_rat.animSlug,
    debug: king.debug,
    x: king.x,
    y: king.y,
    hp,
    maxHp: hp,
    speed,
    baseSpeed: speed,
    naturalSpeed: speed,
    pathIndex: king.pathIndex,
    ratPhase: 'wander',
    ratTimer: SCURRIUS_WANDER_SECS,
    ratTargetX: target.x,
    ratTargetY: target.y,
    ratOriginX: king.x,
    ratOriginY: king.y,
    slowTimer: 0,
    stunTimer: 0,
    tauntTimer: 0,
    groundTimer: 0,
    animTime: Math.random() * 2,
    spawnAnim: SPAWN_ANIM_SECONDS,
  });
  addRing(eng, king.x, king.y, 6, 40, '#c9b28a', 0.45, 3);
  eng.sound.play('hit', 45);
}


/**
 * The King Black Dragon: he sets the board on fire, not the player.
 *
 * A two-beat cycle. He flies the road for {@link KBD_BREATH_INTERVAL} seconds, then
 * **inhales**: he plants himself, shouts, and the stretch of road he has picked starts
 * smouldering for {@link KBD_INHALE_SECS} (three ticks). Then the breath lands, that
 * exact stretch burns for {@link KBD_BURN_SECS}, and every tower whose range covers it
 * hits for half until it goes out.
 *
 * The stretch is not random and not in front of him: {@link pickScorchStart} finds the
 * one the *most* towers are covering. That is the whole boss — the answer to him is the
 * shape of the defence, and a killbox is the shape he punishes hardest.
 *
 * The target is locked at the start of the tell, not at the moment the fire lands, so
 * what smoulders is exactly what burns. Building a tower into the window is allowed to
 * be a mistake; being lied to by the telegraph is not.
 */
export function updateKbd(eng: GameEngine, e: Enemy, dt: number) {
  const st = e.bossState!;
  st.kbdTimer = (st.kbdTimer ?? KBD_FIRST_BREATH) - dt;
  if (st.kbdTimer > 0) return;

  if (st.kbdPhase === 'recover') {
    // Back on all fours; the fire is already on the road and lives its own life now.
    st.kbdPhase = 'fly';
    st.kbdTimer = KBD_BREATH_INTERVAL;
    return;
  }

  if (st.kbdPhase !== 'inhale') {
    // The tell. Pick the stretch now and lay the smoulder over it.
    const towers = eng.towers.map((t) => ({
      x: t.x, y: t.y,
      // The tower's *live* reach, cache-warm from `fireTowers` earlier this frame; a
      // tower that has never fired (or was just built) falls back to its own range, so
      // the pick is never blind to it.
      half: squareRange(eng.statsCache.get(t.id)?.stats.range ?? t.range, GRID),
    }));
    const start = pickScorchStart(eng.path, towers, KBD_SCORCH_LENGTH);
    st.scorchAt = scorchSpan(eng.path, start, KBD_SCORCH_LENGTH);
    st.kbdPhase = 'inhale';
    st.kbdTimer = KBD_INHALE_SECS;
    e.say = KBD_SAY;
    e.sayTimer = KBD_INHALE_SECS;
    eng.scorches.push({ points: st.scorchAt, timer: 0, life: KBD_INHALE_SECS, warning: true });
    addRing(eng, e.x, e.y, 6, 40, '#ff9d3d', 0.5, 3);
    // Louder than the breath that follows: the tell is the beat the player has to act on.
    eng.sound.play('bossplant_kbd', 75);
    return;
  }

  // The breath lands on the stretch that was telegraphed — one gout of dragonfire per
  // patch, thrown from his mouth, and each patch catching as its own gout arrives. The
  // fire therefore sweeps down the road at the speed of the breath: the player sees where
  // it came from, and the burn never appears out of nothing.
  const points = st.scorchAt ?? [];
  if (points.length > 0) {
    const mouth = { x: e.x, y: e.y - enemyRadius(e) * 0.35 };
    const lit = breathFlightTimes(mouth, points);
    eng.scorches.push({ points, timer: 0, life: KBD_BURN_SECS + Math.max(...lit), warning: false, lit });
    // Exactly one gout per patch of road — the volley the player counts in the air is
    // the fire that lands — each on its own arc so they do not overlap into a single
    // streak, and all in the colour of *this* breath.
    const bows = breathBows(points.length);
    const slug = breathSlug(st.breaths ?? 0);
    for (let i = 0; i < points.length; i++) {
      addBreath(eng, mouth.x, mouth.y, points[i].x, points[i].y, lit[i], bows[i], slug);
    }
  }
  st.scorchAt = undefined;
  st.kbdPhase = 'recover';
  st.kbdTimer = KBD_RECOVER_SECS;
  st.breaths = (st.breaths ?? 0) + 1;
  e.say = undefined;
  e.sayTimer = 0;
  eng.sound.play('bossbreath_kbd', 65);
}

/**
 * Age the fires on the road, and mark whoever is standing over them.
 *
 * Runs every frame regardless of whether the dragon is still alive — a scorch is board
 * state, not his, so killing him mid-breath does not put the fire out. `scorchedTimer`
 * is re-armed here rather than counted down per tower, so a tower that walks out of
 * (or into) a fire's reach — a range upgrade, a new fire, the old one going out — is
 * always reading the truth this frame, and nothing has to be cleaned up when a scorch
 * expires.
 *
 * Telegraphs (`warning`) age and are drawn, but scorch nobody: the tell is a warning,
 * not the damage.
 */
export function updateScorches(eng: GameEngine, dt: number) {
  for (let i = eng.scorches.length - 1; i >= 0; i--) {
    const s = eng.scorches[i];
    s.timer += dt;
    if (s.timer >= s.life) eng.scorches.splice(i, 1);
  }
  if (eng.scorches.length === 0 && !eng.towers.some((t) => (t.scorchedTimer ?? 0) > 0)) return;
  const burning: Scorch[] = eng.scorches.filter((s) => !s.warning);
  for (const t of eng.towers) t.scorchedTimer = 0;
  if (burning.length === 0) return;
  for (const s of burning) {
    const towers = eng.towers.map((t) => ({
      t, x: t.x, y: t.y,
      half: squareRange(eng.statsCache.get(t.id)?.stats.range ?? t.range, GRID),
    }));
    // The remaining burn is what the tower is told, so the ember overlay dies with the
    // fire that caused it rather than lingering a frame past it.
    const left = Math.max(0, s.life - s.timer);
    // Only the patches whose gout has landed. A tower at the far end of the stretch is
    // not scorched until the fire has actually reached it.
    const live = litScorchPoints(s.points, s.lit, s.timer);
    if (live.length === 0) continue;
    for (const hit of scorchedTowers(towers, live)) {
      hit.t.scorchedTimer = Math.max(hit.t.scorchedTimer ?? 0, left);
      eng.caStats.bossFlags.kbdTowerScorched = true;
    }
  }
}

/**
 * Scurrius: the swarm axis. The shear itself is driven from `damageEnemy` — it is a
 * *reaction*, which is what makes it the player's doing — so all this owns is the
 * cooldown and the guaranteed squeak.
 *
 * The squeak is the floor, not the mechanic. A board that only chips never lands a hit
 * big enough to shear, and a boss whose idea never fires teaches nothing; the squeak
 * guarantees he still gets to make his point. It respects the same live-rat cap, so it
 * can never be the thing that buries the board.
 */
export function updateScurrius(eng: GameEngine, e: Enemy, dt: number) {
  const st = e.bossState!;
  st.scurriusShearCooldown = Math.max(0, (st.scurriusShearCooldown ?? 0) - dt);
  st.squeakStop = Math.max(0, (st.squeakStop ?? 0) - dt);
  st.squeakTimer = (st.squeakTimer ?? SCURRIUS_SQUEAK_INTERVAL) - dt;
  if (st.squeakTimer > 0) return;
  st.squeakTimer = SCURRIUS_SQUEAK_INTERVAL;
  // He halts even when the cap denies him the rat: the stop is what he pays for the
  // mechanic, not a wind-up for the shear, and a squeak that sometimes costs nothing
  // would make the tell unreadable.
  st.squeakStop = SCURRIUS_SQUEAK_STOP;
  e.say = SCURRIUS_SAY;
  e.sayTimer = SCURRIUS_SQUEAK_STOP;
  if (liveRatsOf(eng, e.id) >= SCURRIUS_MAX_RATS) return;
  shearRat(eng, e);
}

/**
 * A sheared rat drives itself: it skitters to random points **off the road and across
 * towers**, then turns and runs the HP it carries back into the king.
 *
 * The wandering is the point rather than flavour. A rat drifting through a tower's range
 * pulls that tower's fire off Scurrius, which is at once the right play (killing it denies
 * the refund) and the wrong one (the king is not dying). It never *disables* what it walks
 * over — that is Brutus's job, and it has a visible cause there.
 *
 * With the king gone there is nothing to run back to, so the rat stops driving itself and
 * the ordinary path walk takes over from wherever it stands. It aims at its next waypoint,
 * so an off-road rat simply angles back onto the road — no special rejoin leg needed.
 */
export function updateRat(eng: GameEngine, e: Enemy, dt: number) {
  // A rat drives its own movement, so it sits downstream of `moveEnemies`' stun guard and
  // would otherwise sprint home while rooted — with the stun icon showing and the panel
  // promising "cannot move". Denying the refund with a freeze is exactly what the mechanic
  // asks the player to do, so it has to actually work. (`moveEnemies` runs first and owns
  // the countdown; this only reads it.)
  if (e.stunTimer > 0) return;
  const king = e.ownerId ? eng.enemies.find((o) => o.id === e.ownerId) : undefined;
  if (!king) {
    // Spec edge case 1 & 2: the HP left his bar and is still on the board. It becomes an
    // ordinary enemy that walks, leaks and costs a life like any other.
    e.ratPhase = undefined;
    return;
  }
  if (e.ratPhase === 'wander') {
    e.ratTimer = (e.ratTimer ?? 0) - dt;
    const tx = e.ratTargetX ?? e.x;
    const ty = e.ratTargetY ?? e.y;
    const dx = tx - e.x, dy = ty - e.y;
    const d = Math.hypot(dx, dy);
    if (d < 6) {
      // From the shear point, never from where the rat now stands: rerolling off its
      // own position compounds hop after hop into a random walk that can carry it a
      // third of the board away, which is the opposite of a distraction near the fight.
      const next = ratWanderTarget(
        e.ratOriginX ?? e.x, e.ratOriginY ?? e.y, Math.random, eng.width, eng.height,
      );
      e.ratTargetX = next.x;
      e.ratTargetY = next.y;
    } else {
      const step = Math.min(d, e.speed * dt);
      e.x += (dx / d) * step;
      e.y += (dy / d) * step;
    }
    if ((e.ratTimer ?? 0) <= 0) e.ratPhase = 'return';
    return;
  }
  // Heading home. Arrival is by distance, not by clock — the king keeps moving.
  const dx = king.x - e.x, dy = king.y - e.y;
  const d = Math.hypot(dx, dy);
  if (d <= SCURRIUS_REFUND_RADIUS) {
    const healed = ratRefund(e.hp, king.hp, king.maxHp);
    king.hp += healed;
    // Say it out loud: the refund is the one moment of this fight that would otherwise
    // be invisible, and an unexplained rising boss bar reads as a bug. A green `heal`
    // splat is the same language Jad's Yt-HurKot regen already speaks.
    if (healed > 0) {
      eng.hitsplats.push({
        x: king.x + (Math.random() - 0.5) * 16,
        y: bodyY(king) - 18,
        value: Math.round(healed),
        kind: 'heal',
        life: HITSPLAT_LIFE,
      });
    }
    addRing(eng, king.x, king.y, 5, 34, '#48d04a', 0.4, 3);
    const idx = eng.enemies.indexOf(e);
    if (idx >= 0) eng.enemies.splice(idx, 1);
    return;
  }
  const step = e.speed * dt;
  e.x += (dx / d) * step;
  e.y += (dy / d) * step;
}

/**
 * The Corporeal Beast: he spits a Dark energy core at the best tower you own.
 *
 * The rules are in `systems/boss-mechanics` (`pickSiphonTarget`, `corpSiphonHeal`,
 * `corpIsArmoured`); this owns the timer, the core entity and the link. The armour is
 * recounted from the live cores every frame — same reasoning as Cerberus's soul locks:
 * the reward for killing a core has to land on the frame it dies, or the player cannot
 * feel the trade they just made.
 */
export function updateCorp(eng: GameEngine, e: Enemy, dt: number) {
  const st = e.bossState!;
  const cores = eng.enemies.filter((c) => c.type === 'dark_core' && c.ownerId === e.id);
  st.coresLatched = cores.reduce((n, c) => n + (c.coreLatched ? 1 : 0), 0);

  st.coreTimer = (st.coreTimer ?? CORP_FIRST_CORE) - dt;
  if (st.coreTimer > 0) return;
  // The clock resets whether or not a core actually goes out, so a board with nothing
  // left to take (or already holding three) is not rewarded with a shorter fight later.
  st.coreTimer = CORP_CORE_INTERVAL;
  if (cores.length >= CORP_MAX_CORES) return;
  if (spitDarkCore(eng, e)) st.coresSpat = (st.coresSpat ?? 0) + 1;
}

/** Every tower the next core could be spat at, priced by what it is actually worth —
 *  its live, cache-warm damage over its live cooldown. Utility wizards are left out:
 *  they project a field rather than firing, so siphoning one would take nothing. */
function siphonCandidates(eng: GameEngine): SiphonCandidate[] {
  const claimed = new Set<string>();
  for (const c of eng.enemies) if (c.type === 'dark_core' && c.coreTowerId) claimed.add(c.coreTowerId);
  const out: SiphonCandidate[] = [];
  for (const t of eng.towers) {
    if (t.type === 'wizard' && t.mageMode === 'utility') continue;
    const st = eng.statsCache.get(t.id)?.stats;
    const dmg = (t.damage + (st?.flatDamageBonus ?? 0)) * (st?.damageMultiplier ?? 1);
    const cd = st?.cooldown ?? t.cooldown;
    out.push({ id: t.id, dps: cd > 0 ? dmg / cd : dmg, taken: !!t.siphonedBy || claimed.has(t.id) });
  }
  return out;
}

/** Spit one core at the best free tower. Returns false when there is nothing to take —
 *  an empty board, or every tower already held. */
export function spitDarkCore(eng: GameEngine, beast: Enemy): boolean {
  const towerId = pickSiphonTarget(siphonCandidates(eng));
  const tower = towerId ? eng.towers.find((t) => t.id === towerId) : undefined;
  if (!tower) return false;
  const hp = corpCoreHp(beast.maxHp);
  const speed = ENEMIES.dark_core.speed;
  eng.enemies.push({
    ...ENEMIES.dark_core,
    id: uid(),
    type: 'dark_core', // its own type → its own Collection Log line and kill count
    name: 'Dark Energy Core',
    escort: true,
    ownerId: beast.id,
    coreTowerId: tower.id,
    coreLatched: false,
    debug: beast.debug, // a sandbox Beast spits sandbox cores
    x: beast.x,
    y: bodyY(beast),
    hp,
    maxHp: hp,
    speed,
    baseSpeed: speed,
    naturalSpeed: speed,
    pathIndex: beast.pathIndex,
    slowTimer: 0,
    stunTimer: 0,
    tauntTimer: 0,
    groundTimer: 0,
    animTime: 0,
    spawnAnim: SPAWN_ANIM_SECONDS,
  });
  beast.say = CORP_SAY;
  beast.sayTimer = 1.2;
  addRing(eng, beast.x, bodyY(beast), 8, 60, CORP_LINK_COLOR, 0.55, 4);
  eng.sound.play('wave', 60);
  // Name the tower: the player has to know *which* one went quiet, and on a full board
  // a purple mote crossing the screen is not enough to find it by.
  eng.notify(`The Corporeal Beast spits a Dark energy core at your ${tower.name}!`);
  return true;
}

/**
 * A Dark energy core in flight, and then latched.
 *
 * Unlike every other escort it does not orbit its owner — it leaves the Beast entirely
 * and crosses the board to one tower. Until it arrives the tower keeps shooting: the
 * flight *is* the warning, and a mechanic that took effect the frame it was announced
 * would be a tax rather than a thing to answer.
 */
export function updateDarkCore(eng: GameEngine, e: Enemy, dt: number) {
  const tower = e.coreTowerId ? eng.towers.find((t) => t.id === e.coreTowerId) : undefined;
  if (!tower) {
    // Its tower was sold out from under it. Re-pick rather than leaving the thing
    // hanging in the air: selling the tower is a legitimate answer, but it should cost
    // the tower, not end the mechanic.
    e.coreLatched = false;
    e.coreTowerId = pickSiphonTarget(siphonCandidates(eng)) ?? undefined;
    return;
  }
  const dx = tower.x - e.x;
  const dy = tower.y - e.y;
  const d = Math.hypot(dx, dy);
  if (d > CORP_CORE_LATCH_DIST) {
    const step = Math.min(d, e.speed * dt);
    e.x += (dx / d) * step;
    e.y += (dy / d) * step;
    return;
  }
  if (!e.coreLatched) {
    e.coreLatched = true;
    tower.siphonedBy = e.id;
    tower.targetId = null; // it is not aiming at anything any more
    addRing(eng, tower.x, tower.y, 6, 44, CORP_LINK_COLOR, 0.5, 3);
    eng.sound.play('wave', 50);
  }
  // Sitting on the tower it holds, bobbing — it must read as attached, not as an enemy
  // that happens to be standing there.
  e.orbit = (e.orbit ?? 0) + dt * ESCORT_ORBIT_DRIFT;
  e.x = tower.x;
  e.y = tower.y - TOWER_BODY_RADIUS * 0.5 + Math.sin(e.orbit * 2.2) * 2.5;
}

/** Move an escort (a Yt-HurKot healer, a Summoned Soul) toward its orbit slot around
 *  its owner, so it follows the boss at a fixed radius and drifts around it rather
 *  than walking the path. Orphans (owner gone) hold still until `handleBossMechanics`
 *  culls them. */
export function updateEscortFollow(eng: GameEngine, e: Enemy, dt: number) {
  // The one escort that does not follow anything: a Dark energy core flies to the tower
  // it was spat at and stays there.
  if (e.type === 'dark_core') { updateDarkCore(eng, e, dt); return; }
  const owner = e.ownerId ? eng.enemies.find(h => h.id === e.ownerId) : undefined;
  if (!owner) return;
  // General Graardor's sergeants — and Nex's acolytes — are the other exception: they
  // march *along the road* in front of the boss rather than orbiting it, which is the
  // entire fight in both cases (see `updateGraardorGuard`).
  if (e.guardLead !== undefined) { updateGraardorGuard(eng, e, owner, dt); return; }
  e.orbit = (e.orbit ?? 0) + dt * ESCORT_ORBIT_DRIFT; // slow circle around the boss
  const radius = e.soulStyle ? CERBERUS_SOUL_ORBIT : JAD_HEALER_ORBIT;
  const tx = owner.x + Math.cos(e.orbit) * radius;
  const ty = owner.y + Math.sin(e.orbit) * radius;
  const dx = tx - e.x, dy = ty - e.y;
  const d = Math.hypot(dx, dy);
  if (d < 1) return;
  // Keep pace with the boss even if it's faster than the escort's base follow speed.
  const speed = Math.max(e.speed, (owner.speed || 0) * 1.4 + 40);
  const step = Math.min(d, speed * dt);
  e.x += (dx / d) * step;
  e.y += (dy / d) * step;
}

/**
 * **General Graardor: the body-block and the slam.**
 *
 * He brings his three sergeants in on his first frame and they march *in front of him*
 * for the rest of the fight. While any of them is still further along the road, he is
 * armoured to {@link GRAARDOR_ARMOUR_MULT} — and because the guards carry a real, higher
 * road position, the default `first` priority is already aimed at them. The player never
 * points a tower at anything; the formation does it.
 *
 * `guardsAhead` is recounted from the live guards every frame rather than tracked on
 * kill, for the same reason the Beast recounts his cores: the reward for cutting a guard
 * down has to land on the frame it dies. It also makes the road's end free — when the
 * lead clamps to the final waypoint the guards stop gaining ground, he walks out from
 * behind them, and the armour comes off exactly as he is about to leak.
 */
export function updateGraardor(eng: GameEngine, e: Enemy, dt: number) {
  const st = e.bossState!;
  if (!st.guardsSummoned) {
    summonGraardorGuards(eng, e);
    st.guardsSummoned = true;
  }

  const mine = remainingPathDistance(eng.path, e.pathIndex, e.x, e.y);
  let ahead = 0;
  let alive = 0;
  for (const g of eng.enemies) {
    if (g.ownerId !== e.id || g.guardLead === undefined) continue;
    alive++;
    if (remainingPathDistance(eng.path, g.pathIndex, g.x, g.y) < mine) ahead++;
  }
  st.guardsAhead = ahead;
  // The achievement's whole condition: the wedge is down and he is standing there alone.
  // Recorded the moment it happens rather than at his death, because his own death culls
  // the guards and there would be nothing left to count.
  if (alive === 0) eng.caStats.bossFlags.graardorGuardsWiped = true;

  if ((st.slamWindup ?? 0) > 0) {
    st.slamWindup = Math.max(0, (st.slamWindup ?? 0) - dt);
    if (st.slamWindup === 0) graardorSlam(eng, e);
    return;
  }
  st.slamTimer = (st.slamTimer ?? GRAARDOR_SLAM_FIRST) - dt;
  if (st.slamTimer > 0) return;
  // Roar first, land it after the windup. `moveEnemies` halts him for the whole of it
  // (see `graardorIsSlamming`), so the attack costs him ground — that is the tell, and
  // it is the same bargain Scurrius's squeak and the KBD's inhale make.
  st.slamTimer = GRAARDOR_SLAM_INTERVAL;
  st.slamWindup = GRAARDOR_SLAM_WINDUP;
  e.say = GRAARDOR_SAY;
  e.sayTimer = GRAARDOR_SLAM_WINDUP;
  eng.sound.play('wave', 55);
}

/** The slam lands: every prayer goes out and the panel is barred for a few seconds. */
function graardorSlam(eng: GameEngine, e: Enemy) {
  const st = e.bossState!;
  st.slams = (st.slams ?? 0) + 1;
  e.say = undefined;
  e.sayTimer = 0;
  eng.prayer.shatter(GRAARDOR_PRAYER_LOCK);
  // A shockwave in Bandos' brass, wide enough to read as "that hit the whole board" —
  // because it did: the thing it hit is the interface, not any one tower.
  addRing(eng, e.x, bodyY(e), 12, 180, '#d9b24a', 0.6, 5);
  eng.sound.play('bossslam_graardor' in GAME_SOUNDS ? 'bossslam_graardor' : 'wave', 75);
}

/** Bring the three sergeants in. Escorts, so they never walk the path themselves, never
 *  leak and never pay out — the reward for one is the General's armour coming off. */
export function summonGraardorGuards(eng: GameEngine, general: Enemy) {
  const hp = graardorGuardHp(general.maxHp);
  for (const g of GRAARDOR_GUARDS) {
    const def = ENEMIES[g.type];
    const spot = advanceAlongPath(eng.path, general.pathIndex, general.x, general.y, g.lead);
    eng.enemies.push({
      ...def,
      id: uid(),
      type: g.type, // its own type → its own Collection Log line and kill count
      name: def.name,
      escort: true,
      ownerId: general.id,
      guardLead: g.lead,
      guardSide: g.side,
      debug: general.debug, // a sandbox General brings sandbox sergeants
      x: spot.x,
      y: spot.y,
      hp,
      maxHp: hp,
      speed: def.speed,
      baseSpeed: def.speed,
      naturalSpeed: def.speed,
      pathIndex: spot.pathIndex,
      slowTimer: 0,
      stunTimer: 0,
      tauntTimer: 0,
      groundTimer: 0,
      animTime: Math.random() * 2,
      spawnAnim: SPAWN_ANIM_SECONDS,
    });
  }
  general.say = GRAARDOR_SAY;
  general.sayTimer = 2;
  eng.sound.play('wave', 60);
  eng.notify('General Graardor marches in behind his bodyguards!');
}


/**
 * **Nex: the four wards.**
 *
 * Every frame asks one question — is a ward still holding? While one is, she is
 * untargetable (`inReach` skips her) and immune (`bossStyleMult` returns 0), and the
 * acolyte marching ahead of her is the only thing on the road worth a shot. The ward
 * comes down when that acolyte is killed, or when {@link NEX_WARD_MAX_SECS} runs out —
 * the fail-safe that keeps a board which *cannot* break the gate in a fight rather than
 * in a deadlock.
 *
 * The current ward is tracked by **id**, not by "is any acolyte alive". A ward the timer
 * already expired keeps marching and stays killable, so by the last phase there may be
 * three of them on the road; only the one she is actually hiding behind counts.
 *
 * The rules — the thresholds, the acolyte order, the shield predicate — are pure and
 * tested in `systems/boss-mechanics.ts`; this owns the entities and the timers.
 */
export function updateNex(eng: GameEngine, e: Enemy, dt: number) {
  const st = e.bossState!;

  if (st.nexWarded) {
    const ward = eng.enemies.find(a => a.id === st.nexWardId);
    if (!ward) {
      // Cut down. The gate opens, and it is announced by name — the player just spent a
      // wave's damage on it and the payoff has to be legible.
      const name = NEX_ACOLYTES[(st.nexPhase ?? 1) - 1]?.name ?? 'The acolyte';
      st.nexWarded = false;
      st.nexWardId = undefined;
      st.nexWardsBroken = (st.nexWardsBroken ?? 0) + 1;
      // The achievement's whole condition: every gate answered by killing it, none of
      // them waited out. Recorded here rather than at her death, because only this line
      // knows *how* the ward came down.
      if (st.nexWardsBroken >= NEX_ACOLYTES.length) eng.caStats.bossFlags.nexAllWardsBroken = true;
      addRing(eng, e.x, bodyY(e), 10, 110, '#c9a0ff', 0.55, 5);
      eng.notify(`${name} falls — Nex is exposed!`);
      eng.sound.play('nexbreak' in GAME_SOUNDS ? 'nexbreak' : 'wave', 70);
      return;
    }
    st.nexWardTimer = Math.max(0, (st.nexWardTimer ?? 0) - dt);
    if (st.nexWardTimer === 0) {
      // The fail-safe. The acolyte lives on — it is still a body on the road — but it
      // stops being a wall, so the fight always has a way forward.
      st.nexWarded = false;
      st.nexWardId = undefined;
      eng.notify('The ward flickers out — Nex is exposed!');
      eng.sound.play('nexbreak' in GAME_SOUNDS ? 'nexbreak' : 'wave', 55);
    }
    return;
  }

  const idx = nexNextWardIndex(st, e.hp / e.maxHp);
  if (idx >= 0) summonNexAcolyte(eng, e, idx);
}

/** Call the next acolyte in and raise the ward behind it. An escort, so it never walks
 *  the path on its own, never leaks and never pays out — the reward for one is the phase
 *  it opens. */
export function summonNexAcolyte(eng: GameEngine, nex: Enemy, index: number) {
  const st = nex.bossState!;
  const acolyte = NEX_ACOLYTES[index];
  const def = ENEMIES[acolyte.type];
  const hp = nexAcolyteHp(nex.maxHp);
  // Placed on the road ahead of her, exactly like a sergeant: the higher `pathIndex` is
  // what makes the default `first` priority pick it, and the small HP pool is what makes
  // `weakest` pick it too.
  const spot = advanceAlongPath(eng.path, nex.pathIndex, nex.x, nex.y, NEX_ACOLYTE_LEAD);
  const id = uid();
  eng.enemies.push({
    ...def,
    id,
    type: acolyte.type, // its own type -> its own Collection Log line and kill count
    name: def.name,
    escort: true,
    ownerId: nex.id,
    guardLead: NEX_ACOLYTE_LEAD,
    guardSide: 0,
    debug: nex.debug, // a sandbox Nex brings sandbox acolytes
    x: spot.x,
    y: spot.y,
    hp,
    maxHp: hp,
    speed: def.speed,
    baseSpeed: def.speed,
    naturalSpeed: def.speed,
    pathIndex: spot.pathIndex,
    slowTimer: 0,
    stunTimer: 0,
    tauntTimer: 0,
    groundTimer: 0,
    animTime: Math.random() * 2,
    spawnAnim: SPAWN_ANIM_SECONDS,
  });
  st.nexPhase = index + 1;
  st.nexWarded = true;
  st.nexWardId = id;
  st.nexWardTimer = NEX_WARD_MAX_SECS;
  nex.say = index === 0 ? NEX_SAY : acolyte.say;
  nex.sayTimer = 2.5;
  addRing(eng, nex.x, bodyY(nex), 8, 90, '#c9a0ff', 0.5, 4);
  eng.notify(
    index === 0
      ? `Nex arrives behind ${acolyte.name} — kill the acolyte to reach her!`
      : `${acolyte.name} answers Nex — the ward is back up!`,
  );
  eng.sound.play('nexward' in GAME_SOUNDS ? 'nexward' : 'wave', 60);
}

/**
 * Walk one sergeant to the point on the road `guardLead` pixels **ahead of the General**,
 * offset `guardSide` from the centreline.
 *
 * This is what makes the mechanic targetable. The guard's `pathIndex` comes from that
 * lead point, so it is genuinely further along the road than the boss behind it and the
 * `first` priority — the default every tower ships with — picks it without the player
 * doing anything. `advanceAlongPath` clamps at the last waypoint, so near the base the
 * lead runs out, the General catches up, and his armour falls off on its own.
 */
export function updateGraardorGuard(eng: GameEngine, e: Enemy, owner: Enemy, dt: number) {
  const spot = advanceAlongPath(eng.path, owner.pathIndex, owner.x, owner.y, e.guardLead ?? 0);
  e.pathIndex = spot.pathIndex;
  let tx = spot.x;
  let ty = spot.y;
  const side = e.guardSide ?? 0;
  if (side) {
    // Perpendicular to the segment it landed on — the same construction the lane offset
    // uses in `moveEnemies`, so a guard on a corner leans the way the road does.
    const from = eng.path[spot.pathIndex];
    const next = eng.path[spot.pathIndex + 1] ?? from;
    const sx = next.x - from.x;
    const sy = next.y - from.y;
    const sl = Math.hypot(sx, sy) || 1;
    tx += (-sy / sl) * side;
    ty += (sx / sl) * side;
  }
  const dx = tx - e.x;
  const dy = ty - e.y;
  const d = Math.hypot(dx, dy);
  if (d < 1) return;
  // Keep pace with the General even when something has hurried him along.
  const speed = Math.max(e.speed, (owner.speed || 0) * 1.6 + 60);
  const step = Math.min(d, speed * dt);
  e.x += (dx / d) * step;
  e.y += (dy / d) * step;
}
