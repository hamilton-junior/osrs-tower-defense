import type { Enemy } from '../../types';
import { HUNTER_TRAP_BY_ID, type HunterTrapDef } from '../../data/hunter-traps';
import {
  TRAP_REARM_SECONDS,
  canCatch,
  catchBonusGold,
  chinBlastDamage,
  enemiesInBlast,
  gainHunterXp,
  trapTriggeredBy,
  type HunterTrap,
} from '../../systems/hunter-traps';
import { isCcImmune } from '../../systems/affixes';
import { ASSETS } from '../../assets';
import { RUN_FX_ID } from '../../systems/combat-stats';
import type { GameEngine } from '../engine';
import { damage, noteDebuffHit, tenacity } from './combat';
import { addRing, spawnEffect } from './waves';

/**
 * What the road does back.
 *
 * Traps sit on the path rather than beside it, so unlike a tower they have no
 * targeting, no range and no cooldown — the enemy brings itself into contact, and
 * the trap answers once per charge. That is the whole loop: laid between waves,
 * spent during one, gone when its charges are.
 *
 * The arithmetic (what may be caught, how hard a chinchompa hits, what the catch is
 * worth in Hunter XP) is in `systems/hunter-traps.ts`; this is the per-frame pipeline
 * that applies it to the board. A capture deliberately runs through {@link damage},
 * the same path a kill takes, so gold, Slayer credit, kill counts and drops all
 * behave exactly as they would have — a caught creature is still a creature dealt
 * with, and it pays a bonus on top.
 */
export function updateTraps(eng: GameEngine, dt: number) {
  if (eng.traps.length === 0) return;
  let spent = false;
  for (const trap of eng.traps) {
    if (trap.rearm > 0) trap.rearm = Math.max(0, trap.rearm - dt);
    if (trap.charges <= 0 || trap.rearm > 0) continue;
    const def = HUNTER_TRAP_BY_ID[trap.defId];
    // One trap answers one tread per firing, so a pack crossing it is worn down
    // rather than deleted — except a chinchompa, whose whole point is the pack.
    const stepped = eng.enemies.find(e => (e.spawnAnim ?? 0) <= 0 && trapTriggeredBy(trap, e));
    if (!stepped) continue;
    const fired = fire(eng, trap, def, stepped);
    if (!fired) continue;
    trap.charges -= 1;
    trap.rearm = TRAP_REARM_SECONDS;
    awardHunterXp(eng, def);
    if (trap.charges <= 0) spent = true;
  }
  if (spent) {
    // A spent trap leaves its slot the moment it is used up — the slot, not the
    // gold, is the resource the player is managing.
    eng.traps = eng.traps.filter(t => t.charges > 0);
    eng.emit();
  }
}

/**
 * Spring one trap on the thing standing on it.
 *
 * Returns whether the charge was actually spent: a box trap that finds a healthy
 * enemy on its tile has not caught anything, and stays armed for the next one down
 * the road. Every other kind always fires.
 */
function fire(eng: GameEngine, trap: HunterTrap, def: HunterTrapDef, e: Enemy): boolean {
  switch (def.kind) {
    case 'snare': {
      // Warded shrugs off every hold in the game, and this is a hold.
      if (isCcImmune(e.affixes ?? [])) return false;
      const eff = def.hold * (1 - tenacity(eng, e));
      noteDebuffHit(eng, e);
      if (eff <= 0) return false;
      e.stunTimer = Math.max(e.stunTimer, eff);
      // No owning tower, so the DPS panel books it under Run Effects, next to the
      // other board-wide control.
      eng.stats.recordEffect(RUN_FX_ID, eng.wave, { stunCount: 1, stunSeconds: eff });
      addRing(eng, trap.x, trap.y, 4, 22, '#c9a227', 0.35, 3);
      eng.sound.play('select', 45);
      return true;
    }
    case 'catch': {
      if (!canCatch(def, e)) return false;
      const bonus = catchBonusGold(def, eng.killGoldPreReward(e.type));
      // Straight through the kill path: everything a kill pays, a catch pays too
      // — and this flag, read on the way through, makes it pay a little better
      // and sends the body into the trap instead of leaving it on the road.
      e.caughtBy = { x: trap.x, y: trap.y };
      damage(eng, e, e.hp, 'hit', false, true, 0, undefined, { tag: 'direct' });
      // The death fx has copied it by now; anything a shield left standing is an
      // ordinary enemy again on the next frame.
      delete e.caughtBy;
      if (bonus > 0 && !e.debug && !e.escort) eng.awardGold(bonus);
      addRing(eng, trap.x, trap.y, 4, 26, '#ffd45e', 0.4, 3);
      eng.sound.play('sell', 55);
      return true;
    }
    case 'blast': {
      const caught = enemiesInBlast(def, trap, eng.enemies);
      // The fireball is drawn as a box `size * scale` wide, and its art fills
      // ~78% of that box — so radius/36 makes the visible blast span exactly
      // the diameter it damages, matching the ring below instead of dwarfing it.
      spawnEffect(eng, 'hit_fire_3', trap.x, trap.y, def.radius / 36);
      addRing(eng, trap.x, trap.y, 6, def.radius, '#ff8a3d', 0.4, 4);
      eng.sound.play('fire_cannon', 55);
      for (const target of caught) {
        // `caught` was taken before the first hit landed — anything already killed
        // by an earlier one in this same blast is no longer on the board.
        if (!eng.enemies.includes(target)) continue;
        damage(eng, target, chinBlastDamage(def, target), 'hit', false, true, 0, undefined, { tag: 'splash' });
      }
      return true;
    }
  }
}

/**
 * Bank a firing's Hunter XP and say so when a level lands.
 *
 * Every kind pays, not just the two that literally catch something: a chinchompa is
 * Hunter XP in OSRS as much as a box trap is, and a snare that pays nothing would
 * make the trap you can afford on wave one the one that never levels you.
 */
function awardHunterXp(eng: GameEngine, def: HunterTrapDef) {
  const before = eng.hunterLevel;
  const g = gainHunterXp(eng.hunterLevel, eng.hunterXp, def.xp);
  eng.hunterLevel = g.level;
  eng.hunterXp = g.xp;
  if (g.level > before) {
    eng.notify(`Hunter level ${g.level}`, ASSETS.misc.hunter_icon);
    eng.sound.play('prayer_on', 50);
  }
  eng.emit();
}
