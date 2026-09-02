import { SPOTANIM_SHEETS } from './spotanims.data';

/**
 * Playback metadata for a baked spotanim (GFX) sprite sheet. The PNG is a
 * horizontal strip of `frames` cells, each `frameW`×`frameH`, produced by
 * scripts/render-osrs-spotanims.mjs (whose JSON sidecars are folded into
 * spotanims.data.ts by scripts/generate-spotanims-data.mjs). The renderer
 * plays the strip once (or loops it) at the effect's location.
 */
export interface SpotAnimMeta {
  /** Sprite-sheet URL (already base-path-prefixed via the generated data). */
  url: string;
  frames: number;
  frameW: number;
  frameH: number;
  /** Authentic per-frame durations (ms) from the cache sequence. */
  frameMs: number[];
  /** On-screen draw size (logic px), centred on the effect point. */
  size: number;
  /** Playback speed multiplier (>1 plays faster than the cache timing). */
  speed: number;
  /** Loops forever (spawn portal, projectile flight) instead of playing once. */
  loop?: boolean;
  /** Composite mode: 'add' glows (energy/light), 'alpha' is the client's plain
   *  translucency (needed for dark GFX — smoke/shadow add ~nothing additively). */
  blend: 'add' | 'alpha';
}

/**
 * Impacts baked with extra padding, and the box size that cancels it out.
 * Fire Blast's last frames bloom far wider than the rest, so it is baked at a
 * 0.3 fit margin (see HIT_MARGIN in scripts/render-osrs-spotanims.mjs) to stop
 * the star's points being cut off at the sheet edge — the art then fills ~78%
 * of its frame instead of all of it, and a proportionally bigger box keeps it
 * looking the same size on screen.
 */
const HIT_SIZE: Record<string, number> = { hit_fire_3: 92 };

/**
 * Flight GFX that are not a caster's orb. The King Black Dragon's breath is a gout thrown
 * by something the size of a house, so at the spells' 30px it reads as a spark; it is
 * drawn at the size of a real breath instead.
 */
const PROJ_SIZE: Record<string, number> = {
  proj_dragonfire: 54, proj_dragonfire_poison: 54, proj_dragonfire_ice: 54, proj_dragonfire_shock: 54,
  // General Graardor throws a rock, not a bolt: sized between a spell orb and a breath.
  proj_graardor: 40,
};

/**
 * GFX that are neither a spell's flight nor a spell's impact, so the prefix rules below
 * have nothing to say about them.
 *  - `ice_shard`: one blue ice crystal (spotanim 1200). It is not an effect on its own —
 *    the renderer places six of them around Vorkath and rotates each one itself — so it
 *    loops, and it is small: a *piece* of a shell, not the shell.
 *  - `cast_death_charge`: the Arceuus spell going off on a body General Graardor's slam
 *    has freed. Dark violet, so 'alpha' rather than 'add' (an additive dark purple over
 *    dark road is nearly nothing), and drawn a little larger than an enemy so the charge
 *    stands over the mark instead of hiding inside it.
 */
const STANDALONE: Record<string, { size: number; speed: number; loop?: boolean; blend: 'add' | 'alpha' }> = {
  ice_shard: { size: 34, speed: 1, loop: true, blend: 'alpha' },
  cast_death_charge: { size: 58, speed: 1.15, blend: 'alpha' },
};

/**
 * Presentation defaults by slug family. Sheet facts (frames/timings) come from
 * the generated table; this layer decides how each GFX *plays* in our scenes:
 *  - `hit_*` spell impacts: one-shot on the struck model, sized near the
 *    procedural bursts they replaced; scaled per-enemy at spawn (Effect.scale).
 *  - `proj_*` spell flights: small looping orb riding the projectile.
 *  - `portal`: the looping spawn portal, drawn every frame (not spawnEffect).
 */
function presentationFor(slug: string): { size: number; speed: number; loop?: boolean; blend: 'add' | 'alpha' } {
  if (STANDALONE[slug]) return STANDALONE[slug];
  if (slug.startsWith('proj_')) return { size: PROJ_SIZE[slug] ?? 30, speed: 1, loop: true, blend: 'alpha' };
  if (slug.startsWith('hit_')) return { size: HIT_SIZE[slug] ?? 72, speed: 1, blend: 'alpha' };
  // portal (and future NPC-sourced loops)
  return { size: 104, speed: 1, loop: true, blend: 'add' };
}

export const SPOTANIMS: Record<string, SpotAnimMeta> = Object.fromEntries(
  Object.entries(SPOTANIM_SHEETS).map(([slug, sheet]) => [slug, { ...sheet, ...presentationFor(slug) }]),
);

/** Total play time (seconds) of a spotanim at its configured speed. */
export function spotAnimDurationS(meta: SpotAnimMeta): number {
  let sum = 0;
  for (const ms of meta.frameMs) sum += ms;
  return sum / meta.speed / 1000;
}
