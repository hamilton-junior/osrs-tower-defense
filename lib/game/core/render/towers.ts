import type { Tower } from '../../types';
import { TOWERS, TOWER_STYLES } from '../../data/towers';
import { squareRange } from '../../systems/geometry';
import { towerXpForLevel } from '../../systems/leveling';
import { spellSpriteName } from '../../systems/magic';
import { MAX_TOWER_LEVEL, styleSkillKey, towerCombatLevel } from '../../systems/tower-xp';
import type { GameRenderer } from '../renderer';
import { GRID, drawImageContain, drawSquareRange } from './shared';

/**
 * Towers on the board: the sprite per type and tier, the wizard's staff, the
 * baked synergy-aura glow, and the standard disabled look (40% alpha under the
 * OSRS prohibited sign) that every disable source shares.
 */

export function drawTowers(gr: GameRenderer, ctx: CanvasRenderingContext2D) {
  // Last Stand (curse): while the run is at/below its threshold, every tower is
  // enraged (damage up) — a red, pulsing ground ring marks the active state.
  const ls = gr.e.runFx.lastStand;
  const enraged = !!ls && !gr.e.gameOver && gr.e.lives <= ls.belowLives;
  const enragePulse = 0.5 + 0.5 * Math.sin(performance.now() / 240);

  for (const tower of gr.e.towers) {
    if (enraged) {
      const rr = tower.visualRadius * (1.25 + 0.18 * enragePulse);
      ctx.save();
      ctx.globalAlpha = 0.35 + 0.3 * enragePulse;
      ctx.strokeStyle = '#ff3b3b';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(tower.x, tower.y, rr, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    if (tower.id === gr.e.selectedTowerId) {
      const range = gr.e.effectiveStats(tower.id)?.range ?? tower.range;
      drawSquareRange(gr, ctx, tower.x, tower.y, squareRange(range, GRID), 'rgba(255,255,255,0.35)', 'rgba(255,255,255,0.05)');
      // Sight line to the current target, so the priority setting is legible.
      const target = tower.targetId ? gr.e.enemies.find(en => en.id === tower.targetId) : null;
      if (target) {
        ctx.save();
        ctx.strokeStyle = 'rgba(255,210,90,0.6)';
        ctx.setLineDash([4, 5]);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(tower.x, tower.y);
        ctx.lineTo(target.x, target.y);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(255,210,90,0.85)';
        ctx.beginPath();
        ctx.arc(target.x, target.y, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }

    // Hover-highlight from a DPS-panel row: ring the tower and show its range in
    // gold — distinct from the white selection marker — without touching the real
    // selection. Skipped when this tower is already the selected one.
    if (tower.id === gr.e.highlightTowerId && tower.id !== gr.e.selectedTowerId) {
      const range = gr.e.effectiveStats(tower.id)?.range ?? tower.range;
      drawSquareRange(gr, ctx, tower.x, tower.y, squareRange(range, GRID), 'rgba(255,210,90,0.6)', 'rgba(255,210,90,0.08)');
      const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 250);
      ctx.save();
      ctx.lineWidth = 3;
      ctx.strokeStyle = `rgba(255,210,90,${0.5 + 0.4 * pulse})`;
      ctx.beginPath();
      ctx.arc(tower.x, tower.y, tower.visualRadius + 6 + 2 * pulse, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // Placement-synergy aura: a glowing outline that hugs the tower's own
    // silhouette (not a ground circle) whenever the roguelite synergy cards are
    // buffing it, tinted by the dominant synergy (green pack / gold trinity /
    // orange vanguard / cyan lone wolf). The sprite is redrawn a few times in
    // the tint colour with a blurred shadow *before* the real sprite, which then
    // covers the centre and leaves a coloured contour around the edges.
    // Marquee multi-selection: a cyan tile marker so the batch-upgrade set is
    // clearly readable while the drag-box panel is open.
    if (gr.e.multiSelectedIds.includes(tower.id)) {
      drawSquareRange(gr, ctx, tower.x, tower.y, GRID / 2 + 2, 'rgba(110,220,255,0.9)', 'rgba(110,220,255,0.16)');
    }

    const aura = gr.e.towerSynergyAura(tower);
    const auraEntry = aura ? towerImageEntry(gr, tower) : null;

    // Aim + recoil: nudge the sprite back along the firing direction and
    // pulse its scale; flip horizontally to face the target. The aura is drawn
    // inside the SAME transform so the glow recoils and flips with the sprite.
    const recoil = tower.recoil ?? 0;
    const angle = tower.recoilAngle ?? 0;
    const back = recoil * 4;
    const pulse = 1 + recoil * 0.12;
    const flip = Math.cos(angle) < 0 ? -1 : 1;
    // Knocked offline (Brutus ploughed through it): fade the tower out so a dead
    // gap in the board is visible at a glance, then stamp the game's own
    // prohibited sign on it below. Silence alone was indistinguishable from a
    // tower that simply had nothing in range.
    const disabled = tower.disabledTimer > 0;
    ctx.save();
    if (disabled) ctx.globalAlpha = 0.4;
    ctx.translate(tower.x - Math.cos(angle) * back, tower.y - Math.sin(angle) * back);
    ctx.scale(flip * pulse, pulse);
    if (aura && auraEntry) {
      // Draw a *pre-baked* coloured glow sprite (blur done once, off the hot path)
      // and animate only its opacity — cheap even with a screen full of towers.
      const r = spriteRadius(gr, tower.type, tower.visualRadius);
      const size = Math.round(r * 2);
      const glow = glowSprite(gr, auraEntry.img, auraEntry.key, aura.color, size);
      if (glow) {
        const intensity = Math.min(1, (aura.mult - 1) / 0.6); // 0..1 by buff strength
        const pulseGlow = 0.5 + 0.5 * Math.sin(performance.now() / 520);
        const pad = gr.GLOW_PAD;
        ctx.save();
        ctx.globalAlpha = (0.45 + 0.4 * intensity) * (0.75 + 0.25 * pulseGlow);
        ctx.drawImage(glow, -r - pad, -r - pad, size + pad * 2, size + pad * 2);
        ctx.restore();
      }
    }
    drawTowerSprite(gr, ctx, tower.type, tower.level, 0, 0, tower.visualRadius, wizardStaffKey(gr, tower));
    ctx.restore();

    // Spell icon: a wizard wears the icon of the spell it currently casts
    // (Fire Wave / Ice Barrage / …) centred on the staff body, drawn outside
    // the flip/recoil transform so it stays put instead of floating when the
    // staff turns to face a target. Aspect-preserved so it isn't squashed.
    const spell = spellSpriteName(tower);
    const badgeKey = spell ? `spell_${spell}` : null;
    if (badgeKey && gr.e.imageOk(badgeKey)) {
      ctx.save();
      if (disabled) ctx.globalAlpha = 0.4;
      ctx.shadowColor = 'rgba(0,0,0,0.6)';
      ctx.shadowBlur = 3;
      drawImageContain(gr, ctx, gr.e.images.get(badgeKey)!, tower.x, tower.y, tower.visualRadius * 1.05);
      ctx.restore();
    }

    // The prohibited sign itself, at full opacity over the faded tower. It pulses
    // as the timer runs out so the player can see the tower is about to come back,
    // and it is drawn over the sprite so nothing (aura, spell badge) covers it.
    if (disabled) {
      const blocked = gr.e.imageOk('blocked') ? gr.e.images.get('blocked')! : null;
      const throb = 0.78 + 0.22 * Math.sin(performance.now() / 180);
      if (blocked) {
        ctx.save();
        ctx.globalAlpha = throb;
        ctx.shadowColor = 'rgba(0,0,0,0.75)';
        ctx.shadowBlur = 4;
        drawImageContain(gr, ctx, blocked, tower.x, tower.y, tower.visualRadius * 1.15);
        ctx.restore();
      } else {
        // The sprite failed to load — never leave the state invisible.
        ctx.save();
        ctx.globalAlpha = throb;
        ctx.strokeStyle = '#ff4d4d';
        ctx.lineWidth = 3;
        const r = tower.visualRadius * 0.8;
        ctx.beginPath();
        ctx.arc(tower.x, tower.y, r, 0, Math.PI * 2);
        ctx.moveTo(tower.x - r * 0.7, tower.y + r * 0.7);
        ctx.lineTo(tower.x + r * 0.7, tower.y - r * 0.7);
        ctx.stroke();
        ctx.restore();
      }
    }

    drawTowerPlate(gr, ctx, tower);
  }
}

// --- the strip under a tower -------------------------------------------------
// Sized in logic px. A tower sprite is 36-48px wide against a 32px tile, so the
// plate is allowed to be a little wider than its tile — but only a little, or
// two towers side by side would trade strips.
const ORB_R = 7.5;     // the level orb, same build as the minimap orbs
const BAR_W = 16;      // XP track
const BAR_H = 3;       // thin, like .rs-progress in the tower panel
const GAP = 2;         // between orb, bar and pips
const PIP_W = 3;       // tier pip, stacked into a column
const PIP_H = 1.6;
const PIP_STEP = 2.6;  // pip top-to-top

/**
 * A tower's combat level, its XP progress toward the next one, and its tier —
 * on the board, so none of it needs the panel opened.
 *
 * Left to right: the level on a minimap-style orb, a thin green XP track (the
 * same bar the tower panel shows, at 3px), then a column of tier pips lit from
 * the bottom up. The tier used to be a bare white number here, which read as
 * *the* level and collided with the real one; pips are a different visual
 * language, so the two can't be confused at a glance.
 *
 * Drawn faint and lifted to full opacity for the tower under the pointer, the
 * selected one, or one highlighted from the DPS panel — legible when looked for,
 * quiet across a board full of towers.
 */
function drawTowerPlate(gr: GameRenderer, ctx: CanvasRenderingContext2D, tower: Tower) {
  const level = towerCombatLevel(tower);
  const maxed = level >= MAX_TOWER_LEVEL;
  const xp = tower.skills[styleSkillKey(TOWER_STYLES[tower.type].style)].xp;
  const need = towerXpForLevel(level);
  const progress = maxed ? 1 : Math.max(0, Math.min(1, need > 0 ? xp / need : 0));

  const focused =
    tower.id === gr.e.selectedTowerId ||
    tower.id === gr.e.highlightTowerId ||
    Math.hypot(gr.e.pointer.x - tower.x, gr.e.pointer.y - tower.y) <= tower.visualRadius;

  const tiers = Math.max(1, tower.maxLevel);
  const total = ORB_R * 2 + GAP + BAR_W + GAP + PIP_W;
  let x = tower.x - total / 2;
  const y = tower.y + spriteRadius(gr, tower.type, tower.visualRadius) + 9;

  ctx.save();
  ctx.globalAlpha = focused ? 1 : 0.55;

  // The orb: the same sphere the HUD orbs are built from — a lit-from-upper-left
  // radial bed, a keyline, and a gloss dab — shrunk to hold two digits.
  const ocx = x + ORB_R;
  const bed = ctx.createRadialGradient(ocx - ORB_R * 0.24, y - ORB_R * 0.4, 0, ocx, y, ORB_R * 1.4);
  bed.addColorStop(0, '#4c4740');
  bed.addColorStop(1, '#16140f');
  ctx.beginPath();
  ctx.arc(ocx, y, ORB_R, 0, Math.PI * 2);
  ctx.fillStyle = bed;
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = '#15130f';
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(ocx - ORB_R * 0.28, y - ORB_R * 0.42, ORB_R * 0.36, ORB_R * 0.22, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.fill();

  ctx.font = "bold 9px 'RuneScape', Arial";
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = maxed ? '#ffd83d' : '#4be23c';
  ctx.shadowColor = 'rgba(0,0,0,0.9)';
  ctx.shadowBlur = 2;
  ctx.fillText(String(level), ocx, y + 0.5);
  ctx.shadowBlur = 0;
  x += ORB_R * 2 + GAP;

  // XP track: keyline, sunken bed, green fill — .rs-progress at 3px.
  ctx.fillStyle = '#100d09';
  ctx.fillRect(x - 1, y - BAR_H / 2 - 1, BAR_W + 2, BAR_H + 2);
  const bar = ctx.createLinearGradient(0, y - BAR_H / 2, 0, y + BAR_H / 2);
  bar.addColorStop(0, '#1a140c');
  bar.addColorStop(1, '#0d0a06');
  ctx.fillStyle = bar;
  ctx.fillRect(x, y - BAR_H / 2, BAR_W, BAR_H);
  if (progress > 0) {
    const fill = ctx.createLinearGradient(0, y - BAR_H / 2, 0, y + BAR_H / 2);
    fill.addColorStop(0, maxed ? '#ffe06b' : '#6ee06e');
    fill.addColorStop(1, maxed ? '#c08a10' : '#2f8a2f');
    ctx.fillStyle = fill;
    ctx.fillRect(x, y - BAR_H / 2, Math.max(1, BAR_W * progress), BAR_H);
  }
  x += BAR_W + GAP;

  // Tier pips, stacked bottom-up like a meter: tier 1 is the bottom rung.
  const colH = (tiers - 1) * PIP_STEP + PIP_H;
  for (let i = 0; i < tiers; i++) {
    const py = y + colH / 2 - PIP_H - i * PIP_STEP;
    ctx.fillStyle = '#100d09';
    ctx.fillRect(x - 0.5, py - 0.5, PIP_W + 1, PIP_H + 1);
    ctx.fillStyle = i < tower.level ? '#ff981f' : '#2a2118';
    ctx.fillRect(x, py, PIP_W, PIP_H);
  }

  ctx.restore();
}

/** Staff-body sprite key for a wizard, reflecting its spellbook & element
 *  (Elemental staff / Ancient sceptre variant / utility staff); null otherwise. */
export function wizardStaffKey(gr: GameRenderer, tower: { type: string; mageMode?: string; element?: string; ancientType?: string }): string | undefined {
  if (tower.type !== 'wizard') return undefined;
  const mode = tower.mageMode ?? 'elemental';
  if (mode === 'elemental') return `wizard_elemental_${tower.element ?? 'air'}`;
  if (mode === 'ancients') return `wizard_ancient_${tower.ancientType ?? 'ice'}`;
  return 'wizard_utility';
}

/** The image a tower currently renders with (staff variant → tier → base) plus
 *  the resolved key, or null when none has loaded — shared by the sprite draw and
 *  the aura glow (the key doubles as the glow-sprite cache key). */
export function towerImageEntry(gr: GameRenderer, tower: Tower): { img: HTMLImageElement; key: string } | null {
  const keys = [wizardStaffKey(gr, tower), `${tower.type}_${tower.level}`, `${tower.type}_1`].filter(Boolean) as string[];
  const key = keys.find(k => gr.e.imageOk(k));
  return key ? { img: gr.e.images.get(key)!, key } : null;
}

export function towerImage(gr: GameRenderer, tower: Tower): HTMLImageElement | null {
  return towerImageEntry(gr, tower)?.img ?? null;
}

/** A tower's coloured glow silhouette, baked once and reused. The offscreen
 *  canvas holds the sprite plus its blurred coloured halo; drawn *under* the real
 *  sprite, the opaque centre is covered and only the halo bleeds past the edge. */
export function glowSprite(gr: GameRenderer, img: HTMLImageElement, imageKey: string, color: string, size: number): HTMLCanvasElement | null {
  const key = `${imageKey}|${color}|${size}`;
  const cached = gr.glowCache.get(key);
  if (cached) return cached;
  const pad = gr.GLOW_PAD;
  const canvas = document.createElement('canvas');
  canvas.width = size + pad * 2;
  canvas.height = size + pad * 2;
  const g = canvas.getContext('2d');
  if (!g) return null;
  g.shadowColor = color;
  g.shadowBlur = 12;
  // A few passes deepen the halo — done ONCE here, not every frame per tower.
  for (let i = 0; i < 3; i++) g.drawImage(img, pad, pad, size, size);
  gr.glowCache.set(key, canvas);
  return canvas;
}

/** TzHaar towers are whole NPC models — tall, narrow figures — while every
 *  other tower is an item icon or a squat cannon that fills its frame, so at
 *  the shared radius the size-2 giants read punier than a crossbow. Scale
 *  the *drawing* only; range/placement/selection radii are untouched. */
const SPRITE_SCALE: Record<string, number> = { tzhaar: 1.5 };

export function spriteRadius(gr: GameRenderer, type: string, radius: number): number {
  return radius * (SPRITE_SCALE[type] ?? 1);
}

export function drawTowerSprite(gr: GameRenderer, 
  ctx: CanvasRenderingContext2D,
  type: string,
  level: number,
  x: number,
  y: number,
  radius: number,
  preferredKey?: string,
) {
  radius = spriteRadius(gr, type, radius);
  const keys = [preferredKey, `${type}_${level}`, `${type}_1`].filter(Boolean) as string[];
  const key = keys.find(k => gr.e.imageOk(k));
  if (key) {
    const img = gr.e.images.get(key)!;
    const size = radius * 2;
    ctx.drawImage(img, x - radius, y - radius, size, size);
  } else {
    ctx.fillStyle = TOWERS[type]?.tiers[0].color ?? '#ccc';
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }
}
