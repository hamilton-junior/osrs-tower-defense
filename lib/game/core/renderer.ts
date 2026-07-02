import type { GameEngine, HitsplatKind } from './engine';
import { SPAWN_ANIM_SECONDS } from '../types';
import type { Tower, TowerType, Enemy } from '../types';
import { SPOTANIMS, spotAnimDurationS } from '../data/spotanims';
import { ENEMY_ANIMS, clipFrame, clipDurationS } from '../data/enemy-anims';
import { TOWERS } from '../data/towers';
import { isValidPlacement, squareRange, pointToSegmentDistance } from '../systems/geometry';
import { ELEMENTS, spellSpriteName } from '../systems/magic';
import { AFFIX_DEFS, SHIELD_HP_FRAC } from '../systems/affixes';
import { ZULRAH_PHASES } from '../systems/boss-mechanics';

const GRID = 32;

/** Radius (logic px) around the spawn portal within which an enemy is still
 *  "inside" it — its HP bar / overlays stay hidden until it walks clear, so
 *  nothing pokes through the gateway. */
const PORTAL_MASK_R = 50;

/** OSRS Template:Hitsplat colours, keyed by hitsplat kind. */
const HITSPLAT_COLORS: Record<HitsplatKind, string> = {
  hit: '#9e1414',     // red damage
  miss: '#3056c8',    // blue 0 / block
  poison: '#1a8c1a',  // green poison
  venom: '#0b5c0b',   // dark-green venom
  burn: '#cc6a16',    // orange fire DoT
  heal: '#7b2fb0',    // purple heal
};

/** All Canvas 2D drawing for a frame. Reads engine state through `this.e`. */
export class GameRenderer {
  constructor(private e: GameEngine) {}

  /** Scratch buffer for alpha-masked sprite tints (hit-flash). Lazily sized. */
  private flashBuf?: HTMLCanvasElement;
  private flashCtx?: CanvasRenderingContext2D | null;

  /**
   * Draw `img` (a source region) to `ctx` at the current transform, with a red
   * hit-flash that is **clipped to the sprite's own silhouette**.
   *
   * Tinting on the main canvas with `source-atop` doesn't work: the destination
   * there is the opaque map background, so the red fills the whole sprite box.
   * Instead we composite on an offscreen buffer whose only opaque pixels are the
   * sprite itself — `source-atop` then masks the red by the sprite's alpha — and
   * blit that tinted silhouette over the already-drawn sprite.
   */
  private drawFlashTint(
    ctx: CanvasRenderingContext2D,
    img: CanvasImageSource,
    sx: number, sy: number, sw: number, sh: number,
    dx: number, dy: number, dw: number, dh: number,
    flash: number,
    color = '#e00000',
  ) {
    if (!this.flashBuf) {
      this.flashBuf = document.createElement('canvas');
      this.flashCtx = this.flashBuf.getContext('2d');
    }
    const buf = this.flashBuf;
    const bctx = this.flashCtx;
    if (!bctx) return;
    if (buf.width !== sw || buf.height !== sh) { buf.width = sw; buf.height = sh; }
    bctx.clearRect(0, 0, sw, sh);
    bctx.globalCompositeOperation = 'source-over';
    bctx.globalAlpha = 1;
    bctx.imageSmoothingEnabled = false;
    bctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
    // `color` only where the sprite is opaque (masked by its alpha).
    bctx.globalCompositeOperation = 'source-atop';
    bctx.globalAlpha = Math.min(1, flash) * 0.6;
    bctx.fillStyle = color;
    bctx.fillRect(0, 0, sw, sh);
    bctx.globalCompositeOperation = 'source-over';
    bctx.globalAlpha = 1;
    // Blit the tinted silhouette over the sprite at the caller's transform.
    ctx.drawImage(buf, 0, 0, sw, sh, dx, dy, dw, dh);
  }

  draw() {
    const { ctx } = this.e;
    if (!ctx || this.e.canvas.width === 0) return;

    ctx.save();
    ctx.imageSmoothingEnabled = false;
    this.drawBackground(ctx);
    this.drawPath(ctx);
    this.drawDangerZone(ctx);
    this.drawHoverRange(ctx);
    this.drawPlacementGhost(ctx);
    this.drawTowers(ctx);
    this.drawDeaths(ctx);
    this.drawSpawnPortal(ctx); // before enemies → they materialise out of its face
    this.drawEnemies(ctx);
    this.drawEffects(ctx); // baked spotanims (spawn flash) over the emerging enemy
    this.drawProjectiles(ctx);
    this.drawParticles(ctx);
    this.drawFx(ctx); // procedural roguelite VFX (chain bolts / cleave + shockwave rings)
    this.drawHitsplats(ctx);
    this.drawVignette(ctx);
    this.drawBossBar(ctx);
    this.drawLowHealthWarning(ctx);
    this.drawLeakFlash(ctx);
    ctx.restore();
  }

  private drawBackground(ctx: CanvasRenderingContext2D) {
    const w = this.e.width;
    const h = this.e.height;
    const biome = this.e.biome;

    // Ground base with a soft vertical gradient (biome-themed).
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, biome.bgTop);
    grad.addColorStop(1, biome.bgBottom);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Texture: scattered ground tufts (two tones) for a less flat field.
    for (let i = 0; i < 220; i++) {
      const x = (i * 137.5) % w;
      const y = (i * 224.7) % h;
      ctx.fillStyle = i % 3 === 0 ? biome.tuft[0] : biome.tuft[1];
      ctx.fillRect(x, y, 2, 2);
      ctx.fillRect(x + 2, y + 2, 2, 4);
    }

    this.drawDecorations(ctx, w, h);

