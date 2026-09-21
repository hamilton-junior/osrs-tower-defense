import { describe, it, expect } from 'vitest';
import { SEEDS, SEED_BY_ID, type SeedId } from '../data/farming';
import {
  buildFarmPatches, patchStage, wavesLeft, patchAtPoint, harvestable, ripenPatches,
  patchToTend, tendPatch,
  farmTowerMods, farmGoldMult, farmPrayerDrainMult, farmLivesOnClear,
  plotId, parsePlotId, makePatch, canPlacePlot, plotTargets, pickPlotTiles,
  plotCost, PLOT_BASE_COST, seedCost, restorePlots,
  type FarmPatch,
} from './farming';
import type { TerrainField } from './terrain-generation';

const GRID = 32;

const field = (patches: { col: number; row: number }[]): TerrainField => ({
  cols: 45, rows: 20, tiles: [], liquid: [], decorations: [], patches, spots: [],
});

const patch = (over: Partial<FarmPatch> = {}): FarmPatch => ({
  id: 'p0_0', col: 0, row: 0, x: 16, y: 16, seedId: null, grown: 0, paid: 0, ...over,
});

describe('buildFarmPatches', () => {
  it('puts a bare plot at the centre of each patch tile', () => {
    const [a, b] = buildFarmPatches(field([{ col: 3, row: 4 }, { col: 10, row: 2 }]), GRID);
    expect(a).toEqual({ id: 'p3_4', col: 3, row: 4, x: 112, y: 144, seedId: null, grown: 0, paid: 0 });
    expect(b.x).toBe(336);
    expect(b.y).toBe(80);
  });

  // The id is the tile, not a counter: a save reconnects a sown seed to its plot
  // by id, and a counter would reshuffle if the field ever handed them back in a
  // different order.
  it('names a plot after its tile', () => {
    expect(buildFarmPatches(field([{ col: 12, row: 7 }]), GRID)[0].id).toBe('p12_7');
  });

  it('deals nothing when the field has no patch tiles', () => {
    expect(buildFarmPatches(field([]), GRID)).toEqual([]);
  });
});

describe('patchStage', () => {
  it('is empty with nothing in the ground, however many waves went by', () => {
    expect(patchStage(patch())).toBe('empty');
    expect(patchStage(patch({ grown: 99 }))).toBe('empty');
  });

  // Guam takes 3 waves. Half-way (1.5) rounds onto the second, so the player sees
  // three distinct pictures across the wait.
  it('walks a guam through sown → growing → ready', () => {
    expect(patchStage(patch({ seedId: 'guam', grown: 0 }))).toBe('sown');
    expect(patchStage(patch({ seedId: 'guam', grown: 1 }))).toBe('sown');
    expect(patchStage(patch({ seedId: 'guam', grown: 2 }))).toBe('growing');
    expect(patchStage(patch({ seedId: 'guam', grown: 3 }))).toBe('ready');
  });

  it('gives every seed its own wait, to the wave', () => {
    for (const s of SEEDS) {
      expect(patchStage(patch({ seedId: s.id, grown: s.waves - 1 })), s.id).not.toBe('ready');
      expect(patchStage(patch({ seedId: s.id, grown: s.waves })), s.id).toBe('ready');
    }
  });
});

describe('ripenPatches', () => {
  it('ages every sown patch by exactly one wave', () => {
    const ps = [patch({ id: 'a', seedId: 'guam', grown: 0 }), patch({ id: 'b', seedId: 'ranarr', grown: 2 })];
    ripenPatches(ps);
    expect(ps.map(p => p.grown)).toEqual([1, 3]);
  });

  it('leaves bare ground alone', () => {
    const p = patch();
    ripenPatches([p]);
    expect(p.grown).toBe(0);
  });

  // A ripe herb the player has not pulled yet is ready, not increasingly ready —
  // and an unbounded tally is a number that eventually reaches the save file.
  it('stops counting once the herb is ready', () => {
    const p = patch({ seedId: 'guam', grown: SEED_BY_ID.guam.waves });
    ripenPatches([p]);
    ripenPatches([p]);
    expect(p.grown).toBe(SEED_BY_ID.guam.waves);
  });

  // The whole reason the tally exists: the debug wave control (and anything else
  // that moves the counter) must not ripen or freeze what is in the ground.
  it('is the only thing that ripens a patch', () => {
    const p = patch({ seedId: 'torstol', grown: 1 });
    expect(patchStage(p)).toBe('sown');
    expect(wavesLeft(p)).toBe(SEED_BY_ID.torstol.waves - 1);
  });
});

