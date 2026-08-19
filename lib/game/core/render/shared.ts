import type { HitsplatKind } from '../engine';
import type { CombatStyle } from '../../types';
import type { GameRenderer } from '../renderer';

/**
 * Drawing primitives every layer reuses, plus the palettes and constants they
 * share. Nothing here reads game state beyond what it is handed.
 */

/** The Grotesque Guardians' shared stone: the tether, the bar caption and the revival
 *  all read in the same gold, so the player learns one colour, not three. */
export const GUARDIAN_LINK_COLOR = '#c9a227';

/** Cerberus's Summoned Souls, one colour per style it locks — matching the OSRS models
 *  the clips are baked from: the ranged soul carries a green bow, the magic one a blue
 *  staff, the melee one a red blade. */
export const SOUL_COLORS: Record<CombatStyle, string> = {
  melee: '#e05a3c',
  ranged: '#4ec95a',
  magic: '#54c9e8',
};

export const GRID = 32;

/** Scale a `#rrggbb` colour's channels by `f` (clamped), for cheap procedural
 *  shading (`f < 1` darkens, `f > 1` lightens). Alpha-suffix is ignored. */
export function shade(hex: string, f: number): string {
  const n = parseInt(hex.slice(1, 7), 16);
  const c = (sh: number) => Math.max(0, Math.min(255, Math.round(((n >> sh) & 0xff) * f)));
  return `rgb(${c(16)},${c(8)},${c(0)})`;
}

/** Deterministic 2D hash → [0,1), for stable per-tile terrain variation. */
export function hash2(a: number, b: number): number {
  const v = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453;
  return v - Math.floor(v);
}

/** Radius (logic px) around the spawn portal within which an enemy is still
 *  "inside" it — its HP bar / overlays stay hidden until it walks clear, so
 *  nothing pokes through the gateway. */
export const PORTAL_MASK_R = 50;

/** OSRS Template:Hitsplat colours, keyed by hitsplat kind. */
export const HITSPLAT_COLORS: Record<HitsplatKind, string> = {
  hit: '#9e1414',     // red damage
  miss: '#3056c8',    // blue 0 / block
  poison: '#1a8c1a',  // green poison
  venom: '#0b5c0b',   // dark-green venom
  burn: '#cc6a16',    // orange fire DoT
  heal: '#7b2fb0',    // purple heal
};

/** All Canvas 2D drawing for a frame. Reads engine state through `this.e`. */

/** Draw an axis-aligned, tile-aligned square range marker centred on (cx, cy). */
export function drawSquareRange(gr: GameRenderer, 
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  half: number,
  stroke: string,
  fill: string,
) {
  const x = cx - half;
  const y = cy - half;
  const size = half * 2;
  ctx.fillStyle = fill;
  ctx.fillRect(x, y, size, size);
  // Dark halo under the coloured dash (same dash pattern, wider line) so the
  // marker stays legible on light biomes (sand/snow), not just dark ones.
  ctx.setLineDash([6, 6]);
  ctx.lineWidth = 4;
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.strokeRect(x, y, size, size);
  ctx.lineWidth = 2;
  ctx.strokeStyle = stroke;
  ctx.strokeRect(x, y, size, size);
  ctx.setLineDash([]);
}

/** Draw an image centred at (cx,cy) fit inside a `box`-px square, preserving
 *  its aspect ratio (like CSS object-contain) so it never looks stretched. */
export function drawImageContain(gr: GameRenderer, ctx: CanvasRenderingContext2D, img: HTMLImageElement, cx: number, cy: number, box: number) {
  const ratio = img.naturalWidth && img.naturalHeight ? img.naturalWidth / img.naturalHeight : 1;
  let w = box, h = box;
  if (ratio > 1) h = box / ratio; else w = box * ratio;
  ctx.drawImage(img, cx - w / 2, cy - h / 2, w, h);
}
