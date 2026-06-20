import type { Enemy, Tower, Projectile, Point, EnemyType, TowerType, TargetingPriority, GlobalUpgrades, PrayerType, Element, AncientType, MageMode, SupportSpell, DotKind } from '../types';
import { ENEMIES } from '../data/enemies';
import { TOWERS } from '../data/towers';
import { LANDMARK_WAVES } from '../data/waves';
import { CAST_TOTAL, DEFAULT_CAST_FRAC } from '../data/cast-timing';
import { ASSETS } from '../assets';
import { distance, distanceSq, isValidPlacement, squareRange, inSquareRange } from '../systems/geometry';
import { selectTarget } from '../systems/targeting';
import { scaleEnemyStats } from '../systems/enemy-scaling';
import { buildWaveConfigs } from '../systems/wave-generation';
import { calculateTowerStats, type ComputedTowerStats } from '../systems/tower-combat';
import { ELEMENTS, ANCIENTS, ELEMENT_ORDER, ANCIENT_ORDER, SUPPORT_ORDER, weaknessMultiplier, lifestealChance, bloodBonusFrac, sanctityRate, ancientHit, spellSpriteName, BARRAGE_SPLASH_FALLOFF, TICK_SECONDS } from '../systems/magic';
import { goldForKill, waveClearBonus } from '../systems/rewards';
import { debuffTenacity } from '../systems/tenacity';
import { GameRenderer } from './renderer';
import { SoundManager, GAME_SOUNDS } from './sound';
import { SlayerSystem } from '../systems/slayer-system';
import { PrayerSystem } from '../systems/prayer-system';
import { GeSystem, type GeListing } from '../systems/ge-system';

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
  /** Whether a boss is currently alive on the field (its HP bar is showing). */
  bossOnField: boolean;
  gameOver: boolean;
  selectedTowerType: TowerType | null;
  selectedTowerId: string | null;
  movingTowerId: string | null;
  /** Grid spot the player tapped to build on — drives the on-map tower picker. */
  pendingPlacement: { x: number; y: number } | null;
  /** Spellbook a freshly-placed wizard will use (pre-placement choice). */
  pendingMageMode: MageMode;
  gameSpeed: number;
  paused: boolean;
  muted: boolean;
  volume: number;
  /** Last transient notice (e.g. "Not enough gold"); null when none yet. */
  notice: string | null;
  /** Optional icon URL shown alongside the notice (e.g. the Slayer icon). */
  noticeIcon: string | null;
  /** Bumped every time a notice fires so the UI can re-trigger on repeats. */
  noticeSeq: number;
  /** Active Slayer task (null when none assigned), as a cloneable view. */
  slayerTask: { type: EnemyType; name: string; count: number; total: number; reward: number } | null;
  /** Accumulated Slayer points. */
  slayerPoints: number;
  /** Completed-task streak. */
  slayerStreak: number;
  /** Name of the Slayer master that would assign the next task. */
  slayerMaster: string;
  /** Current prayer points (rounded). */
  prayerPoints: number;
  /** Maximum prayer points. */
  prayerMax: number;
  /** Currently active prayers (cloneable list). */
  activePrayers: PrayerType[];
  /** Grand Exchange stock with live prices + active-buff timers. */
  geOffers: GeListing[];
}

const uid = () => Math.random().toString(36).slice(2, 11);

/** Approximate body radius (px) used for range/hit tests, matching the sprite size. */
const enemyRadius = (e: { isBoss?: boolean }) => (e.isBoss ? 28 : 13);

/**
 * Exponential ease-in for projectile flight: maps progress `t` (0→1) to a
 * covered-distance fraction (0→1) that starts near-flat and ramps up steeply,
 * so the bolt barely creeps off the tower then races in, landing right as the
 * cast clip ends. `EASE_K` sets the steepness (higher = slower start, harder
 * finish); the normalisation keeps f(0)=0 and f(1)=1 exactly.
 */
const EASE_K = 6;
const EASE_NORM = Math.exp(EASE_K) - 1;
function projectileEase(t: number): number {
  return (Math.exp(EASE_K * t) - 1) / EASE_NORM;
}

/** Hitsplat colour, following the OSRS Template:Hitsplat palette: `hit` (red
 *  damage), `miss` (blue 0/block), `poison` (green), `venom` (dark green),
 *  `burn` (orange fire DoT), `heal` (purple). */
export type HitsplatKind = 'hit' | 'miss' | 'poison' | 'venom' | 'burn' | 'heal';

/** The damage-over-time kinds, ticked independently in `damageOverTime`. */
const DOT_KINDS: readonly DotKind[] = ['burn', 'poison'];

/** Transient OSRS-style hit marker shown over an enemy when it takes damage. */
export interface Hitsplat {
  x: number;
  y: number;
  value: number;
  kind: HitsplatKind;
  life: number;
  /** DoT/secondary splat: drawn smaller, below the enemy, drifting sideways so
   *  the primary (direct) hit stays prominent above. */
  minor?: boolean;
  /** Horizontal drift (px/s) for minor splats. */
  vx?: number;
}

