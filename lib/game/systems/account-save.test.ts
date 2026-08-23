import { describe, it, expect } from 'vitest';
import {
  ACCOUNT_SAVE_VERSION,
  EMPTY_DIFFICULTY,
  EMPTY_VICTORIES,
  decodeSaveCode,
  encodeSaveCode,
  sanitizeAccountSave,
  summarizeAccount,
  type AccountSave,
} from './account-save';
import { RUN_SAVE_VERSION } from './run-save';

/** A minimal, valid run save — the account tests only care that it survives the
 *  round trip intact, so it is copied from run-save.test.ts's own fixture. */
function makeRun(over: Record<string, unknown> = {}): Record<string, unknown> {
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
    draftedUnique: [],
    pendingDraft: null,
    pendingRelics: null,
    ownedRelics: [],
    draftRerolls: 0,
    slayer: { task: null, points: 25, streak: 2, helmet: true, lastTaskType: null, masterId: 'turael' },
    prayer: { points: 40, active: [] },
    ...over,
  };
}

function makeAccount(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    version: ACCOUNT_SAVE_VERSION,
    savedAt: 1_700_000_000_000,
    essence: 4200,
    upgrades: { archerRange: 3, magicDamage: 1 },
    killCounts: { goblin: 400, jad: 2 },
    cardCounts: { card_a: 5 },
    bossesSeen: { jad: 2 },
    victories: { total: 3, fastestSeconds: 1800, highestEndlessWave: 112, byMode: { classic: 1, roguelite: 2 } },
    difficulty: { highestCleared: { classic: 1, roguelite: -1 }, records: { 'classic:1': { fastestSeconds: 1800, highestEndlessWave: 112 } } },
    achievements: ['ca_first_blood', 'ca_jad'],
    run: makeRun(),
    ...over,
  };
}

describe('sanitizeAccountSave', () => {
  it('round-trips a full account, run included', () => {
    const save = sanitizeAccountSave(makeAccount());
    expect(save).not.toBeNull();
    expect(save!.essence).toBe(4200);
    expect(save!.killCounts.goblin).toBe(400);
    expect(save!.victories.byMode.roguelite).toBe(2);
    expect(save!.difficulty.highestCleared.classic).toBe(1);
    expect(save!.achievements).toEqual(['ca_first_blood', 'ca_jad']);
    expect(save!.run?.wave).toBe(7);
  });

  it('rejects a blob that is not an account of this version', () => {
    expect(sanitizeAccountSave(null)).toBeNull();
    expect(sanitizeAccountSave('nope')).toBeNull();
    expect(sanitizeAccountSave([])).toBeNull();
    expect(sanitizeAccountSave(makeAccount({ version: ACCOUNT_SAVE_VERSION + 1 }))).toBeNull();
  });

  it('drops a run from an older format without touching the account', () => {
    const save = sanitizeAccountSave(makeAccount({ run: makeRun({ version: RUN_SAVE_VERSION - 1 }) }));
    expect(save).not.toBeNull();
    expect(save!.run).toBeNull();
    expect(save!.essence).toBe(4200);
  });

  it('coerces odd fields instead of refusing the account', () => {
    const save = sanitizeAccountSave(makeAccount({
      essence: -50,
      upgrades: { archerRange: 'three', magicDamage: 2 },
      killCounts: 'corrupt',
      victories: undefined,
      difficulty: undefined,
      achievements: ['ok', 7, null],
    }));
    expect(save).not.toBeNull();
    expect(save!.essence).toBe(0);
    expect(save!.upgrades).toEqual({ magicDamage: 2 });
    expect(save!.killCounts).toEqual({});
    expect(save!.victories).toEqual(EMPTY_VICTORIES);
    expect(save!.difficulty).toEqual(EMPTY_DIFFICULTY);
    expect(save!.achievements).toEqual(['ok']);
  });

  it('keeps "nothing cleared yet" as -1 rather than flooring it to Normal', () => {
    const save = sanitizeAccountSave(makeAccount({ difficulty: { highestCleared: {}, records: {} } }));
    expect(save!.difficulty.highestCleared).toEqual({ classic: -1, roguelite: -1 });
  });
});

describe('save codes', () => {
  const account = sanitizeAccountSave(makeAccount()) as AccountSave;

  it('survives a trip through a save code', () => {
    const result = decodeSaveCode(encodeSaveCode(account));
    expect(result.ok).toBe(true);
    expect(result.ok && result.save).toEqual(account);
  });

  it('survives being wrapped over lines by a chat client', () => {
    const code = encodeSaveCode(account);
    const wrapped = `  ${code.slice(0, 40)}\n${code.slice(40)}  `;
    const result = decodeSaveCode(wrapped);
    expect(result.ok).toBe(true);
    expect(result.ok && result.save.essence).toBe(4200);
  });

  it('carries non-ASCII through intact', () => {
    const withAccents = sanitizeAccountSave(makeAccount({ achievements: ['ça_vá', '☠'] })) as AccountSave;
    const result = decodeSaveCode(encodeSaveCode(withAccents));
    expect(result.ok && result.save.achievements).toEqual(['ça_vá', '☠']);
  });

  it('refuses a truncated code rather than importing half an account', () => {
    const code = encodeSaveCode(account);
    // Cut short enough to lose the checksum segment entirely — the shape a paste
    // that scrolled actually arrives in.
    const cut = decodeSaveCode(code.slice(0, code.length - 20));
    expect(cut).toMatchObject({ ok: false, error: expect.stringMatching(/incomplete/) });
    // And cut out of the middle, where the checksum is what catches it.
    const gutted = decodeSaveCode(`${code.slice(0, code.length - 20)}${code.slice(-9)}`);
    expect(gutted).toMatchObject({ ok: false, error: expect.stringMatching(/incomplete/) });
  });

  it('tells a code from another version apart from plain junk', () => {
    const other = encodeSaveCode(account).replace(/^OSRSTD\d+/, 'OSRSTD99');
    expect(!decodeSaveCode(other).ok && decodeSaveCode(other)).toMatchObject({ error: expect.stringMatching(/different version/) });
    expect(decodeSaveCode('hello world')).toMatchObject({ ok: false, error: expect.stringMatching(/save code/) });
    expect(decodeSaveCode('')).toMatchObject({ ok: false });
  });

  it('refuses a code whose payload is not an account', () => {
    // A body that decodes cleanly but carries the wrong thing — checksum recomputed
    // so it fails on content, not on transport.
    const bad = encodeSaveCode({ version: 999 } as unknown as AccountSave);
    expect(decodeSaveCode(bad)).toMatchObject({ ok: false, error: expect.stringMatching(/no progress/) });
  });
});

describe('summarizeAccount', () => {
  it('totals the log and reports the run travelling with it', () => {
    const account = sanitizeAccountSave(makeAccount()) as AccountSave;
    expect(summarizeAccount(account)).toEqual({
      essence: 4200,
      kills: 402,
      victories: 3,
      achievements: 2,
      bestTier: 1,
      runWave: 7,
    });
  });

  it('reports no run when the code carries none', () => {
    const account = sanitizeAccountSave(makeAccount({ run: null })) as AccountSave;
    expect(summarizeAccount(account).runWave).toBeNull();
  });
});
