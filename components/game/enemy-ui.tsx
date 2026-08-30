'use client';

import React from 'react';
import { ENEMY_ANIMS, clipDurationS } from '@/lib/game/data/enemy-anims';
import { ELEMENTS } from '@/lib/game/systems/magic';
import { ENEMIES } from '@/lib/game/data/enemies';
import { DIVERSION_ANIMS } from '@/lib/game/data/diversion-anims';
import { DIVERSION_BY_ID, type DiversionId } from '@/lib/game/data/diversions';
import type { StyleWeakness } from '@/lib/game/types';

/**
 * How an enemy shows itself outside the board: its weakness tag and its baked
 * walk sheet used as an icon.
 *
 * Shared by the enemy hover panel, the wave preview and the Collection Log, so
 * one monster looks the same wherever it is named. Moved out of GameRoot.tsx
 * verbatim.
 */

/** How a combat-style weakness reads in a stat row — the combat-triangle colours
 *  (melee red, ranged green), so it sits beside the elemental labels without
 *  looking like one of them. */
export const STYLE_WEAKNESS_TAG: Record<StyleWeakness, { label: string; color: string }> = {
  melee: { label: 'Melee', color: 'var(--osrs-red)' },
  ranged: { label: 'Ranged', color: '#7fd14a' },
};

/**
 * Resolve a monster's single weakness — elemental *or* combat-style — to the
 * `{ label, color }` every "Weakness" row renders. A monster carries one axis or
 * the other (see data/enemies.ts), so one row is enough and the style axis is
 * checked first.
 */
export function weaknessTag(weakness?: string | null, styleWeakness?: StyleWeakness | null) {
  if (styleWeakness) return STYLE_WEAKNESS_TAG[styleWeakness];
  const el = weakness ? ELEMENTS[weakness as keyof typeof ELEMENTS] : null;
  return el ? { label: el.label, color: el.color } : null;
}
/** Show an enemy's baked walk sheet as an icon: the first frame statically, or
 *  (when `animate`) the whole walk cycle looping via a CSS steps animation. The
 *  element width equals one frame, so the shift is `frames` element-widths; we
 *  express it in `em` (3.4em = the `.rs-log-sprite` width) so it tracks the
 *  card's font-size. Returns undefined if nothing is baked. */
export function enemySpriteStyle(type: string, animate = false): React.CSSProperties | undefined {
  // Most types are their own clip slug; `animSlug` covers the ones that aren't
  // (Cerberus's souls are three cache NPCs behind one type).
  return enemySlugSpriteStyle(ENEMIES[type as keyof typeof ENEMIES]?.animSlug ?? type, animate);
}

/** The same trick for a Distraction & Diversion: its baked **standing** loop, seen
 *  from the front, is what it does while it waits on the board — so the Collection
 *  Log shows it idling rather than posing. The bird nest has no rig (it is an item
 *  lying on the floor), so it falls back to its own icon, still contained. */
export function diversionSpriteStyle(id: string, animate = false): React.CSSProperties {
  const clip = DIVERSION_ANIMS[id]?.views.front?.stand;
  if (!clip) {
    const sprite = DIVERSION_BY_ID[id as DiversionId]?.sprite;
    return sprite
      ? { backgroundImage: `url(${sprite})`, backgroundSize: 'contain', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' }
      : {};
  }
  const base: React.CSSProperties = {
    backgroundImage: `url(${clip.url})`,
    backgroundSize: `${clip.frames * 100}% 100%`,
    backgroundPosition: 'left center',
    backgroundRepeat: 'no-repeat',
  };
  if (!animate || clip.frames <= 1) return base;
  const dur = Math.max(0.5, clipDurationS(clip));
  return {
    ...base,
    ['--rs-walk-shift' as string]: `-${clip.frames * 3.4}em`,
    animation: `rs-log-walk ${dur}s steps(${clip.frames}) infinite`,
  };
}

/** The same icon, but for one *look* rather than one monster — the Barrows
 *  brothers share a stat block, so a variant viewer needs to ask for the body it
 *  wants by slug instead of by type. */
export function enemySlugSpriteStyle(slug: string, animate = false): React.CSSProperties | undefined {
  const clip = ENEMY_ANIMS[slug]?.clips.walk;
  if (!clip) return undefined;
  const base: React.CSSProperties = {
    backgroundImage: `url(${clip.url})`,
    backgroundSize: `${clip.frames * 100}% 100%`,
    backgroundPosition: 'left center',
    backgroundRepeat: 'no-repeat',
  };
  if (!animate || clip.frames <= 1) return base;
  const dur = Math.max(0.5, clipDurationS(clip));
  return {
    ...base,
    ['--rs-walk-shift' as string]: `-${clip.frames * 3.4}em`,
    animation: `rs-log-walk ${dur}s steps(${clip.frames}) infinite`,
  };
}