/** Live summary of the enemy under the pointer, for the hover info panel. */
/** Active debuff kinds shown as icons in the enemy hover panel. */
export type DebuffId = 'slow' | 'stun' | 'burn' | 'poison' | 'vuln';

export interface EnemyHoverInfo {
  name: string;
  hp: number;
  maxHp: number;
  speed: number;
  baseSpeed: number;
  weakness: Element | null;
  reward: number;
  isBoss: boolean;
  x: number;
  y: number;
  effects: DebuffId[];
  /** Crowd-control resistance, 0..1 (see `GameEngine.tenacity`). */
  tenacity: number;
}

/** A dying enemy's sprite, fading out where it fell. */
export interface DeathFx {
  x: number;
  y: number;
  type: string;
  isBoss: boolean;
  renderScale?: number;
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
  /** Downward acceleration (px/s²); defaults to 220 when omitted. */
  gravity?: number;
  /** Draw radius (px); defaults to 2.5 when omitted. */
  size?: number;
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
  pendingPlacement: Point | null = null;
  selectedTowerId: string | null = null;
  movingTowerId: string | null = null;
  /** Enemy "pinned" by a click: its info panel stays open (tracking the enemy as
   *  it moves) until the player clicks elsewhere. Null = follow the hovered one. */
  inspectedEnemyId: string | null = null;
  /** Spellbook a newly-bought wizard will be locked into (chosen pre-placement). */
  pendingMageMode: MageMode = 'elemental';
  gameSpeed = 1;
  paused = false;
  pointer: Point = { x: 0, y: 0 };
  /** Pulse (1 → 0) when the base takes a leak, for the renderer's hit flash. */
  baseFlash = 0;

  // --- run stats (read directly by the UI, e.g. the game-over screen) ---
  kills = 0;
  goldEarned = 0;
  private notice: string | null = null;
  private noticeIcon: string | null = null;
  private noticeSeq = 0;