describe('wavesLeft', () => {
  it('counts down to zero and stops', () => {
    expect(wavesLeft(patch({ seedId: 'ranarr', grown: 0 }))).toBe(4);
    expect(wavesLeft(patch({ seedId: 'ranarr', grown: 2 }))).toBe(2);
    expect(wavesLeft(patch({ seedId: 'ranarr', grown: 4 }))).toBe(0);
    expect(wavesLeft(patch({ seedId: 'ranarr', grown: 30 }))).toBe(0);
  });

  it('is zero for a bare patch, which is not waiting on anything', () => {
    expect(wavesLeft(patch())).toBe(0);
  });
});

describe('the Tool Leprechaun', () => {
  it('picks the herb with the longest wait left', () => {
    const a = patch({ id: 'a', seedId: 'guam', grown: 0 });
    const b = patch({ id: 'b', seedId: 'torstol', grown: 1 });
    const c = patch({ id: 'c', seedId: 'ranarr', grown: 0 });
    expect(patchToTend([a, b, c])?.id).toBe('b');
  });

  it('goes to the first in board order on a tie', () => {
    const a = patch({ id: 'a', seedId: 'ranarr', grown: 1 });
    const b = patch({ id: 'b', seedId: 'irit', grown: 1 });
    expect(patchToTend([a, b])?.id).toBe('a');
  });

  it('passes over bare ground and ripe herbs, and finds nothing when nothing grows', () => {
    const bare = patch({ id: 'bare' });
    const ripe = patch({ id: 'ripe', seedId: 'guam', grown: 3 });
    expect(patchToTend([bare, ripe])).toBeNull();
    expect(patchToTend([])).toBeNull();
    const growing = patch({ id: 'growing', seedId: 'guam', grown: 2 });
    expect(patchToTend([bare, ripe, growing])?.id).toBe('growing');
  });

  it('grows a herb one wave and marks it tended', () => {
    const p = patch({ seedId: 'ranarr', grown: 1 });
    expect(tendPatch(p)).toBe(true);
    expect(p.grown).toBe(2);
    expect(p.tended).toBe(true);
    expect(wavesLeft(p)).toBe(2);
  });

  it('leaves bare ground and a ripe herb alone', () => {
    const bare = patch();
    const ripe = patch({ seedId: 'guam', grown: 3 });
    expect(tendPatch(bare)).toBe(false);
    expect(tendPatch(ripe)).toBe(false);
    expect(bare.grown).toBe(0);
    expect(ripe.grown).toBe(3);
    expect(bare.tended).toBeUndefined();
    expect(ripe.tended).toBeUndefined();
  });
});

describe('patchAtPoint', () => {
  const patches = buildFarmPatches(field([{ col: 3, row: 4 }]), GRID);

  it('claims the whole tile, corner to corner', () => {
    expect(patchAtPoint(patches, 3 * GRID, 4 * GRID, GRID)?.id).toBe('p3_4');
    expect(patchAtPoint(patches, 4 * GRID - 1, 5 * GRID - 1, GRID)?.id).toBe('p3_4');
  });

  it('does not spill into the neighbouring tile', () => {
    expect(patchAtPoint(patches, 4 * GRID, 4 * GRID, GRID)).toBeNull();
    expect(patchAtPoint(patches, 3 * GRID - 1, 4 * GRID, GRID)).toBeNull();
  });
});

