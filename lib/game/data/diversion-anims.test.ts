import { describe, it, expect } from 'vitest';
import { DIVERSIONS, DIVERSION_BY_ID } from './diversions';
import { DIVERSION_ANIMS } from './diversion-anims';

/**
 * The baked-clip coverage gate for Distractions & Diversions.
 *
 * Every one of them animates with **its own** cache sequences — nobody borrows a
 * generic human loop — so the thing worth guarding is that the bake actually exists
 * for each of them and carries the views the renderer asks for. The one exception is
 * the bird nest: it is an item lying on the floor, not an NPC, so it has no model and
 * nothing to animate.
 */
const NO_MODEL = ['bird_nest'];

describe('DIVERSION_ANIMS', () => {
  it('bakes every diversion that has a model', () => {
    for (const def of DIVERSIONS) {
      if (NO_MODEL.includes(def.id)) {
        expect(DIVERSION_ANIMS[def.id]).toBeUndefined();
        continue;
      }
      expect(DIVERSION_ANIMS[def.id], def.id).toBeDefined();
    }
  });

  it('gives everyone baked a front standing loop', () => {
    for (const [id, set] of Object.entries(DIVERSION_ANIMS)) {
      const stand = set.views.front?.stand;
      expect(stand, id).toBeDefined();
      expect(stand!.loop, id).toBe(true);
      expect(stand!.frames, id).toBeGreaterThan(0);
    }
  });

  it('gives every walker all three views, each with a walk loop', () => {
    for (const [id, set] of Object.entries(DIVERSION_ANIMS)) {
      // `turned` marks the ones that walk on and off — the ones that need to face
      // the way they are going. The plant grows where it stands.
      if (!DIVERSION_BY_ID[id as keyof typeof DIVERSION_BY_ID]?.turned) continue;
      for (const view of ['front', 'side', 'back'] as const) {
        const clips = set.views[view];
        expect(clips, `${id}.${view}`).toBeDefined();
        expect(clips!.walk, `${id}.${view}.walk`).toBeDefined();
        expect(clips!.walk!.loop, `${id}.${view}.walk`).toBe(true);
      }
    }
  });

  it('names only local bakes, one sheet per view', () => {
    for (const [id, set] of Object.entries(DIVERSION_ANIMS)) {
      for (const [view, clips] of Object.entries(set.views)) {
        for (const [name, clip] of Object.entries(clips as unknown as Record<string, { url: string; frames: number; frameMs: number[] } | undefined>)) {
          if (!clip) continue;
          expect(clip.url, `${id}.${view}.${name}`).toMatch(new RegExp(`/assets/diversions/${id}/${view}-${name}\.png$`));
          expect(clip.url).not.toMatch(/^https?:/);
          expect(clip.frameMs.length, `${id}.${view}.${name}`).toBe(clip.frames);
        }
      }
    }
  });

  it('leaves every entry reachable from the cast — no orphan bakes', () => {
    for (const id of Object.keys(DIVERSION_ANIMS)) {
      expect(DIVERSION_BY_ID[id as keyof typeof DIVERSION_BY_ID], id).toBeDefined();
    }
  });
});
