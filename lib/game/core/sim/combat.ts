import type { Enemy, Tower, Projectile, EnemyType, Element, AncientType, DotKind, CombatStyle } from '../../types';
import { SPOTANIMS } from '../../data/spotanims';
import { resolveImpactTheme, IMPACT_RECIPES, type ImpactTheme } from '../../systems/impact-fx';
import { ENEMY_ANIMS, clipDurationS, DEATH_SETTLE_S } from '../../data/enemy-anims';
import { ENEMIES } from '../../data/enemies';
import { TOWER_STYLES } from '../../data/towers';
import { ASSETS } from '../../assets';
import { distance, distanceSq, squareRange, inSquareRange, knockbackStep } from '../../systems/geometry';
import { selectTarget } from '../../systems/targeting';
import { calculateTowerStats, utilityAuraBonus } from '../../systems/tower-combat';
import { RUN_FX_ID, type DamageSource, type AuraAttribution, type TowerIdentity } from '../../systems/combat-stats';
import { ELEMENTS, ANCIENTS, SUPPORT_SPELLS, weaknessMultiplier, lifestealChance, bloodBonusFrac, bloodBonusCap, bloodBonus, ancientHit, spellSpriteName, BARRAGE_SPLASH_FALLOFF, AIR_KNOCKBACK, tzhaarKnockback, tzhaarStun } from '../../systems/magic';
import { debuffTenacity } from '../../systems/tenacity';
import { archerArrowCount, bowAntiTankMult, cannonBlastRadius, slayerWeaponBonus, isSlayerFavoredTarget, towerMarkKind, venomRamp, venomCap } from '../../systems/tower-identity';
import { rollGearDrops, gearDamageMult } from '../../systems/tower-gear';
import { CATCH_DROP_LUCK } from '../../systems/hunter-traps';
import { mergeUnlockBatch } from '../../systems/unlock-queue';
import { GAME_SOUNDS } from '../sound';
import { shouldExecute, soulStealAddChance } from '../../systems/relics';
import { isCcImmune, styleDamageMult, protectedDamageMult, styleWeaknessMult, absorbWithShield, VOLATILE_STUN_SECS, VOLATILE_BLAST_RADIUS, volatileBlastTowers } from '../../systems/affixes';
import { bossStyleMult, hydraVentCredit, moleIsHidden, stallTenacityBonus, escortDamageMult, SCHEDULABLE_BOSSES, scurriusShouldShear } from '../../systems/boss-mechanics';
import { GRID, uid, enemyRadius, projectileEase, SHORTEST_CAST_S, DOT_LANE, HITSPLAT_LIFE, IMPACT_BASE_SCALE, IMPACT_SPLASH_SCALE } from '../engine-state';
import type { HitsplatKind } from '../engine-state';
import type { GameEngine } from '../engine';
import { stallStacksOf, liveRatsOf, shearRat } from './bosses';
import { makeEnemy, spawnEffect, spawnAncientHitFx, addRing, addBolt } from './waves';
import { bodyY } from '../../systems/enemy-anchor';

/**
 * The fight itself: towers picking targets and firing, projectiles travelling, a
 * hit landing, everything an on-hit effect does, and what a kill pays out.
 *
 * The maths lives in `systems/tower-combat.ts`, `systems/tower-identity.ts` and
 * `systems/magic.ts`; this is the per-frame pipeline that applies it to the world.
 */

