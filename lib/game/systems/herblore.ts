/**
 * **Herblore** — the pure half of the bench.
 *
 * Farming grows the herb; this says what it is worth to brew one, what the run's
 * Herblore level allows, and what a potion does to the board while it is up. The
 * engine owns the pouch, the purse and the waves — everything here is arithmetic,
 * which is the part worth testing.
 *
 * Three rules shape it:
 *
 * 1. **A potion outlives the wave it was drunk on.** A raw herb is one wave; every
 *    potion that runs is three to six. That difference is the only reason to spend
 *    a herb here instead of drinking it as it comes out of the ground.
 * 2. **The ladder is gated by the skill, and the skill levels by brewing.** So the
 *    strong potions arrive late in a run and only for a player who has been
 *    brewing the weak ones — never by buying them.
 * 3. **A potion is style-targeted.** Its boost carries the combat style it belongs
 *    to, so a Ranging potion helps the archers and leaves the wizards alone. See
 *    `systems/style-mods`.
 */

import { POTIONS, POTION_BY_ID, BREW_DAMAGE_PENALTY, type PotionDef, type PotionId } from '../data/herblore';
import { SEEDS, type SeedId } from '../data/farming';
import { applyStyleBoost, identityStyleMods, type StyleMods } from './style-mods';

/** The ceiling, like every other skill in the game. Nothing unlocks above 90. */
export const HERBLORE_MAX_LEVEL = 99;

/**
 * Where a run's Herblore starts.
 *
 * Three, not one: OSRS gates its very first potion behind level 3, and a bench
 * that cannot make anything at all on the wave it is opened teaches nothing. So
 * the run starts exactly able to brew an Attack potion and nothing else.
 */
export const HERBLORE_START_LEVEL = 3;

/**
 * XP to advance Herblore from `level` to `level + 1`.
 *
 * Run-scaled, the same way Hunter's is and for the same reason: OSRS's own table
 * asks over a million XP for the 90 a Super combat needs, which is a month of
 * play, not a run. This curve asks about 5,000 XP to climb the whole ladder — at
 * the real per-potion rates, roughly fifty brews. That is a lot of herbs:
 * reachable across a full run by a player who keeps every allotment busy and buys
 * more ground, and out of reach for one who sows now and then. The floor of 10
 * carries the first twenty-seven levels, so the Antidote lands after a single brew
 * and the mechanic gets to teach itself.
 */
export function herbloreXpForLevel(level: number): number {
  return Math.max(10, Math.round(Math.pow(Math.max(1, level), 2.5) / 400));
}

export interface HerbloreGain {
  level: number;
  xp: number;
  /** How many levels this brew crossed — the engine turns any number above zero
   *  into one level-up notice. */
  levels: number;
}

/** Bank a brew's XP, crossing as many thresholds as it reaches. Multi-level for
 *  the same reason Hunter's is: the early levels cost ten and the first potion
 *  pays twenty-five, so a single-step version would throw the remainder away. */
export function gainHerbloreXp(level: number, xp: number, gain: number): HerbloreGain {
  let lv = Math.min(HERBLORE_MAX_LEVEL, Math.max(1, Math.floor(level)));
  let bank = Math.max(0, xp) + Math.max(0, gain);
  let crossed = 0;
  while (lv < HERBLORE_MAX_LEVEL) {
    const need = herbloreXpForLevel(lv);
    if (bank < need) break;
    bank -= need;
    lv++;
    crossed++;
  }
  if (lv >= HERBLORE_MAX_LEVEL) bank = 0; // nothing left to spend it on
  return { level: lv, xp: bank, levels: crossed };
}

/** The potions a given level may brew, in ladder order. */
export function potionsUnlockedAt(level: number): PotionDef[] {
  return POTIONS.filter(p => p.level <= level);
}

/** Is this one unlocked at this level? */
export function potionUnlocked(id: PotionId, level: number): boolean {
  return POTION_BY_ID[id].level <= level;
}

// ─────────────────────────────── what is held ───────────────────────────────
// Herbs and potions are counted, not listed: a pouch of three guams is a stack,
// the way OSRS stacks them, and nothing about one guam differs from another.

/** Herbs waiting to be used or brewed. */
export type HerbPouch = Record<SeedId, number>;
/** Potions brewed and not yet drunk. */
export type PotionStock = Record<PotionId, number>;

/** Built from the tables rather than written out, so adding a herb or a potion is
 *  one row in `data/` and nothing here. */
export function emptyPouch(): HerbPouch {
  return Object.fromEntries(SEEDS.map(s => [s.id, 0])) as HerbPouch;
}

export function emptyStock(): PotionStock {
  return Object.fromEntries(POTIONS.map(p => [p.id, 0])) as PotionStock;
}

