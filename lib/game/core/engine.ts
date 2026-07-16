import type { Enemy, Tower, Projectile, Point, EnemyType, TowerType, TargetingPriority, GlobalUpgrades, PrayerType, Element, AncientType, MageMode, SupportSpell, DotKind, Effect, CombatStyle } from '../types';
import { SPAWN_ANIM_SECONDS } from '../types';
import { SPOTANIMS, spotAnimDurationS } from '../data/spotanims';
import { resolveImpactTheme, IMPACT_RECIPES, type ImpactTheme } from '../systems/impact-fx';
import { ENEMY_ANIMS, clipDurationS, type EnemyClip } from '../data/enemy-anims';
import { ENEMIES } from '../data/enemies';
import { TOWERS, TOWER_STYLES } from '../data/towers';
import { LANDMARK_WAVES, type WaveConfig } from '../data/waves';
import { ASSETS } from '../assets';
import { distance, distanceSq, isValidPlacement, squareRange, inSquareRange, knockbackStep } from '../systems/geometry';
import { selectTarget } from '../systems/targeting';
import { scaleEnemyStats } from '../systems/enemy-scaling';
import { buildWaveConfigs } from '../systems/wave-generation';
import { calculateTowerStats, synergyDamageMult, utilityAuraBonus, type ComputedTowerStats, type TowerSynergy } from '../systems/tower-combat';
import { CombatStatsSystem, RUN_FX_ID, type DamageSource, type AuraAttribution, type TowerIdentity, type DpsSnapshot } from '../systems/combat-stats';
import { ELEMENTS, ANCIENTS, ELEMENT_ORDER, ANCIENT_ORDER, SUPPORT_ORDER, SUPPORT_SPELLS, weaknessMultiplier, lifestealChance, bloodBonusFrac, bloodBonusCap, bloodBonus, ancientHit, spellSpriteName, upgradeCostFor, BARRAGE_SPLASH_FALLOFF, TICK_SECONDS, AIR_KNOCKBACK, tzhaarKnockback, tzhaarStun } from '../systems/magic';
import { goldForKill, waveClearBonus } from '../systems/rewards';
import { debuffTenacity } from '../systems/tenacity';
import { archerArrowCount, bowAntiTankMult, cannonBlastRadius, slayerWeaponBonus, venomRamp } from '../systems/tower-identity';
import { GameRenderer } from './renderer';
import { SoundManager, GAME_SOUNDS } from './sound';
import { SlayerSystem } from '../systems/slayer-system';
import { PrayerSystem, MAX_PRAYER_WARDS } from '../systems/prayer-system';
import { GeSystem, type GeListing } from '../systems/ge-system';
import { MetaSystem, type MetaLoad } from '../systems/meta-system';
import { essenceForWave } from '../systems/meta-progression';
import { rollDraft, availableCards, cardRollCost, DRAFT_POOL, RARITY_WEIGHT, BOOSTED_RARITY_WEIGHT, type DraftCard, type DraftEffect } from '../systems/roguelite-draft';
import {
  rollRelicChoice, shouldExecute, interestGain, RELICS,
  type Relic, type RelicEffect,
} from '../systems/relics';
import { RUN_SAVE_VERSION, type RunSave } from '../systems/run-save';
import {
  rollAffixes, rollBossAffixes, affixSpeedMult, affixSpawnHpMult, affixRenderScaleMult, shieldHpFor,
  regenPerSec, leakLifeCost, bossLeakCost, SUPERIOR_LEAK_COST, isCcImmune, styleDamageMult, absorbWithShield, rollArmoredStyle,
  ALL_AFFIXES, SWARM_COUNT, VOLATILE_STUN_SECS,
  type EnemyAffix, type AffixRoll,
} from '../systems/affixes';
import { rollWaveEvent, resolveEventMods, type WaveEvent } from '../systems/wave-events';
import {
  freshBossState, bossStyleMult, zulrahPhaseIndex, recentDamageSum, pruneDamageEvents, jadHealPerTick,
  ZULRAH_PHASES, VORKATH_ICE_INTERVAL, VORKATH_ICE_DURATION,
  JAD_HEAL_THRESHOLD, JAD_HEALER_COUNT, JAD_HEALER_HP_FRAC, JAD_HEAL_WINDOW_SECS,
  JAD_HEAL_TICK_SECS, JAD_RESUMMON_COOLDOWN,
  hydraPhase, hydraShouldVent, hydraBreakTarget, hydraVentCredit, hydraVentHeal, hydraIsEnraged, hydraZapChain,
  HYDRA_VENT_SECS, HYDRA_VENT_COOLDOWN_SECS, HYDRA_SHATTER_VULN_SECS, HYDRA_ENRAGE_SPEED_MULT,
  HYDRA_ZAP_CHAIN, HYDRA_ZAP_DISABLE_SECS, HYDRA_ENRAGE_ZAP_SECS,
  moleBurrowInterval, moleBurrowTarget, moleIsHidden, moleIsBurrowing,
  MOLE_DIG_SECS, MOLE_UNDER_SECS, MOLE_EMERGE_SECS,
  stepBossStall, stallTenacityBonus, stallHealMult, escortDamageMult, type BossState,
  isGuardian, guardianReviveHp,
  GUARDIAN_REVIVE_SECS, GUARDIAN_ENRAGE_SPEED_MULT, GUARDIAN_PAIR_OFFSET,
  cerberusShouldSummon, cerberusIsEnraged, soulAnimSlug,
  SOUL_STYLES, CERBERUS_SOUL_HP_FRAC, CERBERUS_SOUL_ORBIT, CERBERUS_ENRAGE_SPEED_MULT,
  MECHANIC_BOSSES,
  type BossId,
} from '../systems/boss-mechanics';
import { PRAYERS, TOWER_PRAYERS } from '../data/prayers';
import { prayerUnlockWave } from '../systems/prayer';
import { generateMapLayout, type MapLayout } from '../systems/map-generation';
import { BIOMES, pickBiome, nextBiome, type BiomeDef } from '../data/biomes';
import { SLAYER_REWARDS, type SlayerReward } from '../data/slayer';

/**
 * The board's one and only resolution — 54×24 whole tiles. Every player gets this
 * exact board, whatever their screen, window or `devicePixelRatio`: the map, the
 * road, the tower ranges and the enemy speeds are all in these units, so a wider
 * window must never mean a wider map or a proportionally shorter range. The page
 * only scales the finished picture (see `GameRoot`'s board container).
 *
 * The 2.25:1 (9:4) aspect sits near a maximised browser's real play area — a
 * landscape window minus its chrome and our fixed bottom bar — so little space is
 * left over beside it. Piece sizes are fixed logic pixels (a 30px enemy, a 1-tile
 * road), so keeping the tile count modest is what keeps them readable on screen:
 * 24 rows means a tile is ~1/24 of the board's height, not ~1/32.
 */
export const LOGIC_WIDTH = 1728;
export const LOGIC_HEIGHT = 768;
const GRID = 32;
const TOWER_RADIUS = 15;
const START_MONEY = 200;
const START_LIVES = 20;

/** One entry in a collection-log-style "unlock" popup. The `kind` union is the
 *  extension point — prayers fire today; towers/spells/achievements can reuse
 *  the same popup by adding a kind + a producer that calls `announceUnlocks`. */
export interface UnlockItem {
  kind: 'prayer';
  name: string;
  desc: string;
  icon: string;
}

/** Flat, cloneable snapshot the engine pushes to React. */
/** Which mode the run is played in. `classic` is plain tower-defense; `roguelite`
 *  adds {@link DraftCard} hands bought with gold, plus a relic for each boss. */
export type GameMode = 'classic' | 'roguelite';

/** Per-combat-style multiplier (1 = no change). A "general" draft buff bumps all
 *  three; a styled one (e.g. a Strength Potion → melee) bumps only its style. */
export interface StyleMods {
  melee: number;
  ranged: number;
  magic: number;
}

/** Run-scoped multipliers granted by roguelite drafts, split by combat style so a
 *  card can buff melee / ranged / magic towers independently (or all three, when
 *  "general"). All default to 1 and reset on {@link GameEngine.restart}; they
 *  layer onto every tower in the combat pipe, keyed off the tower's style. */
export interface RunModifiers {
  damage: StyleMods;
  range: StyleMods;
  fireRate: StyleMods;
}

const freshStyleMods = (): StyleMods => ({ melee: 1, ranged: 1, magic: 1 });
export const freshRunMods = (): RunModifiers => ({
  damage: freshStyleMods(),
  range: freshStyleMods(),
  fireRate: freshStyleMods(),
});
const cloneRunMods = (m: RunModifiers): RunModifiers => ({
  damage: { ...m.damage },
  range: { ...m.range },
  fireRate: { ...m.fireRate },
});

/** Run-scoped BEHAVIOURAL effects granted by roguelite drafts — each changes a
 *  rule of the run (not a stat) and is read at a dedicated engine hook. Null /
 *  0 / 1 means "off". Reset on {@link GameEngine.restart}; not emitted to the UI
 *  (cards explain themselves), but their bookkeeping counters live here too. */
export interface RunEffects {
  // on-kill chain reactions
  ricochet: { frac: number; radius: number } | null;
  overkill: { radius: number } | null;
  soulSplitEvery: number;                              // 0 = off
  killStreak: { every: number; damage: number } | null;
  killTally: number;                                   // lifetime kills, drives the two above
  // risk / reward curses
  lastStand: { belowLives: number; mult: number } | null;
  berserkerPerLife: number;                            // 0 = off
  bloodPactMult: number;                               // 1 = off (also flips the per-wave life cost on)
  bloodPact: boolean;                                  // whether the per-wave life cost applies
  enemyHpMult: number;                                 // 1 = off (greed)
  goldMult: number;                                    // 1 = off (greed)
  // tower transformations
  doubleShot: boolean;
  venomTips: { dps: number; dur: number } | null;
  chainFreezeRadius: number;                           // 0 = off
  pierce: { radius: number } | null;
  // placement synergies (per-tower damage from the field layout)
  synergy: TowerSynergy;
  // magic spellbook specialisations — per-wizard-subtype stat multipliers (1 = off)
  mageBuff: Record<MageMode, { damage: number; range: number; fireRate: number }>;
}
/** Aura tint per placement-synergy, for the renderer's buffed-tower glow. */
const SYNERGY_COLORS = {
  packTactics: '#57d957', // green — rally same kinds
  trinity: '#ffd257',     // gold — balanced triangle
  vanguard: '#ff7a3c',    // orange — frontline
  loneWolf: '#5ec8ff',    // cyan — solo
} as const;
const freshRunEffects = (): RunEffects => ({
  ricochet: null,
  overkill: null,
  soulSplitEvery: 0,
  killStreak: null,
  killTally: 0,
  lastStand: null,
  berserkerPerLife: 0,
  bloodPactMult: 1,
  bloodPact: false,
  enemyHpMult: 1,
  goldMult: 1,
  doubleShot: false,
  venomTips: null,
  chainFreezeRadius: 0,
  pierce: null,
  synergy: { packTactics: null, trinity: null, vanguard: null, loneWolf: null },
  mageBuff: {
    elemental: { damage: 1, range: 1, fireRate: 1 },
    ancients: { damage: 1, range: 1, fireRate: 1 },
    utility: { damage: 1, range: 1, fireRate: 1 },
  },
});

/** Run-scoped state from owned {@link Relic}s whose mechanics aren't covered by
 *  {@link RunModifiers} / {@link RunEffects}. (A relic's stat buffs fold into
 *  those buckets at pickup; only its *relic-only* hooks live here.) Reset on
 *  {@link GameEngine.restart}. */
export interface RelicEffects {
  /** Execute threshold: a non-boss at/below this fraction of max HP is slain
   *  outright. 0 = off (no Executioner relic). */
  executeFrac: number;
  /** Banker's Note interest paid per wave clear, or null when not owned. */
  interest: { rate: number; cap: number } | null;
  /** Draft re-rolls granted per wave (Trickster). */
  rerollsPerWave: number;
  /** Extra cards every draft hand offers (Production Prodigy). */
  handBonus: number;
  /** Remaining cheat-death charges (Last Recall): a lethal leak spends one. */
  cheatDeathLeft: number;
}
const freshRelicEffects = (): RelicEffects => ({
  executeFrac: 0,
  interest: null,
  rerollsPerWave: 0,
  handBonus: 0,
  cheatDeathLeft: 0,
});

/** One monster line in the next-wave preview (Start Wave hover). Plain data; the
 *  UI resolves the sprite from `type`. */
export interface WavePreviewEntry {
  type: EnemyType;
  name: string;
  count: number;
  isBoss: boolean;
  /** Stats as this wave will actually spawn them — the base def run through the
   *  wave scaling, so the hover reads the numbers the player is about to face, not
   *  the wave-1 ones. Affixes are rolled at spawn and deliberately not previewed. */
  hp: number;
  speed: number;
  reward: number;
  weakness?: Element;
}

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
  /** Makeup of the wave the Start Wave button will launch (drives its hover
   *  preview). Aggregated per enemy type, regular monsters first then any boss.
   *  Empty while a wave is active or on game over; deterministic — it matches
   *  exactly what {@link GameEngine.startWave} then spawns. */
  wavePreview: WavePreviewEntry[];
  /** The active wave event (#1) for the current wave, or null when none. A
   *  cloneable view (the engine holds the full {@link WaveEvent}). Drives the
   *  banner that announces the wave's board-wide twist. */
  activeEvent: { id: string; name: string; desc: string; tone: string; color: string; icon: string } | null;
  /** Whether a boss is currently alive on the field (its HP bar is showing). */
  bossOnField: boolean;
  gameOver: boolean;
  selectedTowerType: TowerType | null;
  selectedTowerId: string | null;
  /** Marquee multi-selection (tower ids) for the batch-upgrade panel. */
  multiSelectedIds: string[];
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
  /** Accumulated Slayer points (spendable in the Slayer Rewards shop). */
  slayerPoints: number;
  /** Completed-task streak. */
  slayerStreak: number;
  /** Name of the Slayer master that would assign the next task. */
  slayerMaster: string;
  /** Whether the Slayer Helmet (on-task damage bonus) is owned this run. */
  slayerHelmet: boolean;
  /** Ids of the one-time Slayer-shop unlocks bought this run (helm, imbue,
   *  Bigger and Badder) — the shop greys them out. */
  slayerUnlocks: string[];
  /** Monsters blocked out of the task rotation this run. */
  slayerBlocked: EnemyType[];
  /** Current prayer points (rounded). */
  prayerPoints: number;
  /** Maximum prayer points. */
  prayerMax: number;
  /** Currently active prayers (cloneable list). */
  activePrayers: PrayerType[];
  /** Grand Exchange stock with live prices + active-buff timers. */
  geOffers: GeListing[];
  /** Persistent Rune Essence balance (meta-progression currency). */
  essence: number;
  /** Bought global upgrades that seed every run (Essence Shop). */
  upgrades: GlobalUpgrades;
  /** Most recent batch of unlocks to celebrate with a popup (may be several at
   *  once, e.g. two prayers gating on the same wave). */
  unlocks: UnlockItem[];
  /** Bumps whenever a new unlock batch fires, so the UI enqueues it once. */
  unlockSeq: number;
  /** DPS-panel snapshot: a plain per-tower damage/effect tree for the current run,
   *  pushed only while the panel is open (null otherwise). See CombatStatsSystem. */
  dpsStats?: DpsSnapshot | null;
  /** Lifetime kills per enemy type (the Collection Log). */
  killCounts: Record<string, number>;
  /** Lifetime sighting count per boss type. A boss only rolls modifiers once it
   *  has appeared at least once, so a first encounter is always the "vanilla"
   *  fight; the count also ramps the lives a boss costs when it leaks. */
  bossesSeen: Record<string, number>;
  /** Lifetime pick counts per draft-card id (the Collection Log "Cards" tab). */
  cardCounts: Record<string, number>;
  /** True when the wave that just ended was a debug "custom wave" sandbox, so the
   *  UI can show a distinct "Custom Wave Complete!" banner. Reset when any wave
   *  starts. */
  lastWaveSandbox: boolean;
  /** Active game mode (`classic` / `roguelite`). */
  gameMode: GameMode;
  /** Roguelite: the draft hand awaiting a pick — bought with gold, or a defeated
   *  boss's boosted hand (null when none). Blocks the next wave until resolved. */
  pendingDraft: DraftCard[] | null;
  /** Roguelite: whether the open hand rolled on the boss's boosted odds (the UI
   *  bills it as the boss's prize rather than a shop roll). */
  draftBoosted: boolean;
  /** Roguelite: gold price of the next card roll (rises with each one bought). */
  cardRollCost: number;
  /** Roguelite: the accumulated run-scoped buffs from drafts (for the UI). */
  runMods: RunModifiers;
  /** Roguelite: cards drafted this run (id + stack count, in pick order) — the
   *  active-relics / build panel resolves each id against the draft pool. */
  runCards: { id: string; count: number }[];
  /** Roguelite: a relic choice offered by a defeated boss, awaiting a pick (null
   *  when none). Like {@link pendingDraft} it blocks the next wave until resolved.
   *  A cloneable view (the engine holds the full {@link Relic}). */
  pendingRelics: { id: string; name: string; desc: string; tier: string; icon: string }[] | null;
  /** Roguelite: ids of the relics owned this run, in pick order. */
  ownedRelics: string[];
  /** Roguelite: re-rolls left on the current draft hand (Trickster relic). */
  draftRerolls: number;
  /** Debug autoplay state (toggle + delay in seconds). */
  autoplay: boolean;
  autoplaySecs: number;
  /** Player-facing name of the run's current biome (shown in the debug map tools). */
  biomeName: string;
  /** Bumps once per Blood-barrage life steal — the UI keys its ❤ pop off it. */
  lifestealSeq: number;
}

