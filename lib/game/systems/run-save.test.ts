import { describe, it, expect } from 'vitest';
import { sanitizeRunSave, isResumable, RUN_SAVE_VERSION, type RunSave } from './run-save';

/** A minimal, valid save — the tests below bend one field at a time from this. */
function makeSave(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    version: RUN_SAVE_VERSION,
    savedAt: 1_700_000_000_000,
    mapSeed: 12345,
    gameMode: 'roguelite',
    wave: 7,
    money: 900,
    lives: 8,
    maxLives: 10,
    kills: 120,
    goldEarned: 4200,
    towersBuilt: 5,
    essenceEarnedThisRun: 30,
    gameTime: 412.5,
    towers: [{ id: 't1', type: 'archer', x: 100, y: 200, level: 3 }],
    runMods: { damage: { melee: 1.2, ranged: 1, magic: 1 }, range: { melee: 1, ranged: 1, magic: 1 }, fireRate: { melee: 1, ranged: 1, magic: 1 } },
    runFx: { goldMult: 1.3 },
    relicFx: { executeFrac: 0.1 },
    runCards: [{ id: 'card_a', count: 2 }],
    draftedUnique: ['card_u'],
    pendingDraft: ['card_a', 'card_b'],
    pendingRelics: null,
    ownedRelics: ['relic_a'],
    draftRerolls: 1,
    slayer: { task: { type: 'goblin', count: 3, total: 10, reward: 500 }, points: 25, streak: 2, helmet: true, lastTaskType: 'rat', masterId: 'turael' },
    prayer: { points: 40, active: ['piety'] },
    ...over,
  };
}

describe('sanitizeRunSave', () => {
  it('round-trips a valid save', () => {
    const save = sanitizeRunSave(makeSave());
    expect(save).not.toBeNull();
    expect(save!.wave).toBe(7);
    expect(save!.towers).toHaveLength(1);
    expect(save!.pendingDraft).toEqual(['card_a', 'card_b']);
    expect(save!.slayer.task?.type).toBe('goblin');
    expect(save!.prayer.active).toEqual(['piety']);
  });

  it('rejects a save from another format version', () => {
    expect(sanitizeRunSave(makeSave({ version: RUN_SAVE_VERSION + 1 }))).toBeNull();
    expect(sanitizeRunSave(makeSave({ version: undefined }))).toBeNull();
  });

  it('rejects junk instead of trying to resume it', () => {
    expect(sanitizeRunSave(null)).toBeNull();
    expect(sanitizeRunSave('a string')).toBeNull();
    expect(sanitizeRunSave([])).toBeNull();
  });

  it('rejects a save with no towers array or no mod buckets — the run could not be rebuilt', () => {
    expect(sanitizeRunSave(makeSave({ towers: undefined }))).toBeNull();
    expect(sanitizeRunSave(makeSave({ runFx: undefined }))).toBeNull();
    expect(sanitizeRunSave(makeSave({ runMods: 'nope' }))).toBeNull();
  });

  it('drops malformed towers but keeps the run', () => {
    const save = sanitizeRunSave(makeSave({
      towers: [{ id: 't1', type: 'archer', x: 10, y: 10 }, { id: 'broken' }, null, { type: 'wizard', x: 1, y: 1 }],
    }));
    expect(save!.towers).toHaveLength(1);
  });

  it('never resumes into an instant game over', () => {
    expect(sanitizeRunSave(makeSave({ lives: 0 }))!.lives).toBe(1);
    expect(sanitizeRunSave(makeSave({ lives: -5 }))!.lives).toBe(1);
    // Lives can't exceed the cap the run had.
    expect(sanitizeRunSave(makeSave({ lives: 99, maxLives: 10 }))!.lives).toBe(10);
  });

  it('coerces nonsense numbers to sane ones rather than discarding the run', () => {
    const save = sanitizeRunSave(makeSave({ wave: 0, money: -100, gameTime: NaN, kills: 'lots' }))!;
    expect(save.wave).toBe(1);
    expect(save.money).toBe(0);
    expect(save.gameTime).toBe(0);
    expect(save.kills).toBe(0);
  });

  it('defaults an unknown game mode to roguelite', () => {
    expect(sanitizeRunSave(makeSave({ gameMode: 'sandbox' }))!.gameMode).toBe('roguelite');
    expect(sanitizeRunSave(makeSave({ gameMode: 'classic' }))!.gameMode).toBe('classic');
  });

  it('keeps only string ids in the card / relic lists', () => {
    const save = sanitizeRunSave(makeSave({
      ownedRelics: ['relic_a', 3, null],
      draftedUnique: ['u', {}],
      runCards: [{ id: 'c', count: 0 }, { count: 2 }],
    }))!;
    expect(save.ownedRelics).toEqual(['relic_a']);
    expect(save.draftedUnique).toEqual(['u']);
    expect(save.runCards).toEqual([{ id: 'c', count: 1 }]); // a 0-count stack is 1 card
  });

  it('treats a missing slayer / prayer block as "none"', () => {
    const save = sanitizeRunSave(makeSave({ slayer: undefined, prayer: undefined }))!;
    expect(save.slayer.task).toBeNull();
    expect(save.slayer.points).toBe(0);
    expect(save.prayer.active).toEqual([]);
  });
});

describe('isResumable', () => {
  const base = sanitizeRunSave(makeSave()) as RunSave;

  it('offers back a run that has progress', () => {
    expect(isResumable(base)).toBe(true);
    expect(isResumable({ ...base, wave: 1 })).toBe(true); // wave 1, but towers are up
  });

  it('does not offer back an untouched wave-1 board — that is the title screen', () => {
    expect(isResumable({ ...base, wave: 1, towers: [] })).toBe(false);
  });
});
