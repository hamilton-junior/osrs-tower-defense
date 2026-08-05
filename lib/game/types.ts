import type { EnemyAffix } from './systems/affixes';
import type { BossState, RatPhase, StallState } from './systems/boss-mechanics';

export type HitsplatType = 'melee' | 'ranged' | 'magic' | 'poison' | 'miss';

export interface Hitsplat {
  x: number;
  y: number;
  damage: number;
  type: HitsplatType;
  life: number;
  velocityY: number;
  velocityX: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface GlobalUpgrades {
  archerRange: number;
  archerDamage: number;
  magicDamage: number;
  cannonSpeed: number;
  slayerReward: number;
  prayerEfficiency: number;
  startingMoney: number;
  rewardMultiplier: number;
  waveSpeed: number;
  towerCostReduction: number;
  xpGainMultiplier: number;
  prayerRegen: number;
}

export type PrayerType = 'burst_of_strength' | 'sharp_eye' | 'mystic_will' | 'mystic_lore' | 'mystic_might' | 'hawk_eye' | 'ultimate_strength' | 'eagle_eye' | 'piety' | 'rigour' | 'augury' | 'protect_from_melee' | 'protect_from_missiles' | 'protect_from_magic';

export interface ActivePotion {
  type: 'overload' | 'super_restore' | 'prayer_potion' | 'ranging' | 'magic' | 'super_combat';
  timer: number;
}

export interface Pet {
  id: string;
  name: string;
  type: string;
  bonus: string;
  x?: number;
  y?: number;
}

export interface Achievement {
  id: string;
  name: string;
  description: string;
  completed: boolean;
}

export type EnemyType = 'goblin' | 'rat' | 'cow' | 'imp' | 'spider' | 'scorpion' | 'hill_giant' | 'lesser_demon' | 'green_dragon' | 'jad' | 'blue_dragon' | 'black_demon' | 'abyssal_demon' | 'barrow_wight' | 'chaos_druid' | 'skeletal_mage' | 'vorkath' | 'zulrah' | 'skeleton' | 'zombie' | 'ghost' | 'hellhound' | 'fire_giant' | 'bloodveld' | 'gargoyle' | 'nechryael' | 'dark_beast' | 'hydra' | 'giant_mole' | 'dusk' | 'dawn' | 'cerberus' | 'summoned_soul' | 'yt_hurkot' | 'brutus' | 'scurrius' | 'giant_rat'
  // Superior Slayer monsters — in ENEMIES all along (waves can roll them), but they
  // were missing from this union, so nothing could name one in typed code.
  | 'superior_bloodveld' | 'superior_abyssal_demon' | 'superior_gargoyle' | 'superior_nechryael';

export type Element = 'air' | 'water' | 'earth' | 'fire' | 'none';

export interface EnemyDef {
  type: EnemyType;
  name: string;
  hp: number;
  speed: number;
  color: string;
  reward: number;
  resistance?: number;
  deathSound?: string;
  weakness?: Element;
  /** The combat style this monster takes extra damage from. Mutually exclusive
   *  with {@link weakness} — see {@link StyleWeakness}. */
  styleWeakness?: StyleWeakness;
  isBoss?: boolean;
  waveUnlock?: number;
  /** The boss that spawns this enemy, if it is an add rather than something a
   *  wave can send. Its presence is what keeps the wave allocator from rolling
   *  a boss's summon as ordinary trash (see systems/wave-generation.ts). */
  summonedBy?: string;
  /** Sprite size multiplier at draw time (default 1); compensates for sprites
   *  with heavy transparent padding (see data/enemies.ts). */
  renderScale?: number;
}

/** A damage-over-time effect kind. Each ticks and renders independently. Toxic
 *  `venom` is tracked apart from Smoke `poison` (it ramps, and splats a darker
 *  green) even though both are poison-family. */
export type DotKind = 'burn' | 'poison' | 'venom';

/** One independent damage-over-time effect (fire burn, poison or venom). */
export interface DotState {
  /** Seconds of DoT remaining. */
  timer: number;
  /** Damage per second while active. */
  dps: number;
  /** Fractional damage carried between frames until it sums to ≥1. */
  accum: number;
  /** Counts up to one game tick so the DoT is dealt once per tick, not per frame. */
  tickTimer: number;
  /** Combat style of the source tower, so boss style-resistance (e.g. Zulrah's
   *  per-phase rock-paper-scissors) reduces the DoT — including the Fire burn's
   *  %max-HP tick — exactly as it reduces the direct hit. Undefined → typeless. */
  style?: CombatStyle;
  /** Source tower id, so the DPS meter can credit each DoT tick (burn/poison/
   *  venom) to the tower that applied it. Undefined → bucketed as run FX. */
  sourceTowerId?: string;
}

export interface Enemy extends EnemyDef {
  id: string;
  x: number;
  y: number;
  maxHp: number;
  baseSpeed: number;
  /** The enemy type's wave-scaled speed *before* any wave-event or affix multiplier
   *  (unlike {@link baseSpeed}, which bakes those in). The reference the hover panel
   *  compares against to flag a hastened/slowed enemy. Optional only so the legacy
   *  engine's `Enemy` literals still type-check; the live engine always sets it. */
  naturalSpeed?: number;
  pathIndex: number;
  slowTimer: number;
  stunTimer: number;
  tauntTimer: number;
  /** Independent damage-over-time effects (`burn`, `poison`, `venom`), ticked and
   *  shown as separate hitsplats so they never merge into one splat. */
  dots?: Partial<Record<DotKind, DotState>>;
  /** Bosses build crowd-control resistance from non-damaging debuffs they take
   *  (+1% tenacity each); this counts those hits. See `GameEngine.tenacity`. */
  debuffHits?: number;
  /** @deprecated Legacy single-slot DoT, used only by the phased-out
   *  `lib/game/engine.ts` / `renderer.ts`. The active core uses {@link dots}. */
  burnTimer?: number;
  /** @deprecated Legacy DoT damage — see {@link burnTimer}. */
  burnDamage?: number;
  /** Water "amp" debuff: while >0 the enemy takes extra damage from all sources. */
  vulnTimer?: number;
  groundTimer: number;
  poisonTimer?: number;
  venomTimer?: number;
  venomDamage?: number;
  jadTimer?: number;
  jadAttackType?: 'mage' | 'range';
  jadAttackActive?: boolean;
  jadAttackResolveTimer?: number;
  magicResistDrainTimer?: number;
  shakeX?: number;
  shakeY?: number;
  /** Brief scale-pop timer set when the enemy takes a hit (visual only). */
  flashTimer?: number;
  /** Counts down from {@link SPAWN_ANIM_SECONDS} right after the enemy emerges
   *  from the portal; drives a fade-in + scale-up "materialise" effect. Visual
   *  only — decremented in `moveEnemies`, read by the renderer. */
  spawnAnim?: number;
  /** Total time alive (s), advanced every frame; drives the looping walk-cycle
   *  for animated enemies (see `ENEMY_ANIMS`). Visual only. */
  animTime?: number;
  /** Rolled enemy affixes (per-instance modifiers; see `systems/affixes`). Bosses
   *  and pre-unlock waves carry none. Drives combat hooks + the renderer's aura. */
  affixes?: EnemyAffix[];
  /** Combat style this enemy takes reduced damage from (the `armored` affix). */
  armoredStyle?: CombatStyle;
  /** Combat style this enemy prays against (the `protected` affix, or an innate
   *  protection declared on its `EnemyDef`): that style barely scratches it. */
  protectedStyle?: CombatStyle;
  /** Remaining shield pool (the `shielded` affix): absorbed before HP is touched. */
  shieldHp?: number;
  /** Per-boss phase/mechanic state (Zulrah forms, Vorkath ice, Jad heal window);
   *  set on boss spawn, driven by `GameEngine.handleBossMechanics`. */
  bossState?: BossState;
  /** The stall-breaker clock for an enemy that is *not* a boss — a boss folds the same
   *  fields into its {@link bossState}. Created on the enemy's first frame. Without it,
   *  anything whose regeneration matches the board's damage can never die, and a stun
   *  chain means it never walks off either, so the wave has no way to end. */
  stall?: StallState;
  /** A boss's companion: it orbits its {@link ownerId} instead of walking the path, so
   *  it never leaks, and it awards nothing on death — the payoff for killing it is
   *  whatever it was doing for its boss. Jad's Yt-HurKot healers and Cerberus's Summoned
   *  Souls are both escorts; what they *do* is the flag below / {@link soulStyle}. */
  escort?: boolean;
  /** The boss this escort belongs to. Losing its owner is what marks it an orphan. */
  ownerId?: string;
  /** An escort that heals its owner (Jad's Yt-HurKot). Kill it to deny the heal. */
  healer?: boolean;
  /** A Summoned Soul locks this combat style: while it lives, Cerberus takes almost
   *  nothing from towers of that style. Which soul matters depends on *your* board. */
  soulStyle?: CombatStyle;
  /** Orbit phase (radians) of an escort around its owner; advanced each frame so the
   *  companions drift around the boss while following at a limited distance. */
  orbit?: number;
  /** Walk a lane parallel to the road, this many logic pixels to the side of it
   *  (perpendicular to the current segment; negative = the other side). Dawn uses it to
   *  fly beside Dusk instead of inside him — two bosses on the same waypoints stack into
   *  one blob, and the pair has to read as a *pair*. */
  laneOffset?: number;
  /** Scurrius's sheared rat: where it is in its short life. Absent on everything else.
   *  A rat with a phase drives itself and does not walk the path. */
  ratPhase?: RatPhase;
  /** Seconds left in the current {@link ratPhase} (the `return` leg ends on arrival). */
  ratTimer?: number;
  /** The point this rat is currently skittering toward while wandering. */
  ratTargetX?: number;
  ratTargetY?: number;
  /** Where it was sheared off. Every wander target is drawn within the leash of *this*,
   *  not of wherever the rat currently stands — rerolling from its own position would
   *  compound into a random walk that drifts off the stretch of board it is meant to be
   *  distracting, which is the whole job. */
  ratOriginX?: number;
  ratOriginY?: number;
  /** Overrides `type` for the baked-animation lookup only (sprite/clip slug),
   *  leaving combat/stats on `type`. Lets a Jad healer render the real Yt-HurKot
   *  model (`yt_hurkot`) once it's baked, falling back to `type`'s clip. */
  animType?: string;
  /** Counts down while a hit-flinch (`hurt`) clip plays; set on each direct hit,
   *  decremented in `moveEnemies`. Visual only. */
  hurtAnim?: number;
  /** Overhead speech — the OSRS convention of a monster announcing a mechanic one beat
   *  before it happens, drawn above its head while {@link sayTimer} lasts. This is the
   *  *telegraph* half of the visual-state rule (the model swap is the other half); use
   *  it for the moment a mechanic fires, never for ambient chatter. */
  say?: string;
  /** Seconds left on {@link say}. */
  sayTimer?: number;
  /** Spawned by the debug "custom wave" (a sandbox): killing or leaking it has no
   *  effect on the run — no gold/essence/Slayer points, no life lost, no wave
   *  advance. Purely for testing enemies/towers. */
  debug?: boolean;
}

/** Duration (s) of the portal materialise (fade-in + grow) on a fresh spawn. */
export const SPAWN_ANIM_SECONDS = 0.6;

/** A one-shot baked-spotanim effect playing at a point (purely visual). The
 *  `slug` keys into SPOTANIMS; `age` is elapsed simulated time in seconds. */
export interface Effect {
  slug: string;
  x: number;
  y: number;
  age: number;
  /** Draw-size multiplier over the spotanim's base size (impacts scale to the
   *  struck model, like the procedural bursts did). Defaults to 1. */
  scale?: number;
  /** When set, the effect rides this enemy's position while it lives — actor
   *  graphics (Ancients hit GFX) play ON the struck model, like in the client. */
  enemyId?: string;
}

export type TowerType = 'archer' | 'wizard' | 'cannon' | 'tzhaar' | 'slayer' | 'toxic';
/** Combat/damage style a weapon deals — drives which potions & prayers buff it. */
export type CombatStyle = 'ranged' | 'magic' | 'melee';

/** Which ammo/rune/kit family a tower consumes in its Classic ammo slot (so
 *  arrows only fit an archer, cannonballs only a cannon), even when two towers
 *  share a combat style — the two melee towers both burn `melee_kit`. See
 *  `TOWER_AMMO_CLASS` / `towerAmmoClassFor` in systems/tower-gear. */
export type AmmoClass = 'arrows' | 'darts' | 'cannonballs' | 'runes' | 'melee_kit';

/** A rare gear piece's signature effect — a per-target conditional the flat
 *  `Item.bonus` can't express. Handled in the firing block; see systems/tower-gear. */
export type GearEffectId = 'anti_tank' | 'slayer_bane';

/**
 * The half of the combat triangle a monster is *vulnerable* to — the melee/ranged
 * counterpart of an {@link Element} weakness.
 *
 * Magic is deliberately absent. A magic answer is always spelled as an elemental
 * weakness (the wizard's own axis, four choices deep), so no monster carries both
 * kinds of "bring the right damage" bonus and the player always has exactly one
 * answer to find. See `STYLE_WEAKNESSES` in data/enemies.ts.
 */
export type StyleWeakness = Exclude<CombatStyle, 'magic'>;
export type MageMode = 'elemental' | 'ancients' | 'utility';
export type AncientType = 'ice' | 'blood' | 'shadow' | 'smoke';
export type SupportSpell = 'curse' | 'enfeeble' | 'sanctity';

export interface TowerSkill {
  level: number;
  xp: number;
}

export interface TowerSkills {
  strength: TowerSkill;
  ranged: TowerSkill;
  magic: TowerSkill;
}

export interface PlayerSkills {
  mining: TowerSkill;
  woodcutting: TowerSkill;
  herblore: TowerSkill;
  crafting: TowerSkill;
  prayer: TowerSkill;
  farming: TowerSkill;
  magic: TowerSkill;
  construction: TowerSkill;
}

export interface GatheringNode {
  id: string;
  type: 'tree' | 'ore' | 'herb';
  name: string;
  x: number;
  y: number;
  respawnTimer: number;
  maxRespawn: number;
  level: number;
  xp: number;
}

export interface Item {
  id: string;
  name: string;
  description: string;
  bonus: {
    damage?: number;
    range?: number;
    cooldown?: number;
    xpBonus?: number;
  };
  /** `'weapon' | 'shield' | 'accessory'` are legacy-only (kept so the phased-out
   *  `lib/game/engine.ts` still type-checks); new Classic gear uses only
   *  `'ammo' | 'jewellery'`. */
  type: 'weapon' | 'shield' | 'accessory' | 'ammo' | 'jewellery' | 'seed' | 'herb' | 'potion' | 'material' | 'bone';
  seedType?: 'herb' | 'flower' | 'allotment';
  growthTime?: number;
  harvestItem?: string;
  potionEffect?: ActivePotion['type'];
  potionDuration?: number;
  sellPrice?: number;
  quantity?: number;
  stackable?: boolean;
  /** Classic gear: the combat style this piece belongs to (unused by the new
   *  ammo/jewellery gate, which keys off `ammoClass` instead; kept for legacy
   *  `'weapon'`-typed items). */
  style?: CombatStyle;
  /** Classic gear: the ammo/rune/kit family (ammo slot only; jewellery leaves
   *  this undefined — it fits any tower). */
  ammoClass?: AmmoClass;
  /** Classic gear: minimum tower combat level (in its style skill) to equip. */
  levelReq?: number;
  /** Classic gear: a rare's signature effect id. Undefined = common (stats only). */
  gearEffect?: GearEffectId;
  /** Classic gear rarity — weights the drop; `signature` drops only from bosses. */
  rarity?: 'common' | 'signature';
}

export type Region = 'misthalin' | 'karamja' | 'wilderness' | 'morytania';

export interface FarmingPatch {
  id: string;
  x: number;
  y: number;
  type: 'herb' | 'flower' | 'allotment';
  seed: string | null;
  stage: number;
  timer: number;
  yield: number;
  maxStage: number;
  diseased?: boolean;
  compost?: 'compost' | 'supercompost' | 'ultracompost';
}

export type TargetingPriority = 'first' | 'last' | 'strongest' | 'weakest' | 'closest' | 'unmarked';

export interface Tower {
  id: string;
  x: number;
  y: number;
  type: TowerType;
  level: number;
  maxLevel: number;
  range: number;
  damage: number;
  cooldown: number;
  lastFired: number;
  color: string;
  targetId: string | null;
  targetingPriority: TargetingPriority;
  name: string;
  upgradeCost: number;
  /** Opt-in: the engine auto-spends gold to raise this tower a tier whenever it
   *  can afford the cheapest pending auto-upgrade (see GameEngine.tickAutoUpgrade). */
  autoUpgrade?: boolean;
  /** Ceiling tier for auto-upgrade: it stops raising this tower once `level`
   *  reaches this (1..maxLevel). Undefined = no cap (auto-upgrade to max). Only
   *  the auto tick honours it; manual/batch Upgrade ignore the cap. */
  autoUpgradeCap?: number;
  special?: 'slow' | 'aoe' | 'rapid' | 'stun' | 'pushback' | 'crush' | 'burn' | 'venom' | 'amp' | 'blood' | 'aoe_slow';
  specCharge: number;
  specMax: number;
  lastSpecFired?: number;
  visualRadius: number;
  disabledTimer: number;
  skills: TowerSkills;
  equipment: {
    ammo: Item | null;
    jewellery: Item | null;
  };
  showRange?: boolean;
  fireSound?: string;
  minDamage?: number;
  maxDamage?: number;
  mageMode?: MageMode;
  ancientType?: AncientType;
  element?: Element;
  supportSpell?: SupportSpell;
  attackStyle?: 'accurate' | 'rapid' | 'long_range';
  recoil?: number;
  recoilAngle?: number;
}

/** A copied tower's build recipe. `dx`/`dy` are its offset from the copied
 *  formation's centre, so a paste rebuilds the shape rather than a pile.
 *
 *  What it carries is only what a player *chose*: the tower's type and the
 *  settings they'd otherwise have to re-pick one by one after building. Level,
 *  XP, equipment and spec charge are deliberately absent — a paste builds base
 *  towers, so copying can't launder a maxed tower into a cheap one. */
export interface TowerBlueprint {
  dx: number;
  dy: number;
  type: TowerType;
  targetingPriority: TargetingPriority;
  mageMode?: MageMode;
  element?: Element;
  ancientType?: AncientType;
  supportSpell?: SupportSpell;
}

export interface Projectile {
  id: string;
  x: number;
  y: number;
  targetId: string;
  speed: number;
  damage: number;
  color: string;
  type: 'arrow' | 'spell' | 'cannonball' | 'dart' | 'bolt' | 'magic_projectile' | 'ancient_ice' | 'ancient_blood' | 'ancient_shadow' | 'ancient_smoke' | 'chinchompa' | 'godsword';
  element?: Element;
  special?: 'slow' | 'aoe' | 'stun' | 'pushback' | 'crush' | 'burn' | 'venom' | 'amp' | 'blood' | 'aoe_slow';
  /** Hits every enemy near impact (Ancients barrage / cannon splash). */
  aoe?: boolean;
  /** Splash radius (logic px) for an AoE projectile; defaults to 80 (Ancients). */
  blastRadius?: number;
  /** Restores a life when this projectile lands a kill (Blood barrage). */
  lifesteal?: boolean;
  /** Bonus damage as a fraction of each hit enemy's max HP (Blood barrage),
   *  added on top of the flat hit (splash-scaled for non-primary targets). */
  bonusMaxHpFrac?: number;
  /** Flat per-hit ceiling of the %max-HP bonus (Blood barrage cap). */
  bonusMaxHpCap?: number;
  /** Wiki spell-file name (e.g. `Fire_Wave`) used to draw the real spell sprite. */
  spellIcon?: string;
  /** Arrow style marker for archer shots (`'dragon_arrow'`): the renderer draws a
   *  procedural dragon arrow, and the engine skips the melee impact thud for it. */
  arrowIcon?: string;
  /** Sound key (e.g. `hit_fire_3`) played at impact — the spell's authentic OSRS
   *  hit sfx, paired with the cast sound played on fire. Doubles as the baked
   *  impact-GFX slug (SPOTANIMS shares the key). */
  hitSound?: string;
  /** Baked flight-GFX slug (e.g. `proj_fire_3`) — the spell's real OSRS
   *  projectile spotanim, drawn as a looping sheet instead of the spell icon. */
  projAnim?: string;
  sourceTowerId?: string;
  /** Utility damage-aura that boosted this shot, for the DPS meter's per-tower
   *  attribution (peeled off as the utility wizards' "extra"). Structurally the
   *  systems' `AuraAttribution`; inlined here to avoid a types↔systems import. */
  aura?: { factor: number; parts: { id: string; share: number }[] };
  /** Recent positions (oldest→newest) for drawing a motion trail. */
  trail?: { x: number; y: number }[];
  /** Launch point — the easing lerps from here toward the (live) target. */
  ox?: number;
  oy?: number;
  /** Last known target position — the bolt keeps flying here (and still splashes)
   *  even if the target dies mid-flight, so shots aren't silently wasted. */
  destX?: number;
  destY?: number;
  /** Total intended flight time (s); the bolt reaches its target at `age===flight`. */
  flight?: number;
  /** Seconds elapsed since launch, for the ease-in (slow→fast) flight curve. */
  age?: number;
}

export interface SlayerTask {
  type: EnemyType;
  count: number;
  total: number;
  reward: number;
}

export interface Quest {
  id: string;
  name: string;
  description: string;
  objective: {
    type: 'kill' | 'wave' | 'money' | 'essence';
    target: number;
    current: number;
    enemyType?: EnemyType;
  };
  reward: {
    money?: number;
    essence?: number;
    item?: Item;
  };
  completed: boolean;
  claimed: boolean;
}

export interface PrayerDef {
  id: PrayerType;
  name: string;
  level: number;
  drain: number;
  description: string;
}

export interface Recipe {
  id: string;
  name: string;
  ingredients: { itemId: string, amount: number }[];
  resultItemId: string;
  level: number;
  xp: number;
  skill: keyof PlayerSkills;
  icon?: string;
}

export interface GameSettings {
  volume: number;
  showRangeAlways: boolean;
  particles: boolean;
}

/**
 * The shape of every partial state object the engine pushes to the UI via its
 * `onStateChange` callback. Every key the engine emits must be declared here —
 * TypeScript's excess-property checks then flag any typo'd or stray key at the
 * call site. Keep this in sync with `GameEngine.getState()` and the `setState`
 * merge in `GameCanvas`.
 */
export interface EngineStatePatch {
  money?: number;
  lives?: number;
  wave?: number;
  waveActive?: boolean;
  isPlaying?: boolean;
  isPaused?: boolean;
  gameOver?: boolean;
  devMode?: boolean;
  runeEssence?: number;
  remainingEnemies?: number;
  prayerPoints?: number;
  maxPrayerPoints?: number;
  activePrayers?: PrayerType[];
  specialAttackCharge?: number;
  activePotions?: ActivePotion[];
  inventory?: Item[];
  playerSkills?: PlayerSkills;
  currentRegion?: Region;
  messages?: string[];
  settings?: GameSettings;
  slayerTask?: SlayerTask | null;
  slayerMaster?: string;
  slayerPoints?: number;
  consecutiveTasks?: number;
  unlockedTowers?: string[];
  blockedEnemies?: string[];
  extendedTasks?: string[];
  biggerAndBadder?: boolean;
  slayerHelmet?: boolean;
  achievements?: Achievement[];
  achievementPoints?: number;
  quests?: Quest[];
  towers?: Tower[];
  enemies?: Enemy[];
  pets?: Pet[];
  selectedPlacedTower?: Tower | null;
  autoSpawnEnabled?: boolean;
  autoSpawnTimer?: number;
  followingPetId?: string | null;
  activeQuote?: { text: string; timer: number } | null;
  farmingPatches?: FarmingPatch[];
  itemPriceMultipliers?: Record<string, number>;
  upgrades?: GlobalUpgrades;
  pohUpgrades?: string[];
}
