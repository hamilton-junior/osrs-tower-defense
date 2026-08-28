import type { Enemy, EnemyType } from '../../types';
import { SPAWN_ANIM_SECONDS } from '../../types';
import { SPOTANIMS, spotAnimDurationS } from '../../data/spotanims';
import { ENEMIES } from '../../data/enemies';
import { LANDMARK_WAVES, type WaveConfig } from '../../data/waves';
import { ASSETS } from '../../assets';
import { scaleEnemyStats, endlessHpMult } from '../../systems/enemy-scaling';
import { buildWaveConfigs, allSchedulableBossesCleared } from '../../systems/wave-generation';
import { TICK_SECONDS } from '../../systems/magic';
import { waveClearBonus } from '../../systems/rewards';
import { essenceForWave, essenceMultiplier } from '../../systems/meta-progression';
import { rollRelicChoice, interestGain } from '../../systems/relics';
import { rollAffixes, rollBossAffixes, affixSpeedMult, affixSpawnHpMult, affixRenderScaleMult, shieldHpFor, regenPerSec, SWARM_COUNT, type AffixRoll } from '../../systems/affixes';
import { resolveEventMods } from '../../systems/wave-events';
import { pickVariant, resetVariantBag } from '../../systems/model-variants';
import { enemyLeakCost } from '../../systems/leak-cost';
import { freshBossState, moleIsBurrowing, stallHealMult, MECHANIC_BOSSES, brutusIsRampaging, scurriusIsSqueaking, type BossId } from '../../systems/boss-mechanics';
import { uid, GENERAL_GOLD_FACTOR, DOT_KINDS, ANCIENT_HIT_FIT } from '../engine-state';
import type { WavePreviewEntry } from '../engine-state';
import type { GameEngine } from '../engine';
import { stepStallClock, stallStacksOf, updateEscortFollow } from './bosses';
import { damage } from './combat';

/**
 * What the wave is made of and how it moves: composing the roster, minting each
 * enemy with its scaling and affixes, walking them down the road, ticking damage
 * over time and the spawned effects, and settling up when the wave ends.
 */

/** Resolve (and memoise) the upcoming wave's `{type,count}` makeup. Pure aside
 *  from the cache: it assigns no task and fires no notifications, so it is safe
 *  to call from a UI hover or on every emit. Keyed by (wave, current task, region)
 *  so a Slayer skip or a region change refreshes it; {@link startWave} consumes the
 *  same result so the preview always matches what actually spawns. */
export function computeWaveConfigs(eng: GameEngine): WaveConfig[] {
  const taskType = eng.slayer.task?.type ?? null;
  const biome = eng.biome.id;
  if (eng.previewCache && eng.previewCache.wave === eng.wave && eng.previewCache.task === taskType
      && eng.previewCache.biome === biome) {
    return eng.previewCache.configs;
  }
  const configs = buildWaveConfigs(eng.wave, {
    enemies: Object.values(ENEMIES),
    blockedEnemies: [],
    landmark: LANDMARK_WAVES[eng.wave],
    // The region the run is fought in: only monsters native to it (plus the
    // generic backbone) can roll, and the scripted opening waves are rewritten
    // into local equivalents. See systems/enemy-regions.
    biome,
    // Seed the active Slayer-task target so its enemies keep spawning —
    // the fail-safe against a task whose monster has dropped out of waves.
    slayerTask: eng.slayer.task,
    // Drives the boss schedule: which boss is still unmet (so a new account meets
    // them in order), and whether the random / extra-boss endgame has unlocked.
    bossesSeen: eng.bossesSeen,
    // Per-run march: every run meets bosses gentle→hard and has a real "last boss".
    bossKillsThisRun: eng.bossesKilledThisRun,
  });
  eng.previewCache = { wave: eng.wave, task: taskType, biome, configs };
  return configs;
}

/** Plain-data view of the upcoming wave for the Start Wave hover: aggregated
 *  per enemy type, regular monsters first then any boss. Empty during a wave /
 *  on game over. */