describe('harvestable', () => {
  it('hands back the herb only once the patch is ready', () => {
    expect(harvestable(patch({ seedId: 'guam', grown: 1 }))).toBeNull();
    expect(harvestable(patch({ seedId: 'guam', grown: 3 }))).toEqual(SEED_BY_ID.guam);
  });

  it('hands back nothing from bare ground', () => {
    expect(harvestable(patch({ grown: 50 }))).toBeNull();
  });
});

describe('what a herb is worth', () => {
  // Every style at ×1 on every stat: what the board runs at with nothing drunk.
  const flat = { melee: 1, ranged: 1, magic: 1 };
  const all = (n: number) => ({ melee: n, ranged: n, magic: n });

  // Nothing in the ground must leave every funnel exactly as it found it — these
  // four are multiplied into live systems on every frame of every wave.
  it('is identity with no herb', () => {
    expect(farmTowerMods([])).toEqual({ damage: flat, range: flat, fireRate: flat });
    expect(farmGoldMult([])).toBe(1);
    expect(farmPrayerDrainMult([])).toBe(1);
    expect(farmLivesOnClear([])).toBe(0);
  });

  it('gives guam its damage, to every style and nothing else', () => {
    expect(farmTowerMods(['guam'])).toEqual({ damage: all(1.15), range: flat, fireRate: flat });
    expect(farmGoldMult(['guam'])).toBe(1);
    expect(farmPrayerDrainMult(['guam'])).toBe(1);
    expect(farmLivesOnClear(['guam'])).toBe(0);
  });

  // The whole point of the style column: a herb grown for one kind of tower must
  // leave the other two exactly where it found them.
  it('keeps kwuarm on the melee towers', () => {
    const m = farmTowerMods(['kwuarm']);
    expect(m.damage.melee).toBeCloseTo(1.4);
    expect(m.damage.ranged).toBe(1);
    expect(m.damage.magic).toBe(1);
  });

  it('keeps irit on the rangers and lantadyme on the wizards', () => {
    const irit = farmTowerMods(['irit']);
    expect(irit.range.ranged).toBeCloseTo(1.3);
    expect(irit.range.magic).toBe(1);
    const lant = farmTowerMods(['lantadyme']);
    expect(lant.damage.magic).toBeCloseTo(1.45);
    expect(lant.damage.melee).toBe(1);
  });

  it('speeds only the melee towers up for tarromin, and all three for harralander', () => {
    const tar = farmTowerMods(['tarromin']);
    expect(tar.fireRate.melee).toBeCloseTo(1.2);
    expect(tar.fireRate.ranged).toBe(1);
    expect(farmTowerMods(['harralander']).fireRate).toEqual(all(1.1));
  });

  it('slows the prayer drain for marrentill, and only for marrentill', () => {
    expect(farmPrayerDrainMult(['marrentill'])).toBeCloseTo(0.8);
    expect(farmPrayerDrainMult(['torstol'])).toBe(1);
  });

  it('pays more gold for torstol and toadflax, and only for those two', () => {
    expect(farmGoldMult(['torstol'])).toBeCloseTo(1.3);
    expect(farmGoldMult(['toadflax'])).toBeCloseTo(1.15);
    expect(farmGoldMult(['ranarr'])).toBe(1);
  });

  it('hands a life back for ranarr, and only for ranarr', () => {
    expect(farmLivesOnClear(['ranarr'])).toBe(1);
    expect(farmLivesOnClear(['guam'])).toBe(0);
  });

  // Herbs stack the way doses do, so a pouchful of different ones all ride the
  // same wave — each answering for its own system, none cancelling another.
  it('stacks different herbs across the funnels', () => {
    const held: SeedId[] = ['guam', 'kwuarm', 'snapdragon', 'marrentill', 'torstol', 'ranarr'];
    const m = farmTowerMods(held);
    // guam reaches all three; kwuarm rides on top of it for the melee alone
    expect(m.damage.melee).toBeCloseTo(1.15 * 1.4);
    expect(m.damage.ranged).toBeCloseTo(1.15);
    expect(m.range).toEqual({ melee: 1.2, ranged: 1.2, magic: 1.2 });
    expect(farmGoldMult(held)).toBeCloseTo(1.3);
    expect(farmPrayerDrainMult(held)).toBeCloseTo(0.8);
    expect(farmLivesOnClear(held)).toBe(1);
  });

  // The engine keeps its list unique, so a repeat can only come out of a save
  // someone edited by hand — and it still has to pay exactly once.
  it('pays a repeated herb only once', () => {
    expect(farmTowerMods(['guam', 'guam']).damage.melee).toBeCloseTo(1.15);
    expect(farmGoldMult(['torstol', 'torstol'])).toBeCloseTo(1.3);
    expect(farmLivesOnClear(['ranarr', 'ranarr'])).toBe(1);
  });

  // Every herb has to actually do something, or a player waits six waves for a
  // seed that quietly does nothing at all.
  it('leaves no seed in the table doing nothing', () => {
    for (const s of SEEDS) {
      const id: SeedId = s.id;
      const m = farmTowerMods([id]);
      const towers = ([...Object.values(m.damage), ...Object.values(m.range), ...Object.values(m.fireRate)])
        .some(n => n !== 1);
      const moved = towers
        || farmGoldMult([id]) !== 1
        || farmPrayerDrainMult([id]) !== 1
        || farmLivesOnClear([id]) !== 0;
      expect(moved, `${id} does nothing`).toBe(true);
    }
  });

  // A styled herb that names a style no tower has would be a dead row, and the
  // table is the only place that can go wrong.
  it('names a real combat style wherever it names one', () => {
    for (const s of SEEDS) {
      if (!s.style) continue;
      expect(['melee', 'ranged', 'magic'], `${s.id} styles nothing`).toContain(s.style);
    }
  });
});


