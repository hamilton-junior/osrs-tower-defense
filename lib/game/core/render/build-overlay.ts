import type { TowerType } from '../../types';
import { isValidPlacement, squareRange, snapToTileCenter } from '../../systems/geometry';
import type { GameRenderer } from '../renderer';
import { GRID, drawSquareRange } from './shared';
import { wizardStaffKey, drawTowerSprite } from './towers';

/**
 * Everything drawn only while the player is building: the danger zone, range
 * circles, the placement ghost and its shift-drag / paste / queue variants, and
 * the synergy preview that says what a tower would gain where it stands.
 */

/**
 * Danger zone at the road's exit edge: where enemies that get through deal
 * damage. Always faintly glowing, and flares red on a leak (`baseFlash`).
 */
export function drawDangerZone(gr: GameRenderer, ctx: CanvasRenderingContext2D) {
  const path = gr.e.path;
  if (path.length < 2) return;
  const t = performance.now() / 1000;
  const bf = gr.e.baseFlash;
  const W = gr.e.width, H = gr.e.height;
  // The last path point is the off-board exit stub; the one before it is the
  // last on-board vertex. The road crosses whichever border the map's dihedral
  // orientation put the exit on, so derive the crossing point and the outward
  // direction from the stub — a hardcoded right edge detached this marker from
  // the road end on every top/left/bottom exit.
  const stub = path[path.length - 1];
  const last = path[path.length - 2];
  const clampX = (v: number) => Math.max(24, Math.min(W - 24, v));
  const clampY = (v: number) => Math.max(24, Math.min(H - 24, v));
  let x: number, y: number, ang: number;
  if (stub.x > W) { ang = 0; x = W; y = clampY(last.y); }               // right
  else if (stub.x < 0) { ang = Math.PI; x = 0; y = clampY(last.y); }    // left
  else if (stub.y < 0) { ang = -Math.PI / 2; y = 0; x = clampX(last.x); } // top
  else { ang = Math.PI / 2; y = H; x = clampX(last.x); }                // bottom
  const pulse = 0.5 + 0.5 * Math.sin(t * 2.5);
  const intensity = Math.min(0.9, 0.16 + pulse * 0.12 + bf * 0.7);

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang); // local +x now points off the exit border
  // Red danger glow bleeding in from the edge.
  const glow = ctx.createRadialGradient(0, 0, 4, 0, 0, 50);
  glow.addColorStop(0, `rgba(220,30,30,${intensity})`);
  glow.addColorStop(1, 'rgba(220,30,30,0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(0, 0, 50, 0, Math.PI * 2);
  ctx.fill();
  // Hazard chevrons pointing off-screen.
  ctx.lineCap = 'round';
  ctx.lineWidth = 4;
  ctx.strokeStyle = `rgba(255,${Math.round(90 - bf * 60)},40,${0.45 + bf * 0.45})`;
  for (const cx of [-46, -33, -20]) {
    ctx.beginPath();
    ctx.moveTo(cx, -11);
    ctx.lineTo(cx + 11, 0);
    ctx.lineTo(cx, 11);
    ctx.stroke();
  }
  ctx.restore();
}

/** Faint range preview when hovering an idle tower (before selecting it). */
export function drawHoverRange(gr: GameRenderer, ctx: CanvasRenderingContext2D) {
  if (gr.e.selectedTowerType || gr.e.movingTower) return;
  const { x, y } = gr.e.pointer;
  const hovered = gr.e.towers.find(
    t => t.id !== gr.e.selectedTowerId && Math.abs(t.x - x) <= 18 && Math.abs(t.y - y) <= 18,
  );
  if (!hovered) return;
  const range = gr.e.effectiveStats(hovered.id)?.range ?? hovered.range;
  drawSquareRange(gr, 
    ctx, hovered.x, hovered.y, squareRange(range, GRID),
    'rgba(255,255,255,0.2)', 'rgba(255,255,255,0.03)',
  );
}

/**
 * While the player is placing (or relocating) a tower, flag every
 * non-buildable terrain tile with a soft red tint + diagonal hatch. The rough
 * ground baked into the terrain cache is deliberately subtle so it doesn't
 * shout during combat; this overlay only appears in build mode, when knowing
 * exactly where a tower *won't* go is what the player needs. Steady, not
 * pulsing — it's a map, not an alarm.
 */