export function fireTowers(eng: GameEngine, dt: number) {
  const now = eng.gameTime * 1000; // ms of simulated time (cooldowns are in ms)
  // Damage already heading toward each enemy from in-flight projectiles. A
  // tower won't pick (or keep) a target that another shot will already kill,
  // so kills aren't wasted on overkill — that shot is freed for a live enemy.
  const incoming = new Map<string, number>();
  for (const p of eng.projectiles) {
    if (p.targetId) incoming.set(p.targetId, (incoming.get(p.targetId) ?? 0) + p.damage);
  }
  const doomed = (e: Enemy) => (incoming.get(e.id) ?? 0) >= e.hp;
  for (const tower of eng.towers) {
    if (tower.recoil) tower.recoil = Math.max(0, tower.recoil - dt * 6); // ~0.16s pulse
    // Disabled (e.g. by a Volatile enemy's death blast): tick the timer down and
    // hold fire until it clears.
    if (tower.disabledTimer > 0) { tower.disabledTimer = Math.max(0, tower.disabledTimer - dt); continue; }
    // Utility wizards don't fire — they project a field (see updateUtilityTowers).
    if (tower.type === 'wizard' && tower.mageMode === 'utility') continue;
    let cached = eng.statsCache.get(tower.id);
    if (!cached || cached.epoch !== eng.combatEpoch) {
      cached = {
        epoch: eng.combatEpoch,
        stats: calculateTowerStats(tower, {
          upgrades: eng.meta.upgrades,
          activePrayers: eng.prayer.active,
          activePotions: eng.ge.active,
          allTowers: eng.towers,
          runMods: eng.runMods,
          synergyMult: eng.synergyMultFor(tower.id),
          mageBuff: eng.runFx.mageBuff,
          globalMods: eng.eventTowerMods(),
        }),
      };
      eng.statsCache.set(tower.id, cached);
    }
    const stats = cached.stats;
    const half = squareRange(stats.range, GRID);
    // Test the enemy's body, not just its centre, so a tower fires as soon as
    // an enemy overlaps its range square (e.g. when the road clips the edge).
    // Already-doomed enemies are excluded so the tower looks past them, and so is a
    // Giant Mole that is underground — it takes no damage there, and a tower emptying
    // its cooldowns into a hole in the ground would be pure waste, not a mechanic.
    const inReach = (e: Enemy) =>
      !doomed(e) && !moleIsHidden(e.bossState) && inSquareRange(e.x, e.y, tower.x, tower.y, half + enemyRadius(e));

    // (re)acquire a target. `markKind` is the status this tower spreads (for the
    // `unmarked` priority — a tower only counts its OWN effect as a mark).
    const markKind = towerMarkKind(tower);
    const slayerFavored = (e: Enemy) => isSlayerFavoredTarget(e.type, eng.slayer.task?.type ?? null, !!e.isBoss);
    let target = tower.targetId ? eng.enemies.find(e => e.id === tower.targetId) : undefined;
    // A tower never marries a target: whenever its cooldown is up it looks again, so
    // the shot goes to whatever the priority ranks first *now* — the runner that just
    // slipped past, the boss that just walked in — instead of to whatever it happened
    // to lock on to when the wave started. Between shots the pick only changes when it
    // dies or leaves range, which keeps the sight line, the DPS engagement clock and
    // the prayer drain reading the truth every frame.
    const ready = now - tower.lastFired >= stats.cooldown;
    // Slayer specialisation is sticky too: if it's chewing a non-favoured target
    // while a favoured one (task / superior / boss) is in range, drop it so the
    // reselect below prefers the specialised kill, regardless of set priority.
    if (target && tower.type === 'slayer' && !slayerFavored(target) &&
        eng.enemies.some(e => inReach(e) && slayerFavored(e))) {
      target = undefined;
    }
    if (!target || !inReach(target) || ready) {
      const inRange = eng.enemies.filter(inReach);
      // Slayer tower prioritises its specialised category over the raw priority:
      // pick among the favoured enemies if any are in range, else target normally.
      // Within the chosen pool the player's priority still decides. (Damage bonus
      // is applied separately in slayerWeaponBonus.)
      let pool = inRange;
      if (tower.type === 'slayer') {
        const favored = inRange.filter(slayerFavored);
        if (favored.length > 0) pool = favored;
      }
      target = selectTarget(pool, tower.x, tower.y, eng.path, tower.targetingPriority, markKind) ?? undefined;
      tower.targetId = target?.id ?? null;
    }
    if (!target || !ready) continue;

    tower.lastFired = now;
    tower.recoilAngle = Math.atan2(target.y - tower.y, target.x - tower.x);
    tower.recoil = 1; // pulse, decays above

    // Base damage: Ancients hit for the Ice-barrage values (16/22/25/30),
    // independent of element; everything else uses the tier's own damage.
    let baseDamage = tower.type === 'wizard' && (tower.mageMode ?? 'elemental') === 'ancients'
      ? ancientHit(tower.level)
      : tower.damage;
    if (tower.type === 'cannon') {
      const lo = tower.minDamage ?? 0;
      const hi = tower.maxDamage ?? 0;
      baseDamage = lo + Math.random() * (hi - lo);
    }
    let damage = Math.floor((baseDamage + stats.flatDamageBonus) * stats.damageMultiplier * eng.runDamageMult());
    // Utility damage-aura boosting this shot (for the DPS meter's attribution).
    const projAura = utilityAura(eng, tower);

    // Slayer weapon: native bonus vs the current task target / superiors / bosses,
    // independent of (and stacking with) the Slayer Helmet applied in damage().
    if (tower.type === 'slayer') {
      damage = Math.floor(damage * slayerWeaponBonus(target.type, eng.slayer.task?.type ?? null, !!target.isBoss));
    }

    // Base projectile flavour; the cannon splashes (radius grows by tier), toxic
    // venoms, tzhaar crushes.
    let projColor = tower.color;
    // Impact theme is keyed off the PROJECTILE (the tower's spell), never the
    // enemy hit — elemental wizards tag the bolt with their element, ancients
    // with their barrage type, so hit() themes the burst correctly (undefined
    // here → a plain arrow/cannon spark).
    let projElement: Element | undefined;
    let projAncient: AncientType | undefined;
    let projSpecial: Projectile['special'] | undefined = tower.special === 'rapid' || tower.special === 'aoe' ? undefined : tower.special;
    let projAoe = tower.special === 'aoe';
    const projBlastRadius = tower.type === 'cannon' ? cannonBlastRadius(tower.level) : undefined;
    let projLifesteal = false;
    let projBonusMaxHpFrac = 0;
    let projBonusMaxHpCap = 0;
    const projSpell = spellSpriteName(tower) ?? undefined;

    // Wizard spellbooks: Elemental (single-target status + weakness bonus),
    // Ancients (AoE barrage with a signature status), Utility (support aura,
    // applied in tower-combat — it just fires a plain bolt here).
    if (tower.type === 'wizard') {
      const mode = tower.mageMode ?? 'elemental';
      if (mode === 'elemental') {
        const spec = ELEMENTS[(tower.element ?? 'air') as Exclude<Element, 'none'>];
        projColor = spec.glow ?? spec.color; // glow/trail matches the spell sprite
        projElement = tower.element ?? 'air'; // themes the impact burst (fire → fire, …)
        projSpecial = spec.effect;
        damage = Math.floor(damage * weaknessMultiplier(tower.element ?? 'air', target.weakness));
      } else if (mode === 'ancients') {
        const anc = tower.ancientType ?? 'ice';
        const spec = ANCIENTS[anc];
        projColor = spec.glow ?? spec.color; // glow/trail matches the spell sprite
        projAncient = anc; // themes the impact burst (ice/blood/shadow/smoke)
        projSpecial = spec.effect;
        projAoe = true;
        projLifesteal = !!spec.lifesteal;
        // Blood barrage adds (0.75·level)% of each target's max HP, capped at 30·level.
        if (anc === 'blood') { projBonusMaxHpFrac = bloodBonusFrac(tower.level); projBonusMaxHpCap = bloodBonusCap(tower.level); }
        // Ice applies its slow NOW (on the tower's attack cadence), not on contact:
        // the long sound-synced flight shouldn't delay the crowd-control. Damage
        // still lands with the bolt, so drop the on-hit slow. Slows every enemy in
        // the barrage's blast radius around the target, as the splash would.
        if (anc === 'ice') {
          for (const e of eng.enemies) {
            if (distanceSq(e.x, e.y, target.x, target.y) <= 80 * 80) applySlow(eng, e);
          }
          projSpecial = undefined;
        }
      }
    }

    // Every projectile flies at a fixed nominal speed (distance-scaled) and
    // eases in (slow→fast) over that time (see moveProjectiles). A wizard plays
    // its spell's cast clip here on fire and tags the bolt with the matching
    // impact clip, which plays when it connects (GameEngine.hit) — the
    // authentic OSRS cast-on-fire / hit-on-impact pair.
    let soundKey = `fire_${tower.type}`;
    let hitSound: string | undefined;
    const dist = distance(tower.x, tower.y, target.x, target.y);
    let flight = dist / 600; // nominal flight (archer/cannon/spell alike)
    let projAnim: string | undefined;
    if (tower.type === 'wizard') {
      const mode = tower.mageMode ?? 'elemental';
      const tier = mode === 'ancients' ? (tower.ancientType ?? 'ice') : (tower.element ?? 'air');
      soundKey = `cast_${tier}_${tower.level}`;
      hitSound = `hit_${tier}_${tower.level}`;
      // The spell's real flight GFX (baked from the cache); the spell icon
      // stays as the renderer's fallback if the sheet ever fails to load.
      if (SPOTANIMS[`proj_${tier}_${tower.level}`]) projAnim = `proj_${tier}_${tower.level}`;
      // Sound-sync the arc: the bolt must not land before the cast clip ends,
      // so the impact sfx never steps on the cast. Floor the flight at the cast
      // duration + 25% (a short beat of air after the cast lands). Until the
      // clip's duration has decoded, fall back to the shortest cast clip's
      // length so the floor never overshoots a real cast.
      const castDur = eng.sound.duration(soundKey);
      flight = Math.max(flight, (isFinite(castDur) ? castDur : SHORTEST_CAST_S) * 1.25);
    }
    flight = Math.max(0.05, flight); // tiny floor: never instantaneous / div-by-zero

    // Launch one projectile at `tgt` for `dmg`, counting it as incoming so other
    // towers firing this same frame treat the target as (more) doomed.
    const projType: Projectile['type'] =
      tower.type === 'cannon' ? 'cannonball'
      : tower.type !== 'wizard' ? 'arrow'
      : projAncient ? (`ancient_${projAncient}` as Projectile['type']) // ancients carry their tier so the impact themes right
      : 'spell';
    const launch = (tgt: Enemy, dmg: number, fl: number) => {
      eng.projectiles.push({
        id: uid(),
        x: tower.x,
        y: tower.y,
        ox: tower.x,
        oy: tower.y,
        flight: fl,
        age: 0,
        targetId: tgt.id,
        speed: distance(tower.x, tower.y, tgt.x, tgt.y) / fl, // trail/legacy; motion uses the ease curve
        damage: dmg,
        color: projColor,
        type: projType,
        element: projElement,
        special: projSpecial,
        aoe: projAoe || undefined,
        blastRadius: projBlastRadius,
        lifesteal: projLifesteal || undefined,
        bonusMaxHpFrac: projBonusMaxHpFrac || undefined,
        bonusMaxHpCap: projBonusMaxHpCap || undefined,
        spellIcon: projSpell,
        arrowIcon: tower.type === 'archer' ? 'dragon_arrow' : undefined,
        hitSound,
        projAnim,
        sourceTowerId: tower.id,
        aura: projAura,
        trail: [],
      });
      incoming.set(tgt.id, (incoming.get(tgt.id) ?? 0) + dmg);
    };

    // Per-target multipliers keyed off the ENEMY: the signature gear mult
    // (Twisted bow scales with the target's max HP, Darklight with its category)
    // and the tier-4 bow's anti-tank nudge. Computed per shot so twin-shot / Double
    // Shot arrows against other enemies get their own value, not the primary's.
    const arrowDmg = (tgt: Enemy) => {
      let d = Math.floor(damage * gearDamageMult(tower, tgt, eng.slayer.task?.type ?? null));
      if (tower.type === 'archer' && tower.level >= 4) d = Math.floor(d * bowAntiTankMult(tgt.maxHp));
      return d;
    };

    launch(target, arrowDmg(target), flight);

    // Dark Bow twin-shot: the archer (tier 3+) looses a second arrow at the next
    // best target in range, or the same one if it's alone (a focused burst).
    if (tower.type === 'archer' && archerArrowCount(tower.level) > 1) {
      const others = eng.enemies.filter(e => e.id !== target.id && inReach(e));
      const second = selectTarget(others, tower.x, tower.y, eng.path, tower.targetingPriority, markKind) ?? target;
      const fl2 = Math.max(0.05, distance(tower.x, tower.y, second.x, second.y) / 600);
      launch(second, arrowDmg(second), fl2);
    }

    // Double Shot (roguelite transform): ranged towers loose an extra shot at
    // a *different* enemy in range — spreads damage rather than amplifying it.
    if (eng.runFx.doubleShot && TOWER_STYLES[tower.type]?.style === 'ranged') {
      const others = eng.enemies.filter(e => e.id !== target.id && inReach(e));
      const extra = others.length ? others[Math.floor(Math.random() * others.length)] : null;
      if (extra) {
        const fl2 = Math.max(0.05, distance(tower.x, tower.y, extra.x, extra.y) / 600);
        launch(extra, arrowDmg(extra), fl2);
      }
    }

    eng.sound.play(soundKey, 70);
  }
}

/**
 * Utility wizards are support casters: instead of firing, each projects ONE
 * field over the enemies in its range. The field status is re-applied every
 * frame (short refreshed timer) so it lasts exactly while an enemy is inside.
 * Sanctity has no field — it's a Prayer battery that trickles points back.
 */
