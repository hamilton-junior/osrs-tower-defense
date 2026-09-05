import type { Point, TowerBlueprint, EnemyType, TowerType, GlobalUpgrades, PrayerType, Element, MageMode, DotKind, CombatStyle, StyleWeakness, Item } from '../types';
import { ENEMIES } from '../data/enemies';
import { type DifficultyTier } from '../systems/difficulty';
import { type TowerSynergy } from '../systems/tower-combat';
import { type DpsSnapshot } from '../systems/combat-stats';
import { type GeListing } from '../systems/ge-system';
import { DRAFT_POOL, type DraftCard } from '../systems/roguelite-draft';
import { type EnemyAffix } from '../systems/affixes';
import { MECHANIC_BOSSES } from '../systems/boss-mechanics';
import { type DiversionId, type DiversionMood } from '../data/diversions';
import { type HunterTrapId } from '../data/hunter-traps';
import { type SeedId } from '../data/farming';
import { type PotionId } from '../data/herblore';
import { type PatchStage } from '../systems/farming';

/**
 * The engine's vocabulary: the board's fixed resolution, the shape of every
 * patch it sends React (`UIState`), the per-run effect records, and the small
 * pure helpers the simulation leans on.
 *
 * It lives beside `engine.ts` rather than inside it so the simulation modules
 * under `sim/` can share these without importing the engine back — that would be
 * a cycle. `engine.ts` re-exports the lot, so `@/lib/game/core/engine` stays the
 * one address the rest of the app knows. Moved out of engine.ts verbatim.
 */

/**
 * The board's one and only resolution — 45×20 whole tiles. Every player gets this
 * exact board, whatever their screen, window or `devicePixelRatio`: the map, the
 * road, the tower ranges and the enemy speeds are all in these units, so a wider
 * window must never mean a wider map or a proportionally shorter range. The page
 * only scales the finished picture (see `GameRoot`'s board container).
 *
 * The 2.25:1 (9:4) aspect sits near a maximised browser's real play area — a
 * landscape window minus its chrome and our fixed bottom bar — so little space is
 * left over beside it. Piece sizes are fixed logic pixels (a 30px enemy, a 1-tile
 * road), and the tile count is kept deliberately low so those fixed pieces read
 * BIG once the board is scaled to a screen: at 45×20 a tile is ~1/20 of the board's
 * height, so the picture sits "close" — fewer, larger tiles, less idle grass — and
 * every enemy/tower/road is a bigger fraction of the view than a finer grid gives.
 * (Trimmed from the old 54×24 for exactly this reason; the same 2.25:1 aspect keeps
 * the fit/letterbox identical, and the shorter road just means less dead walking.)
 */
export const LOGIC_WIDTH = 1440;
export const LOGIC_HEIGHT = 640;
export const GRID = 32;
export const TOWER_RADIUS = 15;
export const START_MONEY = 200;
export const START_LIVES = 20;

/** One entry in a collection-log-style "unlock" popup. The `kind` union is the
 *  extension point — prayers fire today; towers/spells/achievements can reuse
 *  the same popup by adding a kind + a producer that calls `announceUnlocks`. */
