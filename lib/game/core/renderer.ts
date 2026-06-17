import type { GameEngine } from './engine';
import { LOGIC_WIDTH, LOGIC_HEIGHT } from './engine';
import { TOWERS } from '../data/towers';
import { isValidPlacement, squareRange } from '../systems/geometry';

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
    ctx.fillStyle = '#2d4c1e';
    ctx.fillRect(0, 0, LOGIC_WIDTH, LOGIC_HEIGHT);
    ctx.fillStyle = '#3a5f27';
    for (let i = 0; i < 120; i++) {
      const x = (i * 137.5) % LOGIC_WIDTH;
      const y = (i * 224.7) % LOGIC_HEIGHT;
      ctx.fillRect(x, y, 2, 2);
      ctx.fillRect(x + 2, y + 2, 2, 4);
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.03)';
    ctx.lineWidth = 1;
    for (let x = 0; x < LOGIC_WIDTH; x += GRID) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, LOGIC_HEIGHT);
      ctx.stroke();
    }
    for (let y = 0; y < LOGIC_HEIGHT; y += GRID) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(LOGIC_WIDTH, y);
      ctx.stroke();
    }
  }

  private drawPath(ctx: CanvasRenderingContext2D) {
    const path = this.e.path;
    if (path.length < 2) return;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const layers: [number, string][] = [
      [46, '#3d2b1f'],
      [40, '#5d4037'],
      [32, '#795548'],
    ];
    for (const [width, color] of layers) {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.beginPath();
      ctx.moveTo(path[0].x, path[0].y);
      for (let i = 1; i < path.length; i++) ctx.lineTo(path[i].x, path[i].y);
      ctx.stroke();
    }
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
    const type = this.e.selectedTowerType;
    if (!type) return;
    const sx = Math.round(this.e.pointer.x / GRID) * GRID;
    const sy = Math.round(this.e.pointer.y / GRID) * GRID;
    const valid = this.e.money >= this.e.towerCost(type) && isValidPlacement(sx, sy, this.e.path, this.e.towers);
    const half = squareRange(TOWERS[type].tiers[0].range, GRID);

    this.drawSquareRange(
      ctx, sx, sy, half,
      valid ? 'rgba(0,255,0,0.5)' : 'rgba(255,0,0,0.5)',
      valid ? 'rgba(0,255,0,0.06)' : 'rgba(255,0,0,0.06)',
    );

    ctx.globalAlpha = 0.6;
    this.drawTowerSprite(ctx, type, 1, sx, sy, 18);
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
      if (this.e.imageOk(e.type)) {
        const img = this.e.images.get(e.type)!;
        const movingLeft = (this.e.path[e.pathIndex + 1]?.x ?? e.x) < e.x;
        ctx.save();
        ctx.translate(e.x, e.y);
        if (movingLeft) ctx.scale(-1, 1);
        ctx.drawImage(img, -size / 2, -size / 2, size, size);
        ctx.restore();
      } else {
        ctx.fillStyle = e.color;
        ctx.beginPath();
        ctx.arc(e.x, e.y, isBoss ? 20 : 12, 0, Math.PI * 2);
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
    const splatKey = (kind: string) => (kind === 'miss' ? 'miss_hit_splat' : 'hit_splat');
    for (const h of this.e.hitsplats) {
      ctx.globalAlpha = Math.min(1, h.life / 0.3); // fade out near the end
      const key = splatKey(h.kind);
      if (this.e.imageOk(key)) {
        // Authentic OSRS hitsplat sprite from the wiki.
        const img = this.e.images.get(key)!;
        const s = 26;
        ctx.drawImage(img, h.x - s / 2, h.y - s / 2, s, s);
      } else {
        // Fallback: drawn splat (red hit / blue miss).
        ctx.fillStyle = h.kind === 'miss' ? '#1f6fd0' : '#b00000';
        ctx.beginPath();
        ctx.arc(h.x, h.y, 11, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = '#fff';
      ctx.font = "bold 14px 'RuneScape', Arial";
      ctx.fillText(String(h.value), h.x, h.y + 1);
    }
    ctx.globalAlpha = 1;
    ctx.textBaseline = 'alphabetic';
  }
}