    // Faint tile grid (biome-tinted).
    ctx.strokeStyle = biome.grid;
    ctx.lineWidth = 1;
    for (let x = 0; x <= w; x += GRID) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 0; y <= h; y += GRID) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
  }

  /** Shortest distance from a point to the path polyline. */
  private distToPath(x: number, y: number): number {
    const path = this.e.path;
    let min = Infinity;
    for (let i = 0; i < path.length - 1; i++) {
      min = Math.min(min, pointToSegmentDistance(x, y, path[i], path[i + 1]));
    }
    return min;
  }

  /** Scatter deterministic off-path scenery (bushes, rocks, flowers) in the
   *  active biome's palette. */
  private drawDecorations(ctx: CanvasRenderingContext2D, w: number, h: number) {
    const { bush, rock, rockHi, flowers } = this.e.biome.decor;
    const hash = (n: number) => {
      const v = Math.sin(n) * 43758.5453;
      return v - Math.floor(v); // fractional part in [0,1)
    };
    for (let i = 0; i < 70; i++) {
      // Hashed pseudo-random placement, stable across frames.
      const x = hash(i * 12.9898) * w;
      const y = hash(i * 78.233) * h;
      if (this.distToPath(x, y) < 48) continue; // keep the road clear
      const kind = i % 5;
      if (kind === 0 || kind === 1) {
        // bush
        ctx.fillStyle = bush;
        ctx.beginPath();
        ctx.arc(x, y, 7, 0, Math.PI * 2);
        ctx.arc(x + 6, y + 2, 5, 0, Math.PI * 2);
        ctx.arc(x - 5, y + 2, 5, 0, Math.PI * 2);
        ctx.fill();
      } else if (kind === 2) {
        // rock
        ctx.fillStyle = rock;
        ctx.beginPath();
        ctx.ellipse(x, y, 6, 4, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = rockHi;
        ctx.fillRect(x - 3, y - 3, 3, 2);
      } else {
        // flower cluster
        ctx.fillStyle = flowers[i % flowers.length];
        for (let f = 0; f < 3; f++) {
          ctx.beginPath();
          ctx.arc(x + (f - 1) * 4, y + (f % 2) * 3, 1.8, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }

  private drawPath(ctx: CanvasRenderingContext2D) {
    const path = this.e.path;
    if (path.length < 2) return;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const trace = () => {
      ctx.beginPath();
      ctx.moveTo(path[0].x, path[0].y);
      for (let i = 1; i < path.length; i++) ctx.lineTo(path[i].x, path[i].y);
      ctx.stroke();
    };
    const road = this.e.biome.road;
    const layers: [number, string][] = [
      [50, road.shadow],   // faint ground shadow rim
      [46, road.border],   // dark border
      [40, road.mid],      // mid surface
      [32, road.walked],   // walked path
    ];
    for (const [width, color] of layers) {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      trace();
    }
    // Lighter packed centre with a dashed track line.
    ctx.strokeStyle = road.centre;
    ctx.lineWidth = 18;
    trace();
    ctx.setLineDash([10, 16]);
    ctx.strokeStyle = road.dash;
    ctx.lineWidth = 3;
    trace();
    ctx.setLineDash([]);
  }

  /**
   * Spawn portal at the road's entry point. The real OSRS Pest Control void
   * portal (NPC 1739), baked to a looping sprite sheet and played here at the
   * portal point, over a soft procedural halo. Drawn *before* enemies so they
   * materialise out of its glowing face. Falls back to a procedural vortex if
   * the baked sheet hasn't loaded.
   */
  private drawSpawnPortal(ctx: CanvasRenderingContext2D) {
    const path = this.e.path;
    if (path.length < 2) return;
    const t = performance.now() / 1000;
    const pp = this.e.portalPoint; // on-screen point where enemies materialise
    const x = pp.x;
    const y = Math.max(56, Math.min(this.e.height - 56, pp.y));
    const pulse = 0.5 + 0.5 * Math.sin(t * 2.4);

    ctx.save();
    ctx.translate(x, y);

    // Soft otherworldly halo behind the disc, breathing with the pulse.
    const haloR = 64 + pulse * 6;
    const halo = ctx.createRadialGradient(0, 0, 6, 0, 0, haloR);
    halo.addColorStop(0, `rgba(170,90,235,${0.34 + pulse * 0.16})`);
    halo.addColorStop(0.5, `rgba(120,60,190,${0.12 + pulse * 0.07})`);
    halo.addColorStop(1, 'rgba(110,50,180,0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(0, 0, haloR, 0, Math.PI * 2);
    ctx.fill();

    const portal = SPOTANIMS.portal;
    if (this.e.imageOk('spotanim_portal')) {
      // Looping baked void-portal disc — current frame from wall-clock time.
      const img = this.e.images.get('spotanim_portal')!;
      const total = spotAnimDurationS(portal) * 1000;
      let rem = ((performance.now() % total) + total) % total;
      let fi = 0;
      for (; fi < portal.frames - 1; fi++) {
        if (rem < portal.frameMs[fi]) break;
        rem -= portal.frameMs[fi];
      }
      const s = portal.size + pulse * 4;
      ctx.drawImage(img, fi * portal.frameW, 0, portal.frameW, portal.frameH, -s / 2, -s / 2, s, s);
      ctx.restore();
      return;
    }

    // ---- Fallback: procedural vortex (until the baked sheet loads) ----------
    const RX = 26 + pulse * 2;
    const RY = 50 + pulse * 3;

    // 2) Inward-rippling tunnel: vertical ellipses that continuously march toward
    // the throat (phase wraps over time) and fade at both ends, so the energy
    // reads as being *pulled in* — the classic portal funnel.
    const RINGS = 6;
    for (let i = 0; i < RINGS; i++) {
      const phase = ((i / RINGS) + t * 0.35) % 1; // 0 at rim → 1 at throat
      const k = 1 - phase * 0.85; // radius fraction: rim (1) → throat (~0.15)
      const fade = Math.sin(phase * Math.PI); // fade in at rim, out at throat
      const r = Math.round(150 + 90 * k);
      const g = Math.round(50 + 25 * (1 - k));
      const b = Math.round(180 + 50 * k);
      ctx.save();
      ctx.globalAlpha = 0.5 * fade;
      ctx.strokeStyle = `rgb(${r},${g},${b})`;
      ctx.lineWidth = 1.5 + k * 2;
      ctx.beginPath();
      ctx.ellipse(0, 0, RX * k, RY * k, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // 2b) Two spiral arms slowly rotating, to give the swirl a clear direction.
    ctx.save();
    ctx.rotate(t * 0.8);
    ctx.globalAlpha = 0.3;
    ctx.strokeStyle = '#c98bff';
    ctx.lineWidth = 2;
    for (let arm = 0; arm < 2; arm++) {
      ctx.beginPath();
      for (let s = 0; s <= 1.0001; s += 0.05) {
        const ang = arm * Math.PI + s * Math.PI * 1.6;
        const ex = Math.cos(ang) * RX * s;
        const ey = Math.sin(ang) * RY * s;
        if (s === 0) ctx.moveTo(ex, ey);
        else ctx.lineTo(ex, ey);
      }
      ctx.stroke();
    }
    ctx.restore();

    // 3) Bright energy rim around the gateway mouth.
    ctx.save();
    ctx.globalAlpha = 0.55 + pulse * 0.3;
    ctx.strokeStyle = '#d59bff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, 0, RX, RY, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    // 4) A couple of bright sparks orbiting the throat (clipped to the mouth).
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(0, 0, RX, RY, 0, 0, Math.PI * 2);
    ctx.clip();
    for (let k = 0; k < 5; k++) {
      const a = t * 1.6 + (k * Math.PI * 2) / 5;
      const rr = 0.35 + 0.55 * (0.5 + 0.5 * Math.sin(t * 0.9 + k * 1.7));
      const ex = Math.cos(a) * RX * rr;
      const ey = Math.sin(a) * RY * rr;
      ctx.globalAlpha = 0.5 + 0.4 * Math.sin(t * 3 + k);
      ctx.fillStyle = k % 2 ? '#e9c6ff' : '#8be0ff';
      ctx.beginPath();
      ctx.arc(ex, ey, 1.8, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // 5) Dark throat at the centre — the mouth enemies emerge from, drawn last so
    // freshly-spawned (still materialising) mobs read as stepping out of it.
    const mouth = ctx.createRadialGradient(0, 0, 1, 0, 0, RX * 0.85);
    mouth.addColorStop(0, 'rgba(6,2,14,0.95)');
    mouth.addColorStop(0.6, 'rgba(26,11,42,0.6)');
    mouth.addColorStop(1, 'rgba(52,23,72,0)');
    ctx.save();
    ctx.scale(1, RY / RX);
    ctx.fillStyle = mouth;
    ctx.beginPath();
    ctx.arc(0, 0, RX * 0.85, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.restore();
  }

  /**
   * Baked spotanim (GFX) effects — one-shot sprite-sheet animations the engine
   * queues at a point (e.g. the teleport-gem flash as an enemy materialises).
   * Drawn additively ('lighter') for the in-game energy glow, with a short
   * fade-out at the tail so it dissolves rather than cutting off.
   */
  private drawEffects(ctx: CanvasRenderingContext2D) {
    for (const fx of this.e.spotEffects) {
      const meta = SPOTANIMS[fx.slug];
      const key = `spotanim_${fx.slug}`;
      if (!meta || !this.e.imageOk(key)) continue;
      const img = this.e.images.get(key)!;

      // Current frame from accumulated per-frame timings (scaled by speed).
      let rem = fx.age * 1000 * meta.speed;
      let fi = 0;
      for (; fi < meta.frames - 1; fi++) {
        if (rem < meta.frameMs[fi]) break;
        rem -= meta.frameMs[fi];
      }
      const prog = fx.age / spotAnimDurationS(meta);
      const fade = prog > 0.7 ? Math.max(0, 1 - (prog - 0.7) / 0.3) : 1;

      ctx.save();
      // 'add' glows (energy/light GFX); 'alpha' is the client's plain
      // translucency — dark GFX (smoke/shadow) vanish under additive.
      ctx.globalCompositeOperation = meta.blend === 'add' ? 'lighter' : 'source-over';
      ctx.globalAlpha = 0.92 * fade;
      const s = meta.size * (fx.scale ?? 1);
      ctx.drawImage(img, fi * meta.frameW, 0, meta.frameW, meta.frameH, fx.x - s / 2, fx.y - s / 2, s, s);
      ctx.restore();
    }
  }

  /**
   * Danger zone at the road's exit edge: where enemies that get through deal
   * damage. Always faintly glowing, and flares red on a leak (`baseFlash`).
   */
  private drawDangerZone(ctx: CanvasRenderingContext2D) {
    const path = this.e.path;
    if (path.length < 2) return;
    const t = performance.now() / 1000;
    const bf = this.e.baseFlash;
    const y = Math.max(24, Math.min(this.e.height - 24, path[path.length - 1].y));
    const x = this.e.width; // right edge
    const pulse = 0.5 + 0.5 * Math.sin(t * 2.5);
    const intensity = Math.min(0.9, 0.16 + pulse * 0.12 + bf * 0.7);

    ctx.save();
    ctx.translate(x, y);
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

  /** Brief full-screen red wash when the base takes a leak. */
  private drawLeakFlash(ctx: CanvasRenderingContext2D) {
    const bf = this.e.baseFlash;
    if (bf <= 0) return;
    ctx.fillStyle = `rgba(180,0,0,${bf * 0.14})`;
    ctx.fillRect(0, 0, this.e.width, this.e.height);
  }

  /** Faint range preview when hovering an idle tower (before selecting it). */
  private drawHoverRange(ctx: CanvasRenderingContext2D) {
    if (this.e.selectedTowerType || this.e.movingTower) return;
    const { x, y } = this.e.pointer;
    const hovered = this.e.towers.find(
      t => t.id !== this.e.selectedTowerId && Math.abs(t.x - x) <= 18 && Math.abs(t.y - y) <= 18,
    );
    if (!hovered) return;
    const range = this.e.effectiveStats(hovered.id)?.range ?? hovered.range;
    this.drawSquareRange(
      ctx, hovered.x, hovered.y, squareRange(range, GRID),
      'rgba(255,255,255,0.2)', 'rgba(255,255,255,0.03)',
    );
  }

  /** Draw an axis-aligned, tile-aligned square range marker centred on (cx, cy). */
  private drawSquareRange(
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
    ctx.strokeStyle = stroke;
    ctx.setLineDash([6, 6]);
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, size, size);
    ctx.setLineDash([]);
  }

  private drawPlacementGhost(ctx: CanvasRenderingContext2D) {
    // On-map tower picker open: highlight the tapped tile so the popup's choice
    // is clearly anchored to where the tower will go.
    const pending = this.e.pendingPlacement;
    if (pending && !this.e.movingTower && !this.e.selectedTowerType) {
      const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 250);
      this.drawSquareRange(
        ctx, pending.x, pending.y, GRID / 2,
        `rgba(255,225,120,${0.5 + pulse * 0.4})`, 'rgba(255,225,120,0.12)',
      );
    }

    // Either placing a new tower (selectedTowerType) or relocating one (movingTower).
    const moving = this.e.movingTower;
    const type = moving ? moving.type : this.e.selectedTowerType;
    if (!type) return;
    const sx = Math.round(this.e.pointer.x / GRID) * GRID;
    const sy = Math.round(this.e.pointer.y / GRID) * GRID;
    const others = moving ? this.e.towers.filter(t => t.id !== moving.id) : this.e.towers;
    const affordable = moving ? this.e.money >= this.e.moveTowerCost(moving) : this.e.money >= this.e.towerCost(type);
    const valid = affordable && isValidPlacement(sx, sy, this.e.path, others);
    const level = moving ? moving.level : 1;
    // Show the *effective* range (run mods, global upgrades, nearby Utility auras),
    // so what the preview circle promises is what the placed tower actually gets.
    const range = moving
      ? (this.e.effectiveStats(moving.id)?.range ?? moving.range)
      : this.e.previewStats(type, sx, sy).range;

    this.drawSquareRange(
      ctx, sx, sy, squareRange(range, GRID),
      valid ? 'rgba(0,255,0,0.5)' : 'rgba(255,0,0,0.5)',
      valid ? 'rgba(0,255,0,0.06)' : 'rgba(255,0,0,0.06)',
    );

    // If a radius-based synergy is active, show its reach around this spot so the
    // player can position for it — Lone Wolf's "no towers nearby" zone especially.
    this.drawPlacementSynergy(ctx, sx, sy, type, moving ? moving.id : null);

    ctx.globalAlpha = 0.6;
    // When relocating a wizard, preview its *current* staff (spellbook + element),
    // not the default base sprite — match what the placed tower actually shows.
    const preferredKey = moving ? this.wizardStaffKey(moving) : undefined;
    this.drawTowerSprite(ctx, type, level, sx, sy, moving ? moving.visualRadius : 18, preferredKey);
    ctx.globalAlpha = 1;
  }

  /** While placing/moving, overlay the reach of any active radius-based synergy
   *  (Lone Wolf / Clan Vexillum / Combat Triangle), with live qualify feedback so
   *  "near"/"far" is concrete instead of a number buried in a card description. */
  private drawPlacementSynergy(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    type: TowerType,
    ignoreId: string | null,
  ) {
    const syn = this.e.runFx.synergy;
    const others = this.e.towers.filter(t => t.id !== ignoreId);

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
        label: ok ? `Lone Wolf ✓ ×${syn.loneWolf.mult}` : 'Lone Wolf — tower in range',
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
    for (const it of items) this.drawSynergyCircle(ctx, cx, cy, it.radius, it.stroke, it.fill);
    // Captions: one per line, climbing upward from just above the widest circle.
    const top = cy - Math.max(...items.map(i => i.radius)) - 8;
    items.forEach((it, i) => this.drawSynergyLabel(ctx, cx, top - i * 15, it.stroke, it.label));
  }

  /** A dashed true-circle radius marker with a faint fill. */
  private drawSynergyCircle(
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
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 2;
    ctx.setLineDash([7, 6]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  /** A single synergy caption, drawn with a dark outline so it stays legible. */
  private drawSynergyLabel(ctx: CanvasRenderingContext2D, cx: number, y: number, color: string, label: string) {
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

  /** Fading, shrinking sprites of enemies that just died. */
  private drawDeaths(ctx: CanvasRenderingContext2D) {
    for (const d of this.e.deaths) {
      const t = Math.max(0, d.life / d.maxLife); // 1 → 0
      // `animType` override (a Jad healer dies as `yt_hurkot`), same as drawEnemies.
      const deathSlug = d.animType && ENEMY_ANIMS[d.animType] ? d.animType : d.type;
      const deathClip = ENEMY_ANIMS[deathSlug]?.clips.death;
      const animKey = deathClip ? `enemyanim_${deathSlug}_death` : '';
      if (deathClip && this.e.imageOk(animKey)) {
        // Animated death: play the collapse clip over the fx lifetime, at full
        // size; only fade out in the final stretch so the body settles first.
        const set = ENEMY_ANIMS[deathSlug]!;
        const img = this.e.images.get(animKey)!;
        const elapsed = (d.maxLife - d.life); // 0 → maxLife
        const fi = clipFrame(deathClip, elapsed);
        const ds = (d.isBoss ? 60 : 30) * (d.renderScale ?? 1) * 1.32; // match drawEnemies
        ctx.save();
        ctx.globalAlpha = Math.min(1, t / 0.25); // hold, then fade in the last 25%
        ctx.translate(d.x, d.y);
        // Baked clips face RIGHT (canonical model space, same as static sprites);
        // flip only when travelling left.
        if (d.movingLeft) ctx.scale(-1, 1);
        ctx.drawImage(img, fi * set.frameW, 0, set.frameW, set.frameH, -ds / 2, -ds / 2, ds, ds);
        ctx.restore();
        continue;
      }
      if (!this.e.imageOk(d.type)) continue;
      const img = this.e.images.get(d.type)!;
      const size = (d.isBoss ? 60 : 30) * (d.renderScale ?? 1) * (0.7 + t * 0.3); // shrink slightly
      ctx.save();
      ctx.globalAlpha = t * 0.85;
      ctx.translate(d.x, d.y - (1 - t) * 12); // drift up a touch
      if (d.movingLeft) ctx.scale(-1, 1);
      ctx.drawImage(img, -size / 2, -size / 2, size, size);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  /** Soft darkened edges to focus the eye on the battlefield. */
  private drawVignette(ctx: CanvasRenderingContext2D) {
    const w = this.e.width;
    const h = this.e.height;
    const grad = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.72);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.38)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  }

  /** Large boss health bar across the top while a boss is on the field. */
  private drawBossBar(ctx: CanvasRenderingContext2D) {
    const boss = this.e.enemies.find(en => en.isBoss);
    if (!boss) return;
    const w = this.e.width;
    const barW = Math.min(560, w * 0.5);
    const barH = 16;
    const x = (w - barW) / 2;
    const y = 18;
    const ratio = Math.max(0, boss.hp / boss.maxHp);

    ctx.save();
    // frame
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(x - 4, y - 4, barW + 8, barH + 8);
    ctx.fillStyle = '#2a0606';
    ctx.fillRect(x, y, barW, barH);
    // fill
    const grad = ctx.createLinearGradient(x, 0, x + barW, 0);
    grad.addColorStop(0, '#e23a3a');
    grad.addColorStop(1, '#8a0000');
    ctx.fillStyle = grad;
    ctx.fillRect(x, y, barW * ratio, barH);
    ctx.strokeStyle = '#c8a44a';
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, barW, barH);
    // label
    ctx.fillStyle = '#ffcb05';
    ctx.font = "bold 14px 'RuneScape', Arial";
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${boss.name}   ${Math.ceil(boss.hp)} / ${boss.maxHp}`, w / 2, y + barH / 2 + 1);
    // Phase caption under the bar: Zulrah's current form (weak style) or Vorkath's
    // ice-shield warning — so the mechanic is legible without watching the tint.
    const st = boss.bossState;
    let caption: string | null = null;
    let capColor = '#cfe8ff';
    if (st?.kind === 'zulrah') {
      const phase = ZULRAH_PHASES[st.phaseIndex % ZULRAH_PHASES.length];
      caption = `${phase.name} — weak to ${phase.weak}`;
      capColor = phase.color;
    } else if (st?.kind === 'vorkath' && st.immune) {
      caption = 'ICE SHIELD — immune!';
      capColor = '#bfe9ff';
    } else if (st?.kind === 'jad' && boss.hp <= boss.maxHp * 0.5 && this.e.enemies.some(en => en.healer)) {
      caption = 'Healers active — kill them!';
      capColor = '#7dff9a';
    }
    if (caption) {
      ctx.font = "bold 12px 'RuneScape', Arial";
      ctx.fillStyle = capColor;
      ctx.fillText(caption, w / 2, y + barH + 11);
    }
    ctx.textBaseline = 'alphabetic';
    ctx.restore();
  }

  /** Pulsing red screen edge when the player is down to their last few lives. */
  private drawLowHealthWarning(ctx: CanvasRenderingContext2D) {
    if (this.e.gameOver || this.e.lives <= 0 || this.e.lives > 5) return;
    const w = this.e.width;
    const h = this.e.height;
    const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 1000 * 4);
    // Stronger as lives approach zero, breathing via the pulse.
    const intensity = (1 - (this.e.lives - 1) / 5) * (0.25 + pulse * 0.35);
    const grad = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.4, w / 2, h / 2, Math.max(w, h) * 0.7);
    grad.addColorStop(0, 'rgba(200,0,0,0)');
    grad.addColorStop(1, `rgba(200,0,0,${intensity})`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  }

  private drawTowers(ctx: CanvasRenderingContext2D) {
    // Last Stand (curse): while the run is at/below its threshold, every tower is
    // enraged (damage up) — a red, pulsing ground ring marks the active state.
    const ls = this.e.runFx.lastStand;
    const enraged = !!ls && !this.e.gameOver && this.e.lives <= ls.belowLives;
    const enragePulse = 0.5 + 0.5 * Math.sin(performance.now() / 240);

    for (const tower of this.e.towers) {
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
      if (tower.id === this.e.selectedTowerId) {
        const range = this.e.effectiveStats(tower.id)?.range ?? tower.range;
        this.drawSquareRange(ctx, tower.x, tower.y, squareRange(range, GRID), 'rgba(255,255,255,0.35)', 'rgba(255,255,255,0.05)');
        // Sight line to the current target, so the priority setting is legible.
        const target = tower.targetId ? this.e.enemies.find(en => en.id === tower.targetId) : null;
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

      // Placement-synergy aura: a glowing outline that hugs the tower's own
      // silhouette (not a ground circle) whenever the roguelite synergy cards are
      // buffing it, tinted by the dominant synergy (green pack / gold trinity /
      // orange vanguard / cyan lone wolf). The sprite is redrawn a few times in
      // the tint colour with a blurred shadow *before* the real sprite, which then
      // covers the centre and leaves a coloured contour around the edges.
      // Marquee multi-selection: a cyan tile marker so the batch-upgrade set is
      // clearly readable while the drag-box panel is open.
      if (this.e.multiSelectedIds.includes(tower.id)) {
        this.drawSquareRange(ctx, tower.x, tower.y, GRID / 2 + 2, 'rgba(110,220,255,0.9)', 'rgba(110,220,255,0.16)');
      }

      const aura = this.e.towerSynergyAura(tower);
      const auraEntry = aura ? this.towerImageEntry(tower) : null;

      // Aim + recoil: nudge the sprite back along the firing direction and
      // pulse its scale; flip horizontally to face the target. The aura is drawn
      // inside the SAME transform so the glow recoils and flips with the sprite.
      const recoil = tower.recoil ?? 0;
      const angle = tower.recoilAngle ?? 0;
      const back = recoil * 4;
      const pulse = 1 + recoil * 0.12;
      const flip = Math.cos(angle) < 0 ? -1 : 1;
      ctx.save();
      ctx.translate(tower.x - Math.cos(angle) * back, tower.y - Math.sin(angle) * back);
      ctx.scale(flip * pulse, pulse);
      if (aura && auraEntry) {
        // Draw a *pre-baked* coloured glow sprite (blur done once, off the hot path)
        // and animate only its opacity — cheap even with a screen full of towers.
        const r = tower.visualRadius;
        const size = Math.round(r * 2);
        const glowSprite = this.glowSprite(auraEntry.img, auraEntry.key, aura.color, size);
        if (glowSprite) {
          const intensity = Math.min(1, (aura.mult - 1) / 0.6); // 0..1 by buff strength
          const pulseGlow = 0.5 + 0.5 * Math.sin(performance.now() / 520);
          const pad = GameRenderer.GLOW_PAD;
          ctx.save();
          ctx.globalAlpha = (0.45 + 0.4 * intensity) * (0.75 + 0.25 * pulseGlow);
          ctx.drawImage(glowSprite, -r - pad, -r - pad, size + pad * 2, size + pad * 2);
          ctx.restore();
        }
      }
      this.drawTowerSprite(ctx, tower.type, tower.level, 0, 0, tower.visualRadius, this.wizardStaffKey(tower));
      ctx.restore();

      // Spell icon: a wizard wears the icon of the spell it currently casts
      // (Fire Wave / Ice Barrage / …) centred on the staff body, drawn outside
      // the flip/recoil transform so it stays put instead of floating when the
      // staff turns to face a target. Aspect-preserved so it isn't squashed.
      const spell = spellSpriteName(tower);
      const badgeKey = spell ? `spell_${spell}` : null;
      if (badgeKey && this.e.imageOk(badgeKey)) {
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.6)';
        ctx.shadowBlur = 3;
        this.drawImageContain(ctx, this.e.images.get(badgeKey)!, tower.x, tower.y, tower.visualRadius * 1.05);
        ctx.restore();
      }

      // level pip
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 11px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(String(tower.level), tower.x, tower.y + tower.visualRadius + 8);
    }
  }

  /** Staff-body sprite key for a wizard, reflecting its spellbook & element
   *  (Elemental staff / Ancient sceptre variant / utility staff); null otherwise. */
  private wizardStaffKey(tower: { type: string; mageMode?: string; element?: string; ancientType?: string }): string | undefined {
    if (tower.type !== 'wizard') return undefined;
    const mode = tower.mageMode ?? 'elemental';
    if (mode === 'elemental') return `wizard_elemental_${tower.element ?? 'air'}`;
    if (mode === 'ancients') return `wizard_ancient_${tower.ancientType ?? 'ice'}`;
    return 'wizard_utility';
  }

  /** The image a tower currently renders with (staff variant → tier → base) plus
   *  the resolved key, or null when none has loaded — shared by the sprite draw and
   *  the aura glow (the key doubles as the glow-sprite cache key). */
  private towerImageEntry(tower: Tower): { img: HTMLImageElement; key: string } | null {
    const keys = [this.wizardStaffKey(tower), `${tower.type}_${tower.level}`, `${tower.type}_1`].filter(Boolean) as string[];
    const key = keys.find(k => this.e.imageOk(k));
    return key ? { img: this.e.images.get(key)!, key } : null;
  }

  private towerImage(tower: Tower): HTMLImageElement | null {
    return this.towerImageEntry(tower)?.img ?? null;
  }

  /** Padding (logic px) around a baked glow sprite so its blurred halo isn't clipped. */
  private static readonly GLOW_PAD = 12;
  /** Cache of pre-rendered synergy-aura glow sprites, keyed by image+colour+size.
   *  Baking the blurred silhouette once (offscreen) turns the per-frame cost from
   *  "3 shadow-blurred drawImage passes per tower" into a single plain drawImage —
   *  the fix for the frame-rate collapse with many buffed towers. */
  private glowCache = new Map<string, HTMLCanvasElement>();

  /** A tower's coloured glow silhouette, baked once and reused. The offscreen
   *  canvas holds the sprite plus its blurred coloured halo; drawn *under* the real
   *  sprite, the opaque centre is covered and only the halo bleeds past the edge. */
  private glowSprite(img: HTMLImageElement, imageKey: string, color: string, size: number): HTMLCanvasElement | null {
    const key = `${imageKey}|${color}|${size}`;
    const cached = this.glowCache.get(key);
    if (cached) return cached;
    const pad = GameRenderer.GLOW_PAD;
    const canvas = document.createElement('canvas');
    canvas.width = size + pad * 2;
    canvas.height = size + pad * 2;
    const g = canvas.getContext('2d');
    if (!g) return null;
    g.shadowColor = color;
    g.shadowBlur = 12;
    // A few passes deepen the halo — done ONCE here, not every frame per tower.
    for (let i = 0; i < 3; i++) g.drawImage(img, pad, pad, size, size);
    this.glowCache.set(key, canvas);
    return canvas;
  }

  private drawTowerSprite(
    ctx: CanvasRenderingContext2D,
    type: string,
    level: number,
    x: number,
    y: number,
    radius: number,
    preferredKey?: string,
  ) {
    const keys = [preferredKey, `${type}_${level}`, `${type}_1`].filter(Boolean) as string[];
    const key = keys.find(k => this.e.imageOk(k));
    if (key) {
      const img = this.e.images.get(key)!;
      const size = radius * 2;
      ctx.drawImage(img, x - radius, y - radius, size, size);
    } else {
      ctx.fillStyle = TOWERS[type]?.tiers[0].color ?? '#ccc';
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /** Draw an image centred at (cx,cy) fit inside a `box`-px square, preserving
   *  its aspect ratio (like CSS object-contain) so it never looks stretched. */
  private drawImageContain(ctx: CanvasRenderingContext2D, img: HTMLImageElement, cx: number, cy: number, box: number) {
    const ratio = img.naturalWidth && img.naturalHeight ? img.naturalWidth / img.naturalHeight : 1;
    let w = box, h = box;
    if (ratio > 1) h = box / ratio; else w = box * ratio;
    ctx.drawImage(img, cx - w / 2, cy - h / 2, w, h);
  }

  private drawEnemies(ctx: CanvasRenderingContext2D) {
    // When an Elemental wizard is selected, mark enemies weak to its element
    // (in that element's colour) so the player can see good targets.
    const sel = this.e.selectedTowerId ? this.e.towers.find(t => t.id === this.e.selectedTowerId) : null;
    const markEl = sel && sel.type === 'wizard' && (sel.mageMode ?? 'elemental') === 'elemental' ? (sel.element ?? 'air') : null;
    const markColor = markEl && markEl !== 'none' ? ELEMENTS[markEl].color : null;
    const markPulse = 0.5 + 0.5 * Math.sin(performance.now() / 300);
    const pp = this.e.portalPoint;
    // Jad (if present) — its healers draw a heal-beam back to it.
    const jad = this.e.enemies.find((en) => en.bossState?.kind === 'jad');

    for (const e of this.e.enemies) {
      const isBoss = !!e.isBoss;
      // While still in the portal (materialising or not yet walked clear), hide
      // the HP bar / overlays so nothing pokes through the gateway.
      const inPortal = (e.spawnAnim ?? 0) > 0 || Math.hypot(e.x - pp.x, e.y - pp.y) < PORTAL_MASK_R;
      // Portal materialise: for the first SPAWN_ANIM_SECONDS after emerging the
      // enemy fades in (smoothstep) and grows from 45%→100% (ease-out), so it
      // looks like it's stepping out of the gateway rather than popping in.
      const spawnT = e.spawnAnim && e.spawnAnim > 0 ? 1 - e.spawnAnim / SPAWN_ANIM_SECONDS : 1;
      const matScale = 0.3 + 0.7 * (spawnT * (2 - spawnT)); // easeOutQuad grow
      const matAlpha = spawnT * spawnT * (3 - 2 * spawnT); // smoothstep fade-in
      ctx.save();
      ctx.globalAlpha = matAlpha;
      const size = (isBoss ? 60 : 30) * (e.renderScale ?? 1) * matScale;
      const flash = e.flashTimer && e.flashTimer > 0 ? e.flashTimer / 0.15 : 0;
      // Impact = a slight shake while the hit registers.
      const shx = flash > 0 ? (Math.random() - 0.5) * 6 * flash : 0;
      const shy = flash > 0 ? (Math.random() - 0.5) * 6 * flash : 0;

      // Superior slayer variant: an extremely faint warm shimmer behind the
      // sprite, echoing the sparkle that marks a "Bigger and Badder" spawn.
      if (typeof e.type === 'string' && e.type.startsWith('superior_')) {
        const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 600);
        const glowR = size * 0.62;
        const g = ctx.createRadialGradient(e.x, e.y, glowR * 0.25, e.x, e.y, glowR);
        g.addColorStop(0, `rgba(255, 238, 170, ${0.05 + pulse * 0.06})`);
        g.addColorStop(1, 'rgba(255, 238, 170, 0)');
        ctx.save();
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(e.x, e.y, glowR, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      const movingLeft = (this.e.path[e.pathIndex + 1]?.x ?? e.x) < e.x;
      // `animType` overrides the clip slug (e.g. a Jad healer renders `yt_hurkot`
      // once baked); fall back to `type`'s clip when the override isn't baked.
      const animSlug = e.animType && ENEMY_ANIMS[e.animType] ? e.animType : e.type;
      const animSet = ENEMY_ANIMS[animSlug];
      const hurting = !!animSet?.clips.hurt && (e.hurtAnim ?? 0) > 0;
      const animKey = animSet ? `enemyanim_${animSlug}_${hurting ? 'hurt' : 'walk'}` : '';
      if (animSet && this.e.imageOk(animKey)) {
        // Animated enemy: loop `walk` on alive-time, or play the whole `hurt`
        // flinch (priority over walk) when recently struck. The hurt window is
        // sized to the clip's own duration in `damage`, so `elapsed` counts up
        // from 0 across exactly that clip.
        const clip = hurting ? animSet.clips.hurt! : animSet.clips.walk;
        const img = this.e.images.get(animKey)!;
        const elapsed = hurting ? clipDurationS(clip) - (e.hurtAnim ?? 0) : e.animTime ?? 0;
        const fi = clipFrame(clip, elapsed);
        const fw = animSet.frameW, fh = animSet.frameH;
        // The baked creature fills ~88% of its cell (6% margin/side); scale up to
        // undo that, plus a touch more so the model reads a bit larger on the map.
        const ds = size * 1.32;
        ctx.save();
        ctx.translate(e.x + shx, e.y + shy);
        // Baked clips face RIGHT (canonical model space, same as static sprites);
        // flip only when travelling left, exactly like the static-sprite branch.
        if (movingLeft) ctx.scale(-1, 1);
        ctx.drawImage(img, fi * fw, 0, fw, fh, -ds / 2, -ds / 2, ds, ds);
        if (flash > 0) {
          this.drawFlashTint(ctx, img, fi * fw, 0, fw, fh, -ds / 2, -ds / 2, ds, ds, flash);
        }
        // Zulrah form tint: recolour the serpent to its current phase (green /
        // blue / red) so the player reads which style it's weak to at a glance.
        const zc = e.bossState?.kind === 'zulrah'
          ? ZULRAH_PHASES[e.bossState.phaseIndex % ZULRAH_PHASES.length].color : null;
        if (zc) this.drawFlashTint(ctx, img, fi * fw, 0, fw, fh, -ds / 2, -ds / 2, ds, ds, 0.6, zc);
        ctx.restore();
      } else if (this.e.imageOk(e.type)) {
        const img = this.e.images.get(e.type)!;
        ctx.save();
        ctx.translate(e.x + shx, e.y + shy);
        if (movingLeft) ctx.scale(-1, 1);
        ctx.drawImage(img, -size / 2, -size / 2, size, size);
        if (flash > 0) {
          const sw = img.naturalWidth || size, sh = img.naturalHeight || size;
          this.drawFlashTint(ctx, img, 0, 0, sw, sh, -size / 2, -size / 2, size, size, flash);
        }
        ctx.restore();
      } else {
        const r = isBoss ? 20 : 12;
        ctx.fillStyle = flash > 0 ? '#e00000' : e.color;
        ctx.beginPath();
        ctx.arc(e.x + shx, e.y + shy, r, 0, Math.PI * 2);
        ctx.fill();
      }

      // Yt-HurKot healer flair: a pulsing heal-beam back to Jad + a small heal
      // badge, drawn over the (imp / real Yt-HurKot) body the normal path rendered.
      if (e.healer && !inPortal) this.drawHealerFx(ctx, e, jad, size);

      // Affix auras: a pulsing ring per affix in its themed colour, so an elite
      // enemy reads at a glance (concentric when it carries two).
      if (!inPortal && e.affixes && e.affixes.length) {
        const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 400);
        ctx.save();
        ctx.lineWidth = 2;
        e.affixes.forEach((a, idx) => {
          ctx.strokeStyle = AFFIX_DEFS[a].color;
          ctx.globalAlpha = matAlpha * (0.35 + pulse * 0.35);
          ctx.beginPath();
          ctx.arc(e.x, e.y, (isBoss ? 24 : 15) + idx * 4, 0, Math.PI * 2);
          ctx.stroke();
        });
        ctx.restore();
      }

      // Boss phase telegraphs.
      if (!inPortal && e.bossState) {
        const st = e.bossState;
        if (st.kind === 'zulrah') {
          // A pulsing ring in the current form's colour, echoing the body tint.
          const phase = ZULRAH_PHASES[st.phaseIndex % ZULRAH_PHASES.length];
          const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 320);
          ctx.save();
          ctx.strokeStyle = phase.color;
          ctx.globalAlpha = 0.5 + pulse * 0.4;
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(e.x, e.y, size * 0.62, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        } else if (st.kind === 'vorkath' && st.immune) {
          // Ice shield: a crystalline frosted ring while Vorkath is immune.
          const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 200);
          ctx.save();
          const r = size * 0.66;
          const g = ctx.createRadialGradient(e.x, e.y, r * 0.4, e.x, e.y, r);
          g.addColorStop(0, 'rgba(150,220,255,0)');
          g.addColorStop(1, `rgba(150,220,255,${0.22 + pulse * 0.16})`);
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(e.x, e.y, r, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = `rgba(200,240,255,${0.7 + pulse * 0.3})`;
          ctx.lineWidth = 2;
          for (let k = 0; k < 6; k++) {
            const a = (k / 6) * Math.PI * 2 + performance.now() / 1600;
            ctx.beginPath();
            ctx.moveTo(e.x + Math.cos(a) * r * 0.5, e.y + Math.sin(a) * r * 0.5);
            ctx.lineTo(e.x + Math.cos(a) * r, e.y + Math.sin(a) * r);
            ctx.stroke();
          }
          ctx.restore();
        }
      }

      // health bar — colour shifts green → yellow → red as HP drops. Hidden
      // while the enemy is still in the portal so it doesn't poke through.
      if (!inPortal) {
        const bw = isBoss ? 60 : 30;
        // Lift the bar by any extra sprite height so scaled-up sprites (Zulrah)
        // don't cover it.
        const by = e.y - (isBoss ? 40 : 22) - Math.max(0, ((e.renderScale ?? 1) - 1) * (isBoss ? 30 : 15));
        const ratio = Math.max(0, e.hp / e.maxHp);
        ctx.fillStyle = '#400';
        ctx.fillRect(e.x - bw / 2, by, bw, 4);
        ctx.fillStyle = ratio > 0.5 ? '#3c3' : ratio > 0.25 ? '#e0c020' : '#e23a3a';
        ctx.fillRect(e.x - bw / 2, by, bw * ratio, 4);
        // Shielded affix: a slim cyan pip above the HP bar for the shield left,
        // normalised against the affix's max shield (≈ SHIELD_HP_FRAC of max HP).
        if (e.shieldHp && e.shieldHp > 0) {
          const sratio = Math.min(1, e.shieldHp / Math.max(1, e.maxHp * SHIELD_HP_FRAC));
          ctx.fillStyle = '#13303a';
          ctx.fillRect(e.x - bw / 2, by - 5, bw, 3);
          ctx.fillStyle = '#7fd0ff';
          ctx.fillRect(e.x - bw / 2, by - 5, bw * sratio, 3);
        }
      }

      // Weakness highlight: a pulsing ring in the selected wizard's element.
      if (!inPortal && markColor && e.weakness === markEl) {
        ctx.save();
        ctx.strokeStyle = markColor;
        ctx.globalAlpha = 0.45 + markPulse * 0.4;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(e.x, e.y, isBoss ? 26 : 16, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      ctx.restore(); // end materialise alpha
    }
  }

  /** Yt-HurKot healer flair over its rendered body: a pulsing green heal-beam back
   *  to Jad and a small green cross badge, so it reads as the thing mending Jad and
   *  a target to cut down. The body sprite + HP bar come from the normal enemy path. */
  private drawHealerFx(ctx: CanvasRenderingContext2D, e: Enemy, jad: Enemy | undefined, size: number) {
    const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 240);
    // Heal beam to Jad — a soft green tendril pulsing along its length.
    if (jad) {
      ctx.save();
      ctx.strokeStyle = `rgba(80,220,90,${0.3 + pulse * 0.35})`;
      ctx.lineWidth = 2;
      ctx.shadowColor = 'rgba(80,220,90,0.8)';
      ctx.shadowBlur = 5;
      ctx.setLineDash([3, 4]);
      ctx.beginPath();
      ctx.moveTo(e.x, e.y);
      ctx.lineTo(jad.x, jad.y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }
    // Green cross badge floating just above the body.
    const bx = e.x, by = e.y - size * 0.55 - 4;
    ctx.save();
    ctx.strokeStyle = `rgba(120,255,140,${0.7 + pulse * 0.3})`;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.shadowColor = 'rgba(60,220,90,0.9)';
    ctx.shadowBlur = 4;
    ctx.beginPath();
    ctx.moveTo(bx - 4, by); ctx.lineTo(bx + 4, by);
    ctx.moveTo(bx, by - 4); ctx.lineTo(bx, by + 4);
    ctx.stroke();
    ctx.restore();
  }

  private drawProjectiles(ctx: CanvasRenderingContext2D) {
    for (const p of this.e.projectiles) {
      // Motion trail: a fading streak through the recent positions.
      const trail = p.trail;
      if (trail && trail.length > 1) {
        ctx.lineCap = 'round';
        ctx.strokeStyle = p.color;
        for (let i = 1; i < trail.length; i++) {
          ctx.globalAlpha = (i / trail.length) * 0.5;
          ctx.lineWidth = (i / trail.length) * (p.type === 'cannonball' ? 5 : 3);
          ctx.beginPath();
          ctx.moveTo(trail[i - 1].x, trail[i - 1].y);
          ctx.lineTo(trail[i].x, trail[i].y);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }

      ctx.fillStyle = p.color;
      if (p.type === 'arrow') {
        const target = this.e.enemies.find(en => en.id === p.targetId);
        const angle = target
          ? Math.atan2(target.y - p.y, target.x - p.x)
          : Math.atan2((p.destY ?? p.y) - p.y, (p.destX ?? p.x) - p.x);
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(angle);
        if (p.arrowIcon) {
          // Archer: a single procedural dragon arrow, drawn pointing +x — i.e.
          // already along the travel direction (we rotated to `angle`), so no
          // sprite/orientation guesswork. Dragon look: dark shaft, crimson
          // dragon-metal head with a bright edge, red fletching.
          ctx.lineCap = 'round';
          ctx.strokeStyle = '#4a3320'; // shaft (dark wood)
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(-8, 0);
          ctx.lineTo(7, 0);
          ctx.stroke();
          ctx.fillStyle = '#a3242a'; // fletching (crimson feathers)
          ctx.beginPath(); ctx.moveTo(-8, 0); ctx.lineTo(-11, -3); ctx.lineTo(-4, -1); ctx.closePath(); ctx.fill();
          ctx.beginPath(); ctx.moveTo(-8, 0); ctx.lineTo(-11, 3); ctx.lineTo(-4, 1); ctx.closePath(); ctx.fill();
          ctx.fillStyle = '#5e1414'; // arrowhead (dark dragon metal)
          ctx.beginPath(); ctx.moveTo(11, 0); ctx.lineTo(6, -3.5); ctx.lineTo(6, 3.5); ctx.closePath(); ctx.fill();
          ctx.strokeStyle = '#c2483c'; // bright leading edge
          ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(11, 0); ctx.lineTo(6, -3.5); ctx.moveTo(11, 0); ctx.lineTo(6, 3.5); ctx.stroke();
        } else {
          ctx.fillRect(-8, -1, 16, 2); // plain bolt (tzhaar / slayer / toxic)
        }
        ctx.restore();
      } else if (p.projAnim && SPOTANIMS[p.projAnim] && this.e.imageOk(`spotanim_${p.projAnim}`)) {
        // The spell's REAL flight GFX from the cache — a looping baked spotanim
        // riding the bolt (frame picked from game time so all bolts animate).
        const meta = SPOTANIMS[p.projAnim];
        let rem = (this.e.runSeconds * 1000 * meta.speed) % meta.frameMs.reduce((a, b) => a + b, 0);
        let fi = 0;
        for (; fi < meta.frames - 1; fi++) {
          if (rem < meta.frameMs[fi]) break;
          rem -= meta.frameMs[fi];
        }
        const img = this.e.images.get(`spotanim_${p.projAnim}`)!;
        const s = meta.size;
        ctx.drawImage(img, fi * meta.frameW, 0, meta.frameW, meta.frameH, p.x - s / 2, p.y - s / 2, s, s);
      } else if (p.spellIcon && this.e.imageOk(`spell_${p.spellIcon}`)) {
        // Fallback: the spell's icon sprite, with a coloured glow.
        ctx.save();
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 8;
        this.drawImageContain(ctx, this.e.images.get(`spell_${p.spellIcon}`)!, p.x, p.y, 18);
        ctx.restore();
      } else {
        // glow for magic/cannon shots
        ctx.save();
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.type === 'cannonball' ? 4 : 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }
  }

  private drawParticles(ctx: CanvasRenderingContext2D) {
    // Pass 1: solid physical debris (shatter motes), drawn normally.
    for (const p of this.e.particles) {
      if (p.twinkle) continue;
      const t = Math.max(0, p.life / p.maxLife);
      ctx.globalAlpha = t * t; // ease-out for a softer tail
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, (p.size ?? 2.5) * (0.6 + t * 0.4), 0, Math.PI * 2);
      ctx.fill();
    }
    // Pass 2: mystical arcane sparks — additive shimmering 4-point stars that glow
    // in the element's colour, laid over the debris for the "magic" sheen.
    ctx.globalCompositeOperation = 'lighter';
    for (const p of this.e.particles) {
      if (!p.twinkle) continue;
      const t = Math.max(0, p.life / p.maxLife);
      const flicker = 0.55 + 0.45 * Math.sin(p.life * 42 + p.x); // twinkle
      ctx.globalAlpha = Math.min(1, t * 1.2) * flicker;
      ctx.fillStyle = p.color;
      this.drawSpark(ctx, p.x, p.y, (p.size ?? 2.5) * (0.7 + t * 0.7));
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }

  /** A four-point arcane sparkle (a slim star) — the magical accent on spell hits. */
  private drawSpark(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
    const w = r * 0.28; // waist of the star points
    ctx.beginPath();
    ctx.moveTo(x, y - r);
    ctx.lineTo(x + w, y - w);
    ctx.lineTo(x + r, y);
    ctx.lineTo(x + w, y + w);
    ctx.lineTo(x, y + r);
    ctx.lineTo(x - w, y + w);
    ctx.lineTo(x - r, y);
    ctx.lineTo(x - w, y - w);
    ctx.closePath();
    ctx.fill();
  }

  /** Procedural roguelite VFX: expanding rings (cleave / shockwave / heal) and
   *  jagged energy bolts (ricochet / pierce / chain-freeze jump). */
  private drawFx(ctx: CanvasRenderingContext2D) {
    for (const f of this.e.fx) {
      const t = Math.min(1, f.age / f.life); // 0 → 1 over its life
      if (f.kind === 'ring') {
        const r = f.r0 + (f.r1 - f.r0) * (1 - (1 - t) * (1 - t)); // ease-out expand
        ctx.save();
        ctx.globalAlpha = (1 - t) * 0.9;
        ctx.strokeStyle = f.color;
        ctx.lineWidth = f.width * (1 - t * 0.5);
        ctx.beginPath();
        ctx.arc(f.x, f.y, r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      } else {
        ctx.save();
        ctx.globalAlpha = 1 - t;
        ctx.strokeStyle = f.color;
        ctx.lineWidth = 2.5;
        ctx.shadowColor = f.color;
        ctx.shadowBlur = 6;
        this.strokeBolt(ctx, f.x0, f.y0, f.x1, f.y1);
        ctx.restore();
      }
    }
    ctx.globalAlpha = 1;
  }

  /** A jagged lightning-style polyline between two points (re-jittered each frame
   *  so a short-lived bolt flickers like energy). */
  private strokeBolt(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number) {
    const segs = 5;
    const dx = x1 - x0, dy = y1 - y0;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len, ny = dx / len; // unit perpendicular
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    for (let i = 1; i < segs; i++) {
      const k = i / segs;
      const off = (Math.random() - 0.5) * 12;
      ctx.lineTo(x0 + dx * k + nx * off, y0 + dy * k + ny * off);
    }
    ctx.lineTo(x1, y1);
    ctx.stroke();
  }

  private drawHitsplats(ctx: CanvasRenderingContext2D) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // Direct hits last so they sit on top of any DoT splats drifting below.
    const splats = [...this.e.hitsplats].sort((a, b) => Number(!!b.minor) - Number(!!a.minor));
    for (const h of splats) {
      ctx.globalAlpha = Math.min(1, h.life / 0.3) * (h.minor ? 0.92 : 1); // fade near the end
      this.drawSplat(ctx, h.x, h.y, h.value, h.kind, !!h.minor);
    }
    ctx.globalAlpha = 1;
    ctx.textBaseline = 'alphabetic';
  }

  /**
   * Draw an OSRS-style hitsplat — a coloured lozenge with the value in white,
   * coloured per the OSRS Template:Hitsplat palette (red damage, blue 0/block,
   * green poison, orange burn, …). Rendered on the canvas so it always shows.
   */
  private drawSplat(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    value: number,
    kind: HitsplatKind,
    minor = false,
  ) {
    const s = minor ? 0.7 : 1; // DoT splats are smaller so direct hits dominate
    const hw = 14 * s; // half width
    const hh = 10 * s; // half height
    const p = 5 * s; // point inset
    ctx.save();
    ctx.translate(x, y);
    ctx.beginPath();
    ctx.moveTo(-hw, 0);
    ctx.lineTo(-hw + p, -hh);
    ctx.lineTo(hw - p, -hh);
    ctx.lineTo(hw, 0);
    ctx.lineTo(hw - p, hh);
    ctx.lineTo(-hw + p, hh);
    ctx.closePath();
    ctx.fillStyle = HITSPLAT_COLORS[kind] ?? HITSPLAT_COLORS.hit;
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = `bold ${Math.round(14 * s)}px 'RuneScape', Arial`;
    ctx.shadowColor = 'rgba(0,0,0,0.9)';
    ctx.shadowBlur = 2;
    ctx.fillText(String(value), 0, 1);
    ctx.restore();
  }
}
