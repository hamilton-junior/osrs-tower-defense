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
import { applyStyleBoost, identityStyleMods, type StyleMods } from './style-mods';

/** What a patch looks like, and what clicking it does. `empty` offers the seed
 *  menu, `ready` harvests, and the two in between are just a picture of waiting. */
export type PatchStage = 'empty' | 'sown' | 'growing' | 'ready';

export interface FarmPatch {
  /** The patch's tile, written out — `p<col>_<row>`. It is the plot's whole
   *  identity, which is why moving one *renames* it: two plots can never share a
   *  tile, so the tile is already a unique name, and a save that lists these ids
   *  has said where every plot stands without storing a coordinate twice. */
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

/** A plot's name from its tile. */
export function plotId(col: number, row: number): string {
  return `p${col}_${row}`;
}

/** The tile a plot's name spells out, or null if it isn't one. Only a save reads
 *  this — it is how a plot the player moved or bought finds its way home. */
export function parsePlotId(id: string): { col: number; row: number } | null {
  const m = /^p(\d+)_(\d+)$/.exec(id);
  return m ? { col: Number(m[1]), row: Number(m[2]) } : null;
}

/** One bare plot standing on a tile. */
export function makePatch(col: number, row: number, grid: number): FarmPatch {
  return {
    id: plotId(col, row),
    col,
    row,
    x: (col + 0.5) * grid,
    y: (row + 0.5) * grid,
    seedId: null,
    grown: 0,
  };
}

/** Turn the field's patch tiles into empty plots. Called with the map, so a fresh
 *  road means fresh ground: nothing that was sown survives a new map. */
export function buildFarmPatches(field: TerrainField, grid: number): FarmPatch[] {
  return field.patches.map(p => makePatch(p.col, p.row, grid));
}

// ───────────────────────────── where a plot may stand ─────────────────────────────
// The player can pick a plot up and put it down elsewhere, and buy more of them, so
// the rule the map generator followed has to hold for a hand as well as for a seed:
// **an allotment only ever stands on ground that was already unusable.** That is the
// one thing keeping farming out of the board's real currency — every guarantee the
// terrain makes (the build corridor, the coverage cap, the defensibility repair) was
// computed on a field where these tiles were taken, and it stays true as long as a
// plot never eats open ground. It also means a plot can never be dropped on the road,
// which is open by construction.

/** Whether a plot may stand on this tile. `from` is the plot being moved, whose own
 *  tile does not count as occupied. */
export function canPlacePlot(
  field: TerrainField, col: number, row: number, from?: { col: number; row: number } | null,
): boolean {
  if (col < 0 || row < 0 || col >= field.cols || row >= field.rows) return false;
  if (from && from.col === col && from.row === row) return false; // already there
  const flag = field.tiles[row * field.cols + col];
  return flag === 'blocked' || flag === 'unbuildable';
}

/** Every tile a plot could be put down on right now, in board order. The renderer
 *  paints these while a plot is in hand, so the rule above is something the player
 *  sees rather than something they discover by being refused. */
export function plotTargets(
  field: TerrainField, from?: { col: number; row: number } | null,
): { col: number; row: number }[] {
  const out: { col: number; row: number }[] = [];
  for (let row = 0; row < field.rows; row++) {
    for (let col = 0; col < field.cols; col++) {
      if (canPlacePlot(field, col, row, from)) out.push({ col, row });
    }
  }
  return out;
}

/** Somewhere to stand `count` plots the player already owns, when the map itself
 *  never dealt them — a new leg's ground has to honour the plots that were bought on
 *  the last one. Prefers tiles with open ground around them, the same taste the
 *  generator has: a plot at the edge of the scrub is reachable to look at, one buried
 *  in a boulder field is a sprite nobody can read. */
export function pickPlotTiles(
  field: TerrainField, count: number,
): { col: number; row: number }[] {
  if (count <= 0) return [];
  const free = plotTargets(field);
  const openAround = ({ col, row }: { col: number; row: number }) => {
    let n = 0;
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const r = row + dr, c = col + dc;
        if (r < 0 || c < 0 || r >= field.rows || c >= field.cols) continue;
        if (field.tiles[r * field.cols + c] === 'open') n++;
      }
    }
    return n;
  };
  // Deterministic: the same map and the same number of plots always deal the same
  // ground, so a reloaded run finds its allotments where it left them.
  return free
    .map(t => ({ t, open: openAround(t) }))
    .sort((a, b) => (b.open - a.open) || (a.t.row - b.t.row) || (a.t.col - b.t.col))
    .slice(0, count)
    .map(e => e.t)
    .sort((a, b) => (a.row - b.row) || (a.col - b.col));
}

/** What the next plot costs. Doubling, from a price that is already steep: a plot is
 *  a permanent second buff slot for the rest of the run, so the second one has to be
 *  a real decision against a tower and the fourth has to be out of reach for a while.
 *  Nothing caps how many can be owned — the price is the cap. */
export const PLOT_BASE_COST = 1000;

export function plotCost(bought: number): number {
  return PLOT_BASE_COST * 2 ** Math.max(0, bought);
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
// Each of the four takes every herb riding this wave and answers for one system,
// so the engine folds farming into an existing funnel rather than growing a new
// one. They take a list because herbs stack the way doses do — drink a Guam and a
// Torstol before Start Wave and both are up — and, exactly like a dose, a second
// helping of the *same* herb is the one it already had, never twice the effect.

/** Tower multipliers per combat style, alongside a wave event's. A herb that
 *  names a style only reaches towers fighting that way. */
export function farmTowerMods(seedIds: readonly SeedId[]): StyleMods {
  const mods = identityStyleMods();
  for (const def of uniqueDefs(seedIds)) {
    if (def.effect === 'damage') applyStyleBoost(mods, { style: def.style, damage: def.amount });
    if (def.effect === 'range') applyStyleBoost(mods, { style: def.style, range: def.amount });
    if (def.effect === 'fireRate') applyStyleBoost(mods, { style: def.style, fireRate: def.amount });
  }
  return mods;
}

/** What every gold award this wave is multiplied by. */
export function farmGoldMult(seedIds: readonly SeedId[]): number {
  let mult = 1;
  for (const def of uniqueDefs(seedIds)) if (def.effect === 'gold') mult *= 1 + def.amount;
  return mult;
}

/** What the prayer drain is multiplied by — below 1, so points last longer. */
export function farmPrayerDrainMult(seedIds: readonly SeedId[]): number {
  let mult = 1;
  for (const def of uniqueDefs(seedIds)) if (def.effect === 'prayer') mult *= 1 - def.amount;
  return Math.max(0, mult);
}

/** Lives handed back when this wave is cleared. */
export function farmLivesOnClear(seedIds: readonly SeedId[]): number {
  let lives = 0;
  for (const def of uniqueDefs(seedIds)) if (def.effect === 'life') lives += def.amount;
  return lives;
}

/** The herbs riding the wave, each counted once. The engine already keeps the
 *  list unique, so this is the belt to that braces — a save hand-edited into two
 *  Torstols must not pay out twice. */
function uniqueDefs(seedIds: readonly SeedId[]): SeedDef[] {
  const seen = new Set<SeedId>();
  const out: SeedDef[] = [];
  for (const id of seedIds) {
    if (seen.has(id) || !(id in SEED_BY_ID)) continue;
    seen.add(id);
    out.push(SEED_BY_ID[id]);
  }
  return out;
}