export interface UnlockItem {
  kind: 'prayer' | 'achievement';
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

export const freshStyleMods = (): StyleMods => ({ melee: 1, ranged: 1, magic: 1 });
export const freshRunMods = (): RunModifiers => ({
  damage: freshStyleMods(),
  range: freshStyleMods(),
  fireRate: freshStyleMods(),
});
export const cloneRunMods = (m: RunModifiers): RunModifiers => ({
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
  soulSteal: { bossHeal: number; addKills: number } | null; // Soul Eater relic: on-kill heal
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
export const SYNERGY_COLORS = {
  packTactics: '#57d957', // green — rally same kinds
  trinity: '#ffd257',     // gold — balanced triangle
  vanguard: '#ff7a3c',    // orange — frontline
  loneWolf: '#5ec8ff',    // cyan — solo
} as const;
export const freshRunEffects = (): RunEffects => ({
  ricochet: null,
  overkill: null,
  soulSteal: null,
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
export const freshRelicEffects = (): RelicEffects => ({
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
  /** Its combat-triangle weakness, when it answers to a bow or a blade rather than
   *  to an element. A monster never carries both (see data/enemies.ts). */
  styleWeakness?: StyleWeakness;
  /** Lives one of these takes if it leaks (see `enemyLeakCost`). Affixes are rolled
   *  at spawn, so a Colossal's doubled cost can't be previewed — bosses, the ones
   *  that actually hurt, are exact. */
  leakCost: number;
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
  /** Latched once every schedulable boss has fallen this run — shows the victory screen. */
  won: boolean;
  /** `'normal'` until victory; `'endless'` after the player continues past it. */
  runPhase: 'normal' | 'endless';
  /** Run summary for the victory stop-screen (null until `won`). */
  victory: { wave: number; seconds: number; bosses: number; mode: GameMode; tier: DifficultyTier } | null;
  selectedTowerType: TowerType | null;
  /** What the NEXT tower of each type costs right now, meta discount and same-type
   *  escalation included. Emitted rather than recomputed in the UI: the price moves
   *  with the board, so a dock quoting a fixed tier-1 price would be lying. */
  towerPrices: Record<TowerType, number>;
  /** How many towers stand on the board right now — the count on the Construction
   *  half of the build switch, the way the Hunter half counts laid traps. Not
   *  `towersBuilt`, which is a lifetime tally and never comes back down when one
   *  is sold. */
  towersOnBoard: number;
  selectedTowerId: string | null;
  /** Marquee multi-selection (tower ids) for the batch-upgrade panel. */
  multiSelectedIds: string[];
  movingTowerId: string | null;
  /** Towers being relocated as one rigid formation (empty unless a group move is
   *  in flight). Mutually exclusive with `movingTowerId`. */
  movingGroupIds: string[];
  /** Tiles painted by a Shift-drag. Bought only once the player confirms. */
  placeQueue: { x: number; y: number }[];
  /** Whether the painted line is finished (Shift is up) and awaiting its confirm. */
  queueArmed: boolean;
  /** Towers on the Ctrl+C clipboard (empty until something is copied). */
  clipboard: TowerBlueprint[];
  /** Whether the clipboard's formation is on the pointer waiting to be bought. */
  pasting: boolean;
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
  /** The pool as an unrounded 0..1 share, quantised to half a percent. The gauge
   *  reads this rather than `prayerPoints / prayerMax`: the number is rounded, and
   *  on a small pool a single point is several percent of the bar, so a bar driven
   *  off it drains in visible steps. */
  prayerFrac: number;
  /** Currently active prayers (cloneable list). */
  activePrayers: PrayerType[];
  /** Seconds left on a prayer shatter (General Graardor's slam), 0 when free. The panel
   *  greys itself out and counts this down. */
  prayerLock: number;
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
  /** Completed Combat Achievement ids, account-wide. Plain array: the snapshot
   *  crosses the boundary structuredClone'd. */
  achievements: string[];
  /** Whether this leg of the road has already spent its one tower fusion (see
   *  systems/tower-fusion). Travelling on hands the run another. */
  fusedThisLeg: boolean;
  /** Lifetime sighting count per boss type. A boss only rolls modifiers once it
   *  has appeared at least once, so a first encounter is always the "vanilla"
   *  fight; the count also ramps the lives a boss costs when it leaks. */
  bossesSeen: Record<string, number>;
  /** Lifetime pick counts per draft-card id (the Collection Log "Cards" tab). */
  cardCounts: Record<string, number>;
  /** Lifetime meetings per Distraction & Diversion id (the Collection Log
   *  "Diversions" tab). Counted when one turns up on the board, not when it is
   *  clicked — a walkby has nothing to click, and meeting one is the whole event. */
  diversionsMet: Record<string, number>;
  /** Lifetime forges per fusion type (the Collection Log "Forge" tab). Counted
   *  when a weapon is actually forged, so the tab is a record of what the account
   *  has built — not of what it is allowed to build, which is one achievement. */
  fusionsMade: Record<string, number>;
  /** True when the wave that just ended was a debug "custom wave" sandbox, so the
   *  UI can show a distinct "Custom Wave Complete!" banner. Reset when any wave
   *  starts. */
  lastWaveSandbox: boolean;
  /** Active game mode (`classic` / `roguelite`). */
  gameMode: GameMode;
  /** The New Game+ tier this run is played at (0 = Normal, today's game). */
  difficultyTier: DifficultyTier;
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
  /** The fork in the road: the regions offered at this leg's turn, each with the
   *  monsters native to it, or null between turns. Blocks Start Wave until answered
   *  (like {@link pendingDraft}) — the next wave's roster is the chosen region's. */
  pendingTravel: { id: string; name: string; locals: { type: string; name: string }[] }[] | null;
  /** Bumps once per Blood-barrage life steal — the UI keys its ❤ pop off it. */
  lifestealSeq: number;
  /** Bumps whenever a placed tower's displayed config changes (target priority,
   *  a wizard's element/barrage/field). The selected-/multi-tower panels read
   *  those fields straight off the live engine object, so this counter is what
   *  makes the change re-render instead of waiting for the next unrelated patch. */
  towerConfigSeq: number;
  /** Classic-mode loot bag: gear dropped this run, awaiting a tower. Empty/omitted
   *  in roguelite. Cloneable (plain `Item`s). */
  lootBag: Item[];
  /** The gear that fell since the UI last read this — what the corner toast
   *  announces. Batched like `unlocks`: two pieces off one kill arrive together. */
  gearDrops: Item[];
  /** Bumps on every real drop, so a run *loaded* from a save (which fills the bag
   *  in one go) never replays a run's worth of toasts. */
  gearDropSeq: number;
  /** Distractions & Diversions waiting on the board — only ever between waves.
   *  Each one is drawn on the map *and* listed as a corner infobox, so a player who
   *  is looking at their build panel still knows something turned up. Plain data:
   *  the engine keeps the real list, this is what the interface needs to draw it. */
  diversions: { id: string; defId: DiversionId; mood: DiversionMood; name: string; icon: string; tip: string }[];
  /** Hunter traps lying on the road, flattened for drawing the slot row. The engine
   *  keeps the real list (the renderer reads it live); this is what the panel needs. */
  traps: { id: string; defId: HunterTrapId; name: string; icon: string; charges: number; maxCharges: number }[];
  /** The trap armed in the build panel, waiting for a click on the road. */
  selectedTrapId: HunterTrapId | null;
  /** The run's own Hunter skill: what it has reached, how far into the next level
   *  it is, what that level costs, and how many traps it allows out at once. */
  hunterLevel: number;
  hunterXp: number;
  hunterXpNeeded: number;
  maxTraps: number;
  /** The allotment patches this map dealt, flattened for the sow menu and the
   *  between-waves infobox. The engine keeps the real list (the renderer reads it
   *  live off the engine); this is only what the interface has to draw. */
  farmPatches: {
    id: string; stage: PatchStage; seedId: SeedId | null;
    name: string; icon: string; wavesLeft: number;
  }[];
  /** The patch whose seed menu is open, or null. Set by clicking a bare patch. */
  pendingSow: string | null;
  /** The plot the player is carrying, or null. Moving one costs nothing. */
  movingPatchId: string | null;
  /** A bought plot waiting to be put down. Cancelling refunds it. */
  placingPlot: boolean;
  /** What the next plot costs — doubles with every one bought, and never caps. */
  plotCost: number;
  /** The herb riding this wave — what was pulled and what it is doing. Null
   *  between the harvest's wave and the next one, since a herb lasts one wave. */
  farmBuff: { seedId: SeedId; herbName: string; icon: string; label: string; labelIcon: string; tip: string } | null;
  /** Herbs pulled and not yet spent, only the stacks actually held. A harvest fills
   *  this instead of arming a wave, so the choice between drinking a herb raw and
   *  brewing it belongs to the player rather than to the patch. */
  herbPouch: {
    seedId: SeedId; name: string; icon: string; count: number;
    label: string; labelIcon: string; tip: string;
  }[];
  /** Potions brewed and not yet drunk, only the stacks actually held. */
  potionStock: { id: PotionId; name: string; icon: string; count: number }[];
  /** The run's own Herblore skill: what it has reached, how far into the next level
   *  it is, and what that level costs. Starts at 3, not 1 — see systems/herblore. */
  herbloreLevel: number;
  herbloreXp: number;
  herbloreXpNeeded: number;
  /** The doses running right now, each with the waves it has left. Several may be
   *  up at once; a second dose of the same potion refills its clock. */
  activePotions: {
    id: PotionId; name: string; icon: string;
    label: string; labelIcon: string; tip: string; wavesLeft: number;
  }[];
}

export const uid = () => Math.random().toString(36).slice(2, 11);

/** Global throttle on the general gold flow (per-kill + wave-clear payouts) to
 *  keep the economy tight. Card gold is halved at the data layer instead, so it
 *  isn't double-cut here (both still route through {@link GameEngine.awardGold}). */
export const GENERAL_GOLD_FACTOR = 0.5;

/** Approximate body radius (px) used for range/hit tests, matching the sprite size. */
export const enemyRadius = (e: { isBoss?: boolean }) => (e.isBoss ? 28 : 13);

/** A tower's body footprint (px) for physical contact — half a tile, so the circle
 *  matches the square it occupies on the grid. Not `visualRadius`, which is the
 *  drawn sprite and runs larger on upgraded tiers. */
export const TOWER_BODY_RADIUS = GRID / 2;

/** Clean a persisted Collection-Log blob: keep only known enemy types with a
 *  positive finite integer count, so a corrupt/stale save can't poison the log. */
export function sanitizeKillCounts(raw: unknown): Record<string, number> {
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
export function sanitizeCardCounts(raw: unknown): Record<string, number> {
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
export const ESCORT_ORBIT_DRIFT = 0.5;
export const JAD_HEALER_ORBIT = 82;

/** Kicked-up earth: the Giant Mole's dig, mound and surfacing all read in this. */
export const MOLE_DUST = '#8a6b47';

/** The Grotesque Guardians' shared stone — the tether, the enrage and the revival. */
export const GUARDIAN_LINK_COLOR = '#c9a227';

/** The Corporeal Beast's siphon — the core, the tether it holds a tower with, and the
 *  drained look of the tower on the other end. One colour for the whole mechanic, so a
 *  player who sees the mote leave him can follow it to the tower that went quiet. */
export const CORP_LINK_COLOR = '#a06bff';

/** Clean a persisted "bosses seen" blob: keep only the mechanic bosses flagged true,
 *  so a corrupt/stale save can't gate modifiers on bad data. */
export function sanitizeBossesSeen(raw: unknown): Record<string, number> {
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
export const EASE_K = 6;
export const EASE_NORM = Math.exp(EASE_K) - 1;
export function projectileEase(t: number): number {
  return (Math.exp(EASE_K * t) - 1) / EASE_NORM;
}

/**
 * Flight-floor fallback (seconds) for a spell whose cast clip hasn't decoded yet
 * (only the very first cast, before `loadedmetadata` fires). This is the duration
 * of the shortest cast clip in the bundle (`cast_air_1.wav`), so the fallback can
 * never overshoot a real cast — measured from public/assets/sounds.
 */
export const SHORTEST_CAST_S = 1.52;

/** Which splat the client draws, following OSRS's own set: `hit` (red damage),
 *  `miss` (blue 0), `poison` (green), `venom` (teal), `burn` (orange fire DoT),
 *  `heal` (purple cross), `armour` (orange chestplate) and `shield` (teal shield).
 *
 *  Each one says a different thing, and OSRS never lets them blur — so neither do
 *  we. The blue `miss` means the hit landed and was worth nothing on its own; a
 *  defence that stopped it shows `armour`, a shield pool that ate it shows
 *  `shield`, and healing shows `heal` whether or not any health moved. */
export type HitsplatKind =
  | 'hit' | 'miss' | 'poison' | 'venom' | 'burn' | 'heal' | 'armour' | 'shield';

/** The damage-over-time kinds, ticked independently in `damageOverTime`. */
export const DOT_KINDS: readonly DotKind[] = ['burn', 'poison', 'venom'];

/** Per-DoT-kind splat lane so multiple DoTs on one enemy fan out instead of
 *  overriding each other. `side` picks the horizontal side (-1 left, +1 right);
 *  `rise` picks the vertical sense (+1 up, -1 down). The four quadrants give room
 *  for new DoT kinds — burn=left/up, poison=right/up, venom=right/down, leaving
 *  left/down ({ side: -1, rise: -1 }) free for the next one. */
export const DOT_LANE: Record<DotKind, { side: number; rise: number }> = {
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
/** A status badge on the enemy info panel. Mostly debuffs; `cleansed` is the one
 *  that runs the other way — a body General Graardor's slam has freed. It is listed
 *  here because the player reads this row to answer "why is my slow not landing?",
 *  and the answer has to be in the same place as the slow. */
export type DebuffId = 'slow' | 'stun' | 'burn' | 'poison' | 'venom' | 'vuln' | 'cleansed';

export interface EnemyHoverInfo {
  /** The enemy's type id — the panel keys its "how to kill" line off this. */
  type: EnemyType;
  name: string;
  hp: number;
  maxHp: number;
  speed: number;
  baseSpeed: number;
  /** The enemy type's natural (un-evented, un-affixed) speed — the panel flags a
   *  hastened/slowed enemy when {@link baseSpeed} differs from this. */
  naturalSpeed: number;
  weakness: Element | null;
  /** Set instead of {@link weakness} when this monster answers to a style rather
   *  than an element — the panel shows whichever of the two is present. */
  styleWeakness: StyleWeakness | null;
  reward: number;
  isBoss: boolean;
  x: number;
  y: number;
  effects: DebuffId[];
  /** Crowd-control resistance, 0..1 (see `GameEngine.tenacity`). */
  tenacity: number;
  /** Lives lost if this one reaches the end (see `enemyLeakCost`). */
  leakCost: number;
  /** Rolled affixes/modifiers this enemy carries (for the info-panel badges). */
  affixes: EnemyAffix[];
  /** Combat style the `armored` affix resists, if rolled (badge tooltip detail). */
  armoredStyle?: CombatStyle;
  /** Combat style this enemy prays against (`protected`), if any (badge detail). */
  protectedStyle?: CombatStyle;
}

/** A dying enemy's sprite, fading out where it fell. */
export interface DeathFx {
  x: number;
  y: number;
  type: string;
  /** Baked-clip override (e.g. a Cerberus soul dies with its own melee/ranged/magic
   *  clip, not the shared `summoned_soul` type); mirrors Enemy.animType. Falls back
   *  to `type` when unbaked. */
  animType?: string;
  isBoss: boolean;
  renderScale?: number;
  movingLeft: boolean;
  life: number;
  maxLife: number;
  /** A Hunter catch, not a kill: the trap's position. The body is drawn being
   *  drawn *into* it rather than collapsing where it stood. */
  caughtBy?: { x: number; y: number };
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
  | { kind: 'bolt'; x0: number; y0: number; x1: number; y1: number; age: number; life: number; color: string }
  /** A tear of light wiping along one straight run of road — the Venator bow's
   *  sweep. It is drawn as the shot's *path*, not an impact, so it says which
   *  stretch was covered and how hard (width) long enough for the player to read
   *  the answer off the board rather than off the damage meter. A negative `age`
   *  delays it, which is how the runs it crosses fire in order. */
  | { kind: 'streak'; x0: number; y0: number; x1: number; y1: number; age: number; life: number; color: string; width: number }
  /** Something **lobbed** across the board on a bowed arc, drawn with a real cache GFX
   *  rather than a procedural shape: a gout of the King Black Dragon's dragonfire from his
   *  mouth to the patch of road it is about to light, or a boulder out of General
   *  Graardor's fist at everything his slam just freed. It lands exactly when `life` runs
   *  out, so whatever it causes can be scheduled against the same number. */
  | {
      kind: 'hurl'; x0: number; y0: number; x1: number; y1: number; age: number; life: number;
      /** How far this one bows off the straight line, as a fraction of it — its own curve,
       *  so a volley fans out instead of stacking into one streak. */
      bow: number;
      /** The flight GFX to draw (a `proj_*` spotanim slug). */
      slug: string;
      /** Swell on the way out. True for a breath, which widens as it opens; false for a
       *  thrown solid, which is the same rock the whole way. */
      grow?: boolean;
    };

/**
 * A stretch of road on fire — the King Black Dragon's dragonfire.
 *
 * Lives beside `fx` on the engine as pure board state: a scorch has no owner, so it
 * outlives the dragon that breathed it (killing him mid-burn does not put the fire out)
 * and it is never serialised — every transient is dropped by the run save.
 */
export interface Scorch {
  /** The road's centre-line through the burning stretch, sampled every
   *  `KBD_SCORCH_STEP` px. Points, not endpoints, because the road bends. */
  points: Point[];
  /** Seconds elapsed. */
  timer: number;
  /** Seconds this scorch lasts — the inhale for a telegraph, the burn for the fire. */
  life: number;
  /** True while this is the *tell* (he is still inhaling): drawn smouldering, and it
   *  scorches nothing. The fire that follows re-uses the same points. */
  warning: boolean;
  /** Per-point ignition time (seconds after this scorch started), parallel to `points`.
   *  A point neither burns nor scorches a tower before its own gout of dragonfire has
   *  arrived, so the fire sweeps down the road at the speed of the breath instead of
   *  appearing whole. Absent on the telegraph, which lights all at once. */
  lit?: number[];
}

export const HITSPLAT_LIFE = 0.9;

/** Magic-impact sizing. The burst scales with the struck model's size (a boss's
 *  hit reads bigger than a rat's) around a halved baseline — the old effect was
 *  ~2× too large. Secondary (splash) targets render at a fraction so the smaller
 *  burst telegraphs their reduced damage. Each hit also gets a small random
 *  jitter so no two land identically. */
export const IMPACT_BASE_SCALE = 0.5;   // halve the old footprint (normal enemy ≈ this)
export const IMPACT_SPLASH_SCALE = 0.6; // splash-target burst vs the primary's

/** Ancients hit-GFX fit: drawn effect size as a multiple of the struck model's
 *  drawn body size. Ice is the proportion baseline — its freeze cube encases the
 *  whole NPC; shadow spans feet to just over the head, smoke billows a touch
 *  wider, blood hugs the body. The baked sheets keep an ~8%/side fit margin, so
 *  the multipliers overshoot 1 to land the visible GFX on the body. */
export const ANCIENT_HIT_FIT: Record<string, number> = { ice: 1.3, smoke: 1.25, shadow: 1.15, blood: 1.05 };