export function updateUtilityTowers(eng: GameEngine) {
  for (const tower of eng.towers) {
    if (tower.type !== 'wizard' || tower.mageMode !== 'utility') continue;
    const spell = tower.supportSpell ?? 'curse';

    if (spell === 'sanctity') continue; // Prayer Ward: cuts drain (in PrayerSystem), no field

    const range = eng.effectiveStats(tower.id)?.range ?? tower.range;
    const half = squareRange(range, GRID);
    for (const e of eng.enemies) {
      if (!inSquareRange(e.x, e.y, tower.x, tower.y, half + enemyRadius(e))) continue;
      if (spell === 'curse') {
        // Refreshed while inside; tenacity-scaled but doesn't build boss tenacity
        // (it's a continuous aura, not a discrete hit).
        e.vulnTimer = Math.max(e.vulnTimer ?? 0, 0.5 * (1 - tenacity(eng, e)));
      } else if (spell === 'enfeeble') {
        applySlow(eng, e, 0.5, false);
      }
    }
  }
}

/** Display identity of a tower for the DPS panel (grouping + labels). Returns
 *  null for an unknown id (e.g. a sold tower or the Run-FX bucket), letting the
 *  stats system fall back to its last-known / synthetic identity. */
export function towerIdentity(eng: GameEngine, id: string): TowerIdentity | null {
  const t = eng.towers.find(tw => tw.id === id);
  if (!t) return null;
  let subcategory: string | null = null;
  let subLabel: string | null = null;
  let isUtility = false;
  if (t.type === 'wizard') {
    const mode = t.mageMode ?? 'elemental';
    if (mode === 'elemental') {
      const el = t.element ?? 'air';
      subcategory = el;
      subLabel = ELEMENTS[el as Exclude<Element, 'none'>]?.label ?? el;
    } else if (mode === 'ancients') {
      const anc = t.ancientType ?? 'ice';
      subcategory = anc;
      subLabel = `${ANCIENTS[anc]?.label ?? anc} barrage`;
    } else {
      const sp = t.supportSpell ?? 'curse';
      subcategory = 'utility';
      subLabel = SUPPORT_SPELLS[sp]?.label ?? sp;
      isUtility = true;
    }
  }
  // Current icon + display name: a wizard shows its live spell (element/barrage/
  // utility cast) — the actual spell it's throwing, e.g. "Fire Blast" / "Ice
  // Barrage" — so the panel name matches the icon and the tower on the board,
  // not the generic tier suffix ("Blast"). Everything else keeps its tier name
  // and current tier sprite.
  const towerIcons = ASSETS.towers as Record<string, Record<number, string>>;
  let icon: string | undefined;
  let name = t.name;
  if (t.type === 'wizard') {
    const sp = spellSpriteName(t);
    if (sp) {
      icon = (ASSETS.spells as Record<string, string>)[sp];
      name = sp.replace(/_/g, ' ');
    }
  }
  icon ??= towerIcons[t.type]?.[t.level] ?? towerIcons[t.type]?.[1];
  return {
    type: t.type,
    style: TOWER_STYLES[t.type]?.style ?? 'melee',
    subcategory,
    subLabel,
    name,
    color: t.color,
    icon,
    isUtility,
  };
}

/** The Utility damage-aura boosting a firing tower right now, resolved to the
 *  contributing wizards + each one's share of the extra (mirrors the diminishing
 *  stack in tower-combat). Undefined when no aura applies, so a plain hit records
 *  no split. */
export function utilityAura(eng: GameEngine, tower: Tower): AuraAttribution | undefined {
  const parts: { id: string; bonus: number }[] = [];
  for (const t of eng.towers) {
    if (t.id === tower.id || t.type !== 'wizard' || t.mageMode !== 'utility') continue;
    if (distance(t.x, t.y, tower.x, tower.y) > t.range) continue;
    const b = utilityAuraBonus(t.level).damage;
    if (b > 0) parts.push({ id: t.id, bonus: b });
  }
  if (!parts.length) return undefined;
  // Diminishing returns: strongest counts fully, each next ×0.5^rank (matches
  // diminishingSum), so the per-wizard weight is its own term in that sum.
  parts.sort((a, b) => b.bonus - a.bonus);
  const weights = parts.map((p, i) => p.bonus * Math.pow(0.5, i));
  const factor = weights.reduce((s, w) => s + w, 0);
  if (factor <= 0) return undefined;
  return { factor, parts: parts.map((p, i) => ({ id: p.id, share: weights[i] / factor })) };
}

export function moveProjectiles(eng: GameEngine, dt: number) {
  for (let i = eng.projectiles.length - 1; i >= 0; i--) {
    const p = eng.projectiles[i];
    // Home on the live target while it exists; once it dies, the destination
    // stays frozen at its last position so the bolt still completes its flight
    // (and any AoE) instead of vanishing — no wasted shot.
    const target = eng.enemies.find(e => e.id === p.targetId) ?? null;
    if (target) { p.destX = target.x; p.destY = target.y; }
    const destX = p.destX ?? p.x;
    const destY = p.destY ?? p.y;
    if (p.trail) {
      p.trail.push({ x: p.x, y: p.y });
      if (p.trail.length > 6) p.trail.shift();
    }
    // Ease-in flight: lerp from the launch point toward the destination with
    // an exponential curve, so the bolt creeps off slowly then accelerates,
    // arriving at age===flight — keeping the sound-synced total flight time.
    p.age = (p.age ?? 0) + dt;
    const flight = p.flight ?? 0.4;
    const t = Math.min(1, p.age / flight);
    const f = projectileEase(t);
    const ox = p.ox ?? p.x;
    const oy = p.oy ?? p.y;
    p.x = ox + (destX - ox) * f;
    p.y = oy + (destY - oy) * f;
    const d = Math.hypot(destX - p.x, destY - p.y);
    if (t >= 1 || d < 8) {
      hit(eng, p, target);
      eng.projectiles.splice(i, 1);
    }
  }
}

/** Combat style behind a projectile (for the Armored affix's style resist).
 *  Reads the source tower's style; falls back to the projectile kind if the
 *  tower is already gone. */
export function projectileStyle(eng: GameEngine, p: Projectile): CombatStyle | undefined {
  const t = p.sourceTowerId ? eng.towers.find(tw => tw.id === p.sourceTowerId) : undefined;
  if (t) return TOWER_STYLES[t.type]?.style;
  switch (p.type) {
    // A cannonball is Ranged, as it is in OSRS and as TOWER_STYLES says — this
    // fallback used to call it melee, which only ever mattered for a shot already
    // in the air when its cannon was sold. It matters now: styleWeaknessMult reads
    // this, so the wrong answer here would quietly void a ranged monster's weakness.
    case 'arrow': case 'dart': case 'bolt': case 'chinchompa': case 'cannonball': return 'ranged';
    case 'spell': case 'magic_projectile':
    case 'ancient_ice': case 'ancient_blood': case 'ancient_shadow': case 'ancient_smoke': return 'magic';
    case 'godsword': return 'melee';
    default: return undefined;
  }
}

