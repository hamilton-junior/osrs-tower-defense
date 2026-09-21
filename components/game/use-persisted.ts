'use client';

/**
 * The writing half of `save.ts`.
 *
 * `save.ts` reads each store once, on mount. These hooks push the same stores back
 * out whenever the engine changes them, and they exist because that write is not
 * quite a one-liner: every store needs a guard, and there are two different guards
 * for two different ways the write can go wrong. Spelled out inline, the guard is
 * two lines of ceremony that a new store is free to forget — and forgetting it
 * costs a player their account-wide log, not a frame.
 *
 * So the two guards are named, and a new store picks one:
 *
 * - {@link useMirroredStore} — **skip the first emit.** The engine loads a store in
 *   its constructor and emits it straight back, so the first value the interface
 *   sees is the one it just read off disk. Writing it again is a redundant write on
 *   every page load. Everything after that is a real change.
 * - {@link useAppendOnlyStore} — **an empty list never overwrites.** For the logs
 *   the engine only ever adds to (achievements, diaries), an empty array means
 *   "nothing earned yet", never "everything was lost" — so it must not be allowed
 *   to flatten a store that has entries.
 *
 * Both swallow write failures: localStorage throws on a full quota and in some
 * private-browsing modes, and a save that cannot be written is not a reason to take
 * the game down.
 */

import { useEffect, useRef } from 'react';

/**
 * Mirror one value the engine owns into one localStorage key.
 *
 * The first emit is skipped (see the module note). `encode` returns the string to
 * store, or `null` to remove the key — which is how a value that can be absent,
 * like the active pet, clears itself rather than storing the word "null".
 */
export function useMirroredStore<T>(
  key: string,
  value: T,
  encode: (v: T) => string | null = (v) => JSON.stringify(v),
): void {
  // A ref, not state: skipping the first emit must not itself cause a render.
  const loaded = useRef(false);
  // `encode` is nearly always an inline arrow, so it is a new function every render.
  // Holding it in a ref keeps it out of the effect's deps, which are the value alone.
  const enc = useRef(encode);
  enc.current = encode;

  useEffect(() => {
    if (!loaded.current) { loaded.current = true; return; }
    try {
      const body = enc.current(value);
      if (body === null) localStorage.removeItem(key);
      else localStorage.setItem(key, body);
    } catch { /* quota, or private mode */ }
  }, [key, value]);
}

/**
 * Persist a log the engine only ever adds to, as `{ completed: [...] }`.
 *
 * Empty is never written (see the module note). That also covers the first emit for
 * a fresh account, and for an account that has entries the first emit writes back
 * what was just read — one redundant write per page load, which is the price of the
 * guard that matters more.
 */
export function useAppendOnlyStore<T>(key: string, completed: readonly T[]): void {
  useEffect(() => {
    if (completed.length === 0) return;
    try { localStorage.setItem(key, JSON.stringify({ completed })); }
    catch { /* quota, or private mode */ }
  }, [key, completed]);
}
