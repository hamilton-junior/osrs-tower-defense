import type { Enemy, Tower, TowerBlueprint, Projectile, Point, EnemyType, TowerType, TargetingPriority, GlobalUpgrades, PrayerType, Element, AncientType, MageMode, SupportSpell, Effect, CombatStyle, Item } from '../types';
import { SPOTANIMS } from '../data/spotanims';
import { ENEMY_ANIMS, type EnemyClip } from '../data/enemy-anims';
import { ENEMIES } from '../data/enemies';
import { TOWERS, TOWER_STYLES } from '../data/towers';
import { type WaveConfig } from '../data/waves';
import { ASSETS } from '../assets';
import { distance, distanceSq, isValidPlacement, clampCursorToBoard, snapToTileCenter } from '../systems/geometry';
import { tierMods, clampTier, highestUnlockedTier, effectiveStartLives, type DifficultyTier } from '../systems/difficulty';
import { calculateTowerStats, synergyDamageMult, type ComputedTowerStats, type TowerSynergy } from '../systems/tower-combat';
import { CombatStatsSystem } from '../systems/combat-stats';
import { ELEMENT_ORDER, ANCIENT_ORDER, SUPPORT_ORDER, upgradeCostFor } from '../systems/magic';
import { goldForKill } from '../systems/rewards';
import { upgradeOrder } from '../systems/upgrades';
import { styleSkillKey, xpFromHit, supportXpFromDamage, trainSkill, tierGateFor } from '../systems/tower-xp';
import { canEquip } from '../systems/tower-gear';
import { GEAR } from '../data/gear';
import { towerSpamCost, towerSpamBatchCost } from '../systems/economy';
import { changedState } from '../systems/ui-diff';
import { mergeUnlockBatch } from '../systems/unlock-queue';
import { emptyRunStats, evaluate as evaluateAchievements, CA_TIER_ICON, type RunStats } from '../systems/combat-achievements';
import { CA_TASKS } from '../data/combat-achievements';
import { GameRenderer } from './renderer';
import { SoundManager, GAME_SOUNDS } from './sound';
import { SlayerSystem } from '../systems/slayer-system';
import { PrayerSystem, MAX_PRAYER_WARDS } from '../systems/prayer-system';
import { GeSystem } from '../systems/ge-system';
import { MetaSystem, type MetaLoad } from '../systems/meta-system';
import { rollDraft, availableCards, cardRollCost, DRAFT_POOL, RARITY_WEIGHT, BOOSTED_RARITY_WEIGHT, type DraftCard, type DraftEffect } from '../systems/roguelite-draft';
import { RELICS, type Relic, type RelicEffect } from '../systems/relics';
import { RUN_SAVE_VERSION, type RunSave } from '../systems/run-save';
import { rollArmoredStyle, rollProtectedStyle, ALL_AFFIXES, type EnemyAffix, type AffixRoll } from '../systems/affixes';
import { rollWaveEvent, resolveEventMods, type WaveEvent } from '../systems/wave-events';
import { enemyLeakCost } from '../systems/leak-cost';
import { PRAYERS, TOWER_PRAYERS } from '../data/prayers';
import { prayerUnlockWave } from '../systems/prayer';
import { generateMapLayout, type MapLayout, type MapEdge } from '../systems/map-generation';
import { generateTerrain, type TerrainField } from '../systems/terrain-generation';
import { BIOMES, pickBiome, nextBiome, type BiomeDef } from '../data/biomes';
import { SLAYER_REWARDS, type SlayerReward } from '../data/slayer';
import { LOGIC_WIDTH, LOGIC_HEIGHT, GRID, TOWER_RADIUS, START_MONEY, START_LIVES, freshRunMods, cloneRunMods, SYNERGY_COLORS, freshRunEffects, freshRelicEffects, uid, GENERAL_GOLD_FACTOR, enemyRadius, sanitizeKillCounts, sanitizeCardCounts, sanitizeBossesSeen } from './engine-state';
import { handleBossMechanics } from './sim/bosses';
import { fireTowers, updateUtilityTowers, towerIdentity, moveProjectiles, tenacity } from './sim/combat';
import { computeWaveConfigs, wavePreview, buildWaveEnemies, makeEnemy, spawn, moveEnemies, damageOverTime, updateEffects, addRing, checkWaveEnd, recordCombatTime } from './sim/waves';
import type { UnlockItem, GameMode, StyleMods, RunModifiers, RunEffects, RelicEffects, UIState, Hitsplat, DebuffId, EnemyHoverInfo, DeathFx, Particle, RuneFx } from './engine-state';

// The engine's vocabulary — board size, UIState, the per-run effect records and the
// small pure helpers — lives in ./engine-state so the sim/ modules can share it
// without importing the engine back. Re-exported so '@/lib/game/core/engine'
// stays the one address the rest of the app imports from.
export * from './engine-state';
export class GameEngine {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  private readonly renderer: GameRenderer;
  readonly sound = new SoundManager(GAME_SOUNDS);
  private readonly onState: (patch: Partial<UIState>) => void;

  // --- world state ---
  path: Point[] = [];
  /** Seed for this run's procedural map (path + biome); re-rolled on restart. */
  private mapSeed = 0;
  /** Normalized ([0,1]) road layout for this run; `buildPath` snaps it to the grid. */
  private mapLayout: MapLayout = { points: [], entry: 'left', exit: 'right', archetype: 'serpentine', orientation: 0 };
  /** Per-run terrain: obstacle / non-buildable / decoration flags over the tile grid.
   *  Rebuilt with the map each run; the renderer draws it and placement consults it. */
  terrain: TerrainField = { cols: 0, rows: 0, tiles: [], decorations: [] };

  /** Does the terrain forbid building on the tile at `(x, y)` (obstacle or
   *  non-buildable zone)? Public so the renderer's placement ghost can turn red
   *  over obstacles. Out-of-range tiles are not blocked (the path/edge checks
   *  handle those). */
  isTerrainBlocked(x: number, y: number): boolean {
    const t = this.terrain;
    if (t.cols === 0) return false;
    const c = Math.floor(x / GRID);
    const r = Math.floor(y / GRID);
    if (c < 0 || c >= t.cols || r < 0 || r >= t.rows) return false;
    return t.tiles[r * t.cols + c] !== 'open';
  }

  /** Bound form of {@link isTerrainBlocked} for handing to {@link isValidPlacement}. */
  private readonly blockedTile = (x: number, y: number): boolean => this.isTerrainBlocked(x, y);
  /** The active battlefield theme (OSRS region palette) — read by the renderer. */
  biome: BiomeDef = BIOMES.lumbridge;
  enemies: Enemy[] = [];
  towers: Tower[] = [];
  projectiles: Projectile[] = [];
  hitsplats: Hitsplat[] = [];
  particles: Particle[] = [];
  deaths: DeathFx[] = [];
  /** One-shot baked-spotanim effects (enemy materialise, …) — purely visual. */
  spotEffects: Effect[] = [];
  /** Procedural roguelite VFX (chain bolts, cleave/shockwave/heal rings). */
  fx: RuneFx[] = [];

  money = START_MONEY;
  lives = START_LIVES;
  /** Not readonly: roguelite "Fortify" drafts raise the cap mid-run. */
  maxLives = START_LIVES;
  wave = 1;
  waveActive = false;
  gameOver = false;
  waveTotal = 0;
  bossWave = false;
  /** Wave event active for the current wave (#1): a board-wide rule-bender rolled
   *  at {@link startWave} and cleared at wave end. Null between waves / when none
   *  rolled. Read at the spawn / tower-stat / gold hooks via {@link resolveEventMods}. */
  activeEvent: WaveEvent | null = null;
  /** Bumped whenever the tower layout or synergy config changes, so the per-tower
   *  synergy-aura glow can be cached across frames instead of recomputed O(n²)
   *  every frame (the glow depends only on positions/types/synergy, not time). */
  private towerLayoutVersion = 0;
  private synergyCache: { version: number; entries: Map<string, { mult: number; color: string | null }> } | null = null;
  /** Bumped on every stat-affecting mutation; a tower recomputes its combat
   *  stats only when its cached epoch no longer matches. See bumpCombatEpoch. */
  combatEpoch = 0;
  /** Per-tower memo of calculateTowerStats, valid while epoch matches. Cleared on
   *  layout change (which also covers tower removal). */
  statsCache = new Map<string, { epoch: number; stats: ComputedTowerStats }>();
  /** The current wave is a debug "custom wave" sandbox — its enemies don't affect
   *  the run (no rewards, no life loss, no wave advance). Set by
   *  {@link debugStartCustomWave}, cleared when the sandbox wave ends. */
  sandboxWave = false;
  /** Whether the most recently ended wave was a sandbox custom wave (drives the
   *  "Custom Wave Complete!" banner). Cleared when any wave starts. */
  lastWaveSandbox = false;

  /** Active game mode. Roguelite layers bought card rolls + boss relics over classic TD. Chosen
   *  before the first wave via {@link setMode}; persists across {@link restart}. */
  gameMode: GameMode = 'roguelite';
  /** The New Game+ tier this run is played at. Like {@link gameMode}, it belongs
   *  to the whole run: set before wave 1 via {@link setDifficultyTier} and it
   *  persists across {@link restart}. Tier 0 (Normal) is today's game exactly. */
  difficultyTier: DifficultyTier = 0;
  /** Roguelite: the draft hand awaiting a pick after a wave clear (null = none). */
  pendingDraft: DraftCard[] | null = null;
  /** Roguelite: run-scoped buff multipliers accumulated from drafts. */
  runMods: RunModifiers = freshRunMods();
  /** Schedulable bosses killed *this run* (reset each run). Drives the ordered boss
   *  march and the victory trigger — distinct from lifetime `bossesSeen`. */
  bossesKilledThisRun: Record<string, number> = {};
  /** True once every schedulable boss has fallen this run. Latches the victory screen. */
  won = false;
  /** `'normal'` until victory; `'endless'` after the player chooses to continue. */
  runPhase: 'normal' | 'endless' = 'normal';
  /** The wave victory fired on — the anchor for the Endless HP acceleration. */
  victoryWave = 0;
  /** Behavioural roguelite effects (chain-on-kill / curses / transforms). */
  runFx: RunEffects = freshRunEffects();
  /** Ids of `unique` cards drafted this run — excluded from later hands. */
  private draftedUnique = new Set<string>();
  /** Cards drafted this run, in pick order, with a stack count for repeatable
   *  ones — the source for the UI's active-relics / build panel. Resets per run. */
  runCards: { id: string; count: number }[] = [];
  /** Classic-mode gear dropped this run and not yet equipped. Per-run: cleared in
   *  restart(), never persisted. Empty in roguelite (gear never drops there). */
  lootBag: Item[] = [];
  /** Roguelite: relic choice offered by a defeated boss, awaiting a pick. */
  pendingRelics: Relic[] | null = null;
  /** Relics owned this run, in pick order (each relic is unique). */
  ownedRelics: Relic[] = [];
  /** Relic-only run state (execute / interest / rerolls / cheat-death). */
  relicFx: RelicEffects = freshRelicEffects();
  /** Re-rolls remaining on the current draft hand (refilled per draft). */
  private draftRerollsLeft = 0;
  /** Card rolls bought this run — the exponent behind the next roll's price. */
  private cardRollsBought = 0;
  /** Whether the open hand is a boss's boosted one (kept across a re-roll). */
  private draftBoosted = false;
  /** Debug autoplay: when on, auto-start the next wave `autoplaySecs` (min 1)
   *  after the field is idle (between waves, no pending draft). */
  autoplay = false;
  autoplaySecs = 3;
  private autoplayTimer = 0;
  /** Bumps once per Blood-barrage life steal — the UI keys its ❤ pop off it. */
  lifestealSeq = 0;
  /** Bumps on any placed-tower config change the panels display but that isn't
   *  otherwise in the snapshot (target priority, wizard element/barrage/field). */
  private towerConfigSeq = 0;

  selectedTowerType: TowerType | null = null;
  pendingPlacement: Point | null = null;
  /** Shift was held when the wizard picker opened — keep placing after the pick. */
  private pendingKeepPlacing = false;
  selectedTowerId: string | null = null;
  /** Transient hover-highlight (e.g. hovering a DPS-panel row): the renderer rings
   *  this tower and shows its range, without changing the real selection. */
  highlightTowerId: string | null = null;
  /** Marquee multi-selection: ids of towers picked by a drag-box, for batch
   *  upgrade. Cleared by any normal click / placement. */
  multiSelectedIds: string[] = [];
  movingTowerId: string | null = null;
  /** Ids of the towers a group move is carrying. The selection they came from is
   *  kept alive underneath, so the multi panel stays put while the ghost flies. */
  movingGroupIds: string[] = [];
  /** Tiles a Shift-drag has painted. Nothing here is gold until the player confirms,
   *  so a stroke can be re-drawn, added to, or thrown away for free. */
  placeQueue: { x: number; y: number }[] = [];
  /** Shift is up and the painted line is waiting to be bought — the confirm panel's
   *  whole reason to exist. Pressing Shift again drops back to painting. */
  queueArmed = false;
  /** Towers copied with Ctrl+C, as offsets from the formation's centre. Survives
   *  pasting (paste as many times as you can pay for) and is only replaced by
   *  another copy — but not a restart, where the towers it names are gone. */
  clipboard: TowerBlueprint[] = [];
  /** Whether a paste is in flight: the clipboard's formation is on the pointer,
   *  waiting for a click to buy it. */
  pasting = false;
  /** Enemy "pinned" by a click: its info panel stays open (tracking the enemy as
   *  it moves) until the player clicks elsewhere. Null = follow the hovered one. */
  inspectedEnemyId: string | null = null;
  /** Spellbook a newly-bought wizard will be locked into (chosen pre-placement). */
  pendingMageMode: MageMode = 'elemental';
  gameSpeed = 1;
  paused = false;
  pointer: Point = { x: 0, y: 0 };
  /** Keyboard placement cursor: a grid tile driven by the arrow keys instead of
   *  the mouse. Non-null only while the player is steering with the keyboard; a
   *  mouse move clears it (the mouse takes back over). It mirrors itself onto
   *  `pointer` so the existing placement ghost renders at the cursor for free. */
  placeCursor: Point | null = null;
  /** Pulse (1 → 0) when the base takes a leak, for the renderer's hit flash. */
  baseFlash = 0;

  // --- run stats (read directly by the UI, e.g. the game-over screen) ---
  kills = 0;
  goldEarned = 0;
  /** Towers built this run (every successful {@link placeTower}); for the
   *  end-of-run summary. Not decremented on sell — it counts what you raised. */
  towersBuilt = 0;
  /** Rune Essence awarded *during this run* (wave clears + essence cards), kept
   *  separate from the persistent {@link MetaSystem} balance so the summary can
   *  show what the run earned. Reset on {@link restart}. */
  essenceEarnedThisRun = 0;
  /** Combat Achievement facts for this run. Recorded here, evaluated by the pure
   *  `systems/combat-achievements` module at the three checkpoints. */
  caStats: RunStats = emptyRunStats('roguelite', 0);

