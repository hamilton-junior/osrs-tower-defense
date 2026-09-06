import { describe, it, expect } from 'vitest';
import { sanitizeRunSave, isResumable, RUN_SAVE_VERSION, type RunSave } from './run-save';
import { GEAR } from '../data/gear';
import { emptyRunStats } from './combat-achievements';

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

  it('resumes a pre-wall-clock save at 0 rather than inheriting its simulated time', () => {
    // The run timer used to be `gameTime` (simulated seconds), which runs ahead of
    // the clock whenever a run is sped up. A save written back then has no
    // `realTime`, and must NOT fall back to gameTime — a 5x run would resume
    // claiming five times the hours it took.
    const old = makeSave({ gameTime: 3600 });
    delete (old as Record<string, unknown>).realTime;
    const save = sanitizeRunSave(old)!;
    expect(save.realTime).toBe(0);
    expect(save.gameTime).toBe(3600); // the cooldown clock still travels intact
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

  // A save stores gear as the whole item object, so a piece the game has since
  // rebalanced — or handed a new signature effect — would come back frozen in the
  // shape it had, quietly doing the old thing forever. Anything the pool still knows
  // by id is re-read from it on load.
  it('re-reads a lootBag piece from the live pool rather than the stored copy', () => {
    const stale = { id: 'rune_arrow', name: 'Rune arrow', description: '', bonus: { damage: 10 }, type: 'ammo' };
    const save = sanitizeRunSave(makeSave({ lootBag: [stale] }))!;
    expect(save.lootBag).toEqual([GEAR.rune_arrow]);
  });

  it('re-reads equipped gear on a saved tower too', () => {
    const stale = { id: 'amulet_of_glory', name: 'Amulet of glory', description: '', bonus: { damage: 1 }, type: 'jewellery' };
    const towers = [{ id: 't1', type: 'archer', x: 100, y: 100, equipment: { ammo: null, jewellery: stale } }];
    const save = sanitizeRunSave(makeSave({ towers }))!;
    expect(save.towers[0].equipment.jewellery).toEqual(GEAR.amulet_of_glory);
    expect(save.towers[0].equipment.ammo).toBeNull();
  });

  it('hands back a piece the pool no longer knows instead of emptying the slot', () => {
    const retired = { id: 'gone_from_the_game', name: 'Old amulet', description: '', bonus: { damage: 10 }, type: 'jewellery' };
    const save = sanitizeRunSave(makeSave({ lootBag: [retired] }))!;
    expect(save.lootBag).toEqual([retired]);
  });

  it('drops a bag entry whose slot this build no longer wears', () => {
    // An early-gear save could hold a 'weapon'; there is no weapon slot now, and
    // an unfiltered entry would be treated as jewellery.
    const legacy = { id: 'twisted_bow', name: 'Twisted bow', description: '', bonus: { damage: 10 }, type: 'weapon' };
    const save = sanitizeRunSave(makeSave({ lootBag: [legacy] }))!;
    expect(save.lootBag).toEqual([]);
  });

  it('defaults a missing lootBag to empty — saves written before gear existed', () => {
    const save = sanitizeRunSave(makeSave({ lootBag: undefined }))!;
    expect(save.lootBag).toEqual([]);
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

function validRaw(over: Record<string, unknown> = {}) {
  return {
    version: RUN_SAVE_VERSION,
    towers: [{ id: 't1', type: 'archer', x: 10, y: 10 }],
    runMods: {}, runFx: {}, relicFx: {},
    gameMode: 'classic', wave: 5, money: 100, maxLives: 20, lives: 20,
    ...over,
  };
}

describe('run-save — difficultyTier', () => {
  it('round-trips a valid difficultyTier', () => {
    const save = sanitizeRunSave(validRaw({ difficultyTier: 3 }));
    expect(save?.difficultyTier).toBe(3);
  });

  it('defaults a missing difficultyTier to 0 (old save = Normal)', () => {
    const save = sanitizeRunSave(validRaw({}));
    expect(save?.difficultyTier).toBe(0);
  });

  it('clamps an out-of-range difficultyTier', () => {
    expect(sanitizeRunSave(validRaw({ difficultyTier: 99 }))?.difficultyTier).toBe(6);
    expect(sanitizeRunSave(validRaw({ difficultyTier: -4 }))?.difficultyTier).toBe(0);
  });
});

describe('caStats', () => {
  it('survives a round trip', () => {
    const save = makeSave();
    save.caStats = { ...emptyRunStats('classic', 0), maxWaveReached: 42 };
    const back = sanitizeRunSave(JSON.parse(JSON.stringify(save)));
    expect(back?.caStats?.maxWaveReached).toBe(42);
  });

  it('accepts a save with no caStats at all', () => {
    const save = makeSave();
    delete (save as { caStats?: unknown }).caStats;
    const back = sanitizeRunSave(JSON.parse(JSON.stringify(save)));
    expect(back).not.toBeNull();
    expect(back?.caStats).toBeUndefined();
  });

  it('sits at 5 — the potion table renamed its ids, so v4 saves are refused', () => {
    expect(RUN_SAVE_VERSION).toBe(5);
  });
});

describe('the allotments', () => {
  it('round-trips what is growing and the herbs riding the wave', () => {
    const save = makeSave({
      farmPatches: [{ id: 'p3_4', seedId: 'guam', grown: 2 }],
      farmBuffs: ['ranarr', 'guam'],
    });
    const back = sanitizeRunSave(JSON.parse(JSON.stringify(save)));
    expect(back?.farmPatches).toEqual([{ id: 'p3_4', seedId: 'guam', grown: 2 }]);
    expect(back?.farmBuffs).toEqual(['ranarr', 'guam']);
  });

  // Herbs used to be a single slot. A run put down before they stacked has to come
  // back holding that one herb, not an empty list.
  it('reads a herb saved as the one slot it used to be', () => {
    const back = sanitizeRunSave(JSON.parse(JSON.stringify(makeSave({ farmBuff: 'ranarr' }))));
    expect(back?.farmBuffs).toEqual(['ranarr']);
  });

  it('drops a herb this build no longer grows, and never lists one twice', () => {
    const back = sanitizeRunSave(JSON.parse(JSON.stringify(
      makeSave({ farmBuffs: ['guam', 'nettle', 'guam'] }),
    )));
    expect(back?.farmBuffs).toEqual(['guam']);
  });

  // Patches used to store the wave they were sown on. The save carries the wave it
  // was taken at, so the waves that went by are still known — an in-progress run
  // survives the change instead of the version refusing it.
  it('converts a patch saved as the wave it was sown on', () => {
    const save = makeSave({ wave: 7, farmPatches: [{ id: 'p3_4', seedId: 'guam', sownAtWave: 5 }] });
    const back = sanitizeRunSave(JSON.parse(JSON.stringify(save)));
    expect(back?.farmPatches).toEqual([{ id: 'p3_4', seedId: 'guam', grown: 2 }]);
  });

  it('keeps an old herb only while it was still the live one', () => {
    const live = sanitizeRunSave(JSON.parse(JSON.stringify(
      makeSave({ wave: 7, farmBuff: { seedId: 'guam', wave: 7 } }),
    )));
    const spent = sanitizeRunSave(JSON.parse(JSON.stringify(
      makeSave({ wave: 7, farmBuff: { seedId: 'guam', wave: 6 } }),
    )));
    expect(live?.farmBuffs).toEqual(['guam']);
    expect(spent?.farmBuffs).toEqual([]);
  });

  it('drops a seed this build no longer grows, rather than the save', () => {
    const save = makeSave({ farmPatches: [{ id: 'p3_4', seedId: 'nettle', grown: 1 }] });
    const back = sanitizeRunSave(JSON.parse(JSON.stringify(save)));
    expect(back).not.toBeNull();
    expect(back?.farmPatches).toEqual([]);
  });

  // A plot's id *is* its tile, so the ground the player moved and bought their way
  // into is these two fields and nothing else.
  it('round-trips where the plots stand and how many were bought', () => {
    const save = makeSave({ plots: ['p3_4', 'p10_2'], plotsBought: 2 });
    const back = sanitizeRunSave(JSON.parse(JSON.stringify(save)));
    expect(back?.plots).toEqual(['p3_4', 'p10_2']);
    expect(back?.plotsBought).toBe(2);
  });

  // Saves written before plots could move have neither field, and resume on the
  // ground their map dealt them — which is why nothing needed a version bump.
  it('resumes a save from before plots could move', () => {
    const back = sanitizeRunSave(JSON.parse(JSON.stringify(makeSave())));
    expect(back).not.toBeNull();
    expect(back?.plots).toEqual([]);
    expect(back?.plotsBought).toBe(0);
  });

  it('throws out anything in the list that is not a tile, and any repeat of one', () => {
    const save = makeSave({ plots: ['p3_4', 'p3_4', 'nope', 7, 'p-1_2', null] });
    const back = sanitizeRunSave(JSON.parse(JSON.stringify(save)));
    expect(back?.plots).toEqual(['p3_4']);
  });

  it('reads a nonsense purchase count as none bought', () => {
    expect(sanitizeRunSave(JSON.parse(JSON.stringify(
      makeSave({ plotsBought: -4 }),
    )))?.plotsBought).toBe(0);
    expect(sanitizeRunSave(JSON.parse(JSON.stringify(
      makeSave({ plotsBought: 'lots' }),
    )))?.plotsBought).toBe(0);
  });
});

describe('the run\'s boss ladder', () => {
  it('round-trips the bosses killed this run', () => {
    const save = makeSave({ bossesKilled: { scurrius: 1, vorkath: 2 } });
    const back = sanitizeRunSave(JSON.parse(JSON.stringify(save)));
    expect(back?.bossesKilled).toEqual({ scurrius: 1, vorkath: 2 });
  });

  it('resumes an older save with an empty ladder rather than refusing it', () => {
    const save = makeSave();
    delete (save as { bossesKilled?: unknown }).bossesKilled;
    const back = sanitizeRunSave(JSON.parse(JSON.stringify(save)));
    expect(back).not.toBeNull();
    expect(back?.bossesKilled).toEqual({});
  });

  it('drops junk tallies instead of carrying them into the march', () => {
    const save = makeSave({ bossesKilled: { scurrius: 1, vorkath: 0, zulrah: 'lots', hydra: NaN } });
    const back = sanitizeRunSave(JSON.parse(JSON.stringify(save)));
    expect(back?.bossesKilled).toEqual({ scurrius: 1 });
  });

  it('round-trips the victory latch and the Endless phase', () => {
    const save = makeSave({ won: true, runPhase: 'endless', victoryWave: 92 });
    const back = sanitizeRunSave(JSON.parse(JSON.stringify(save)));
    expect(back?.won).toBe(true);
    expect(back?.runPhase).toBe('endless');
    expect(back?.victoryWave).toBe(92);
  });

  it('never resumes into Endless on a run that was not won', () => {
    const save = makeSave({ runPhase: 'endless' });
    const back = sanitizeRunSave(JSON.parse(JSON.stringify(save)));
    expect(back?.won).toBe(false);
    expect(back?.runPhase).toBe('normal');
  });

  it('sits at 5 — these fields are optional; the bump came from the potion table', () => {
    expect(RUN_SAVE_VERSION).toBe(5);
  });
});