// ───────────────────────── moving and buying allotments ─────────────────────────
// A tiny hand-drawn field: `.` open, `#` blocked, `-` unbuildable, `F` a plot already
// standing, `~` water carrying a fishing spot. Rows are written the way the board
// reads them, top to bottom.
const draw = (rows: string[]): TerrainField => {
  const cols = rows[0].length;
  const tiles: TerrainField['tiles'] = [];
  const patches: { col: number; row: number }[] = [];
  const spots: { col: number; row: number }[] = [];
  rows.forEach((line, row) => {
    [...line].forEach((ch, col) => {
      if (ch === '#') tiles.push('blocked');
      else if (ch === '-') tiles.push('unbuildable');
      else if (ch === 'F') { tiles.push('farming'); patches.push({ col, row }); }
      else if (ch === '~') { tiles.push('water'); spots.push({ col, row }); }
      else tiles.push('open');
    });
  });
  return { cols, rows: rows.length, tiles, liquid: tiles.map(() => 'water' as const), decorations: [], patches, spots };
};

describe('plot ids', () => {
  it('round-trips a tile through its name', () => {
    expect(plotId(12, 7)).toBe('p12_7');
    expect(parsePlotId('p12_7')).toEqual({ col: 12, row: 7 });
  });

  it('refuses anything that is not one', () => {
    expect(parsePlotId('p12')).toBeNull();
    expect(parsePlotId('12_7')).toBeNull();
    expect(parsePlotId('p-1_7')).toBeNull();
    expect(parsePlotId('')).toBeNull();
  });

  it('names a fresh plot after the tile it stands on', () => {
    expect(makePatch(4, 2, GRID)).toEqual({
      id: 'p4_2', col: 4, row: 2, x: 144, y: 80, seedId: null, grown: 0, paid: 0,
    });
  });
});