export function wavePreview(eng: GameEngine): WavePreviewEntry[] {
  if (eng.waveActive || eng.gameOver) return [];
  const totals = new Map<EnemyType, number>();
  for (const c of computeWaveConfigs(eng)) {
    const t = c.type as EnemyType;
    totals.set(t, (totals.get(t) ?? 0) + c.count);
  }
  const rows: WavePreviewEntry[] = [];
  for (const [type, count] of totals) {
    const def = ENEMIES[type];
    // Scale to the wave being previewed, exactly as makeEnemy will when it spawns.
    const endless = eng.runPhase === 'endless' ? endlessHpMult(eng.wave, eng.victoryWave) : 1;
    const s = def
      ? scaleEnemyStats({ hp: def.hp, speed: def.speed, reward: def.reward }, eng.wave, endless, eng.diffEnemyMults)
      : { hp: 0, speed: 0, reward: 0 };
    rows.push({
      type, name: def?.name ?? type, count, isBoss: !!def?.isBoss,
      hp: s.hp, speed: s.speed, reward: s.reward,
      weakness: def?.weakness, styleWeakness: def?.styleWeakness,
      // Nothing has spawned yet, so the tally hasn't counted this appearance —
      // add it, or the preview would quote one sighting's worth too little.
      leakCost: enemyLeakCost({
        type, isBoss: !!def?.isBoss, sightings: (eng.bossesSeen[type] ?? 0) + 1,
      }),
    });
  }
  // Regular monsters first (largest packs first), any boss headlining at the end.
  rows.sort((a, b) => (a.isBoss ? 1 : 0) - (b.isBoss ? 1 : 0) || b.count - a.count);
  return rows;
}

// --------------------------------------------------------------- wave build
/** Build the spawn queue from resolved wave configs, folding in the active
 *  event's enemy-count multiplier (Infestation swells the horde). */
export function buildWaveEnemies(eng: GameEngine, configs: WaveConfig[], wave: number): Enemy[] {
  const countMult = resolveEventMods(eng.activeEvent).enemyCount;
  resetVariantBag(eng.variantBag); // a new wave leads with a fresh shuffle of looks
  const out: Enemy[] = [];
  for (const cfg of configs) {
    // Bosses/uniques (count 1) are never multiplied — only the rank-and-file swell.
    const count = cfg.count > 1 ? Math.max(1, Math.round(cfg.count * countMult)) : cfg.count;
    for (let i = 0; i < count; i++) {
      const enemy = makeEnemy(eng, cfg.type, wave);
      if (!enemy) continue;
      out.push(enemy);
      // Swarm affix: the rolled enemy arrives as a pack of frail copies (its HP
      // was already halved in makeEnemy); clone it into a full trio.
      if (enemy.affixes?.includes('swarm')) {
        for (let k = 1; k < SWARM_COUNT; k++) {
          // A swarm is a pack of copies, so each copy draws its own look too —
          // otherwise the one place three identical bodies stand together is the
          // one place the variants would be most obvious by their absence.
          out.push({
            ...enemy,
            id: uid(),
            affixes: enemy.affixes ? [...enemy.affixes] : undefined,
            animType: pickVariant(enemy.type, eng.variantBag) ?? enemy.animType,
          });
        }
      }
    }
  }
  return out;
}

