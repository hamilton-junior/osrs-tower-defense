import type { Enemy, Tower, Projectile, Point, EnemyType, TowerType, GlobalUpgrades } from '../types';
import { ENEMIES } from '../data/enemies';
import { TOWERS } from '../data/towers';
import { LANDMARK_WAVES } from '../data/waves';
import { ASSETS } from '../assets';
import { distance, distanceSq, isValidPlacement } from '../systems/geometry';
import { selectTarget } from '../systems/targeting';
import { scaleEnemyStats } from '../systems/enemy-scaling';
import { buildWaveConfigs } from '../systems/wave-generation';
import { calculateTowerStats } from '../systems/tower-combat';
import { GameRenderer } from './renderer';

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
  wave: number;
  waveActive: boolean;
  remaining: number;
  gameOver: boolean;
  selectedTowerType: TowerType | null;
  selectedTowerId: string | null;
}

const uid = () => Math.random().toString(36).slice(2, 11);

export class GameEngine {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  private readonly renderer: GameRenderer;
  private readonly onState: (patch: Partial<UIState>) => void;

  // --- world state ---
  path: Point[] = [];
  enemies: Enemy[] = [];
  towers: Tower[] = [];
  projectiles: Projectile[] = [];

  money = START_MONEY;
  lives = START_LIVES;
  wave = 1;
  waveActive = false;
  gameOver = false;

  selectedTowerType: TowerType | null = null;
  selectedTowerId: string | null = null;
  pointer: Point = { x: 0, y: 0 };

  // --- spawn/loop bookkeeping ---
  private spawnQueue: Enemy[] = [];
  private spawnTimer = 0;
  private readonly spawnInterval = 0.7; // seconds between spawns
  private rafId = 0;
  private lastTime = 0;

  // --- assets ---
  readonly images = new Map<string, HTMLImageElement>();
  private readonly brokenImages = new Set<string>();

  constructor(canvas: HTMLCanvasElement, onState: (patch: Partial<UIState>) => void) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.onState = onState;
    this.renderer = new GameRenderer(this);
    this.canvas.width = LOGIC_WIDTH;
    this.canvas.height = LOGIC_HEIGHT;
    this.buildPath();
    this.preloadImages();
    this.emit();
  }

  // ---------------------------------------------------------------- lifecycle
  start() {
    this.lastTime = performance.now();
    const loop = () => {
      const now = performance.now();
      const dt = Math.min((now - this.lastTime) / 1000, 0.1); // clamp big gaps
      this.lastTime = now;
      if (!this.gameOver) this.update(dt);
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
      wave: this.wave,
      waveActive: this.waveActive,
      remaining: this.spawnQueue.length + this.enemies.length,
      gameOver: this.gameOver,
      selectedTowerType: this.selectedTowerType,
      selectedTowerId: this.selectedTowerId,
    });
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
    const w = LOGIC_WIDTH;
    const h = LOGIC_HEIGHT;
    this.path = [
      { x: -30, y: h * 0.2 },
      { x: w * 0.2, y: h * 0.2 },
      { x: w * 0.2, y: h * 0.8 },
      { x: w * 0.5, y: h * 0.8 },
      { x: w * 0.5, y: h * 0.4 },
      { x: w * 0.8, y: h * 0.4 },
      { x: w * 0.8, y: h * 0.6 },
      { x: w + 30, y: h * 0.6 },
    ];
  }

  // ------------------------------------------------------------- input/actions
  setPointer(x: number, y: number) {
    this.pointer = { x, y };
  }

  selectTowerType(type: TowerType | null) {
    this.selectedTowerType = type;
    this.selectedTowerId = null;
    this.emit();
  }

  towerCost(type: TowerType): number {
    return TOWERS[type]?.tiers[0].upgradeCost ?? 0;
  }

  /** Handle a click in logic space: place a tower or select/deselect one. */
  handleClick(x: number, y: number) {
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
    if (this.money < cost) return;
    if (!isValidPlacement(sx, sy, this.path, this.towers)) return;

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
    this.selectedTowerType = null;
    this.emit();
  }

  upgradeTower(towerId: string) {
    const tower = this.towers.find(t => t.id === towerId);
    if (!tower || tower.level >= tower.maxLevel) return;
    const cost = tower.upgradeCost;
    if (this.money < cost) return;
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
    this.emit();
  }

  sellTower(towerId: string) {
    const i = this.towers.findIndex(t => t.id === towerId);
    if (i < 0) return;
    const tower = this.towers[i];
    const def = TOWERS[tower.type];
    const spent = def.tiers.slice(0, tower.level).reduce((s, t) => s + t.upgradeCost, 0);
    this.money += Math.floor(spent * 0.75);
    this.towers.splice(i, 1);
    if (this.selectedTowerId === towerId) this.selectedTowerId = null;
    this.emit();
  }

  startWave() {
    if (this.waveActive || this.gameOver) return;
    this.spawnQueue = this.generateWave(this.wave);
    this.waveActive = true;
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
    this.spawn(dt);
    this.moveEnemies(dt);
    this.fireTowers(dt);
    this.moveProjectiles(dt);
    this.checkWaveEnd();
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
    const now = performance.now();
    for (const tower of this.towers) {
      const stats = calculateTowerStats(tower, {
        upgrades: NO_UPGRADES,
        activePrayers: new Set(),
        activePotions: [],
        allTowers: this.towers,
      });
      const rangeSq = stats.range * stats.range;

      // (re)acquire a target
      let target = tower.targetId ? this.enemies.find(e => e.id === tower.targetId) : undefined;
      if (!target || distanceSq(target.x, target.y, tower.x, tower.y) > rangeSq) {
        const inRange = this.enemies.filter(e => distanceSq(e.x, e.y, tower.x, tower.y) <= rangeSq);
        target = selectTarget(inRange, tower.x, tower.y, this.path, tower.targetingPriority) ?? undefined;
        tower.targetId = target?.id ?? null;
      }
      if (!target) continue;

      if (now - tower.lastFired < stats.cooldown) continue;
      tower.lastFired = now;

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
      });
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

  private damage(enemy: Enemy, amount: number) {
    enemy.hp -= amount;
    if (enemy.hp > 0) return;
    const i = this.enemies.indexOf(enemy);
    if (i < 0) return;
    this.enemies.splice(i, 1);
    this.money += Math.floor(enemy.reward * 0.5);
    this.emit();
  }

  private checkWaveEnd() {
    if (!this.waveActive) return;
    if (this.spawnQueue.length > 0 || this.enemies.length > 0) return;
    this.waveActive = false;
    this.money += 10 + this.wave * 5; // clear bonus
    this.wave += 1;
    this.emit();
  }

  private endGame() {
    this.gameOver = true;
    this.waveActive = false;
  }

  restart() {
    this.enemies = [];
    this.towers = [];
    this.projectiles = [];
    this.spawnQueue = [];
    this.money = START_MONEY;
    this.lives = START_LIVES;
    this.wave = 1;
    this.waveActive = false;
    this.gameOver = false;
    this.selectedTowerType = null;
    this.selectedTowerId = null;
    this.emit();
  }
}