describe('where a plot may be put down', () => {
  // The whole rule, in one field: only ground the board had already written off.
  const f = draw([
    '..#-',
    '.F#.',
    '....',
  ]);

  it('takes ground the board had already given up on', () => {
    expect(canPlacePlot(f, 2, 0)).toBe(true);  // blocked
    expect(canPlacePlot(f, 3, 0)).toBe(true);  // unbuildable
  });

  it('never takes open ground — the board needs it, and the road runs on it', () => {
    expect(canPlacePlot(f, 0, 0)).toBe(false);
    expect(canPlacePlot(f, 3, 1)).toBe(false);
  });

  it('never stacks two plots on one tile', () => {
    expect(canPlacePlot(f, 1, 1)).toBe(false);
  });

  it('refuses a tile off the board', () => {
    expect(canPlacePlot(f, -1, 0)).toBe(false);
    expect(canPlacePlot(f, 0, -1)).toBe(false);
    expect(canPlacePlot(f, 4, 0)).toBe(false);
    expect(canPlacePlot(f, 0, 3)).toBe(false);
  });

  // A plot in hand is still standing on its tile, and dropping it back there is a
  // move to nowhere — the click does nothing and the plot stays in hand, which is
  // what right-click is for.
  it('refuses the tile the plot in hand already stands on', () => {
    expect(canPlacePlot(f, 1, 1, { col: 1, row: 1 })).toBe(false);
  });

  it('still refuses another plot’s tile while one is in hand', () => {
    expect(canPlacePlot(f, 1, 1, { col: 2, row: 0 })).toBe(false);
  });

  it('lists every legal tile in board order', () => {
    expect(plotTargets(f)).toEqual([{ col: 2, row: 0 }, { col: 3, row: 0 }, { col: 2, row: 1 }]);
  });
});

// The two skills share a board and must never share a tile, in either direction.
describe('a plot and a fishing spot never meet', () => {
  const f = draw([
    '.~#',
    '.-.',
  ]);

  it('refuses the tile a fishing spot works', () => {
    expect(canPlacePlot(f, 1, 0)).toBe(false);
  });

  it('refuses it even when the flag under the spot says otherwise', () => {
    // The flag is what a stale save rewrites; the spot list is what the board
    // actually holds, so the spot is asked about by name.
    const stale: TerrainField = { ...f, tiles: f.tiles.map((t, i) => (i === 1 ? 'unbuildable' : t)) };
    expect(canPlacePlot(stale, 1, 0)).toBe(false);
  });

  it('keeps spot tiles out of the targets and out of the bought-plot deal', () => {
    for (const t of plotTargets(f)) expect(t).not.toEqual({ col: 1, row: 0 });
    for (const t of pickPlotTiles(f, 99)) expect(t).not.toEqual({ col: 1, row: 0 });
  });
});

describe('standing bought plots on a new map', () => {
  const f = draw([
    '..#',
    '###',
    '###',
  ]);

  it('deals nothing when nothing was bought', () => {
    expect(pickPlotTiles(f, 0)).toEqual([]);
  });

  it('prefers the tiles with open ground around them', () => {
    // (0,1) and (1,1) each sit under both open tiles; (2,0) only touches one. The
    // row/col tiebreak then picks the leftmost of the two.
    expect(pickPlotTiles(f, 1)).toEqual([{ col: 0, row: 1 }]);
  });

  it('hands them back in board order, however they were ranked', () => {
    const picked = pickPlotTiles(f, 4);
    expect(picked).toHaveLength(4);
    expect([...picked].sort((a, b) => (a.row - b.row) || (a.col - b.col))).toEqual(picked);
  });

  it('is deterministic, so a reloaded run finds its plots where it left them', () => {
    expect(pickPlotTiles(f, 3)).toEqual(pickPlotTiles(f, 3));
  });

  it('never deals more ground than the map has', () => {
    expect(pickPlotTiles(f, 99)).toHaveLength(7);
  });

  it('never deals a tile a plot could not stand on', () => {
    for (const t of pickPlotTiles(f, 99)) expect(canPlacePlot(f, t.col, t.row)).toBe(true);
  });
});

describe('what a seed costs', () => {
  const guam = SEED_BY_ID['guam'];
  const torstol = SEED_BY_ID['torstol'];

  it('charges the listed price on wave one', () => {
    expect(seedCost(guam, 1)).toBe(guam.cost);
    expect(seedCost(torstol, 1)).toBe(torstol.cost);
  });

  // The surcharge is half the Hunter traps' 3%: at wave sixty a herb is worth
  // roughly twice its wave-one price, where a trap is worth nearly three times.
  it('adds 1.5% of the base price per wave, to the nearest 5 gp', () => {
    expect(seedCost(torstol, 61)).toBe(190); // 100 * 1.9
    expect(seedCost(torstol, 101)).toBe(250); // 100 * 2.5
    expect(seedCost(guam, 101)).toBe(25); // 10 * 2.5
  });

  it('never charges less than the listed price', () => {
    expect(seedCost(torstol, 0)).toBe(torstol.cost);
    expect(seedCost(torstol, -20)).toBe(torstol.cost);
  });
});