export function makeEnemy(eng: GameEngine, type: EnemyType, wave: number, forced?: AffixRoll): Enemy | null {
  const def = ENEMIES[type];
  if (!def) return null;
  const endless = eng.runPhase === 'endless' ? endlessHpMult(wave, eng.victoryWave) : 1;
  const scaled = scaleEnemyStats({ hp: def.hp, speed: def.speed, reward: def.reward }, wave, endless, eng.diffEnemyMults);
  const start = eng.portalPoint;
  // `forced` (debug cheats) wins outright — it bypasses the seen-gate and the
  // elite roll so a tester can dial in exact modifiers. Otherwise: bosses roll
  // the boss-modifier set only once they've been seen at least once (their
  // first-ever encounter is the clean, mechanic-only fight); normal enemies roll
  // the standard elite affixes.
  const roll = forced ?? (def.isBoss
    ? (eng.bossesSeen[type] ? rollBossAffixes(Math.random, wave) : { affixes: [] })
    : rollAffixes(wave, false, Math.random, type.startsWith('superior_')));
  const affixes = roll.affixes;
  const bossKind = def.isBoss && (MECHANIC_BOSSES as readonly string[]).includes(type)
    ? (type as BossId) : undefined;
  // Greed curse (×enemyHpMult) compounds with the affix spawn-HP multiplier
  // (swarm frail / colossal tanky) and the active wave event (Iron Tide tougher /
  // Infestation frail). Speed folds in its affixes and the event too (Frenzy).
  const ev = resolveEventMods(eng.activeEvent);
  const hp = Math.max(1, Math.round(scaled.hp * eng.runFx.enemyHpMult * affixSpawnHpMult(affixes) * ev.enemyHp));
  const naturalSpeed = Math.max(1, Math.round(scaled.speed));
  const speed = Math.max(1, Math.round(scaled.speed * affixSpeedMult(affixes) * ev.enemySpeed));
  const shieldHp = shieldHpFor(affixes, hp);
  return {
    ...def,
    id: uid(),
    x: start.x,
    y: start.y,
    hp,
    maxHp: hp,
    speed,
    baseSpeed: speed,
    naturalSpeed,
    reward: scaled.reward,
    renderScale: (def.renderScale ?? 1) * affixRenderScaleMult(affixes),
    pathIndex: 0,
    slowTimer: 0,
    stunTimer: 0,
    tauntTimer: 0,
    groundTimer: 0,
    animTime: 0,
    affixes: affixes.length ? affixes : undefined,
    armoredStyle: roll.armoredStyle,
    // A rolled `protected` affix wins; otherwise the species' innate prayer (if
    // any) carries through. `...def` already spread the innate value, but a
    // forced/rolled affix must override it.
    protectedStyle: roll.protectedStyle ?? def.protectedStyle,
    shieldHp: shieldHp > 0 ? shieldHp : undefined,
    bossState: bossKind ? freshBossState(bossKind) : undefined,
    // Cosmetic only: overrides which baked clip is drawn, never the type behind
    // the stats, drops or kill count. `undefined` for everything without variants.
    animType: pickVariant(type, eng.variantBag),
  };
}

/** DPS meter: bank engagement time. A tower's own combat seconds tick while it
 *  has a target during a live wave (the DPS-rate denominator); the board-wide
 *  wave-combat clock ticks while ANY damage-dealing tower is engaging, and backs
 *  the DPS rate for Utility / Run-FX rows that have no engagement time. */
export function recordCombatTime(eng: GameEngine, dt: number) {
  if (!eng.waveActive || dt <= 0) return;
  let anyEngaging = false;
  for (const t of eng.towers) {
    if (t.targetId === null) continue;
    if (t.type === 'wizard' && t.mageMode === 'utility') continue; // utility never targets
    eng.stats.addCombatTime(t.id, eng.wave, dt);
    anyEngaging = true;
  }
  if (anyEngaging) eng.stats.addWaveCombat(eng.wave, dt);
}

/** Advance purely-visual effects (no gameplay impact). */
export function updateEffects(eng: GameEngine, dt: number) {
  if (eng.baseFlash > 0) eng.baseFlash = Math.max(0, eng.baseFlash - dt * 1.6);
  for (let i = eng.spotEffects.length - 1; i >= 0; i--) {
    const fx = eng.spotEffects[i];
    fx.age += dt;
    // Enemy-anchored GFX (Ancients hits) ride the struck model while it
    // lives; once it dies or leaks, the effect finishes where it stood.
    if (fx.enemyId) {
      const t = eng.enemies.find((en) => en.id === fx.enemyId);
      if (t) { fx.x = t.x; fx.y = t.y; }
      else fx.enemyId = undefined;
    }
    const meta = SPOTANIMS[fx.slug];
    if (!meta || fx.age >= spotAnimDurationS(meta)) eng.spotEffects.splice(i, 1);
  }
  for (let i = eng.hitsplats.length - 1; i >= 0; i--) {
    const h = eng.hitsplats[i];
    h.life -= dt;
    if (h.minor) {
      h.x += (h.vx ?? 0) * dt; // drift to its lane's side
      h.y += (h.vy ?? 0) * dt; // and up or down per its lane
    } else {
      h.y -= 28 * dt; // direct hits float up
    }
    if (h.life <= 0) eng.hitsplats.splice(i, 1);
  }
  for (let i = eng.particles.length - 1; i >= 0; i--) {
    const p = eng.particles[i];
    p.life -= dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += (p.gravity ?? 220) * dt;
    if (p.life <= 0) eng.particles.splice(i, 1);
  }
  for (let i = eng.deaths.length - 1; i >= 0; i--) {
    const d = eng.deaths[i];
    d.life -= dt;
    if (d.life <= 0) eng.deaths.splice(i, 1);
  }
  for (let i = eng.fx.length - 1; i >= 0; i--) {
    eng.fx[i].age += dt;
    if (eng.fx[i].age >= eng.fx[i].life) eng.fx.splice(i, 1);
  }
}

