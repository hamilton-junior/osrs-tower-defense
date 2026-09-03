import { sanitizeRunSave, type RunSave } from './run-save';

/**
 * The **account** save: everything a player would lose by clearing their browser,
 * and everything they need to carry to a second machine.
 *
 * The game has no backend and none is planned, so "your account" is a string. This
 * module owns three things:
 *
 *  - the shapes of the account records themselves ({@link Victories},
 *    {@link DifficultyProgress}) — `components/game/save.ts` re-exports them, so the
 *    interface still imports them from one address;
 *  - {@link sanitizeAccountSave}, the same trust model as `run-save.ts`: a blob that
 *    came off a stranger's clipboard is validated field by field, and anything merely
 *    *odd* is coerced rather than rejected;
 *  - {@link encodeSaveCode} / {@link decodeSaveCode}, the transport — a checksummed
 *    text code, so a paste that lost its last line fails out loud instead of quietly
 *    importing half an account.
 *
 * Nothing here touches `localStorage`; gathering and applying live in
 * `components/game/save.ts`, which is the browser-storage layer.
 */

/** The champion's record — a non-monetary meta reward (no power, no gold). Total
 *  wins, best clear time, furthest Endless wave, and per-mode counts. */
export type Victories = {
  total: number;
  fastestSeconds: number | null;
  highestEndlessWave: number;
  byMode: { classic: number; roguelite: number };
};
export const EMPTY_VICTORIES: Victories = { total: 0, fastestSeconds: null, highestEndlessWave: 0, byMode: { classic: 0, roguelite: 0 } };

/** New Game+ progress, kept separate from {@link Victories} so the already-validated
 *  Victories store is untouched. Highest tier cleared per mode (-1 = nothing cleared
 *  → only Normal selectable), plus best records per mode+tier. */
export type DifficultyProgress = {
  highestCleared: { classic: number; roguelite: number };
  records: Record<string /* `${mode}:${tier}` */, { fastestSeconds: number | null; highestEndlessWave: number }>;
};
export const EMPTY_DIFFICULTY: DifficultyProgress = {
  highestCleared: { classic: -1, roguelite: -1 },
  records: {},
};

/**
 * One account, whole. The four tallies are stored as plain `{ id: count }` records
 * because that is what they are on disk and the engine re-clamps every one of them
 * against the live content tables on load — an id retired by a patch costs its own
 * entry and nothing else.
 */
export interface AccountSave {
  version: number;
  /** Epoch ms the code was written — shown when confirming an import. */
  savedAt: number;
  essence: number;
  upgrades: Record<string, number>;
  killCounts: Record<string, number>;
  cardCounts: Record<string, number>;
  bossesSeen: Record<string, number>;
  /** Lifetime meetings per Distraction & Diversion id. Added after the format was
   *  first shipped, so an older code simply carries none — a missing tally is an
   *  empty log, which is exactly what it means. */
  diversionsMet: Record<string, number>;
  /** Lifetime forges per fusion type. Added after the format was first shipped,
   *  so an older code carries none — which reads as "nothing forged yet". */
  fusionsMade: Record<string, number>;
  victories: Victories;
  difficulty: DifficultyProgress;
  achievements: string[];
  /** The run in progress, so a player can move machines mid-run. Null when there
   *  is none, and null again if the code carries a run from an older format —
   *  `sanitizeRunSave` rejects those outright, and losing one run is a far smaller
   *  loss than losing the account it travelled with. */
  run: RunSave | null;
}

/** Bump when a field's meaning changes. It rides in the code's own prefix
 *  (`OSRSTD<version>.`), so an older build refuses a newer code by name rather than
 *  parsing it into something it doesn't understand. */
export const ACCOUNT_SAVE_VERSION = 1;

const CODE_PREFIX = `OSRSTD${ACCOUNT_SAVE_VERSION}`;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const whole = (v: unknown): number => Math.max(0, Math.floor(num(v, 0)));
/** A nullable duration read back from a code — `null` means "no record set". */
const seconds = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null);

