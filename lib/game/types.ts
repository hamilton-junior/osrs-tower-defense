
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

export type EnemyType = 'goblin' | 'rat' | 'cow' | 'imp' | 'spider' | 'scorpion' | 'hill_giant' | 'lesser_demon' | 'green_dragon' | 'jad' | 'blue_dragon' | 'black_demon' | 'abyssal_demon' | 'barrow_wight' | 'chaos_druid' | 'skeletal_mage' | 'vorkath' | 'zulrah' | 'skeleton' | 'zombie' | 'ghost' | 'hellhound' | 'fire_giant' | 'bloodveld' | 'gargoyle' | 'nechryael' | 'dark_beast' | 'hydra';

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
  isBoss?: boolean;
  waveUnlock?: number;
  /** Sprite size multiplier at draw time (default 1); compensates for sprites
   *  with heavy transparent padding (see data/enemies.ts). */
  renderScale?: number;
}

/** A damage-over-time effect kind. Each ticks and renders independently. */
export type DotKind = 'burn' | 'poison';

/** One independent damage-over-time effect (fire burn or poison). */
export interface DotState {
  /** Seconds of DoT remaining. */
  timer: number;
  /** Damage per second while active. */
  dps: number;
  /** Fractional damage carried between frames until it sums to ≥1. */
  accum: number;
  /** Counts up to one game tick so the DoT is dealt once per tick, not per frame. */
  tickTimer: number;
}

export interface Enemy extends EnemyDef {
  id: string;
  x: number;
  y: number;
  maxHp: number;
  baseSpeed: number;
  pathIndex: number;
  slowTimer: number;
  stunTimer: number;
  tauntTimer: number;
  /** Independent damage-over-time effects (fire `burn`, `poison`), ticked and
   *  shown as separate hitsplats so the two never merge into one splat. */
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
}

/** Duration (s) of the portal materialise (fade-in + grow) on a fresh spawn. */
export const SPAWN_ANIM_SECONDS = 0.45;

/** A one-shot baked-spotanim effect playing at a point (purely visual). The
 *  `slug` keys into SPOTANIMS; `age` is elapsed simulated time in seconds. */
export interface Effect {
  slug: string;
  x: number;
  y: number;
  age: number;
}

export type TowerType = 'archer' | 'wizard' | 'cannon' | 'tzhaar' | 'slayer' | 'toxic';
/** Combat/damage style a weapon deals — drives which potions & prayers buff it. */
export type CombatStyle = 'ranged' | 'magic' | 'melee';
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
  type: 'weapon' | 'shield' | 'accessory' | 'seed' | 'herb' | 'potion' | 'material' | 'bone';
  seedType?: 'herb' | 'flower' | 'allotment';
  growthTime?: number;
  harvestItem?: string;
  potionEffect?: ActivePotion['type'];
  potionDuration?: number;
  sellPrice?: number;
  quantity?: number;
  stackable?: boolean;
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

export type TargetingPriority = 'first' | 'last' | 'strongest' | 'weakest' | 'closest';

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
  special?: 'slow' | 'aoe' | 'rapid' | 'stun' | 'pushback' | 'burn' | 'amp' | 'blood' | 'aoe_slow';
  specCharge: number;
  specMax: number;
  lastSpecFired?: number;
  visualRadius: number;
  disabledTimer: number;
  skills: TowerSkills;
  equipment: {
    weapon: Item | null;
    shield: Item | null;
    accessory: Item | null;
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
  special?: 'slow' | 'aoe' | 'stun' | 'pushback' | 'burn' | 'amp' | 'blood' | 'aoe_slow';
  /** Hits every enemy near impact (Ancients barrage / cannon splash). */
  aoe?: boolean;
  /** Restores a life when this projectile lands a kill (Blood barrage). */
  lifesteal?: boolean;
  /** Bonus damage as a fraction of each hit enemy's max HP (Blood barrage),
   *  added on top of the flat hit (splash-scaled for non-primary targets). */
  bonusMaxHpFrac?: number;
  /** Wiki spell-file name (e.g. `Fire_Wave`) used to draw the real spell sprite. */
  spellIcon?: string;
  /** Sound key (e.g. `hit_fire_3`) played at impact — the spell's authentic OSRS
   *  hit sfx, paired with the cast sound played on fire. */
  hitSound?: string;
  sourceTowerId?: string;
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
