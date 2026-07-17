/**
 * Player-facing changelog, loaded at runtime from a static JSON baked out of the
 * git history by `scripts/build-changelog.mjs` (see that file for the why).
 *
 * The game is a static site with no backend, so "what changed" can't be queried
 * live — but the JSON is regenerated on every deploy, so for a static site it is
 * as fresh as the build. Every line was written by us (a commit subject), never by
 * a player, so nothing third-party is ever surfaced here.
 */

export interface ChangelogEntry {
  /** 'new' for a feature, 'fix' for a fix — drives the badge. */
  kind: 'new' | 'fix';
  /** Conventional-commit scope (roguelite, boss, ui, …), or null. */
  scope: string | null;
  /** The change, in a sentence. */
  text: string;
  /** ISO date (YYYY-MM-DD) the change landed. */
  date: string;
  /** Whether a `Feedback:` trailer tied this change to a player report — the
   *  "you asked for this" mark. The report's id is never shipped, only the flag. */
  fromFeedback: boolean;
}

export interface Changelog {
  generatedAt: string;
  entries: ChangelogEntry[];
}

/** Where the baked JSON sits under `public/`, made base-path aware so it resolves
 *  under a GitHub Pages project subpath too (mirrors `assets.ts`). */
export const CHANGELOG_URL = `${process.env.NEXT_PUBLIC_BASE_PATH || ''}/data/changelog.json`;

/**
 * Fetch and validate the baked changelog. Returns `[]` on any failure — a missing
 * or malformed file must never throw into the UI; the panel just shows "nothing
 * yet" instead of crashing. Each entry is checked field-by-field so a hand-edited
 * or stale JSON can't inject a shape the renderer doesn't expect.
 */
export async function loadChangelog(signal?: AbortSignal): Promise<ChangelogEntry[]> {
  try {
    const res = await fetch(CHANGELOG_URL, { signal });
    if (!res.ok) return [];
    const raw: unknown = await res.json();
    const entries = (raw as Changelog)?.entries;
    if (!Array.isArray(entries)) return [];
    return entries.filter(isEntry);
  } catch {
    return []; // aborted, offline, 404, or bad JSON — all mean "show nothing"
  }
}

function isEntry(e: unknown): e is ChangelogEntry {
  if (!e || typeof e !== 'object') return false;
  const x = e as Record<string, unknown>;
  return (x.kind === 'new' || x.kind === 'fix')
    && (x.scope === null || typeof x.scope === 'string')
    && typeof x.text === 'string'
    && typeof x.date === 'string'
    && typeof x.fromFeedback === 'boolean';
}
