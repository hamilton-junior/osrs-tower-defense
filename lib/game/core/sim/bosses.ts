import type { Enemy, Point, EnemyType } from '../../types';
import { SPAWN_ANIM_SECONDS } from '../../types';
import { ENEMIES } from '../../data/enemies';
import { distanceSq } from '../../systems/geometry';
import { GAME_SOUNDS } from '../sound';
import { zulrahPhaseIndex, recentDamageSum, pruneDamageEvents, jadHealPerTick, ZULRAH_PHASES, VORKATH_ICE_INTERVAL, VORKATH_ICE_DURATION, JAD_HEAL_THRESHOLD, JAD_HEALER_COUNT, JAD_HEALER_HP_FRAC, JAD_HEAL_WINDOW_SECS, JAD_HEAL_TICK_SECS, JAD_RESUMMON_COOLDOWN, hydraPhase, hydraShouldVent, hydraBreakTarget, hydraVentHeal, hydraHealSpoilsPerfect, hydraIsEnraged, HYDRA_VENT_SECS, HYDRA_VENT_COOLDOWN_SECS, HYDRA_SHATTER_VULN_SECS, HYDRA_ENRAGE_SPEED_MULT, moleBurrowInterval, moleBurrowTarget, MOLE_DIG_SECS, MOLE_UNDER_SECS, MOLE_EMERGE_SECS, stepStall, stallHealMult, isGuardian, guardianReviveHp, guardianCanRevive, linkGuardianStates, guardianShouldSummonTwin, GUARDIAN_REVIVE_SECS, GUARDIAN_ENRAGE_SPEED_MULT, GUARDIAN_PAIR_OFFSET, cerberusShouldSummon, cerberusIsEnraged, soulAnimSlug, SOUL_STYLES, CERBERUS_SOUL_HP_FRAC, CERBERUS_SOUL_ORBIT, CERBERUS_ENRAGE_SPEED_MULT, brutusShouldRage, brutusDashDirection, bossAnimVariant, BRUTUS_BRACE_SECS, BRUTUS_DASH_SECS, BRUTUS_SETTLE_SECS, BRUTUS_RAGE_COOLDOWN, BRUTUS_DASH_SPEED_MULT, BRUTUS_RETURN_SPEED_MULT, BRUTUS_EDGE_MARGIN, BRUTUS_SAY, BRUTUS_TRAMPLE_DISABLE_SECS, brutusTrampled, SCURRIUS_SHEAR_COOLDOWN, SCURRIUS_SQUEAK_INTERVAL, SCURRIUS_RAT_SPEED_MULT, SCURRIUS_WANDER_SECS, SCURRIUS_REFUND_RADIUS, SCURRIUS_SAY, SCURRIUS_MAX_RATS, SCURRIUS_SQUEAK_STOP, scurriusRatHp, ratWanderTarget, ratRefund } from '../../systems/boss-mechanics';
import { uid, enemyRadius, TOWER_BODY_RADIUS, ESCORT_ORBIT_DRIFT, JAD_HEALER_ORBIT, MOLE_DUST, GUARDIAN_LINK_COLOR, HITSPLAT_LIFE } from '../engine-state';
import type { GameEngine } from '../engine';
import { makeEnemy, addRing } from './waves';
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
    { hpFloor: st.hpFloor ?? 1, stallTimer: st.stallTimer ?? 0, stallStacks: before, sinceHit: st.sinceHit },
    e.hp / e.maxHp,
    dt,
  );
  st.hpFloor = next.hpFloor;
  st.stallTimer = next.stallTimer;
  st.stallStacks = next.stallStacks;
  st.sinceHit = next.sinceHit;

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

/** Move an escort (a Yt-HurKot healer, a Summoned Soul) toward its orbit slot around
 *  its owner, so it follows the boss at a fixed radius and drifts around it rather
 *  than walking the path. Orphans (owner gone) hold still until `handleBossMechanics`
 *  culls them. */
export function updateEscortFollow(eng: GameEngine, e: Enemy, dt: number) {
  const owner = e.ownerId ? eng.enemies.find(h => h.id === e.ownerId) : undefined;
  if (!owner) return;
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
