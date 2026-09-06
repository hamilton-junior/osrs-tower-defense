import { itemIcon } from '../assets';
import type { CombatStyle } from '../types';

/**
 * Relics: the roguelite's *run-defining* passives, modelled after OSRS **Leagues
 * relics** — a small curated set of powerful, always-unique modifiers, one claimed
 * for each boss beaten (not the gold-bought {@link import('./roguelite-draft').DraftCard}
 * hands). Where draft cards are mostly incremental stat sticks, a relic changes
 * a *rule of the whole run* and you only ever hold one of each, so each pick is a
 * deliberate fork in the build.
 *
 * This module is **pure** (RNG injected, no `this`/DOM): the pool, the weighted
 * choice, and every read-side helper are unit-testable. The engine owns applying
 * a chosen relic's {@link RelicEffect} (folding it into its run state) and the
 * hooks the new effects drive (execute on hit, interest on wave-clear, draft
 * rerolls / bigger hands, cheat-death on a lethal leak).
 */

/** Three tiers, ramping in power and dropping in offer frequency. */
export type RelicTier = 'minor' | 'major' | 'mythic';

/**
 * What owning a relic does. Several kinds reuse the draft's proven run pipeline
 * (`damage`/`fireRate` fold into the run's stat mods, `goldFind` into the gold
 * multiplier, `soulSteal`/`maxLife` into their existing hooks) — relics just hand
 * out *bigger, always-on* versions with no stacking dilemma. The rest are
 * **relic-only mechanics** with their own engine hooks:
 *
 *  - `execute`    : towers instantly slay a *non-boss* once it drops to/below
 *                   `frac` of its max HP — rewards focus fire on chunky elites.
 *  - `interest`   : each wave cleared pays `rate` of your gold as interest,
 *                   capped at `cap` so it can't snowball the economy.
 *  - `reroll`     : grants `perWave` re-rolls of the per-wave draft hand.
 *  - `handSize`   : every draft hand offers `extra` more cards to choose from.
 *  - `cheatDeath` : the first lethal leak of the run leaves you on 1 life instead
 *                   of ending it (a single charge).
 */
export type RelicEffect =
  | { kind: 'execute'; frac: number }
  | { kind: 'interest'; rate: number; cap: number }
  | { kind: 'reroll'; perWave: number }
  | { kind: 'handSize'; extra: number }
  | { kind: 'cheatDeath' }
  | { kind: 'damage'; mult: number; style?: CombatStyle }
  | { kind: 'fireRate'; mult: number; style?: CombatStyle }
  | { kind: 'range'; mult: number; style?: CombatStyle }
  | { kind: 'goldFind'; mult: number }
  | { kind: 'soulSteal'; bossHeal: number; addKills: number }
  | { kind: 'maxLife'; amount: number }
  | { kind: 'multi'; effects: RelicEffect[] };

export interface Relic {
  id: string;
  name: string;
  /** One-line, OSRS-flavoured description of what the relic does. */
  desc: string;
  tier: RelicTier;
  /** Icon URL (real in-game item art, hot-linked like the draft cards). */
  icon: string;
  effect: RelicEffect;
}

// ───────────────────────────── Soul Eater's appetite ────────────────────────
/**
 * Soul Eater used to roll a flat 10% on every non-boss kill, which at a horde's
 * kill rate meant lives simply never went down — and that quietly deleted every
 * healing card in the draft pool, because nothing in it could compete with
 * "infinite lives". It is a *mythic* now, and its appetite is measured in
 * hundreds of kills rather than tens, growing with the wave so the late game's
 * far larger hordes don't hand it back what the rarity took away.
 */
/** Lesser kills a life costs on wave 1. */
export const SOUL_STEAL_BASE_KILLS = 100;
/** Extra kills it demands per wave — the late game kills far more per wave, so a
 *  fixed price would drift back into the old free-lives problem. */
export const SOUL_STEAL_KILLS_PER_WAVE = 2;

/** Lesser kills Soul Eater charges for one life at `wave`. */
export function soulStealKills(baseKills: number, wave: number): number {
  return Math.max(1, baseKills + Math.max(0, wave - 1) * SOUL_STEAL_KILLS_PER_WAVE);
}

/** The per-kill roll that averages out to {@link soulStealKills}. */
export function soulStealAddChance(baseKills: number, wave: number): number {
  return 1 / soulStealKills(baseKills, wave);
}

/** Selection weight per tier — minors are the backbone, a mythic is a rare clutch. */
export const TIER_WEIGHT: Record<RelicTier, number> = {
  minor: 100,
  major: 45,
  mythic: 12,
};

/**
 * The relic pool — a curated dozen, each named after (and themed on) an OSRS
 * Leagues relic or its closest in-game analogue, with the matching item sprite as
 * its art. Always unique: once owned a relic is dropped from later offers.
 */
