import { ASSETS, itemIcon, npcModel } from '../assets';

/**
 * Wave events (#1): occasional *global* rule-benders announced at the start of a
 * wave that change the terms of that one wave for **everyone on the field** —
 * every enemy and every tower — then clear when the wave ends. Where affixes are
 * per-enemy and drafts/relics are player-chosen buffs, an event is an uncontrolled
 * twist of the whole board: a hazard that forces a different line of play (fog
 * shrinks your range, a frenzy speeds the horde) or a boon that rewards pressing
 * the advantage (overcharge, clear skies). One risk/reward event pays extra gold
 * for a genuinely harder wave, so the economy isn't inflated — you *earn* it.
 *
 * Applies in both classic and roguelite modes (like affixes), from
 * {@link EVENT_UNLOCK_WAVE} on, and never on a boss wave (the boss is the headline
 * act). This module is **pure** (RNG injected, no `this`/DOM): the pool, the
 * weighted roll and the effect resolver are all unit-testable. The engine owns
 * folding {@link resolveEventMods} into its spawn/tower/gold hooks and drawing the
 * banner.
 */

/** A boon helps the player this wave; a hazard makes it harder. */
export type WaveEventTone = 'hazard' | 'boon';

/**
 * The board-wide modifiers an event applies for its wave. Every field is a
 * multiplier that defaults to 1 (see {@link resolveEventMods}); an event sets only
 * the ones it touches. Tower mults are global (all styles equally, unlike the
 * per-style {@link import('./roguelite-draft').RunModifiers}).
 */
export interface WaveEventEffect {
  /** ×damage for every tower this wave. */
  towerDamageMult?: number;
  /** ×range for every tower this wave. */
  towerRangeMult?: number;
  /** ×attack speed for every tower this wave. */
  towerFireRateMult?: number;
  /** ×spawn HP for every enemy this wave. */
  enemyHpMult?: number;
  /** ×move speed for every enemy this wave. */
  enemySpeedMult?: number;
  /** ×the count of each spawn group (more/fewer enemies). */
  enemyCountMult?: number;
  /** ×gold dropped by kills this wave (paired with a harder wave, never free). */
  goldMult?: number;
}

export interface WaveEvent {
  id: string;
  name: string;
  /** One-line, OSRS-flavoured announcement shown on the banner / tutorial. */
  desc: string;
  tone: WaveEventTone;
  /** Banner tint the UI/renderer uses (hazard = warm, boon = cool). */
  color: string;
  /** Icon URL (wiki item art, hot-linked like affixes/relics; degrades away). */
  icon: string;
  /** Selection weight within its roll — hazards outnumber boons. */
  weight: number;
  effect: WaveEventEffect;
}

/**
 * The event pool. Hazards force adaptation, boons reward it, and Blood Moon is the
 * lone risk/reward twist (tougher + swifter, but pays out). Weights make hazards
 * roughly twice as likely as any single boon, so a rolled event is usually a
 * problem to solve rather than a gift.
 */
