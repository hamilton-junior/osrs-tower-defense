import type { Element, StyleWeakness } from '../types';
import { AFFIX_DEFS, affixPoolForWave, eliteChanceForWave, EXTRA_AFFIX_UNLOCK_WAVE } from './affixes';

/**
 * How many monster entries the next-wave strip may show before it collapses the
 * rest behind a "+N more".
 *
 * The strip is a floating panel over the board, and it wraps: every extra enemy
 * *type* in a wave adds width, then a whole new row. Late runs mix thirty-odd
 * types, which grew the panel into a wall across the top of the map that ate
 * every click meant for the ground under it — the tower simply would not place
 * (bug #9 / suggestion #18). Twelve entries is two comfortable rows at the
 * strip's `max-w`, so the panel's footprint stops depending on how deep the run
 * has gone.
 */
export const WAVE_PREVIEW_MAX = 12;

/**
 * Trim a wave preview to at most `max` entries, **never hiding a boss** — the
 * one line in the strip a player actually plans around. Bosses are kept first,
 * the remaining slots are filled in the wave's own order, and the result keeps
 * that original order so the strip doesn't reshuffle itself between waves.
 *
 * A wave carrying more bosses than `max` returns all of them: a boss you can't
 * see is worse than a tall panel.
 */
export function capWavePreview<T extends { isBoss?: boolean }>(
  preview: readonly T[],
  max = WAVE_PREVIEW_MAX,
): T[] {
  if (preview.length <= max) return [...preview];
  const keep = new Set<T>();
  for (const m of preview) if (m.isBoss) keep.add(m);
  for (const m of preview) {
    if (keep.size >= max) break;
    keep.add(m);
  }
  return preview.filter((m) => keep.has(m));
}


// ──────────────── the Lumbridge Guide's read on the next wave ──────────────

/** One monster type in the coming wave, flattened to what a warning needs. */
export interface WaveHintEntry {
  name: string;
  count: number;
  isBoss?: boolean;
  weakness?: Element;
  styleWeakness?: StyleWeakness;
}

/** Share of the wave one weakness has to cover before it is worth a warning. */
const WEAKNESS_SHARE = 0.4;
/** … and the head count under which "most of them" is a lie. */
const WEAKNESS_MIN = 3;
/** A wave this big is itself the news. */
const CROWD = 30;

const ELEMENT_NAME: Record<Exclude<Element, 'none'>, string> = {
  air: 'air',
  water: 'water',
  earth: 'earth',
  fire: 'fire',
};

const STYLE_NAME: Record<StyleWeakness, string> = {
  melee: 'a blade',
  ranged: 'arrows',
};

/**
 * Everything true and worth saying about the next wave, most useful first.
 *
 * The Guide used to answer with whichever type had the highest head count, which
 * on a wave of forty mixed monsters meant announcing "mostly cows" about six of
 * them — true, useless, and wrong-sounding. So a line only earns its place if it
 * changes what the player would build: a shared weakness, how many elites the
 * wave's own roll is likely to produce, which modifiers are in the pool, or a
 * crowd big enough to matter. Naming a type is the last resort, and only when it
 * really is most of the wave.
 *
 * Pure, and the affix names are drawn with an injected `rng`, so the same wave
 * can be described differently twice without the engine knowing how.
 */
export function waveHintLines(
  entries: readonly WaveHintEntry[],
  wave: number,
  rng: () => number = Math.random,
): string[] {
  const boss = entries.find((e) => e.isBoss);
  if (boss) return [`${boss.name} comes down that road next. Be ready.`];

  const mobs = entries.filter((e) => e.count > 0);
  const total = mobs.reduce((n, e) => n + e.count, 0);
  if (total <= 0) return [];

  const lines: string[] = [];

  // What they are soft to. Elements and combat styles are mutually exclusive on a
  // monster, so they compete for the same headline and the bigger share wins.
  const tally = new Map<string, number>();
  for (const e of mobs) {
    if (e.weakness && e.weakness !== 'none') tally.set(`element:${e.weakness}`, (tally.get(`element:${e.weakness}`) ?? 0) + e.count);
    else if (e.styleWeakness) tally.set(`style:${e.styleWeakness}`, (tally.get(`style:${e.styleWeakness}`) ?? 0) + e.count);
  }
  let topKey = '';
  let topCount = 0;
  for (const [key, n] of tally) if (n > topCount) { topKey = key; topCount = n; }
  if (topCount >= WEAKNESS_MIN && topCount / total >= WEAKNESS_SHARE) {
    const [kind, id] = topKey.split(':');
    const what = kind === 'element'
      ? ELEMENT_NAME[id as Exclude<Element, 'none'>]
      : STYLE_NAME[id as StyleWeakness];
    if (what) lines.push(`Most of that lot look weak to ${what} next wave.`);
  }

  // How many will come through elite. The roll is per enemy, so the wave's own
  // size decides this as much as the wave number does.
  const eliteChance = eliteChanceForWave(wave);
  const elites = Math.round(total * eliteChance);
  if (elites >= 2) lines.push(`Reckon about ${elites} elites in that lot.`);
  else if (elites === 1) lines.push('There will be an elite among them, by my count.');

  // Which modifiers are in the pool. Nothing is rolled yet, so the Guide guesses
  // — he names two of what *could* turn up, never what will.
  if (eliteChance > 0) {
    const pool = affixPoolForWave(wave);
    const first = pool[Math.floor(rng() * pool.length)];
    const rest = pool.filter((a) => a !== first);
    const second = rest[Math.floor(rng() * rest.length)];
    if (first && second) {
      lines.push(`Some could come through ${AFFIX_DEFS[first].name.toLowerCase()} or ${AFFIX_DEFS[second].name.toLowerCase()} next wave.`);
    }
  }

  // Two modifiers on one monster is a step up, and worth saying out loud.
  if (eliteChance > 0 && wave >= EXTRA_AFFIX_UNLOCK_WAVE) {
    lines.push('The worst of them carry two modifiers these days.');
  }

  if (total >= CROWD) lines.push(`That is ${total} of them on the road next wave.`);

  // Last resort: name a type, and only when it really is most of the wave.
  const biggest = mobs.reduce((best, e) => (e.count > best.count ? e : best), mobs[0]);
  if (biggest.count / total >= 0.5) lines.push(`Mostly ${biggest.name} next wave.`);

  if (lines.length === 0) lines.push(`A mixed lot next wave — ${total} of them, no two alike.`);
  return lines;
}

/** One of {@link waveHintLines}, picked at random so the Guide repeats himself
 *  less than the wave table does. */
export function waveHint(
  entries: readonly WaveHintEntry[],
  wave: number,
  rng: () => number = Math.random,
): string | undefined {
  const lines = waveHintLines(entries, wave, rng);
  if (lines.length === 0) return undefined;
  return lines[Math.min(lines.length - 1, Math.floor(rng() * lines.length))];
}
