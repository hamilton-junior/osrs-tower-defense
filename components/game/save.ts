import { sanitizeRunSave, isResumable, type RunSave } from '@/lib/game/systems/run-save';
import { EMPTY_DIFFICULTY, EMPTY_VICTORIES, buildAccountSave, type AccountSave, type DifficultyProgress, type Victories } from '@/lib/game/systems/account-save';

/**
 * Everything the interface keeps in localStorage: the key names themselves, the
 * readers that turn each blob back into a value the UI can trust, and the two
 * whole-account operations a save code needs ({@link readAccountSave} /
 * {@link applyAccountSave}).
 *
 * Every reader is SSR-safe and tolerant of absent or corrupt data — a save
 * written by an older build must never take the game down, it just falls back to
 * the empty record.
 */

// The account record shapes themselves live in `systems/account-save.ts` (they are
// what a save code carries) and are re-exported here so the interface keeps
// importing them from the one storage address it always has.
export { EMPTY_VICTORIES, EMPTY_DIFFICULTY };
export type { Victories, DifficultyProgress };

export const SAVE_KEYS = { essence: 'osrs_td_essence', upgrades: 'osrs_td_upgrades', killCounts: 'osrs_td_killcounts', cardCounts: 'osrs_td_cardcounts', bossesSeen: 'osrs_td_bosses_seen', diversionsMet: 'osrs_td_diversions', fusionsMade: 'osrs_td_fusions', victories: 'osrs_td_victories', run: 'osrs_td_run', difficulty: 'osrs_td_difficulty', achievements: 'osrs_td_achievements' } as const;

export function loadVictories(): Victories {
  if (typeof window === 'undefined') return EMPTY_VICTORIES;
  try {
    const raw = JSON.parse(localStorage.getItem(SAVE_KEYS.victories) ?? 'null');
    if (raw && typeof raw === 'object') {
      return { ...EMPTY_VICTORIES, ...raw, byMode: { ...EMPTY_VICTORIES.byMode, ...(raw.byMode ?? {}) } };
    }
  } catch { /* ignore */ }
  return EMPTY_VICTORIES;
}

export function loadDifficulty(): DifficultyProgress {
  if (typeof window === 'undefined') return EMPTY_DIFFICULTY;
  try {
    const raw = JSON.parse(localStorage.getItem(SAVE_KEYS.difficulty) ?? 'null');
    if (raw && typeof raw === 'object') {
      return {
        ...EMPTY_DIFFICULTY,
        ...raw,
        highestCleared: { ...EMPTY_DIFFICULTY.highestCleared, ...(raw.highestCleared ?? {}) },
        records: { ...(raw.records ?? {}) },
      };
    }
  } catch { /* ignore */ }
  return EMPTY_DIFFICULTY;
}

/** Completed Combat Achievement ids. Unknown ids are kept as-is and simply never
 *  match a task — a retired task must not break the log, and an id the player
 *  earned before it was renamed is not ours to throw away. */
export function loadAchievements(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = JSON.parse(localStorage.getItem(SAVE_KEYS.achievements) ?? 'null');
    if (raw && Array.isArray(raw.completed)) {
      return raw.completed.filter((id: unknown): id is string => typeof id === 'string');
    }
  } catch { /* ignore */ }
  return [];
}

/** Read the saved run in progress, or null when there is none / it is unusable.
 *  `sanitizeRunSave` rejects a save from an older format outright, so a patch that
 *  changes the shape can never resume a run into a broken state. */
export function loadRunSave(): RunSave | null {
  if (typeof window === 'undefined') return null;
  try {
    const save = sanitizeRunSave(JSON.parse(localStorage.getItem(SAVE_KEYS.run) ?? 'null'));
    return save && isResumable(save) ? save : null;
  } catch { return null; }
}

export function clearRunSave() {
  try { localStorage.removeItem(SAVE_KEYS.run); } catch { /* ignore */ }
}