export const WAVE_EVENTS: readonly WaveEvent[] = [
  // ───────────────────────────────── hazards ──────────────────────────────
  { id: 'dense_fog', name: 'Dense Fog', tone: 'hazard', color: '#8aa0b0', weight: 20,
    desc: 'A thick sea fog rolls in — your towers see much less far this wave.',
    icon: itemIcon('ghostly_hood'), effect: { towerRangeMult: 0.72 } },
  { id: 'iron_tide', name: 'Iron Tide', tone: 'hazard', color: '#9aa0a8', weight: 20,
    desc: 'The horde marches in heavy armour — every enemy is far tougher.',
    icon: itemIcon('rune_platebody'), effect: { enemyHpMult: 1.35 } },
  { id: 'frenzy', name: 'Frenzy', tone: 'hazard', color: '#ff5a3c', weight: 18,
    desc: 'A blood-frenzy grips the horde — they charge in much faster.',
    icon: itemIcon('berserker_necklace'), effect: { enemySpeedMult: 1.4 } },
  { id: 'curse_of_darkness', name: 'Curse of Darkness', tone: 'hazard', color: '#7a5cff', weight: 14,
    desc: 'A creeping darkness saps your towers — they hit weaker this wave.',
    icon: ASSETS.spells['Curse'], effect: { towerDamageMult: 0.8 } },
  { id: 'infestation', name: 'Infestation', tone: 'hazard', color: '#b6d957', weight: 16,
    desc: 'An infestation swells the horde with frail, numberless stragglers.',
    icon: npcModel('kalphite_larva'), effect: { enemyCountMult: 1.6, enemyHpMult: 0.6 } },

  // ───────────────────────────── risk / reward ────────────────────────────
  { id: 'blood_moon', name: 'Blood Moon', tone: 'hazard', color: '#c0392b', weight: 10,
    desc: 'Under the blood moon enemies are stronger and swifter — but drop far more gold.',
    icon: itemIcon('blood_rune'), effect: { enemyHpMult: 1.2, enemySpeedMult: 1.2, goldMult: 1.4 } },

  // ────────────────────────────────── boons ───────────────────────────────
  { id: 'overcharge', name: 'Overcharge', tone: 'boon', color: '#57d9d9', weight: 12,
    desc: 'Arcane winds overcharge your towers — they attack faster this wave.',
    icon: itemIcon('battlestaff'), effect: { towerFireRateMult: 1.25 } },
  { id: 'clear_skies', name: 'Clear Skies', tone: 'boon', color: '#57c8ff', weight: 12,
    desc: 'The skies clear — your towers see much farther this wave.',
    icon: ASSETS.prayers.eagle_eye, effect: { towerRangeMult: 1.3 } },
  { id: 'war_banner', name: 'War Banner', tone: 'boon', color: '#ffd257', weight: 12,
    desc: 'A war banner rallies your towers — they strike harder this wave.',
    icon: itemIcon('saradomin_banner'), effect: { towerDamageMult: 1.22 } },
];

// ───────────────────────────── tuning constants ────────────────────────────
/** No events before this wave — the first couple of waves stay a clean teach. */
export const EVENT_UNLOCK_WAVE = 3;
/** Chance an eligible wave rolls an event: a base at the unlock wave that ramps
 *  up by a per-wave step to a ceiling, so events grow from occasional to common. */
export const EVENT_CHANCE_BASE = 0.15;
export const EVENT_CHANCE_STEP = 0.03;
export const EVENT_CHANCE_CAP = 0.45;

/** Chance (0–1) that (a non-boss) wave `wave` rolls an event at all. */
export function eventChanceForWave(wave: number): number {
  if (wave < EVENT_UNLOCK_WAVE) return 0;
  return Math.min(EVENT_CHANCE_CAP, EVENT_CHANCE_BASE + (wave - EVENT_UNLOCK_WAVE) * EVENT_CHANCE_STEP);
}

/**
 * Roll an event for a wave, or null for "no event this wave". Boss waves and
 * pre-unlock waves never roll one. `rng` is injected (`Math.random` in the engine)
 * so the result is deterministic under test. When an event is granted it's drawn
 * from {@link WAVE_EVENTS} weighted by each event's `weight`.
 */
export function rollWaveEvent(wave: number, isBossWave: boolean, rng: () => number): WaveEvent | null {
  if (isBossWave) return null;
  const chance = eventChanceForWave(wave);
  if (chance <= 0 || rng() >= chance) return null;
  const total = WAVE_EVENTS.reduce((s, e) => s + e.weight, 0);
  let roll = rng() * total;
  for (const e of WAVE_EVENTS) {
    roll -= e.weight;
    if (roll < 0) return e;
  }
  return WAVE_EVENTS[WAVE_EVENTS.length - 1];
}

/** The fully-resolved multiplier set for an event (or none), every field defaulted
 *  to 1 so the engine can read them unconditionally. */
export interface WaveEventMods {
  towerDamage: number;
  towerRange: number;
  towerFireRate: number;
  enemyHp: number;
  enemySpeed: number;
  enemyCount: number;
  gold: number;
}

/** Fold an event (or null) into its complete multiplier set, defaulting every
 *  untouched field to 1. Pure — the engine reads these at its spawn/tower/gold
 *  hooks. */
export function resolveEventMods(ev: WaveEvent | null): WaveEventMods {
  const e = ev?.effect;
  return {
    towerDamage: e?.towerDamageMult ?? 1,
    towerRange: e?.towerRangeMult ?? 1,
    towerFireRate: e?.towerFireRateMult ?? 1,
    enemyHp: e?.enemyHpMult ?? 1,
    enemySpeed: e?.enemySpeedMult ?? 1,
    enemyCount: e?.enemyCountMult ?? 1,
    gold: e?.goldMult ?? 1,
  };
}
