/**
 * How long a notice toast holds on screen.
 *
 * A notice is a line the player did not ask to read: "Not enough gold", a herb
 * handing a life back, the kebab seller's reply. One flat hold fits none of them,
 * because a short refusal reads in a blink and a long line needs time. So the hold
 * scales with the text: a base for spotting the toast, plus reading time per
 * character, kept between a floor and a cap.
 */

/** Time to spot the toast before reading starts. */
export const NOTICE_BASE_MS = 1000;
/** Reading time per character, about 17 characters a second. */
export const NOTICE_MS_PER_CHAR = 60;
/** The shortest hold, already longer than the old flat 1.4s. */
export const NOTICE_MIN_MS = 2000;
/** The longest hold. A notice sits over the board, and a newer one replaces it. */
export const NOTICE_MAX_MS = 6000;

/** How long a notice with this text should stay up, in milliseconds. */
export function noticeMs(text: string): number {
  const ms = NOTICE_BASE_MS + text.trim().length * NOTICE_MS_PER_CHAR;
  return Math.max(NOTICE_MIN_MS, Math.min(NOTICE_MAX_MS, ms));
}