const uid = () => Math.random().toString(36).slice(2, 11);

/** Global throttle on the general gold flow (per-kill + wave-clear payouts) to
 *  keep the economy tight. Card gold is halved at the data layer instead, so it
 *  isn't double-cut here (both still route through {@link GameEngine.awardGold}). */
const GENERAL_GOLD_FACTOR = 0.5;

/** Approximate body radius (px) used for range/hit tests, matching the sprite size. */
const enemyRadius = (e: { isBoss?: boolean }) => (e.isBoss ? 28 : 13);

/** Clean a persisted Collection-Log blob: keep only known enemy types with a
 *  positive finite integer count, so a corrupt/stale save can't poison the log. */
function sanitizeKillCounts(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (raw && typeof raw === 'object') {
    for (const [type, v] of Object.entries(raw as Record<string, unknown>)) {
      if (type in ENEMIES && typeof v === 'number' && Number.isFinite(v) && v > 0) out[type] = Math.floor(v);
    }
  }
  return out;
}

/** Clean a persisted Cards-log blob: keep only known card ids with a positive
 *  finite integer pick count, so a corrupt/stale save can't poison the log. */
function sanitizeCardCounts(raw: unknown): Record<string, number> {
  const known = new Set(DRAFT_POOL.map(c => c.id));
  const out: Record<string, number> = {};
  if (raw && typeof raw === 'object') {
    for (const [id, v] of Object.entries(raw as Record<string, unknown>)) {
      if (known.has(id) && typeof v === 'number' && Number.isFinite(v) && v > 0) out[id] = Math.floor(v);
    }
  }
  return out;
}


/** Escort follow: how fast an escort's orbit slot drifts (rad/s), so a boss's companions
 *  circle it while trailing at a set distance, and the radius Jad's healers hold. */
const ESCORT_ORBIT_DRIFT = 0.5;
const JAD_HEALER_ORBIT = 82;

/** Kicked-up earth: the Giant Mole's dig, mound and surfacing all read in this. */
const MOLE_DUST = '#8a6b47';

/** The Grotesque Guardians' shared stone — the tether, the enrage and the revival. */
const GUARDIAN_LINK_COLOR = '#c9a227';

/** Clean a persisted "bosses seen" blob: keep only the mechanic bosses flagged true,
 *  so a corrupt/stale save can't gate modifiers on bad data. */
function sanitizeBossesSeen(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (raw && typeof raw === 'object') {
    for (const id of MECHANIC_BOSSES) {
      const v = (raw as Record<string, unknown>)[id];
      // Migrate the old boolean flag (`true` → 1) and coerce counts to a
      // non-negative integer.
      const n = v === true ? 1 : typeof v === 'number' && v > 0 ? Math.floor(v) : 0;
      if (n > 0) out[id] = n;
    }
  }
  return out;
}

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

/**
 * Flight-floor fallback (seconds) for a spell whose cast clip hasn't decoded yet
 * (only the very first cast, before `loadedmetadata` fires). This is the duration
 * of the shortest cast clip in the bundle (`cast_air_1.wav`), so the fallback can
 * never overshoot a real cast — measured from public/assets/sounds.
 */
const SHORTEST_CAST_S = 1.52;

/** Hitsplat colour, following the OSRS Template:Hitsplat palette: `hit` (red
 *  damage), `miss` (blue 0/block), `poison` (green), `venom` (dark green),
 *  `burn` (orange fire DoT), `heal` (purple). */
export type HitsplatKind = 'hit' | 'miss' | 'poison' | 'venom' | 'burn' | 'heal';

/** The damage-over-time kinds, ticked independently in `damageOverTime`. */
const DOT_KINDS: readonly DotKind[] = ['burn', 'poison', 'venom'];

/** Per-DoT-kind splat lane so multiple DoTs on one enemy fan out instead of
 *  overriding each other. `side` picks the horizontal side (-1 left, +1 right);
 *  `rise` picks the vertical sense (+1 up, -1 down). The four quadrants give room
 *  for new DoT kinds — burn=left/up, poison=right/up, venom=right/down, leaving
 *  left/down ({ side: -1, rise: -1 }) free for the next one. */
const DOT_LANE: Record<DotKind, { side: number; rise: number }> = {
  burn: { side: -1, rise: 1 },
  poison: { side: 1, rise: 1 },
  venom: { side: 1, rise: -1 },
};

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
  /** Vertical drift (px/s) for minor splats — per-kind lane (poison up, venom down). */
  vy?: number;
}

/** Live summary of the enemy under the pointer, for the hover info panel. */
/** Active debuff kinds shown as icons in the enemy hover panel. */
export type DebuffId = 'slow' | 'stun' | 'burn' | 'poison' | 'venom' | 'vuln';

export interface EnemyHoverInfo {
  name: string;
  hp: number;
  maxHp: number;
  speed: number;
  baseSpeed: number;
  /** The enemy type's natural (un-evented, un-affixed) speed — the panel flags a
   *  hastened/slowed enemy when {@link baseSpeed} differs from this. */
  naturalSpeed: number;
  weakness: Element | null;
  reward: number;
  isBoss: boolean;
  x: number;
  y: number;
  effects: DebuffId[];
  /** Crowd-control resistance, 0..1 (see `GameEngine.tenacity`). */
  tenacity: number;
  /** Rolled affixes/modifiers this enemy carries (for the info-panel badges). */
  affixes: EnemyAffix[];
  /** Combat style the `armored` affix resists, if rolled (badge tooltip detail). */
  armoredStyle?: CombatStyle;
}

/** A dying enemy's sprite, fading out where it fell. */
export interface DeathFx {
  x: number;
  y: number;
  type: string;
  /** Baked-clip override (e.g. a Jad healer dies as `yt_hurkot`, not its `imp`
   *  combat type); mirrors Enemy.animType. Falls back to `type` when unbaked. */
  animType?: string;
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
  /** Mystical accent: draw additively as a shimmering 4-point arcane spark (used
   *  by magic impacts) instead of a solid debris mote. */
  twinkle?: boolean;
}

/** Lightweight procedural VFX for the roguelite behavioural cards (expanding
 *  rings + energy bolts), separate from the baked spotanims. Each ages by `dt`
 *  and is culled once `age >= life`; purely visual, no game effect. */
export type RuneFx =
  | { kind: 'ring'; x: number; y: number; age: number; life: number; r0: number; r1: number; color: string; width: number }
  | { kind: 'bolt'; x0: number; y0: number; x1: number; y1: number; age: number; life: number; color: string };

const HITSPLAT_LIFE = 0.9;

/** Magic-impact sizing. The burst scales with the struck model's size (a boss's
 *  hit reads bigger than a rat's) around a halved baseline — the old effect was
 *  ~2× too large. Secondary (splash) targets render at a fraction so the smaller
 *  burst telegraphs their reduced damage. Each hit also gets a small random
 *  jitter so no two land identically. */
const IMPACT_BASE_SCALE = 0.5;   // halve the old footprint (normal enemy ≈ this)
const IMPACT_SPLASH_SCALE = 0.6; // splash-target burst vs the primary's

/** Ancients hit-GFX fit: drawn effect size as a multiple of the struck model's
 *  drawn body size. Ice is the proportion baseline — its freeze cube encases the
 *  whole NPC; shadow spans feet to just over the head, smoke billows a touch
 *  wider, blood hugs the body. The baked sheets keep an ~8%/side fit margin, so
 *  the multipliers overshoot 1 to land the visible GFX on the body. */
const ANCIENT_HIT_FIT: Record<string, number> = { ice: 1.3, smoke: 1.25, shadow: 1.15, blood: 1.05 };

export class GameEngine {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  private readonly renderer: GameRenderer;
  private readonly sound = new SoundManager(GAME_SOUNDS);
  private readonly onState: (patch: Partial<UIState>) => void;

  // --- world state ---
  path: Point[] = [];
  /** Seed for this run's procedural map (path + biome); re-rolled on restart. */
  private mapSeed = 0;
  /** Normalized ([0,1]) road layout for this run; `buildPath` snaps it to the grid. */
  private mapLayout: MapLayout = { points: [], columns: 0 };
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
  private synergyAuraCache: { version: number; auras: Map<string, { mult: number; color: string } | null> } | null = null;
  /** The current wave is a debug "custom wave" sandbox — its enemies don't affect
   *  the run (no rewards, no life loss, no wave advance). Set by
   *  {@link debugStartCustomWave}, cleared when the sandbox wave ends. */
  private sandboxWave = false;
  /** Whether the most recently ended wave was a sandbox custom wave (drives the
   *  "Custom Wave Complete!" banner). Cleared when any wave starts. */
  private lastWaveSandbox = false;

  /** Active game mode. Roguelite layers bought card rolls + boss relics over classic TD. Chosen
   *  before the first wave via {@link setMode}; persists across {@link restart}. */
  gameMode: GameMode = 'roguelite';
  /** Roguelite: the draft hand awaiting a pick after a wave clear (null = none). */
  pendingDraft: DraftCard[] | null = null;
  /** Roguelite: run-scoped buff multipliers accumulated from drafts. */
  runMods: RunModifiers = freshRunMods();
  /** Behavioural roguelite effects (chain-on-kill / curses / transforms). */
  runFx: RunEffects = freshRunEffects();
  /** Ids of `unique` cards drafted this run — excluded from later hands. */
  private draftedUnique = new Set<string>();
  /** Cards drafted this run, in pick order, with a stack count for repeatable
   *  ones — the source for the UI's active-relics / build panel. Resets per run. */
  runCards: { id: string; count: number }[] = [];
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
  private lifestealSeq = 0;

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
  /** Towers built this run (every successful {@link placeTower}); for the
   *  end-of-run summary. Not decremented on sell — it counts what you raised. */
  towersBuilt = 0;
  /** Rune Essence awarded *during this run* (wave clears + essence cards), kept
   *  separate from the persistent {@link MetaSystem} balance so the summary can
   *  show what the run earned. Reset on {@link restart}. */
  essenceEarnedThisRun = 0;

  /** Elapsed simulated seconds of the current run (for the summary's timer). */
  get runSeconds(): number {
    return this.gameTime;
  }
  /** Lifetime kills per enemy type (the Collection Log). Account-wide: seeded
   *  from the save, persisted by the UI, and NOT cleared on restart. */
  killCounts: Record<string, number> = {};
  cardCounts: Record<string, number> = {};
  /** Bosses encountered at least once (lifetime, persisted like killCounts).
   *  Gates boss modifiers — a boss is only "vanilla" on its first-ever sighting. */
  bossesSeen: Record<string, number> = {};
  private notice: string | null = null;
  private noticeIcon: string | null = null;
  private noticeSeq = 0;
  /** Latest unlock batch + a bump counter, drained into a popup queue by the UI. */
  private unlocks: UnlockItem[] = [];
  private unlockSeq = 0;

  // --- composed subsystems ---
  readonly slayer = new SlayerSystem(this);
  readonly prayer = new PrayerSystem(this);
  readonly ge = new GeSystem(this);
  /** Per-run damage accounting for the DPS panel; identity is resolved live off
   *  the current tower so it tracks upgrades and survives a sold tower. */
  readonly stats = new CombatStatsSystem((id) => this.towerIdentity(id));
  /** Persistent meta-progression (essence + bought upgrades); seeded from the
   *  saved blob in the constructor and kept across {@link restart}. */
  readonly meta: MetaSystem;

  /** Logic dimensions (canvas internal resolution). Constant, on every machine. */
  readonly width = LOGIC_WIDTH;
  readonly height = LOGIC_HEIGHT;