  // --- composed subsystems ---
  readonly slayer = new SlayerSystem(this);
  readonly prayer = new PrayerSystem(this);
  readonly ge = new GeSystem(this);

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
    this.slayer.assignTask(); // auto-assign the first Slayer task
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
      if (!this.gameOver && !this.paused) {
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
      bossOnField: this.enemies.some(e => e.isBoss),
      gameOver: this.gameOver,
      selectedTowerType: this.selectedTowerType,
      selectedTowerId: this.selectedTowerId,
      movingTowerId: this.movingTowerId,
      pendingPlacement: this.pendingPlacement ? { x: this.pendingPlacement.x, y: this.pendingPlacement.y } : null,
      pendingMageMode: this.pendingMageMode,
      gameSpeed: this.gameSpeed,
      paused: this.paused,
      muted: this.sound.isMuted,
      volume: this.sound.level,
      notice: this.notice,
      noticeIcon: this.noticeIcon,
      noticeSeq: this.noticeSeq,
      slayerTask: this.slayer.task
        ? {
            type: this.slayer.task.type,
            name: ENEMIES[this.slayer.task.type]?.name ?? this.slayer.task.type,
            count: this.slayer.task.count,
            total: this.slayer.task.total,
            reward: this.slayer.task.reward,
          }
        : null,
      slayerPoints: this.slayer.points,
      slayerStreak: this.slayer.streak,
      slayerMaster: this.slayer.masterName,
      prayerPoints: Math.round(this.prayer.points),
      prayerMax: this.prayer.max,
      activePrayers: [...this.prayer.active],
      geOffers: this.ge.listing(),
    });
  }

  /** Flash a transient message to the UI (e.g. an action that couldn't run).
   *  Pass `icon` (a URL) to show an icon alongside it instead of the default. */
  notify(text: string, icon?: string) {
    this.notice = text;
    this.noticeIcon = icon ?? null;
    this.noticeSeq++;
    this.emit();
  }

  /** Re-push the UI snapshot — used by composed subsystems after mutating state. */
  requestEmit() {
    this.emit();
  }

  /** Play a game sound (thin public wrapper for composed subsystems). */
  playSound(id: string, throttleMs?: number) {
    this.sound.play(id, throttleMs);
  }

  /** Toggle a prayer on/off (UI button). */
  togglePrayer(id: PrayerType) {
    this.prayer.toggle(id);
  }

  /** Buy a Grand Exchange consumable (UI button). */
  buyGeOffer(id: string) {
    this.ge.buy(id);
  }

  /** A tower's effective combat stats right now (prayers + potions applied),
   *  for the UI to show buffed values and their origin. */
  effectiveStats(towerId: string): ComputedTowerStats | null {
    const tower = this.towers.find(t => t.id === towerId);
    if (!tower) return null;
    return calculateTowerStats(tower, {
      upgrades: NO_UPGRADES,
      activePrayers: this.prayer.active,
      activePotions: this.ge.active,
      allTowers: this.towers,
    });
  }

  setGameSpeed(speed: number) {
    this.gameSpeed = Math.max(1, Math.min(5, Math.floor(speed)));
    this.emit();
  }

  togglePause() {
    this.paused = !this.paused;
    this.sound.play('click');
    this.emit();
  }

  /** ESC: back out of a pending placement/move first; otherwise pause combat.
   *  Pausing only freezes the sim (enemies, towers, projectiles, DoTs, prayer &
   *  potion timers) — the player can still place, move, sell and pick spells. */
  escape() {
    if (this.pendingPlacement || this.movingTowerId || this.selectedTowerType) {
      this.cancelAction();
    } else {
      this.togglePause();
    }
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
      // Spell icons double as the tower badge and the projectile sprite.
      ...Object.fromEntries(
        Object.entries(ASSETS.spells).map(([name, url]) => [`spell_${name}`, url]),
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

  /** Topmost enemy within click/hover range of a logic point, or null. */
  private enemyAt(x: number, y: number): Enemy | null {
    let best: Enemy | null = null;
    let bestD = Infinity;
    for (const e of this.enemies) {
      const r = enemyRadius(e) + 6;
      const d = distanceSq(e.x, e.y, x, y);
      if (d <= r * r && d < bestD) { best = e; bestD = d; }
    }
    return best;
  }

  /** Build the live info-panel summary for one enemy. */
  private summarizeEnemy(e: Enemy): EnemyHoverInfo {
    const effects: DebuffId[] = [];
    if (e.slowTimer > 0) effects.push('slow');
    if (e.stunTimer > 0) effects.push('stun');
    if ((e.dots?.burn?.timer ?? 0) > 0) effects.push('burn');
    if ((e.dots?.poison?.timer ?? 0) > 0) effects.push('poison');
    if (e.vulnTimer && e.vulnTimer > 0) effects.push('vuln');
    return {
      name: e.name,
      hp: Math.max(0, Math.ceil(e.hp)),
      maxHp: e.maxHp,
      speed: Math.round(e.speed),
      baseSpeed: Math.round(e.baseSpeed),
      weakness: e.weakness && e.weakness !== 'none' ? e.weakness : null,
      reward: goldForKill(e.maxHp, this.wave),
      isBoss: !!e.isBoss,
      x: e.x,
      y: e.y,
      effects,
      tenacity: this.tenacity(e),
    };
  }

  /** Summary of the enemy under the pointer (for the hover info panel), or null.
   *  Polled by the UI so HP/effects read live as the enemy moves and takes hits. */
  hoveredEnemySummary(): EnemyHoverInfo | null {
    const best = this.enemyAt(this.pointer.x, this.pointer.y);
    return best ? this.summarizeEnemy(best) : null;
  }

  /** Enemy summary for the info panel: the pinned (clicked) enemy if one is still
   *  alive, otherwise whichever enemy is under the pointer. `pinned` lets the UI
   *  keep the panel interactive (tooltips) and stationary while inspecting. */
  activeEnemySummary(): { info: EnemyHoverInfo; pinned: boolean } | null {
    if (this.inspectedEnemyId != null) {
      const pinned = this.enemies.find(e => e.id === this.inspectedEnemyId);
      if (pinned) return { info: this.summarizeEnemy(pinned), pinned: true };
      this.inspectedEnemyId = null; // it died/escaped — fall back to hover
    }
    const hov = this.hoveredEnemySummary();
    return hov ? { info: hov, pinned: false } : null;
  }

  /** Clear the pinned enemy (× button on the info panel). */
  unpinEnemy() {
    if (this.inspectedEnemyId == null) return;
    this.inspectedEnemyId = null;
    this.emit();
  }

  selectTowerType(type: TowerType | null) {
    this.selectedTowerType = type;
    this.selectedTowerId = null;
    this.movingTowerId = null;
    this.pendingPlacement = null;
    this.inspectedEnemyId = null;
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
    this.pendingPlacement = null;
    this.sound.play('click');
    this.emit();
  }

  /** Cancel any pending placement or move without charging. */
  cancelAction() {
    this.selectedTowerType = null;
    this.movingTowerId = null;
    this.pendingPlacement = null;
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
      // The wizard opens an on-tile spellbook picker (Elemental/Ancients/Utility)
      // before it's built; every other tower places immediately.
      if (this.selectedTowerType === 'wizard') {
        const sx = Math.round(x / GRID) * GRID;
        const sy = Math.round(y / GRID) * GRID;
        if (isValidPlacement(sx, sy, this.path, this.towers)) {
          this.pendingPlacement = { x: sx, y: sy };
          this.emit();
        } else {
          this.notify("Can't build there");
        }
        return;
      }
      this.placeTower(this.selectedTowerType, x, y);
      return;
    }
    const hit = this.towers.find(t => distance(t.x, t.y, x, y) <= TOWER_RADIUS + 4);
    const hadPanel = this.selectedTowerId !== null || this.inspectedEnemyId !== null;
    if (hit) {
      this.selectedTowerId = hit.id;
      this.inspectedEnemyId = null; // a tower took focus
      this.sound.play('interface_open'); // tower stats panel opens
    } else {
      // No tower: pin an enemy under the click (open its info panel), else clear.
      const enemy = this.enemyAt(x, y);
      this.inspectedEnemyId = enemy ? enemy.id : null;
      this.selectedTowerId = null;
      if (enemy) this.sound.play('interface_open'); // enemy info panel opens
      else if (hadPanel) this.sound.play('interface_close'); // clicked away → panel closes
    }
    this.pendingPlacement = null;
    this.emit();
  }

  /** Build the chosen tower on the tile tapped open in the picker.
   *  (Kept for the disabled general 6-tower picker / possible future use.) */
  confirmPlacement(type: TowerType) {
    if (!this.pendingPlacement) return;
    const { x, y } = this.pendingPlacement;
    const before = this.towers.length;
    this.placeTower(type, x, y);
    if (this.towers.length > before) this.pendingPlacement = null; // placed → close picker
    this.emit();
  }

  /** Build a wizard with the chosen spellbook on the tile the picker opened on. */
  confirmWizardSpellbook(mode: MageMode) {
    if (!this.pendingPlacement) return;
    this.pendingMageMode = mode;
    const { x, y } = this.pendingPlacement;
    const before = this.towers.length;
    this.placeTower('wizard', x, y); // reads pendingMageMode; clears selectedTowerType
    if (this.towers.length > before) this.pendingPlacement = null; // placed → close picker
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
      // Wizard's spellbook is the pre-placement choice and is locked from here on;
      // only its element (Elemental) or barrage (Ancients) stays adjustable.
      mageMode: type === 'wizard' ? this.pendingMageMode : undefined,
      element: type === 'wizard' && this.pendingMageMode === 'elemental' ? 'air' : undefined,
      ancientType: type === 'wizard' && this.pendingMageMode === 'ancients' ? 'ice' : undefined,
      supportSpell: type === 'wizard' && this.pendingMageMode === 'utility' ? 'curse' : undefined,
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

  /** Choose the spellbook the next wizard will be built with. A wizard's
   *  spellbook is locked once placed — only its element/barrage can change. */
  setPendingMageMode(mode: MageMode) {
    this.pendingMageMode = mode;
    this.sound.play('click');
    this.emit();
  }

  /** Pick the element a Elemental-spellbook wizard casts. */
  setWizardElement(towerId: string, element: Element) {
    const tower = this.towers.find(t => t.id === towerId);
    if (!tower || tower.type !== 'wizard') return;
    tower.element = element;
    this.sound.play('click');
    this.emit();
  }

  /** Pick the barrage an Ancients-spellbook wizard casts. */
  setAncientType(towerId: string, ancient: AncientType) {
    const tower = this.towers.find(t => t.id === towerId);
    if (!tower || tower.type !== 'wizard') return;
    tower.ancientType = ancient;
    this.sound.play('click');
    this.emit();
  }

  /** Pick the field a Utility-spellbook wizard projects. */
  setSupportSpell(towerId: string, spell: SupportSpell) {
    const tower = this.towers.find(t => t.id === towerId);
    if (!tower || tower.type !== 'wizard') return;
    tower.supportSpell = spell;
    this.sound.play('click');
    this.emit();
  }

  /** Keyboard Q/W/E/R (slots 0..3): switch the *selected* wizard's element /
   *  barrage / support field by slot. Utility has only 3 fields, so slot 3 (R) is
   *  a no-op. No-op when the selected tower isn't a wizard. */
  selectWizardSlot(slot: number) {
    const tower = this.towers.find(t => t.id === this.selectedTowerId);
    if (!tower || tower.type !== 'wizard') return;
    const mode = tower.mageMode ?? 'elemental';
    if (mode === 'elemental') {
      const el = ELEMENT_ORDER[slot];
      if (el) this.setWizardElement(tower.id, el);
    } else if (mode === 'ancients') {
      const anc = ANCIENT_ORDER[slot];
      if (anc) this.setAncientType(tower.id, anc);
    } else {
      const sup = SUPPORT_ORDER[slot];
      if (sup) this.setSupportSpell(tower.id, sup);
    }
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
    this.slayer.assignTask(); // idempotent: ensure a task exists so it can seed the wave
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
      // Seed the active Slayer-task target so its enemies keep spawning —
      // the fail-safe against a task whose monster has dropped out of waves.
      slayerTask: this.slayer.task,
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
      groundTimer: 0,
    };
  }

  // ------------------------------------------------------------------- update
  private update(dt: number) {
    this.gameTime += dt;
    this.prayer.update(dt);
    this.ge.update(dt);
    this.spawn(dt);
    this.damageOverTime(dt);
    this.moveEnemies(dt);
    this.fireTowers(dt);
    this.updateUtilityTowers(dt);
    this.moveProjectiles(dt);
    this.updateEffects(dt);
    this.checkWaveEnd();
  }

  /** Advance purely-visual effects (no gameplay impact). */
  private updateEffects(dt: number) {
    if (this.baseFlash > 0) this.baseFlash = Math.max(0, this.baseFlash - dt * 1.6);
    for (let i = this.hitsplats.length - 1; i >= 0; i--) {
      const h = this.hitsplats[i];
      h.life -= dt;
      if (h.minor) {
        h.x += (h.vx ?? 0) * dt; // drift sideways
        h.y += 8 * dt;           // and slightly down, away from the main splat
      } else {
        h.y -= 28 * dt; // direct hits float up
      }
      if (h.life <= 0) this.hitsplats.splice(i, 1);
    }
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += (p.gravity ?? 220) * dt;
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

  /**
   * Tick Fire `burn` and Smoke `poison` damage-over-time. Each kind is tracked
   * and ticked independently, so an enemy can carry both at once and they show as
   * two separate hitsplats. Damage accrues every frame but is only dealt/shown
   * once per game tick (0.6s) as a single splat summing the period's damage — so
   * DoT doesn't spam tiny numbers every frame.
   */
  private damageOverTime(dt: number) {
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (!e.dots) continue;
      for (const kind of DOT_KINDS) {
        const d = e.dots[kind];
        if (!d || d.timer <= 0) continue;
        d.timer -= dt;
        d.accum += d.dps * dt;
        d.tickTimer += dt;
        const expired = d.timer <= 0;
        if (d.tickTimer >= TICK_SECONDS || expired) {
          d.tickTimer = 0;
          const total = Math.floor(d.accum);
          if (total > 0) {
            d.accum -= total;
            if (this.damage(e, total, kind, true)) break; // enemy died; stop ticking it
          }
        }
        if (expired) delete e.dots[kind];
      }
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
      if (e.vulnTimer && e.vulnTimer > 0) e.vulnTimer -= dt;
      if (e.stunTimer > 0) {
        e.stunTimer -= dt;
        continue; // Earth/Shadow stun: frozen in place this frame
      }
      const target = this.path[e.pathIndex + 1];
      if (!target) {
        // reached the end → leak a life
        this.enemies.splice(i, 1);
        this.lives -= 1;
        this.baseFlash = 1;
        this.sound.play('hit', 90);
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
    // Damage already heading toward each enemy from in-flight projectiles. A
    // tower won't pick (or keep) a target that another shot will already kill,
    // so kills aren't wasted on overkill — that shot is freed for a live enemy.
    const incoming = new Map<string, number>();
    for (const p of this.projectiles) {
      if (p.targetId) incoming.set(p.targetId, (incoming.get(p.targetId) ?? 0) + p.damage);
    }
    const doomed = (e: Enemy) => (incoming.get(e.id) ?? 0) >= e.hp;
    for (const tower of this.towers) {
      if (tower.recoil) tower.recoil = Math.max(0, tower.recoil - dt * 6); // ~0.16s pulse
      // Utility wizards don't fire — they project a field (see updateUtilityTowers).
      if (tower.type === 'wizard' && tower.mageMode === 'utility') continue;
      const stats = calculateTowerStats(tower, {
        upgrades: NO_UPGRADES,
        activePrayers: this.prayer.active,
        activePotions: this.ge.active,
        allTowers: this.towers,
      });
      const half = squareRange(stats.range, GRID);
      // Test the enemy's body, not just its centre, so a tower fires as soon as
      // an enemy overlaps its range square (e.g. when the road clips the edge).
      // Already-doomed enemies are excluded so the tower looks past them.
      const inReach = (e: Enemy) => !doomed(e) && inSquareRange(e.x, e.y, tower.x, tower.y, half + enemyRadius(e));

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

      // Base damage: Ancients hit for the Ice-barrage values (16/22/25/30),
      // independent of element; everything else uses the tier's own damage.
      let baseDamage = tower.type === 'wizard' && (tower.mageMode ?? 'elemental') === 'ancients'
        ? ancientHit(tower.level)
        : tower.damage;
      if (tower.type === 'cannon') {
        const lo = tower.minDamage ?? 0;
        const hi = tower.maxDamage ?? 0;
        baseDamage = lo + Math.random() * (hi - lo);
      }
      let damage = Math.floor((baseDamage + stats.flatDamageBonus) * stats.damageMultiplier);

      // Base projectile flavour; the cannon splashes, toxic slows.
      let projColor = tower.color;
      let projSpecial: Projectile['special'] | undefined = tower.special === 'rapid' || tower.special === 'aoe' ? undefined : tower.special;
      let projAoe = tower.special === 'aoe';
      let projLifesteal = false;
      let projBonusMaxHpFrac = 0;
      const projSpell = spellSpriteName(tower) ?? undefined;

      // Wizard spellbooks: Elemental (single-target status + weakness bonus),
      // Ancients (AoE barrage with a signature status), Utility (support aura,
      // applied in tower-combat — it just fires a plain bolt here).
      if (tower.type === 'wizard') {
        const mode = tower.mageMode ?? 'elemental';
        if (mode === 'elemental') {
          const spec = ELEMENTS[(tower.element ?? 'air') as Exclude<Element, 'none'>];
          projColor = spec.glow ?? spec.color; // glow/trail matches the spell sprite
          projSpecial = spec.effect;
          damage = Math.floor(damage * weaknessMultiplier(tower.element ?? 'air', target.weakness));
        } else if (mode === 'ancients') {
          const anc = tower.ancientType ?? 'ice';
          const spec = ANCIENTS[anc];
          projColor = spec.glow ?? spec.color; // glow/trail matches the spell sprite
          projSpecial = spec.effect;
          projAoe = true;
          projLifesteal = !!spec.lifesteal;
          // Blood barrage adds (3 + 0.5·level)% of each target's max HP on hit.
          if (anc === 'blood') projBonusMaxHpFrac = bloodBonusFrac(tower.level);
          // Ice applies its slow NOW (on the tower's attack cadence), not on contact:
          // the long sound-synced flight shouldn't delay the crowd-control. Damage
          // still lands with the bolt, so drop the on-hit slow. Slows every enemy in
          // the barrage's blast radius around the target, as the splash would.
          if (anc === 'ice') {
            for (const e of this.enemies) {
              if (distanceSq(e.x, e.y, target.x, target.y) <= 80 * 80) this.applySlow(e);
            }
            projSpecial = undefined;
          }
        }
      }

      // A wizard plays the exact spell's cast clip and times the projectile's
      // flight to that clip's length, so the bolt lands as the sound finishes;
      // archer/cannon shots use a fixed nominal speed. Every projectile then
      // eases in (slow→fast) over this flight time (see moveProjectiles).
      let soundKey = `fire_${tower.type}`;
      const dist = distance(tower.x, tower.y, target.x, target.y);
      let flight = dist / 600; // archer/cannon nominal flight
      if (tower.type === 'wizard') {
        const mode = tower.mageMode ?? 'elemental';
        soundKey = mode === 'ancients'
          ? `cast_${tower.ancientType ?? 'ice'}_${tower.level}`
          : `cast_${tower.element ?? 'air'}_${tower.level}`;
        // Land the bolt after the clip's full cast+hit has played. CAST_TOTAL holds
        // that total (end of audible content) in absolute seconds, measured per clip
        // offline (scripts/analyze-cast-clips.mjs); clips without a measurement fall
        // back to a fixed fraction of the clip length.
        // Falls back to 0.6s only until the clip is decoded (first cast).
        const dur = this.sound.duration(soundKey);
        const total = CAST_TOTAL[soundKey];
        flight = Number.isFinite(dur)
          ? (total != null ? Math.min(total, dur) : dur * DEFAULT_CAST_FRAC)
          : 0.6;
      }
      flight = Math.max(0.05, flight); // tiny floor: never instantaneous / div-by-zero

      this.projectiles.push({
        id: uid(),
        x: tower.x,
        y: tower.y,
        ox: tower.x,
        oy: tower.y,
        flight,
        age: 0,
        targetId: target.id,
        speed: dist / flight, // kept for the trail/legacy; motion uses the ease curve
        damage,
        color: projColor,
        type: tower.type === 'cannon' ? 'cannonball' : tower.type === 'wizard' ? 'spell' : 'arrow',
        special: projSpecial,
        aoe: projAoe || undefined,
        lifesteal: projLifesteal || undefined,
        bonusMaxHpFrac: projBonusMaxHpFrac || undefined,
        spellIcon: projSpell,
        sourceTowerId: tower.id,
        trail: [],
      });
      // Count this shot toward the target so other towers firing this same frame
      // also treat it as (more) doomed and look elsewhere.
      incoming.set(target.id, (incoming.get(target.id) ?? 0) + damage);
      this.sound.play(soundKey, 70);
    }
  }

  /**
   * Utility wizards are support casters: instead of firing, each projects ONE
   * field over the enemies in its range. The field status is re-applied every
   * frame (short refreshed timer) so it lasts exactly while an enemy is inside.
   * Sanctity has no field — it's a Prayer battery that trickles points back.
   */
  private updateUtilityTowers(dt: number) {
    for (const tower of this.towers) {
      if (tower.type !== 'wizard' || tower.mageMode !== 'utility') continue;
      const spell = tower.supportSpell ?? 'curse';

      if (spell === 'sanctity') {
        this.prayer.restore(sanctityRate(this.wave) * dt); // wave-scaled, stacks per tower
        continue;
      }

      const range = this.effectiveStats(tower.id)?.range ?? tower.range;
      const half = squareRange(range, GRID);
      for (const e of this.enemies) {
        if (!inSquareRange(e.x, e.y, tower.x, tower.y, half + enemyRadius(e))) continue;
        if (spell === 'curse') {
          // Refreshed while inside; tenacity-scaled but doesn't build boss tenacity
          // (it's a continuous aura, not a discrete hit).
          e.vulnTimer = Math.max(e.vulnTimer ?? 0, 0.5 * (1 - this.tenacity(e)));
        } else if (spell === 'enfeeble') {
          this.applySlow(e, 0.5, false);
        }
      }
    }
  }

  private moveProjectiles(dt: number) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      // Home on the live target while it exists; once it dies, the destination
      // stays frozen at its last position so the bolt still completes its flight
      // (and any AoE) instead of vanishing — no wasted shot.
      const target = this.enemies.find(e => e.id === p.targetId) ?? null;
      if (target) { p.destX = target.x; p.destY = target.y; }
      const destX = p.destX ?? p.x;
      const destY = p.destY ?? p.y;
      if (p.trail) {
        p.trail.push({ x: p.x, y: p.y });
        if (p.trail.length > 6) p.trail.shift();
      }
      // Ease-in flight: lerp from the launch point toward the destination with
      // an exponential curve, so the bolt creeps off slowly then accelerates,
      // arriving at age===flight — keeping the sound-synced total flight time.
      p.age = (p.age ?? 0) + dt;
      const flight = p.flight ?? 0.4;
      const t = Math.min(1, p.age / flight);
      const f = projectileEase(t);
      const ox = p.ox ?? p.x;
      const oy = p.oy ?? p.y;
      p.x = ox + (destX - ox) * f;
      p.y = oy + (destY - oy) * f;
      const d = Math.hypot(destX - p.x, destY - p.y);
      if (t >= 1 || d < 8) {
        this.hit(p, target);
        this.projectiles.splice(i, 1);
      }
    }
  }

  private hit(p: Projectile, target: Enemy | null) {
    this.spawnImpactParticles(p.x, p.y, p.color);
    let primaryKilled = false;
    if (p.aoe || p.special === 'aoe') {
      // Magic barrages splash for reduced damage on non-primary targets so AoE
      // stays a side-grade to single-target; the cannon keeps full splash.
      const splash = p.type === 'cannonball' ? 1 : BARRAGE_SPLASH_FALLOFF;
      // Snapshot: damage() splices the live array as enemies die.
      const near = this.enemies.filter(e => distanceSq(e.x, e.y, p.x, p.y) <= 80 * 80);
      // If the intended target died mid-flight, the closest enemy at impact takes
      // the full-damage primary hit so the barrage still lands "normally".
      const primary = target && near.includes(target)
        ? target
        : near.reduce<Enemy | null>((best, e) =>
            !best || distanceSq(e.x, e.y, p.x, p.y) < distanceSq(best.x, best.y, p.x, p.y) ? e : best, null);
      for (const e of near) {
        const isPrimary = e === primary;
        const scale = isPrimary ? 1 : splash;
        // Blood barrage: bonus damage as a % of this enemy's max HP, splash-scaled.
        const bonus = p.bonusMaxHpFrac ? Math.floor(e.maxHp * p.bonusMaxHpFrac * scale) : 0;
        const dmg = Math.floor(p.damage * scale) + bonus;
        const killed = this.damage(e, dmg);
        if (isPrimary) primaryKilled = killed;
        if (!killed) this.applyOnHit(e, p);
      }
    } else if (target) {
      // Single-target: only resolves if the target is still alive at impact;
      // otherwise the bolt just fizzles where the target was (particles only).
      const bonus = p.bonusMaxHpFrac ? Math.floor(target.maxHp * p.bonusMaxHpFrac) : 0;
      primaryKilled = this.damage(target, p.damage + bonus);
      if (!primaryKilled) this.applyOnHit(target, p);
    }
    // Blood barrage: a chance to steal a life when the primary target is killed —
    // not a guaranteed heal on every splash kill.
    if (p.lifesteal && primaryKilled) this.tryLifesteal(p.sourceTowerId);
  }

  /**
   * Apply a projectile's on-hit status to a surviving enemy. Fire/Smoke share
   * `burn` and Earth/Shadow share `stun`, but single-target (Elemental) vs AoE
   * (Ancients) — read off `p.aoe` — tunes them: Fire burns by % max HP while
   * Smoke is flat poison; Earth stuns long while Shadow stuns briefly.
   */
  /**
   * Crowd-control resistance, 0..1. Reduces how long non-damaging debuffs (slow,
   * stun, vulnerability, knockback) last — damage-over-time (burn/poison) ignores
   * it. Normal monsters scale with the wave (wave/2 %, capped 50%); superiors cap
   * at 75%. Bosses don't get a wave base — they BUILD tenacity from the
   * non-damaging debuffs thrown at them (+1% each, capped at min(wave%, 90%)), so
   * stun/slow spam can't perma-lock them.
   */
  tenacity(e: Enemy): number {
    return debuffTenacity({
      isBoss: e.isBoss,
      superior: e.type.startsWith('superior_'),
      wave: this.wave,
      debuffHits: e.debuffHits,
    });
  }

  /** Register a non-damaging debuff landing on an enemy: bosses build tenacity
   *  (+1% per hit) from it. No-op for non-bosses. Continuous auras shouldn't call
   *  this (they'd inflate the counter every frame). */
  private noteDebuffHit(e: Enemy) {
    if (e.isBoss) e.debuffHits = (e.debuffHits ?? 0) + 1;
  }

  /** Apply the move-speed slow (toxic/ice/enfeeble), shortened by the enemy's
   *  tenacity. `count` registers the hit for boss tenacity; pass false for the
   *  per-frame utility aura so it doesn't inflate the counter. */
  private applySlow(e: Enemy, seconds = 2, count = true) {
    const eff = seconds * (1 - this.tenacity(e));
    if (count) this.noteDebuffHit(e);
    if (eff <= 0) return;
    e.speed = e.baseSpeed * 0.5;
    e.slowTimer = Math.max(e.slowTimer, eff);
  }

  private applyOnHit(e: Enemy, p: Projectile) {
    switch (p.special) {
      case 'slow':
        this.applySlow(e);
        break;
      case 'stun': {
        const eff = (p.aoe ? 0.8 : 2) * (1 - this.tenacity(e));
        this.noteDebuffHit(e);
        if (eff > 0) e.stunTimer = Math.max(e.stunTimer, eff);
        break;
      }
      case 'burn': {
        // Ancient Smoke poisons (green) for the current wave number per second
        // (scales into the late game); elemental Fire burns (orange) for a % of the
        // target's max HP. Each goes in its own DoT slot so an enemy can carry both
        // at once and they tick / splat separately rather than merging.
        const kind: DotKind = p.aoe ? 'poison' : 'burn';
        const dur = p.aoe ? 4 : 3;
        const dps = p.aoe ? this.wave : Math.max(3, Math.floor(e.maxHp * 0.02));
        const dots = (e.dots ??= {});
        const cur = dots[kind];
        if (cur) { cur.timer = Math.max(cur.timer, dur); cur.dps = Math.max(cur.dps, dps); }
        else dots[kind] = { timer: dur, dps, accum: 0, tickTimer: 0 };
        break;
      }
      case 'amp': {
        const eff = 3 * (1 - this.tenacity(e));
        this.noteDebuffHit(e);
        if (eff > 0) e.vulnTimer = Math.max(e.vulnTimer ?? 0, eff);
        break;
      }
      case 'pushback':
        this.knockback(e, 28 * (1 - this.tenacity(e)));
        this.noteDebuffHit(e);
        break;
      default:
        break;
    }
  }

  /** Blood barrage lifesteal: a level-scaled chance to restore one life. */
  private tryLifesteal(sourceTowerId?: string) {
    if (this.lives >= this.maxLives) return;
    const tower = sourceTowerId ? this.towers.find(t => t.id === sourceTowerId) : null;
    if (Math.random() < lifestealChance(tower?.level ?? 1)) this.lives += 1;
  }

  /** Air gust: shove an enemy back toward the previous waypoint (clamped). */
  private knockback(e: Enemy, dist: number) {
    const prev = this.path[e.pathIndex];
    if (!prev) return;
    const dx = prev.x - e.x;
    const dy = prev.y - e.y;
    const d = Math.hypot(dx, dy);
    if (d < 1) return;
    const step = Math.min(dist, d);
    e.x += (dx / d) * step;
    e.y += (dy / d) * step;
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

  /** Deal damage to an enemy; returns true if it died from this hit. `kind`
   *  colours the hitsplat; `minor` (DoT) draws it small/below, drifting aside. */
  private damage(enemy: Enemy, amount: number, kind: HitsplatKind = 'hit', minor = false): boolean {
    // Water "amp" makes the enemy take extra damage from every source.
    const vuln = enemy.vulnTimer && enemy.vulnTimer > 0 ? 1.25 : 1;
    const dealt = Math.max(0, Math.floor(amount * vuln));
    enemy.hp -= dealt;
    if (!minor) enemy.flashTimer = 0.15; // visual hit-pop (direct hits only)
    const below = enemy.isBoss ? 30 : 16;
    // DoT splats are biased to a fixed side per kind (burn left, poison right) so
    // an enemy carrying both shows them clearly apart instead of stacked.
    const dotSide = minor ? (kind === 'poison' ? 1 : -1) : 0;
    this.hitsplats.push({
      x: enemy.x + dotSide * 14 + (Math.random() - 0.5) * (minor ? 8 : 16),
      y: minor ? enemy.y + below : enemy.y - 18,
      value: dealt,
      kind: dealt > 0 ? kind : 'miss',
      life: HITSPLAT_LIFE,
      minor: minor || undefined,
      vx: minor ? dotSide * 30 + (Math.random() - 0.5) * 16 : 0,
    });
    if (dealt > 0 && !minor) this.sound.play('hit', 70);
    if (enemy.hp > 0) return false;
    const i = this.enemies.indexOf(enemy);
    if (i < 0) return false;
    this.enemies.splice(i, 1);
    this.spawnDeathParticles(enemy);
    this.deaths.push({
      x: enemy.x,
      y: enemy.y,
      type: enemy.type,
      isBoss: !!enemy.isBoss,
      renderScale: enemy.renderScale,
      movingLeft: (this.path[enemy.pathIndex + 1]?.x ?? enemy.x) < enemy.x,
      life: 0.45,
      maxLife: 0.45,
    });
    // Per-enemy-type death clip (registered as `death_<type>` in sound.ts);
    // falls back to the generic `death` for anything unmapped.
    const deathKey = `death_${enemy.type}`;
    this.sound.play(deathKey in GAME_SOUNDS ? deathKey : 'death', 40);
    const reward = goldForKill(enemy.maxHp, this.wave);
    this.money += reward;
    this.goldEarned += reward;
    this.kills += 1;
    this.slayer.recordKill(enemy.type);
    this.emit();
    return true;
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
    this.prayer.refill(); // top up to the new wave's (possibly larger) pool
    this.ge.onWaveCleared(); // drift shop prices toward this wave's demand
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
    this.baseFlash = 0;
    this.paused = false;
    this.waveActive = false;
    this.gameOver = false;
    this.selectedTowerType = null;
    this.selectedTowerId = null;
    this.movingTowerId = null;
    this.pendingPlacement = null;
    this.gameTime = 0;
    this.slayer.reset();
    this.slayer.assignTask(); // fresh task for the new run
    this.prayer.reset();
    this.ge.reset();
    this.emit();
  }
}