/** Everything in the pouch, in ladder order and skipping the empty stacks. */
export function heldHerbs(pouch: HerbPouch): { seedId: SeedId; count: number }[] {
  return (Object.keys(pouch) as SeedId[])
    .filter(id => pouch[id] > 0)
    .map(id => ({ seedId: id, count: pouch[id] }));
}

/**
 * Why this potion cannot be brewed right now, or null if it can.
 *
 * One reason at a time, in the order a player would hit them, so the button under
 * it can say exactly which wall it is against instead of "no".
 */
export type BrewBlocker = 'level' | 'herb' | 'potion' | 'gold';

export function brewBlocker(
  def: PotionDef, level: number, pouch: HerbPouch, stock: PotionStock, money: number,
): BrewBlocker | null {
  if (level < def.level) return 'level';
  if (def.herb && (pouch[def.herb] ?? 0) < 1) return 'herb';
  if (def.potionInput && (stock[def.potionInput] ?? 0) < 1) return 'potion';
  if (money < def.cost) return 'gold';
  return null;
}

// ─────────────────────────── what a potion is doing ───────────────────────────
// A dose is a countdown in waves. Several may be up at once — they are different
// potions doing different things — but a second dose of the *same* potion refills
// its clock rather than stacking on top of itself, so nothing is ever gained by
// hoarding five of one and drinking them back to back.
//
// Two potions never join this list at all: a Super restore and a Saradomin brew do
// their whole job on the way down (`waves: 0`), and the engine reads `lives`,
// `brewStacks` and `clearsBrew` off the def as it pours.

export interface ActivePotion {
  id: PotionId;
  wavesLeft: number;
}

/** Drink one: refresh it if it is already up, otherwise add it. */
export function drinkPotion(active: readonly ActivePotion[], def: PotionDef): ActivePotion[] {
  const out = active.map(a => (a.id === def.id ? { ...a, wavesLeft: def.waves } : a));
  if (!out.some(a => a.id === def.id)) out.push({ id: def.id, wavesLeft: def.waves });
  return out;
}

/** A wave has been fought: every dose is a wave nearer to spent. Counted in waves
 *  for the same reason a patch is — thinking between fights has to be free. */
export function tickPotions(active: readonly ActivePotion[]): ActivePotion[] {
  return active
    .map(a => ({ id: a.id, wavesLeft: a.wavesLeft - 1 }))
    .filter(a => a.wavesLeft > 0);
}

/** Tower multipliers per combat style, folded in beside the herbs'. */
export function potionTowerMods(active: readonly ActivePotion[]): StyleMods {
  const mods = identityStyleMods();
  for (const a of active) {
    const boost = POTION_BY_ID[a.id]?.boost;
    if (boost) applyStyleBoost(mods, boost);
  }
  return mods;
}

/** What the prayer drain is multiplied by — below 1, so points last longer. */
export function potionPrayerDrainMult(active: readonly ActivePotion[]): number {
  let mult = 1;
  for (const a of active) {
    const cut = POTION_BY_ID[a.id]?.prayerDrain;
    if (cut) mult *= 1 - cut;
  }
  return Math.max(0, mult);
}

/** Lives handed back for clearing this wave. */
export function potionLivesOnClear(active: readonly ActivePotion[]): number {
  let lives = 0;
  for (const a of active) lives += POTION_BY_ID[a.id]?.livesOnClear ?? 0;
  return lives;
}

/** The running potion paying those lives out, so the notice can name it. */
export function pouringPotion(active: readonly ActivePotion[]): PotionDef | null {
  for (const a of active) {
    const def = POTION_BY_ID[a.id];
    if (def?.livesOnClear) return def;
  }
  return null;
}

/** The running potion holding the towers up, or null if nothing is. The Antidote
 *  line's whole job, and the one effect that is a yes/no rather than a multiplier. */
export function steadyPotion(active: readonly ActivePotion[]): PotionDef | null {
  for (const a of active) {
    const def = POTION_BY_ID[a.id];
    if (def?.steady) return def;
  }
  return null;
}

/** Whether a tower may be knocked offline at all right now. */
export function potionsSteady(active: readonly ActivePotion[]): boolean {
  return steadyPotion(active) !== null;
}

/** What every boostable tower's damage is multiplied by after `stacks` Saradomin
 *  brews. Multiplicative, so a hoarder's board tends towards nothing rather than
 *  falling through it, and the Dwarf Cannon never feels it (fixed damage). */
export function brewDamageMult(stacks: number): number {
  return Math.pow(1 - BREW_DAMAGE_PENALTY, Math.max(0, Math.floor(stacks)));
}