/** A `{ id: count }` tally. Keeps only positive whole counts, so one corrupted
 *  entry costs its own line rather than the whole log. */
const tally = (v: unknown): Record<string, number> => {
  if (!isObj(v)) return {};
  const out: Record<string, number> = {};
  for (const [k, n] of Object.entries(v)) {
    if (typeof n === 'number' && Number.isFinite(n) && n >= 1) out[k] = Math.floor(n);
  }
  return out;
};

function sanitizeVictories(raw: unknown): Victories {
  if (!isObj(raw)) return EMPTY_VICTORIES;
  const byMode = isObj(raw.byMode) ? raw.byMode : {};
  return {
    total: whole(raw.total),
    fastestSeconds: seconds(raw.fastestSeconds),
    highestEndlessWave: whole(raw.highestEndlessWave),
    byMode: { classic: whole(byMode.classic), roguelite: whole(byMode.roguelite) },
  };
}

function sanitizeDifficulty(raw: unknown): DifficultyProgress {
  if (!isObj(raw)) return EMPTY_DIFFICULTY;
  const cleared = isObj(raw.highestCleared) ? raw.highestCleared : {};
  const records: DifficultyProgress['records'] = {};
  if (isObj(raw.records)) {
    for (const [k, r] of Object.entries(raw.records)) {
      if (!isObj(r)) continue;
      records[k] = { fastestSeconds: seconds(r.fastestSeconds), highestEndlessWave: whole(r.highestEndlessWave) };
    }
  }
  // -1 is the floor, not 0: it means "nothing cleared yet", which is a real state.
  const tier = (v: unknown) => Math.max(-1, Math.floor(num(v, -1)));
  return { highestCleared: { classic: tier(cleared.classic), roguelite: tier(cleared.roguelite) }, records };
}

/** The loose pieces an account is assembled from — every field `unknown` because
 *  both callers hand over untrusted data: one reads it off `localStorage`, the other
 *  off a save code. */
export interface AccountParts {
  savedAt?: unknown;
  essence?: unknown;
  upgrades?: unknown;
  killCounts?: unknown;
  cardCounts?: unknown;
  bossesSeen?: unknown;
  diversionsMet?: unknown;
  fusionsMade?: unknown;
  victories?: unknown;
  difficulty?: unknown;
  achievements?: unknown;
  run?: unknown;
}

/**
 * Coerce loose pieces into an account. Nothing here can fail: every field falls back
 * to its empty value, because the pieces are the player's own progress and the cost
 * of being strict is deleting it. The test is "can the game run on this", not "is
 * every byte pristine".
 */
export function buildAccountSave(parts: AccountParts): AccountSave {
  const raw = parts;
  return {
    version: ACCOUNT_SAVE_VERSION,
    savedAt: num(raw.savedAt, Date.now()),
    essence: whole(raw.essence),
    upgrades: tally(raw.upgrades),
    killCounts: tally(raw.killCounts),
    cardCounts: tally(raw.cardCounts),
    bossesSeen: tally(raw.bossesSeen),
    diversionsMet: tally(raw.diversionsMet),
    fusionsMade: tally(raw.fusionsMade),
    victories: sanitizeVictories(raw.victories),
    difficulty: sanitizeDifficulty(raw.difficulty),
    achievements: Array.isArray(raw.achievements) ? raw.achievements.filter((x): x is string => typeof x === 'string') : [],
    run: sanitizeRunSave(raw.run),
  };
}

/**
 * Validate a decoded blob and return it as an {@link AccountSave}, or `null` if it
 * is unusable — not an object, or a version this build doesn't speak. Those two are
 * the only refusals; everything past them is {@link buildAccountSave}'s coercion.
 */
export function sanitizeAccountSave(raw: unknown): AccountSave | null {
  if (!isObj(raw)) return null;
  if (raw.version !== ACCOUNT_SAVE_VERSION) return null;
  return buildAccountSave(raw);
}

