/**
 * A code typed on the keyboard, key by key, like the title screen's "73". Each key
 * must follow the last within {@link TYPED_CODE_GAP_MS}; any other printable key
 * starts over. Keys that print nothing (Shift, arrows, Backspace) are skipped, so
 * a layout that needs Shift for its digits types the code the same way.
 */

/** Longest pause between two keys of one code, in ms. */
export const TYPED_CODE_GAP_MS = 1500;

export interface TypedCode {
  /** The code's keys typed so far, in order. */
  typed: string;
  /** When the last of them was pressed, in ms. */
  at: number;
}

export const NOTHING_TYPED: TypedCode = { typed: '', at: -Infinity };

/** Feed one pressed key (a KeyboardEvent's `key`) at `now` ms. `done` is true on
 *  the key that completes `code`, which then starts over. */
export function typeKey(prev: TypedCode, key: string, now: number, code: string): { next: TypedCode; done: boolean } {
  if (key.length !== 1) return { next: prev, done: false };
  const kept = now - prev.at <= TYPED_CODE_GAP_MS ? prev.typed : '';
  let typed = kept + key;
  // A wrong key may still be the code's first: "773" types "73".
  if (!code.startsWith(typed)) typed = code.startsWith(key) ? key : '';
  if (typed === code) return { next: NOTHING_TYPED, done: true };
  return { next: { typed, at: now }, done: false };
}