  // --- spawn/loop bookkeeping ---
  private spawnQueue: Enemy[] = [];
  /** Memoised makeup of the upcoming wave, keyed by (wave, current Slayer task)
   *  so the Start Wave preview is stable across emits/hovers and {@link startWave}
   *  spawns exactly what was shown. Recomputed only when the wave advances or the
   *  task changes (e.g. a Slayer skip). */
  private previewCache: { wave: number; task: EnemyType | null; configs: WaveConfig[] } | null = null;
  private spawnTimer = 0;
  private readonly spawnInterval = 0.7; // seconds between spawns
  private rafId = 0;
  private lastTime = 0;
  private gameTime = 0; // accumulated simulated seconds (drives cooldowns)

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
    this.canvas.width = this.width;
    this.canvas.height = this.height;
    this.generateMap();
    this.preloadImages();
    this.slayer.assignTask(); // auto-assign the first Slayer task
    this.emit();
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
        // Wall-clock, so it must sit outside the sub-step loop and take the raw dt.
        this.tickAutoplay(dt);
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
      wavePreview: this.wavePreview(),
      activeEvent: this.activeEvent
        ? { id: this.activeEvent.id, name: this.activeEvent.name, desc: this.activeEvent.desc,
            tone: this.activeEvent.tone, color: this.activeEvent.color, icon: this.activeEvent.icon }
        : null,
      bossOnField: this.enemies.some(e => e.isBoss),
      gameOver: this.gameOver,
      selectedTowerType: this.selectedTowerType,
      selectedTowerId: this.selectedTowerId,
      multiSelectedIds: [...this.multiSelectedIds],
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
      killCounts: this.killCounts,
      cardCounts: this.cardCounts,
      bossesSeen: this.bossesSeen,
      lastWaveSandbox: this.lastWaveSandbox,
      gameMode: this.gameMode,
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
    });
  }

  /** Fire a collection-log-style unlock popup batch. Generic on purpose: any
   *  future producer (towers, spells, achievements) can call this with its own
   *  {@link UnlockItem}s. Caller is responsible for the follow-up `emit`. */
  private announceUnlocks(items: UnlockItem[]) {
    if (items.length === 0) return;
    this.unlocks = items;
    this.unlockSeq++;
    this.sound.play('interface_open');
  }

  /** Tower prayers that just came online at the current wave — the popup
   *  producer for prayer unlocks (called right after the wave increments). */
  private checkPrayerUnlocks() {
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

  private pushDpsStats(dt: number) {
    if (!this.dpsPanelOpen) return;
    this.dpsPushTimer += dt;
    if (this.dpsPushTimer < 0.25) return; // ~4 Hz
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
  private eventTowerMods() {
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
      synergy: this.runFx.synergy,
      portal: this.portalPoint,
      mageBuff: this.runFx.mageBuff,
      globalMods: this.eventTowerMods(),
    });
  }

  /** Invalidate the cached synergy-aura glows — call whenever the tower layout or
   *  synergy config changes (place / sell / move / synergy draft / restart). */
  private bumpTowerLayout() { this.towerLayoutVersion++; this.synergyAuraCache = null; }

  /** The placement-synergy buff a tower is enjoying right now, for the renderer's
   *  aura: the total damage multiplier (>1) and the colour of the *dominant*
   *  contributing synergy. null when none applies (or not in roguelite mode).
   *  Cached per {@link towerLayoutVersion} so the O(n²) synergy scan runs once per
   *  layout change, not once per tower every frame (the value is time-invariant —
   *  only the glow's pulse, applied at draw time, animates). */
  towerSynergyAura(tower: Tower): { mult: number; color: string } | null {
    if (this.gameMode !== 'roguelite') return null;
    if (!this.synergyAuraCache || this.synergyAuraCache.version !== this.towerLayoutVersion) {
      this.synergyAuraCache = { version: this.towerLayoutVersion, auras: this.computeSynergyAuras() };
    }
    return this.synergyAuraCache.auras.get(tower.id) ?? null;
  }

  /** Compute every tower's dominant synergy aura in one pass (still O(n²) in the
   *  worst case, but run only on a layout change — see {@link towerSynergyAura}).
   *  Short-circuits to all-null when no synergy card is active at all. */
  private computeSynergyAuras(): Map<string, { mult: number; color: string } | null> {
    const map = new Map<string, { mult: number; color: string } | null>();
    const syn = this.runFx.synergy;
    const anyActive = !!(syn.packTactics || syn.trinity || syn.vanguard || syn.loneWolf);
    for (const tower of this.towers) {
      if (!anyActive) { map.set(tower.id, null); continue; }
      const total = synergyDamageMult(tower, this.towers, syn, this.portalPoint);
      if (total <= 1.001) { map.set(tower.id, null); continue; }
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
      equipment: { weapon: null, shield: null, accessory: null },
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
    this.path = [
      { x: -GRID, y: pts[0].y }, // off-screen entry stub at the first turn's row
      ...pts,
      { x: this.width + GRID, y: pts[pts.length - 1].y }, // off-screen exit stub
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
      name: e.name,
      hp: Math.max(0, Math.ceil(e.hp)),
      maxHp: e.maxHp,
      speed: Math.round(e.speed),
      baseSpeed: Math.round(e.baseSpeed),
      naturalSpeed: Math.round(e.naturalSpeed ?? e.baseSpeed),
      weakness: e.weakness && e.weakness !== 'none' ? e.weakness : null,
      reward: this.effectiveKillGold(e.type),
      isBoss: !!e.isBoss,
      x: e.x,
      y: e.y,
      effects,
      tenacity: this.tenacity(e),
      affixes: e.affixes ?? [],
      armoredStyle: e.armoredStyle,
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

  towerCost(type: TowerType): number {
    const base = TOWERS[type]?.tiers[0].upgradeCost ?? 0;
    return Math.ceil(base * this.meta.upgrades.towerCostReduction);
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
  private killGoldPreReward(type: EnemyType): number {
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
  private awardGold(base: number): number {
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
    this.bumpTowerLayout(); // position changed → synergy auras may shift
    this.emit();
  }

  /** Handle a click in logic space: move/place a tower or select/deselect one.
   *  `keepPlacing` (Shift-click) keeps the tower type selected after a successful
   *  build so several can be dropped in a row. */
  handleClick(x: number, y: number, keepPlacing = false) {
    this.multiSelectedIds = []; // any normal click drops a marquee selection
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

  placeTower(type: TowerType, x: number, y: number, keepPlacing = false) {
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
      upgradeCost: upgradeCostFor(def.tiers[1]?.upgradeCost ?? 0, type === 'wizard' ? this.pendingMageMode : undefined),
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
    this.towersBuilt += 1;
    this.bumpTowerLayout();
    // No build SFX for now — the old fireworks read as a celebration; per-tower
    // construction sounds are a future pick.
    // Shift-place keeps the type selected so the next click drops another.
    if (!keepPlacing) this.selectedTowerType = null;
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
      if (t && t.level < t.maxLevel) { count++; cost += t.upgradeCost; }
    }
    return { count, cost };
  }

  /** Upgrade each selected tower one tier, in selection order, spending gold until
   *  it runs out (a partial batch still upgrades as many as affordable). */
  upgradeMultiSelected() {
    let any = false;
    for (const id of [...this.multiSelectedIds]) {
      const t = this.towers.find(tw => tw.id === id);
      if (!t || t.level >= t.maxLevel || this.money < t.upgradeCost) continue;
      this.upgradeTower(id);
      any = true;
    }
    if (!any) this.notify('Not enough gold');
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
    this.bumpTowerLayout();
    if (this.selectedTowerId === towerId) this.selectedTowerId = null;
    if (this.movingTowerId === towerId) this.movingTowerId = null;
    this.sound.play('sell');
    this.emit();
  }

  /** Resolve (and memoise) the upcoming wave's `{type,count}` makeup. Pure aside
   *  from the cache: it assigns no task and fires no notifications, so it is safe
   *  to call from a UI hover or on every emit. Keyed by (wave, current task) so a
   *  Slayer skip refreshes it; {@link startWave} consumes the same result so the
   *  preview always matches what actually spawns. */
  private computeWaveConfigs(): WaveConfig[] {
    const taskType = this.slayer.task?.type ?? null;
    if (this.previewCache && this.previewCache.wave === this.wave && this.previewCache.task === taskType) {
      return this.previewCache.configs;
    }
    const configs = buildWaveConfigs(this.wave, {
      enemies: Object.values(ENEMIES),
      blockedEnemies: [],
      landmark: LANDMARK_WAVES[this.wave],
      // Seed the active Slayer-task target so its enemies keep spawning —
      // the fail-safe against a task whose monster has dropped out of waves.
      slayerTask: this.slayer.task,
      // Drives the boss schedule: which boss is still unmet (so a new account meets
      // them in order), and whether the random / extra-boss endgame has unlocked.
      bossesSeen: this.bossesSeen,
    });
    this.previewCache = { wave: this.wave, task: taskType, configs };
    return configs;
  }

  /** Plain-data view of the upcoming wave for the Start Wave hover: aggregated
   *  per enemy type, regular monsters first then any boss. Empty during a wave /
   *  on game over. */
  private wavePreview(): WavePreviewEntry[] {
    if (this.waveActive || this.gameOver) return [];
    const totals = new Map<EnemyType, number>();
    for (const c of this.computeWaveConfigs()) {
      const t = c.type as EnemyType;
      totals.set(t, (totals.get(t) ?? 0) + c.count);
    }
    const rows: WavePreviewEntry[] = [];
    for (const [type, count] of totals) {
      const def = ENEMIES[type];
      // Scale to the wave being previewed, exactly as makeEnemy will when it spawns.
      const s = def
        ? scaleEnemyStats({ hp: def.hp, speed: def.speed, reward: def.reward }, this.wave)
        : { hp: 0, speed: 0, reward: 0 };
      rows.push({
        type, name: def?.name ?? type, count, isBoss: !!def?.isBoss,
        hp: s.hp, speed: s.speed, reward: s.reward, weakness: def?.weakness,
      });
    }
    // Regular monsters first (largest packs first), any boss headlining at the end.
    rows.sort((a, b) => (a.isBoss ? 1 : 0) - (b.isBoss ? 1 : 0) || b.count - a.count);
    return rows;
  }

  startWave() {
    if (this.waveActive || this.gameOver) return;
    if (this.pendingRelics) { this.notify('Choose a relic first'); return; }
    if (this.pendingDraft) { this.notify('Choose a draft card first'); return; }
    this.slayer.assignTask(); // idempotent: ensure a task exists so it can seed the wave
    // Spawn exactly what the Start Wave hover previewed. assignTask above may have
    // just rolled a task — that changes the cache key, so this recomputes with the
    // Slayer seed folded in; otherwise it reuses the memoised makeup.
    const configs = this.computeWaveConfigs();
    // A boss wave stays the headline act — no event rolls on it (see wave-events).
    const bossWave = configs.some(c => ENEMIES[c.type]?.isBoss);
    this.activeEvent = rollWaveEvent(this.wave, bossWave, Math.random);
    this.spawnQueue = this.buildWaveEnemies(configs, this.wave);
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

  // --------------------------------------------------------------- wave build
  /** Build the spawn queue from resolved wave configs, folding in the active
   *  event's enemy-count multiplier (Infestation swells the horde). */
  private buildWaveEnemies(configs: WaveConfig[], wave: number): Enemy[] {
    const countMult = resolveEventMods(this.activeEvent).enemyCount;
    const out: Enemy[] = [];
    for (const cfg of configs) {
      // Bosses/uniques (count 1) are never multiplied — only the rank-and-file swell.
      const count = cfg.count > 1 ? Math.max(1, Math.round(cfg.count * countMult)) : cfg.count;
      for (let i = 0; i < count; i++) {
        const enemy = this.makeEnemy(cfg.type, wave);
        if (!enemy) continue;
        out.push(enemy);
        // Swarm affix: the rolled enemy arrives as a pack of frail copies (its HP
        // was already halved in makeEnemy); clone it into a full trio.
        if (enemy.affixes?.includes('swarm')) {
          for (let k = 1; k < SWARM_COUNT; k++) {
            out.push({ ...enemy, id: uid(), affixes: enemy.affixes ? [...enemy.affixes] : undefined });
          }
        }
      }
    }
    return out;
  }

  private makeEnemy(type: EnemyType, wave: number, forced?: AffixRoll): Enemy | null {
    const def = ENEMIES[type];
    if (!def) return null;
    const scaled = scaleEnemyStats({ hp: def.hp, speed: def.speed, reward: def.reward }, wave);
    const start = this.portalPoint;
    // `forced` (debug cheats) wins outright — it bypasses the seen-gate and the
    // elite roll so a tester can dial in exact modifiers. Otherwise: bosses roll
    // the boss-modifier set only once they've been seen at least once (their
    // first-ever encounter is the clean, mechanic-only fight); normal enemies roll
    // the standard elite affixes.
    const roll = forced ?? (def.isBoss
      ? (this.bossesSeen[type] ? rollBossAffixes(Math.random, wave) : { affixes: [] })
      : rollAffixes(wave, false, Math.random));
    const affixes = roll.affixes;
    const bossKind = def.isBoss && (MECHANIC_BOSSES as readonly string[]).includes(type)
      ? (type as BossId) : undefined;
    // Greed curse (×enemyHpMult) compounds with the affix spawn-HP multiplier
    // (swarm frail / colossal tanky) and the active wave event (Iron Tide tougher /
    // Infestation frail). Speed folds in its affixes and the event too (Frenzy).
    const ev = resolveEventMods(this.activeEvent);
    const hp = Math.max(1, Math.round(scaled.hp * this.runFx.enemyHpMult * affixSpawnHpMult(affixes) * ev.enemyHp));
    const naturalSpeed = Math.max(1, Math.round(scaled.speed));
    const speed = Math.max(1, Math.round(scaled.speed * affixSpeedMult(affixes) * ev.enemySpeed));
    const shieldHp = shieldHpFor(affixes, hp);
    return {
      ...def,
      id: uid(),
      x: start.x,
      y: start.y,
      hp,
      maxHp: hp,
      speed,
      baseSpeed: speed,
      naturalSpeed,
      reward: scaled.reward,
      renderScale: (def.renderScale ?? 1) * affixRenderScaleMult(affixes),
      pathIndex: 0,
      slowTimer: 0,
      stunTimer: 0,
      tauntTimer: 0,
      groundTimer: 0,
      animTime: 0,
      affixes: affixes.length ? affixes : undefined,
      armoredStyle: roll.armoredStyle,
      shieldHp: shieldHp > 0 ? shieldHp : undefined,
      bossState: bossKind ? freshBossState(bossKind) : undefined,
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
    this.updateUtilityTowers();
    this.recordCombatTime(dt);
    this.moveProjectiles(dt);
    this.handleBossMechanics(dt);
    this.updateEffects(dt);
    this.checkWaveEnd();
    this.pushDpsStats(dt);
  }

  /** DPS meter: bank engagement time. A tower's own combat seconds tick while it
   *  has a target during a live wave (the DPS-rate denominator); the board-wide
   *  wave-combat clock ticks while ANY damage-dealing tower is engaging, and backs
   *  the DPS rate for Utility / Run-FX rows that have no engagement time. */
  private recordCombatTime(dt: number) {
    if (!this.waveActive || dt <= 0) return;
    let anyEngaging = false;
    for (const t of this.towers) {
      if (t.targetId === null) continue;
      if (t.type === 'wizard' && t.mageMode === 'utility') continue; // utility never targets
      this.stats.addCombatTime(t.id, this.wave, dt);
      anyEngaging = true;
    }
    if (anyEngaging) this.stats.addWaveCombat(this.wave, dt);
  }

  /**
   * Drive the signature boss phases each frame (#4B). Zulrah rotates its weak
   * style; Vorkath raises a periodic ice shield (immune + freezes a tower); Jad
   * summons Yt-HurKot healers below half HP that claw back his recent damage
   * until killed. Pure phase maths live in `systems/boss-mechanics`; this owns
   * the timers, the healer entities, and the telegraph VFX.
   */
  private handleBossMechanics(dt: number) {
    // Orphaned escorts (their boss died or leaked) serve no purpose, and since they
    // never walk the path they would otherwise sit there forever and block the wave
    // from ending. Keyed on the owner, so it holds for every kind of companion.
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (e.escort && !this.enemies.some(o => o.id === e.ownerId)) this.enemies.splice(i, 1);
    }
    for (const e of this.enemies) {
      const st = e.bossState;
      if (!st) continue;
      st.timer += dt;
      this.stepStall(e, st, dt);
      if (st.kind === 'zulrah') {
        const idx = zulrahPhaseIndex(st.timer);
        if (idx !== st.phaseIndex) {
          st.phaseIndex = idx;
          // A coloured shockwave in the new form's tint as it morphs.
          const pc = ZULRAH_PHASES[idx % ZULRAH_PHASES.length].color;
          this.addRing(e.x, e.y, 8, 60, pc, 0.5, 4);
          this.sound.play('wave', 55); // the teleport "vwoop" reads as a morph
        }
      } else if (st.kind === 'vorkath') {
        this.updateVorkath(e, dt);
      } else if (st.kind === 'jad') {
        this.updateJad(e, dt);
      } else if (st.kind === 'hydra') {
        this.updateHydra(e, dt);
      } else if (st.kind === 'giant_mole') {
        this.updateMole(e, dt);
      } else if (isGuardian(st.kind)) {
        this.updateGuardian(e, dt);
      } else if (st.kind === 'cerberus') {
        this.updateCerberus(e, dt);
      }
    }
  }

  /**
   * Advance a boss's stall clock — the guarantee that every boss fight *ends*.
   *
   * A board with control but no damage can otherwise hold a boss in place forever: it
   * never reaches the base (so the player never loses), it never dies (so they never
   * win), the wave never ends, and no gold comes in to build out of it. That is a run
   * with no exit, and a player who hits it has to reload and throw the run away.
   *
   * So the clock watches the one thing that decides the fight: is the boss being driven
   * to a new low? While it is, nothing happens here — a slow grind is still a win and
   * gets left alone. When it isn't, the boss starts shrugging off control and its
   * healing dries up, until it is either dead or walking. Both are endings.
   */
  private stepStall(e: Enemy, st: BossState, dt: number) {
    const before = st.stallStacks ?? 0;
    const next = stepBossStall(
      { hpFloor: st.hpFloor ?? 1, stallTimer: st.stallTimer ?? 0, stallStacks: before },
      e.hp / e.maxHp,
      dt,
    );
    st.hpFloor = next.hpFloor;
    st.stallTimer = next.stallTimer;
    st.stallStacks = next.stallStacks;

    if (next.stallStacks <= before) return;
    // Announce only the first stack — after that the boss bar carries the count, and a
    // toast every five seconds would bury the mechanic it is trying to explain.
    if (before === 0) {
      this.notify(`${e.name} is breaking free of your control!`);
      this.sound.play('wave', 60);
    }
    this.addRing(e.x, e.y, 8, 72, '#ffcb05', 0.4, 3);
  }

  /**
   * Cerberus: the style-lock check. At each HP threshold he summons his three Summoned
   * Souls, and **each soul locks one combat style** — while the melee soul lives, melee
   * towers barely scratch him (see `soulLockMult` via `bossStyleMult`). With all three
   * standing he is armoured against everything.
   *
   * The decision that creates is *which soul to kill first*, and it depends on the board
   * you actually built: a mono-style board has exactly one soul that matters, a spread
   * board has to clear more of them. Jad's healers are interchangeable; these are not.
   */
  private updateCerberus(e: Enemy, dt: number) {
    const st = e.bossState!;
    const hpFrac = e.hp / e.maxHp;

    // Rebuild the locks from the souls still standing, every frame. Killing one frees its
    // style immediately — the reward has to be instant, or the player can't feel the
    // trade they just made.
    st.lockedStyles = this.enemies
      .filter((s) => s.ownerId === e.id && s.soulStyle)
      .map((s) => s.soulStyle!);

    if (cerberusShouldSummon(hpFrac, st.soulSummons ?? 0)) {
      st.soulSummons = (st.soulSummons ?? 0) + 1;
      this.summonSouls(e);
    }

    if (!st.enraged && cerberusIsEnraged(hpFrac)) {
      st.enraged = true;
      e.baseSpeed = Math.round(e.baseSpeed * CERBERUS_ENRAGE_SPEED_MULT);
      if (e.slowTimer <= 0) e.speed = e.baseSpeed;
      this.addRing(e.x, e.y, 8, 90, '#ff6b3d', 0.7, 6);
      this.notify('Cerberus enrages!');
      this.sound.play('wave', 70);
    }
  }

  /** Summon Cerberus's trio: one soul per combat style, orbiting him. Any that were
   *  killed in the last batch come back — the threshold sends a *fresh* three. */
  private summonSouls(cerb: Enemy) {
    // Whatever survives from the previous batch is cleared out, so the trio is always a
    // trio: three thresholds of one soul each would be a very different (and duller) fight.
    this.enemies = this.enemies.filter((s) => !(s.ownerId === cerb.id && s.soulStyle));
    const hp = Math.max(20, Math.round(cerb.maxHp * CERBERUS_SOUL_HP_FRAC));
    SOUL_STYLES.forEach((style, i) => {
      const ang = (i / SOUL_STYLES.length) * Math.PI * 2 - Math.PI / 2;
      this.enemies.push({
        ...ENEMIES.summoned_soul,
        id: uid(),
        type: 'summoned_soul',
        // Each style is a different NPC in the cache, carrying that style's weapon — a
        // bow, a staff, a blade. The player reads which soul is which from the weapon,
        // not from a legend.
        animType: soulAnimSlug(style),
        name: `Summoned Soul (${style})`,
        escort: true,
        ownerId: cerb.id,
        soulStyle: style,
        orbit: ang,
        debug: cerb.debug, // a sandbox Cerberus summons sandbox souls
        x: cerb.x + Math.cos(ang) * CERBERUS_SOUL_ORBIT,
        y: cerb.y + Math.sin(ang) * CERBERUS_SOUL_ORBIT,
        hp,
        maxHp: hp,
        speed: 70,
        baseSpeed: 70,
        naturalSpeed: 70,
        pathIndex: cerb.pathIndex,
        slowTimer: 0,
        stunTimer: 0,
        tauntTimer: 0,
        groundTimer: 0,
        animTime: Math.random() * 2,
        spawnAnim: SPAWN_ANIM_SECONDS,
      });
    });
    this.addRing(cerb.x, cerb.y, 10, 110, '#b7c6dd', 0.6, 5);
    this.sound.play('wave', 65);
    this.notify('Cerberus summons his Souls — each locks a combat style!');
  }

  /**
   * Grotesque Guardians: the kill-order check. Dusk arrives with Dawn, and while both
   * stand they share their stone — each takes halved damage (see `bossStyleMult`). Kill
   * one and the survivor breaks the link: full damage taken, but faster, and it starts
   * dragging its twin back up. Fail to finish it inside the window and the twin returns
   * on half health with the mitigation restored.
   *
   * So splitting them badly is a trap, and the intended play — bleed both, converge at
   * the end — is the one thing no other boss in the game asks for.
   */
  private updateGuardian(e: Enemy, dt: number) {
    const st = e.bossState!;
    // Dusk brings his twin. Dawn is not in SCHEDULABLE_BOSSES precisely so that she can
    // never turn up without him; this is the only way she enters the field.
    if (st.kind === 'dusk' && !st.summonedTwin) this.summonDawn(e);

    // A failed lookup *is* the signal: the twin's id is still on the state after it
    // dies, and not finding it in `enemies` is how the survivor learns it is alone.
    const twin = st.partnerId ? this.enemies.find((x) => x.id === st.partnerId) : undefined;
    const wasLinked = !!st.linked;
    st.linked = !!twin;

    if (twin) {
      // Reunited (or never parted): the stone is shared again and the rage subsides.
      if (st.enraged) {
        st.enraged = false;
        e.baseSpeed = Math.max(1, Math.round(e.baseSpeed / GUARDIAN_ENRAGE_SPEED_MULT));
        if (e.slowTimer <= 0) e.speed = e.baseSpeed;
      }
      st.reviveTimer = undefined;
      return;
    }

    // Alone. The moment it happens: enrage, and start hauling the twin back.
    if (wasLinked || st.reviveTimer === undefined) {
      st.reviveTimer = GUARDIAN_REVIVE_SECS;
      if (!st.enraged) {
        st.enraged = true;
        e.baseSpeed = Math.round(e.baseSpeed * GUARDIAN_ENRAGE_SPEED_MULT);
        if (e.slowTimer <= 0) e.speed = e.baseSpeed;
      }
      this.addRing(e.x, e.y, 8, 70, GUARDIAN_LINK_COLOR, 0.6, 5);
      this.notify(`${e.name} enrages — kill it before it revives its twin!`);
      this.sound.play('wave', 60);
      return;
    }

    st.reviveTimer -= dt;
    if (st.reviveTimer > 0) return;

    // The window closed with the survivor still standing: the twin comes back.
    this.reviveTwin(e);
  }

  /** Dusk's opening move: Dawn joins him on the road, and the two are linked. */
  private summonDawn(dusk: Enemy) {
    const st = dusk.bossState!;
    st.summonedTwin = true;
    const dawn = this.makeEnemy('dawn', this.wave);
    if (!dawn) return;
    dawn.debug = dusk.debug; // a sandbox Dusk brings a sandbox Dawn
    dawn.pathIndex = dusk.pathIndex;
    dawn.x = dusk.x;
    dawn.y = dusk.y - GUARDIAN_PAIR_OFFSET;
    dawn.laneOffset = -GUARDIAN_PAIR_OFFSET; // she flies a lane clear of him, the whole way
    dawn.spawnAnim = SPAWN_ANIM_SECONDS;
    this.linkGuardians(dusk, dawn);
    this.enemies.push(dawn);
    // She never comes through the wave queue, so count the sighting here or the
    // Collection Log would never learn she exists.
    if (!dawn.debug) {
      this.bossesSeen = { ...this.bossesSeen, dawn: (this.bossesSeen.dawn ?? 0) + 1 };
    }
    this.addRing(dawn.x, dawn.y, 6, 60, GUARDIAN_LINK_COLOR, 0.7, 5);
    this.notify('Dawn joins Dusk — they share their stone!');
  }

  /** Haul a fallen Guardian back up beside its twin, on half health, link restored. */
  private reviveTwin(survivor: Enemy) {
    const st = survivor.bossState!;
    const type = st.twinType;
    if (!type) return;
    const twin = this.makeEnemy(type as EnemyType, this.wave);
    if (!twin) return;
    twin.debug = survivor.debug;
    twin.pathIndex = survivor.pathIndex;
    twin.x = survivor.x;
    twin.y = survivor.y - GUARDIAN_PAIR_OFFSET;
    // Dawn always flies the side lane; Dusk always walks the road. Whichever of them came
    // back, it comes back into its own lane, so the pair never merges into one silhouette.
    twin.laneOffset = type === 'dawn' ? -GUARDIAN_PAIR_OFFSET : 0;
    twin.hp = guardianReviveHp(twin.maxHp);
    twin.spawnAnim = SPAWN_ANIM_SECONDS;
    this.linkGuardians(survivor, twin);
    this.enemies.push(twin);
    // The rage was for being alone; it isn't any more.
    if (st.enraged) {
      st.enraged = false;
      survivor.baseSpeed = Math.max(1, Math.round(survivor.baseSpeed / GUARDIAN_ENRAGE_SPEED_MULT));
      if (survivor.slowTimer <= 0) survivor.speed = survivor.baseSpeed;
    }
    st.reviveTimer = undefined;
    this.addRing(twin.x, twin.y, 4, 80, GUARDIAN_LINK_COLOR, 0.8, 6);
    this.sound.play('wave', 70);
    this.notify(`${twin.name} rises again!`);
  }

  /** Point two Guardians at each other and switch the shared-stone mitigation on. */
  private linkGuardians(a: Enemy, b: Enemy) {
    const sa = a.bossState!;
    const sb = b.bossState!;
    sa.partnerId = b.id;
    sb.partnerId = a.id;
    sa.linked = true;
    sb.linked = true;
  }

  /**
   * Giant Mole: the mobility check. It walks for a while, then **burrows** — the real
   * OSRS dig animation, a beat underground where it is invisible, untargetable and
   * immune, and the surface animation several waypoints further along. It skips the
   * stretch you fortified, so a board that funnels everything into one kill-box watches
   * it reappear *past* the box.
   *
   * The fairness is in the guardrail and the tell: it will not dig once the final
   * approach is all that is left (`moleCanBurrow`), and while it is under, the churning
   * mound is drawn at the spot it will surface — so the player can see the reposition
   * coming and has the dig, the climb-out and the mound to shoot at. Below a quarter of
   * its health it digs more often. Cycle maths live in `systems/boss-mechanics`.
   */
  private updateMole(e: Enemy, dt: number) {
    const st = e.bossState!;
    st.moleTimer = (st.moleTimer ?? 0) - dt;
    if (st.moleTimer > 0) return;

    if (st.molePhase === 'above') {
      // Nothing to gain (it's on the final approach, or the dig would barely move it) —
      // it walks the rest out. Re-arm rather than special-case: it only ever gets
      // closer to the base, so this simply keeps returning null.
      const target = moleBurrowTarget(this.path, e.pathIndex, e.x, e.y);
      if (!target) {
        st.moleTimer = moleBurrowInterval(e.hp / e.maxHp);
        return;
      }
      st.molePhase = 'dig';
      st.moleTimer = MOLE_DIG_SECS;
      this.addRing(e.x, e.y, 4, 42, MOLE_DUST, 0.6, 4);
      this.sound.play('wave', 45);
      this.notify('The Giant Mole starts digging!');
    } else if (st.molePhase === 'dig') {
      // Under it goes — and it comes up somewhere else. Moving it *now* (rather than on
      // surfacing) is what keeps it un-hittable in transit, and it puts the mound
      // telegraph at the destination for the whole underground beat. `null` can't
      // happen here (the `above` branch already checked), but if the road ever changed
      // mid-dig, standing still is the safe answer.
      const target = moleBurrowTarget(this.path, e.pathIndex, e.x, e.y);
      st.molePhase = 'under';
      st.moleTimer = MOLE_UNDER_SECS;
      st.immune = true; // `bossStyleMult` short-circuits to 0 (shared with Vorkath's ice)
      // Drop it from every tower that had it locked. `fireTowers` would re-acquire on
      // its next pass anyway (`inReach` rejects a hidden Mole), but it runs *before*
      // this in the frame, so without the sweep a tower keeps its aim on a hole in the
      // ground for a frame and burns a shot into it for zero damage.
      for (const t of this.towers) if (t.targetId === e.id) t.targetId = null;
      this.addRing(e.x, e.y, 6, 34, MOLE_DUST, 0.7, 5); // the hole it leaves behind
      if (target) {
        e.pathIndex = target.pathIndex;
        e.x = target.x;
        e.y = target.y;
      }
    } else if (st.molePhase === 'under') {
      st.molePhase = 'emerge';
      st.moleTimer = MOLE_EMERGE_SECS;
      st.immune = false; // climbing out: hittable again, and it has not moved yet
      st.burrows = (st.burrows ?? 0) + 1;
      this.addRing(e.x, e.y, 4, 48, MOLE_DUST, 0.6, 5);
      this.sound.play('wave', 55);
      this.notify('The Giant Mole surfaces ahead!');
    } else {
      st.molePhase = 'above';
      st.moleTimer = moleBurrowInterval(e.hp / e.maxHp);
    }
  }

  /**
   * Alchemical Hydra: the burst check. At each HP threshold it opens a chemical
   * vent — hardened (x0.2 damage, see `bossStyleMult`) and regenerating — and the
   * player has a short window to land enough damage to shatter it. Shattering
   * advances the phase, arcs lightning through a line of towers, and leaves the
   * Hydra briefly vulnerable. Failing lets the banked heal stand, and knocking it
   * back down simply re-opens the vent: a stall, never a wipe. Below a tenth of
   * its health it enrages. Vent/phase maths live in `systems/boss-mechanics`.
   */
  private updateHydra(e: Enemy, dt: number) {
    const st = e.bossState!;
    const frac = e.hp / e.maxHp;

    if (st.ventCooldown && st.ventCooldown > 0) st.ventCooldown -= dt;

    if (st.venting) {
      // Regenerate while the vent holds, and check the break target. The stall-breaker
      // throttles the heal: this regen is precisely what lets a vent undo a whole cycle
      // of a thin board's damage, so a Hydra that has been going nowhere loses it and
      // the board that was *nearly* enough finally gets through.
      const heal = hydraVentHeal(e.maxHp, dt) * stallHealMult(st.stallStacks ?? 0);
      e.hp = Math.min(e.maxHp, e.hp + heal);
      st.ventTimer = (st.ventTimer ?? 0) - dt;
      if ((st.ventDamage ?? 0) >= hydraBreakTarget(e.maxHp)) this.shatterHydraVent(e);
      else if (st.ventTimer <= 0) {
        // Window closed unbroken: the heal it banked stands and the vent seals. It stays
        // open — full damage — for the cooldown, so the board always gets its swing back.
        st.venting = false;
        st.ventDamage = 0;
        st.ventCooldown = HYDRA_VENT_COOLDOWN_SECS;
        this.notify('The Hydra seals its vent — not enough damage!');
        this.addRing(e.x, e.y, 40, 6, hydraPhase(st.shattered ?? 0).color, 0.45, 3);
      }
    } else if (hydraShouldVent(frac, st.shattered ?? 0, false, st.ventCooldown ?? 0)) {
      st.venting = true;
      st.ventTimer = HYDRA_VENT_SECS;
      st.ventDamage = 0;
      this.notify('The Hydra vents chemicals — break it!');
      this.addRing(e.x, e.y, 8, 64, '#b6ff6a', 0.55, 4);
      this.sound.play('hit', 65);
    }

    // Enrage: the final phase. Raise `baseSpeed` (not `speed`) so slows keep
    // working — they recompute off it — and leave `naturalSpeed` alone so the UI
    // correctly reads the Hydra as hastened.
    if (!st.enraged && hydraIsEnraged(frac)) {
      st.enraged = true;
      st.zapTimer = HYDRA_ENRAGE_ZAP_SECS;
      e.baseSpeed = Math.round(e.baseSpeed * HYDRA_ENRAGE_SPEED_MULT);
      if (e.slowTimer <= 0) e.speed = e.baseSpeed;
      this.notify('The Hydra enrages!');
      this.addRing(e.x, e.y, 10, 84, '#d4452f', 0.6, 5);
      this.sound.play('wave', 70);
    }
    // While enraged the lightning stops waiting for a shatter and fires on a cadence.
    if (st.enraged) {
      st.zapTimer = (st.zapTimer ?? HYDRA_ENRAGE_ZAP_SECS) - dt;
      if (st.zapTimer <= 0) {
        st.zapTimer = HYDRA_ENRAGE_ZAP_SECS;
        const zapped = this.hydraZap(e);
        if (zapped) this.notify(`Hydra lightning disables ${zapped} tower${zapped > 1 ? 's' : ''}!`);
      }
    }
  }

  /** A vent breaks: advance the phase, zap a line of towers, and open a short
   *  vulnerability window as the reward for the burst. */
  private shatterHydraVent(e: Enemy) {
    const st = e.bossState!;
    st.venting = false;
    st.ventDamage = 0;
    st.shattered = (st.shattered ?? 0) + 1;
    e.vulnTimer = Math.max(e.vulnTimer ?? 0, HYDRA_SHATTER_VULN_SECS);
    const phase = hydraPhase(st.shattered);
    this.addRing(e.x, e.y, 6, 90, phase.color, 0.6, 5);
    this.sound.play('wave', 60);
    // One notice, not two: the zap fires in this same frame, and a second notify()
    // would overwrite the first before the toast ever renders.
    const zapped = this.hydraZap(e);
    this.notify(zapped
      ? `${phase.name} phase — lightning disables ${zapped} tower${zapped > 1 ? 's' : ''}!`
      : `The Hydra's vent shatters — ${phase.name} phase!`);
  }

  /** Chain lightning: arc through the nearest towers, disabling each. Vorkath
   *  freezes a single tower on a long timer; the Hydra takes out a *line* of
   *  them — and it fires exactly when the player is winning. Returns how many it
   *  hit; the caller owns the notice (see {@link shatterHydraVent}). */
  private hydraZap(e: Enemy): number {
    const chain = hydraZapChain(this.towers, e.x, e.y, HYDRA_ZAP_CHAIN);
    if (!chain.length) return 0;
    let fromX = e.x;
    let fromY = e.y;
    for (const t of chain) {
      this.addBolt(fromX, fromY, t.x, t.y, '#9fd8ff', 0.3);
      this.addRing(t.x, t.y, 3, 22, '#9fd8ff', 0.4, 3);
      t.disabledTimer = Math.max(t.disabledTimer, HYDRA_ZAP_DISABLE_SECS);
      fromX = t.x;
      fromY = t.y;
    }
    this.sound.play('hit', 70);
    return chain.length;
  }

  /** Vorkath: alternate a vulnerable window and a short ice shield. When the
   *  shield raises, Vorkath is immune and the nearest tower freezes for its
   *  duration — the player must weather it, not out-DPS it. */
  private updateVorkath(e: Enemy, dt: number) {
    const st = e.bossState!;
    st.iceTimer = (st.iceTimer ?? VORKATH_ICE_INTERVAL) - dt;
    if (st.iceTimer > 0) return;
    if (st.immune) {
      // Shield ends → vulnerable again until the next interval.
      st.immune = false;
      st.iceTimer = VORKATH_ICE_INTERVAL;
    } else {
      // Raise the shield: immune + freeze the nearest tower for the duration.
      st.immune = true;
      st.iceTimer = VORKATH_ICE_DURATION;
      let best: Tower | null = null;
      let bestD = Infinity;
      for (const t of this.towers) {
        const d = distanceSq(t.x, t.y, e.x, e.y);
        if (d < bestD) { bestD = d; best = t; }
      }
      if (best) best.disabledTimer = Math.max(best.disabledTimer, VORKATH_ICE_DURATION);
      this.addRing(e.x, e.y, 10, 70, '#bfe9ff', 0.5, 4); // a frost burst as the shield raises
      this.notify('Vorkath raises an ice shield!');
      this.sound.play('hit', 70);
    }
  }

  /** Jad: below half HP he summons Yt-HurKot healers; while any live, he
   *  regenerates a slice of the damage dealt to him over the last few seconds.
   *  Recent damage is recorded in `damage()`; here we prune it, summon/re-summon,
   *  and apply the heal on a tick. */
  private updateJad(e: Enemy, dt: number) {
    const st = e.bossState!;
    const now = this.gameTime;
    st.recentDamage = pruneDamageEvents(st.recentDamage ?? [], now, JAD_HEAL_WINDOW_SECS);

    const healersAlive = this.enemies.some(h => h.healer && h.ownerId === e.id);
    if (!healersAlive && st.healSummoned) {
      // Batch wiped — start the re-summon cooldown (once).
      st.healSummoned = false;
      st.resummonTimer = JAD_RESUMMON_COOLDOWN;
    }
    if (st.resummonTimer && st.resummonTimer > 0) st.resummonTimer -= dt;

    // Summon (or re-summon, once the cooldown elapses) while below the threshold.
    const belowThreshold = e.hp <= e.maxHp * JAD_HEAL_THRESHOLD;
    if (belowThreshold && !st.healSummoned && (st.resummonTimer ?? 0) <= 0) {
      st.healSummoned = true;
      this.summonJadHealers(e);
      this.notify('Jad summons Yt-HurKot healers!');
    }

    if (healersAlive && e.hp < e.maxHp) {
      st.healTickTimer = (st.healTickTimer ?? 0) + dt;
      if (st.healTickTimer >= JAD_HEAL_TICK_SECS) {
        st.healTickTimer -= JAD_HEAL_TICK_SECS;
        const heal = jadHealPerTick(recentDamageSum(st.recentDamage, now, JAD_HEAL_WINDOW_SECS));
        if (heal > 0) {
          e.hp = Math.min(e.maxHp, e.hp + heal);
          // A green "heal" splat floats off Jad so the regen reads clearly.
          this.hitsplats.push({ x: e.x + (Math.random() - 0.5) * 16, y: e.y - 18, value: heal, kind: 'heal', life: HITSPLAT_LIFE });
          for (let i = 0; i < 3; i++) {
            this.particles.push({ x: e.x + (Math.random() - 0.5) * 20, y: e.y, vx: (Math.random() - 0.5) * 30, vy: -30 - Math.random() * 30, life: 0.5, maxLife: 0.5, color: '#48d04a', size: 2 });
          }
        }
      }
    }
  }

  /** Spawn Jad's ring of stationary healers. They don't walk the path or leak,
   *  award nothing on death (`debug`), and exist only to be cut down. */
  private summonJadHealers(jad: Enemy) {
    const hp = Math.max(20, Math.round(jad.maxHp * JAD_HEALER_HP_FRAC));
    for (let i = 0; i < JAD_HEALER_COUNT; i++) {
      const ang = (i / JAD_HEALER_COUNT) * Math.PI * 2 - Math.PI / 2;
      this.enemies.push({
        ...ENEMIES.imp,
        id: uid(),
        type: 'imp',
        // Render the real Yt-HurKot model once it's baked (falls back to the imp
        // clip until then); stats/combat stay on `type: 'imp'`.
        animType: 'yt_hurkot',
        name: 'Yt-HurKot',
        escort: true,
        ownerId: jad.id,
        healer: true,
        orbit: ang,
        debug: jad.debug, // inherit sandbox flag so a debug Jad spawns debug healers
        x: jad.x + Math.cos(ang) * JAD_HEALER_ORBIT,
        y: jad.y + Math.sin(ang) * JAD_HEALER_ORBIT,
        hp,
        maxHp: hp,
        // A follow speed (px/s): fast enough to keep formation as Jad advances.
        speed: 70,
        baseSpeed: 70,
        naturalSpeed: 70,
        renderScale: 0.7,
        pathIndex: jad.pathIndex,
        slowTimer: 0,
        stunTimer: 0,
        tauntTimer: 0,
        groundTimer: 0,
        animTime: Math.random() * 2,
        spawnAnim: SPAWN_ANIM_SECONDS,
      });
    }
    this.addRing(jad.x, jad.y, 10, 80, '#48d04a', 0.55, 4); // a green summon pulse
    this.sound.play('wave', 60); // summon vwoop
  }

  /** Move an escort (a Yt-HurKot healer, a Summoned Soul) toward its orbit slot around
   *  its owner, so it follows the boss at a fixed radius and drifts around it rather
   *  than walking the path. Orphans (owner gone) hold still until `handleBossMechanics`
   *  culls them. */
  private updateEscortFollow(e: Enemy, dt: number) {
    const owner = e.ownerId ? this.enemies.find(h => h.id === e.ownerId) : undefined;
    if (!owner) return;
    e.orbit = (e.orbit ?? 0) + dt * ESCORT_ORBIT_DRIFT; // slow circle around the boss
    const radius = e.soulStyle ? CERBERUS_SOUL_ORBIT : JAD_HEALER_ORBIT;
    const tx = owner.x + Math.cos(e.orbit) * radius;
    const ty = owner.y + Math.sin(e.orbit) * radius;
    const dx = tx - e.x, dy = ty - e.y;
    const d = Math.hypot(dx, dy);
    if (d < 1) return;
    // Keep pace with the boss even if it's faster than the escort's base follow speed.
    const speed = Math.max(e.speed, (owner.speed || 0) * 1.4 + 40);
    const step = Math.min(d, speed * dt);
    e.x += (dx / d) * step;
    e.y += (dy / d) * step;
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

  /** Advance purely-visual effects (no gameplay impact). */
  private updateEffects(dt: number) {
    if (this.baseFlash > 0) this.baseFlash = Math.max(0, this.baseFlash - dt * 1.6);
    for (let i = this.spotEffects.length - 1; i >= 0; i--) {
      const fx = this.spotEffects[i];
      fx.age += dt;
      // Enemy-anchored GFX (Ancients hits) ride the struck model while it
      // lives; once it dies or leaks, the effect finishes where it stood.
      if (fx.enemyId) {
        const t = this.enemies.find((en) => en.id === fx.enemyId);
        if (t) { fx.x = t.x; fx.y = t.y; }
        else fx.enemyId = undefined;
      }
      const meta = SPOTANIMS[fx.slug];
      if (!meta || fx.age >= spotAnimDurationS(meta)) this.spotEffects.splice(i, 1);
    }
    for (let i = this.hitsplats.length - 1; i >= 0; i--) {
      const h = this.hitsplats[i];
      h.life -= dt;
      if (h.minor) {
        h.x += (h.vx ?? 0) * dt; // drift to its lane's side
        h.y += (h.vy ?? 0) * dt; // and up or down per its lane
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
    for (let i = this.fx.length - 1; i >= 0; i--) {
      this.fx[i].age += dt;
      if (this.fx[i].age >= this.fx[i].life) this.fx.splice(i, 1);
    }
  }

  /** Queue a one-shot baked-spotanim effect at a point (purely visual).
   *  `scale` multiplies the spotanim's base draw size (impacts fit the model).
   *  `anchor` pins the GFX to an enemy — like the client's actor graphics, the
   *  effect rides the model while it lives (then finishes where it stood). */
  spawnEffect(slug: string, x: number, y: number, scale = 1, anchor?: Enemy) {
    if (!SPOTANIMS[slug]) return;
    this.spotEffects.push({ slug, x, y, age: 0, scale, enemyId: anchor?.id });
  }

  /** An Ancients hit GFX played ON the struck model: sized from the enemy's
   *  drawn body (ice barrage's cube encases the whole NPC — the proportion
   *  baseline) and anchored to it, so the effect follows the model like an
   *  actor graphic in the client. No jitter — the fit is the point. */
  private spawnAncientHitFx(slug: string, e: Enemy) {
    const meta = SPOTANIMS[slug];
    if (!meta) return;
    const fit = ANCIENT_HIT_FIT[slug.split('_')[1]] ?? 1.15;
    const bodyPx = (e.isBoss ? 60 : 30) * (e.renderScale ?? 1) * 1.32; // matches drawEnemies' ds
    this.spotEffects.push({ slug, x: e.x, y: e.y, age: 0, scale: (bodyPx * fit) / meta.size, enemyId: e.id });
  }

  /** An expanding ring VFX (overkill cleave, kill-streak shockwave, soul-split heal). */
  private addRing(x: number, y: number, r0: number, r1: number, color: string, life = 0.5, width = 3) {
    this.fx.push({ kind: 'ring', x, y, age: 0, life, r0, r1, color, width });
  }

  /** A quick energy bolt between two points (ricochet / pierce / chain-freeze jump). */
  private addBolt(x0: number, y0: number, x1: number, y1: number, color: string, life = 0.25) {
    this.fx.push({ kind: 'bolt', x0, y0, x1, y1, age: 0, life, color });
  }

  private spawn(dt: number) {
    if (this.spawnQueue.length === 0) return;
    this.spawnTimer += dt;
    if (this.spawnTimer >= this.spawnInterval) {
      this.spawnTimer = 0;
      const enemy = this.spawnQueue.shift();
      if (enemy) {
        enemy.spawnAnim = SPAWN_ANIM_SECONDS; // materialise (fade-in + grow) out of the portal
        this.enemies.push(enemy);
        // Count every real boss sighting (lifetime): the first one unlocks the
        // boss's modifier rolls for all future encounters, and the running tally
        // ramps the lives it costs on a leak. Debug/sandbox spawns don't count.
        if (enemy.isBoss && !enemy.debug) {
          this.bossesSeen = { ...this.bossesSeen, [enemy.type]: (this.bossesSeen[enemy.type] ?? 0) + 1 };
        }
      }
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
            // Pass the source style so boss style-resistance (Zulrah) reduces the
            // DoT — including Fire's %max-HP burn — like it does the direct hit.
            // Tag maps the DoT slot to its meter bucket (burn/poison/venom).
            const dotTag = kind === 'burn' ? 'burn' : kind === 'venom' ? 'venom' : 'poison';
            if (this.damage(e, total, kind, true, false, 0, d.style,
                { towerId: d.sourceTowerId, tag: dotTag })) break; // enemy died; stop ticking it
          }
        }
        if (expired) delete e.dots[kind];
      }
    }
  }

  private moveEnemies(dt: number) {
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (e.spawnAnim && e.spawnAnim > 0) e.spawnAnim = Math.max(0, e.spawnAnim - dt);
      if (e.flashTimer && e.flashTimer > 0) e.flashTimer -= dt;
      e.animTime = (e.animTime ?? 0) + dt; // drives the looping walk-cycle
      if (e.hurtAnim && e.hurtAnim > 0) e.hurtAnim = Math.max(0, e.hurtAnim - dt);
      // Jad's healers don't walk the path or leak — they trail Jad in a loose
      // orbit; the only way they leave the field is by being killed.
      if (e.escort) { this.updateEscortFollow(e, dt); continue; }
      if (e.slowTimer > 0) {
        e.slowTimer -= dt;
        if (e.slowTimer <= 0) e.speed = e.baseSpeed;
      }
      if (e.vulnTimer && e.vulnTimer > 0) e.vulnTimer -= dt;
      // Regenerating affix: claw back HP over time, capped at full health.
      if (e.affixes) {
        const regen = regenPerSec(e.affixes, e.maxHp, this.wave);
        if (regen > 0 && e.hp < e.maxHp) e.hp = Math.min(e.maxHp, e.hp + regen * dt);
      }
      if (e.stunTimer > 0) {
        e.stunTimer -= dt;
        continue; // Earth/Shadow stun: frozen in place this frame
      }
      // The Giant Mole holds still for its whole burrow cycle — it digs in, travels
      // underground (the jump is a teleport in `updateMole`, not a walk), and climbs
      // back out. Walking through any of that would slide the animation across the map.
      if (moleIsBurrowing(e.bossState)) continue;
      const target = this.path[e.pathIndex + 1];
      if (!target) {
        // reached the end → leak lives (debug/sandbox enemies leak harmlessly).
        // Bosses cost 5 + 1 per prior sighting (capped 10), elites/superiors
        // cost 3, and normal monsters cost 1 (2 for a Colossal). The sighting
        // tally already counts this appearance, so subtract it for "prior".
        // Jad's healers never reach here (they `continue` above), but guard the
        // life-cost anyway so only the boss itself — never a healer — can cost a
        // life if that path is ever refactored.
        this.enemies.splice(i, 1);
        if (!e.debug && !e.escort) {
          const cost = e.isBoss
            ? bossLeakCost((this.bossesSeen[e.type] ?? 1) - 1)
            : e.type.startsWith('superior_')
            ? SUPERIOR_LEAK_COST
            : leakLifeCost(e.affixes ?? []);
          this.lives -= cost;
          this.baseFlash = 1;
          this.sound.play('base_hit', 90); // player taking damage with no armour (OSRS take-damage splat)
          this.checkLethal();
        }
        this.emit();
        continue;
      }
      // An enemy with a lane offset aims at a point *beside* the waypoint, perpendicular
      // to the segment it is on, so it walks a parallel track instead of the road's
      // centreline. Dawn flies one lane over from Dusk; without it the pair would occupy
      // the same waypoints and render as a single blob.
      let tx = target.x;
      let ty = target.y;
      if (e.laneOffset) {
        const from = this.path[e.pathIndex];
        const sx = target.x - from.x;
        const sy = target.y - from.y;
        const sl = Math.hypot(sx, sy) || 1;
        tx += (-sy / sl) * e.laneOffset;
        ty += (sx / sl) * e.laneOffset;
      }
      const dx = tx - e.x;
      const dy = ty - e.y;
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
      // Disabled (e.g. by a Volatile enemy's death blast): tick the timer down and
      // hold fire until it clears.
      if (tower.disabledTimer > 0) { tower.disabledTimer = Math.max(0, tower.disabledTimer - dt); continue; }
      // Utility wizards don't fire — they project a field (see updateUtilityTowers).
      if (tower.type === 'wizard' && tower.mageMode === 'utility') continue;
      const stats = calculateTowerStats(tower, {
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
      const half = squareRange(stats.range, GRID);
      // Test the enemy's body, not just its centre, so a tower fires as soon as
      // an enemy overlaps its range square (e.g. when the road clips the edge).
      // Already-doomed enemies are excluded so the tower looks past them, and so is a
      // Giant Mole that is underground — it takes no damage there, and a tower emptying
      // its cooldowns into a hole in the ground would be pure waste, not a mechanic.
      const inReach = (e: Enemy) =>
        !doomed(e) && !moleIsHidden(e.bossState) && inSquareRange(e.x, e.y, tower.x, tower.y, half + enemyRadius(e));

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
      let damage = Math.floor((baseDamage + stats.flatDamageBonus) * stats.damageMultiplier * this.runDamageMult());
      // Utility damage-aura boosting this shot (for the DPS meter's attribution).
      const projAura = this.utilityAura(tower);

      // Slayer weapon: native bonus vs the current task target / superiors / bosses,
      // independent of (and stacking with) the Slayer Helmet applied in damage().
      if (tower.type === 'slayer') {
        damage = Math.floor(damage * slayerWeaponBonus(target.type, this.slayer.task?.type ?? null, !!target.isBoss));
      }

      // Base projectile flavour; the cannon splashes (radius grows by tier), toxic
      // venoms, tzhaar crushes.
      let projColor = tower.color;
      // Impact theme is keyed off the PROJECTILE (the tower's spell), never the
      // enemy hit — elemental wizards tag the bolt with their element, ancients
      // with their barrage type, so hit() themes the burst correctly (undefined
      // here → a plain arrow/cannon spark).
      let projElement: Element | undefined;
      let projAncient: AncientType | undefined;
      let projSpecial: Projectile['special'] | undefined = tower.special === 'rapid' || tower.special === 'aoe' ? undefined : tower.special;
      let projAoe = tower.special === 'aoe';
      const projBlastRadius = tower.type === 'cannon' ? cannonBlastRadius(tower.level) : undefined;
      let projLifesteal = false;
      let projBonusMaxHpFrac = 0;
      let projBonusMaxHpCap = 0;
      const projSpell = spellSpriteName(tower) ?? undefined;

      // Wizard spellbooks: Elemental (single-target status + weakness bonus),
      // Ancients (AoE barrage with a signature status), Utility (support aura,
      // applied in tower-combat — it just fires a plain bolt here).
      if (tower.type === 'wizard') {
        const mode = tower.mageMode ?? 'elemental';
        if (mode === 'elemental') {
          const spec = ELEMENTS[(tower.element ?? 'air') as Exclude<Element, 'none'>];
          projColor = spec.glow ?? spec.color; // glow/trail matches the spell sprite
          projElement = tower.element ?? 'air'; // themes the impact burst (fire → fire, …)
          projSpecial = spec.effect;
          damage = Math.floor(damage * weaknessMultiplier(tower.element ?? 'air', target.weakness));
        } else if (mode === 'ancients') {
          const anc = tower.ancientType ?? 'ice';
          const spec = ANCIENTS[anc];
          projColor = spec.glow ?? spec.color; // glow/trail matches the spell sprite
          projAncient = anc; // themes the impact burst (ice/blood/shadow/smoke)
          projSpecial = spec.effect;
          projAoe = true;
          projLifesteal = !!spec.lifesteal;
          // Blood barrage adds (0.75·level)% of each target's max HP, capped at 30·level.
          if (anc === 'blood') { projBonusMaxHpFrac = bloodBonusFrac(tower.level); projBonusMaxHpCap = bloodBonusCap(tower.level); }
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

      // Every projectile flies at a fixed nominal speed (distance-scaled) and
      // eases in (slow→fast) over that time (see moveProjectiles). A wizard plays
      // its spell's cast clip here on fire and tags the bolt with the matching
      // impact clip, which plays when it connects (GameEngine.hit) — the
      // authentic OSRS cast-on-fire / hit-on-impact pair.
      let soundKey = `fire_${tower.type}`;
      let hitSound: string | undefined;
      const dist = distance(tower.x, tower.y, target.x, target.y);
      let flight = dist / 600; // nominal flight (archer/cannon/spell alike)
      let projAnim: string | undefined;
      if (tower.type === 'wizard') {
        const mode = tower.mageMode ?? 'elemental';
        const tier = mode === 'ancients' ? (tower.ancientType ?? 'ice') : (tower.element ?? 'air');
        soundKey = `cast_${tier}_${tower.level}`;
        hitSound = `hit_${tier}_${tower.level}`;
        // The spell's real flight GFX (baked from the cache); the spell icon
        // stays as the renderer's fallback if the sheet ever fails to load.
        if (SPOTANIMS[`proj_${tier}_${tower.level}`]) projAnim = `proj_${tier}_${tower.level}`;
        // Sound-sync the arc: the bolt must not land before the cast clip ends,
        // so the impact sfx never steps on the cast. Floor the flight at the cast
        // duration + 25% (a short beat of air after the cast lands). Until the
        // clip's duration has decoded, fall back to the shortest cast clip's
        // length so the floor never overshoots a real cast.
        const castDur = this.sound.duration(soundKey);
        flight = Math.max(flight, (isFinite(castDur) ? castDur : SHORTEST_CAST_S) * 1.25);
      }
      flight = Math.max(0.05, flight); // tiny floor: never instantaneous / div-by-zero

      // Launch one projectile at `tgt` for `dmg`, counting it as incoming so other
      // towers firing this same frame treat the target as (more) doomed.
      const projType: Projectile['type'] =
        tower.type === 'cannon' ? 'cannonball'
        : tower.type !== 'wizard' ? 'arrow'
        : projAncient ? (`ancient_${projAncient}` as Projectile['type']) // ancients carry their tier so the impact themes right
        : 'spell';
      const launch = (tgt: Enemy, dmg: number, fl: number) => {
        this.projectiles.push({
          id: uid(),
          x: tower.x,
          y: tower.y,
          ox: tower.x,
          oy: tower.y,
          flight: fl,
          age: 0,
          targetId: tgt.id,
          speed: distance(tower.x, tower.y, tgt.x, tgt.y) / fl, // trail/legacy; motion uses the ease curve
          damage: dmg,
          color: projColor,
          type: projType,
          element: projElement,
          special: projSpecial,
          aoe: projAoe || undefined,
          blastRadius: projBlastRadius,
          lifesteal: projLifesteal || undefined,
          bonusMaxHpFrac: projBonusMaxHpFrac || undefined,
          bonusMaxHpCap: projBonusMaxHpCap || undefined,
          spellIcon: projSpell,
          arrowIcon: tower.type === 'archer' ? 'dragon_arrow' : undefined,
          hitSound,
          projAnim,
          sourceTowerId: tower.id,
          aura: projAura,
          trail: [],
        });
        incoming.set(tgt.id, (incoming.get(tgt.id) ?? 0) + dmg);
      };

      // The tier-4 bow gets a modest, capped anti-tank nudge per target.
      const arrowDmg = (tgt: Enemy) =>
        tower.type === 'archer' && tower.level >= 4 ? Math.floor(damage * bowAntiTankMult(tgt.maxHp)) : damage;

      launch(target, arrowDmg(target), flight);

      // Dark Bow twin-shot: the archer (tier 3+) looses a second arrow at the next
      // best target in range, or the same one if it's alone (a focused burst).
      if (tower.type === 'archer' && archerArrowCount(tower.level) > 1) {
        const others = this.enemies.filter(e => e.id !== target.id && inReach(e));
        const second = selectTarget(others, tower.x, tower.y, this.path, tower.targetingPriority) ?? target;
        const fl2 = Math.max(0.05, distance(tower.x, tower.y, second.x, second.y) / 600);
        launch(second, arrowDmg(second), fl2);
      }

      // Double Shot (roguelite transform): ranged towers loose an extra shot at
      // a *different* enemy in range — spreads damage rather than amplifying it.
      if (this.runFx.doubleShot && TOWER_STYLES[tower.type]?.style === 'ranged') {
        const others = this.enemies.filter(e => e.id !== target.id && inReach(e));
        const extra = others.length ? others[Math.floor(Math.random() * others.length)] : null;
        if (extra) {
          const fl2 = Math.max(0.05, distance(tower.x, tower.y, extra.x, extra.y) / 600);
          launch(extra, arrowDmg(extra), fl2);
        }
      }

      this.sound.play(soundKey, 70);
    }
  }

  /**
   * Utility wizards are support casters: instead of firing, each projects ONE
   * field over the enemies in its range. The field status is re-applied every
   * frame (short refreshed timer) so it lasts exactly while an enemy is inside.
   * Sanctity has no field — it's a Prayer battery that trickles points back.
   */
  private updateUtilityTowers() {
    for (const tower of this.towers) {
      if (tower.type !== 'wizard' || tower.mageMode !== 'utility') continue;
      const spell = tower.supportSpell ?? 'curse';

      if (spell === 'sanctity') continue; // Prayer Ward: cuts drain (in PrayerSystem), no field

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

  /** Display identity of a tower for the DPS panel (grouping + labels). Returns
   *  null for an unknown id (e.g. a sold tower or the Run-FX bucket), letting the
   *  stats system fall back to its last-known / synthetic identity. */
  private towerIdentity(id: string): TowerIdentity | null {
    const t = this.towers.find(tw => tw.id === id);
    if (!t) return null;
    let subcategory: string | null = null;
    let subLabel: string | null = null;
    let isUtility = false;
    if (t.type === 'wizard') {
      const mode = t.mageMode ?? 'elemental';
      if (mode === 'elemental') {
        const el = t.element ?? 'air';
        subcategory = el;
        subLabel = ELEMENTS[el as Exclude<Element, 'none'>]?.label ?? el;
      } else if (mode === 'ancients') {
        const anc = t.ancientType ?? 'ice';
        subcategory = anc;
        subLabel = `${ANCIENTS[anc]?.label ?? anc} barrage`;
      } else {
        const sp = t.supportSpell ?? 'curse';
        subcategory = 'utility';
        subLabel = SUPPORT_SPELLS[sp]?.label ?? sp;
        isUtility = true;
      }
    }
    // Current icon + display name: a wizard shows its live spell (element/barrage/
    // utility cast) — the actual spell it's throwing, e.g. "Fire Blast" / "Ice
    // Barrage" — so the panel name matches the icon and the tower on the board,
    // not the generic tier suffix ("Blast"). Everything else keeps its tier name
    // and current tier sprite.
    const towerIcons = ASSETS.towers as Record<string, Record<number, string>>;
    let icon: string | undefined;
    let name = t.name;
    if (t.type === 'wizard') {
      const sp = spellSpriteName(t);
      if (sp) {
        icon = (ASSETS.spells as Record<string, string>)[sp];
        name = sp.replace(/_/g, ' ');
      }
    }
    icon ??= towerIcons[t.type]?.[t.level] ?? towerIcons[t.type]?.[1];
    return {
      type: t.type,
      style: TOWER_STYLES[t.type]?.style ?? 'melee',
      subcategory,
      subLabel,
      name,
      color: t.color,
      icon,
      isUtility,
    };
  }

  /** The Utility damage-aura boosting a firing tower right now, resolved to the
   *  contributing wizards + each one's share of the extra (mirrors the diminishing
   *  stack in tower-combat). Undefined when no aura applies, so a plain hit records
   *  no split. */
  private utilityAura(tower: Tower): AuraAttribution | undefined {
    const parts: { id: string; bonus: number }[] = [];
    for (const t of this.towers) {
      if (t.id === tower.id || t.type !== 'wizard' || t.mageMode !== 'utility') continue;
      if (distance(t.x, t.y, tower.x, tower.y) > t.range) continue;
      const b = utilityAuraBonus(t.level).damage;
      if (b > 0) parts.push({ id: t.id, bonus: b });
    }
    if (!parts.length) return undefined;
    // Diminishing returns: strongest counts fully, each next ×0.5^rank (matches
    // diminishingSum), so the per-wizard weight is its own term in that sum.
    parts.sort((a, b) => b.bonus - a.bonus);
    const weights = parts.map((p, i) => p.bonus * Math.pow(0.5, i));
    const factor = weights.reduce((s, w) => s + w, 0);
    if (factor <= 0) return undefined;
    return { factor, parts: parts.map((p, i) => ({ id: p.id, share: weights[i] / factor })) };
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

  /** Combat style behind a projectile (for the Armored affix's style resist).
   *  Reads the source tower's style; falls back to the projectile kind if the
   *  tower is already gone. */
  private projectileStyle(p: Projectile): CombatStyle | undefined {
    const t = p.sourceTowerId ? this.towers.find(tw => tw.id === p.sourceTowerId) : undefined;
    if (t) return TOWER_STYLES[t.type]?.style;
    switch (p.type) {
      case 'arrow': case 'dart': case 'bolt': case 'chinchompa': return 'ranged';
      case 'spell': case 'magic_projectile':
      case 'ancient_ice': case 'ancient_blood': case 'ancient_shadow': case 'ancient_smoke': return 'magic';
      case 'cannonball': case 'godsword': return 'melee';
      default: return undefined;
    }
  }

  private hit(p: Projectile, target: Enemy | null) {
    const style = this.projectileStyle(p);
    // Magic impacts play the spell's REAL baked hit-GFX from the cache when one
    // exists (`hitSound` doubles as the SPOTANIMS slug, e.g. `hit_fire_4`); the
    // element-themed procedural burst survives only as the fallback for magic
    // without a baked sheet. Arrows/cannonballs keep the plain coloured spark.
    const gfx = p.hitSound && SPOTANIMS[p.hitSound] ? p.hitSound : null;
    // Ancients hits are actor graphics: fitted to the struck model (ice cube
    // encases the NPC) and anchored to it, instead of a point burst.
    const isAncientGfx = !!gfx && /^hit_(ice|blood|shadow|smoke)_/.test(gfx);
    const theme = gfx ? null : resolveImpactTheme(p.type, p.element);
    const isAoe = !!(p.aoe || p.special === 'aoe');
    // Land the burst on the target's body (enemies draw centred on x/y) when it's
    // still alive, so the explosion reads as hitting the model rather than fizzling
    // at wherever the homing shot happened to end; fall back to the impact point.
    const ax = target && target.hp > 0 ? target.x : p.x;
    const ay = target && target.hp > 0 ? target.y : p.y;
    // Impact direction = the way the shot was travelling (launch → impact), so the
    // debris is knocked off the model in the direction of the hit.
    const travelX = ax - (p.ox ?? p.x);
    const travelY = ay - (p.oy ?? p.y);
    // Single-target magic bursts here (sized to the struck model); AoE bursts are
    // spawned per-target in the splash loop below so each hit — primary and splash
    // — gets its own right-sized burst. Non-magic shots keep the plain spark.
    const liveTarget = target && target.hp > 0 ? target : null;
    if (gfx && !isAoe) {
      if (isAncientGfx && liveTarget) this.spawnAncientHitFx(gfx, liveTarget);
      else this.spawnEffect(gfx, ax, ay, this.impactScale(liveTarget), liveTarget ?? undefined);
    }
    else if (theme && !isAoe) this.spawnMagicImpact(ax, ay, theme, this.impactScale(liveTarget), travelX, travelY);
    else if (!theme && !gfx) this.spawnImpactParticles(p.x, p.y, p.color);
    if (p.hitSound) this.sound.play(p.hitSound, 60); // spell impact sfx (paired with its cast)
    // Archer arrows have no impact clip wired yet, and the generic melee "thud" is
    // wrong for a flying arrow — so they land silently (`arrowIcon` is set iff the
    // shot came from an archer). The Toxic dart is likewise silent on impact: its
    // venom is the payload, and the melee thud doesn't fit. Everything else thuds.
    const silent = !!p.arrowIcon || p.special === 'venom';
    let primaryKilled = false;
    if (isAoe) {
      // Magic barrages splash for reduced damage on non-primary targets so AoE
      // stays a side-grade to single-target; the cannon keeps full splash.
      const splash = p.type === 'cannonball' ? 1 : BARRAGE_SPLASH_FALLOFF;
      // Snapshot: damage() splices the live array as enemies die. The cannon's
      // blast widens by tier (blastRadius); Ancients barrages keep the 80px default.
      const radius = p.blastRadius ?? 80;
      const near = this.enemies.filter(e => distanceSq(e.x, e.y, p.x, p.y) <= radius * radius);
      // If the intended target died mid-flight, the closest enemy at impact takes
      // the full-damage primary hit so the barrage still lands "normally".
      const primary = target && near.includes(target)
        ? target
        : near.reduce<Enemy | null>((best, e) =>
            !best || distanceSq(e.x, e.y, p.x, p.y) < distanceSq(best.x, best.y, p.x, p.y) ? e : best, null);
      for (const e of near) {
        const isPrimary = e === primary;
        const scale = isPrimary ? 1 : splash;
        // Real hit-GFX (or themed fallback burst) on EVERY struck enemy — a
        // barrage paints its spell's authentic impact across the whole clump,
        // like in the client. Ancients GFX fit each struck model at full size
        // (every barraged NPC wears its own ice cube); other impacts shrink on
        // splash targets (IMPACT_SPLASH_SCALE) to read as the reduced damage.
        // Direction (procedural only): primary keeps the shot's travel; splash
        // debris is thrown outward from the blast centre.
        const dx = isPrimary ? travelX : e.x - p.x;
        const dy = isPrimary ? travelY : e.y - p.y;
        if (gfx) {
          if (isAncientGfx) this.spawnAncientHitFx(gfx, e);
          else this.spawnEffect(gfx, e.x, e.y, this.impactScale(e) * (isPrimary ? 1 : IMPACT_SPLASH_SCALE), e);
        }
        else if (theme) this.spawnMagicImpact(e.x, e.y, theme, this.impactScale(e) * (isPrimary ? 1 : IMPACT_SPLASH_SCALE), dx, dy);
        // Blood barrage: bonus damage as a % of this enemy's max HP, splash-scaled, capped per hit.
        const bonus = p.bonusMaxHpFrac
          ? bloodBonus(e.maxHp, p.bonusMaxHpFrac, p.bonusMaxHpCap ?? Infinity, scale)
          : 0;
        const dmg = Math.floor(p.damage * scale) + bonus;
        const killed = this.damage(e, dmg, 'hit', false, silent, 0, style,
          { towerId: p.sourceTowerId, tag: isPrimary ? 'direct' : 'splash', aura: p.aura, bloodFrac: dmg > 0 ? bonus / dmg : 0 });
        if (isPrimary) primaryKilled = killed;
        if (!killed) { this.applyOnHit(e, p); this.applyVenomTips(e); }
      }
    } else if (target) {
      // Single-target: only resolves if the target is still alive at impact;
      // otherwise the bolt just fizzles where the target was (particles only).
      const bonus = p.bonusMaxHpFrac
        ? bloodBonus(target.maxHp, p.bonusMaxHpFrac, p.bonusMaxHpCap ?? Infinity)
        : 0;
      const dmg = p.damage + bonus;
      primaryKilled = this.damage(target, dmg, 'hit', false, silent, 0, style,
        { towerId: p.sourceTowerId, tag: 'direct', aura: p.aura, bloodFrac: dmg > 0 ? bonus / dmg : 0 });
      if (!primaryKilled) { this.applyOnHit(target, p); this.applyVenomTips(target); }
      // Pierce (roguelite transform): the bolt punches through to the nearest
      // *other* enemy near the impact, landing a second full hit.
      if (this.runFx.pierce) this.pierceThrough(p, target);
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
   * at 75%. Bosses start at 50% and climb to 90% by wave. A boss the stall-breaker
   * has flagged is topped up on top of that, to the point of outright immunity —
   * which is what stops control alone from holding a fight open forever.
   */
  tenacity(e: Enemy): number {
    return debuffTenacity({
      isBoss: e.isBoss,
      superior: e.type.startsWith('superior_'),
      wave: this.wave,
      debuffHits: e.debuffHits,
      bonus: stallTenacityBonus(e.bossState?.stallStacks ?? 0),
    });
  }

  /** Register a non-damaging debuff landing on an enemy: bosses build tenacity
   *  (+1% per hit) from it. No-op for non-bosses. Continuous auras shouldn't call
   *  this (they'd inflate the counter every frame). The counter decays each frame
   *  (`decayDebuffHits`), so it measures the control *currently* being sustained. */
  private noteDebuffHit(e: Enemy) {
    if (e.isBoss) e.debuffHits = (e.debuffHits ?? 0) + 1;
  }

  /** Apply the move-speed slow (toxic/ice/enfeeble), shortened by the enemy's
   *  tenacity. `count` registers the hit for boss tenacity; pass false for the
   *  per-frame utility aura so it doesn't inflate the counter. `spread` lets the
   *  Chain Freeze card propagate the slow to neighbours (once, non-spreading). */
  private applySlow(e: Enemy, seconds = 2, count = true, spread = true) {
    if (isCcImmune(e.affixes ?? [])) return; // Warded affix: ignores slows/freezes
    const eff = seconds * (1 - this.tenacity(e));
    if (count) this.noteDebuffHit(e);
    if (eff <= 0) return;
    e.speed = e.baseSpeed * 0.5;
    e.slowTimer = Math.max(e.slowTimer, eff);
    // Chain Freeze (roguelite transform): the chill jumps to nearby enemies, so
    // a single slow source locks down a cluster. Neighbours don't re-spread.
    const r = this.runFx.chainFreezeRadius;
    if (spread && r > 0) {
      for (const o of this.enemies) {
        if (o !== e && o.slowTimer <= 0 && distanceSq(o.x, o.y, e.x, e.y) <= r * r) {
          this.addBolt(e.x, e.y, o.x, o.y, '#7ad7ff', 0.3); // the chill jumping across
          this.applySlow(o, seconds, false, false);
        }
      }
    }
  }

  /** Venom Tips (roguelite transform): stack a venom DoT on every hit, ramping
   *  to a damage-scaled cap (shares the enemy's `venom` slot with the Toxic tower). */
  private applyVenomTips(e: Enemy) {
    const v = this.runFx.venomTips;
    if (!v) return;
    const dots = (e.dots ??= {});
    const cur = dots.venom;
    const cap = v.dps * 3;
    if (cur) { cur.dps = Math.min(cap, cur.dps + v.dps); cur.timer = Math.max(cur.timer, v.dur); }
    else dots.venom = { timer: v.dur, dps: v.dps, accum: 0, tickTimer: 0 };
    // A couple of green venom motes flick off the target on each envenomed hit.
    for (let i = 0; i < 2; i++) {
      this.particles.push({ x: e.x + (Math.random() - 0.5) * 10, y: e.y, vx: (Math.random() - 0.5) * 40, vy: -20 - Math.random() * 30, life: 0.45, maxLife: 0.45, color: '#6abe30', size: 2 });
    }
  }

  /** Pierce (roguelite transform): land a second full hit on the nearest enemy
   *  other than `target` within the impact radius. Depth-guarded via damage(). */
  private pierceThrough(p: Projectile, target: Enemy) {
    const r = this.runFx.pierce?.radius ?? 0;
    if (r <= 0) return;
    let best: Enemy | null = null;
    let bestD = r * r;
    for (const o of this.enemies) {
      if (o === target) continue;
      const d = distanceSq(o.x, o.y, target.x, target.y);
      if (d <= bestD) { bestD = d; best = o; }
    }
    if (!best) return;
    this.addBolt(target.x, target.y, best.x, best.y, '#ffe08a', 0.22); // the bolt punching through
    // A second full hit from the same bolt — credit the firing tower (with its aura).
    const killed = this.damage(best, p.damage, 'hit', false, true, 1, this.projectileStyle(p),
      { towerId: p.sourceTowerId, tag: 'direct', aura: p.aura });
    if (!killed) { this.applyOnHit(best, p); this.applyVenomTips(best); }
  }

  private applyOnHit(e: Enemy, p: Projectile) {
    // Warded affix: shrug off the movement crowd-control specials (slow handled in
    // applySlow; stun/pushback/crush guarded here). DoTs and amp still apply.
    if (isCcImmune(e.affixes ?? []) && (p.special === 'stun' || p.special === 'pushback' || p.special === 'crush')) return;
    // Source style, stamped on any DoT raised below so boss style-resistance
    // (Zulrah's phases) reduces the over-time damage — notably Fire's %max-HP
    // burn — just as it already reduces the projectile's direct hit.
    const style = this.projectileStyle(p);
    const fx = p.sourceTowerId ?? RUN_FX_ID; // DPS-meter owner for this hit's effects
    switch (p.special) {
      case 'slow':
        this.applySlow(e);
        this.stats.recordEffect(fx, this.wave, { slowCount: 1 });
        break;
      case 'stun': {
        const eff = (p.aoe ? 0.8 : 2) * (1 - this.tenacity(e));
        this.noteDebuffHit(e);
        if (eff > 0) {
          e.stunTimer = Math.max(e.stunTimer, eff);
          this.stats.recordEffect(fx, this.wave, { stunCount: 1, stunSeconds: eff });
        }
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
        if (cur) { cur.timer = Math.max(cur.timer, dur); cur.dps = Math.max(cur.dps, dps); cur.style = style; cur.sourceTowerId = p.sourceTowerId; }
        else dots[kind] = { timer: dur, dps, accum: 0, tickTimer: 0, style, sourceTowerId: p.sourceTowerId };
        break;
      }
      case 'amp': {
        const eff = 3 * (1 - this.tenacity(e));
        this.noteDebuffHit(e);
        if (eff > 0) {
          e.vulnTimer = Math.max(e.vulnTimer ?? 0, eff);
          this.stats.recordEffect(fx, this.wave, { ampCount: 1 });
        }
        break;
      }
      case 'pushback': {
        // The wizard's Air gust shoves by AIR_KNOCKBACK; the TzHaar always knocks
        // back too, scaled by its weapon tier (½·=·+50%·×2 of Air).
        const src = p.sourceTowerId ? this.towers.find(t => t.id === p.sourceTowerId) : undefined;
        const dist = (src?.type === 'tzhaar' ? tzhaarKnockback(src.level) : AIR_KNOCKBACK) * (1 - this.tenacity(e));
        const moved = this.knockback(e, dist);
        this.noteDebuffHit(e);
        if (moved > 0) this.stats.recordEffect(fx, this.wave, { pushCount: 1, pushTiles: moved / GRID });
        // TzHaar always stuns on hit now (0.3s/0.45s at the dagger tiers) so the
        // shove reads as a real setback instead of an instant walk-back.
        if (src?.type === 'tzhaar') {
          if (moved > 0) this.addRing(e.x, e.y, 3, 16, '#ffb066', 0.28, 2);
          const eff = tzhaarStun(src.level) * (1 - this.tenacity(e));
          if (eff > 0) {
            e.stunTimer = Math.max(e.stunTimer, eff);
            this.stats.recordEffect(fx, this.wave, { stunCount: 1, stunSeconds: eff });
          }
        }
        break;
      }
      case 'crush': {
        // TzHaar maul: a tier-scaled shove (see tzhaarKnockback) plus a brief stun —
        // a crushing blow.
        const src = p.sourceTowerId ? this.towers.find(t => t.id === p.sourceTowerId) : undefined;
        const moved = this.knockback(e, tzhaarKnockback(src?.level ?? 3) * (1 - this.tenacity(e)));
        if (moved > 0) this.addRing(e.x, e.y, 3, 16, '#ffb066', 0.28, 2);
        const eff = tzhaarStun(src?.level ?? 3) * (1 - this.tenacity(e));
        this.noteDebuffHit(e);
        if (eff > 0) e.stunTimer = Math.max(e.stunTimer, eff);
        this.stats.recordEffect(fx, this.wave, {
          ...(moved > 0 ? { pushCount: 1, pushTiles: moved / GRID } : {}),
          ...(eff > 0 ? { stunCount: 1, stunSeconds: eff } : {}),
        });
        break;
      }
      case 'venom': {
        // Toxic venom: its OWN DoT (tracked apart from Smoke `poison`) that ramps
        // each reapply up to a damage-scaled cap and keeps ticking after the enemy
        // leaves range. DoT → tenacity-immune; splats a darker green than poison.
        const { step, cap, dur } = venomRamp(p.damage);
        const dots = (e.dots ??= {});
        const cur = dots.venom;
        if (cur) { cur.dps = Math.min(cap, cur.dps + step); cur.timer = Math.max(cur.timer, dur); cur.style = style; cur.sourceTowerId = p.sourceTowerId; }
        else dots.venom = { timer: dur, dps: step, accum: 0, tickTimer: 0, style, sourceTowerId: p.sourceTowerId };
        break;
      }
      default:
        break;
    }
  }

  /** Blood barrage lifesteal: a level-scaled chance to restore one life. On a
   *  success, ring the casting tower red and bump `lifestealSeq` so the UI can
   *  celebrate it (lives-orb blip + floating heart). */
  private tryLifesteal(sourceTowerId?: string) {
    if (this.lives >= this.maxLives) return;
    const tower = sourceTowerId ? this.towers.find(t => t.id === sourceTowerId) : null;
    if (Math.random() >= lifestealChance(tower?.level ?? 1)) return;
    this.lives += 1;
    this.lifestealSeq += 1;
    if (tower) this.addRing(tower.x, tower.y, 4, 26, '#c81e1e', 0.5, 3);
    this.emit();
  }

  /** Air gust: shove an enemy back toward the previous waypoint (clamped).
   *  Returns the distance actually moved (logic px), for the damage-meter's
   *  "tiles pushed" tally. */
  private knockback(e: Enemy, dist: number): number {
    const prev = this.path[e.pathIndex];
    if (!prev) return 0;
    const r = knockbackStep(e.x, e.y, prev.x, prev.y, dist);
    e.x = r.x;
    e.y = r.y;
    return r.moved;
  }

  /** Per-hit size multiplier for a magic impact, derived from the struck model
   *  (a boss's 60px half-size vs a normal 30px), around the halved baseline, with
   *  ±15% random jitter so no two bursts are identical. `null` (a fizzle with no
   *  live target) falls back to a normal-sized enemy. */
  private impactScale(e: Enemy | null): number {
    const modelSize = e ? (e.isBoss ? 60 : 30) * (e.renderScale ?? 1) : 30;
    const modelScale = Math.min(2.2, Math.max(0.7, modelSize / 30)); // 1 = normal, ~2 = boss
    const jitter = 0.85 + Math.random() * 0.3;
    return IMPACT_BASE_SCALE * modelScale * jitter;
  }

  /** Element-themed magic impact: a themed particle debris burst (the star) plus a
   *  few leading shards, from {@link IMPACT_RECIPES} (this engine applies the jitter
   *  + direction). Deliberately has NO round bloom/ring — the hit reads like the
   *  enemy death shatter but **directional**: debris flies off the model along
   *  `dirX,dirY` (the shot's travel direction, or outward-from-blast for splash),
   *  fanned within the recipe's `spread` and shoved forward by `forwardBias`, in the
   *  element's own colour (keyed off the projectile, via {@link resolveImpactTheme}).
   *  Everything spatial scales by `scale`; counts wobble ±1 for shape variety. If
   *  `dirX,dirY` is ~zero the burst falls back to a full radial spray. */
  private spawnMagicImpact(x: number, y: number, theme: ImpactTheme, scale = 1, dirX = 0, dirY = 0) {
    const r = IMPACT_RECIPES[theme];
    // Impact direction: unit vector the debris is pushed along. Degenerate (a shot
    // that landed on its own launch point / a dead-centre splash) → full radial.
    const dlen = Math.hypot(dirX, dirY);
    const hasDir = dlen > 0.001;
    const baseAngle = hasDir ? Math.atan2(dirY, dirX) : 0;
    const ux = hasDir ? dirX / dlen : 0;
    const uy = hasDir ? dirY / dlen : 0;
    const pc = r.particles;
    // Fan the debris off the model within ±spread of the impact direction (or the
    // full circle when we have no direction), then shove it forward along the hit.
    const spread = hasDir ? pc.spread : Math.PI;
    const count = Math.max(3, pc.count + (((Math.random() * 3) | 0) - 1)); // ±1 for shape variety
    for (let i = 0; i < count; i++) {
      const angle = baseAngle + (Math.random() * 2 - 1) * spread;
      const speed = (pc.speedMin + Math.random() * (pc.speedMax - pc.speedMin)) * scale;
      const push = hasDir ? pc.forwardBias * scale : 0;
      const life = pc.lifeMin + Math.random() * (pc.lifeMax - pc.lifeMin);
      this.particles.push({
        x, y,
        vx: Math.cos(angle) * speed + ux * push,
        vy: Math.sin(angle) * speed + uy * push + pc.riseBias * scale,
        life,
        maxLife: life,
        color: pc.colors[(Math.random() * pc.colors.length) | 0],
        gravity: pc.gravity * scale,
        size: (pc.sizeMin + Math.random() * (pc.sizeMax - pc.sizeMin)) * scale,
      });
    }
    // A few leading shards — the "crack" — biased the same way (tighter cone).
    const sh = r.shards;
    const shardCount = Math.max(2, sh.count + (((Math.random() * 3) | 0) - 1)); // ±1 for shape variety
    const shardSpread = hasDir ? spread * 0.7 : Math.PI;
    for (let i = 0; i < shardCount; i++) {
      const a = baseAngle + (Math.random() * 2 - 1) * shardSpread;
      const len = (sh.lenMin + Math.random() * (sh.lenMax - sh.lenMin)) * scale;
      this.addBolt(x, y, x + Math.cos(a) * len, y + Math.sin(a) * len, sh.color, sh.life);
    }
    // Mystical accent: a handful of slow, bright arcane sparks that drift *upward*
    // (against the debris' fall) and twinkle in the element's glow colour — the
    // "magic" sheen over the physical shatter. Rendered additively as 4-point stars.
    const sp = r.spark;
    const sparkCount = Math.max(2, Math.round(sp.count * Math.min(1.5, Math.max(0.7, scale))));
    for (let i = 0; i < sparkCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = (16 + Math.random() * 40) * scale; // gentle outward drift
      const push = hasDir ? pc.forwardBias * 0.3 * scale : 0; // slight nudge along the hit
      const life = sp.life * (0.7 + Math.random() * 0.6);
      this.particles.push({
        x, y,
        vx: Math.cos(angle) * speed + ux * push,
        vy: Math.sin(angle) * speed + uy * push - (28 + Math.random() * 42) * scale, // float up
        life,
        maxLife: life,
        color: sp.color,
        gravity: 28 * scale, // barely falls — the spark hangs and shimmers
        size: sp.size * (0.8 + Math.random() * 0.5) * scale,
        twinkle: true,
      });
    }
  }

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
   *  colours the hitsplat; `minor` (DoT) draws it small/below, drifting aside.
   *  `depth` guards the on-kill chain cards (ricochet / overkill / streak smite)
   *  against unbounded recursion — chains only fire from a depth-0 (direct) kill. */
  private damage(enemy: Enemy, amount: number, kind: HitsplatKind = 'hit', minor = false, silent = false, depth = 0, style?: CombatStyle, source?: DamageSource): boolean {
    // Water "amp" makes the enemy take extra damage from every source; the Slayer
    // Helmet adds an on-task bonus vs the current task's monster. The Armored affix
    // halves damage from its rolled style (DoT/no-style hits are unaffected).
    const vuln = enemy.vulnTimer && enemy.vulnTimer > 0 ? 1.25 : 1;
    const onTask = this.slayer.onTaskBonus(enemy.type);
    const resist = styleDamageMult(enemy.armoredStyle, style);
    // Boss phase bias: Zulrah's per-form style rock-paper-scissors, and a 0 while
    // Vorkath's ice shield is up (fully immune). Neutral for non-boss enemies.
    const bossMult = bossStyleMult(enemy.bossState, style);
    // A boss's escort shrugs off splash aimed at the boss, so its mechanic has to be
    // answered rather than incidentally deleted. Focused fire is unaffected.
    const escortMult = escortDamageMult(!!enemy.escort, source?.tag);
    let dealt = Math.max(0, Math.floor(amount * vuln * onTask * resist * bossMult * escortMult));
    // Shielded affix: damage is drained from the shield pool before HP is touched.
    if (enemy.shieldHp && enemy.shieldHp > 0 && dealt > 0) {
      const a = absorbWithShield(enemy.shieldHp, dealt);
      enemy.shieldHp = a.shield;
      dealt = a.dmg;
    }
    enemy.hp -= dealt;
    // DPS meter: credit the dealt damage to its source (splitting off any Utility-
    // aura extra), plus the effect-specific tallies (DoT damage, splash hits, the
    // Slayer Helmet's on-task slice) so the panel can break them out per tower.
    if (source && dealt > 0) {
      this.stats.recordDamage(source, this.wave, enemy.type, dealt);
      const owner = source.towerId ?? RUN_FX_ID;
      if (source.tag === 'burn') this.stats.recordEffect(owner, this.wave, { burnDmg: dealt });
      else if (source.tag === 'poison') this.stats.recordEffect(owner, this.wave, { poisonDmg: dealt });
      else if (source.tag === 'venom') this.stats.recordEffect(owner, this.wave, { venomDmg: dealt });
      else if (source.tag === 'chain') this.stats.recordEffect(owner, this.wave, { chainDmg: dealt });
      else if (source.tag === 'splash') this.stats.recordEffect(owner, this.wave, { splashHits: 1 });
      if (source.towerId && onTask > 1) {
        this.stats.recordEffect(source.towerId, this.wave, { taskBonusDmg: dealt * (1 - 1 / onTask) });
      }
      // Blood's %-max-HP bonus rode into `amount` and through the same multipliers,
      // so its share of what actually landed is its share of the raw hit.
      if (source.bloodFrac) this.stats.recordEffect(owner, this.wave, { bloodBonusDmg: dealt * source.bloodFrac });
    }
    // Jad: remember damage that actually landed, for the Yt-HurKot heal window.
    if (dealt > 0 && enemy.bossState?.kind === 'jad') {
      (enemy.bossState.recentDamage ??= []).push({ t: this.gameTime, amount: dealt });
    }
    // Hydra: damage dealt during an open vent counts toward shattering it — the
    // figure *before* the vent's hardening cut, or the player would pay for that
    // cut twice and the bar could never fill (see `hydraVentCredit`).
    if (dealt > 0 && enemy.bossState?.kind === 'hydra' && enemy.bossState.venting) {
      enemy.bossState.ventDamage = (enemy.bossState.ventDamage ?? 0) + hydraVentCredit(dealt);
    }
    // Executioner relic: a non-boss reduced to a sliver is slain outright (bosses,
    // their phases, and Jad's healers are immune).
    if (dealt > 0 && !enemy.isBoss && !enemy.bossState && !enemy.escort &&
        shouldExecute(this.relicFx.executeFrac, enemy.hp, enemy.maxHp)) {
      enemy.hp = 0;
    }
    if (!minor) {
      enemy.flashTimer = 0.15; // visual hit-pop (direct hits only)
      // Play the WHOLE hurt flinch (priority over walk) before reverting — sizing
      // the window to the clip's own length, not a fixed slice that cut it short.
      // An animation can't be interrupted by a new one of the same priority: a
      // fresh hit while the flinch is still playing does NOT restart it (else
      // rapid hits would freeze the enemy on frame 0). Death (higher priority)
      // still wins — a dying enemy leaves `enemies` entirely. The flash above
      // still fires every hit, so feedback isn't lost.
      const animSlug = enemy.animType && ENEMY_ANIMS[enemy.animType] ? enemy.animType : enemy.type;
      const hurtClip = ENEMY_ANIMS[animSlug]?.clips.hurt;
      if (hurtClip && (enemy.hurtAnim ?? 0) <= 0) enemy.hurtAnim = clipDurationS(hurtClip);
    }
    const below = enemy.isBoss ? 30 : 16;
    // DoT splats fan into per-kind lanes (side + rise) so an enemy carrying
    // several shows them clearly apart rather than one overriding the next:
    // burn drifts left/up, poison right/up, venom right/down. See DOT_LANE.
    const lane = minor ? DOT_LANE[kind as DotKind] : undefined;
    const side = lane?.side ?? 0;
    const rise = lane?.rise ?? 0;
    this.hitsplats.push({
      x: enemy.x + side * 14 + (Math.random() - 0.5) * (minor ? 8 : 16),
      y: minor ? enemy.y + below : enemy.y - 18,
      value: dealt,
      kind: dealt > 0 ? kind : 'miss',
      life: HITSPLAT_LIFE,
      minor: minor || undefined,
      vx: minor ? side * 30 + (Math.random() - 0.5) * 16 : 0,
      vy: minor ? rise * -26 : 0,
    });
    if (dealt > 0 && !minor && !silent) this.sound.play('hit', 70);
    if (enemy.hp > 0) return false;
    const i = this.enemies.indexOf(enemy);
    if (i < 0) return false;
    // Overkill = damage spilled past 0 HP (for the Scythe cleave card).
    const overkillDmg = Math.max(0, -enemy.hp);
    const killX = enemy.x, killY = enemy.y;
    this.enemies.splice(i, 1);
    this.spawnDeathParticles(enemy);
    // Animated enemies play their full death-collapse clip; others use the brief
    // shrink-and-fade of the static sprite.
    const deathSlug = enemy.animType && ENEMY_ANIMS[enemy.animType] ? enemy.animType : enemy.type;
    const deathClip = ENEMY_ANIMS[deathSlug]?.clips.death;
    const deathLife = deathClip ? clipDurationS(deathClip) : 0.45;
    this.deaths.push({
      x: enemy.x,
      y: enemy.y,
      type: enemy.type,
      animType: enemy.animType,
      isBoss: !!enemy.isBoss,
      renderScale: enemy.renderScale,
      movingLeft: (this.path[enemy.pathIndex + 1]?.x ?? enemy.x) < enemy.x,
      life: deathLife,
      maxLife: deathLife,
    });
    // Per-enemy-type death clip (registered as `death_<type>` in sound.ts);
    // falls back to the generic `death` for anything unmapped.
    const deathKey = `death_${enemy.type}`;
    this.sound.play(deathKey in GAME_SOUNDS ? deathKey : 'death', 40);
    // Debug/sandbox enemies pay nothing and don't progress anything — they exist
    // only to test towers/enemies. Jad's healers likewise award nothing (their
    // payoff is denying Jad's heal). The death FX above still play.
    // An escort with its own Collection Log line (nested under the boss that
    // summons it) still records the kill, even though it pays nothing — the entry
    // would otherwise be permanently unobtainable. Gated on `summonedBy` rather
    // than `escort`, because not every escort is its own monster: a Yt-HurKot
    // carries `type: 'imp'` purely as its stat line (its name and model are its
    // own), so counting escorts wholesale would file Jad's healers as Imp kills.
    if (!enemy.debug && enemy.escort && ENEMIES[enemy.type]?.summonedBy) {
      this.killCounts = { ...this.killCounts, [enemy.type]: (this.killCounts[enemy.type] ?? 0) + 1 };
    }
    if (!enemy.debug && !enemy.escort) {
      // Greed curse (×goldMult) and the active wave event (×event gold, e.g. Blood
      // Moon's harder-wave payout) both scale the drop; both default to 1.
      this.awardGold(this.killGoldPreReward(enemy.type));
      this.kills += 1;
      // New object each kill so the UI's persistence effect sees the change.
      this.killCounts = { ...this.killCounts, [enemy.type]: (this.killCounts[enemy.type] ?? 0) + 1 };
      // Bigger and Badder (Slayer shop): the task monster can rise again, right
      // where it fell, as its Superior form. Rolled BEFORE recordKill, so the kill
      // that finishes a task can still spawn one — the superior is the send-off.
      const superior = this.slayer.rollSuperior(enemy.type);
      this.slayer.recordKill(enemy.type);
      if (superior) this.raiseSuperior(superior, enemy);
      this.onKillChains(killX, killY, dealt, overkillDmg, depth);
      // Volatile affix: a death blast briefly disables the nearest tower.
      if (enemy.affixes?.includes('volatile')) this.detonateVolatile(killX, killY);
    }
    this.emit();
    return true;
  }

  /**
   * Bigger and Badder: raise `type` (a Superior) out of the corpse of `fallen`,
   * carrying on from exactly where it stood — same point on the road, same progress
   * along it. It is scaled for the current wave like any other spawn, so a superior
   * met late is a late-game threat, and it is worth its own (much larger) gold and
   * essence when it dies.
   */
  private raiseSuperior(type: EnemyType, fallen: Enemy) {
    const e = this.makeEnemy(type, this.wave);
    if (!e) return;
    e.x = fallen.x;
    e.y = fallen.y;
    e.pathIndex = fallen.pathIndex;
    this.enemies.push(e);
    // A green shockwave out of the corpse — the moment reads as a rise, not a spawn.
    this.addRing(e.x, e.y, 6, 60, '#9fe855', 0.55, 4);
    this.sound.play('wave', 55);
    this.notify(`${e.name} rises!`, ASSETS.misc.slayer_crossbow);
  }

  /** Volatile affix: on death, disable the nearest tower for a beat and pop a
   *  warning spotanim at the blast so the threat reads clearly. */
  private detonateVolatile(x: number, y: number) {
    let best: Tower | null = null;
    let bestD = Infinity;
    for (const t of this.towers) {
      const d = distanceSq(t.x, t.y, x, y);
      if (d < bestD) { bestD = d; best = t; }
    }
    // An orange shockwave + sparks for the detonation (NOT the spawn-portal
    // spotanim, which read as a gateway opening on the corpse).
    this.addRing(x, y, 6, 46, '#ff7a3c', 0.45, 4);
    for (let i = 0; i < 10; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 60 + Math.random() * 120;
      this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.35, maxLife: 0.35, color: '#ff8a3c', size: 2 });
    }
    if (best) {
      best.disabledTimer = Math.max(best.disabledTimer, VOLATILE_STUN_SECS);
      this.sound.play('hit', 80);
    }
  }

  /** Roguelite on-kill chain cards. Soul Split (heal) and the streak meter count
   *  every kill (chained ones too); the damaging follow-ups (ricochet, overkill
   *  cleave, streak smite) only fire from a direct kill (`depth===0`) and deal
   *  their damage at depth 1, so a cascade can advance the meter but never recurse
   *  without bound. */
  private onKillChains(x: number, y: number, dealt: number, overkillDmg: number, depth: number) {
    const fx = this.runFx;
    fx.killTally += 1;
    // Soul Split: every Nth kill restores a life (up to the cap) — green heal
    // ring + rising motes at the kill so the restore reads where it happened.
    if (fx.soulSplitEvery > 0 && fx.killTally % fx.soulSplitEvery === 0 && this.lives < this.maxLives) {
      this.lives += 1;
      this.addRing(x, y, 4, 36, '#7CFC6A', 0.6, 3);
      for (let i = 0; i < 8; i++) {
        const a = Math.random() * Math.PI * 2;
        this.particles.push({ x, y, vx: Math.cos(a) * 22, vy: -40 - Math.random() * 40, life: 0.6, maxLife: 0.6, color: '#9dffa0', gravity: 90, size: 2.4 });
      }
    }
    if (depth > 0) return; // follow-ups don't recurse
    // Kill Streak (Dragon Warhammer): every Nth kill, a shockwave smites every
    // enemy on the field — a big gold ring from centre + a white burst per enemy.
    if (fx.killStreak && fx.killTally % fx.killStreak.every === 0) {
      this.addRing(this.width / 2, this.height / 2, 24, Math.max(this.width, this.height) * 0.62, '#ffd257', 0.55, 7);
      for (const e of [...this.enemies]) {
        this.addRing(e.x, e.y, 2, 26, '#fff2c0', 0.35, 3);
        this.damage(e, fx.killStreak.damage, 'hit', false, true, 1, undefined, { tag: 'chain' });
      }
    }
    // Ricochet (Dragon Claws): arc a fraction of the killing blow into the nearest
    // enemy — a cyan claw-spec bolt.
    if (fx.ricochet) this.chainNearest(x, y, fx.ricochet.radius, Math.max(1, Math.floor(dealt * fx.ricochet.frac)), '#bfe8ff');
    // Overkill (Scythe): cleave the spilled damage outward — a red cleave ring +
    // a red bolt to the enemy it carries into.
    if (fx.overkill && overkillDmg > 0) {
      this.addRing(x, y, 6, fx.overkill.radius, '#ff7a4c', 0.4, 4);
      this.chainNearest(x, y, fx.overkill.radius, overkillDmg, '#ff5a3c');
    }
  }

  /** Deal `dmg` to the nearest enemy within `radius` of (x,y), at chain depth 1.
   *  Arcs a coloured bolt to the struck enemy so the chain is visible. */
  private chainNearest(x: number, y: number, radius: number, dmg: number, color = '#bfe8ff') {
    let best: Enemy | null = null;
    let bestD = radius * radius;
    for (const o of this.enemies) {
      const d = distanceSq(o.x, o.y, x, y);
      if (d <= bestD) { bestD = d; best = o; }
    }
    if (best) {
      this.addBolt(x, y, best.x, best.y, color);
      // Card-driven chain FX (ricochet / overkill cleave) — bucketed as Run Effects.
      this.damage(best, dmg, 'hit', false, true, 1, undefined, { tag: 'chain' });
    }
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
    this.sound.fadeCombat();
    this.activeEvent = null; // the event lasts exactly its wave — clear it on clear
    // A debug sandbox wave clears with no payout and no progression — it leaves
    // the run exactly as it was before spawning.
    if (this.sandboxWave) {
      this.sandboxWave = false;
      this.lastWaveSandbox = true; // flag the UI to show "Custom Wave Complete!"
      this.emit();
      return;
    }
    // Read before `wave` advances: bossWave still describes the wave just cleared.
    const bossCleared = this.bossWave;
    this.awardGold(Math.round(waveClearBonus(this.wave) * GENERAL_GOLD_FACTOR));
    const waveEssence = essenceForWave(this.wave);
    this.meta.award(waveEssence); // essence reward for the cleared wave
    this.essenceEarnedThisRun += waveEssence;
    // Banker's Note relic: pay interest on the gold on hand (capped, full value —
    // it's a relic reward, so it skips the general-flow factor).
    if (this.relicFx.interest) {
      const gain = interestGain(this.relicFx.interest.rate, this.relicFx.interest.cap, this.money);
      if (gain > 0) this.awardGold(gain);
    }
    // Blood Pact curse: clearing a wave costs a life (the price of its +damage).
    if (this.runFx.bloodPact) {
      this.lives -= 1;
      this.baseFlash = 1;
      if (this.checkLethal()) { this.emit(); return; }
    }
    this.wave += 1;
    this.checkPrayerUnlocks(); // celebrate any tower prayers gating on the new wave
    this.prayer.refill(); // top up to the new wave's (possibly larger) pool
    this.ge.onWaveCleared(); // drift shop prices toward this wave's demand
    // Roguelite: beating a boss is the run's reward beat — it offers a run-defining
    // relic. Once every relic is owned the boss pays a *boosted* card hand instead,
    // so a late boss is still worth something. Ordinary waves pay nothing: cards are
    // bought with gold (see buyCardRoll), which is what makes the gold a choice.
    if (this.gameMode === 'roguelite' && !this.gameOver && bossCleared) {
      const relicChoice = rollRelicChoice(Math.random, new Set(this.ownedRelics.map(r => r.id)));
      if (relicChoice.length > 0) {
        this.pendingRelics = relicChoice;
        this.sound.play('interface_open');
      } else {
        this.offerDraft(true);
      }
    }
    // Roll the next Slayer task now (idempotent — only fires when the last task was
    // just completed) so it is assigned during prep, not at Start Wave. This keeps
    // the next-wave preview exact: computeWaveConfigs folds in the task's seed, and
    // startWave reuses the same memoised makeup. The player also sees their task
    // while placing towers.
    if (!this.gameOver) this.slayer.assignTask();
    this.emit();
  }

  /** Roll and offer a fresh draft hand (bigger if Production Prodigy is owned) and
   *  refill the re-roll allowance (Trickster). `boosted` swaps in the boss-reward
   *  rarity odds; it also latches so a Trickster re-roll of a boosted hand stays
   *  boosted rather than quietly downgrading the boss's prize. */
  private offerDraft(boosted = false) {
    this.draftBoosted = boosted;
    this.pendingDraft = rollDraft(
      Math.random,
      3 + this.relicFx.handBonus,
      availableCards(this.draftedUnique),
      boosted ? BOOSTED_RARITY_WEIGHT : RARITY_WEIGHT,
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
  private checkLethal(): boolean {
    if (this.lives > 0) return false;
    if (this.relicFx.cheatDeathLeft > 0) {
      this.relicFx.cheatDeathLeft -= 1;
      this.lives = 1;
      this.addRing(this.width / 2, this.height / 2, 24, Math.max(this.width, this.height) * 0.5, '#9dffa0', 0.7, 8);
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
      case 'soulSplit': this.runFx.soulSplitEvery = e.every; break;
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
      case 'gold': this.awardGold(e.amount); break;
      case 'essence': this.meta.award(e.amount); this.essenceEarnedThisRun += e.amount; break;
      case 'life': this.lives = Math.min(this.maxLives, this.lives + e.amount); break;
      case 'maxLife': this.maxLives += e.amount; this.lives += e.amount; break;
      case 'damage': this.applyStyleMult(this.runMods.damage, e.mult, e.style); break;
      case 'range': this.applyStyleMult(this.runMods.range, e.mult, e.style); break;
      case 'fireRate': this.applyStyleMult(this.runMods.fireRate, e.mult, e.style); break;
      // ── on-kill chain reactions ──
      case 'ricochet': this.runFx.ricochet = { frac: e.frac, radius: e.radius }; break;
      case 'overkill': this.runFx.overkill = { radius: e.radius }; break;
      case 'soulSplit': this.runFx.soulSplitEvery = e.every; break;
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
  private runDamageMult(): number {
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
      towers: structuredClone(this.towers),
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
    this.autoplayTimer = 0;
    this.previewCache = null;

    this.gameMode = save.gameMode;
    this.towers = structuredClone(save.towers);
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

    this.waveActive = false;
    this.gameOver = false;
    this.paused = false;
    this.waveTotal = 0;
    this.bossWave = false;
    this.activeEvent = null;
    this.sandboxWave = false;
    this.lastWaveSandbox = false;
    this.baseFlash = 0;
    this.selectedTowerType = null;
    this.selectedTowerId = null;
    this.multiSelectedIds = [];
    this.movingTowerId = null;
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
    this.lives = START_LIVES;
    this.maxLives = START_LIVES;
    // Roguelite run-scoped state resets; the chosen game mode itself persists.
    this.runMods = freshRunMods();
    this.runFx = freshRunEffects();
    this.draftedUnique.clear();
    this.runCards = [];
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
    this.waveTotal = 0;
    this.bossWave = false;
    this.activeEvent = null;
    this.sandboxWave = false;
    this.lastWaveSandbox = false;
    this.baseFlash = 0;
    this.paused = false;
    this.waveActive = false;
    this.gameOver = false;
    this.selectedTowerType = null;
    this.selectedTowerId = null;
    this.multiSelectedIds = [];
    this.movingTowerId = null;
    this.pendingPlacement = null;
    this.gameTime = 0;
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
        const e = this.makeEnemy(t, this.wave);
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
        const e = this.makeEnemy(t, this.wave, this.buildForcedRoll(affixes));
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
    const e = this.makeEnemy(type, this.wave, forced);
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
    if (this.waveActive) this.checkWaveEnd();
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
