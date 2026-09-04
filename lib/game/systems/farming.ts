/**
 * **Farming** — the pure half of the allotment patches.
 *
 * The terrain deals one or two patches with the road (`terrain-generation`); this
 * turns those tiles into something the player can sow, ripens what is in them as
 * the waves go by, and says what the herb is worth once it is pulled.
 *
 * Growth is counted in *waves*, never in seconds: a patch that ripened on a clock
 * would punish a player for thinking between waves, and there is nothing here that
 * asks for timing or attention.
 *
 * And it counts waves *survived*, not wave numbers. Comparing against the wave
 * counter looked the same right up until that counter moved on its own — the debug
 * wave control jumps it, and anything that ever replays or rewinds a wave would too
 * — and then a seed froze or ripened without a single fight going past it. So a
 * patch carries its own tally, and something has to hand it a wave for it to age
 * (see {@link ripenPatches}).
 */

import { SEED_BY_ID, type SeedDef, type SeedId } from '../data/farming';
import type { TerrainField } from './terrain-generation';

/** What a patch looks like, and what clicking it does. `empty` offers the seed
 *  menu, `ready` harvests, and the two in between are just a picture of waiting. */
export type PatchStage = 'empty' | 'sown' | 'growing' | 'ready';

export interface FarmPatch {
  /** Stable within a run: the patch's tile, so a save reconnects to the same plot. */
  id: string;
  col: number;
  row: number;
  /** Tile centre, in logic px — where the sprite draws and the click lands. */
  x: number;
  y: number;
  /** What is in the ground, or null for a bare patch. */
  seedId: SeedId | null;
  /** Waves this seed has sat through, counted one at a time as they are cleared.
   *  Meaningless while `seedId` is null, and reset by every sowing. */
  grown: number;
}

/** Turn the field's patch tiles into empty plots. Called with the map, so a fresh
 *  road means fresh ground: nothing that was sown survives a new map. */
export function buildFarmPatches(field: TerrainField, grid: number): FarmPatch[] {
  return field.patches.map(p => ({
    id: `p${p.col}_${p.row}`,
    col: p.col,
    row: p.row,
    x: (p.col + 0.5) * grid,
    y: (p.row + 0.5) * grid,
    seedId: null,
    grown: 0,
  }));
}

/** A wave has been fought and cleared: age everything in the ground by one. This
 *  is the only thing that ripens a patch, and it is called from exactly one place —
 *  the end of a real wave — so a debug sandbox wave, which is a test rather than a
 *  fight, leaves the allotments where they were. Counting stops at the seed's own
 *  wait: a ripe herb left standing is ready, not increasingly ready. */
export function ripenPatches(patches: readonly FarmPatch[]): void {
  for (const p of patches) {
    if (!p.seedId) continue;
    if (p.grown < SEED_BY_ID[p.seedId].waves) p.grown += 1;
  }
}

/** How many more waves before the herb can be pulled. 0 once it is ready, and 0
 *  for a bare patch, which is not waiting on anything. */
export function wavesLeft(patch: FarmPatch): number {
  if (!patch.seedId) return 0;
  return Math.max(0, SEED_BY_ID[patch.seedId].waves - patch.grown);
}

/** The four looks a patch can have. The middle two split the wait in half, so a
 *  glance at the board says roughly how far along the seed is. */
export function patchStage(patch: FarmPatch): PatchStage {
  if (!patch.seedId) return 'empty';
  const def = SEED_BY_ID[patch.seedId];
  const done = patch.grown / def.waves;
  if (done >= 1) return 'ready';
  return done >= 0.5 ? 'growing' : 'sown';
}

/** The patch under a click, or null. Patches sit on their own tile, so the hit
 *  box is that tile. */
export function patchAtPoint(
  patches: readonly FarmPatch[], x: number, y: number, grid: number,
): FarmPatch | null {
  const c = Math.floor(x / grid);
  const r = Math.floor(y / grid);
  return patches.find(p => p.col === c && p.row === r) ?? null;
}

/** The seed a patch will hand back, or null while it is bare or still growing. */
export function harvestable(patch: FarmPatch): SeedDef | null {
  return patchStage(patch) === 'ready' && patch.seedId ? SEED_BY_ID[patch.seedId] : null;
}

// ─────────────────────────── what a herb is worth ───────────────────────────
// Each of the four takes the live herb (or null) and answers for one system, so
// the engine folds farming into an existing funnel rather than growing a new one.

/** Board-wide tower multipliers, alongside a wave event's. */
export function farmTowerMods(seedId: SeedId | null): { damage: number; range: number; fireRate: number } {
  const def = seedId ? SEED_BY_ID[seedId] : null;
  return {
    damage: def?.effect === 'damage' ? 1 + def.amount : 1,
    range: def?.effect === 'range' ? 1 + def.amount : 1,
    fireRate: 1,
  };
}

/** What every gold award this wave is multiplied by. */
export function farmGoldMult(seedId: SeedId | null): number {
  const def = seedId ? SEED_BY_ID[seedId] : null;
  return def?.effect === 'gold' ? 1 + def.amount : 1;
}

/** What the prayer drain is multiplied by — below 1, so points last longer. */
export function farmPrayerDrainMult(seedId: SeedId | null): number {
  const def = seedId ? SEED_BY_ID[seedId] : null;
  return def?.effect === 'prayer' ? 1 - def.amount : 1;
}

/** Lives handed back when this wave is cleared. */
export function farmLivesOnClear(seedId: SeedId | null): number {
  const def = seedId ? SEED_BY_ID[seedId] : null;
  return def?.effect === 'life' ? def.amount : 0;
}