  /**
   * How long this run has taken **on a wall clock** — the summary's timer.
   *
   * Deliberately not `gameTime`. That one counts *simulated* seconds, so it is the
   * same however fast you watch it: a wave that takes 60 game-seconds takes 60 at
   * 5x too, it just arrives in 12 real ones. Correct for cooldowns, wrong for a
   * player, who sat there for twelve seconds and was told the run took a minute.
   * This clock reports the time they actually spent. Pause is excluded — a paused
   * game isn't a run being played, it's a run being left alone.
   */
  get runSeconds(): number {
    return this.realTime;
  }
  /** Lifetime kills per enemy type (the Collection Log). Account-wide: seeded
   *  from the save, persisted by the UI, and NOT cleared on restart. */
  killCounts: Record<string, number> = {};
  /** Completed Combat Achievements. Account-wide: seeded from the save, persisted
   *  by the UI, and NOT cleared on restart. */
  achievements = new Set<string>();
  cardCounts: Record<string, number> = {};
  /** Bosses encountered at least once (lifetime, persisted like killCounts).
   *  Gates boss modifiers — a boss is only "vanilla" on its first-ever sighting. */
  bossesSeen: Record<string, number> = {};

  /** Hydrate the account's completed achievements from storage. Called by the UI
   *  once the localStorage blob is read; the constructor can't take it because the
   *  store is loaded after mount. */
  seedAchievements(ids: string[]) {
    this.achievements = new Set(ids);
    this.emit();
  }

  private notice: string | null = null;
  private noticeIcon: string | null = null;
  private noticeSeq = 0;
  /** Latest unlock batch + a bump counter, drained into a popup queue by the UI. */
  private unlocks: UnlockItem[] = [];
  private unlockSeq = 0;
  /** True once the current batch has been pushed to the UI, so the next producer
   *  starts a fresh batch instead of appending to one already on screen. */
  private unlocksDrained = true;
  /** Same contract for the loot-bag toast: gear that dropped since the last flush,
   *  a bump counter the UI keys off, and the drained flag that keeps a second kill
   *  in the same frame from clobbering the first one's pieces. */
  gearDrops: Item[] = [];
  gearDropSeq = 0;
  gearDropsDrained = true;

  // --- composed subsystems ---
  readonly slayer = new SlayerSystem(this);
  readonly prayer = new PrayerSystem(this);
  readonly ge = new GeSystem(this);
  /** Per-run damage accounting for the DPS panel; identity is resolved live off
   *  the current tower so it tracks upgrades and survives a sold tower. */
  readonly stats = new CombatStatsSystem((id) => towerIdentity(this, id));
  /** Persistent meta-progression (essence + bought upgrades); seeded from the
   *  saved blob in the constructor and kept across {@link restart}. */
  readonly meta: MetaSystem;

  /** Logic dimensions (canvas internal resolution). Constant, on every machine. */
  readonly width = LOGIC_WIDTH;
  readonly height = LOGIC_HEIGHT;

  /**
   * Logic→backing pixel multiplier for the board canvas. The *logic* space above
   * stays a fixed 1440×640 on every machine — the game (map, road, ranges, speeds)
   * never depends on it. This only decides how many *physical* pixels back that
   * space: the backing store is sized to the board's on-screen size × the device
   * pixel ratio, so the board is rasterised at exactly its displayed resolution —
   * sharp on any screen, with no CSS upscale from 1440 (the "assets look zoomed /
   * pixelated" artefact, worst on a large display where 1440 is stretched wide).
   * The renderer scales its context by this each frame, so every draw call still
   * works in logic units. Capped so a 4K panel doesn't blow up the backing store.
   */
  deviceScale = 1;
  /** The board's current on-screen (CSS) size, reported by the fit effect in the
   *  React layer. Until it reports, assume 1:1 with the logic space. Presentation
   *  only — never feeds back into the logic space. */
  private displayW = LOGIC_WIDTH;
  private displayH = LOGIC_HEIGHT;
  /** Raw device-pixel ratio (uncapped); the cap lives on {@link deviceScale}. */
  dpr = 1;
  private dprMedia: MediaQueryList | null = null;
  private static readonly MAX_DEVICE_SCALE = 2;

  // --- spawn/loop bookkeeping ---
  spawnQueue: Enemy[] = [];
  /** Memoised makeup of the upcoming wave, keyed by (wave, current Slayer task)
   *  so the Start Wave preview is stable across emits/hovers and {@link startWave}
   *  spawns exactly what was shown. Recomputed only when the wave advances or the
   *  task changes (e.g. a Slayer skip). */
  previewCache: { wave: number; task: EnemyType | null; configs: WaveConfig[] } | null = null;
  spawnTimer = 0;
  readonly spawnInterval = 0.7; // seconds between spawns
  private rafId = 0;
  private lastTime = 0;
  /** Something asked for a UI push; the next frame's {@link flush} will serve it. */
  private uiDirty = false;
  /** True only while the rAF loop body is running. An {@link emit} fired from a UI
   *  action (a click, outside the loop) flushes synchronously so the result lands
   *  in the same tick; emits from the hot path inside the loop stay coalesced to
   *  one push per frame. */
  private inLoop = false;
  /** The last snapshot handed to React, kept so {@link flush} can send only what moved. */
  private lastSnapshot: UIState | null = null;
  gameTime = 0; // accumulated simulated seconds (drives cooldowns)
  private realTime = 0; // accumulated real seconds spent playing (drives the run timer)

  // --- assets ---
  readonly images = new Map<string, HTMLImageElement>();
  private readonly brokenImages = new Set<string>();

