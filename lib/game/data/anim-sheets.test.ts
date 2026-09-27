import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ENEMY_ANIMS, type EnemyClip } from './enemy-anims';
import { DIVERSION_ANIMS } from './diversion-anims';
import { SPOTANIM_SHEETS } from './spotanims.data';

/**
 * Every sheet the generated tables name is the very file on disk.
 *
 * Its URL carries the file's hash (scripts/lib/sheet-version.mjs: the first 8 hex
 * digits of its SHA-1), so a browser that still holds an older bake under the same
 * name never pairs it with the new table: the table playing frames the old sheet did
 * not have is what blanked every lobby monster at the end of each loop. And the sheet
 * holds exactly the frames the table plays, so a re-bake that forgot to regenerate the
 * table fails here instead of on screen.
 */
interface Sheet { key: string; url: string; frames: number; frameW: number }

const sheets: Sheet[] = [];
for (const [slug, set] of Object.entries(ENEMY_ANIMS)) {
  for (const [name, c] of Object.entries(set.clips)) {
    if (c) sheets.push({ key: `${slug}.${name}`, url: c.url, frames: c.frames, frameW: set.frameW });
  }
}
for (const [id, set] of Object.entries(DIVERSION_ANIMS)) {
  for (const [view, clips] of Object.entries(set.views)) {
    for (const [name, c] of Object.entries(clips ?? {}) as [string, EnemyClip | undefined][]) {
      if (c) sheets.push({ key: `${id}.${view}.${name}`, url: c.url, frames: c.frames, frameW: set.frameW });
    }
  }
}
for (const [slug, s] of Object.entries(SPOTANIM_SHEETS)) {
  sheets.push({ key: `spotanim.${slug}`, url: s.url, frames: s.frames, frameW: s.frameW });
}

describe('baked animation sheets', () => {
  it('covers all three tables', () => {
    expect(sheets.length).toBeGreaterThan(300);
  });

  it('names each sheet by the hash of the file behind it, and plays only the frames it holds', () => {
    for (const s of sheets) {
      const m = /(\/assets\/[^?]+\.png)\?v=([0-9a-f]{8})$/.exec(s.url);
      expect(m, `${s.key}: ${s.url}`).not.toBeNull();
      const bytes = readFileSync(join(process.cwd(), 'public', m![1]));
      expect(m![2], `${s.key} was re-baked since its table was generated`).toBe(
        createHash('sha1').update(bytes).digest('hex').slice(0, 8),
      );
      // A PNG's width sits at byte 16 of its header.
      expect(bytes.readUInt32BE(16), `${s.key} sheet width`).toBe(s.frames * s.frameW);
    }
  });
});
