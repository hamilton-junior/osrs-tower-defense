import type { GameEngine } from './engine';
import { TOWERS } from '../data/towers';
import { isValidPlacement, squareRange, pointToSegmentDistance } from '../systems/geometry';

const GRID = 32;

/** All Canvas 2D drawing for a frame. Reads engine state through `this.e`. */
export class GameRenderer {
  constructor(private e: GameEngine) {}

  draw() {
    const { ctx } = this.e;
    if (!ctx || this.e.canvas.width === 0) return;

    ctx.save();
    ctx.imageSmoothingEnabled = false;
    this.drawBackground(ctx);
    this.drawPath(ctx);
    this.drawPlacementGhost(ctx);
    this.drawTowers(ctx);
    this.drawEnemies(ctx);
    this.drawProjectiles(ctx);
    this.drawParticles(ctx);
    this.drawHitsplats(ctx);
    ctx.restore();
  }

  private drawBackground(ctx: CanvasRenderingContext2D) {
    const w = this.e.width;
    const h = this.e.height;

    // Grass base with a soft vertical gradient.
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#34561f');
    grad.addColorStop(1, '#27411a');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Texture: scattered grass tufts (two tones) for a less flat field.
    for (let i = 0; i < 220; i++) {
      const x = (i * 137.5) % w;
      const y = (i * 224.7) % h;
      ctx.fillStyle = i % 3 === 0 ? 'rgba(120,170,70,0.18)' : 'rgba(60,95,39,0.5)';
      ctx.fillRect(x, y, 2, 2);
      ctx.fillRect(x + 2, y + 2, 2, 4);
    }

    this.drawDecorations(ctx, w, h);

    // Faint tile grid.
    ctx.strokeStyle = 'rgba(255,255,255,0.03)';
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

  /** Scatter deterministic off-path scenery (bushes, rocks, flowers). */
  private drawDecorations(ctx: CanvasRenderingContext2D, w: number, h: number) {
    const flowers = ['#e7d34b', '#e06b6b', '#d7d7e6', '#c98ad6'];
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
        ctx.fillStyle = '#2c5018';
        ctx.beginPath();
        ctx.arc(x, y, 7, 0, Math.PI * 2);
        ctx.arc(x + 6, y + 2, 5, 0, Math.PI * 2);
        ctx.arc(x - 5, y + 2, 5, 0, Math.PI * 2);
        ctx.fill();
      } else if (kind === 2) {
        // rock
        ctx.fillStyle = '#6b6b6b';
        ctx.beginPath();
        ctx.ellipse(x, y, 6, 4, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#888';
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
    const layers: [number, string][] = [
      [50, '#1c2f12'],   // faint grassy shadow rim
      [46, '#3d2b1f'],   // dark dirt border
      [40, '#6d4c33'],   // mid dirt
      [32, '#8a6646'],   // walked path
    ];
    for (const [width, color] of layers) {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      trace();
    }
    // Lighter packed-dirt centre with a dashed track line.
    ctx.strokeStyle = '#9c7a55';
    ctx.lineWidth = 18;
    trace();
    ctx.setLineDash([10, 16]);
    ctx.strokeStyle = 'rgba(60,40,24,0.5)';
    ctx.lineWidth = 3;
    trace();
    ctx.setLineDash([]);
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
    const range = moving ? moving.range : TOWERS[type].tiers[0].range;

    this.drawSquareRange(
      ctx, sx, sy, squareRange(range, GRID),
      valid ? 'rgba(0,255,0,0.5)' : 'rgba(255,0,0,0.5)',
      valid ? 'rgba(0,255,0,0.06)' : 'rgba(255,0,0,0.06)',
    );

    ctx.globalAlpha = 0.6;
    this.drawTowerSprite(ctx, type, level, sx, sy, moving ? moving.visualRadius : 18);
    ctx.globalAlpha = 1;
  }

  private drawTowers(ctx: CanvasRenderingContext2D) {
    for (const tower of this.e.towers) {
      if (tower.id === this.e.selectedTowerId) {
        this.drawSquareRange(ctx, tower.x, tower.y, squareRange(tower.range, GRID), 'rgba(255,255,255,0.35)', 'rgba(255,255,255,0.05)');
      }

      // Aim + recoil: nudge the sprite back along the firing direction and
      // pulse its scale; flip horizontally to face the target.
      const recoil = tower.recoil ?? 0;
      const angle = tower.recoilAngle ?? 0;
      const back = recoil * 4;
      const pulse = 1 + recoil * 0.12;
      const flip = Math.cos(angle) < 0 ? -1 : 1;
      ctx.save();
      ctx.translate(tower.x - Math.cos(angle) * back, tower.y - Math.sin(angle) * back);
      ctx.scale(flip * pulse, pulse);
      this.drawTowerSprite(ctx, tower.type, tower.level, 0, 0, tower.visualRadius);
      ctx.restore();

      // level pip
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 11px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(String(tower.level), tower.x, tower.y + 4);
    }
  }

  private drawTowerSprite(
    ctx: CanvasRenderingContext2D,
    type: string,
    level: number,
    x: number,
    y: number,
    radius: number,
  ) {
    const keys = [`${type}_${level}`, `${type}_1`];
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

  private drawEnemies(ctx: CanvasRenderingContext2D) {
    for (const e of this.e.enemies) {
      const isBoss = !!e.isBoss;
      const size = isBoss ? 60 : 30;
      const flash = e.flashTimer && e.flashTimer > 0 ? e.flashTimer / 0.15 : 0;
      // Impact = a slight shake while the hit registers.
      const shx = flash > 0 ? (Math.random() - 0.5) * 6 * flash : 0;
      const shy = flash > 0 ? (Math.random() - 0.5) * 6 * flash : 0;
      if (this.e.imageOk(e.type)) {
        const img = this.e.images.get(e.type)!;
        const movingLeft = (this.e.path[e.pathIndex + 1]?.x ?? e.x) < e.x;
        ctx.save();
        ctx.translate(e.x + shx, e.y + shy);
        if (movingLeft) ctx.scale(-1, 1);
        ctx.drawImage(img, -size / 2, -size / 2, size, size);
        if (flash > 0) {
          // Tint the sprite itself red (clipped to its silhouette).
          ctx.globalCompositeOperation = 'source-atop';
          ctx.globalAlpha = flash * 0.6;
          ctx.fillStyle = '#e00000';
          ctx.fillRect(-size / 2, -size / 2, size, size);
        }
        ctx.restore();
      } else {
        const r = isBoss ? 20 : 12;
        ctx.fillStyle = flash > 0 ? '#e00000' : e.color;
        ctx.beginPath();
        ctx.arc(e.x + shx, e.y + shy, r, 0, Math.PI * 2);
        ctx.fill();
      }

      // health bar
      const bw = isBoss ? 60 : 30;
      const by = e.y - (isBoss ? 40 : 22);
      ctx.fillStyle = '#600';
      ctx.fillRect(e.x - bw / 2, by, bw, 4);
      ctx.fillStyle = '#3c3';
      ctx.fillRect(e.x - bw / 2, by, bw * Math.max(0, e.hp / e.maxHp), 4);
    }
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
        const angle = target ? Math.atan2(target.y - p.y, target.x - p.x) : 0;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(angle);
        ctx.fillRect(-8, -1, 16, 2);
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
    for (const p of this.e.particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  private drawHitsplats(ctx: CanvasRenderingContext2D) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const h of this.e.hitsplats) {
      ctx.globalAlpha = Math.min(1, h.life / 0.3); // fade out near the end
      this.drawSplat(ctx, h.x, h.y, h.value, h.kind);
    }
    ctx.globalAlpha = 1;
    ctx.textBaseline = 'alphabetic';
  }

  /**
   * Draw an OSRS-style hitsplat: a red lozenge for a hit, blue for a miss
   * (0 damage), with the value in white. Rendered on the canvas (rather than a
   * remote sprite) so it always shows.
   */
  private drawSplat(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    value: number,
    kind: 'hit' | 'miss',
  ) {
    const hw = 13; // half width
    const hh = 9; // half height
    const p = 5; // point inset
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
    ctx.fillStyle = kind === 'miss' ? '#3056c8' : '#9e1414';
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = "bold 13px 'RuneScape', Arial";
    ctx.fillText(String(value), 0, 1);
    ctx.restore();
  }
}