/** Queue a one-shot baked-spotanim effect at a point (purely visual).
 *  `scale` multiplies the spotanim's base draw size (impacts fit the model).
 *  `anchor` pins the GFX to an enemy — like the client's actor graphics, the
 *  effect rides the model while it lives (then finishes where it stood). */
export function spawnEffect(eng: GameEngine, slug: string, x: number, y: number, scale = 1, anchor?: Enemy) {
  if (!SPOTANIMS[slug]) return;
  eng.spotEffects.push({ slug, x, y, age: 0, scale, enemyId: anchor?.id });
}

/** An Ancients hit GFX played ON the struck model: sized from the enemy's
 *  drawn body (ice barrage's cube encases the whole NPC — the proportion
 *  baseline) and anchored to it, so the effect follows the model like an
 *  actor graphic in the client. No jitter — the fit is the point. */
export function spawnAncientHitFx(eng: GameEngine, slug: string, e: Enemy) {
  const meta = SPOTANIMS[slug];
  if (!meta) return;
  const fit = ANCIENT_HIT_FIT[slug.split('_')[1]] ?? 1.15;
  const bodyPx = (e.isBoss ? 60 : 30) * (e.renderScale ?? 1) * 1.32; // matches drawEnemies' ds
  eng.spotEffects.push({ slug, x: e.x, y: e.y, age: 0, scale: (bodyPx * fit) / meta.size, enemyId: e.id });
}

/** An expanding ring VFX (overkill cleave, kill-streak shockwave, soul-split heal). */
export function addRing(eng: GameEngine, x: number, y: number, r0: number, r1: number, color: string, life = 0.5, width = 3) {
  eng.fx.push({ kind: 'ring', x, y, age: 0, life, r0, r1, color, width });
}

/** A quick energy bolt between two points (ricochet / pierce / chain-freeze jump). */
export function addBolt(eng: GameEngine, x0: number, y0: number, x1: number, y1: number, color: string, life = 0.25) {
  eng.fx.push({ kind: 'bolt', x0, y0, x1, y1, age: 0, life, color });
}

export function spawn(eng: GameEngine, dt: number) {
  if (eng.spawnQueue.length === 0) return;
  eng.spawnTimer += dt;
  if (eng.spawnTimer >= eng.spawnInterval) {
    eng.spawnTimer = 0;
    const enemy = eng.spawnQueue.shift();
    if (enemy) {
      enemy.spawnAnim = SPAWN_ANIM_SECONDS; // materialise (fade-in + grow) out of the portal
      eng.enemies.push(enemy);
      // Count every real boss sighting (lifetime): the first one unlocks the
      // boss's modifier rolls for all future encounters, and the running tally
      // ramps the lives it costs on a leak. Debug/sandbox spawns don't count.
      if (enemy.isBoss && !enemy.debug) {
        eng.bossesSeen = { ...eng.bossesSeen, [enemy.type]: (eng.bossesSeen[enemy.type] ?? 0) + 1 };
      }
    }
    eng.emit();
  }
}

/**
 * Tick Fire `burn` and Smoke `poison` damage-over-time. Each kind is tracked
 * and ticked independently, so an enemy can carry both at once and they show as
 * two separate hitsplats. Damage accrues every frame but is only dealt/shown
 * once per game tick (0.6s) as a single splat summing the period's damage — so
 * DoT doesn't spam tiny numbers every frame.
 */
