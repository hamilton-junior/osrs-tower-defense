import { ENEMIES } from '../data/enemies';
import type { EnemyType } from '../types';

/**
 * **Where a monster's body is, as opposed to where it stands.**
 *
 * An enemy is a point on the road, and nearly everything it wears is drawn from
 * that point: the sprite is centred on it, so a hitsplat or a hit GFX put there
 * lands on the model. That holds because a baked cell frames the model around
 * its middle — and it stops holding for a model whose cell had to reserve room
 * the body does not fill. The Giant Mole is the case: its dig and its climb-out
 * take the model a full body-length underground, and every clip in a set shares
 * one framing, so the mole *walking* is baked into the top of a cell whose lower
 * half is empty ground. Pinned to the point, an ice barrage encased the dirt
 * beneath it.
 *
 * `bodyRise` (data/enemies.ts) is the correction, in fractions of the drawn size
 * so it survives any `renderScale`. Absent — which is every other monster — this
 * returns the point untouched, so nothing else moves.
 *
 * Only things that land *on* the body use this. Ground effects (the mole's dust
 * rings, a shockwave, the mound it leaves behind) belong to the tile and keep
 * using `y`.
 */

/** The enemy fields this needs — a live `Enemy` or a stat block plus a position. */
export type Anchored = { type: string; y: number; isBoss?: boolean; renderScale?: number };

/** The sprite's drawn size in logic px — the same sum `core/render/enemies` does. */
export function drawnSize(e: Pick<Anchored, 'isBoss' | 'renderScale'>): number {
  return (e.isBoss ? 60 : 30) * (e.renderScale ?? 1);
}

/** The y a thing should attach to so it sits on the model rather than on the road. */
export function bodyY(e: Anchored): number {
  const rise = ENEMIES[e.type as EnemyType]?.bodyRise ?? 0;
  return rise ? e.y - rise * drawnSize(e) : e.y;
}