  constructor(
    canvas: HTMLCanvasElement,
    onState: (patch: Partial<UIState>) => void,
    save?: MetaLoad & { killCounts?: unknown; cardCounts?: unknown; bossesSeen?: unknown },
  ) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.onState = onState;
    this.meta = new MetaSystem(this, save);
    this.killCounts = sanitizeKillCounts(save?.killCounts);
    this.cardCounts = sanitizeCardCounts(save?.cardCounts);
    this.bossesSeen = sanitizeBossesSeen(save?.bossesSeen);
    this.money = START_MONEY + this.meta.upgrades.startingMoney;
    this.renderer = new GameRenderer(this);
    this.dpr = this.computeDpr();
    this.applyCanvasSize();
    this.watchDpr();
    this.generateMap();
    this.preloadImages();
    this.slayer.assignTask(); // auto-assign the first Slayer task
    this.emit();
  }

  // ---------------------------------------------------------------- lifecycle
  start() {
    this.lastTime = performance.now();
    const loop = () => {
      this.inLoop = true;
      const now = performance.now();
      const dt = Math.min((now - this.lastTime) / 1000, 0.1); // clamp big gaps
      this.lastTime = now;
      // Sub-step for fast-forward: run the sim `gameSpeed` times at the real
      // per-step dt, so speeding up never causes large-dt tunneling.
      if (!this.gameOver && !this.paused) {
        for (let s = 0; s < this.gameSpeed; s++) this.update(dt);
        // Wall-clock, so these must sit outside the sub-step loop and take the raw
        // dt. Inside it, `dt` would be counted `gameSpeed` times and the run timer
        // would measure simulated seconds again — the very thing it isn't.
        this.realTime += dt;
        this.tickAutoplay(dt);
        this.tickAutoUpgrade();
        // Wall-clock, outside the sub-step loop: the DPS meter refreshes at a fixed
        // ~4 Hz regardless of game speed. Inside the loop it took the simulated dt
        // `gameSpeed` times, so at 5× it fired ~5× as often, and each push forces a
        // React render — the fast-forward stutter players hit with the panel open.
        this.pushDpsStats(dt);
      }
      this.renderer.draw();
      // One UI push per frame, after the sim has settled — see `emit`/`flush`.
      this.flush();
      this.inLoop = false;
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  stop() {
    cancelAnimationFrame(this.rafId);
    this.dprMedia?.removeEventListener('change', this.onDprChange);
  }

  private computeDpr(): number {
    return typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
  }

  /**
   * Report the board's on-screen size (CSS px), from the fit effect in the React
   * layer. Presentation only: it re-sizes the backing store so the board renders at
   * its native resolution — it never touches the logic space. Called on mount and on
   * every window resize / monitor move.
   */
  setDisplaySize(cssW: number, cssH: number) {
    if (cssW <= 0 || cssH <= 0) return;
    if (cssW === this.displayW && cssH === this.displayH) return;
    this.displayW = cssW;
    this.displayH = cssH;
    this.applyCanvasSize();
  }

  /**
   * Size the canvas backing store to the board's *displayed* pixels: the on-screen
   * size × the device-pixel ratio, capped. The board box is aspect-locked to the
   * logic space, so width and height scale by the same factor — derive it from the
   * width. Floor of 1 so we never render below logic resolution.
   *
   * Writing `width`/`height` also clears the canvas and resets context state, but
   * the renderer re-applies its transform and smoothing every frame, so that's
   * benign. The element's *CSS* size is driven by the layout (100% of the
   * aspect-locked board box), independent of these attributes — so this never
   * touches layout or pointer mapping, both of which go through the display rect
   * and the logic constants, not the backing store.
   */
  private applyCanvasSize() {
    const raw = (this.displayW / this.width) * this.dpr;
    this.deviceScale = Math.min(Math.max(raw, 1), GameEngine.MAX_DEVICE_SCALE);
    this.canvas.width = Math.round(this.width * this.deviceScale);
    this.canvas.height = Math.round(this.height * this.deviceScale);
  }

  /**
   * Re-rasterise the board when the window moves to a monitor with a different
   * device-pixel ratio. Browser zoom is blocked, so a monitor move is the only
   * trigger. Presentation only — the logic space is never resized.
   */
  private watchDpr() {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    this.dprMedia?.removeEventListener('change', this.onDprChange);
    this.dprMedia = window.matchMedia(`(resolution: ${this.dpr}dppx)`);
    this.dprMedia.addEventListener('change', this.onDprChange);
  }

  private onDprChange = () => {
    const next = this.computeDpr();
    if (next !== this.dpr) {
      this.dpr = next;
      this.applyCanvasSize();
    }
    this.watchDpr(); // the media query is pinned to the old ratio — re-arm it
  };

  /**
   * Mark the UI snapshot stale.
   *
   * Inside the rAF loop this does **not** talk to React: the real push happens
   * once per frame in {@link flush}. It is called from the hot path — `damage()`
   * fires it on every hit, and the loop sub-steps `update()` `gameSpeed` times,
   * so at 5× a busy frame would otherwise build and hand React hundreds of
   * ~60-key snapshots. Coalescing to one push per frame keeps fast-forward
   * playable.
   *
   * Fired from a UI action instead (a click, outside the loop), it flushes
   * **synchronously**: the visible result lands in the same tick as the click,
   * not a frame later — the fix for the Upgrade button (and every other control)
   * feeling a beat behind. One `flush` per click is cheap; the loop's coalescing
   * still governs the hot path.
   */
  emit() {
    this.uiDirty = true;
    if (!this.inLoop) this.flush();
  }

  /**
   * Push the UI snapshot, if anything marked it stale and anything in it moved.
   *
   * Two gates, and both matter: `uiDirty` skips the (small but non-zero) cost of
   * rebuilding the snapshot on quiet frames, and {@link changedState} skips the
   * far larger cost of a React render on frames where the engine changed only
   * things the UI can't see — an enemy losing HP changes no key here until the
   * kill actually lands.
   */
  private flush() {
    if (!this.uiDirty) return;
    this.uiDirty = false;
    const snapshot = this.snapshot();
    const patch = changedState(this.lastSnapshot, snapshot);
    this.lastSnapshot = snapshot;
    if (Object.keys(patch).length > 0) {
      this.onState(patch);
      this.unlocksDrained = true;
      this.gearDropsDrained = true;
    }
  }

  private snapshot(): UIState {
    return {
      money: this.money,
      lives: this.lives,
      maxLives: this.maxLives,
      wave: this.wave,
      waveActive: this.waveActive,
      remaining: this.spawnQueue.length + this.enemies.length,
      waveTotal: this.waveTotal,
      bossWave: this.bossWave,
      wavePreview: wavePreview(this),
      activeEvent: this.activeEvent
        ? { id: this.activeEvent.id, name: this.activeEvent.name, desc: this.activeEvent.desc,
            tone: this.activeEvent.tone, color: this.activeEvent.color, icon: this.activeEvent.icon }
        : null,
      bossOnField: this.enemies.some(e => e.isBoss),
      gameOver: this.gameOver,
      won: this.won,
      runPhase: this.runPhase,
      victory: this.won
        ? {
            wave: this.victoryWave,
            seconds: this.runSeconds,
            bosses: Object.keys(this.bossesKilledThisRun).length,
            mode: this.gameMode,
            tier: this.difficultyTier,
          }
        : null,
      selectedTowerType: this.selectedTowerType,
      towerPrices: this.towerPrices(),
      selectedTowerId: this.selectedTowerId,
      multiSelectedIds: [...this.multiSelectedIds],
      movingTowerId: this.movingTowerId,
      movingGroupIds: [...this.movingGroupIds],
      placeQueue: this.placeQueue.map(p => ({ ...p })),
      queueArmed: this.queueArmed,
      clipboard: this.clipboard.map(b => ({ ...b })),
      pasting: this.pasting,
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
      slayerHelmet: this.slayer.helmet,
      slayerUnlocks: SLAYER_REWARDS.filter(r => r.once && this.slayer.owns(r.id)).map(r => r.id),
      slayerBlocked: [...this.slayer.blocked],
      prayerPoints: Math.round(this.prayer.points),
      prayerMax: this.prayer.max,
      activePrayers: [...this.prayer.active],
      geOffers: this.ge.listing(),
      essence: this.meta.essence,
      upgrades: this.meta.upgrades,
      unlocks: this.unlocks,
      unlockSeq: this.unlockSeq,
      gearDrops: this.gearDrops,
      gearDropSeq: this.gearDropSeq,
      killCounts: this.killCounts,
      achievements: [...this.achievements],
      cardCounts: this.cardCounts,
      bossesSeen: this.bossesSeen,
      lastWaveSandbox: this.lastWaveSandbox,
      gameMode: this.gameMode,
      difficultyTier: this.difficultyTier,
      pendingDraft: this.pendingDraft,
      draftBoosted: this.draftBoosted,
      cardRollCost: this.cardRollCost,
      runMods: cloneRunMods(this.runMods),
      runCards: this.runCards.map(c => ({ ...c })),
      pendingRelics: this.pendingRelics
        ? this.pendingRelics.map(r => ({ id: r.id, name: r.name, desc: r.desc, tier: r.tier, icon: r.icon }))
        : null,
      ownedRelics: this.ownedRelics.map(r => r.id),
      draftRerolls: this.draftRerollsLeft,
      autoplay: this.autoplay,
      autoplaySecs: this.autoplaySecs,
      biomeName: this.biome.name,
      lifestealSeq: this.lifestealSeq,
      towerConfigSeq: this.towerConfigSeq,
      lootBag: this.lootBag.map(g => ({ ...g })),
    };
  }

  /** Mark a placed tower's displayed config as changed and push the UI. The
   *  selected-/multi-tower panels read priority/element/barrage/field off the
   *  live tower object, none of which are snapshot keys — bumping this counter
   *  is what forces the re-render so the change shows at once, board idle or not. */
  private bumpTowerConfig() {
    this.towerConfigSeq++;
    this.emit();
  }

  /** Fire a collection-log-style unlock popup batch. Generic on purpose: any
   *  future producer (towers, spells, achievements) can call this with its own
   *  {@link UnlockItem}s. Caller is responsible for the follow-up `emit`. */
  private announceUnlocks(items: UnlockItem[]) {
    if (items.length === 0) return;
    // Queueing is a contract, not this method's private business: see
    // systems/unlock-queue. Any number of producers may fire between two flushes
    // (a prayer coming online and an achievement completing both land at the same
    // wave end), and every one of them survives to the UI.
    this.unlocks = mergeUnlockBatch(this.unlocks, items, this.unlocksDrained);
    this.unlocksDrained = false;
    this.unlockSeq++;
    this.sound.play('interface_open');
  }

  /** Combat Achievements checkpoint: evaluate the ruleset against this run's
   *  recorded facts and celebrate whatever just completed. Cheap enough to call
   *  at every wave end and boss death — `evaluate` is pure and the table is 40
   *  entries. Caller is responsible for the follow-up `emit`. */
  checkAchievements() {
    const gained = evaluateAchievements(this.caStats, { completed: this.achievements });
    if (gained.length === 0) return;
    for (const id of gained) this.achievements.add(id);
    this.announceUnlocks(gained.map((id) => {
      const task = CA_TASKS.find((t) => t.id === id)!;
      return { kind: 'achievement' as const, name: task.name, desc: task.desc, icon: CA_TIER_ICON[task.tier] };
    }));
  }

  /** Tower prayers that just came online at the current wave — the popup
   *  producer for prayer unlocks (called right after the wave increments). */
  checkPrayerUnlocks() {
    const items: UnlockItem[] = [];
    for (const tp of TOWER_PRAYERS) {
      const def = PRAYERS.find(p => p.id === tp.id);
      if (def && prayerUnlockWave(def.level) === this.wave) {
        items.push({
          kind: 'prayer',
          name: def.name,
          desc: def.description,
          icon: (ASSETS.prayers as Record<string, string>)[tp.id] ?? '',
        });
      }
    }
    this.announceUnlocks(items);
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

  // --- DPS panel: the stats snapshot is only serialised to the UI while the panel
  //     is open (the counters always run; pushing the whole tree every frame is the
  //     only expensive part), refreshed on a light throttle. ---
  private dpsPanelOpen = false;
  private dpsPushTimer = 0;

  /** Open/close the DPS panel. Pushes a fresh snapshot on open and clears it on
   *  close so the UI copy is freed; while open, {@link pushDpsStats} refreshes it. */
  setDpsPanelOpen(open: boolean) {
    if (this.dpsPanelOpen === open) return;
    this.dpsPanelOpen = open;
    this.dpsPushTimer = 0;
    this.onState({ dpsStats: open ? this.stats.snapshot() : null });
  }

  /** Refresh the open DPS panel at ~4 Hz. Fed the loop's raw per-frame dt (real
   *  seconds), so the rate is wall-clock and independent of game speed — see the
   *  call site in {@link start}. */
  private pushDpsStats(dt: number) {
    if (!this.dpsPanelOpen) return;
    this.dpsPushTimer += dt;
    if (this.dpsPushTimer < 0.25) return; // ~4 Hz, wall-clock
    this.dpsPushTimer = 0;
    this.onState({ dpsStats: this.stats.snapshot() });
  }

  /** Play a game sound (thin public wrapper for composed subsystems). */
  playSound(id: string, throttleMs?: number) {
    this.sound.play(id, throttleMs);
  }

  /** Toggle a prayer on/off (UI button). */
  togglePrayer(id: PrayerType) {
    this.prayer.toggle(id);
    // `toggle` never leaves a prayer active if it was already active (that branch
    // deactivates it), so finding it active here means this call just turned it on.
    if (this.prayer.active.has(id)) this.caStats.prayerEverUsed = true;
    this.bumpCombatEpoch();
    this.emit(); // activePrayers changed — push it now (don't wait for an incidental frame)
  }

  /** Buy a Grand Exchange consumable (UI button). */
  buyGeOffer(id: string) {
    this.ge.buy(id);
  }

  /** Buy one step of a permanent meta-progression upgrade (Essence Shop). */
  buyEssenceUpgrade(id: keyof GlobalUpgrades) {
    this.meta.buy(id);
  }

  /** Respec the Essence Shop: reset all upgrades and refund 90% of essence spent. */
  refundEssence() {
    this.meta.refund();
  }

  /** Spend Slayer points in the Slayer Rewards shop (UI button). */
  buySlayerReward(id: SlayerReward['id']) {
    this.slayer.buyReward(id);
  }

  /** The active wave event's board-wide tower multipliers (all 1 when no event),
   *  passed to {@link calculateTowerStats} as its `globalMods` layer. */
  eventTowerMods() {
    const m = resolveEventMods(this.activeEvent);
    return { damage: m.towerDamage, range: m.towerRange, fireRate: m.towerFireRate };
  }

  /** A tower's effective combat stats right now (prayers + potions applied),
   *  for the UI to show buffed values and their origin. */
  effectiveStats(towerId: string): ComputedTowerStats | null {
    const tower = this.towers.find(t => t.id === towerId);
    if (!tower) return null;
    return calculateTowerStats(tower, {
      upgrades: this.meta.upgrades,
      activePrayers: this.prayer.active,
      activePotions: this.ge.active,
      allTowers: this.towers,
      runMods: this.runMods,
      synergyMult: this.synergyMultFor(towerId),
      mageBuff: this.runFx.mageBuff,
      globalMods: this.eventTowerMods(),
    });
  }

  /** Invalidate the cached synergy-aura glows — call whenever the tower layout or
   *  synergy config changes (place / sell / move / synergy draft / restart). */
  private bumpTowerLayout() {
    this.towerLayoutVersion++;
    this.synergyCache = null;
    this.bumpCombatEpoch();   // layout changes tower stats (auras, tiers, count)
    this.statsCache.clear();  // and reclaim removed towers' entries
  }

  /** Invalidate every tower's cached combat stats (next tick recomputes). Public
   *  so the GE and Prayer subsystems can call it when a buff starts or lapses. */
  bumpCombatEpoch() { this.combatEpoch++; }

  /** Credit a tower for a hit that landed: XP proportional to the damage it
   *  dealt, ×bonus when the hit exploited the enemy's style weakness. Feeds the
   *  one skill matching the tower's style. A level-up invalidates the tower's
   *  cached stats (so the per-level nudge applies) and refreshes the UI. */
  grantTowerXp(towerId: string, dealt: number, exploitedWeakness: boolean) {
    const tower = this.towers.find(t => t.id === towerId);
    if (!tower || dealt <= 0) return;
    this.addTowerXp(tower, xpFromHit(dealt, exploitedWeakness));
    // A support wizard grows by the damage it enables: any Utility tower whose
    // aura covers this attacker earns a share of the hit it just landed.
    this.grantSupportXp(tower, dealt);
  }

  /** Add an XP gain to a tower's one style skill; a level-up invalidates the
   *  cached stats (so the per-level nudge applies) and refreshes the UI. */
  private addTowerXp(tower: Tower, gain: number) {
    if (gain <= 0) return;
    const key = styleSkillKey(TOWER_STYLES[tower.type].style);
    const r = trainSkill(tower.skills[key], gain);
    tower.skills[key] = { level: r.level, xp: r.xp };
    if (r.leveledUp) { this.bumpCombatEpoch(); this.emit(); }
  }

  /** Credit every in-range Utility support tower a share of a buffed tower's hit.
   *  The Utility wizard never attacks, so this is its only XP source — it levels
   *  by the damage its auras help nearby towers deal. */
  private grantSupportXp(source: Tower, dealt: number) {
    const gain = supportXpFromDamage(dealt);
    if (gain <= 0) return;
    for (const t of this.towers) {
      if (t === source || t.type !== 'wizard' || t.mageMode !== 'utility') continue;
      if (distance(t.x, t.y, source.x, source.y) > t.range) continue;
      this.addTowerXp(t, gain);
    }
  }

  /** The placement-synergy buff a tower is enjoying right now, for the renderer's
   *  aura: the total damage multiplier (>1) and the colour of the *dominant*
   *  contributing synergy. null when none applies (or not in roguelite mode).
   *  Cached per {@link towerLayoutVersion} so the O(n²) synergy scan runs once per
   *  layout change, not once per tower every frame (the value is time-invariant —
   *  only the glow's pulse, applied at draw time, animates). */
  towerSynergyAura(tower: Tower): { mult: number; color: string } | null {
    if (this.gameMode !== 'roguelite') return null;
    const e = this.synergyEntries().get(tower.id);
    return e && e.color ? { mult: e.mult, color: e.color } : null;
  }

  /** The cached placement-synergy damage multiplier (≥1) for a tower — the value
   *  {@link calculateTowerStats} needs on the per-frame combat path. Computed once
   *  per layout change (see {@link synergyEntries}) rather than re-scanning the
   *  field every frame per tower — the fix for the FPS collapse with a synergy card
   *  (e.g. Clan Vexillum) active on a full board. */
  synergyMultFor(towerId: string): number {
    if (this.gameMode !== 'roguelite') return 1;
    return this.synergyEntries().get(towerId)?.mult ?? 1;
  }

  /** Per-tower synergy entries (damage multiplier + dominant-synergy aura colour),
   *  cached per {@link towerLayoutVersion}. The O(n²) field scan runs once per
   *  layout change; the value is time-invariant (only the glow's pulse animates). */
  private synergyEntries(): Map<string, { mult: number; color: string | null }> {
    if (!this.synergyCache || this.synergyCache.version !== this.towerLayoutVersion) {
      this.synergyCache = { version: this.towerLayoutVersion, entries: this.computeSynergyEntries() };
    }
    return this.synergyCache.entries;
  }

  /** Compute every tower's synergy multiplier and dominant-aura colour in one pass
   *  (still O(n²) in the worst case, but run only on a layout change). Short-circuits
   *  to mult 1 / no aura when no synergy card is active at all. */
  private computeSynergyEntries(): Map<string, { mult: number; color: string | null }> {
    const map = new Map<string, { mult: number; color: string | null }>();
    const syn = this.runFx.synergy;
    const anyActive = !!(syn.packTactics || syn.trinity || syn.vanguard || syn.loneWolf);
    for (const tower of this.towers) {
      if (!anyActive) { map.set(tower.id, { mult: 1, color: null }); continue; }
      const total = synergyDamageMult(tower, this.towers, syn, this.portalPoint);
      if (total <= 1.001) { map.set(tower.id, { mult: total, color: null }); continue; }
      let bestKey: keyof typeof SYNERGY_COLORS | null = null;
      let bestMult = 1;
      for (const key of Object.keys(SYNERGY_COLORS) as (keyof typeof SYNERGY_COLORS)[]) {
        if (!syn[key]) continue;
        const m = synergyDamageMult(tower, this.towers, { [key]: syn[key] } as TowerSynergy, this.portalPoint);
        if (m > bestMult) { bestMult = m; bestKey = key; }
      }
      map.set(tower.id, { mult: total, color: bestKey ? SYNERGY_COLORS[bestKey] : '#ffd257' });
    }
    return map;
  }

  /** Effective stats for a not-yet-placed ghost tower of `type` at (x, y), so the
   *  placement preview shows its *true* range (run mods, global upgrades, nearby
   *  Utility auras) rather than the raw base tier range. */
  previewStats(type: TowerType, x: number, y: number, level = 1): ComputedTowerStats {
    const def = TOWERS[type];
    const tier = def.tiers[Math.min(Math.max(level, 1), def.tiers.length) - 1];
    const ghost: Tower = {
      id: '__ghost__', x, y, type, level,
      maxLevel: def.tiers.length,
      range: tier.range, damage: tier.damage, cooldown: tier.cooldown,
      lastFired: 0, color: tier.color, targetId: null, targetingPriority: 'first',
      name: tier.name, upgradeCost: 0, special: tier.special,
      minDamage: tier.minDamage, maxDamage: tier.maxDamage,
      visualRadius: 18, disabledTimer: 0, specCharge: 0, specMax: 100,
      skills: { strength: { level: 1, xp: 0 }, ranged: { level: 1, xp: 0 }, magic: { level: 1, xp: 0 } },
      equipment: { ammo: null, jewellery: null },
      mageMode: type === 'wizard' ? this.pendingMageMode : undefined,
    };
    return calculateTowerStats(ghost, {
      upgrades: this.meta.upgrades,
      activePrayers: this.prayer.active,
      activePotions: this.ge.active,
      allTowers: this.towers,
      runMods: this.runMods,
      synergy: this.runFx.synergy,
      portal: this.portalPoint,
      mageBuff: this.runFx.mageBuff,
      globalMods: this.eventTowerMods(),
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
    if (this.pendingPlacement || this.movingTowerId || this.movingGroupIds.length
        || this.placeQueue.length || this.pasting || this.selectedTowerType) {
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
      // Baked spotanim sprite sheets (keyed `spotanim_<slug>`).
      ...Object.fromEntries(
        Object.entries(SPOTANIMS).map(([slug, s]) => [`spotanim_${slug}`, s.url]),
      ),
      // Baked enemy animation sheets (keyed `enemyanim_<type>_<clip>`).
      ...Object.fromEntries(
        Object.entries(ENEMY_ANIMS).flatMap(([type, set]) =>
          Object.entries(set.clips)
            .filter(([, clip]) => clip)
            .map(([clip, c]) => [`enemyanim_${type}_${clip}`, (c as EnemyClip).url]),
        ),
      ),
      // The real interface hitsplats (keyed `hitsplat_<kind>`).
      ...Object.fromEntries(
        Object.entries(ASSETS.hitsplats).map(([kind, url]) => [`hitsplat_${kind}`, url]),
      ),
      // Protection-prayer overheads, keyed by the STYLE they answer (`prayericon_<style>`),
      // for enemies praying against a style (the `protected` affix + boss phases).
      // These are OSRS's own headicons — they carry the game's gold-disc backdrop,
      // so nothing extra is drawn behind them.
      prayericon_melee: ASSETS.prayers.overhead_melee,
      prayericon_ranged: ASSETS.prayers.overhead_missiles,
      prayericon_magic: ASSETS.prayers.overhead_magic,
      // The prohibited sign stamped on a tower knocked offline (Brutus's trample).
      blocked: ASSETS.misc.blocked,
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
  /**
   * Roll a fresh procedural battlefield for a run: a new random-but-valid road
   * layout and a biome to skin it. Called on construction and every {@link restart}
   * so no two runs share a map; {@link buildPath} snaps this normalized layout onto
   * the board's fixed resolution.
   */
  private generateMap(seed?: number) {
    this.mapSeed = seed !== undefined ? seed >>> 0 : (Math.random() * 0x100000000) >>> 0;
    this.mapLayout = generateMapLayout(this.mapSeed);
    this.biome = pickBiome(this.mapSeed);
    this.buildPath();
    this.terrain = generateTerrain(
      this.mapSeed, this.path, Math.floor(this.width / GRID), Math.floor(this.height / GRID), GRID,
    );
  }

  private buildPath() {
    // Snap every vertex onto a grid line so the road runs along tile edges and
    // tower square-ranges align with it (no half-tiles through the road). The
    // layout is normalized, so a restart re-snaps it onto the same board.
    const tx = Math.floor(this.width / GRID);
    const ty = Math.floor(this.height / GRID);
    const col = (f: number) => Math.round(tx * f) * GRID;
    const row = (f: number) => Math.round(ty * f) * GRID;
    const pts = this.mapLayout.points.map(p => ({ x: col(p.fx), y: row(p.fy) }));
    if (pts.length === 0) return; // pre-generation guard (never hit in normal flow)
    // Extend the off-screen entry/exit stubs perpendicular to whichever board edge
    // the archetype's orientation put them on (not always left→right anymore).
    const stub = (p: Point, edge: MapEdge): Point => {
      switch (edge) {
        case 'right': return { x: this.width + GRID, y: p.y };
        case 'top': return { x: p.x, y: -GRID };
        case 'bottom': return { x: p.x, y: this.height + GRID };
        case 'left':
        default: return { x: -GRID, y: p.y };
      }
    };
    this.path = [
      stub(pts[0], this.mapLayout.entry),
      ...pts,
      stub(pts[pts.length - 1], this.mapLayout.exit),
    ];
  }

  /**
   * Where the spawn portal sits (and enemies materialise): right at the map
   * entrance — just onto the screen from `path[0]` (which starts off-screen at
   * x=-GRID) so the portal is cropped by the left edge and no road shows before
   * it. Its centre lands at the screen edge, so enemies materialise there and
   * walk on toward path[1], emerging *from the portal's face*.
   */
  get portalPoint(): Point {
    const a = this.path[0];
    const b = this.path[1] ?? a;
    const dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const d = Math.min(len, GRID); // GRID in → centre at x≈0, portal half-cropped
    return { x: a.x + (dx / len) * d, y: a.y + (dy / len) * d };
  }

  // ------------------------------------------------------------- input/actions
  setPointer(x: number, y: number) {
    this.pointer = { x, y };
    // A real mouse move hands control back to the mouse — the keyboard cursor is
    // only "live" while the player is steering with the arrow keys.
    this.placeCursor = null;
  }

  /** Step the keyboard placement cursor by one tile (M8). Initialises it at the
   *  last pointer position on the first press, then moves + clamps it, mirroring
   *  onto `pointer` so the existing placement ghost draws at the cursor. */
  nudgeCursor(dx: number, dy: number) {
    const base = this.placeCursor ?? this.pointer;
    const moved = clampCursorToBoard(base.x + dx * GRID, base.y + dy * GRID, GRID, this.width, this.height);
    this.placeCursor = moved;
    this.pointer = { ...moved };
  }

  /** Place/act at the keyboard cursor — the Enter-key equivalent of clicking the
   *  tile it sits on (so it routes through the same {@link handleClick} logic). */
  placeAtCursor() {
    if (!this.placeCursor) return;
    this.handleClick(this.placeCursor.x, this.placeCursor.y);
  }

  /** Drop the keyboard cursor (Esc, or when placement is cancelled). */
  clearPlaceCursor() {
    this.placeCursor = null;
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
    if ((e.dots?.venom?.timer ?? 0) > 0) effects.push('venom');
    if (e.vulnTimer && e.vulnTimer > 0) effects.push('vuln');
    return {
      type: e.type,
      name: e.name,
      hp: Math.max(0, Math.ceil(e.hp)),
      maxHp: e.maxHp,
      speed: Math.round(e.speed),
      baseSpeed: Math.round(e.baseSpeed),
      naturalSpeed: Math.round(e.naturalSpeed ?? e.baseSpeed),
      weakness: e.weakness && e.weakness !== 'none' ? e.weakness : null,
      styleWeakness: e.styleWeakness ?? null,
      reward: this.effectiveKillGold(e.type),
      isBoss: !!e.isBoss,
      x: e.x,
      y: e.y,
      effects,
      tenacity: tenacity(this, e),
      leakCost: this.leakCost(e),
      affixes: e.affixes ?? [],
      armoredStyle: e.armoredStyle,
      protectedStyle: e.protectedStyle,
    };
  }

  /** Lives this enemy takes if it walks off the road — see {@link enemyLeakCost}.
   *  Quoted by the info panel and the wave preview so the cost is knowable *before*
   *  it is charged; the leak path bills exactly this. */
  leakCost(e: { type: string; isBoss?: boolean; affixes?: EnemyAffix[] }): number {
    return enemyLeakCost({
      type: e.type, isBoss: e.isBoss, affixes: e.affixes,
      sightings: this.bossesSeen[e.type] ?? 1,
    });
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

  /** Hover-highlight a tower (e.g. from a DPS-panel row) so the renderer rings it
   *  and shows its range. Pass null to clear. Read live by the render loop, so no
   *  state emit is needed. */
  setHighlightTower(id: string | null) {
    this.highlightTowerId = id;
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

  /** How many towers of a type are already on the board — the escalation counter
   *  behind {@link towerCost}. Counted live, so selling one makes the next cheaper
   *  again. */
  private ownedOf(type: TowerType): number {
    let n = 0;
    for (const t of this.towers) if (t.type === type) n++;
    return n;
  }

  /** A type's base price after the meta shop's discount, before escalation. */
  private towerBasePrice(type: TowerType): number {
    return Math.ceil((TOWERS[type]?.tiers[0].upgradeCost ?? 0) * this.meta.upgrades.towerCostReduction);
  }

  /** What the NEXT tower of this type costs: the base price escalated by how many
   *  the player already owns (see `towerSpamCost`). Diversifying resets it — a
   *  first tower of a second type is always base price. */
  towerCost(type: TowerType): number {
    return towerSpamCost(this.towerBasePrice(type), this.ownedOf(type));
  }

  /** Every type's current price, for the dock. */
  private towerPrices(): Record<TowerType, number> {
    const out = {} as Record<TowerType, number>;
    for (const type of Object.keys(TOWERS) as TowerType[]) out[type] = this.towerCost(type);
    return out;
  }

  /** Fixed gold a kill of this enemy type pays — a flat function of its BASE HP
   *  (see systems/rewards), NOT the wave-scaled value, so payouts stay constant
   *  per monster however late the wave. */
  private killGold(type: EnemyType): number {
    return Math.round(goldForKill(ENEMIES[type]?.hp ?? 0) * GENERAL_GOLD_FACTOR);
  }

  /** Base kill gold folded with the run's greed/goldFind multiplier and the active
   *  wave event's gold multiplier (e.g. Blood Moon's payout) — everything except the
   *  permanent reward-multiplier upgrade that {@link awardGold} applies on top. The
   *  single source of truth so the drop and the hover panel never drift. */
  killGoldPreReward(type: EnemyType): number {
    return Math.round(this.killGold(type) * this.runFx.goldMult * resolveEventMods(this.activeEvent).gold);
  }

  /** The gold the player actually receives for killing `type` right now, with every
   *  live multiplier applied (greed/goldFind, wave event, reward upgrade). Shown in
   *  the enemy hover panel so event twists like Blood Moon read correctly. */
  effectiveKillGold(type: EnemyType): number {
    return Math.round(this.killGoldPreReward(type) * this.meta.upgrades.rewardMultiplier);
  }

  /** Add gold from a kill or wave clear, scaled by the rewardMultiplier upgrade,
   *  and track it for the game-over "earned" tally. Returns the gold granted. */
  awardGold(base: number): number {
    const gold = Math.round(base * this.meta.upgrades.rewardMultiplier);
    this.money += gold;
    this.goldEarned += gold;
    return gold;
  }

  /** Total gp invested in a tower (base + all upgrades to its current level). */
  private investedValue(tower: Tower): number {
    const def = TOWERS[tower.type];
    if (!def) return 0;
    // Index 0 is the build cost (never surcharged); 1..level-1 are the upgrades
    // actually paid for, so an Ancients wizard refunds what it really cost.
    return def.tiers.slice(0, tower.level)
      .reduce((s, t, i) => s + (i === 0 ? t.upgradeCost : upgradeCostFor(t.upgradeCost, tower.mageMode)), 0);
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
    this.movingGroupIds = []; // the selection itself survives — only the carry is dropped
    this.placeQueue = []; // a painted line is thrown away, not built
    this.queueArmed = false;
    this.pasting = false; // the clipboard keeps its towers — only the aim is dropped
    this.pendingPlacement = null;
    this.placeCursor = null; // the keyboard cursor goes with the cancelled placement
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
    const sx = snapToTileCenter(x, GRID);
    const sy = snapToTileCenter(y, GRID);
    if (sx === tower.x && sy === tower.y) return; // no-op, wait for a real spot
    const others = this.towers.filter(t => t.id !== tower.id); // ignore self
    if (!isValidPlacement(sx, sy, this.path, others, 40, 30, this.blockedTile)) return; // invalid spot, keep waiting
    this.money -= cost;
    tower.x = sx;
    tower.y = sy;
    tower.targetId = null; // re-acquire from the new position
    this.movingTowerId = null;
    this.bumpTowerLayout(); // position changed → synergy auras may shift
    this.emit();
  }

  /** The towers a group move is carrying, in selection order. */
  get movingGroup(): Tower[] {
    return this.movingGroupIds
      .map(id => this.towers.find(t => t.id === id))
      .filter((t): t is Tower => !!t);
  }

  /** The formation's own centre, snapped to the grid. Every tower's offset from
   *  it is therefore a whole number of tiles (they were snapped to begin with),
   *  which is what lets the group translate and stay on-grid. */
  private groupAnchor(group: Tower[]): { x: number; y: number } {
    const cx = group.reduce((s, t) => s + t.x, 0) / group.length;
    const cy = group.reduce((s, t) => s + t.y, 0) / group.length;
    return { x: snapToTileCenter(cx, GRID), y: snapToTileCenter(cy, GRID) };
  }

  /** Where each carried tower lands if the formation's centre is dropped on
   *  (x, y). The move is a rigid translation — the shape the player selected is
   *  the shape they get, so a laid-out cluster survives the trip. */
  groupMoveTargets(x: number, y: number): { tower: Tower; x: number; y: number }[] {
    const group = this.movingGroup;
    if (!group.length) return [];
    const anchor = this.groupAnchor(group);
    const dx = snapToTileCenter(x, GRID) - anchor.x;
    const dy = snapToTileCenter(y, GRID) - anchor.y;
    return group.map(t => ({ tower: t, x: t.x + dx, y: t.y + dy }));
  }

  /** Summed relocation fee for the towers a group move is carrying. */
  get movingGroupCost(): number {
    return this.movingGroup.reduce((s, t) => s + this.moveTowerCost(t), 0);
  }

  /** Count + summed fee to move the whole marquee selection — what the panel's
   *  Move button quotes before the ghost is picked up. */
  get multiMoveInfo(): { count: number; cost: number } {
    let count = 0, cost = 0;
    for (const id of this.multiSelectedIds) {
      const t = this.towers.find(tw => tw.id === id);
      if (t) { count++; cost += this.moveTowerCost(t); }
    }
    return { count, cost };
  }

  /** Each landing spot with its own verdict, so the ghost can colour the towers
   *  individually — a red one in a green formation says exactly which tile is the
   *  problem, which "the drop is invalid" never would. Judged against the towers
   *  that AREN'T moving, so the group ignores the footprint it's about to vacate.
   *
   *  Unlike a single move, this also has to check the board edges: a click is
   *  always in-bounds, but translating a formation from a click near the rim
   *  pushes its outer towers clean off the map. */
  groupMovePlan(x: number, y: number): { tower: Tower; x: number; y: number; ok: boolean }[] {
    const targets = this.groupMoveTargets(x, y);
    const ids = new Set(this.movingGroupIds);
    const others = this.towers.filter(t => !ids.has(t.id));
    return targets.map(t => ({
      ...t,
      ok: t.x >= TOWER_RADIUS && t.x <= this.width - TOWER_RADIUS &&
          t.y >= TOWER_RADIUS && t.y <= this.height - TOWER_RADIUS &&
          isValidPlacement(t.x, t.y, this.path, others, 40, 30, this.blockedTile),
    }));
  }

  /** All-or-nothing: a rigid translation can't bend around one bad tile, so one
   *  red tower refuses the whole drop. */
  groupMoveValid(x: number, y: number): boolean {
    const plan = this.groupMovePlan(x, y);
    return plan.length > 0 && plan.every(t => t.ok);
  }

  /** Enter "move" mode for the whole marquee selection: the next valid click
   *  drops the formation for the summed fee. */
  beginMoveGroup() {
    const group = this.multiSelectedIds
      .map(id => this.towers.find(t => t.id === id))
      .filter((t): t is Tower => !!t);
    if (!group.length) return;
    const cost = group.reduce((s, t) => s + this.moveTowerCost(t), 0);
    if (this.money < cost) { this.notify('Not enough gold'); return; } // failsafe: can't afford
    this.selectedTowerType = null;
    this.selectedTowerId = null;
    this.movingTowerId = null;
    this.movingGroupIds = group.map(t => t.id);
    this.pendingPlacement = null;
    this.sound.play('click');
    this.emit();
  }

  private tryMoveGroup(x: number, y: number) {
    const targets = this.groupMoveTargets(x, y);
    if (!targets.length) { // the selection was sold/killed out from under the move
      this.movingGroupIds = [];
      this.emit();
      return;
    }
    const cost = this.movingGroupCost;
    if (this.money < cost) { // failsafe: lost the gp since entering move mode
      this.movingGroupIds = [];
      this.emit();
      return;
    }
    if (targets.every(t => t.x === t.tower.x && t.y === t.tower.y)) return; // no-op, wait for a real spot
    if (!this.groupMoveValid(x, y)) return; // invalid spot, keep waiting
    this.money -= cost;
    for (const t of targets) {
      t.tower.x = t.x;
      t.tower.y = t.y;
      t.tower.targetId = null; // re-acquire from the new position
    }
    this.movingGroupIds = [];
    this.bumpTowerLayout(); // positions changed → synergy auras may shift
    this.emit();
  }

  /** Ctrl+C — remember the selected towers as a formation of blueprints.
   *
   *  Copies the marquee selection, or the single selected tower (a one-tower
   *  formation is still a formation, and it's the obvious meaning of Ctrl+C with
   *  one thing selected). The clipboard replaces whatever it held; there is no
   *  "append", the same way no editor's copy appends. */
  copySelection() {
    let group = this.multiSelectedIds
      .map(id => this.towers.find(t => t.id === id))
      .filter((t): t is Tower => !!t);
    if (!group.length) {
      const one = this.towers.find(t => t.id === this.selectedTowerId);
      if (one) group = [one];
    }
    if (!group.length) return;
    const anchor = this.groupAnchor(group);
    this.clipboard = group.map(t => ({
      dx: t.x - anchor.x,
      dy: t.y - anchor.y,
      type: t.type,
      targetingPriority: t.targetingPriority,
      mageMode: t.mageMode,
      element: t.element,
      ancientType: t.ancientType,
      supportSpell: t.supportSpell,
    }));
    this.sound.play('select');
    this.notify(`Copied ${group.length} tower${group.length > 1 ? 's' : ''}`);
    this.emit();
  }

  /** What one paste of the clipboard costs: every tower at its own base price.
   *  Copying is a shortcut for re-buying the same layout, never a discount. */
  get clipboardCost(): number {
    // Priced as if placed one at a time: each tower in the paste is charged after
    // the ones before it, so a paste can't dodge the same-type escalation.
    const pending = new Map<TowerType, number>();
    let total = 0;
    for (const b of this.clipboard) {
      const extra = pending.get(b.type) ?? 0;
      total += towerSpamCost(this.towerBasePrice(b.type), this.ownedOf(b.type) + extra);
      pending.set(b.type, extra + 1);
    }
    return total;
  }

  /** Ctrl+V — put the copied formation on the pointer. It isn't bought until a
   *  click lands it, so the paste can be aimed, or thrown away with Esc. */
  beginPaste() {
    if (!this.clipboard.length) return;
    this.selectedTowerType = null;
    this.selectedTowerId = null;
    this.movingTowerId = null;
    this.movingGroupIds = [];
    this.placeQueue = [];
    this.queueArmed = false;
    this.pendingPlacement = null;
    this.pasting = true;
    this.sound.play('click');
    this.emit();
  }

  /** Where each copied tower lands if the formation's centre is dropped on
   *  (x, y), each with its own verdict so the ghost can colour them one by one.
   *
   *  The blueprints can't block each other — they were a legal layout when they
   *  were copied — so each is judged only against the towers already standing,
   *  plus the board edges (same rim hazard as a group move). */
  pastePlan(x: number, y: number): { blueprint: TowerBlueprint; x: number; y: number; ok: boolean }[] {
    if (!this.clipboard.length) return [];
    const ax = snapToTileCenter(x, GRID);
    const ay = snapToTileCenter(y, GRID);
    return this.clipboard.map(b => {
      const tx = ax + b.dx;
      const ty = ay + b.dy;
      return {
        blueprint: b,
        x: tx,
        y: ty,
        ok: tx >= TOWER_RADIUS && tx <= this.width - TOWER_RADIUS &&
            ty >= TOWER_RADIUS && ty <= this.height - TOWER_RADIUS &&
            isValidPlacement(tx, ty, this.path, this.towers, 40, 30, this.blockedTile),
      };
    });
  }

  /** All-or-nothing, like a group move: a rigid formation can't bend around one
   *  bad tile. Unlike the Shift-drag line — a stroke is an ordered list that can
   *  stop halfway and still mean something; a shape half-built is just rubble. */
  pasteValid(x: number, y: number): boolean {
    const plan = this.pastePlan(x, y);
    return plan.length > 0 && plan.every(t => t.ok) && this.money >= this.clipboardCost;
  }

  private tryPaste(x: number, y: number) {
    const plan = this.pastePlan(x, y);
    if (!plan.length) { this.pasting = false; this.emit(); return; } // clipboard emptied under it
    // Both of these keep the paste alive and wait for a better click: the ghost is
    // already red, and a player aiming a formation expects to be able to re-aim.
    if (!plan.every(t => t.ok)) return;
    if (this.money < this.clipboardCost) { this.notify('Not enough gold'); return; }
    for (const t of plan) this.buildFromBlueprint(t.blueprint, t.x, t.y);
    this.pasting = false;
    this.bumpTowerLayout();
    this.emit();
  }

  /** Build one blueprint: a base-tier tower of its type, then the settings the
   *  copy carried. `placeTower` owns construction (including the wizard's whole
   *  spellbook birth), so only the choices a player would otherwise re-pick by
   *  hand are re-applied here. */
  private buildFromBlueprint(b: TowerBlueprint, x: number, y: number) {
    const tower = this.placeTower(b.type, x, y, true, b.mageMode ?? this.pendingMageMode);
    if (!tower) return;
    tower.targetingPriority = b.targetingPriority;
    if (tower.type !== 'wizard') return;
    if (b.element) tower.element = b.element;
    if (b.ancientType) tower.ancientType = b.ancientType;
    if (b.supportSpell) {
      // Prayer Wards are capped on the field, and a paste must not be the way
      // around it. Over the cap the ward reverts to the Utility default rather
      // than refusing the tower — you get a wizard, just not a fourth ward.
      const capped = b.supportSpell === 'sanctity' && this.prayerWardCount() >= MAX_PRAYER_WARDS;
      tower.supportSpell = capped ? 'curse' : b.supportSpell;
      if (capped) this.notify(`Max ${MAX_PRAYER_WARDS} Prayer Ward wizards`);
    }
  }

  /** Paint one tile into the Shift-drag build queue.
   *
   *  Deliberately silent when it refuses: this runs on every pointer sample of a
   *  drag, so a toast per bad tile would be a stream of noise. The ghost already
   *  says what's in the line and what it costs. */
  queuePlacement(x: number, y: number) {
    const type = this.selectedTowerType;
    if (!type || this.movingTowerId || this.movingGroupIds.length) return;
    // Shift went back down on an armed line: the player is adding to the stroke
    // rather than answering the panel, so put the question away and keep painting.
    this.queueArmed = false;
    const sx = snapToTileCenter(x, GRID);
    const sy = snapToTileCenter(y, GRID);
    if (this.placeQueue.some(p => p.x === sx && p.y === sy)) return; // already painted
    // Painted tiles block each other, or a stroke would stack towers on one spot.
    const blockers = [...this.towers, ...this.placeQueue];
    if (!isValidPlacement(sx, sy, this.path, blockers, 40, 30, this.blockedTile)) return;
    this.placeQueue.push({ x: sx, y: sy });
    this.emit();
  }

  /** What the painted line costs to build, all of it. */
  get placeQueueCost(): number {
    if (!this.selectedTowerType) return 0;
    return towerSpamBatchCost(
      this.towerBasePrice(this.selectedTowerType),
      this.ownedOf(this.selectedTowerType),
      this.placeQueue.length,
    );
  }

  /** How many of the painted tiles the current gold actually covers — the ghost
   *  greys the rest, so the line never promises a tower it can't pay for. */
  get placeQueueAffordable(): number {
    if (!this.selectedTowerType) return 0;
    // Each tile in the line is dearer than the last, so this walks the line rather
    // than dividing by a flat price — the ghost must grey exactly the tiles the
    // purse cannot reach.
    const base = this.towerBasePrice(this.selectedTowerType);
    const owned = this.ownedOf(this.selectedTowerType);
    let spent = 0;
    for (let i = 0; i < this.placeQueue.length; i++) {
      const next = towerSpamCost(base, owned + i);
      if (next <= 0) return this.placeQueue.length;
      if (spent + next > this.money) return i;
      spent += next;
    }
    return this.placeQueue.length;
  }

  /** Throw the painted line away, armed or not, charging nothing. */
  clearPlaceQueue() {
    if (!this.placeQueue.length && !this.queueArmed) return;
    this.placeQueue = [];
    this.queueArmed = false;
    this.emit();
  }

  /** Shift came up — the line is finished, but nothing is bought yet. It freezes
   *  into an *armed* line and waits for {@link confirmPlaceQueue}.
   *
   *  Shift-up used to be the purchase itself, which made letting go of a key spend
   *  gold — the one gesture a player makes without deciding to. Now the stroke and
   *  the purchase are separate acts: paint freely, then say yes. */
  armPlaceQueue() {
    if (!this.placeQueue.length || !this.selectedTowerType) {
      // Nothing painted: Shift was just held. Leave the armed tower as it was.
      return;
    }
    this.queueArmed = true;
    this.emit();
  }

  /** Buy the painted line, in paint order, for as long as the gold lasts.
   *
   *  `mageMode` is the answer to the question the confirm panel asks for a line of
   *  wizards. It is passed in rather than read from `pendingMageMode` because the
   *  whole point is that a line must not silently inherit the last wizard's
   *  spellbook — the player picks one for this line, every time. */
  confirmPlaceQueue(mageMode?: MageMode) {
    const type = this.selectedTowerType;
    const queue = this.placeQueue;
    this.placeQueue = [];
    this.queueArmed = false;
    if (!type || !queue.length) { this.emit(); return; }
    let built = 0;
    for (const p of queue) {
      // Checked here rather than letting placeTower refuse: it would fire one
      // "Not enough gold" toast per unbuilt tile.
      if (this.money < this.towerCost(type)) break;
      const before = this.towers.length;
      // keepPlacing: the queue owns the selection. A wizard skips its on-tile
      // picker here — the line was answered once, up front, for all of it.
      this.placeTower(type, p.x, p.y, true, mageMode ?? this.pendingMageMode);
      if (this.towers.length > before) built++;
    }
    this.selectedTowerType = null; // the line is spent: the mode is over
    if (built < queue.length) this.notify(built ? `Built ${built} of ${queue.length} — out of gold` : 'Not enough gold');
    this.emit();
  }

  /** Handle a click in logic space: move/place a tower or select/deselect one.
   *  `keepPlacing` keeps the tower type selected after a successful build, so the
   *  caller can drop several in a row — it is what {@link commitPlaceQueue} builds
   *  a painted line with. (Shift no longer reaches here with a tower armed: the UI
   *  routes it to {@link queuePlacement} instead.) */
  handleClick(x: number, y: number, keepPlacing = false) {
    // A group move claims the click before the line below can fire: the towers
    // being carried ARE the marquee selection, so dropping it would drop them.
    if (this.movingGroupIds.length) {
      this.tryMoveGroup(x, y);
      return;
    }
    // Same reason a paste claims the click early: it's aiming a formation, not
    // picking towers, and the click that lands it must not also select whatever
    // is underneath.
    if (this.pasting) {
      this.tryPaste(x, y);
      return;
    }
    // An armed line owns the board. There is a yes/no sitting in front of the
    // player, and a stray click must not answer it sideways by dropping a lone
    // tower somewhere else (with the tower type still armed, this would otherwise
    // fall through to a normal placement). The panel, Esc and right-click are the
    // only ways out.
    if (this.queueArmed) return;
    this.multiSelectedIds = []; // any normal click drops a marquee selection
    if (this.movingTowerId) {
      this.tryMoveTower(x, y);
      return;
    }
    if (this.selectedTowerType) {
      // The wizard opens an on-tile spellbook picker (Elemental/Ancients/Utility)
      // before it's built; every other tower places immediately.
      if (this.selectedTowerType === 'wizard') {
        const sx = snapToTileCenter(x, GRID);
        const sy = snapToTileCenter(y, GRID);
        if (isValidPlacement(sx, sy, this.path, this.towers, 40, 30, this.blockedTile)) {
          this.pendingKeepPlacing = keepPlacing; // remembered for confirmWizardSpellbook
          this.pendingPlacement = { x: sx, y: sy };
          this.emit();
        } else {
          this.notify("Can't build there");
        }
        return;
      }
      this.placeTower(this.selectedTowerType, x, y, keepPlacing);
      return;
    }
    const hit = this.towers.find(t => distance(t.x, t.y, x, y) <= TOWER_RADIUS + 4);
    const hadPanel = this.selectedTowerId !== null || this.inspectedEnemyId !== null;
    if (hit) {
      this.selectedTowerId = hit.id;
      this.inspectedEnemyId = null; // a tower took focus
      this.sound.play('select'); // soft chime — selecting a tower (calmer than the GE open)
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
    // Shift-place (remembered when the picker opened) keeps 'wizard' selected so
    // the picker re-opens on the next click for another build.
    this.placeTower('wizard', x, y, this.pendingKeepPlacing);
    if (this.towers.length > before) this.pendingPlacement = null; // placed → close picker
    this.emit();
  }

  /** Build a tower, or return null if it couldn't be (no gold / bad tile).
   *
   *  `mageMode` defaults to the pending spellbook — the player's pre-placement
   *  choice — and is overridden only by a paste, which rebuilds each wizard with
   *  the spellbook its original had. Passing it in keeps this the single place
   *  that knows how a wizard of a given book is born (its staff, its starting
   *  spell, its upgrade cost all follow from it). */
  placeTower(type: TowerType, x: number, y: number, keepPlacing = false, mageMode: MageMode = this.pendingMageMode): Tower | null {
    const def = TOWERS[type];
    if (!def) return null;
    const cost = this.towerCost(type);
    const sx = snapToTileCenter(x, GRID);
    const sy = snapToTileCenter(y, GRID);
    if (this.money < cost) { this.notify('Not enough gold'); return null; }
    if (!isValidPlacement(sx, sy, this.path, this.towers, 40, 30, this.blockedTile)) { this.notify("Can't build there"); return null; }

    const tier = def.tiers[0];
    this.money -= cost;
    const tower: Tower = {
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
      upgradeCost: upgradeCostFor(def.tiers[1]?.upgradeCost ?? 0, type === 'wizard' ? mageMode : undefined),
      special: tier.special,
      minDamage: tier.minDamage,
      maxDamage: tier.maxDamage,
      visualRadius: 18,
      disabledTimer: 0,
      specCharge: 0,
      specMax: 100,
      skills: { strength: { level: 1, xp: 0 }, ranged: { level: 1, xp: 0 }, magic: { level: 1, xp: 0 } },
      equipment: { ammo: null, jewellery: null },
      // Wizard's spellbook is the pre-placement choice and is locked from here on;
      // only its element (Elemental) or barrage (Ancients) stays adjustable.
      mageMode: type === 'wizard' ? mageMode : undefined,
      element: type === 'wizard' && mageMode === 'elemental' ? 'air' : undefined,
      ancientType: type === 'wizard' && mageMode === 'ancients' ? 'ice' : undefined,
      supportSpell: type === 'wizard' && mageMode === 'utility' ? 'curse' : undefined,
    };
    this.towers.push(tower);
    this.towersBuilt += 1;
    this.caStats.towersBuilt = this.towersBuilt;
    this.caStats.maxTowersOnField = Math.max(this.caStats.maxTowersOnField, this.towers.length);
    if (new Set(this.towers.map((t) => t.type)).size >= 6) this.caStats.hadAllSixAtOnce = true;
    const style = TOWER_STYLES[tower.type]?.style;
    if (style && !this.caStats.stylesUsed.includes(style)) this.caStats.stylesUsed.push(style);
    this.bumpTowerLayout();
    // No build SFX for now — the old fireworks read as a celebration; per-tower
    // construction sounds are a future pick.
    // Shift-place keeps the type selected so the next click drops another.
    if (!keepPlacing) this.selectedTowerType = null;
    this.emit();
    return tower;
  }

  upgradeTower(towerId: string) {
    const tower = this.towers.find(t => t.id === towerId);
    if (!tower || !tierGateFor(tower).ok) return; // maxed OR below the tier's level gate
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
    tower.upgradeCost = upgradeCostFor(def.tiers[tower.level]?.upgradeCost ?? 0, tower.mageMode);
    this.emit();
  }

  /** Marquee select: pick every tower whose centre falls inside the drag box, and
   *  drop the single selection / placement so the multi panel takes over. */
  selectTowersInBox(x0: number, y0: number, x1: number, y1: number) {
    const minX = Math.min(x0, x1), maxX = Math.max(x0, x1);
    const minY = Math.min(y0, y1), maxY = Math.max(y0, y1);
    this.multiSelectedIds = this.towers
      .filter(t => t.x >= minX && t.x <= maxX && t.y >= minY && t.y <= maxY)
      .map(t => t.id);
    this.selectedTowerId = null;
    this.selectedTowerType = null;
    this.inspectedEnemyId = null;
    if (this.multiSelectedIds.length) this.sound.play('select');
    this.emit();
  }

  clearMultiSelect() {
    if (this.multiSelectedIds.length === 0) return;
    this.multiSelectedIds = [];
    this.emit();
  }

  /** Count + total gold to raise every upgradeable selected tower one tier. */
  get multiUpgradeInfo(): { count: number; cost: number } {
    let count = 0, cost = 0;
    for (const id of this.multiSelectedIds) {
      const t = this.towers.find(tw => tw.id === id);
      if (t && tierGateFor(t).ok) { count++; cost += t.upgradeCost; }
    }
    return { count, cost };
  }

  /** Upgrade each selected tower one tier, cheapest-first (see {@link upgradeOrder}),
   *  spending gold until it runs out — so a partial batch levels as many of the
   *  cheap towers as possible instead of blowing the purse on the priciest one. */
  upgradeMultiSelected() {
    const selected = this.multiSelectedIds
      .map(id => this.towers.find(tw => tw.id === id))
      .filter((t): t is Tower => !!t && tierGateFor(t).ok);
    let any = false;
    for (const id of upgradeOrder(selected)) {
      const t = this.towers.find(tw => tw.id === id)!;
      if (this.money < t.upgradeCost) continue;
      this.upgradeTower(id);
      any = true;
    }
    if (!any) this.notify('Not enough gold');
  }

  /** Toggle a tower's opt-in auto-upgrade flag (see {@link tickAutoUpgrade}). */
  setAutoUpgrade(towerId: string, on: boolean) {
    const tower = this.towers.find(t => t.id === towerId);
    if (!tower || !!tower.autoUpgrade === on) return;
    tower.autoUpgrade = on || undefined;
    // bump (not plain emit): the flag isn't a snapshot field, so on an idle
    // pre-wave board a plain emit diffs to nothing and the panel — including the
    // tier-cap selector gated on this flag — wouldn't re-render.
    this.bumpTowerConfig();
  }

  /** Set the ceiling tier the auto-upgrade may raise a tower to. `cap>=maxLevel`
   *  clears it (no cap). Bumps towerConfigSeq so the selector reflects at once,
   *  board idle or not (the cap isn't a snapshot field). */
  setAutoUpgradeCap(towerId: string, cap: number) {
    const tower = this.towers.find(t => t.id === towerId);
    if (!tower) return;
    const next = cap >= tower.maxLevel ? undefined : Math.max(1, Math.trunc(cap));
    if (tower.autoUpgradeCap === next) return;
    tower.autoUpgradeCap = next;
    this.bumpTowerConfig();
  }

  /** How many of the current selection have auto-upgrade on — drives the batch
   *  toggle's checked / mixed state. */
  get multiAutoUpgradeInfo(): { total: number; on: number } {
    let total = 0, on = 0;
    for (const id of this.multiSelectedIds) {
      const t = this.towers.find(tw => tw.id === id);
      if (t) { total++; if (t.autoUpgrade) on++; }
    }
    return { total, on };
  }

  /** Set the opt-in auto-upgrade flag on every selected tower at once. */
  setMultiAutoUpgrade(on: boolean) {
    let changed = false;
    for (const id of this.multiSelectedIds) {
      const t = this.towers.find(tw => tw.id === id);
      if (t && !!t.autoUpgrade !== on) { t.autoUpgrade = on || undefined; changed = true; }
    }
    if (changed) this.bumpTowerConfig(); // idle-safe re-render (see setAutoUpgrade)
  }

  /** Equip a gear piece from the loot bag onto a tower (Classic). Validates ammo
   *  class / level via canEquip; the slot is the item's own type. Any piece already
   *  in that slot returns to the bag. No-op outside Classic or on a failed check. */
  equipGear(towerId: string, gearId: string) {
    if (this.gameMode !== 'classic') return;
    const tower = this.towers.find(t => t.id === towerId);
    const idx = this.lootBag.findIndex(g => g.id === gearId);
    if (!tower || idx < 0) return;
    const gear = this.lootBag[idx];
    const slot: 'ammo' | 'jewellery' = gear.type === 'jewellery' ? 'jewellery' : 'ammo';
    if (!canEquip(tower, gear).ok) return;
    const prev = tower.equipment[slot];
    this.lootBag = this.lootBag.filter((_, i) => i !== idx);
    tower.equipment[slot] = { ...gear };
    if (prev) this.lootBag = [...this.lootBag, prev];
    this.bumpTowerConfig();
    this.bumpCombatEpoch();
  }

  /** Unequip a tower's slot back into the loot bag (Classic). */
  unequipGear(towerId: string, slot: 'ammo' | 'jewellery') {
    if (this.gameMode !== 'classic') return;
    const tower = this.towers.find(t => t.id === towerId);
    if (!tower) return;
    const prev = tower.equipment[slot];
    if (!prev) return;
    tower.equipment[slot] = null;
    this.lootBag = [...this.lootBag, prev];
    this.bumpTowerConfig();
    this.bumpCombatEpoch();
  }

  /** Auto-upgrade: for every tower the player flagged, keep buying the cheapest
   *  affordable pending upgrade (same cheapest-first rule as the batch upgrade)
   *  until none is affordable. Runs once per real frame, outside the sim sub-step,
   *  so fast-forward doesn't multiply the spend. */
  private tickAutoUpgrade() {
    for (;;) {
      const affordable = this.towers.filter(t =>
        t.autoUpgrade && t.level < (t.autoUpgradeCap ?? t.maxLevel) && tierGateFor(t).ok && t.upgradeCost <= this.money);
      const [cheapestId] = upgradeOrder(affordable);
      if (!cheapestId) break;
      this.upgradeTower(cheapestId); // re-prices the tower and emits
    }
  }

  /** Count + gold back from selling the whole selection. */
  get multiSellInfo(): { count: number; refund: number } {
    let count = 0, refund = 0;
    for (const id of this.multiSelectedIds) {
      const t = this.towers.find(tw => tw.id === id);
      if (t) { count++; refund += this.sellValue(t); }
    }
    return { count, refund };
  }

  /** Sell every selected tower. Irreversible and easy to fat-finger, so the UI
   *  confirms first — same rule as the single-tower Sell button. */
  sellMultiSelected() {
    const ids = [...this.multiSelectedIds];
    if (ids.length === 0) return;
    this.multiSelectedIds = []; // the panel closes with the towers it acted on
    for (const id of ids) this.sellTower(id);
    this.emit();
  }

  /** Point the whole selection at one priority. */
  setMultiTargetingPriority(priority: TargetingPriority) {
    let any = false;
    for (const id of this.multiSelectedIds) {
      const t = this.towers.find(tw => tw.id === id);
      if (!t) continue;
      t.targetingPriority = priority;
      t.targetId = null; // re-acquire under the new priority next frame
      any = true;
    }
    if (!any) return;
    this.sound.play('click');
    this.bumpTowerConfig();
  }

  /**
   * The selected wizards grouped by spellbook, so the multi panel can offer the
   * books it actually holds. `element`/`ancientType`/`supportSpell` report the
   * shared pick when every wizard of that book agrees (for the active highlight),
   * and null when the selection is split.
   */
  get multiMageInfo(): {
    elemental: number; ancients: number; utility: number;
    element: Element | null; ancientType: AncientType | null; supportSpell: SupportSpell | null;
  } {
    const wizards = this.multiSelectedIds
      .map(id => this.towers.find(t => t.id === id))
      .filter((t): t is Tower => !!t && t.type === 'wizard');
    const of = (mode: MageMode) => wizards.filter(w => (w.mageMode ?? 'elemental') === mode);
    const shared = <T,>(list: Tower[], read: (t: Tower) => T): T | null => {
      if (list.length === 0) return null;
      const first = read(list[0]);
      return list.every(t => read(t) === first) ? first : null;
    };
    const el = of('elemental'), anc = of('ancients'), ut = of('utility');
    return {
      elemental: el.length, ancients: anc.length, utility: ut.length,
      element: shared(el, t => t.element ?? 'air'),
      ancientType: shared(anc, t => t.ancientType ?? 'ice'),
      supportSpell: shared(ut, t => t.supportSpell ?? 'curse'),
    };
  }

  /** Re-element every Elemental wizard in the selection at once. Non-wizards and
   *  the other two spellbooks are left alone — a mixed marquee is normal. */
  setMultiWizardElement(element: Element) {
    for (const id of this.multiSelectedIds) {
      const t = this.towers.find(tw => tw.id === id);
      if (t?.type === 'wizard' && (t.mageMode ?? 'elemental') === 'elemental') t.element = element;
    }
    this.sound.play('click');
    this.bumpTowerConfig();
  }

  /** As {@link setMultiWizardElement}, for the Ancients book's barrage. */
  setMultiAncientType(ancient: AncientType) {
    for (const id of this.multiSelectedIds) {
      const t = this.towers.find(tw => tw.id === id);
      if (t?.type === 'wizard' && t.mageMode === 'ancients') t.ancientType = ancient;
    }
    this.sound.play('click');
    this.bumpTowerConfig();
  }

  /** As {@link setMultiWizardElement}, for the Utility book's field. Routed through
   *  the single-tower setter so the Prayer Ward field cap still holds — a batch
   *  must not be a way around it. */
  setMultiSupportSpell(spell: SupportSpell) {
    for (const id of this.multiSelectedIds) {
      const t = this.towers.find(tw => tw.id === id);
      if (t?.type === 'wizard' && t.mageMode === 'utility') this.setSupportSpell(t.id, spell);
    }
  }

  setTargetingPriority(towerId: string, priority: TargetingPriority) {
    const tower = this.towers.find(t => t.id === towerId);
    if (!tower) return;
    tower.targetingPriority = priority;
    tower.targetId = null; // re-acquire under the new priority next frame
    this.bumpTowerConfig();
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
    this.bumpTowerConfig();
  }

  /** Pick the barrage an Ancients-spellbook wizard casts. */
  setAncientType(towerId: string, ancient: AncientType) {
    const tower = this.towers.find(t => t.id === towerId);
    if (!tower || tower.type !== 'wizard') return;
    tower.ancientType = ancient;
    this.sound.play('click');
    this.bumpTowerConfig();
  }

  /** Count of Prayer Ward (utility + sanctity) wizards currently fielded. */
  prayerWardCount(): number {
    return this.towers.filter(t => t.type === 'wizard' && t.mageMode === 'utility' && (t.supportSpell ?? 'curse') === 'sanctity').length;
  }

  /** Pick the field a Utility-spellbook wizard projects. Prayer Ward (sanctity)
   *  is capped at {@link MAX_PRAYER_WARDS} on the field — you can still swap any
   *  ward to another field freely, but can't set a new one past the cap. */
  setSupportSpell(towerId: string, spell: SupportSpell) {
    const tower = this.towers.find(t => t.id === towerId);
    if (!tower || tower.type !== 'wizard') return;
    if (spell === 'sanctity' && (tower.supportSpell ?? 'curse') !== 'sanctity'
        && this.prayerWardCount() >= MAX_PRAYER_WARDS) {
      this.notify(`Max ${MAX_PRAYER_WARDS} Prayer Ward wizards`);
      return;
    }
    tower.supportSpell = spell;
    this.sound.play('click');
    this.bumpTowerConfig();
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
    // Classic gear on a sold tower returns to the loot bag, not the void.
    if (this.gameMode === 'classic') {
      if (tower.equipment.ammo) this.lootBag = [...this.lootBag, tower.equipment.ammo];
      if (tower.equipment.jewellery) this.lootBag = [...this.lootBag, tower.equipment.jewellery];
    }
    this.towers.splice(i, 1);
    this.caStats.towersSold += 1;
    this.bumpTowerLayout();
    if (this.selectedTowerId === towerId) this.selectedTowerId = null;
    if (this.movingTowerId === towerId) this.movingTowerId = null;
    // A carried tower sold mid-move leaves the formation; the rest keep flying.
    if (this.movingGroupIds.includes(towerId)) {
      this.movingGroupIds = this.movingGroupIds.filter(id => id !== towerId);
    }
    this.sound.play('sell');
    this.emit();
  }

  startWave() {
    if (this.waveActive || this.gameOver) return;
    if (this.pendingRelics) { this.notify('Choose a relic first'); return; }
    if (this.pendingDraft) { this.notify('Choose a draft card first'); return; }
    this.slayer.assignTask(); // idempotent: ensure a task exists so it can seed the wave
    // Spawn exactly what the Start Wave hover previewed. assignTask above may have
    // just rolled a task — that changes the cache key, so this recomputes with the
    // Slayer seed folded in; otherwise it reuses the memoised makeup.
    const configs = computeWaveConfigs(this);
    // A boss wave stays the headline act — no event rolls on it (see wave-events).
    const bossWave = configs.some(c => ENEMIES[c.type]?.isBoss);
    this.activeEvent = rollWaveEvent(this.wave, bossWave, Math.random);
    this.bumpCombatEpoch(); // event tower mods change every tower's stats
    this.spawnQueue = buildWaveEnemies(this, configs, this.wave);
    this.waveTotal = this.spawnQueue.length;
    this.bossWave = bossWave;
    if (this.activeEvent) this.notify(this.activeEvent.name, this.activeEvent.icon);
    this.waveActive = true;
    this.sandboxWave = false; // a real wave: rewards/progression apply normally
    this.lastWaveSandbox = false; // a new wave started: clear the sandbox banner flag
    this.sound.setCombatSuppressed(false);
    this.sound.play('wave');
    this.emit();
  }

  // ------------------------------------------------------------------- update
  private update(dt: number) {
    this.gameTime += dt;
    this.prayer.update(dt);
    this.ge.update(dt);
    spawn(this, dt);
    damageOverTime(this, dt);
    moveEnemies(this, dt);
    fireTowers(this, dt);
    updateUtilityTowers(this);
    recordCombatTime(this, dt);
    moveProjectiles(this, dt);
    handleBossMechanics(this, dt);
    updateEffects(this, dt);
    checkWaveEnd(this);
  }

  /** Debug autoplay: count up while idle and auto-start the next wave once the
   *  delay elapses. Waits on a pending roguelite draft (the pick stays manual).
   *  Counts real seconds — the caller must pass the unscaled frame dt. */
  private tickAutoplay(dt: number) {
    if (!this.autoplay || this.gameOver || this.waveActive || this.pendingDraft || this.pendingRelics) {
      this.autoplayTimer = 0;
      return;
    }
    this.autoplayTimer += dt;
    if (this.autoplayTimer >= this.autoplaySecs) {
      this.autoplayTimer = 0;
      this.startWave();
    }
  }

  /** Debug: toggle autoplay on/off. */
  setAutoplay(on: boolean) {
    this.autoplay = on;
    this.autoplayTimer = 0;
    this.emit();
  }

  /** Debug: seconds between autoplayed waves (clamped to a 1s minimum). */
  setAutoplaySecs(s: number) {
    this.autoplaySecs = Math.max(1, Math.floor(s));
    this.emit();
  }

  /** Roll and offer a fresh draft hand (bigger if Production Prodigy is owned) and
   *  refill the re-roll allowance (Trickster). `boosted` swaps in the boss-reward
   *  rarity odds; it also latches so a Trickster re-roll of a boosted hand stays
   *  boosted rather than quietly downgrading the boss's prize. */
  offerDraft(boosted = false) {
    this.draftBoosted = boosted;
    this.pendingDraft = rollDraft(
      Math.random,
      3 + this.relicFx.handBonus,
      availableCards(this.draftedUnique),
      boosted ? BOOSTED_RARITY_WEIGHT : RARITY_WEIGHT,
      this.wave,
    );
    this.draftRerollsLeft = this.relicFx.rerollsPerWave;
    this.sound.play('interface_open');
  }

  /** Gold price of the next bought card roll (geometric in rolls already bought). */
  get cardRollCost(): number {
    return cardRollCost(this.cardRollsBought);
  }

  /**
   * Roguelite: buy a draft hand with gold. Cards are no longer a per-wave handout —
   * this is the only routine way to get one, so every roll is weighed against a
   * tower. Idle-only (the hand is a modal overlay, and a wave shouldn't be paused
   * behind a shop), and each purchase raises the next price.
   */
  buyCardRoll() {
    if (this.gameMode !== 'roguelite') return;
    if (this.gameOver || this.waveActive) { this.notify('Only between waves'); return; }
    if (this.pendingDraft || this.pendingRelics) return; // a choice is already open
    const cost = this.cardRollCost;
    if (this.money < cost) { this.notify('Not enough gold'); return; }
    this.money -= cost;
    this.cardRollsBought += 1;
    this.offerDraft();
    this.emit();
  }

  /** Resolve a would-be-lethal life total. Returns true if the run ended; false if
   *  the player survives — including a Last Recall relic spending a charge to leave
   *  them on 1 life. Call right after any life subtraction that could hit 0. */
  checkLethal(): boolean {
    if (this.lives > 0) return false;
    if (this.relicFx.cheatDeathLeft > 0) {
      this.relicFx.cheatDeathLeft -= 1;
      this.lives = 1;
      addRing(this, this.width / 2, this.height / 2, 24, Math.max(this.width, this.height) * 0.5, '#9dffa0', 0.7, 8);
      this.notify('Last Recall — cheated death!');
      return false;
    }
    this.lives = 0;
    this.endGame();
    return true;
  }

  /** Choose the game mode. Only switches before the run starts (wave 1, no wave
   *  running) and restarts to apply it cleanly; ignored mid-run. */
  setMode(mode: GameMode) {
    if (mode === this.gameMode) return;
    if (this.wave !== 1 || this.waveActive) { this.notify('Finish the run to switch modes'); return; }
    this.gameMode = mode;
    this.restart();
  }

  /** Choose the New Game+ tier for the next run. Like {@link setMode}, only
   *  honoured before wave 1 begins. Clamps against what the mode has unlocked as
   *  defence-in-depth, then restarts so the run boots at the chosen difficulty. */
  setDifficultyTier(tier: DifficultyTier, highestCleared: number) {
    const wanted = clampTier(tier);
    const allowed = Math.min(wanted, highestUnlockedTier(highestCleared)) as DifficultyTier;
    if (allowed === this.difficultyTier) return;
    if (this.wave !== 1 || this.waveActive) { this.notify('Finish the run to change difficulty'); return; }
    this.difficultyTier = allowed;
    this.restart();
  }

  /** Roguelite: keep one drafted card, apply its effect, and clear the hand so the
   *  next wave can start. No-op if the id isn't in the current hand. */
  pickDraftCard(id: string) {
    const card = this.pendingDraft?.find(c => c.id === id);
    if (!card) return;
    this.applyDraftEffect(card);
    this.bumpTowerLayout(); // a synergy card changes the aura glows
    // Unique (build-defining) cards are spent: keep them out of this run's later hands.
    if (card.unique) this.draftedUnique.add(card.id);
    // Track the run's build for the active-relics panel (stack repeatable cards).
    const owned = this.runCards.find(c => c.id === card.id);
    if (owned) owned.count++;
    else this.runCards.push({ id: card.id, count: 1 });
    // Lifetime Cards collection-log tally (account-wide, survives restart).
    this.cardCounts = { ...this.cardCounts, [card.id]: (this.cardCounts[card.id] ?? 0) + 1 };
    this.pendingDraft = null;
    this.sound.play('sell'); // OSRS reward chime
    this.notify(`Drafted: ${card.name}`, card.icon);
  }

  /** Roguelite: re-roll the current draft hand, spending one Trickster charge.
   *  No-op when there's no pending draft or no re-rolls left. */
  rerollDraft() {
    if (!this.pendingDraft || this.draftRerollsLeft <= 0) return;
    this.draftRerollsLeft -= 1;
    this.pendingDraft = rollDraft(
      Math.random,
      3 + this.relicFx.handBonus,
      availableCards(this.draftedUnique),
      this.draftBoosted ? BOOSTED_RARITY_WEIGHT : RARITY_WEIGHT,
      this.wave,
    );
    this.sound.play('interface_open');
    this.emit();
  }

  /** Roguelite: keep the chosen relic from the boss's offer, apply its effect,
   *  and clear the offer so the next wave can start. No-op if the id isn't offered. */
  pickRelic(id: string) {
    const relic = this.pendingRelics?.find(r => r.id === id);
    if (!relic) return;
    this.applyRelicEffect(relic.effect);
    this.bumpCombatEpoch(); // a relic can raise runMods (damage/range/fireRate)
    this.ownedRelics.push(relic);
    this.pendingRelics = null;
    this.sound.play('fireworks'); // a relic is the run's celebration moment
    this.notify(`Relic: ${relic.name}`, relic.icon);
  }

  /** Fold a chosen relic's effect into the run. Stat/utility kinds reuse the
   *  draft pipelines ({@link runMods} / {@link runFx}); the relic-only kinds set
   *  their {@link relicFx} hooks. `multi` applies each sub-effect in order. */
  private applyRelicEffect(e: RelicEffect) {
    switch (e.kind) {
      case 'execute': this.relicFx.executeFrac = Math.max(this.relicFx.executeFrac, e.frac); break;
      case 'interest': this.relicFx.interest = { rate: e.rate, cap: e.cap }; break;
      case 'reroll': this.relicFx.rerollsPerWave += e.perWave; break;
      case 'handSize': this.relicFx.handBonus += e.extra; break;
      case 'cheatDeath': this.relicFx.cheatDeathLeft += 1; break;
      case 'damage': this.applyStyleMult(this.runMods.damage, e.mult, e.style); break;
      case 'range': this.applyStyleMult(this.runMods.range, e.mult, e.style); break;
      case 'fireRate': this.applyStyleMult(this.runMods.fireRate, e.mult, e.style); break;
      case 'goldFind': this.runFx.goldMult *= e.mult; break;
      case 'soulSteal': this.runFx.soulSteal = { bossHeal: e.bossHeal, addKills: e.addKills }; break;
      case 'maxLife': this.maxLives += e.amount; this.lives += e.amount; break;
      case 'multi': for (const sub of e.effects) this.applyRelicEffect(sub); break;
    }
  }

  /** Apply a drafted card's effect to the run. Instant effects grant a resource;
   *  the multiplier effects fold into {@link runMods} and buff every tower; a
   *  `multi` card bundles several effects (applied in order). */
  private applyDraftEffect(card: DraftCard) {
    this.applyDraftEffectOne(card.effect);
  }

  private applyDraftEffectOne(e: DraftEffect) {
    switch (e.kind) {
      case 'slayerPoints': this.slayer.points += e.amount; break;
      case 'essence': this.meta.award(e.amount); this.essenceEarnedThisRun += e.amount; break;
      case 'life': this.lives = Math.min(this.maxLives, this.lives + e.amount); break;
      case 'maxLife': this.maxLives += e.amount; this.lives += e.amount; break;
      case 'damage': this.applyStyleMult(this.runMods.damage, e.mult, e.style); break;
      case 'range': this.applyStyleMult(this.runMods.range, e.mult, e.style); break;
      case 'fireRate': this.applyStyleMult(this.runMods.fireRate, e.mult, e.style); break;
      // ── on-kill chain reactions ──
      case 'ricochet': this.runFx.ricochet = { frac: e.frac, radius: e.radius }; break;
      case 'overkill': this.runFx.overkill = { radius: e.radius }; break;
      case 'killStreak': this.runFx.killStreak = { every: e.every, damage: e.damage }; break;
      // ── risk / reward curses ──
      case 'lastStand': this.runFx.lastStand = { belowLives: e.belowLives, mult: e.mult }; break;
      case 'berserker': this.runFx.berserkerPerLife += e.perMissingLife; break;
      case 'bloodPact': this.runFx.bloodPactMult *= e.mult; this.runFx.bloodPact = true; break;
      case 'greed': this.runFx.enemyHpMult *= e.hpMult; this.runFx.goldMult *= e.goldMult; break;
      // ── tower transformations ──
      case 'doubleShot': this.runFx.doubleShot = true; break;
      case 'venomTips': this.runFx.venomTips = { dps: e.dps, dur: e.dur }; break;
      case 'chainFreeze': this.runFx.chainFreezeRadius = Math.max(this.runFx.chainFreezeRadius, e.radius); break;
      case 'pierce': this.runFx.pierce = { radius: e.radius }; break;
      // ── placement synergies ──
      case 'packTactics': this.runFx.synergy.packTactics = { frac: e.frac, radius: e.radius, maxStacks: e.maxStacks }; break;
      case 'trinity': this.runFx.synergy.trinity = { mult: e.mult, radius: e.radius }; break;
      case 'vanguard': this.runFx.synergy.vanguard = { mult: e.mult }; break;
      case 'loneWolf': this.runFx.synergy.loneWolf = { mult: e.mult, radius: e.radius }; break;
      // ── magic spellbook specialisations ──
      case 'mageBuff': {
        const b = this.runFx.mageBuff[e.mode];
        b.damage *= e.damage ?? 1;
        b.range *= e.range ?? 1;
        b.fireRate *= e.fireRate ?? 1;
        break;
      }
      case 'multi': for (const sub of e.effects) this.applyDraftEffectOne(sub); break;
    }
  }

  /** Multiply one stat's per-style mods: a specific `style` buffs only that style,
   *  an omitted style is "general" and buffs all three (e.g. Overload). */
  private applyStyleMult(mods: StyleMods, mult: number, style?: CombatStyle) {
    if (style) mods[style] *= mult;
    else { mods.melee *= mult; mods.ranged *= mult; mods.magic *= mult; }
  }

  /** Dynamic, run-wide damage multiplier from the *curse* cards — recomputed per
   *  shot because it depends on live state (current lives). Blood Pact is a flat
   *  multiplier; Berserker scales with lives lost; Last Stand doubles while low. */
  runDamageMult(): number {
    const fx = this.runFx;
    let m = fx.bloodPactMult;
    if (fx.berserkerPerLife > 0) m *= 1 + fx.berserkerPerLife * Math.max(0, this.maxLives - this.lives);
    if (fx.lastStand && this.lives <= fx.lastStand.belowLives) m *= fx.lastStand.mult;
    return m;
  }

  private endGame() {
    this.gameOver = true;
    this.waveActive = false;
    this.sound.fadeCombat();
    this.sound.play('game_over');
  }

  /** Enemy stat multipliers for the current run's difficulty tier — passed into
   *  scaleEnemyStats at every spawn / preview. Tier 0 returns all-ones. */
  get diffEnemyMults(): { hp: number; speed: number; reward: number } {
    const m = tierMods(this.difficultyTier);
    return { hp: m.enemyHp, speed: m.enemySpeed, reward: m.gold };
  }

  // ------------------------------------------------------------- run save/load
  /**
   * Snapshot the run in progress, or `null` when there is nothing safe or worth
   * saving. Two refusals, both deliberate:
   *
   * - **Mid-wave** (`waveActive`) and **after a loss** (`gameOver`) return null.
   *   A snapshot is a between-waves checkpoint — enemies, projectiles and the
   *   spawn queue are never serialized, so taking one mid-wave would silently
   *   delete the wave the player is fighting. The caller keeps the last idle
   *   checkpoint instead, and a player who quits mid-wave resumes at that wave's
   *   start with the board exactly as they left it.
   * - An **untouched wave-1 board** is not progress, so it never overwrites a
   *   real save with an empty one.
   */
  snapshotRun(): RunSave | null {
    if (this.gameOver || this.waveActive) return null;
    if (this.wave <= 1 && this.towers.length === 0) return null;
    return {
      version: RUN_SAVE_VERSION,
      savedAt: Date.now(),
      mapSeed: this.mapSeed,
      gameMode: this.gameMode,
      difficultyTier: this.difficultyTier,
      wave: this.wave,
      money: this.money,
      lives: this.lives,
      maxLives: this.maxLives,
      kills: this.kills,
      goldEarned: this.goldEarned,
      towersBuilt: this.towersBuilt,
      essenceEarnedThisRun: this.essenceEarnedThisRun,
      // Tower cooldowns are stamped against this clock, so it travels with them.
      gameTime: this.gameTime,
      realTime: this.realTime,
      towers: structuredClone(this.towers),
      lootBag: structuredClone(this.lootBag),
      runMods: cloneRunMods(this.runMods),
      runFx: structuredClone(this.runFx),
      relicFx: { ...this.relicFx },
      runCards: this.runCards.map(c => ({ ...c })),
      draftedUnique: [...this.draftedUnique],
      // Cards and relics travel as ids and are re-resolved from the live pools.
      pendingDraft: this.pendingDraft?.map(c => c.id) ?? null,
      pendingRelics: this.pendingRelics?.map(r => r.id) ?? null,
      ownedRelics: this.ownedRelics.map(r => r.id),
      draftRerolls: this.draftRerollsLeft,
      cardRollsBought: this.cardRollsBought,
      draftBoosted: this.draftBoosted,
      // The run's Combat Achievement facts travel with the run: resuming must not
      // hand the player a fresh "no life lost yet" slate for tasks they already spent.
      caStats: structuredClone(this.caStats),
      slayer: this.slayer.snapshot(),
      prayer: { points: this.prayer.points, active: [...this.prayer.active] },
    };
  }

  /**
   * Resume a saved run: rebuild its map from the seed, put its towers back, and
   * restore the roguelite build it had drafted. The board comes back idle and
   * between waves, ready for Start Wave.
   *
   * Cards / relics are resolved by id against the live pools, so a card removed
   * by a later patch simply drops out of the hand instead of breaking the load.
   * Their accrued stat effects ride in `runMods` / `runFx` / `relicFx` and are
   * merged onto fresh defaults, so a field added since the save was written still
   * gets its default rather than `undefined`.
   */
  loadRun(save: RunSave) {
    this.generateMap(save.mapSeed);
    // Transient combat state is never saved — start the restored board clean.
    this.enemies = [];
    this.projectiles = [];
    this.hitsplats = [];
    this.particles = [];
    this.deaths = [];
    this.spotEffects = [];
    this.fx = [];
    this.spawnQueue = [];
    this.spawnTimer = 0;
    // A restored run starts hands-on: auto-wave is never carried in from the save
    // (it isn't persisted) or left on from a previous run in this session.
    this.autoplay = false;
    this.autoplayTimer = 0;
    this.previewCache = null;

    this.gameMode = save.gameMode;
    this.difficultyTier = save.difficultyTier;
    this.towers = structuredClone(save.towers);
    this.lootBag = save.lootBag ? structuredClone(save.lootBag) : [];
    this.bumpTowerLayout();
    this.money = save.money;
    this.maxLives = save.maxLives;
    this.lives = save.lives;
    this.wave = save.wave;
    this.kills = save.kills;
    this.goldEarned = save.goldEarned;
    this.towersBuilt = save.towersBuilt;
    this.essenceEarnedThisRun = save.essenceEarnedThisRun;
    this.gameTime = save.gameTime;
    this.realTime = save.realTime;

    const mods = freshRunMods();
    this.runMods = {
      damage: { ...mods.damage, ...save.runMods?.damage },
      range: { ...mods.range, ...save.runMods?.range },
      fireRate: { ...mods.fireRate, ...save.runMods?.fireRate },
    };
    this.runFx = { ...freshRunEffects(), ...save.runFx };
    this.relicFx = { ...freshRelicEffects(), ...save.relicFx };
    this.runCards = save.runCards.map(c => ({ ...c }));
    this.draftedUnique = new Set(save.draftedUnique);
    this.ownedRelics = save.ownedRelics
      .map(id => RELICS.find(r => r.id === id))
      .filter((r): r is Relic => !!r);
    const hand = save.pendingDraft?.map(id => DRAFT_POOL.find(c => c.id === id)).filter((c): c is DraftCard => !!c);
    this.pendingDraft = hand?.length ? hand : null;
    const relics = save.pendingRelics?.map(id => RELICS.find(r => r.id === id)).filter((r): r is Relic => !!r);
    this.pendingRelics = relics?.length ? relics : null;
    this.draftRerollsLeft = save.draftRerolls;
    this.cardRollsBought = save.cardRollsBought ?? 0;
    this.draftBoosted = save.draftBoosted ?? false;
    // A save written before Combat Achievements existed simply restarts its facts.
    this.caStats = save.caStats ?? emptyRunStats(this.gameMode, this.difficultyTier);

    this.waveActive = false;
    this.gameOver = false;
    this.paused = false;
    this.waveTotal = 0;
    this.bossWave = false;
    this.activeEvent = null;
    this.bumpCombatEpoch();
    this.sandboxWave = false;
    this.lastWaveSandbox = false;
    this.baseFlash = 0;
    this.selectedTowerType = null;
    this.selectedTowerId = null;
    this.multiSelectedIds = [];
    this.movingTowerId = null;
    this.movingGroupIds = [];
    this.placeQueue = [];
    this.queueArmed = false;
    this.clipboard = [];
    this.pasting = false;
    this.pendingPlacement = null;

    this.slayer.load(save.slayer);
    this.slayer.assignTask(); // no-op when the save already carried one
    this.prayer.load(save.prayer);
    // The Grand Exchange is priced per run and its potions are timed — a resumed
    // run gets a fresh board rather than potions that expired while the tab was
    // closed. Damage accounting likewise starts over (its numbers are per-session).
    this.ge.reset();
    this.stats.reset();
    if (this.dpsPanelOpen) this.onState({ dpsStats: this.stats.snapshot() });
    this.emit();
  }

  /** Dismiss the victory screen and play on. The run keeps its board and progress;
   *  only the difficulty curve changes (Endless HP acceleration from `victoryWave`). */
  continueEndless() {
    if (!this.won) return;
    this.runPhase = 'endless';
    this.paused = false;
    this.previewCache = null; // force the next preview to reflect the Endless HP term
    this.emit();
  }

  restart() {
    this.generateMap(); // fresh procedural map + biome for the new run
    this.enemies = [];
    this.towers = [];
    this.bumpTowerLayout();
    this.projectiles = [];
    this.hitsplats = [];
    this.particles = [];
    this.deaths = [];
    this.spotEffects = [];
    this.fx = [];
    this.spawnQueue = [];
    // Meta-progression (essence + upgrades) persists across runs — only re-apply
    // the starting-gold bonus to the fresh balance.
    this.money = START_MONEY + this.meta.upgrades.startingMoney;
    // The difficulty tier is a run-wide lever set before wave 1; it persists
    // across restart (like gameMode). effectiveStartLives applies its lives
    // delta and floors it, so a tier is hard, never structurally unwinnable.
    const startLives = effectiveStartLives(START_LIVES, this.difficultyTier);
    this.lives = startLives;
    this.maxLives = startLives;
    // Roguelite run-scoped state resets; the chosen game mode itself persists.
    this.bossesKilledThisRun = {};
    this.won = false;
    this.runPhase = 'normal';
    this.victoryWave = 0;
    this.runMods = freshRunMods();
    this.runFx = freshRunEffects();
    this.draftedUnique.clear();
    this.runCards = [];
    this.lootBag = [];
    this.pendingDraft = null;
    this.relicFx = freshRelicEffects();
    this.ownedRelics = [];
    this.pendingRelics = null;
    this.draftRerollsLeft = 0;
    this.cardRollsBought = 0;
    this.draftBoosted = false;
    this.wave = 1;
    this.kills = 0;
    this.goldEarned = 0;
    this.towersBuilt = 0;
    this.essenceEarnedThisRun = 0;
    this.caStats = emptyRunStats(this.gameMode, this.difficultyTier);
    this.waveTotal = 0;
    this.bossWave = false;
    this.activeEvent = null;
    this.bumpCombatEpoch();
    this.sandboxWave = false;
    this.lastWaveSandbox = false;
    this.baseFlash = 0;
    this.paused = false;
    this.waveActive = false;
    // Auto-wave never carries into a new run — a fresh run always starts hands-on.
    this.autoplay = false;
    this.autoplayTimer = 0;
    this.gameOver = false;
    this.selectedTowerType = null;
    this.selectedTowerId = null;
    this.multiSelectedIds = [];
    this.movingTowerId = null;
    this.movingGroupIds = [];
    this.placeQueue = [];
    this.queueArmed = false;
    this.clipboard = [];
    this.pasting = false;
    this.pendingPlacement = null;
    this.gameTime = 0;
    this.realTime = 0;
    this.slayer.reset();
    this.slayer.assignTask(); // fresh task for the new run
    this.prayer.reset();
    this.ge.reset();
    this.stats.reset();
    if (this.dpsPanelOpen) this.onState({ dpsStats: this.stats.snapshot() });
    this.emit();
  }

  // ------------------------------------------------------------------- debug
  // Cheats for the in-game debug panel (GameRoot). They mutate run state
  // directly and re-emit; none are reachable in normal play.

  /** Jump to a wave number (only between waves — mid-wave is a no-op). */
  debugSetWave(n: number) {
    if (this.waveActive) { this.notify('Finish the wave first'); return; }
    this.wave = Math.max(1, Math.floor(n) || 1);
    this.emit();
  }

  /** Set the gold balance outright. */
  debugSetGold(n: number) {
    this.money = Math.max(0, Math.floor(n) || 0);
    this.emit();
  }

  /** Set the persistent Rune Essence balance outright. */
  debugSetEssence(n: number) {
    this.meta.setEssence(n);
  }

  /** Set the Slayer point balance outright — the sink is the rewards shop, so
   *  testing any of its unlocks otherwise means grinding tasks for them. */
  debugSetSlayerPoints(n: number) {
    this.slayer.points = Math.max(0, Math.floor(n) || 0);
    this.emit();
  }

  /** Set remaining lives (clamped to the max). */
  debugSetLives(n: number) {
    this.lives = Math.max(0, Math.min(this.maxLives, Math.floor(n) || 0));
    if (this.lives <= 0) this.endGame(); else if (this.gameOver) this.gameOver = false;
    this.emit();
  }

  /** Start a wave built from an explicit enemy list — each chosen type spawned
   *  `countEach` times. With no types it falls back to the normal wave. Used by
   *  the debug "spawn custom wave" control. */
  debugStartCustomWave(types: EnemyType[], countEach: number) {
    if (this.waveActive || this.gameOver) return;
    const n = Math.max(1, Math.floor(countEach) || 1);
    const out: Enemy[] = [];
    for (const t of types) {
      for (let i = 0; i < n; i++) {
        const e = makeEnemy(this, t, this.wave);
        if (e) { e.debug = true; out.push(e); } // sandbox: no effect on the run
      }
    }
    if (!out.length) { this.startWave(); return; }
    this.spawnQueue = out;
    this.waveTotal = out.length;
    this.bossWave = out.some((e) => e.isBoss);
    this.waveActive = true;
    this.sandboxWave = true;
    this.lastWaveSandbox = false; // clear any prior banner flag while this one runs
    this.sound.play('wave');
    this.emit();
  }

  /** Build a forced affix roll for the debug cheats: the explicit list, or — when
   *  empty — a random 1–2 affix elite, so "spawn elite" still does something. */
  private buildForcedRoll(affixes: EnemyAffix[]): AffixRoll {
    let list = affixes.slice();
    if (!list.length) {
      const pool = [...ALL_AFFIXES];
      const n = 1 + (Math.random() < 0.4 ? 1 : 0);
      list = [];
      for (let i = 0; i < n && pool.length; i++) list.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
    }
    const roll: AffixRoll = { affixes: list };
    if (list.includes('armored')) roll.armoredStyle = rollArmoredStyle(Math.random);
    if (list.includes('protected')) roll.protectedStyle = rollProtectedStyle(Math.random);
    return roll;
  }

  /** Debug: spawn a sandbox wave of enemies with forced affixes (empty list =
   *  a random elite). Lets affixes be eyeballed without waiting on the rare roll. */
  debugSpawnAffixed(types: EnemyType[], affixes: EnemyAffix[], countEach: number) {
    if (this.waveActive || this.gameOver) return;
    const n = Math.max(1, Math.floor(countEach) || 1);
    const out: Enemy[] = [];
    for (const t of types) {
      for (let i = 0; i < n; i++) {
        const e = makeEnemy(this, t, this.wave, this.buildForcedRoll(affixes));
        if (e) { e.debug = true; out.push(e); }
      }
    }
    if (!out.length) return;
    this.spawnQueue = out;
    this.waveTotal = out.length;
    this.bossWave = out.some((e) => e.isBoss);
    this.waveActive = true;
    this.sandboxWave = true;
    this.lastWaveSandbox = false;
    this.sound.play('wave');
    this.emit();
  }

  /** Debug: spawn one boss (sandbox), optionally with forced modifiers — bypasses
   *  the seen-gate so boss modifiers + phase mechanics can be tested on demand. */
  debugSpawnBoss(type: EnemyType, affixes: EnemyAffix[]) {
    if (this.waveActive || this.gameOver) return;
    const forced: AffixRoll = affixes.length ? this.buildForcedRoll(affixes) : { affixes: [] };
    const e = makeEnemy(this, type, this.wave, forced);
    if (!e) return;
    e.debug = true;
    this.spawnQueue = [e];
    this.waveTotal = 1;
    this.bossWave = true;
    this.waveActive = true;
    this.sandboxWave = true;
    this.lastWaveSandbox = false;
    this.sound.play('wave');
    this.emit();
  }

  /** Remove every live enemy + queued spawn (debug "clear field"); ends the wave
   *  cleanly if one was running. */
  debugClearEnemies() {
    this.enemies = [];
    this.spawnQueue = [];
    if (this.waveActive) checkWaveEnd(this);
    this.emit();
  }

  /** Roll a brand-new procedural map (fresh road layout + biome) without touching
   *  the run — lets the debug panel preview the map variety without a full restart.
   *  Blocked mid-wave so live enemies never have their path yanked out. */
  debugRerollMap() {
    if (this.waveActive || this.enemies.length) { this.notify('Clear the field first'); return; }
    this.generateMap();
    this.bumpTowerLayout(); // towers may now sit on/off the new road — refresh ranges
    this.emit();
  }

  /** Re-skin the current layout with the next biome in the list (colours only —
   *  the road shape is untouched), so every region's palette can be eyeballed on
   *  the same map. Safe any time; purely cosmetic. */
  debugCycleBiome() {
    this.biome = nextBiome(this.biome);
    this.emit();
  }

  /** Seed a few Collection-Log kills so the obtained/locked states can be
   *  eyeballed without grinding (debug panel). */
  debugSeedLog() {
    const next = { ...this.killCounts };
    Object.keys(ENEMIES).slice(0, 6).forEach((t, i) => { next[t] = (next[t] ?? 0) + (i + 1) * 3; });
    this.killCounts = next;
    const cards = { ...this.cardCounts };
    DRAFT_POOL.slice(0, 8).forEach((c, i) => { cards[c.id] = (cards[c.id] ?? 0) + (i + 1); });
    this.cardCounts = cards;
    this.emit();
  }

  /** Fire a sample unlock popup so the collection-log popup can be eyeballed
   *  without clearing all the way to a prayer's unlock wave. */
  /** Drop one of every Classic gear piece straight into the loot bag, so the bag
   *  and its equip picker can be exercised without farming a boss for an hour.
   *  The whole pool rather than a random handful: a random draw makes "does the
   *  swap comparison render" a coin flip. */
  debugGiveGear() {
    const gear = Object.values(GEAR);
    if (gear.length === 0) return;
    this.lootBag = [...this.lootBag, ...gear];
    this.gearDrops = mergeUnlockBatch(this.gearDrops, gear, this.gearDropsDrained);
    this.gearDropsDrained = false;
    this.gearDropSeq++;
    this.emit();
  }

  debugTestUnlock() {
    const def = PRAYERS.find(p => p.id === 'rigour') ?? PRAYERS[0];
    this.announceUnlocks([{
      kind: 'prayer',
      name: def.name,
      desc: def.description,
      icon: (ASSETS.prayers as Record<string, string>)[def.id] ?? '',
    }]);
    this.emit();
  }
}