export function drawBuildOverlay(gr: GameRenderer, ctx: CanvasRenderingContext2D) {
  if (!gr.e.selectedTowerType && !gr.e.movingTower) return;
  const t = gr.e.terrain;
  if (t.cols === 0) return;
  const cols = t.cols;
  // Clip to the union of non-buildable tiles, then paint tint + hatch across
  // the clip in one pass (cheaper and more continuous than per-tile strokes).
  ctx.save();
  ctx.beginPath();
  let any = false;
  for (let i = 0; i < t.tiles.length; i++) {
    const kind = t.tiles[i];
    if (kind === 'open') continue; // everything else is ground you cannot build on
    ctx.rect((i % cols) * GRID, ((i / cols) | 0) * GRID, GRID, GRID);
    any = true;
  }
  if (!any) { ctx.restore(); return; }
  ctx.clip();
  ctx.fillStyle = 'rgba(196,40,40,0.16)';
  ctx.fillRect(0, 0, gr.e.width, gr.e.height);
  ctx.strokeStyle = 'rgba(255,80,80,0.28)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  const step = 8;
  for (let d = -gr.e.height; d < gr.e.width; d += step) {
    ctx.moveTo(d, 0);
    ctx.lineTo(d + gr.e.height, gr.e.height); // 45° diagonals
  }
  ctx.stroke();
  ctx.restore();
}

export function drawPlacementGhost(gr: GameRenderer, ctx: CanvasRenderingContext2D) {
  // On-map tower picker open: highlight the tapped tile so the popup's choice
  // is clearly anchored to where the tower will go.
  const pending = gr.e.pendingPlacement;
  if (pending && !gr.e.movingTower && !gr.e.selectedTowerType) {
    const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 250);
    drawSquareRange(gr, 
      ctx, pending.x, pending.y, GRID / 2,
      `rgba(255,225,120,${0.5 + pulse * 0.4})`, 'rgba(255,225,120,0.12)',
    );
  }

  // A group move draws its own formation of ghosts and owns the frame.
  if (gr.e.movingGroupIds.length) { drawGroupGhost(gr, ctx); return; }
  // So does a paste — same reason: the pointer is carrying a shape, not a tower.
  if (gr.e.pasting) { drawPasteGhost(gr, ctx); return; }

  // A Shift-drag paints a line; the painted tiles are drawn as well as (not
  // instead of) the live ghost under the pointer, so the stroke reads as a line
  // being extended rather than a ghost that jumped.
  drawQueueGhost(gr, ctx);

  // Either placing a new tower (selectedTowerType) or relocating one (movingTower).
  const moving = gr.e.movingTower;
  const type = moving ? moving.type : gr.e.selectedTowerType;
  if (!type) return;
  const sx = snapToTileCenter(gr.e.pointer.x, GRID);
  const sy = snapToTileCenter(gr.e.pointer.y, GRID);
  const others = moving ? gr.e.towers.filter(t => t.id !== moving.id) : gr.e.towers;
  const affordable = moving ? gr.e.money >= gr.e.moveTowerCost(moving) : gr.e.money >= gr.e.towerCost(type);
  const valid = affordable && isValidPlacement(sx, sy, gr.e.path, others, 40, 30, (x, y) => gr.e.isTerrainBlocked(x, y));
  const level = moving ? moving.level : 1;
  // Show the *effective* range (run mods, global upgrades, nearby Utility auras),
  // so what the preview circle promises is what the placed tower actually gets.
  const range = moving
    ? (gr.e.effectiveStats(moving.id)?.range ?? moving.range)
    : gr.e.previewStats(type, sx, sy).range;

  drawSquareRange(gr, 
    ctx, sx, sy, squareRange(range, GRID),
    valid ? 'rgba(0,255,0,0.5)' : 'rgba(255,0,0,0.5)',
    valid ? 'rgba(0,255,0,0.06)' : 'rgba(255,0,0,0.06)',
  );

  // If a radius-based synergy is active, show its reach around this spot so the
  // player can position for it — Lone Wolf's "no towers nearby" zone especially.
  drawPlacementSynergy(gr, ctx, sx, sy, type, moving ? moving.id : null);

  ctx.globalAlpha = 0.6;
  // When relocating a wizard, preview its *current* staff (spellbook + element),
  // not the default base sprite — match what the placed tower actually shows.
  const preferredKey = moving ? wizardStaffKey(gr, moving) : undefined;
  drawTowerSprite(gr, ctx, type, level, sx, sy, moving ? moving.visualRadius : 18, preferredKey);
  ctx.globalAlpha = 1;
}

