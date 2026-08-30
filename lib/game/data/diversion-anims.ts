import type { EnemyClip } from './enemy-anims';

/**
 * The three camera yaws a Distraction & Diversion is baked from, so it can face the
 * way it is walking. `side` walks **right**; the renderer mirrors it for anyone
 * heading left, which is why there is no fourth view.
 */
export type DiversionView = 'front' | 'side' | 'back';

/** What one view can play. `stand` is the idle every diversion has; `walk` is absent
 *  on the ones that never walk anywhere (the Strange Plant grows where it stands). */
export interface DiversionViewClips {
  stand: EnemyClip;
  walk?: EnemyClip;
}

/**
 * Runtime playback metadata for a baked **diversion** — the same sheet contract as an
 * enemy (`EnemyClip`, played with `clipFrame`), but keyed by view rather than by a
 * combat clip, because these NPCs never fight: they walk on, stand, talk, and leave.
 *
 * Every sequence id is the NPC's **own** `standingAnimation`/`walkingAnimation` out of
 * its cache def — nobody here borrows a generic human loop
 * (scripts/diversion-anims.config.json).
 */
export interface DiversionAnimSet {
  frameW: number;
  frameH: number;
  views: Partial<Record<DiversionView, DiversionViewClips>>;
}

/** The image key one baked sheet is loaded and drawn under. One address for both
 *  sides of the boundary — the engine preloads by it, the renderer looks up by it —
 *  so the two can never drift apart into a diversion that silently stops animating. */
export function diversionAnimKey(id: string, view: string, clip: string): string {
  return `divanim_${id}_${view}_${clip}`;
}

// The table itself is generated from the baked manifests; this module owns the contract.
export { DIVERSION_ANIMS } from './diversion-anims.data';