export function hit(eng: GameEngine, p: Projectile, target: Enemy | null) {
  const style = projectileStyle(eng, p);
  // Magic impacts play the spell's REAL baked hit-GFX from the cache when one
  // exists (`hitSound` doubles as the SPOTANIMS slug, e.g. `hit_fire_4`); the
  // element-themed procedural burst survives only as the fallback for magic
  // without a baked sheet. Arrows/cannonballs keep the plain coloured spark.
  const gfx = p.hitSound && SPOTANIMS[p.hitSound] ? p.hitSound : null;
  // Ancients hits are actor graphics: fitted to the struck model (ice cube
  // encases the NPC) and anchored to it, instead of a point burst.
  const isAncientGfx = !!gfx && /^hit_(ice|blood|shadow|smoke)_/.test(gfx);
  const theme = gfx ? null : resolveImpactTheme(p.type, p.element);
  const isAoe = !!(p.aoe || p.special === 'aoe');
  // Land the burst on the target's body (enemies draw centred on x/y) when it's
  // still alive, so the explosion reads as hitting the model rather than fizzling
  // at wherever the homing shot happened to end; fall back to the impact point.
  const ax = target && target.hp > 0 ? target.x : p.x;
  const ay = target && target.hp > 0 ? target.y : p.y;
  // Impact direction = the way the shot was travelling (launch → impact), so the
  // debris is knocked off the model in the direction of the hit.
  const travelX = ax - (p.ox ?? p.x);
  const travelY = ay - (p.oy ?? p.y);
  // Single-target magic bursts here (sized to the struck model); AoE bursts are
  // spawned per-target in the splash loop below so each hit — primary and splash
  // — gets its own right-sized burst. Non-magic shots keep the plain spark.
  const liveTarget = target && target.hp > 0 ? target : null;
  if (gfx && !isAoe) {
    if (isAncientGfx && liveTarget) spawnAncientHitFx(eng, gfx, liveTarget);
    else spawnEffect(eng, gfx, ax, ay, impactScale(eng, liveTarget), liveTarget ?? undefined);
  }
  else if (theme && !isAoe) spawnMagicImpact(eng, ax, ay, theme, impactScale(eng, liveTarget), travelX, travelY);
  else if (!theme && !gfx) spawnImpactParticles(eng, p.x, p.y, p.color);
  if (p.hitSound) eng.sound.play(p.hitSound, 60); // spell impact sfx (paired with its cast)
  // Archer arrows have no impact clip wired yet, and the generic melee "thud" is
  // wrong for a flying arrow — so they land silently (`arrowIcon` is set iff the
  // shot came from an archer). The Toxic dart is likewise silent on impact: its
  // venom is the payload, and the melee thud doesn't fit. Everything else thuds.
  const silent = !!p.arrowIcon || p.special === 'venom';
  let primaryKilled = false;
  if (isAoe) {
    // Magic barrages splash for reduced damage on non-primary targets so AoE
    // stays a side-grade to single-target; the cannon keeps full splash.
    const splash = p.type === 'cannonball' ? 1 : BARRAGE_SPLASH_FALLOFF;
    // Snapshot: damage() splices the live array as enemies die. The cannon's
    // blast widens by tier (blastRadius); Ancients barrages keep the 80px default.
    const radius = p.blastRadius ?? 80;
    const near = eng.enemies.filter(e => distanceSq(e.x, e.y, p.x, p.y) <= radius * radius);
    // If the intended target died mid-flight, the closest enemy at impact takes
    // the full-damage primary hit so the barrage still lands "normally".
    const primary = target && near.includes(target)
      ? target
      : near.reduce<Enemy | null>((best, e) =>
          !best || distanceSq(e.x, e.y, p.x, p.y) < distanceSq(best.x, best.y, p.x, p.y) ? e : best, null);
    for (const e of near) {
      const isPrimary = e === primary;
      const scale = isPrimary ? 1 : splash;
      // Real hit-GFX (or themed fallback burst) on EVERY struck enemy — a
      // barrage paints its spell's authentic impact across the whole clump,
      // like in the client. Ancients GFX fit each struck model at full size
      // (every barraged NPC wears its own ice cube); other impacts shrink on
      // splash targets (IMPACT_SPLASH_SCALE) to read as the reduced damage.
      // Direction (procedural only): primary keeps the shot's travel; splash
      // debris is thrown outward from the blast centre.
      const dx = isPrimary ? travelX : e.x - p.x;
      const dy = isPrimary ? travelY : e.y - p.y;
      if (gfx) {
        if (isAncientGfx) spawnAncientHitFx(eng, gfx, e);
        else spawnEffect(eng, gfx, e.x, e.y, impactScale(eng, e) * (isPrimary ? 1 : IMPACT_SPLASH_SCALE), e);
      }
      else if (theme) spawnMagicImpact(eng, e.x, e.y, theme, impactScale(eng, e) * (isPrimary ? 1 : IMPACT_SPLASH_SCALE), dx, dy);
      // Blood barrage: bonus damage as a % of this enemy's max HP, splash-scaled, capped per hit.
      const bonus = p.bonusMaxHpFrac
        ? bloodBonus(e.maxHp, p.bonusMaxHpFrac, p.bonusMaxHpCap ?? Infinity, scale)
        : 0;
      const dmg = Math.floor(p.damage * scale) + bonus;
      const killed = damage(eng, e, dmg, 'hit', false, silent, 0, style,
        { towerId: p.sourceTowerId, tag: isPrimary ? 'direct' : 'splash', aura: p.aura, bloodFrac: dmg > 0 ? bonus / dmg : 0 });
      if (isPrimary) primaryKilled = killed;
      if (!killed) { applyOnHit(eng, e, p); applyVenomTips(eng, e); }
    }
  } else if (target) {
    // Single-target: only resolves if the target is still alive at impact;
    // otherwise the bolt just fizzles where the target was (particles only).
    const bonus = p.bonusMaxHpFrac
      ? bloodBonus(target.maxHp, p.bonusMaxHpFrac, p.bonusMaxHpCap ?? Infinity)
      : 0;
    const dmg = p.damage + bonus;
    primaryKilled = damage(eng, target, dmg, 'hit', false, silent, 0, style,
      { towerId: p.sourceTowerId, tag: 'direct', aura: p.aura, bloodFrac: dmg > 0 ? bonus / dmg : 0 });
    if (!primaryKilled) { applyOnHit(eng, target, p); applyVenomTips(eng, target); }
    // Pierce (roguelite transform): the bolt punches through to the nearest
    // *other* enemy near the impact, landing a second full hit.
    if (eng.runFx.pierce) pierceThrough(eng, p, target);
  }
  // Blood barrage: a chance to steal a life when the primary target is killed —
  // not a guaranteed heal on every splash kill.
  if (p.lifesteal && primaryKilled) tryLifesteal(eng, p.sourceTowerId);
}

/**
 * Apply a projectile's on-hit status to a surviving enemy. Fire/Smoke share
 * `burn` and Earth/Shadow share `stun`, but single-target (Elemental) vs AoE
 * (Ancients) — read off `p.aoe` — tunes them: Fire burns by % max HP while
 * Smoke is flat poison; Earth stuns long while Shadow stuns briefly.
 */
/**
 * Crowd-control resistance, 0..1. Reduces how long non-damaging debuffs (slow,
 * stun, vulnerability, knockback) last — damage-over-time (burn/poison) ignores
 * it. Normal monsters scale with the wave (wave/2 %, capped 50%); superiors cap
 * at 75%. Bosses start at 50% and climb to 90% by wave. A boss the stall-breaker
 * has flagged is topped up on top of that, to the point of outright immunity —
 * which is what stops control alone from holding a fight open forever.
 */
export function tenacity(eng: GameEngine, e: Enemy): number {
  return debuffTenacity({
    isBoss: e.isBoss,
    superior: e.type.startsWith('superior_'),
    wave: eng.wave,
    debuffHits: e.debuffHits,
    bonus: stallTenacityBonus(stallStacksOf(eng, e)),
  });
}

/** Register a non-damaging debuff landing on an enemy: bosses build tenacity
 *  (+1% per hit) from it. No-op for non-bosses. Continuous auras shouldn't call
 *  this (they'd inflate the counter every frame). The counter decays each frame
 *  (`decayDebuffHits`), so it measures the control *currently* being sustained. */
export function noteDebuffHit(eng: GameEngine, e: Enemy) {
  if (e.isBoss) e.debuffHits = (e.debuffHits ?? 0) + 1;
}

/** Apply the move-speed slow (toxic/ice/enfeeble), shortened by the enemy's
 *  tenacity. `count` registers the hit for boss tenacity; pass false for the
 *  per-frame utility aura so it doesn't inflate the counter. `spread` lets the
 *  Chain Freeze card propagate the slow to neighbours (once, non-spreading). */
export function applySlow(eng: GameEngine, e: Enemy, seconds = 2, count = true, spread = true) {
  if (isCcImmune(e.affixes ?? [])) return; // Warded affix: ignores slows/freezes
  const eff = seconds * (1 - tenacity(eng, e));
  if (count) noteDebuffHit(eng, e);
  if (eff <= 0) return;
  e.speed = e.baseSpeed * 0.5;
  e.slowTimer = Math.max(e.slowTimer, eff);
  // Chain Freeze (roguelite transform): the chill jumps to nearby enemies, so
  // a single slow source locks down a cluster. Neighbours don't re-spread.
  const r = eng.runFx.chainFreezeRadius;
  if (spread && r > 0) {
    for (const o of eng.enemies) {
      if (o !== e && o.slowTimer <= 0 && distanceSq(o.x, o.y, e.x, e.y) <= r * r) {
        addBolt(eng, e.x, e.y, o.x, o.y, '#7ad7ff', 0.3); // the chill jumping across
        applySlow(eng, o, seconds, false, false);
      }
    }
  }
}

/** Venom Tips (roguelite transform): stack a venom DoT on every hit, ramping
 *  to a damage-scaled cap (shares the enemy's `venom` slot with the Toxic tower). */
export function applyVenomTips(eng: GameEngine, e: Enemy) {
  const v = eng.runFx.venomTips;
  if (!v) return;
  const dots = (e.dots ??= {});
  const cur = dots.venom;
  // Keep the card's own 3× headroom, but never below the shared wave-scaled
  // ceiling so envenomed hits stay ahead of the Smoke poison late-game too.
  const cap = Math.max(v.dps * 3, venomCap(eng.wave, v.dps));
  if (cur) { cur.dps = Math.min(cap, cur.dps + v.dps); cur.timer = Math.max(cur.timer, v.dur); }
  else dots.venom = { timer: v.dur, dps: v.dps, accum: 0, tickTimer: 0 };
  // A couple of green venom motes flick off the target on each envenomed hit.
  for (let i = 0; i < 2; i++) {
    eng.particles.push({ x: e.x + (Math.random() - 0.5) * 10, y: e.y, vx: (Math.random() - 0.5) * 40, vy: -20 - Math.random() * 30, life: 0.45, maxLife: 0.45, color: '#6abe30', size: 2 });
  }
}

