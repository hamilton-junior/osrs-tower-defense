/**
 * A baked sheet's version, stamped onto its URL by the table generators
 * (`walk.png?v=1a2b3c4d`).
 *
 * A re-bake rewrites a sheet in place, under the same name, and a browser that has
 * already loaded that name keeps drawing the old image: a dev page hot-reloading the
 * new table, or a player whose cache still holds the last deploy's sheet. The table
 * then plays frames the old sheet does not have, and the monster vanishes for the last
 * few frames of every loop. With the file's own hash in the URL, a changed sheet is a
 * new address and is always fetched fresh.
 *
 * lib/game/data/anim-sheets.test.ts checks every table against the files with this
 * same rule: the first 8 hex digits of the file's SHA-1.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

/** @param {string} file  path to the sheet on disk */
export function sheetVersion(file) {
  return createHash('sha1').update(readFileSync(file)).digest('hex').slice(0, 8);
}