export function damageOverTime(eng: GameEngine, dt: number) {
  for (let i = eng.enemies.length - 1; i >= 0; i--) {
    const e = eng.enemies[i];
    if (!e.dots) continue;
    for (const kind of DOT_KINDS) {
      const d = e.dots[kind];
      if (!d || d.timer <= 0) continue;
      d.timer -= dt;
      d.accum += d.dps * dt;
      d.tickTimer += dt;
      const expired = d.timer <= 0;
      if (d.tickTimer >= TICK_SECONDS || expired) {
        d.tickTimer = 0;
        const total = Math.floor(d.accum);
        if (total > 0) {
          d.accum -= total;
          // Pass the source style so boss style-resistance (Zulrah) reduces the
          // DoT — including Fire's %max-HP burn — like it does the direct hit.
          // Tag maps the DoT slot to its meter bucket (burn/poison/venom).
          const dotTag = kind === 'burn' ? 'burn' : kind === 'venom' ? 'venom' : 'poison';
          if (damage(eng, e, total, kind, true, false, 0, d.style,
              { towerId: d.sourceTowerId, tag: dotTag })) break; // enemy died; stop ticking it
        }
      }
      if (expired) delete e.dots[kind];
    }
  }
}

export function moveEnemies(eng: GameEngine, dt: number) {
  for (let i = eng.enemies.length - 1; i >= 0; i--) {
    const e = eng.enemies[i];
    if (e.isBoss && eng.caStats.bossSpawnSeconds[e.type] === undefined) {
      eng.caStats.bossSpawnSeconds[e.type] = eng.runSeconds;
    }
    if (e.spawnAnim && e.spawnAnim > 0) e.spawnAnim = Math.max(0, e.spawnAnim - dt);
    if (e.flashTimer && e.flashTimer > 0) e.flashTimer -= dt;
    e.animTime = (e.animTime ?? 0) + dt; // drives the looping walk-cycle
    // Bosses are stepped by `handleBossMechanics` (they keep the clock in their own
    // state); everything else is stepped here, before any of the `continue`s below,
    // so a stunned or escorting enemy still escalates out of a stalemate.
    if (!e.bossState) stepStallClock(eng, e, dt);
    if (e.hurtAnim && e.hurtAnim > 0) e.hurtAnim = Math.max(0, e.hurtAnim - dt);
    if (e.sayTimer && e.sayTimer > 0) {
      e.sayTimer -= dt;
      if (e.sayTimer <= 0) { e.sayTimer = 0; e.say = undefined; }
    }
    // Jad's healers don't walk the path or leak — they trail Jad in a loose
    // orbit; the only way they leave the field is by being killed.
    if (e.escort) { updateEscortFollow(eng, e, dt); continue; }
    if (e.slowTimer > 0) {
      e.slowTimer -= dt;
      if (e.slowTimer <= 0) e.speed = e.baseSpeed;
    }
    if (e.vulnTimer && e.vulnTimer > 0) e.vulnTimer -= dt;
    // Regenerating affix: claw back HP over time, capped at full health. An enemy that
    // has stalled dries this up through the stall breaker (`stallHealMult`) exactly as a
    // boss's own self-heals do — without it, anything whose regen matches the board's
    // damage sits at a fixed HP and "tick-eats" every hit forever. That is not a
    // boss-sized problem: a rank-and-file Regenerating enemy held by a stun tower does
    // it too, and then the wave has no way to end at all.
    if (e.affixes) {
      const regen = regenPerSec(e.affixes, e.maxHp, eng.wave, e.isBoss) * stallHealMult(stallStacksOf(eng, e));
      if (regen > 0 && e.hp < e.maxHp) e.hp = Math.min(e.maxHp, e.hp + regen * dt);
    }
    if (e.stunTimer > 0) {
      e.stunTimer -= dt;
      continue; // Earth/Shadow stun: frozen in place this frame
    }
    // The Giant Mole holds still for its whole burrow cycle — it digs in, travels
    // underground (the jump is a teleport in `updateMole`, not a walk), and climbs
    // back out. Walking through any of that would slide the animation across the map.
    if (moleIsBurrowing(e.bossState)) continue;
    // Brutus drives himself for the whole rampage — the lunge goes where the road does
    // not, and the walk back is aimed at the point he left, not at the next waypoint.
    if (brutusIsRampaging(e.bossState)) continue;
    // Scurrius stands still to squeak. It is the one thing his mechanic costs him —
    // the shear only redistributes HP he already had — so the ground he gives up here
    // is the price, and a halted boss is a far louder tell than an overhead on a
    // moving sprite.
    if (scurriusIsSqueaking(e.bossState)) continue;
    // A sheared rat drives itself (wander, then the run home). Walking it as well would
    // slide it along the road while it is meant to be off it.
    if (e.ratPhase) continue;
    const target = eng.path[e.pathIndex + 1];
    if (!target) {
      // reached the end → leak lives (debug/sandbox enemies leak harmlessly).
      // The price is `leakCost` — the same number the hover panel and the wave
      // preview quoted beforehand. Jad's healers never reach here (they `continue`
      // above), but guard the life-cost anyway so only the boss itself — never a
      // healer — can cost a life if that path is ever refactored.
      eng.enemies.splice(i, 1);
      // A Guardian that walks off is *gone*, not dead. Tell its twin so, or the
      // survivor reads the empty field as "my twin was killed" and hauls it back
      // up — letting one Guardian charge the player for two leaks.
      if (e.bossState?.partnerId) {
        const partner = eng.enemies.find((x) => x.id === e.bossState!.partnerId);
        if (partner?.bossState) partner.bossState.twinEscaped = true;
      }
      if (!e.debug && !e.escort) {
        const cost = eng.leakCost(e);
        eng.lives -= cost;
        eng.caStats.livesLostRun += cost;
        eng.caStats.livesLostThisWave += cost;
        eng.caStats.cleanWaveStreak = 0;
        for (const boss of eng.enemies) {
          if (!boss.isBoss) continue;
          eng.caStats.livesLostDuringBoss[boss.type] =
            (eng.caStats.livesLostDuringBoss[boss.type] ?? 0) + cost;
        }
        // Name the price out loud. The flash alone said "something got through";
        // it never said a boss had just taken five lives off the total.
        eng.notify(`${e.name} escaped — ${cost} ${cost === 1 ? 'life' : 'lives'}`, ASSETS.misc.hp_icon);
        eng.baseFlash = 1;
        eng.sound.play('base_hit', 90); // player taking damage with no armour (OSRS take-damage splat)
        eng.checkLethal();
      }
      eng.emit();
      continue;
    }
    // An enemy with a lane offset aims at a point *beside* the waypoint, perpendicular
    // to the segment it is on, so it walks a parallel track instead of the road's
    // centreline. Dawn flies one lane over from Dusk; without it the pair would occupy
    // the same waypoints and render as a single blob.
    let tx = target.x;
    let ty = target.y;
    if (e.laneOffset) {
      const from = eng.path[e.pathIndex];
      const sx = target.x - from.x;
      const sy = target.y - from.y;
      const sl = Math.hypot(sx, sy) || 1;
      tx += (-sy / sl) * e.laneOffset;
      ty += (sx / sl) * e.laneOffset;
    }
    const dx = tx - e.x;
    const dy = ty - e.y;
    const d = Math.hypot(dx, dy);
    if (d < 4) {
      e.pathIndex += 1;
    } else {
      e.x += (dx / d) * e.speed * dt;
      e.y += (dy / d) * e.speed * dt;
    }
  }
}

