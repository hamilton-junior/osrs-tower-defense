import { describe, it, expect } from 'vitest';
// The changelog generator is a plain-node script (prebuild can't import TS), so its
// pure classification is exported for us to test directly. See build-changelog.mjs.
import { classifyCommit, TYPE_KIND, KINDS } from '../../scripts/build-changelog.mjs';

describe('classifyCommit — commit type → badge kind', () => {
  it('maps each player-facing type to its badge', () => {
    expect(classifyCommit('feat(ui): a new panel')?.kind).toBe('new');
    expect(classifyCommit('fix(boss): stop the leak')?.kind).toBe('fixed');
    expect(classifyCommit('refactor(core): tidy the loop')?.kind).toBe('updated');
    expect(classifyCommit('style(ui): swap the icons')?.kind).toBe('updated');
    expect(classifyCommit('balance(towers): slower cannon')?.kind).toBe('balanced');
    expect(classifyCommit('tune(waves): gentler ramp')?.kind).toBe('balanced');
    expect(classifyCommit('perf(render): fewer draws')?.kind).toBe('faster');
  });

  it('drops plumbing types (docs/chore/test/…)', () => {
    expect(classifyCommit('docs: update readme')).toBeNull();
    expect(classifyCommit('chore: bump deps')).toBeNull();
    expect(classifyCommit('test: add coverage')).toBeNull();
  });

  it('drops non-conventional subjects', () => {
    expect(classifyCommit('just a plain message')).toBeNull();
    expect(classifyCommit('')).toBeNull();
    expect(classifyCommit(undefined)).toBeNull();
  });

  it('strips the prefix and sentence-cases the summary', () => {
    const e = classifyCommit('feat(roguelite): draft the cards');
    expect(e?.text).toBe('Draft the cards');
    expect(e?.scope).toBe('roguelite');
  });

  it('keeps scope null when the commit has none', () => {
    expect(classifyCommit('fix: a scopeless fix')?.scope).toBeNull();
  });

  it('honours a breaking-change "!" before the colon', () => {
    expect(classifyCommit('feat(core)!: reshape the save')?.kind).toBe('new');
  });

  it('overrides the badge via a Changelog: <label> trailer', () => {
    // A feat that only swapped icons is really an "Updated", not a "New".
    const e = classifyCommit('feat(ui): swap priority icons', 'Body text.\n\nChangelog: updated');
    expect(e?.kind).toBe('updated');
  });

  it('ignores an unknown Changelog: label and falls back to the type', () => {
    const e = classifyCommit('fix(ui): a real fix', 'Changelog: banana');
    expect(e?.kind).toBe('fixed');
  });

  it('flags a change driven by feedback via the Feedback: trailer', () => {
    expect(classifyCommit('feat(ui): x', 'Feedback: suggestion #12')?.fromFeedback).toBe(true);
    expect(classifyCommit('feat(ui): x', 'no trailer here')?.fromFeedback).toBe(false);
  });

  it('exposes a kind set that matches the type map values', () => {
    for (const kind of Object.values(TYPE_KIND)) {
      expect(KINDS.has(kind)).toBe(true);
    }
  });
});