/** The tiles a Shift-drag has painted, waiting for Shift to come up and buy
 *  them. Tiles past what the gold covers are drawn red and dimmer: they are in
 *  the line but won't be built, and saying so now beats a toast afterwards.
 *
 *  No range squares here — a ten-tower line would carpet the board in green and
 *  hide the very ground being painted on. The live ghost under the pointer still
 *  shows the range of the tower about to be added. */
export function drawQueueGhost(gr: GameRenderer, ctx: CanvasRenderingContext2D) {
  const type = gr.e.selectedTowerType;
  if (!type || !gr.e.placeQueue.length) return;
  const affordable = gr.e.placeQueueAffordable;

  gr.e.placeQueue.forEach((p, i) => {
    const ok = i < affordable;
    drawSquareRange(gr, 
      ctx, p.x, p.y, GRID / 2,
      ok ? 'rgba(0,255,0,0.5)' : 'rgba(255,0,0,0.5)',
      ok ? 'rgba(0,255,0,0.10)' : 'rgba(255,0,0,0.10)',
    );
    ctx.globalAlpha = ok ? 0.6 : 0.3;
    drawTowerSprite(gr, ctx, type, 1, p.x, p.y, 18);
    ctx.globalAlpha = 1;
  });
}

/** The ghost for a group move: the whole formation previewed under the pointer,
 *  each tower coloured by its own verdict. Ranges are drawn for every tower but
 *  the synergy overlay is not — a dozen circles of captions would bury the board
 *  the move is trying to read. */
export function drawGroupGhost(gr: GameRenderer, ctx: CanvasRenderingContext2D) {
  const plan = gr.e.groupMovePlan(gr.e.pointer.x, gr.e.pointer.y);
  if (!plan.length) return;
  // Can't pay = nothing lands, so the whole formation reads red regardless of
  // where it sits — same signal the single-tower ghost gives.
  const affordable = gr.e.money >= gr.e.movingGroupCost;

  for (const t of plan) {
    const ok = t.ok && affordable;
    const range = gr.e.effectiveStats(t.tower.id)?.range ?? t.tower.range;
    drawSquareRange(gr, 
      ctx, t.x, t.y, squareRange(range, GRID),
      ok ? 'rgba(0,255,0,0.5)' : 'rgba(255,0,0,0.5)',
      ok ? 'rgba(0,255,0,0.06)' : 'rgba(255,0,0,0.06)',
    );
  }

  // Sprites last, so no tower's range square is painted over its neighbour.
  ctx.globalAlpha = 0.6;
  for (const t of plan) {
    drawTowerSprite(gr, 
      ctx, t.tower.type, t.tower.level, t.x, t.y, t.tower.visualRadius,
      wizardStaffKey(gr, t.tower),
    );
  }
  ctx.globalAlpha = 1;
}

/** The ghost for a paste: the copied formation previewed under the pointer.
 *  Built at base tier, so the sprites are the level-1 ones — what you'd get,
 *  not what was copied. A wizard still shows its own staff, since the paste
 *  carries the spellbook.
 *
 *  Can't-pay reads red across the whole shape, like a group move: the paste is
 *  all-or-nothing, so there's no such thing as a partly-affordable formation. */
export function drawPasteGhost(gr: GameRenderer, ctx: CanvasRenderingContext2D) {
  const plan = gr.e.pastePlan(gr.e.pointer.x, gr.e.pointer.y);
  if (!plan.length) return;
  const affordable = gr.e.money >= gr.e.clipboardCost;

  for (const t of plan) {
    const ok = t.ok && affordable;
    const range = gr.e.previewStats(t.blueprint.type, t.x, t.y).range;
    drawSquareRange(gr, 
      ctx, t.x, t.y, squareRange(range, GRID),
      ok ? 'rgba(0,255,0,0.5)' : 'rgba(255,0,0,0.5)',
      ok ? 'rgba(0,255,0,0.06)' : 'rgba(255,0,0,0.06)',
    );
  }

  // Sprites last, so no tower's range square is painted over its neighbour.
  ctx.globalAlpha = 0.6;
  for (const t of plan) {
    drawTowerSprite(gr, 
      ctx, t.blueprint.type, 1, t.x, t.y, 18,
      wizardStaffKey(gr, t.blueprint),
    );
  }
  ctx.globalAlpha = 1;
}

