import { describe, it, expect } from 'vitest';
import { SEEDS, SEED_BY_ID, type SeedId } from '../data/farming';
import {
  buildFarmPatches, patchStage, wavesLeft, patchAtPoint, harvestable,
  farmTowerMods, farmGoldMult, farmPrayerDrainMult, farmLivesOnClear,
  type FarmPatch,
} from './farming';
import type { TerrainField } from './terrain-generation';

const GRID = 32;

const field = (patches: { col: number; row: number }[]): TerrainField => ({
  cols: 45, rows: 20, tiles: [], decorations: [], patches,
});

const patch = (over: Partial<FarmPatch> = {}): FarmPatch => ({
  id: 'p0_0', col: 0, row: 0, x: 16, y: 16, seedId: null, sownAtWave: 0, ...over,
});

describe('buildFarmPatches', () => {
  it('puts a bare plot at the centre of each patch tile', () => {
    const [a, b] = buildFarmPatches(field([{ col: 3, row: 4 }, { col: 10, row: 2 }]), GRID);
    expect(a).toEqual({ id: 'p3_4', col: 3, row: 4, x: 112, y: 144, seedId: null, sownAtWave: 0 });
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
  it('is empty with nothing in the ground, whatever the wave', () => {
    expect(patchStage(patch(), 0)).toBe('empty');
    expect(patchStage(patch(), 99)).toBe('empty');
  });

  // Guam takes 3 waves: sown on 5, ready on 8. Half-way (1.5 waves) rounds onto
  // wave 7, so the player sees three distinct pictures across the wait.
  it('walks a guam through sown → growing → ready', () => {
    const p = patch({ seedId: 'guam', sownAtWave: 5 });
    expect(patchStage(p, 5)).toBe('sown');
    expect(patchStage(p, 6)).toBe('sown');
    expect(patchStage(p, 7)).toBe('growing');
    expect(patchStage(p, 8)).toBe('ready');
  });

  it('stays ready past its wave rather than rolling over', () => {
    const p = patch({ seedId: 'guam', sownAtWave: 5 });
    expect(patchStage(p, 40)).toBe('ready');
  });

  // A patch sown on a leg of the road the run then travels back from would read
  // as ripe the instant the wave counter went backwards.
  it('reads as freshly sown if the wave count ever goes backwards', () => {
    const p = patch({ seedId: 'torstol', sownAtWave: 12 });
    expect(patchStage(p, 9)).toBe('sown');
    expect(wavesLeft(p, 9)).toBe(SEED_BY_ID.torstol.waves);
  });

  it('gives every seed its own wait, to the wave', () => {
    for (const s of SEEDS) {
      const p = patch({ seedId: s.id, sownAtWave: 0 });
      expect(patchStage(p, s.waves - 1), s.id).not.toBe('ready');
      expect(patchStage(p, s.waves), s.id).toBe('ready');
    }
  });
});

describe('wavesLeft', () => {
  it('counts down to zero and stops', () => {
    const p = patch({ seedId: 'ranarr', sownAtWave: 10 }); // 4 waves
    expect(wavesLeft(p, 10)).toBe(4);
    expect(wavesLeft(p, 12)).toBe(2);
    expect(wavesLeft(p, 14)).toBe(0);
    expect(wavesLeft(p, 30)).toBe(0);
  });

  it('is zero for a bare patch, which is not waiting on anything', () => {
    expect(wavesLeft(patch(), 7)).toBe(0);
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
    const p = patch({ seedId: 'guam', sownAtWave: 1 });
    expect(harvestable(p, 2)).toBeNull();
    expect(harvestable(p, 4)).toEqual(SEED_BY_ID.guam);
  });

  it('hands back nothing from bare ground', () => {
    expect(harvestable(patch(), 50)).toBeNull();
  });
});

describe('what a herb is worth', () => {
  // Nothing in the ground must leave every funnel exactly as it found it — these
  // four are multiplied into live systems on every frame of every wave.
  it('is identity with no herb', () => {
    expect(farmTowerMods(null)).toEqual({ damage: 1, range: 1, fireRate: 1 });
    expect(farmGoldMult(null)).toBe(1);
    expect(farmPrayerDrainMult(null)).toBe(1);
    expect(farmLivesOnClear(null)).toBe(0);
  });

  it('gives guam its damage and nothing else', () => {
    expect(farmTowerMods('guam')).toEqual({ damage: 1.15, range: 1, fireRate: 1 });
    expect(farmGoldMult('guam')).toBe(1);
    expect(farmPrayerDrainMult('guam')).toBe(1);
    expect(farmLivesOnClear('guam')).toBe(0);
  });

  it('gives snapdragon its range and nothing else', () => {
    expect(farmTowerMods('snapdragon')).toEqual({ damage: 1, range: 1.2, fireRate: 1 });
  });

  it('slows the prayer drain for marrentill, and only for marrentill', () => {
    expect(farmPrayerDrainMult('marrentill')).toBeCloseTo(0.8);
    expect(farmPrayerDrainMult('torstol')).toBe(1);
  });

  it('pays more gold for torstol, and only for torstol', () => {
    expect(farmGoldMult('torstol')).toBeCloseTo(1.3);
    expect(farmGoldMult('ranarr')).toBe(1);
  });

  it('hands a life back for ranarr, and only for ranarr', () => {
    expect(farmLivesOnClear('ranarr')).toBe(1);
    expect(farmLivesOnClear('guam')).toBe(0);
  });

  // Every herb has to actually do something, or a player waits six waves for a
  // seed that quietly does nothing at all.
  it('leaves no seed in the table doing nothing', () => {
    for (const s of SEEDS) {
      const id: SeedId = s.id;
      const moved = farmTowerMods(id).damage !== 1
        || farmTowerMods(id).range !== 1
        || farmGoldMult(id) !== 1
        || farmPrayerDrainMult(id) !== 1
        || farmLivesOnClear(id) !== 0;
      expect(moved, `${id} does nothing`).toBe(true);
    }
  });
});