/** "2 hours ago" — how stale the saved run on the Continue button is. */
export function agoLabel(ms: number): string {
  const secs = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (secs < 90) return 'just now';
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

/** Read the persisted account save (meta-progression + Collection Log) from
 *  localStorage, tolerating absent/corrupt data — the engine re-clamps it. */
export function loadSave(): { essence: number; upgrades: unknown; killCounts: unknown; cardCounts: unknown; bossesSeen: unknown; diversionsMet: unknown; fusionsMade: unknown } {
  if (typeof window === 'undefined') return { essence: 0, upgrades: undefined, killCounts: undefined, cardCounts: undefined, bossesSeen: undefined, diversionsMet: undefined, fusionsMade: undefined };
  let essence = 0;
  let upgrades: unknown;
  let killCounts: unknown;
  let cardCounts: unknown;
  let bossesSeen: unknown;
  let diversionsMet: unknown;
  let fusionsMade: unknown;
  try { essence = parseInt(localStorage.getItem(SAVE_KEYS.essence) ?? '0', 10) || 0; } catch { /* ignore */ }
  try { upgrades = JSON.parse(localStorage.getItem(SAVE_KEYS.upgrades) ?? 'null'); } catch { /* ignore */ }
  try { killCounts = JSON.parse(localStorage.getItem(SAVE_KEYS.killCounts) ?? 'null'); } catch { /* ignore */ }
  try { cardCounts = JSON.parse(localStorage.getItem(SAVE_KEYS.cardCounts) ?? 'null'); } catch { /* ignore */ }
  try { bossesSeen = JSON.parse(localStorage.getItem(SAVE_KEYS.bossesSeen) ?? 'null'); } catch { /* ignore */ }
  try { diversionsMet = JSON.parse(localStorage.getItem(SAVE_KEYS.diversionsMet) ?? 'null'); } catch { /* ignore */ }
  try { fusionsMade = JSON.parse(localStorage.getItem(SAVE_KEYS.fusionsMade) ?? 'null'); } catch { /* ignore */ }
  return { essence, upgrades, killCounts, cardCounts, bossesSeen, diversionsMet, fusionsMade };
}

/**
 * Gather every account key into one {@link AccountSave} — what an exported save code
 * carries. The run in progress rides along (via {@link loadRunSave}, so a wave-1
 * board with nothing on it is left behind rather than travelling as "progress").
 */
export function readAccountSave(): AccountSave {
  const meta = loadSave();
  return buildAccountSave({
    savedAt: Date.now(),
    essence: meta.essence,
    upgrades: meta.upgrades,
    killCounts: meta.killCounts,
    cardCounts: meta.cardCounts,
    bossesSeen: meta.bossesSeen,
    diversionsMet: meta.diversionsMet,
    fusionsMade: meta.fusionsMade,
    victories: loadVictories(),
    difficulty: loadDifficulty(),
    achievements: loadAchievements(),
    run: loadRunSave(),
  });
}

/**
 * Write an imported account over every key, replacing what was there. This is the
 * destructive half of the feature and it is deliberately total: a half-applied
 * account (new essence, old Collection Log) is a state no code path expects, so a
 * save without a run **clears** the stored run rather than leaving the old one to be
 * resumed under someone else's progress.
 *
 * The caller reloads afterwards. The engine reads meta once on mount, so writing the
 * keys under a live engine would leave the interface showing the old account until
 * something happened to re-emit it.
 */
export function applyAccountSave(save: AccountSave) {
  try {
    localStorage.setItem(SAVE_KEYS.essence, String(save.essence));
    localStorage.setItem(SAVE_KEYS.upgrades, JSON.stringify(save.upgrades));
    localStorage.setItem(SAVE_KEYS.killCounts, JSON.stringify(save.killCounts));
    localStorage.setItem(SAVE_KEYS.cardCounts, JSON.stringify(save.cardCounts));
    localStorage.setItem(SAVE_KEYS.bossesSeen, JSON.stringify(save.bossesSeen));
    localStorage.setItem(SAVE_KEYS.diversionsMet, JSON.stringify(save.diversionsMet));
    localStorage.setItem(SAVE_KEYS.fusionsMade, JSON.stringify(save.fusionsMade));
    localStorage.setItem(SAVE_KEYS.victories, JSON.stringify(save.victories));
    localStorage.setItem(SAVE_KEYS.difficulty, JSON.stringify(save.difficulty));
    localStorage.setItem(SAVE_KEYS.achievements, JSON.stringify({ completed: save.achievements }));
    if (save.run) localStorage.setItem(SAVE_KEYS.run, JSON.stringify(save.run));
    else localStorage.removeItem(SAVE_KEYS.run);
  } catch { /* quota / private mode — the reload below simply shows the old account */ }
}