/** The handful of figures shown side by side before an import overwrites anything.
 *  Pure, so the confirmation reads the same numbers the code actually carries. */
export interface AccountSummary {
  essence: number;
  kills: number;
  victories: number;
  achievements: number;
  /** Highest New Game+ tier cleared in either mode, or -1 for none. */
  bestTier: number;
  /** Wave of the run travelling with the code, or null when it carries none. */
  runWave: number | null;
}

export function summarizeAccount(save: AccountSave): AccountSummary {
  let kills = 0;
  for (const n of Object.values(save.killCounts)) kills += n;
  return {
    essence: save.essence,
    kills,
    victories: save.victories.total,
    achievements: save.achievements.length,
    bestTier: Math.max(save.difficulty.highestCleared.classic, save.difficulty.highestCleared.roguelite),
    runWave: save.run ? save.run.wave : null,
  };
}

// --- Transport -------------------------------------------------------------
// Hand-rolled base64url rather than btoa/Buffer: btoa only speaks latin1 (an
// achievement id with an accent in it would throw), Buffer doesn't exist in the
// browser, and the pair below is a dozen lines that behave identically in the test
// runner and on a phone.

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

function bytesToB64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const hasB = i + 1 < bytes.length;
    const hasC = i + 2 < bytes.length;
    const n = (bytes[i] << 16) | ((hasB ? bytes[i + 1] : 0) << 8) | (hasC ? bytes[i + 2] : 0);
    out += B64[(n >>> 18) & 63] + B64[(n >>> 12) & 63];
    if (hasB) out += B64[(n >>> 6) & 63];
    if (hasC) out += B64[n & 63];
  }
  return out;
}

function b64ToBytes(s: string): Uint8Array | null {
  const out: number[] = [];
  let buf = 0;
  let bits = 0;
  for (let i = 0; i < s.length; i++) {
    const v = B64.indexOf(s[i]);
    if (v < 0) return null;
    buf = (buf << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((buf >>> bits) & 0xff);
    }
  }
  return new Uint8Array(out);
}

/** FNV-1a, 32-bit. Not a security check — it catches the one failure that actually
 *  happens, a code copied short because the textarea scrolled. */
function checksum(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** `OSRSTD1.<base64url>.<checksum>` — one line, in an alphabet no chat client will
 *  turn into a link or a smart quote. */
export function encodeSaveCode(save: AccountSave): string {
  const body = bytesToB64(new TextEncoder().encode(JSON.stringify(save)));
  return `${CODE_PREFIX}.${body}.${checksum(body)}`;
}

export type DecodeResult = { ok: true; save: AccountSave } | { ok: false; error: string };

/**
 * Read a save code back. Every failure returns a sentence the player can act on,
 * because the two things that actually go wrong — pasting the wrong text, and
 * pasting only part of the right text — need different fixes and look identical
 * otherwise.
 */
export function decodeSaveCode(code: string): DecodeResult {
  const parts = code.trim().replace(/\s+/g, '').split('.');
  // The prefix is checked before the shape on purpose: a paste that lost its tail
  // has lost the checksum segment too, so counting parts first would tell a player
  // who copied a real code short that they pasted the wrong thing entirely.
  const [prefix, body, sum] = parts;
  if (!/^OSRSTD\d+$/.test(prefix)) return { ok: false, error: "That doesn't look like a save code." };
  if (prefix !== CODE_PREFIX) return { ok: false, error: 'That code is from a different version of the game.' };
  if (parts.length !== 3 || checksum(body) !== sum) return { ok: false, error: 'The code is incomplete — copy all of it.' };
  const bytes = b64ToBytes(body);
  if (!bytes) return { ok: false, error: 'The code is damaged and cannot be read.' };
  let raw: unknown;
  try { raw = JSON.parse(new TextDecoder().decode(bytes)); }
  catch { return { ok: false, error: 'The code is damaged and cannot be read.' }; }
  const save = sanitizeAccountSave(raw);
  return save ? { ok: true, save } : { ok: false, error: 'That code carries no progress.' };
}