/** Pierce (roguelite transform): land a second full hit on the nearest enemy
 *  other than `target` within the impact radius. Depth-guarded via damage(). */
export function pierceThrough(eng: GameEngine, p: Projectile, target: Enemy) {
  const r = eng.runFx.pierce?.radius ?? 0;
  if (r <= 0) return;
  let best: Enemy | null = null;
  let bestD = r * r;
  for (const o of eng.enemies) {
    if (o === target) continue;
    const d = distanceSq(o.x, o.y, target.x, target.y);
    if (d <= bestD) { bestD = d; best = o; }
  }
  if (!best) return;
  addBolt(eng, target.x, target.y, best.x, best.y, '#ffe08a', 0.22); // the bolt punching through
  // A second full hit from the same bolt — credit the firing tower (with its aura).
  const killed = damage(eng, best, p.damage, 'hit', false, true, 1, projectileStyle(eng, p),
    { towerId: p.sourceTowerId, tag: 'direct', aura: p.aura });
  if (!killed) { applyOnHit(eng, best, p); applyVenomTips(eng, best); }
}

export function applyOnHit(eng: GameEngine, e: Enemy, p: Projectile) {
  // Warded affix: shrug off the movement crowd-control specials (slow handled in
  // applySlow; stun/pushback/crush guarded here). DoTs and amp still apply.
  if (isCcImmune(e.affixes ?? []) && (p.special === 'stun' || p.special === 'pushback' || p.special === 'crush')) return;
  // Source style, stamped on any DoT raised below so boss style-resistance
  // (Zulrah's phases) reduces the over-time damage — notably Fire's %max-HP
  // burn — just as it already reduces the projectile's direct hit.
  const style = projectileStyle(eng, p);
  const fx = p.sourceTowerId ?? RUN_FX_ID; // DPS-meter owner for this hit's effects
  switch (p.special) {
    case 'slow':
      applySlow(eng, e);
      eng.stats.recordEffect(fx, eng.wave, { slowCount: 1 });
      break;
    case 'stun': {
      const eff = (p.aoe ? 0.8 : 2) * (1 - tenacity(eng, e));
      noteDebuffHit(eng, e);
      if (eff > 0) {
        e.stunTimer = Math.max(e.stunTimer, eff);
        eng.stats.recordEffect(fx, eng.wave, { stunCount: 1, stunSeconds: eff });
      }
      break;
    }
    case 'burn': {
      // Ancient Smoke poisons (green) for the current wave number per second
      // (scales into the late game); elemental Fire burns (orange) for a % of the
      // target's max HP. Each goes in its own DoT slot so an enemy can carry both
      // at once and they tick / splat separately rather than merging.
      const kind: DotKind = p.aoe ? 'poison' : 'burn';
      const dur = p.aoe ? 4 : 3;
      const dps = p.aoe ? eng.wave : Math.max(3, Math.floor(e.maxHp * 0.02));
      const dots = (e.dots ??= {});
      const cur = dots[kind];
      if (cur) { cur.timer = Math.max(cur.timer, dur); cur.dps = Math.max(cur.dps, dps); cur.style = style; cur.sourceTowerId = p.sourceTowerId; }
      else dots[kind] = { timer: dur, dps, accum: 0, tickTimer: 0, style, sourceTowerId: p.sourceTowerId };
      break;
    }
    case 'amp': {
      const eff = 3 * (1 - tenacity(eng, e));
      noteDebuffHit(eng, e);
      if (eff > 0) {
        e.vulnTimer = Math.max(e.vulnTimer ?? 0, eff);
        eng.stats.recordEffect(fx, eng.wave, { ampCount: 1 });
      }
      break;
    }
    case 'pushback': {
      // The wizard's Air gust shoves by AIR_KNOCKBACK; the TzHaar always knocks
      // back too, scaled by its weapon tier (½·=·+50%·×2 of Air).
      const src = p.sourceTowerId ? eng.towers.find(t => t.id === p.sourceTowerId) : undefined;
      const dist = (src?.type === 'tzhaar' ? tzhaarKnockback(src.level) : AIR_KNOCKBACK) * (1 - tenacity(eng, e));
      const moved = knockback(eng, e, dist);
      noteDebuffHit(eng, e);
      if (moved > 0) eng.stats.recordEffect(fx, eng.wave, { pushCount: 1, pushTiles: moved / GRID });
      // TzHaar always stuns on hit now (0.3s/0.45s at the dagger tiers) so the
      // shove reads as a real setback instead of an instant walk-back.
      if (src?.type === 'tzhaar') {
        if (moved > 0) addRing(eng, e.x, e.y, 3, 16, '#ffb066', 0.28, 2);
        const eff = tzhaarStun(src.level) * (1 - tenacity(eng, e));
        if (eff > 0) {
          e.stunTimer = Math.max(e.stunTimer, eff);
          eng.stats.recordEffect(fx, eng.wave, { stunCount: 1, stunSeconds: eff });
        }
      }
      break;
    }
    case 'crush': {
      // TzHaar maul: a tier-scaled shove (see tzhaarKnockback) plus a brief stun —
      // a crushing blow.
      const src = p.sourceTowerId ? eng.towers.find(t => t.id === p.sourceTowerId) : undefined;
      const moved = knockback(eng, e, tzhaarKnockback(src?.level ?? 3) * (1 - tenacity(eng, e)));
      if (moved > 0) addRing(eng, e.x, e.y, 3, 16, '#ffb066', 0.28, 2);
      const eff = tzhaarStun(src?.level ?? 3) * (1 - tenacity(eng, e));
      noteDebuffHit(eng, e);
      if (eff > 0) e.stunTimer = Math.max(e.stunTimer, eff);
      eng.stats.recordEffect(fx, eng.wave, {
        ...(moved > 0 ? { pushCount: 1, pushTiles: moved / GRID } : {}),
        ...(eff > 0 ? { stunCount: 1, stunSeconds: eff } : {}),
      });
      break;
    }
    case 'venom': {
      // Toxic venom: its OWN DoT (tracked apart from Smoke `poison`) that ramps
      // each reapply up to a damage-scaled cap and keeps ticking after the enemy
      // leaves range. DoT → tenacity-immune; splats a darker green than poison.
      const { step, cap, dur } = venomRamp(p.damage, eng.wave);
      const dots = (e.dots ??= {});
      const cur = dots.venom;
      if (cur) { cur.dps = Math.min(cap, cur.dps + step); cur.timer = Math.max(cur.timer, dur); cur.style = style; cur.sourceTowerId = p.sourceTowerId; }
      else dots.venom = { timer: dur, dps: step, accum: 0, tickTimer: 0, style, sourceTowerId: p.sourceTowerId };
      break;
    }
    default:
      break;
  }
}

/** Blood barrage lifesteal: a level-scaled chance to restore one life. On a
 *  success, ring the casting tower red and bump `lifestealSeq` so the UI can
 *  celebrate it (lives-orb blip + floating heart). */
export function tryLifesteal(eng: GameEngine, sourceTowerId?: string) {
  if (eng.lives >= eng.maxLives) return;
  const tower = sourceTowerId ? eng.towers.find(t => t.id === sourceTowerId) : null;
  if (Math.random() >= lifestealChance(tower?.level ?? 1)) return;
  eng.lives += 1;
  eng.lifestealSeq += 1;
  if (tower) addRing(eng, tower.x, tower.y, 4, 26, '#c81e1e', 0.5, 3);
  eng.emit();
}

/** Air gust: shove an enemy back toward the previous waypoint (clamped).
 *  Returns the distance actually moved (logic px), for the damage-meter's
 *  "tiles pushed" tally. */
export function knockback(eng: GameEngine, e: Enemy, dist: number): number {
  const prev = eng.path[e.pathIndex];
  if (!prev) return 0;
  const r = knockbackStep(e.x, e.y, prev.x, prev.y, dist);
  e.x = r.x;
  e.y = r.y;
  return r.moved;
}

/** Per-hit size multiplier for a magic impact, derived from the struck model
 *  (a boss's 60px half-size vs a normal 30px), around the halved baseline, with
 *  ±15% random jitter so no two bursts are identical. `null` (a fizzle with no
 *  live target) falls back to a normal-sized enemy. */
