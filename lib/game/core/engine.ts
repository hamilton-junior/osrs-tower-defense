import type { Enemy, Tower, Projectile, Point, EnemyType, TowerType, TargetingPriority, GlobalUpgrades } from '../types';
import { ENEMIES } from '../data/enemies';
import { TOWERS } from '../data/towers';
import { LANDMARK_WAVES } from '../data/waves';
import { ASSETS } from '../assets';
import { distance, distanceSq, isValidPlacement, squareRange, inSquareRange } from '../systems/geometry';
import { selectTarget } from '../systems/targeting';
import { scaleEnemyStats } from '../systems/enemy-scaling';
import { buildWaveConfigs } from '../systems/wave-generation';
import { calculateTowerStats } from '../systems/tower-combat';
import { goldForKill, waveClearBonus } from '../systems/rewards';
import { GameRenderer } from './renderer';
import { SoundManager, GAME_SOUNDS } from './sound';

/** Default logic dimensions, used until {@link GameEngine.resize} measures the
 *  real canvas. The play area adapts to the user's screen, sized to whole tiles. */
export const LOGIC_WIDTH = 1920;
export const LOGIC_HEIGHT = 1080;
const GRID = 32;
const TOWER_RADIUS = 15;
const START_MONEY = 200;
const START_LIVES = 20;

/** Neutral upgrade multipliers — the MVP has no meta-progression yet. */
const NO_UPGRADES: GlobalUpgrades = {
  archerRange: 1, archerDamage: 1, magicDamage: 1, cannonSpeed: 1, slayerReward: 1,
  prayerEfficiency: 1, startingMoney: 0, rewardMultiplier: 1, waveSpeed: 1,
  towerCostReduction: 1, xpGainMultiplier: 1, prayerRegen: 0,
};

/** Flat, cloneable snapshot the engine pushes to React. */
export interface UIState {
  money: number;
  lives: number;
  maxLives: number;
  wave: number;
  waveActive: boolean;
  remaining: number;
  /** Total enemies queued for the current wave (for the progress bar). */
  waveTotal: number;
  /** Whether the current wave contains a boss. */
  bossWave: boolean;
  gameOver: boolean;
  selectedTowerType: TowerType | null;
  selectedTowerId: string | null;
  movingTowerId: string | null;
  gameSpeed: number;
  muted: boolean;
  volume: number;
  /** Last transient notice (e.g. "Not enough gold"); null when none yet. */
  notice: string | null;
  /** Bumped every time a notice fires so the UI can re-trigger on repeats. */
  noticeSeq: number;
}

const uid = () => Math.random().toString(36).slice(2, 11);

/** Approximate body radius (px) used for range/hit tests, matching the sprite size. */
const enemyRadius = (e: { isBoss?: boolean }) => (e.isBoss ? 28 : 13);

/** Transient OSRS-style hit marker shown over an enemy when it takes damage. */
export interface Hitsplat {
  x: number;
  y: number;
  value: number;
  kind: 'hit' | 'miss';
  life: number;
}

/** A dying enemy's sprite, fading out where it fell. */
export interface DeathFx {
  x: number;
  y: number;
  type: string;
  isBoss: boolean;
  movingLeft: boolean;
  life: number;
  maxLife: number;
}

/** Transient death/impact particle. */
export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
}

const HITSPLAT_LIFE = 0.9;

export class GameEngine {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  private readonly renderer: GameRenderer;
  private readonly sound = new SoundManager(GAME_SOUNDS);
  private readonly onState: (patch: Partial<UIState>) => void;

  // --- world state ---
  path: Point[] = [];
  enemies: Enemy[] = [];
  towers: Tower[] = [];
  projectiles: Projectile[] = [];
  hitsplats: Hitsplat[] = [];
  particles: Particle[] = [];
  deaths: DeathFx[] = [];

  money = START_MONEY;
  lives = START_LIVES;
  readonly maxLives = START_LIVES;
  wave = 1;
  waveActive = false;
  gameOver = false;
  waveTotal = 0;
  bossWave = false;

  selectedTowerType: TowerType | null = null;
  selectedTowerId: string | null = null;
  movingTowerId: string | null = null;
  gameSpeed = 1;
  pointer: Point = { x: 0, y: 0 };

  // --- run stats (read directly by the UI, e.g. the game-over screen) ---
  kills = 0;
  goldEarned = 0;
  private notice: string | null = null;
  private noticeSeq = 0;

