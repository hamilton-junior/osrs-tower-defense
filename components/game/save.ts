import { sanitizeRunSave, isResumable, type RunSave } from '@/lib/game/systems/run-save';

/**
 * Everything the interface keeps in localStorage: the key names themselves and
 * the readers that turn each blob back into a value the UI can trust.
 *
 * Every reader is SSR-safe and tolerant of absent or corrupt data — a save
 * written by an older build must never take the game down, it just falls back to
 * the empty record. Moved out of GameRoot.tsx verbatim.
 */

export const SAVE_KEYS = { essence: 'osrs_td_essence', upgrades: 'osrs_td_upgrades', killCounts: 'osrs_td_killcounts', cardCounts: 'osrs_td_cardcounts', bossesSeen: 'osrs_td_bosses_seen', victories: 'osrs_td_victories', run: 'osrs_td_run', difficulty: 'osrs_td_difficulty', achievements: 'osrs_td_achievements' } as const;

/** The champion's record — a non-monetary meta reward (no power, no gold), persisted
 *  like the rest of meta-progression. Total wins, best clear time, furthest Endless
 *  wave, and per-mode counts. */
export type Victories = {
  total: number;
  fastestSeconds: number | null;
  highestEndlessWave: number;
  byMode: { classic: number; roguelite: number };
};
export const EMPTY_VICTORIES: Victories = { total: 0, fastestSeconds: null, highestEndlessWave: 0, byMode: { classic: 0, roguelite: 0 } };

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

/** New Game+ progress — a non-monetary meta record kept separate from Victories
 *  so the already-validated Victories store is untouched. Highest tier cleared
 *  per mode (-1 = nothing cleared → only Normal selectable), plus best records. */
export type DifficultyProgress = {
  highestCleared: { classic: number; roguelite: number };
  records: Record<string /* `${mode}:${tier}` */, { fastestSeconds: number | null; highestEndlessWave: number }>;
};
export const EMPTY_DIFFICULTY: DifficultyProgress = {
  highestCleared: { classic: -1, roguelite: -1 },
  records: {},
};

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
export function loadSave(): { essence: number; upgrades: unknown; killCounts: unknown; cardCounts: unknown; bossesSeen: unknown } {
  if (typeof window === 'undefined') return { essence: 0, upgrades: undefined, killCounts: undefined, cardCounts: undefined, bossesSeen: undefined };
  let essence = 0;
  let upgrades: unknown;
  let killCounts: unknown;
  let cardCounts: unknown;
  let bossesSeen: unknown;
  try { essence = parseInt(localStorage.getItem(SAVE_KEYS.essence) ?? '0', 10) || 0; } catch { /* ignore */ }
  try { upgrades = JSON.parse(localStorage.getItem(SAVE_KEYS.upgrades) ?? 'null'); } catch { /* ignore */ }
  try { killCounts = JSON.parse(localStorage.getItem(SAVE_KEYS.killCounts) ?? 'null'); } catch { /* ignore */ }
  try { cardCounts = JSON.parse(localStorage.getItem(SAVE_KEYS.cardCounts) ?? 'null'); } catch { /* ignore */ }
  try { bossesSeen = JSON.parse(localStorage.getItem(SAVE_KEYS.bossesSeen) ?? 'null'); } catch { /* ignore */ }
  return { essence, upgrades, killCounts, cardCounts, bossesSeen };
}
