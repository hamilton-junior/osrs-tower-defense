/**
 * The 73 easter egg: a stat that reads 73 shows it as a red damage hitsplat of 73.
 *
 * Only a 73 standing on its own counts. A run of letters, digits and number
 * punctuation (`.` `,` `:`) is one figure, so "1,073", "730", "73:05", "73.5" and
 * "73M" stay plain text, while "73", "Wave 73", "73 gp" and "73%" each hold one.
 */

/** A figure and the letters glued to it, captured so a split keeps it. */
const FIGURE = /([\w.,:]+)/;

/**
 * Split a stat's text around each standalone 73. Odd indices hold the 73s; the
 * even ones are the plain text between them, possibly empty. A text without one
 * comes back whole, as a single part.
 */
export function splitOn73(text: string): string[] {
  const parts = [''];
  for (const run of text.split(FIGURE)) {
    if (run === '73') parts.push(run, '');
    else parts[parts.length - 1] += run;
  }
  return parts;
}
