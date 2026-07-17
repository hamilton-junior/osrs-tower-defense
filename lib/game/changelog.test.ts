import { describe, it, expect, vi, afterEach } from 'vitest';
import { loadChangelog } from './changelog';

/** Stub `fetch` to hand back a chosen JSON body (or an error). */
function stubFetch(impl: () => unknown | Promise<unknown>, ok = true) {
  vi.stubGlobal('fetch', vi.fn(async () => {
    if (!ok) throw new Error('network');
    return { ok, json: async () => impl() } as Response;
  }));
}

const entry = (over: Record<string, unknown> = {}) => ({
  kind: 'new', scope: 'ui', text: 'A thing', date: '2026-07-17', fromFeedback: false, ...over,
});

afterEach(() => vi.unstubAllGlobals());

describe('loadChangelog', () => {
  it('returns the valid entries from a well-formed file', async () => {
    stubFetch(() => ({ generatedAt: '2026-07-17', entries: [entry(), entry({ kind: 'fixed', fromFeedback: true })] }));
    const out = await loadChangelog();
    expect(out).toHaveLength(2);
    expect(out[1]).toMatchObject({ kind: 'fixed', fromFeedback: true });
  });

  it('accepts every expanded badge kind', async () => {
    stubFetch(() => ({
      entries: ['new', 'fixed', 'updated', 'balanced', 'faster'].map((kind) => entry({ kind })),
    }));
    expect(await loadChangelog()).toHaveLength(5);
  });

  it('carries a legacy "fix" kind forward to "fixed"', async () => {
    stubFetch(() => ({ entries: [entry({ kind: 'fix' })] }));
    const out = await loadChangelog();
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe('fixed');
  });

  it('drops malformed entries but keeps the good ones', async () => {
    stubFetch(() => ({
      entries: [
        entry(),
        entry({ kind: 'wat' }),          // unknown kind
        entry({ fromFeedback: 'yes' }),  // wrong type
        { text: 'no other fields' },     // missing fields
        null,
      ],
    }));
    const out = await loadChangelog();
    expect(out).toHaveLength(1);
  });

  it('returns [] rather than throwing when the fetch fails', async () => {
    stubFetch(() => ({}), false);
    expect(await loadChangelog()).toEqual([]);
  });

  it('returns [] for a body with no entries array', async () => {
    stubFetch(() => ({ generatedAt: 'x' }));
    expect(await loadChangelog()).toEqual([]);
  });

  it('accepts a null scope (a change with no conventional-commit scope)', async () => {
    stubFetch(() => ({ entries: [entry({ scope: null })] }));
    expect(await loadChangelog()).toHaveLength(1);
  });
});