/** While placing/moving, overlay the reach of any active radius-based synergy
 *  (Lone Wolf / Clan Vexillum / Combat Triangle), with live qualify feedback so
 *  "near"/"far" is concrete instead of a number buried in a card description. */
export function drawPlacementSynergy(gr: GameRenderer, 
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  type: TowerType,
  ignoreId: string | null,
) {
  const syn = gr.e.runFx.synergy;
  const others = gr.e.towers.filter(t => t.id !== ignoreId);

  // Collect every active radius-based synergy, draw the circles, then stack
  // their captions above the widest circle so multiple labels never overlap
  // (e.g. Lone Wolf + Clan Vexillum, both radius 96).
  const items: { radius: number; stroke: string; fill: string; label: string }[] = [];

  // Lone Wolf — the isolation radius. Cyan when the spot is clear (bonus would
  // apply), red when a tower sits inside (bonus suppressed).
  if (syn.loneWolf) {
    const radius = syn.loneWolf.radius;
    const ok = !others.some(t => Math.hypot(t.x - cx, t.y - cy) <= radius);
    items.push({
      radius,
      stroke: ok ? '#5ec8ff' : '#ff6a6a',
      fill: ok ? 'rgba(94,200,255,0.10)' : 'rgba(255,80,80,0.12)',
      label: ok ? `Lone Wolf ✓ ×${syn.loneWolf.mult}` : 'Lone Wolf: tower in range',
    });
  }

  // Clan Vexillum — how many same-kind allies this spot would rally (capped).
  if (syn.packTactics) {
    const { radius, maxStacks, frac } = syn.packTactics;
    const n = Math.min(maxStacks, others.filter(t => t.type === type && Math.hypot(t.x - cx, t.y - cy) <= radius).length);
    items.push({
      radius, stroke: '#57d957', fill: 'rgba(87,217,87,0.08)',
      label: n > 0 ? `Clan Vexillum +${Math.round(frac * n * 100)}%` : 'Clan Vexillum +0% (no allies)',
    });
  }

  // Combat Triangle — its reach; bonus needs both *other* styles inside.
  if (syn.trinity) {
    items.push({ radius: syn.trinity.radius, stroke: '#ffd257', fill: 'rgba(255,210,87,0.07)', label: 'Combat Triangle reach' });
  }

  if (items.length === 0) return;
  for (const it of items) drawSynergyCircle(gr, ctx, cx, cy, it.radius, it.stroke, it.fill);
  // Captions: one per line, climbing upward from just above the widest circle.
  const top = cy - Math.max(...items.map(i => i.radius)) - 8;
  items.forEach((it, i) => drawSynergyLabel(gr, ctx, cx, top - i * 15, it.stroke, it.label));
}

/** A dashed true-circle radius marker with a faint fill. */
export function drawSynergyCircle(gr: GameRenderer, 
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  stroke: string,
  fill: string,
) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  // Dark halo pass first (see drawSquareRange) — legible on light biomes.
  ctx.setLineDash([7, 6]);
  ctx.lineWidth = 4;
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.stroke();
  ctx.lineWidth = 2;
  ctx.strokeStyle = stroke;
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

/** A single synergy caption, drawn with a dark outline so it stays legible. */
export function drawSynergyLabel(gr: GameRenderer, ctx: CanvasRenderingContext2D, cx: number, y: number, color: string, label: string) {
  ctx.save();
  ctx.font = "bold 12px 'RuneScape', Arial";
  ctx.textAlign = 'center';
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(0,0,0,0.85)';
  ctx.strokeText(label, cx, y);
  ctx.fillStyle = color;
  ctx.fillText(label, cx, y);
  ctx.restore();
}