export function impactScale(eng: GameEngine, e: Enemy | null): number {
  const modelSize = e ? (e.isBoss ? 60 : 30) * (e.renderScale ?? 1) : 30;
  const modelScale = Math.min(2.2, Math.max(0.7, modelSize / 30)); // 1 = normal, ~2 = boss
  const jitter = 0.85 + Math.random() * 0.3;
  return IMPACT_BASE_SCALE * modelScale * jitter;
}

/** Element-themed magic impact: a themed particle debris burst (the star) plus a
 *  few leading shards, from {@link IMPACT_RECIPES} (this engine applies the jitter
 *  + direction). Deliberately has NO round bloom/ring — the hit reads like the
 *  enemy death shatter but **directional**: debris flies off the model along
 *  `dirX,dirY` (the shot's travel direction, or outward-from-blast for splash),
 *  fanned within the recipe's `spread` and shoved forward by `forwardBias`, in the
 *  element's own colour (keyed off the projectile, via {@link resolveImpactTheme}).
 *  Everything spatial scales by `scale`; counts wobble ±1 for shape variety. If
 *  `dirX,dirY` is ~zero the burst falls back to a full radial spray. */
export function spawnMagicImpact(eng: GameEngine, x: number, y: number, theme: ImpactTheme, scale = 1, dirX = 0, dirY = 0) {
  const r = IMPACT_RECIPES[theme];
  // Impact direction: unit vector the debris is pushed along. Degenerate (a shot
  // that landed on its own launch point / a dead-centre splash) → full radial.
  const dlen = Math.hypot(dirX, dirY);
  const hasDir = dlen > 0.001;
  const baseAngle = hasDir ? Math.atan2(dirY, dirX) : 0;
  const ux = hasDir ? dirX / dlen : 0;
  const uy = hasDir ? dirY / dlen : 0;
  const pc = r.particles;
  // Fan the debris off the model within ±spread of the impact direction (or the
  // full circle when we have no direction), then shove it forward along the hit.
  const spread = hasDir ? pc.spread : Math.PI;
  const count = Math.max(3, pc.count + (((Math.random() * 3) | 0) - 1)); // ±1 for shape variety
  for (let i = 0; i < count; i++) {
    const angle = baseAngle + (Math.random() * 2 - 1) * spread;
    const speed = (pc.speedMin + Math.random() * (pc.speedMax - pc.speedMin)) * scale;
    const push = hasDir ? pc.forwardBias * scale : 0;
    const life = pc.lifeMin + Math.random() * (pc.lifeMax - pc.lifeMin);
    eng.particles.push({
      x, y,
      vx: Math.cos(angle) * speed + ux * push,
      vy: Math.sin(angle) * speed + uy * push + pc.riseBias * scale,
      life,
      maxLife: life,
      color: pc.colors[(Math.random() * pc.colors.length) | 0],
      gravity: pc.gravity * scale,
      size: (pc.sizeMin + Math.random() * (pc.sizeMax - pc.sizeMin)) * scale,
    });
  }
  // A few leading shards — the "crack" — biased the same way (tighter cone).
  const sh = r.shards;
  const shardCount = Math.max(2, sh.count + (((Math.random() * 3) | 0) - 1)); // ±1 for shape variety
  const shardSpread = hasDir ? spread * 0.7 : Math.PI;
  for (let i = 0; i < shardCount; i++) {
    const a = baseAngle + (Math.random() * 2 - 1) * shardSpread;
    const len = (sh.lenMin + Math.random() * (sh.lenMax - sh.lenMin)) * scale;
    addBolt(eng, x, y, x + Math.cos(a) * len, y + Math.sin(a) * len, sh.color, sh.life);
  }
  // Mystical accent: a handful of slow, bright arcane sparks that drift *upward*
  // (against the debris' fall) and twinkle in the element's glow colour — the
  // "magic" sheen over the physical shatter. Rendered additively as 4-point stars.
  const sp = r.spark;
  const sparkCount = Math.max(2, Math.round(sp.count * Math.min(1.5, Math.max(0.7, scale))));
  for (let i = 0; i < sparkCount; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = (16 + Math.random() * 40) * scale; // gentle outward drift
    const push = hasDir ? pc.forwardBias * 0.3 * scale : 0; // slight nudge along the hit
    const life = sp.life * (0.7 + Math.random() * 0.6);
    eng.particles.push({
      x, y,
      vx: Math.cos(angle) * speed + ux * push,
      vy: Math.sin(angle) * speed + uy * push - (28 + Math.random() * 42) * scale, // float up
      life,
      maxLife: life,
      color: sp.color,
      gravity: 28 * scale, // barely falls — the spark hangs and shimmers
      size: sp.size * (0.8 + Math.random() * 0.5) * scale,
      twinkle: true,
    });
  }
}

export function spawnImpactParticles(eng: GameEngine, x: number, y: number, color: string) {
  for (let i = 0; i < 6; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 30 + Math.random() * 70;
    eng.particles.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 0.2 + Math.random() * 0.2,
      maxLife: 0.4,
      color,
    });
  }
}

/** Deal damage to an enemy; returns true if it died from this hit. `kind`
 *  colours the hitsplat; `minor` (DoT) draws it small/below, drifting aside.
 *  `depth` guards the on-kill chain cards (ricochet / overkill / streak smite)
 *  against unbounded recursion — chains only fire from a depth-0 (direct) kill. */
