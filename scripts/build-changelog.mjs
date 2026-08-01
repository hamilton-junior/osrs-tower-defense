/**
 * Bake a player-facing changelog from the git history into
 * `public/data/changelog.json`, so the game can show "here's what changed" without
 * a backend and without touching NocoDB from the client.
 *
 * WHY FROM COMMITS, NOT FROM THE FEEDBACK DB: every line published here was written
 * by us (a commit subject), never by a player. That sidesteps the whole problem of
 * putting third-party prose — names, contact details, whatever someone typed into a
 * form — onto a public page. The feedback DB is never read; the only link back to a
 * suggestion is an OPTIONAL `Feedback:` trailer we add ourselves, which flags a line
 * as community-driven without exposing anything the player wrote.
 *
 * Runs in `prebuild` (npm calls it before `next build`), so the JSON is regenerated
 * on every deploy — for a static site, as live as it gets. It is also committed, so
 * `npm run dev` (which does NOT run prebuild) and a shallow CI checkout still have a
 * file to serve. See the deploy workflow's `fetch-depth: 0`: a shallow clone only
 * has the tip commit, which would bake an empty changelog over the committed one.
 *
 * Only commit types a player can perceive are published, each mapped to a badge
 * (see TYPE_KIND); docs/chore/test are dropped as noise. A `Changelog: <label>`
 * trailer can override the badge when the type doesn't reflect the content (e.g. a
 * `feat` commit that only swapped icons — really an "Updated", not a "New").
 *
 * NOTE ON DUPLICATION: this script runs under plain `node` in `prebuild`, so it
 * cannot import the TypeScript UI. The badge *kinds* here are the contract with
 * `lib/game/changelog.ts` (which owns each kind's label + colour); keep the kind
 * strings in the two files in sync. `classifyCommit` is exported and unit-tested
 * (lib/game/changelog-classify.test.ts) so the mapping can't silently drift.
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public', 'data', 'changelog.json');

/** How many entries to publish. A long history is noise to a player; the recent
 *  stretch is the "what's new" they came to read. */
const MAX_ENTRIES = 40;

// Field separator (unit) between fields, record separator between commits — both
// bytes that can't occur in a commit message, so no subject can break the parse.
const FS = '\x1f';
const RS = '\x1e';

/** Commit type → changelog badge kind. Types not listed are plumbing (docs, chore,
 *  test, …) and dropped. Mirrors the kinds in lib/game/changelog.ts. */
export const TYPE_KIND = {
  feat: 'new',
  fix: 'fixed',
  refactor: 'updated',
  style: 'updated',
  balance: 'balanced',
  tune: 'balanced',
  perf: 'faster',
};

/** Kinds a `Changelog: <label>` trailer may name to override the type's badge. */
export const KINDS = new Set(['new', 'fixed', 'updated', 'balanced', 'faster']);

/**
 * Classify one commit into a player-facing entry, or null if it isn't one.
 * Pure (subject + body in, entry-minus-date out) so it can be unit-tested without
 * a git repo. The caller supplies the date.
 */
export function classifyCommit(subject, body = '') {
  if (!subject) return null;

  // Conventional-commit prefix: type(scope): summary. Strip it for display but
  // keep the type as the badge source.
  const m = subject.match(/^(\w+)(?:\(([^)]+)\))?!?:\s*(.+)$/);
  if (!m) return null;
  const [, type, scope, summary] = m;

  // A `Changelog: <label>` trailer overrides the type→badge mapping when the label
  // names a known kind — for the commit whose type lies about its player impact.
  const override = body.match(/^\s*Changelog:\s*(\S+)/im);
  const forced = override && KINDS.has(override[1].toLowerCase()) ? override[1].toLowerCase() : null;

  const kind = forced || TYPE_KIND[type];
  if (!kind) return null; // docs/chore/test/… — not player-facing

  // Optional trailer we add by hand to tie a change to the feedback that drove it:
  //   Feedback: suggestion #12   |   Feedback: bug #4
  // Its presence (not the id) is what the UI surfaces — a "you asked for this" mark.
  const fromFeedback = /^\s*Feedback:\s*\S/im.test(body);

  return {
    kind,                                            // 'new' | 'fixed' | 'updated' | 'balanced' | 'faster'
    scope: scope || null,                            // 'roguelite', 'boss', 'ui', …
    // Sentence-case the summary's first letter; commit style is lower-case.
    text: summary.charAt(0).toUpperCase() + summary.slice(1),
    fromFeedback,
  };
}

function readCommits() {
  let raw;
  try {
    // execFile, not exec: no shell, so the control bytes in --format reach git
    // intact (Windows' shell would otherwise mangle them) and there is no
    // injection surface. The format string is static regardless.
    raw = execFileSync('git', [
      'log', '--no-merges', '--date=short', '-n', '500',
      `--format=%H${FS}%ad${FS}%s${FS}%b${RS}`,
    ], { cwd: ROOT, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  } catch (err) {
    // No git, or a checkout with no history — emit nothing rather than crash the build.
    console.warn(`[changelog] git log failed (${err.message.split('\n')[0]}); writing an empty changelog.`);
    return [];
  }

  const entries = [];
  for (const chunk of raw.split(RS)) {
    const rec = chunk.trim();
    if (!rec) continue;
    const [, date, subject, body = ''] = rec.split(FS);
    const entry = classifyCommit(subject, body);
    if (!entry) continue;

    entries.push({ ...entry, date }); // date (YYYY-MM-DD) comes from git, not the subject
    if (entries.length >= MAX_ENTRIES) break;
  }
  return entries;
}

function main() {
  const changelog = { generatedAt: new Date().toISOString().slice(0, 10), entries: readCommits() };
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(changelog, null, 2) + '\n');
  console.log(`[changelog] wrote ${changelog.entries.length} entries to public/data/changelog.json`);
}

// Only regenerate the file when run as a script (prebuild / by hand); importing this
// module for its exports (the unit test) must have no side effects.
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