  /** Current logic dimensions (canvas internal resolution); whole tiles. */
  width = LOGIC_WIDTH;
  height = LOGIC_HEIGHT;

  // --- spawn/loop bookkeeping ---
  private spawnQueue: Enemy[] = [];
  private spawnTimer = 0;
  private readonly spawnInterval = 0.7; // seconds between spawns
  private rafId = 0;
  private lastTime = 0;
  private gameTime = 0; // accumulated simulated seconds (drives cooldowns)

  // --- assets ---
  readonly images = new Map<string, HTMLImageElement>();
  private readonly brokenImages = new Set<string>();

  constructor(canvas: HTMLCanvasElement, onState: (patch: Partial<UIState>) => void) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.onState = onState;
    this.renderer = new GameRenderer(this);
    this.canvas.width = this.width;
    this.canvas.height = this.height;
    this.buildPath();
    this.preloadImages();
    this.emit();
  }

  /**
   * Match the canvas resolution to its on-screen size, floored to whole tiles
   * so the grid (and therefore tower square-ranges) line up with the path.
   * Existing entities are re-anchored proportionally so nothing jumps off the
   * road when the window is resized.
   */
  resize() {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const w = Math.max(GRID * 12, Math.floor(rect.width / GRID) * GRID);
    const h = Math.max(GRID * 8, Math.floor(rect.height / GRID) * GRID);
    if (w === this.width && h === this.height && this.canvas.width === w) return;
    const sx = w / this.width;
    const sy = h / this.height;
    this.width = w;
    this.height = h;
    this.canvas.width = w;
    this.canvas.height = h;
    if (sx !== 1 || sy !== 1) {
      for (const t of this.towers) { t.x = Math.round((t.x * sx) / GRID) * GRID; t.y = Math.round((t.y * sy) / GRID) * GRID; }
      for (const en of this.enemies) { en.x *= sx; en.y *= sy; }
      for (const p of this.projectiles) { p.x *= sx; p.y *= sy; }
    }
    this.buildPath();
  }

  // ---------------------------------------------------------------- lifecycle
  start() {
    this.lastTime = performance.now();
    const loop = () => {
      const now = performance.now();
      const dt = Math.min((now - this.lastTime) / 1000, 0.1); // clamp big gaps
      this.lastTime = now;
      // Sub-step for fast-forward: run the sim `gameSpeed` times at the real
      // per-step dt, so speeding up never causes large-dt tunneling.
      if (!this.gameOver) {
        for (let s = 0; s < this.gameSpeed; s++) this.update(dt);
      }
      this.renderer.draw();
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  stop() {
    cancelAnimationFrame(this.rafId);
  }

  private emit() {
    this.onState({
      money: this.money,
      lives: this.lives,
      maxLives: this.maxLives,
      wave: this.wave,
      waveActive: this.waveActive,
      remaining: this.spawnQueue.length + this.enemies.length,
      waveTotal: this.waveTotal,
      bossWave: this.bossWave,
      gameOver: this.gameOver,
      selectedTowerType: this.selectedTowerType,
      selectedTowerId: this.selectedTowerId,
      movingTowerId: this.movingTowerId,
      gameSpeed: this.gameSpeed,
      muted: this.sound.isMuted,
      volume: this.sound.level,
      notice: this.notice,
      noticeSeq: this.noticeSeq,
    });
  }

  /** Flash a transient message to the UI (e.g. an action that couldn't run). */
  private notify(text: string) {
    this.notice = text;
    this.noticeSeq++;
    this.emit();
  }

  setGameSpeed(speed: number) {
    this.gameSpeed = Math.max(1, Math.min(5, Math.floor(speed)));
    this.emit();
  }

  toggleMute() {
    this.sound.setMuted(!this.sound.isMuted);
    this.sound.play('click');
    this.emit();
  }

  setVolume(value: number) {
    this.sound.setVolume(value);
    this.emit();
  }

  // ------------------------------------------------------------------- assets
  private preloadImages() {
    const urls: Record<string, string> = {
      ...ASSETS.enemies,
      ...Object.fromEntries(
        Object.entries(ASSETS.towers).flatMap(([type, variants]) =>
          Object.entries(variants as Record<string, string>).map(([v, url]) => [`${type}_${v}`, url]),
        ),
      ),
    };
    for (const [key, url] of Object.entries(urls)) {
      const img = new Image();
      img.referrerPolicy = 'no-referrer';
      img.onerror = () => this.brokenImages.add(key);
      img.src = url;
      this.images.set(key, img);
    }
  }

  imageOk(key: string): boolean {
    const img = this.images.get(key);
    return !!img && !this.brokenImages.has(key) && img.complete && img.naturalWidth > 0;
  }

  // --------------------------------------------------------------------- path
  private buildPath() {
    // Snap every vertex onto a grid line so the road runs along tile edges and
    // tower square-ranges align with it (no half-tiles through the road).
    const tx = Math.floor(this.width / GRID);
    const ty = Math.floor(this.height / GRID);
    const col = (f: number) => Math.round(tx * f) * GRID;
    const row = (f: number) => Math.round(ty * f) * GRID;
    this.path = [
      { x: -GRID, y: row(0.2) },
      { x: col(0.2), y: row(0.2) },
      { x: col(0.2), y: row(0.8) },
      { x: col(0.5), y: row(0.8) },
      { x: col(0.5), y: row(0.4) },
      { x: col(0.8), y: row(0.4) },
      { x: col(0.8), y: row(0.6) },
      { x: this.width + GRID, y: row(0.6) },
    ];
  }

  // ------------------------------------------------------------- input/actions
  setPointer(x: number, y: number) {
    this.pointer = { x, y };
  }

  selectTowerType(type: TowerType | null) {
    this.selectedTowerType = type;
    this.selectedTowerId = null;
    this.movingTowerId = null;
    if (type) this.sound.play('click');
    this.emit();
  }

  towerCost(type: TowerType): number {
    return TOWERS[type]?.tiers[0].upgradeCost ?? 0;
  }

  /** Total gp invested in a tower (base + all upgrades to its current level). */
  private investedValue(tower: Tower): number {
    const def = TOWERS[tower.type];
    if (!def) return 0;
    return def.tiers.slice(0, tower.level).reduce((s, t) => s + t.upgradeCost, 0);
  }

  /** Cost to relocate a tower: 10% of its current invested value (min 1 gp). */
  moveTowerCost(tower: Tower): number {
    return Math.max(1, Math.floor(this.investedValue(tower) * 0.1));
  }

  /** gp refunded when selling a tower (75% of invested value). */
  sellValue(tower: Tower): number {
    return Math.floor(this.investedValue(tower) * 0.75);
  }

  get movingTower(): Tower | null {
    return this.movingTowerId ? this.towers.find(t => t.id === this.movingTowerId) ?? null : null;
  }

  /** Enter "move" mode for a tower (the next valid click relocates it). */
  beginMoveTower(towerId: string) {
    const tower = this.towers.find(t => t.id === towerId);
    if (!tower) return;
    if (this.money < this.moveTowerCost(tower)) { this.notify('Not enough gold'); return; } // failsafe: can't afford
    this.selectedTowerType = null;
    this.selectedTowerId = towerId;
    this.movingTowerId = towerId;
    this.sound.play('click');
    this.emit();
  }

  /** Cancel any pending placement or move without charging. */
  cancelAction() {
    this.selectedTowerType = null;
    this.movingTowerId = null;
    this.emit();
  }

  private tryMoveTower(x: number, y: number) {
    const tower = this.movingTower;
    if (!tower) {
      this.movingTowerId = null;
      this.emit();
      return;
    }
    const cost = this.moveTowerCost(tower);
    if (this.money < cost) { // failsafe: lost the gp since entering move mode
      this.movingTowerId = null;
      this.emit();
      return;
    }
    const sx = Math.round(x / GRID) * GRID;
    const sy = Math.round(y / GRID) * GRID;
    if (sx === tower.x && sy === tower.y) return; // no-op, wait for a real spot
    const others = this.towers.filter(t => t.id !== tower.id); // ignore self
    if (!isValidPlacement(sx, sy, this.path, others)) return; // invalid spot, keep waiting
    this.money -= cost;
    tower.x = sx;
    tower.y = sy;
    tower.targetId = null; // re-acquire from the new position
    this.movingTowerId = null;
    this.sound.play('place');
    this.emit();
  }

  /** Handle a click in logic space: move/place a tower or select/deselect one. */
  handleClick(x: number, y: number) {
    if (this.movingTowerId) {
      this.tryMoveTower(x, y);
      return;
    }
    if (this.selectedTowerType) {
      this.placeTower(this.selectedTowerType, x, y);
      return;
    }
    const hit = this.towers.find(t => distance(t.x, t.y, x, y) <= TOWER_RADIUS + 4);
    this.selectedTowerId = hit ? hit.id : null;
    this.emit();
  }

  placeTower(type: TowerType, x: number, y: number) {
    const def = TOWERS[type];
    if (!def) return;
    const cost = this.towerCost(type);
    const sx = Math.round(x / GRID) * GRID;
    const sy = Math.round(y / GRID) * GRID;
    if (this.money < cost) { this.notify('Not enough gold'); return; }
    if (!isValidPlacement(sx, sy, this.path, this.towers)) { this.notify("Can't build there"); return; }

    const tier = def.tiers[0];
    this.money -= cost;
    this.towers.push({
      id: uid(),
      x: sx,
      y: sy,
      type,
      level: 1,
      maxLevel: def.tiers.length,
      range: tier.range,
      damage: tier.damage,
      cooldown: tier.cooldown,
      lastFired: 0,
      color: tier.color,
      targetId: null,
      targetingPriority: 'first',
      name: tier.name,
      upgradeCost: def.tiers[1]?.upgradeCost ?? 0,
      special: tier.special,
      minDamage: tier.minDamage,
      maxDamage: tier.maxDamage,
      visualRadius: 18,
      disabledTimer: 0,
      specCharge: 0,
      specMax: 100,
      skills: { strength: { level: 1, xp: 0 }, ranged: { level: 1, xp: 0 }, magic: { level: 1, xp: 0 } },
      equipment: { weapon: null, shield: null, accessory: null },
    });
    this.sound.play('place');
    this.selectedTowerType = null;
    this.emit();
  }

  upgradeTower(towerId: string) {
    const tower = this.towers.find(t => t.id === towerId);
    if (!tower || tower.level >= tower.maxLevel) return;
    const cost = tower.upgradeCost;
    if (this.money < cost) { this.notify('Not enough gold'); return; }
    const def = TOWERS[tower.type];
    const tier = def.tiers[tower.level]; // next tier (0-indexed)
    this.money -= cost;
    tower.level += 1;
    tower.name = tier.name;
    tower.damage = tier.damage;
    tower.range = tier.range;
    tower.cooldown = tier.cooldown;
    tower.color = tier.color;
    tower.special = tier.special;
    tower.minDamage = tier.minDamage;
    tower.maxDamage = tier.maxDamage;
    tower.visualRadius += 2;
    tower.upgradeCost = def.tiers[tower.level]?.upgradeCost ?? 0;
    this.sound.play('place');
    this.emit();
  }

  setTargetingPriority(towerId: string, priority: TargetingPriority) {
    const tower = this.towers.find(t => t.id === towerId);
    if (!tower) return;
    tower.targetingPriority = priority;
    tower.targetId = null; // re-acquire under the new priority next frame
    this.emit();
  }

  sellTower(towerId: string) {
    const i = this.towers.findIndex(t => t.id === towerId);
    if (i < 0) return;
    const tower = this.towers[i];
    this.money += this.sellValue(tower);
    this.towers.splice(i, 1);
    if (this.selectedTowerId === towerId) this.selectedTowerId = null;
    if (this.movingTowerId === towerId) this.movingTowerId = null;
    this.sound.play('sell');
    this.emit();
  }

  startWave() {
    if (this.waveActive || this.gameOver) return;
    this.spawnQueue = this.generateWave(this.wave);
    this.waveTotal = this.spawnQueue.length;
    this.bossWave = this.spawnQueue.some(e => e.isBoss);
    this.waveActive = true;
    this.sound.play('wave');
    this.emit();
  }

  // --------------------------------------------------------------- wave build
  private generateWave(wave: number): Enemy[] {
    const configs = buildWaveConfigs(wave, {
      enemies: Object.values(ENEMIES),
      blockedEnemies: [],
      landmark: LANDMARK_WAVES[wave],
    });
    const out: Enemy[] = [];
    for (const cfg of configs) {
      for (let i = 0; i < cfg.count; i++) {
        const enemy = this.makeEnemy(cfg.type, wave);
        if (enemy) out.push(enemy);
      }
    }
    return out;
  }

  private makeEnemy(type: EnemyType, wave: number): Enemy | null {
    const def = ENEMIES[type];
    if (!def) return null;
    const scaled = scaleEnemyStats({ hp: def.hp, speed: def.speed, reward: def.reward }, wave);
    return {
      ...def,
      id: uid(),
      x: this.path[0].x,
      y: this.path[0].y,
      hp: scaled.hp,
      maxHp: scaled.hp,
      speed: scaled.speed,
      baseSpeed: scaled.speed,
      reward: scaled.reward,
      pathIndex: 0,
      slowTimer: 0,
      stunTimer: 0,
      tauntTimer: 0,
      burnTimer: 0,
      burnDamage: 0,
      groundTimer: 0,
    };
  }

  // ------------------------------------------------------------------- update
  private update(dt: number) {
    this.gameTime += dt;
    this.spawn(dt);
    this.moveEnemies(dt);
    this.fireTowers(dt);
    this.moveProjectiles(dt);
    this.updateEffects(dt);
    this.checkWaveEnd();
  }

  /** Advance purely-visual effects (no gameplay impact). */
  private updateEffects(dt: number) {
    for (let i = this.hitsplats.length - 1; i >= 0; i--) {
      const h = this.hitsplats[i];
      h.life -= dt;
      h.y -= 28 * dt; // float up
      if (h.life <= 0) this.hitsplats.splice(i, 1);
    }
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 220 * dt; // gravity
      if (p.life <= 0) this.particles.splice(i, 1);
    }
    for (let i = this.deaths.length - 1; i >= 0; i--) {
      const d = this.deaths[i];
      d.life -= dt;
      if (d.life <= 0) this.deaths.splice(i, 1);
    }
  }

  private spawn(dt: number) {
    if (this.spawnQueue.length === 0) return;
    this.spawnTimer += dt;
    if (this.spawnTimer >= this.spawnInterval) {
      this.spawnTimer = 0;
      const enemy = this.spawnQueue.shift();
      if (enemy) this.enemies.push(enemy);
      this.emit();
    }
  }

  private moveEnemies(dt: number) {
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (e.flashTimer && e.flashTimer > 0) e.flashTimer -= dt;
      if (e.slowTimer > 0) {
        e.slowTimer -= dt;
        if (e.slowTimer <= 0) e.speed = e.baseSpeed;
      }
      const target = this.path[e.pathIndex + 1];
      if (!target) {
        // reached the end → leak a life
        this.enemies.splice(i, 1);
        this.lives -= 1;
        if (this.lives <= 0) this.endGame();
        this.emit();
        continue;
      }
      const dx = target.x - e.x;
      const dy = target.y - e.y;
      const d = Math.hypot(dx, dy);
      if (d < 4) {
        e.pathIndex += 1;
      } else {
        e.x += (dx / d) * e.speed * dt;
        e.y += (dy / d) * e.speed * dt;
      }
    }
  }

  private fireTowers(dt: number) {
    const now = this.gameTime * 1000; // ms of simulated time (cooldowns are in ms)
    for (const tower of this.towers) {
      if (tower.recoil) tower.recoil = Math.max(0, tower.recoil - dt * 6); // ~0.16s pulse
      const stats = calculateTowerStats(tower, {
        upgrades: NO_UPGRADES,
        activePrayers: new Set(),
        activePotions: [],
        allTowers: this.towers,
      });
      const half = squareRange(stats.range, GRID);
      // Test the enemy's body, not just its centre, so a tower fires as soon as
      // an enemy overlaps its range square (e.g. when the road clips the edge).
      const inReach = (e: Enemy) => inSquareRange(e.x, e.y, tower.x, tower.y, half + enemyRadius(e));

      // (re)acquire a target
      let target = tower.targetId ? this.enemies.find(e => e.id === tower.targetId) : undefined;
      if (!target || !inReach(target)) {
        const inRange = this.enemies.filter(inReach);
        target = selectTarget(inRange, tower.x, tower.y, this.path, tower.targetingPriority) ?? undefined;
        tower.targetId = target?.id ?? null;
      }
      if (!target) continue;

      if (now - tower.lastFired < stats.cooldown) continue;
      tower.lastFired = now;
      tower.recoilAngle = Math.atan2(target.y - tower.y, target.x - tower.x);
      tower.recoil = 1; // pulse, decays above

      let damage = tower.damage;
      if (tower.type === 'cannon') {
        const lo = tower.minDamage ?? 0;
        const hi = tower.maxDamage ?? 0;
        damage = lo + Math.random() * (hi - lo);
      }
      damage = Math.floor((damage + stats.flatDamageBonus) * stats.damageMultiplier);

      this.projectiles.push({
        id: uid(),
        x: tower.x,
        y: tower.y,
        targetId: target.id,
        speed: 600,
        damage,
        color: tower.color,
        type: tower.type === 'cannon' ? 'cannonball' : tower.type === 'wizard' ? 'spell' : 'arrow',
        special: tower.special === 'rapid' ? undefined : tower.special,
        sourceTowerId: tower.id,
        trail: [],
      });
      this.sound.play(`fire_${tower.type}`, 70);
    }
  }

  private moveProjectiles(dt: number) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      const target = this.enemies.find(e => e.id === p.targetId);
      if (!target) {
        this.projectiles.splice(i, 1);
        continue;
      }
      if (p.trail) {
        p.trail.push({ x: p.x, y: p.y });
        if (p.trail.length > 6) p.trail.shift();
      }
      const dx = target.x - p.x;
      const dy = target.y - p.y;
      const d = Math.hypot(dx, dy);
      if (d < 12) {
        this.hit(p, target);
        this.projectiles.splice(i, 1);
      } else {
        p.x += (dx / d) * p.speed * dt;
        p.y += (dy / d) * p.speed * dt;
      }
    }
  }

  private hit(p: Projectile, target: Enemy) {
    this.spawnImpactParticles(p.x, p.y, p.color);
    if (p.special === 'aoe') {
      for (const e of this.enemies) {
        if (distanceSq(e.x, e.y, p.x, p.y) <= 80 * 80) this.damage(e, p.damage);
      }
    } else {
      this.damage(target, p.damage);
      if (p.special === 'slow') {
        target.speed = target.baseSpeed * 0.5;
        target.slowTimer = 2;
      }
    }
  }

  /** A small spark burst where a projectile lands. */
  private spawnImpactParticles(x: number, y: number, color: string) {
    for (let i = 0; i < 6; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 30 + Math.random() * 70;
      this.particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0.2 + Math.random() * 0.2,
        maxLife: 0.4,
        color,
      });
    }
  }

  private damage(enemy: Enemy, amount: number) {
    const dealt = Math.max(0, Math.floor(amount));
    enemy.hp -= dealt;
    enemy.flashTimer = 0.15; // visual hit-pop
    this.hitsplats.push({
      x: enemy.x + (Math.random() - 0.5) * 16,
      y: enemy.y - 18,
      value: dealt,
      kind: dealt > 0 ? 'hit' : 'miss',
      life: HITSPLAT_LIFE,
    });
    if (dealt > 0) this.sound.play('hit', 70);
    if (enemy.hp > 0) return;
    const i = this.enemies.indexOf(enemy);
    if (i < 0) return;
    this.enemies.splice(i, 1);
    this.spawnDeathParticles(enemy);
    this.deaths.push({
      x: enemy.x,
      y: enemy.y,
      type: enemy.type,
      isBoss: !!enemy.isBoss,
      movingLeft: (this.path[enemy.pathIndex + 1]?.x ?? enemy.x) < enemy.x,
      life: 0.45,
      maxLife: 0.45,
    });
    this.sound.play('death', 40);
    const reward = goldForKill(enemy.maxHp);
    this.money += reward;
    this.goldEarned += reward;
    this.kills += 1;
    this.emit();
  }

  private spawnDeathParticles(enemy: Enemy) {
    const count = enemy.isBoss ? 26 : 12;
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 40 + Math.random() * 90;
      this.particles.push({
        x: enemy.x,
        y: enemy.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0.5 + Math.random() * 0.3,
        maxLife: 0.8,
        color: enemy.color,
      });
    }
  }

  private checkWaveEnd() {
    if (!this.waveActive) return;
    if (this.spawnQueue.length > 0 || this.enemies.length > 0) return;
    this.waveActive = false;
    const bonus = waveClearBonus(this.wave);
    this.money += bonus;
    this.goldEarned += bonus;
    this.wave += 1;
    this.emit();
  }

  private endGame() {
    this.gameOver = true;
    this.waveActive = false;
    this.sound.play('game_over');
  }

  restart() {
    this.enemies = [];
    this.towers = [];
    this.projectiles = [];
    this.hitsplats = [];
    this.particles = [];
    this.deaths = [];
    this.spawnQueue = [];
    this.money = START_MONEY;
    this.lives = START_LIVES;
    this.wave = 1;
    this.kills = 0;
    this.goldEarned = 0;
    this.waveTotal = 0;
    this.bossWave = false;
    this.waveActive = false;
    this.gameOver = false;
    this.selectedTowerType = null;
    this.selectedTowerId = null;
    this.movingTowerId = null;
    this.gameTime = 0;
    this.emit();
  }
}