export function damage(eng: GameEngine, enemy: Enemy, amount: number, kind: HitsplatKind = 'hit', minor = false, silent = false, depth = 0, style?: CombatStyle, source?: DamageSource): boolean {
  // Water "amp" makes the enemy take extra damage from every source; the Slayer
  // Helmet adds an on-task bonus vs the current task's monster. The Armored affix
  // halves damage from its rolled style (DoT/no-style hits are unaffected).
  const vuln = enemy.vulnTimer && enemy.vulnTimer > 0 ? 1.25 : 1;
  const onTask = eng.slayer.onTaskBonus(enemy.type);
  // Armored halves one style; Protected (a prayer) all but negates one. Banned
  // together, so at most one bites — a DoT/no-style hit is unaffected by either.
  const resist = styleDamageMult(enemy.armoredStyle, style) * protectedDamageMult(enemy.protectedStyle, style);
  // The species' own combat-triangle weakness — the melee/ranged mirror of the
  // Elemental wizard's bonus, which is applied at fire time instead (a spell's
  // element is fixed per shot, a tower's style is fixed per tower).
  const weak = styleWeaknessMult(enemy.styleWeakness, style);
  // Boss phase bias: Zulrah's per-form style rock-paper-scissors, and a 0 while
  // Vorkath's ice shield is up (fully immune). Neutral for non-boss enemies.
  const bossMult = bossStyleMult(enemy.bossState, style);
  // A boss's escort shrugs off splash aimed at the boss, so its mechanic has to be
  // answered rather than incidentally deleted. Focused fire is unaffected.
  const escortMult = escortDamageMult(!!enemy.escort, source?.tag);
  let dealt = Math.max(0, Math.floor(amount * vuln * onTask * resist * weak * bossMult * escortMult));
  // Shielded affix: damage is drained from the shield pool before HP is touched.
  if (enemy.shieldHp && enemy.shieldHp > 0 && dealt > 0) {
    const a = absorbWithShield(enemy.shieldHp, dealt);
    enemy.shieldHp = a.shield;
    dealt = a.dmg;
  }
  enemy.hp -= dealt;
  // DPS meter: credit the dealt damage to its source (splitting off any Utility-
  // aura extra), plus the effect-specific tallies (DoT damage, splash hits, the
  // Slayer Helmet's on-task slice) so the panel can break them out per tower.
  if (source && dealt > 0) {
    eng.stats.recordDamage(source, eng.wave, enemy.type, dealt);
    const owner = source.towerId ?? RUN_FX_ID;
    if (source.tag === 'burn') eng.stats.recordEffect(owner, eng.wave, { burnDmg: dealt });
    else if (source.tag === 'poison') eng.stats.recordEffect(owner, eng.wave, { poisonDmg: dealt });
    else if (source.tag === 'venom') eng.stats.recordEffect(owner, eng.wave, { venomDmg: dealt });
    else if (source.tag === 'chain') eng.stats.recordEffect(owner, eng.wave, { chainDmg: dealt });
    else if (source.tag === 'splash') eng.stats.recordEffect(owner, eng.wave, { splashHits: 1 });
    if (source.towerId && onTask > 1) {
      eng.stats.recordEffect(source.towerId, eng.wave, { taskBonusDmg: dealt * (1 - 1 / onTask) });
    }
    // Blood's %-max-HP bonus rode into `amount` and through the same multipliers,
    // so its share of what actually landed is its share of the raw hit.
    if (source.bloodFrac) eng.stats.recordEffect(owner, eng.wave, { bloodBonusDmg: dealt * source.bloodFrac });
  }
  // Towers grow by fighting: credit the source tower for the damage it landed.
  // `weak > 1` means the hit exploited the enemy's melee/ranged weakness (magic
  // never triggers it — StyleWeakness excludes magic, an intended counterweight).
  // DoT ticks (burn/poison/venom) carry a stamped style for boss resistance but
  // are weakness-neutral for XP (spec §4.2/§6) — they must not double-dip ×1.5.
  if (source?.towerId && dealt > 0) {
    const isDot = source.tag === 'burn' || source.tag === 'poison' || source.tag === 'venom';
    eng.grantTowerXp(source.towerId, dealt, weak > 1 && !isDot);
  }
  // Stall breaker: a hit that lands is what marks an enemy as *being fought*. Without
  // this the clock would run from the moment it spawned, and anything that simply walked
  // in unopposed would arrive at the base already hardened against control.
  if (dealt > 0) {
    const stall = enemy.bossState ?? enemy.stall;
    if (stall) stall.sinceHit = 0;
  }
  // Brutus: damage is what provokes him. Banked here rather than sampled from his HP so
  // that healing (a Regenerating affix, a Guardian revive) cannot un-anger him — what he
  // reacts to is being hit, not what his health bar currently reads.
  if (dealt > 0 && enemy.bossState?.kind === 'brutus') {
    enemy.bossState.rageDamage = (enemy.bossState.rageDamage ?? 0) + dealt;
  }
  // Jad: remember damage that actually landed, for the Yt-HurKot heal window.
  if (dealt > 0 && enemy.bossState?.kind === 'jad') {
    (enemy.bossState.recentDamage ??= []).push({ t: eng.gameTime, amount: dealt });
  }
  // Hydra: damage dealt during an open vent counts toward shattering it — the
  // figure *before* the vent's hardening cut, or the player would pay for that
  // cut twice and the bar could never fill (see `hydraVentCredit`).
  if (dealt > 0 && enemy.bossState?.kind === 'hydra' && enemy.bossState.venting) {
    enemy.bossState.ventDamage = (enemy.bossState.ventDamage ?? 0) + hydraVentCredit(dealt);
  }
  // Scurrius: a heavy hit shears a rat off his own bar. Placed with the other
  // per-boss damage hooks so it reads against Brutus's rage accumulator and Jad's
  // damage ring — same shape, same place.
  if (dealt > 0 && enemy.bossState?.kind === 'scurrius') {
    const st = enemy.bossState;
    if (scurriusShouldShear(dealt, enemy.maxHp, enemy.hp / enemy.maxHp,
                            st.scurriusShearCooldown ?? 0, liveRatsOf(eng, enemy.id))) {
      shearRat(eng, enemy);
    }
  }
  // Executioner relic: a non-boss reduced to a sliver is slain outright (bosses,
  // their phases, and Jad's healers are immune).
  if (dealt > 0 && !enemy.isBoss && !enemy.bossState && !enemy.escort &&
      shouldExecute(eng.relicFx.executeFrac, enemy.hp, enemy.maxHp)) {
    enemy.hp = 0;
  }
  if (!minor) {
    enemy.flashTimer = 0.15; // visual hit-pop (direct hits only)
    // Play the WHOLE hurt flinch (priority over walk) before reverting — sizing
    // the window to the clip's own length, not a fixed slice that cut it short.
    // An animation can't be interrupted by a new one of the same priority: a
    // fresh hit while the flinch is still playing does NOT restart it (else
    // rapid hits would freeze the enemy on frame 0). Death (higher priority)
    // still wins — a dying enemy leaves `enemies` entirely. The flash above
    // still fires every hit, so feedback isn't lost.
    const animSlug = enemy.animType && ENEMY_ANIMS[enemy.animType] ? enemy.animType : enemy.type;
    const hurtClip = ENEMY_ANIMS[animSlug]?.clips.hurt;
    if (hurtClip && (enemy.hurtAnim ?? 0) <= 0) enemy.hurtAnim = clipDurationS(hurtClip);
  }
  const below = enemy.isBoss ? 30 : 16;
  // DoT splats fan into per-kind lanes (side + rise) so an enemy carrying
  // several shows them clearly apart rather than one overriding the next:
  // burn drifts left/up, poison right/up, venom right/down. See DOT_LANE.
  const lane = minor ? DOT_LANE[kind as DotKind] : undefined;
  const side = lane?.side ?? 0;
  const rise = lane?.rise ?? 0;
  eng.hitsplats.push({
    x: enemy.x + side * 14 + (Math.random() - 0.5) * (minor ? 8 : 16),
    y: minor ? bodyY(enemy) + below : bodyY(enemy) - 18,
    value: dealt,
    kind: dealt > 0 ? kind : 'miss',
    life: HITSPLAT_LIFE,
    minor: minor || undefined,
    vx: minor ? side * 30 + (Math.random() - 0.5) * 16 : 0,
    vy: minor ? rise * -26 : 0,
  });
  if (dealt > 0 && !minor && !silent) eng.sound.play('hit', 70);
  if (enemy.hp > 0) return false;
  const i = eng.enemies.indexOf(enemy);
  if (i < 0) return false;
  // Overkill = damage spilled past 0 HP (for the Scythe cleave card).
  const overkillDmg = Math.max(0, -enemy.hp);
  const killX = enemy.x, killY = enemy.y;
  eng.enemies.splice(i, 1);
  spawnDeathParticles(eng, enemy);
  // Animated enemies play their full death-collapse clip; others use the brief
  // shrink-and-fade of the static sprite.
  const deathSlug = enemy.animType && ENEMY_ANIMS[enemy.animType] ? enemy.animType : enemy.type;
  const deathClip = ENEMY_ANIMS[deathSlug]?.clips.death;
  // A catch has its own short animation — the body pulled into the trap — so it
  // does not play the collapse clip, however long that one runs.
  const deathLife = enemy.caughtBy ? 0.42 : deathClip ? clipDurationS(deathClip) + DEATH_SETTLE_S : 0.45;
  eng.deaths.push({
    x: enemy.x,
    y: enemy.y,
    type: enemy.type,
    animType: enemy.animType,
    isBoss: !!enemy.isBoss,
    renderScale: enemy.renderScale,
    movingLeft: (eng.path[enemy.pathIndex + 1]?.x ?? enemy.x) < enemy.x,
    life: deathLife,
    maxLife: deathLife,
    caughtBy: enemy.caughtBy,
  });
  // Per-enemy-type death clip (registered as `death_<type>` in sound.ts);
  // falls back to the generic `death` for anything unmapped.
  const deathKey = `death_${enemy.type}`;
  eng.sound.play(deathKey in GAME_SOUNDS ? deathKey : 'death', 40);
  // Debug/sandbox enemies pay nothing and don't progress anything — they exist
  // only to test towers/enemies. Jad's healers likewise award nothing (their
  // payoff is denying Jad's heal). The death FX above still play.
  // An escort with its own Collection Log line (nested under the boss that
  // summons it) still records the kill, even though it pays nothing — the entry
  // would otherwise be permanently unobtainable. Gated on `summonedBy` so only
  // escorts that are their own monster (Yt-HurKot, Summoned Soul) are counted,
  // never a generic minion borrowing another type's stat line.
  if (!enemy.debug && enemy.escort && ENEMIES[enemy.type]?.summonedBy) {
    eng.killCounts = { ...eng.killCounts, [enemy.type]: (eng.killCounts[enemy.type] ?? 0) + 1 };
  }
  if (!enemy.debug && !enemy.escort) {
    // Greed curse (×goldMult) and the active wave event (×event gold, e.g. Blood
    // Moon's harder-wave payout) both scale the drop; both default to 1.
    eng.awardGold(eng.killGoldPreReward(enemy.type));
    eng.kills += 1;
    if (source?.towerId) {
      eng.caStats.killsByTower[source.towerId] = (eng.caStats.killsByTower[source.towerId] ?? 0) + 1;
    }
    if (enemy.isBoss) {
      const spawned = eng.caStats.bossSpawnSeconds[enemy.type];
      eng.caStats.bossKillSeconds[enemy.type] =
        spawned === undefined ? eng.runSeconds : eng.runSeconds - spawned;
      delete eng.caStats.bossSpawnSeconds[enemy.type];
      // Cerberus down with a soul still orbiting him: recorded now, synchronously,
      // because the orphan-escort cull that would otherwise clean up that soul runs
      // on a later frame — after this kill's checkpoint has already been evaluated.
      if (enemy.type === 'cerberus' && eng.enemies.some((s) => s.ownerId === enemy.id && s.soulStyle)) {
        eng.caStats.bossFlags.cerberusSoulSurvived = true;
      }
    }
    // New object each kill so the UI's persistence effect sees the change.
    eng.killCounts = { ...eng.killCounts, [enemy.type]: (eng.killCounts[enemy.type] ?? 0) + 1 };
    // Per-run boss tally: drives the ordered march and the victory trigger.
    if (enemy.isBoss && (SCHEDULABLE_BOSSES as readonly string[]).includes(enemy.type)) {
      eng.bossesKilledThisRun = {
        ...eng.bossesKilledThisRun,
        [enemy.type]: (eng.bossesKilledThisRun[enemy.type] ?? 0) + 1,
      };
    }
    // Combat Achievements checkpoint: boss-kill tasks (speed/no-leak/mechanic)
    // are only ever true for the instant after the boss dies.
    if (enemy.isBoss) eng.checkAchievements();
    // Classic gear drops fall straight into the run's loot bag (no ground loot in
    // the new core). Gated to Classic — roguelite gears its towers via drafts.
    if (eng.gameMode === 'classic') {
      const gear = rollGearDrops({
        wave: eng.wave,
        isBoss: !!enemy.isBoss,
        // Taken alive, not killed: the better roll a trap is for.
        luck: enemy.caughtBy ? CATCH_DROP_LUCK : 1,
      });
      if (gear.length) {
        eng.lootBag = [...eng.lootBag, ...gear];
        eng.gearDrops = mergeUnlockBatch(eng.gearDrops, gear, eng.gearDropsDrained);
        eng.gearDropsDrained = false;
        eng.gearDropSeq++;
      }
    }
    // Bigger and Badder (Slayer shop): the task monster can rise again, right
    // where it fell, as its Superior form. Rolled BEFORE recordKill, so the kill
    // that finishes a task can still spawn one — the superior is the send-off.
    const superior = eng.slayer.rollSuperior(enemy.type);
    eng.slayer.recordKill(enemy.type);
    if (superior) raiseSuperior(eng, superior, enemy);
    onKillChains(eng, killX, killY, dealt, overkillDmg, depth, !!enemy.isBoss);
    // Volatile affix: a death blast briefly disables the nearest tower.
    if (enemy.affixes?.includes('volatile')) detonateVolatile(eng, killX, killY);
  }
  eng.emit();
  return true;
}