describe('what the next plot costs', () => {
  it('starts at the base price and doubles every time', () => {
    expect(plotCost(0)).toBe(PLOT_BASE_COST);
    expect(plotCost(1)).toBe(2000);
    expect(plotCost(2)).toBe(4000);
    expect(plotCost(5)).toBe(32000);
  });

  it('treats a nonsense count as none bought', () => {
    expect(plotCost(-3)).toBe(PLOT_BASE_COST);
  });
});

// A plot may only stand on ground the towers cannot use — `blocked` or `unbuildable`,
// never `open`. Every field below is drawn with that in mind.
describe('restorePlots', () => {
  const ids = (patches: FarmPatch[]) => patches.map(p => p.id);
  const flag = (f: TerrainField, col: number, row: number) => f.tiles[row * f.cols + col];

  it('lifts the plots the seed dealt and stamps the ones the save lists', () => {
    const f = draw([
      '.F#..',
      '.....',
      '-..F.',
    ]);
    const back = restorePlots(f, ['p2_0', 'p0_2'], buildFarmPatches(f, GRID), GRID);
    expect(ids(back)).toEqual(['p2_0', 'p0_2']);
    expect(flag(f, 2, 0)).toBe('farming');
    expect(flag(f, 0, 2)).toBe('farming');
    expect(flag(f, 1, 0)).not.toBe('farming');
    expect(flag(f, 3, 2)).not.toBe('farming');
  });

  it('remembers what each restored plot covers, so lifting it again is clean', () => {
    const f = draw(['.#-..']);
    const back = restorePlots(f, ['p1_0', 'p2_0'], [], GRID);
    expect(back.map(p => p.under)).toEqual(['blocked', 'unbuildable']);
    restorePlots(f, [], back, GRID);
    expect(flag(f, 1, 0)).toBe('blocked');
    expect(flag(f, 2, 0)).toBe('unbuildable');
  });

  it('never buries a fishing spot a save was written before', () => {
    const f = draw(['~#...']);
    const back = restorePlots(f, ['p0_0'], [], GRID);
    expect(ids(back)).not.toContain('p0_0');
    expect(flag(f, 0, 0)).toBe('water');
  });

  it('deals fresh ground for a plot the map can no longer honour', () => {
    const f = draw([
      '~#...',
      '#....',
    ]);
    // Two plots were paid for; the first tile is water now, so one is re-sited.
    const back = restorePlots(f, ['p0_0', 'p1_0'], [], GRID);
    expect(back).toHaveLength(2);
    expect(ids(back)).toContain('p1_0');
    expect(back.every(p => flag(f, p.col, p.row) === 'farming')).toBe(true);
  });

  it('never re-sites a plot onto one it just stamped', () => {
    const f = draw([
      '~~##.',
      '#-...',
    ]);
    const back = restorePlots(f, ['p0_0', 'p2_0', 'p3_0'], [], GRID);
    expect(new Set(ids(back)).size).toBe(back.length);
  });

  it('hands the plots back in board order, whatever order the save listed them', () => {
    const f = draw([
      '#....',
      '..-..',
      '....#',
    ]);
    const back = restorePlots(f, ['p4_2', 'p0_0', 'p2_1'], [], GRID);
    expect(ids(back)).toEqual(['p0_0', 'p2_1', 'p4_2']);
  });

  it('ignores a plot id the board has no room for', () => {
    const f = draw(['.....']);
    expect(restorePlots(f, ['p99_0', 'p0_99', 'not-a-plot'], [], GRID)).toEqual([]);
  });
});