export const RELICS: readonly Relic[] = [
  // ───────────────────────────── relic-only rules ─────────────────────────
  { id: 'executioner', name: 'Executioner', tier: 'major',
    desc: 'Finishes off any non-boss that drops to 12% health.',
    icon: itemIcon('dragon_longsword'), effect: { kind: 'execute', frac: 0.12 } },
  { id: 'bankers_note', name: "Banker's Note", tier: 'major',
    desc: 'Each wave cleared pays 6% of your gold back (up to 80).',
    icon: itemIcon('bank_note'), effect: { kind: 'interest', rate: 0.06, cap: 80 } },
  { id: 'trickster', name: 'Trickster', tier: 'major',
    desc: 'Re-roll each hand of cards once.',
    icon: itemIcon('ring_of_wealth'), effect: { kind: 'reroll', perWave: 1 } },
  { id: 'production_prodigy', name: 'Production Prodigy', tier: 'major',
    desc: 'Every draft offers one extra card to choose from.',
    icon: itemIcon('clue_scroll_master'), effect: { kind: 'handSize', extra: 1 } },
  { id: 'last_recall', name: 'Last Recall', tier: 'mythic',
    desc: 'The first leak that would end your run leaves you on 1 life.',
    icon: itemIcon('ring_of_life'), effect: { kind: 'cheatDeath' } },

  // ──────────────────────── strong always-on passives ─────────────────────
  { id: 'berserker', name: 'Berserker', tier: 'minor',
    desc: '+15% damage for every tower, all run long.',
    icon: itemIcon('berserker_helm'), effect: { kind: 'damage', mult: 1.15 } },
  { id: 'quick_shot', name: 'Quick Shot', tier: 'minor',
    desc: '+12% attack speed for every tower, all run long.',
    icon: itemIcon('magic_shortbow_i'), effect: { kind: 'fireRate', mult: 1.12 } },
  { id: 'treasure_hunter', name: 'Treasure Hunter', tier: 'minor',
    desc: 'Enemies you kill drop 30% more gold.',
    icon: itemIcon('reward_casket_elite'), effect: { kind: 'goldFind', mult: 1.3 } },
  { id: 'soul_stealer', name: 'Soul Eater', tier: 'mythic',
    desc: 'Every boss you slay gives a life back. Lesser kills pay for one too, at a price that climbs each wave.',
    icon: itemIcon('soul_rune'), effect: { kind: 'soulSteal', bossHeal: 1, addKills: SOUL_STEAL_BASE_KILLS } },
  { id: 'brawlers_resolve', name: "Brawler's Resolve", tier: 'minor',
    desc: '+2 maximum lives (and heal 2 now).',
    icon: itemIcon('justiciar_chestguard'), effect: { kind: 'maxLife', amount: 2 } },
  { id: 'arcane_surge', name: 'Arcane Surge', tier: 'minor',
    desc: '+18% damage and +8% range for magic towers.',
    icon: itemIcon('kodai_insignia'),
    effect: { kind: 'multi', effects: [{ kind: 'damage', mult: 1.18, style: 'magic' }, { kind: 'range', mult: 1.08, style: 'magic' }] } },
  { id: 'equilibrium', name: 'Equilibrium', tier: 'major',
    desc: '+25% damage for every tower, but they attack 10% slower.',
    icon: itemIcon('elder_maul'),
    effect: { kind: 'multi', effects: [{ kind: 'damage', mult: 1.25 }, { kind: 'fireRate', mult: 0.9 }] } },
];

/* Relics are the reward for beating a boss — the engine offers a choice on a boss
   wave clear (there is no fixed-interval offer; see GameEngine.checkWaveEnd). */

/** The relics not yet owned this run — the only ones eligible to be offered. */
export function availableRelics(ownedIds: ReadonlySet<string>, pool: readonly Relic[] = RELICS): Relic[] {
  return pool.filter(r => !ownedIds.has(r.id));
}

/**
 * Roll a choice of up to `count` distinct relics, weighted by tier and drawn
 * without replacement from the relics not yet owned. `rng` is injected
 * (`Math.random` in the engine) so the roll is deterministic under test. Returns
 * fewer than `count` (or an empty array) once the un-owned pool runs low.
 */
export function rollRelicChoice(
  rng: () => number,
  ownedIds: ReadonlySet<string>,
  count = 3,
  pool: readonly Relic[] = RELICS,
): Relic[] {
  const remaining = availableRelics(ownedIds, pool);
  const choice: Relic[] = [];
  const n = Math.min(count, remaining.length);
  for (let i = 0; i < n; i++) {
    const total = remaining.reduce((s, r) => s + TIER_WEIGHT[r.tier], 0);
    let roll = rng() * total;
    let idx = 0;
    for (let j = 0; j < remaining.length; j++) {
      roll -= TIER_WEIGHT[remaining[j].tier];
      if (roll < 0) { idx = j; break; }
      idx = j;
    }
    choice.push(remaining[idx]);
    remaining.splice(idx, 1);
  }
  return choice;
}

// ──────────────────────── pure runtime read helpers ─────────────────────────
/**
 * Whether a hit that left an enemy on `hp` (of `maxHp`) should trigger an
 * `execute` relic with threshold `frac`. False when the relic is absent
 * (`frac <= 0`) or the enemy is already dead (`hp <= 0`, the normal kill path
 * handles it). The engine guards bosses/healers at the call site.
 */
export function shouldExecute(frac: number, hp: number, maxHp: number): boolean {
  return frac > 0 && hp > 0 && hp <= maxHp * frac;
}

/** Interest paid on a wave-clear: `rate` of `gold`, floored, capped at `cap`. */
export function interestGain(rate: number, cap: number, gold: number): number {
  return Math.min(cap, Math.floor(Math.max(0, gold) * rate));
}