/**
 * Bigger and Badder: raise `type` (a Superior) out of the corpse of `fallen`,
 * carrying on from exactly where it stood — same point on the road, same progress
 * along it. It is scaled for the current wave like any other spawn, so a superior
 * met late is a late-game threat, and it is worth its own (much larger) gold and
 * essence when it dies.
 */
export function raiseSuperior(eng: GameEngine, type: EnemyType, fallen: Enemy) {
  const e = makeEnemy(eng, type, eng.wave);
  if (!e) return;
  e.x = fallen.x;
  e.y = fallen.y;
  e.pathIndex = fallen.pathIndex;
  eng.enemies.push(e);
  // A green shockwave out of the corpse — the moment reads as a rise, not a spawn.
  addRing(eng, e.x, e.y, 6, 60, '#9fe855', 0.55, 4);
  eng.sound.play('wave', 55);
  eng.notify(`${e.name} rises!`, ASSETS.misc.slayer_crossbow);
}

/**
 * Volatile affix: on death it detonates, knocking **every tower inside the blast**
 * offline for {@link VOLATILE_STUN_SECS}.
 *
 * The shockwave is drawn at the true blast radius rather than a decorative one, so the
 * ring the player sees is the area that was actually hit — that is the only way the
 * affix teaches its own shape, and the reason it can be answered by spacing towers out
 * instead of by luck. Which towers fall (and the guarantee that an already-downed one
 * is never re-timed) is `volatileBlastTowers`.
 */
export function detonateVolatile(eng: GameEngine, x: number, y: number) {
  // An orange shockwave + sparks for the detonation (NOT the spawn-portal
  // spotanim, which read as a gateway opening on the corpse).
  addRing(eng, x, y, 6, VOLATILE_BLAST_RADIUS, '#ff7a3c', 0.45, 4);
  for (let i = 0; i < 10; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = 60 + Math.random() * 120;
    eng.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.35, maxLife: 0.35, color: '#ff8a3c', size: 2 });
  }
  const hit = volatileBlastTowers(eng.towers, x, y);
  for (const tower of hit) tower.disabledTimer = VOLATILE_STUN_SECS;
  if (hit.length) eng.sound.play('hit', 80);
}

/** Roguelite on-kill chain cards. Soul Eater (heal) and the streak meter count
 *  every kill (chained ones too); the damaging follow-ups (ricochet, overkill
 *  cleave, streak smite) only fire from a direct kill (`depth===0`) and deal
 *  their damage at depth 1, so a cascade can advance the meter but never recurse
 *  without bound. */
export function onKillChains(eng: GameEngine, x: number, y: number, dealt: number, overkillDmg: number, depth: number, isBoss: boolean) {
  const fx = eng.runFx;
  fx.killTally += 1;
  // Soul Eater (relic): a boss kill always restores a life; a lesser kill pays into
  // it at a price of hundreds, climbing with the wave (`soulStealAddChance`). Only
  // ever fires from a kill (this method), so leaking a boss never heals — you have to
  // actually put it down. The boss guarantee is the relic; the horde is a rounding
  // error, which is what keeps the healing cards in the draft pool worth taking.
  if (fx.soulSteal && eng.lives < eng.maxLives) {
    const heal = isBoss
      ? fx.soulSteal.bossHeal
      : (Math.random() < soulStealAddChance(fx.soulSteal.addKills, eng.wave) ? 1 : 0);
    if (heal > 0) {
      eng.lives = Math.min(eng.maxLives, eng.lives + heal);
      spawnHealFx(eng, x, y);
    }
  }
  if (depth > 0) return; // follow-ups don't recurse
  // Kill Streak (Dragon Warhammer): every Nth kill, a shockwave smites every
  // enemy on the field — a big gold ring from centre + a white burst per enemy.
  if (fx.killStreak && fx.killTally % fx.killStreak.every === 0) {
    addRing(eng, eng.width / 2, eng.height / 2, 24, Math.max(eng.width, eng.height) * 0.62, '#ffd257', 0.55, 7);
    for (const e of [...eng.enemies]) {
      addRing(eng, e.x, e.y, 2, 26, '#fff2c0', 0.35, 3);
      damage(eng, e, fx.killStreak.damage, 'hit', false, true, 1, undefined, { tag: 'chain' });
    }
  }
  // Ricochet (Dragon Claws): arc a fraction of the killing blow into the nearest
  // enemy — a cyan claw-spec bolt.
  if (fx.ricochet) chainNearest(eng, x, y, fx.ricochet.radius, Math.max(1, Math.floor(dealt * fx.ricochet.frac)), '#bfe8ff');
  // Overkill (Scythe): cleave the spilled damage outward — a red cleave ring +
  // a red bolt to the enemy it carries into.
  if (fx.overkill && overkillDmg > 0) {
    addRing(eng, x, y, 6, fx.overkill.radius, '#ff7a4c', 0.4, 4);
    chainNearest(eng, x, y, fx.overkill.radius, overkillDmg, '#ff5a3c');
  }
}

/** Green heal ring + rising motes at a point — the "a life came back" flourish
 *  for Soul Eater, drawn where the kill happened. */
export function spawnHealFx(eng: GameEngine, x: number, y: number) {
  addRing(eng, x, y, 4, 36, '#7CFC6A', 0.6, 3);
  for (let i = 0; i < 8; i++) {
    const a = Math.random() * Math.PI * 2;
    eng.particles.push({ x, y, vx: Math.cos(a) * 22, vy: -40 - Math.random() * 40, life: 0.6, maxLife: 0.6, color: '#9dffa0', gravity: 90, size: 2.4 });
  }
}

/** Deal `dmg` to the nearest enemy within `radius` of (x,y), at chain depth 1.
 *  Arcs a coloured bolt to the struck enemy so the chain is visible. */
export function chainNearest(eng: GameEngine, x: number, y: number, radius: number, dmg: number, color = '#bfe8ff') {
  let best: Enemy | null = null;
  let bestD = radius * radius;
  for (const o of eng.enemies) {
    const d = distanceSq(o.x, o.y, x, y);
    if (d <= bestD) { bestD = d; best = o; }
  }
  if (best) {
    addBolt(eng, x, y, best.x, best.y, color);
    // Card-driven chain FX (ricochet / overkill cleave) — bucketed as Run Effects.
    damage(eng, best, dmg, 'hit', false, true, 1, undefined, { tag: 'chain' });
  }
}

export function spawnDeathParticles(eng: GameEngine, enemy: Enemy) {
  const count = enemy.isBoss ? 26 : 12;
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 40 + Math.random() * 90;
    eng.particles.push({
      x: enemy.x,
      y: enemy.y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 0.5 + Math.random() * 0.3,
      maxLife: 0.8,
      color: enemy.color,
    });
  }
}