export function checkWaveEnd(eng: GameEngine) {
  if (!eng.waveActive) return;
  if (eng.spawnQueue.length > 0 || eng.enemies.length > 0) return;
  eng.waveActive = false;
  eng.sound.fadeCombat();
  eng.activeEvent = null; // the event lasts exactly its wave — clear it on clear
  eng.bumpCombatEpoch();
  // A debug sandbox wave clears with no payout and no progression — it leaves
  // the run exactly as it was before spawning.
  if (eng.sandboxWave) {
    eng.sandboxWave = false;
    eng.lastWaveSandbox = true; // flag the UI to show "Custom Wave Complete!"
    eng.emit();
    return;
  }
  // Read before `wave` advances: bossWave still describes the wave just cleared.
  const bossCleared = eng.bossWave;
  eng.awardGold(Math.round(waveClearBonus(eng.wave) * GENERAL_GOLD_FACTOR));
  // Mode/phase scales the essence faucet: roguelite pays half, Endless a tenth
  // (see essenceMultiplier). Classic-normal is the 100% baseline.
  const waveEssence = Math.round(
    essenceForWave(eng.wave) * essenceMultiplier(eng.gameMode, eng.runPhase),
  );
  eng.meta.award(waveEssence); // essence reward for the cleared wave
  eng.essenceEarnedThisRun += waveEssence;
  // Banker's Note relic: pay interest on the gold on hand (capped, full value —
  // it's a relic reward, so it skips the general-flow factor).
  if (eng.relicFx.interest) {
    const gain = interestGain(eng.relicFx.interest.rate, eng.relicFx.interest.cap, eng.money);
    if (gain > 0) eng.awardGold(gain);
  }
  // Blood Pact curse: clearing a wave costs a life (the price of its +damage).
  if (eng.runFx.bloodPact) {
    eng.lives -= 1;
    eng.caStats.livesLostRun += 1;
    eng.caStats.livesLostThisWave += 1;
    eng.caStats.cleanWaveStreak = 0;
    eng.baseFlash = 1;
    if (eng.checkLethal()) { eng.emit(); return; }
  }
  eng.wave += 1;
  eng.caStats.maxWaveReached = Math.max(eng.caStats.maxWaveReached, eng.wave);
  eng.caStats.runPhase = eng.runPhase;
  eng.caStats.runSeconds = eng.runSeconds;
  eng.caStats.prayerActiveAtWaveEnd = eng.prayer.active.size > 0;
  eng.caStats.slayerTasksDone = eng.slayer.streak;
  if (eng.caStats.livesLostThisWave === 0) eng.caStats.cleanWaveStreak += 1;
  else eng.caStats.cleanWaveStreak = 0;
  eng.caStats.livesLostThisWave = 0;
  eng.checkPrayerUnlocks(); // celebrate any tower prayers gating on the new wave
  eng.prayer.refill(); // top up to the new wave's (possibly larger) pool
  eng.ge.onWaveCleared(); // drift shop prices toward this wave's demand
  // Roguelite: beating a boss is the run's reward beat — it offers a run-defining
  // relic. Once every relic is owned the boss pays a *boosted* card hand instead,
  // so a late boss is still worth something. Ordinary waves pay nothing: cards are
  // bought with gold (see buyCardRoll), which is what makes the gold a choice.
  if (eng.gameMode === 'roguelite' && !eng.gameOver && bossCleared) {
    const relicChoice = rollRelicChoice(Math.random, new Set(eng.ownedRelics.map(r => r.id)));
    if (relicChoice.length > 0) {
      eng.pendingRelics = relicChoice;
      eng.sound.play('interface_open');
    } else {
      eng.offerDraft(true);
    }
  }
  // Roll the next Slayer task now (idempotent — only fires when the last task was
  // just completed) so it is assigned during prep, not at Start Wave. This keeps
  // the next-wave preview exact: computeWaveConfigs folds in the task's seed, and
  // startWave reuses the same memoised makeup. The player also sees their task
  // while placing towers.
  if (!eng.gameOver) eng.slayer.assignTask();
  // Victory: the wave that clears the last still-unmet schedulable boss ends the
  // run (mid-combat is too abrupt — this is the wave-clear beat). It latches once;
  // Endless play past it never re-triggers because `won` stays true.
  if (!eng.won && eng.runPhase === 'normal' && !eng.gameOver
      && allSchedulableBossesCleared(eng.bossesKilledThisRun)) {
    eng.won = true;
    eng.caStats.won = true;
    eng.caStats.runSeconds = eng.runSeconds;
    eng.victoryWave = eng.wave - 1; // the wave just cleared (wave already advanced)
    eng.paused = true;
    eng.sound.play('interface_open');
  }
  // Combat Achievements checkpoint — after the victory latch on purpose: a win
  // recorded on this wave has to be visible to `evaluate` in the same checkpoint,
  // or every win-gated task would wait a wave.
  // The world turns up in the gap: a passer-by, a random event, a nest out of a
  // tree. Rolled here rather than at Start Wave so it lands the moment the fighting
  // stops and has the whole prep phase to be noticed — or ignored.
  // A boss down ends the leg: the road forks, the run is offered two regions and
  // marches into the one the player picks. Only the place changes — palette and
  // native roster — so the board they have been building is untouched. Offered here
  // rather than at Start Wave so the choice is made with the whole prep phase to
  // think in, and it holds Start Wave until it is answered.
  if (!eng.gameOver) eng.offerTravel(bossCleared);
  if (!eng.gameOver) eng.rollDiversions();
  eng.checkAchievements();
  eng.emit();
}
