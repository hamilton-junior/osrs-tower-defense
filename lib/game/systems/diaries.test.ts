import { describe, it, expect } from 'vitest';
import { DIARIES } from '../data/diaries';
import {
  DIARY_TIERS,
  diaryProgress,
  diaryTaskById,
  diaryTierReached,
  evaluateDiaries,
  mergeRegions,
  type Diary,
} from './diaries';
import { emptyRunStats, regionTally, type RunStats } from './combat-achievements';
import type { BiomeId } from '../data/biomes';

const karamja = DIARIES.find((d) => d.id === 'karamja') as Diary;
const lumbridge = DIARIES.find((d) => d.id === 'lumbridge') as Diary;

/** A run that has been in `biome` and done the listed things there. */
function inRegion(biome: BiomeId, fill: (r: ReturnType<typeof regionTally>) => void): RunStats {
  const s = emptyRunStats('classic', 0);
  fill(regionTally(s, biome));
  return s;
}

describe('the table itself', () => {
  it('gives every task a unique id', () => {
    const ids = DIARIES.flatMap((d) => d.tasks.map((t) => t.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('prefixes every task with its own diary, so an id says where it belongs', () => {
    for (const diary of DIARIES) {
      for (const task of diary.tasks) expect(task.id.startsWith(`${diary.id}-`)).toBe(true);
    }
  });

  it('fills all four tiers of every diary', () => {
    for (const diary of DIARIES) {
      for (const tier of DIARY_TIERS) {
        expect(diary.tasks.filter((t) => t.tier === tier).length).toBeGreaterThan(0);
      }
    }
  });

  it('finds a task by its persisted id and nothing by a retired one', () => {
    const found = diaryTaskById('lumbridge-cow-herder');
    expect(found?.diary.id).toBe('lumbridge');
    expect(found?.task.tier).toBe('easy');
    expect(diaryTaskById('lumbridge-no-such-task')).toBeUndefined();
  });
});

describe('mergeRegions', () => {
  it('hands back the one region untouched when a diary has only one', () => {
    const s = inRegion('morytania', (r) => { r.kills = 5; });
    expect(mergeRegions(s, ['morytania'])).toBe(s.regions.morytania);
  });

  it('sums the two Karamja regions, bosses as a set', () => {
    const s = emptyRunStats('classic', 0);
    const jungle = regionTally(s, 'karamja');
    jungle.kills = 10;
    jungle.wavesCleared = 4;
    jungle.cleanWaves = 2;
    jungle.killsByType.jogre = 6;
    jungle.bosses.push('jad');
    const caverns = regionTally(s, 'tzhaar');
    caverns.kills = 3;
    caverns.wavesCleared = 1;
    caverns.killsByType.jogre = 1;
    caverns.killsByType.ket_zek = 2;
    caverns.bosses.push('jad', 'hydra');

    const both = mergeRegions(s, ['karamja', 'tzhaar']);
    expect(both.kills).toBe(13);
    expect(both.wavesCleared).toBe(5);
    expect(both.cleanWaves).toBe(2);
    expect(both.killsByType).toEqual({ jogre: 7, ket_zek: 2 });
    expect(both.bosses).toEqual(['jad', 'hydra']);
  });

  it('never writes into the regions it read', () => {
    const s = inRegion('karamja', (r) => { r.kills = 10; });
    mergeRegions(s, ['karamja', 'tzhaar']);
    expect(s.regions.karamja!.kills).toBe(10);
    expect(s.regions.tzhaar).toBeUndefined();
  });
});

describe('evaluateDiaries', () => {
  it('returns the tasks the run has just satisfied', () => {
    const s = inRegion('lumbridge', (r) => { r.wavesCleared = 3; });
    expect(evaluateDiaries(s, new Set())).toContain('lumbridge-home-ground');
  });

  it('skips a task that is already completed', () => {
    const s = inRegion('lumbridge', (r) => { r.wavesCleared = 3; });
    const done = new Set(['lumbridge-home-ground']);
    expect(evaluateDiaries(s, done)).not.toContain('lumbridge-home-ground');
  });

  it('never mutates the completed set it is given', () => {
    const s = inRegion('lumbridge', (r) => { r.wavesCleared = 3; });
    const done = new Set<string>();
    evaluateDiaries(s, done);
    expect(done.size).toBe(0);
  });

  it('gives a fresh run nothing', () => {
    expect(evaluateDiaries(emptyRunStats('classic', 0), new Set())).toEqual([]);
  });

  it('credits a Karamja task to the jungle and a TzHaar task to the caverns', () => {
    const jungleOnly = inRegion('karamja', (r) => { r.wavesCleared = 3; });
    const gained = evaluateDiaries(jungleOnly, new Set());
    expect(gained).toContain('karamja-jungle-trek');
    // The caverns task reads its own region, so the jungle cannot satisfy it.
    expect(gained).not.toContain('karamja-into-the-caverns');

    const caverns = inRegion('tzhaar', (r) => { r.wavesCleared = 1; });
    expect(evaluateDiaries(caverns, new Set())).toContain('karamja-into-the-caverns');
  });
});

describe('tier progress and the ladder', () => {
  it('counts each tier separately', () => {
    const done = new Set(['lumbridge-cow-herder']);
    const progress = diaryProgress(lumbridge, done);
    expect(progress.easy.done).toBe(1);
    expect(progress.easy.total).toBe(lumbridge.tasks.filter((t) => t.tier === 'easy').length);
    expect(progress.medium.done).toBe(0);
  });

  it('reaches nothing until a whole tier is done', () => {
    expect(diaryTierReached(lumbridge, new Set())).toBeNull();
    const partEasy = new Set(['lumbridge-cow-herder']);
    expect(diaryTierReached(lumbridge, partEasy)).toBeNull();
  });

  it('stops at the lowest unfinished tier, however much of a higher one is done', () => {
    const easyIds = lumbridge.tasks.filter((t) => t.tier === 'easy').map((t) => t.id);
    const hardIds = lumbridge.tasks.filter((t) => t.tier === 'hard').map((t) => t.id);
    const done = new Set([...easyIds, ...hardIds]);
    expect(diaryTierReached(lumbridge, done)).toBe('easy');
  });

  it('reads elite once every task in the diary is done', () => {
    const all = new Set(karamja.tasks.map((t) => t.id));
    expect(diaryTierReached(karamja, all)).toBe('elite');
  });
});
