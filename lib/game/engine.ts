
import { ASSETS } from './assets';

export interface Point {
  x: number;
  y: number;
}

export const TICK = 0.6; // OSRS Game Tick

export interface GlobalUpgrades {
  archerRange: number; // multiplier, e.g. 1.0
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

export type PrayerType = 'thick_skin' | 'burst_of_strength' | 'clarity_of_thought' | 'sharp_eye' | 'mystic_will' | 'hawk_eye' | 'ultimate_strength' | 'eagle_eye' | 'piety' | 'rigour' | 'augury' | 'protect_from_melee' | 'protect_from_missiles' | 'protect_from_magic';

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

export interface Enemy {
  id: string;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  speed: number;
  baseSpeed: number; // For slow effects
  pathIndex: number;
  type: EnemyType;
  color: string;
  reward: number;
  slowTimer: number; // Duration of slow effect
  stunTimer: number; // Duration of stun effect
  tauntTimer: number; // Duration of taunt effect
  deathSound?: string;
  weakness?: Element;
  jadTimer?: number;
  jadAttackType?: 'mage' | 'range';
  jadAttackActive?: boolean;
  jadAttackResolveTimer?: number;
  burnTimer: number;
  burnDamage: number;
  groundTimer: number; // For earth/root effects
  resistance: number; // 0-1, boss resistance to debuffs
  poisonTimer?: number;
  venomTimer?: number;
  venomDamage?: number;
}

export type TowerType = 'archer' | 'wizard' | 'cannon' | 'tzhaar' | 'slayer' | 'toxic';
export type MageMode = 'elemental' | 'ancients' | 'utility';
export type AncientType = 'ice' | 'blood' | 'shadow' | 'smoke';
export type SupportSpell = 'charge' | 'curse' | 'bind';

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
    xpBonus?: number; // % XP bonus (replaces defense)
  };
  type: 'weapon' | 'shield' | 'accessory' | 'seed' | 'herb' | 'potion' | 'material';
  seedType?: 'herb' | 'flower' | 'allotment';
  growthTime?: number; // Seconds per stage
  harvestItem?: string; // Item ID to harvest
  potionEffect?: ActivePotion['type'];
  potionDuration?: number;
  sellPrice?: number;
}

export type Region = 'misthalin' | 'karamja' | 'wilderness' | 'morytania';

export interface FarmingPatch {
  id: string;
  x: number;
  y: number;
  type: 'herb' | 'flower' | 'allotment';
  seed: string | null; // Item ID
  stage: number; // 0 = empty, 1 = planted, 2 = growing, 3 = ready
  timer: number; // Time until next stage
  yield: number; // Number of herbs to harvest
  maxStage: number;
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
  special?: 'slow' | 'aoe' | 'rapid' | 'stun' | 'pushback' | 'burn' | 'amp' | 'blood';
  specCharge: number; // 0-100 special attack charge
  specMax: number;    // damage threshold to fill spec bar
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
  special?: 'slow' | 'aoe' | 'stun' | 'pushback' | 'burn' | 'amp' | 'blood';
  sourceTowerId?: string;
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

export class GameEngine {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  onStateChange: (state: any) => void;
  
  animationId: number = 0;
  lastTime: number = 0;
  // Dynamic coordinates
  prevWidth: number = 0;
  prevHeight: number = 0;

  // Game Loop
  gameSpeed: number = 1;
  gameTime: number = 0;
  maxDt: number = 0.1; // Safeguard for background tab sluggishness
  isPaused: boolean = false;
  autoSpawnEnabled: boolean = false;
  autoSpawnDelay: number = 3; // Seconds
  autoSpawnTimer: number = 0;
  hoveredEntityId: string | null = null;
  selectedEntityId: string | null = null;
  money: number = 150;
  lives: number = 20;
  wave: number = 1;
  waveActive: boolean = false;
  runeEssence: number = 0;
  devMode: boolean = false; // Dev mode: no HP loss
  
  // Prayer System
  prayerPoints: number = 10;
  maxPrayerPoints: number = 10;
  activePrayers: Set<PrayerType> = new Set();
  prayerDrainTimer: number = 0;

  // Mouse Tracking
  mousePos: Point = { x: 0, y: 0 };
  selectedTowerType: string | null = null;

  // Special Attack
  specialAttackCharge: number = 0;
  maxSpecialAttack: number = 100;

  // Potions
  activePotions: ActivePotion[] = [];

  // Pets & Achievements
  followingPetId: string | null = 'pet_beaver';
  petQuoteTimer: number = 0;
  activeQuote: { text: string, timer: number } | null = null;

  petQuotes: Record<string, string[]> = {
    beaver: ["Woodcutting is an honest living.", "Dam, I'm good!", "Got any logs?", "I'm pining for some trees."],
    tangleroot: ["The earth speaks to me.", "I'm rooting for you!", "Nature finds a way.", "Grow with the flow."],
    vorki: ["Is it cold in here?", "For Zeah!", "The frost is coming.", "I'm just a little dragon."],
    snakeling: ["Sssssss...", "Venomous and proud.", "Zulrah's legacy lives on.", "I like the swamp."],
    rock_golem: ["I'm solid as a rock.", "Don't take me for granite!", "Mining is a blast.", "Feeling rocky today."],
    heron: ["Any fish today?", "Just fishing for compliments.", "The water is fine.", "A catch of a lifetime!"]
  };

  pets: Pet[] = [
    { id: 'pet_beaver', name: 'Beaver', type: 'beaver', bonus: 'Lucky Paw: +25% item drop chance' },
    { id: 'pet_tangleroot', name: 'Tangleroot', type: 'tangleroot', bonus: 'Nature\'s Gift: +10% Rune Essence drops' }
  ];
  achievements: Achievement[] = [
    { id: 'first_wave', name: 'Novice Defender', description: 'Complete Wave 1', completed: false },
    { id: 'rich', name: 'Merchant', description: 'Accumulate 1000 GP', completed: false },
    { id: 'slayer_master', name: 'Slayer Master', description: 'Complete 5 Slayer Tasks', completed: false },
    { id: 'boss_slayer', name: 'Boss Slayer', description: 'Defeat TzTok-Jad', completed: false },
    { id: 'vorkath_slayer', name: 'Dragon Slayer II', description: 'Defeat Vorkath', completed: false },
    { id: 'zulrah_slayer', name: 'Snake Pit', description: 'Defeat Zulrah', completed: false },
    { id: 'essence_hoarder', name: 'Essence Hoarder', description: 'Accumulate 50 Rune Essence', completed: false },
    { id: 'tower_master', name: 'Tower Master', description: 'Have 10 towers on the field', completed: false }
  ];

  // Entities
  enemies: Enemy[] = [];
  towers: Tower[] = [];
  projectiles: Projectile[] = [];
  particles: { x: number, y: number, life: number, color: string }[] = [];
  damageNumbers: { x: number, y: number, text: string, life: number, color: string, velocityY: number, velocityX: number }[] = [];
  floatingTexts: { x: number, y: number, text: string, life: number, color: string, icon?: string }[] = [];
  loots: { id: string, x: number, y: number, type: 'essence' | 'money' | 'item' | 'bones', data?: any, life: number, size: number }[] = [];
  nodes: GatheringNode[] = [];
  farmingPatches: FarmingPatch[] = [];
  currentRegion: Region = 'misthalin';
  playerSkills: PlayerSkills = {
    mining: { level: 1, xp: 0 },
    woodcutting: { level: 1, xp: 0 },
    herblore: { level: 1, xp: 0 },
    crafting: { level: 1, xp: 0 },
    prayer: { level: 1, xp: 0 },
    farming: { level: 1, xp: 0 }
  };
  theme: 'grass' | 'sand' | 'dark' = 'grass';
  messages: string[] = ["Welcome to OSRS Tower Defense!"];
  settings: {
    volume: number;
    showRangeAlways: boolean;
    particles: boolean;
  } = {
    volume: 0.3,
    showRangeAlways: false,
    particles: true
  };
  allPrayers: { id: PrayerType, name: string, level: number, drain: number, description: string }[] = [
    { id: 'thick_skin', name: 'Thick Skin', level: 1, drain: 1, description: '+5% Defence' },
    { id: 'burst_of_strength', name: 'Burst of Strength', level: 4, drain: 1.5, description: '+5% Strength' },
    { id: 'clarity_of_thought', name: 'Clarity of Thought', level: 7, drain: 1.5, description: '+5% Attack' },
    { id: 'sharp_eye', name: 'Sharp Eye', level: 8, drain: 1.5, description: '+5% Ranged' },
    { id: 'mystic_will', name: 'Mystic Will', level: 9, drain: 1.5, description: '+5% Magic' },
    { id: 'hawk_eye', name: 'Hawk Eye', level: 26, drain: 3, description: '+10% Ranged' },
    { id: 'ultimate_strength', name: 'Ultimate Strength', level: 31, drain: 4, description: '+15% Strength' },
    { id: 'protect_from_magic', name: 'Protect from Magic', level: 37, drain: 4, description: 'Protection from Magic attacks' },
    { id: 'protect_from_missiles', name: 'Protect from Missiles', level: 40, drain: 4, description: 'Protection from Ranged attacks' },
    { id: 'protect_from_melee', name: 'Protect from Melee', level: 43, drain: 4, description: 'Protection from Melee attacks' },
    { id: 'eagle_eye', name: 'Eagle Eye', level: 44, drain: 5, description: '+15% Ranged' },
    { id: 'piety', name: 'Piety', level: 70, drain: 8, description: '+23% Str, +20% Att, +25% Def' },
    { id: 'rigour', name: 'Rigour', level: 74, drain: 8, description: '+23% Ranged, +23% Ranged Str, +25% Def' },
    { id: 'augury', name: 'Augury', level: 77, drain: 8, description: '+25% Magic, +25% Magic Def' },
  ];

  // Items & Quests
  inventory: Item[] = [];
  quests: Quest[] = [
    {
      id: 'cooks_assistant',
      name: "Cook's Assistant",
      description: 'Kill 20 Goblins for the cook.',
      objective: { type: 'kill', target: 20, current: 0, enemyType: 'goblin' },
      reward: { 
        money: 100, 
        essence: 5,
        item: { id: 'amulet_of_power', name: 'Amulet of Power', description: '+5 DMG, +10% XP gain', type: 'accessory', bonus: { damage: 5, xpBonus: 10 } }
      },
      completed: false,
      claimed: false
    },
    {
      id: 'dragon_slayer',
      name: 'Dragon Slayer',
      description: 'Defeat 5 Green Dragons.',
      objective: { type: 'kill', target: 5, current: 0, enemyType: 'green_dragon' },
      reward: { 
        money: 500, 
        essence: 20,
        item: { id: 'anti_dragon_shield', name: 'Anti-dragon Shield', description: 'Range +20, +15% XP gain', type: 'shield', bonus: { range: 20, xpBonus: 15 } }
      },
      completed: false,
      claimed: false
    },
    {
      id: 'wave_master',
      name: 'Wave Master',
      description: 'Reach Wave 10.',
      objective: { type: 'wave', target: 10, current: 0 },
      reward: { 
        money: 300, 
        essence: 10,
        item: { id: 'combat_bracelet', name: 'Combat Bracelet', description: 'Damage +8', type: 'accessory', bonus: { damage: 8 } }
      },
      completed: false,
      claimed: false
    },
    {
      id: 'demon_slayer',
      name: 'Demon Slayer',
      description: 'Kill 50 Lesser Demons.',
      objective: { type: 'kill', target: 50, current: 0, enemyType: 'lesser_demon' },
      reward: { 
        money: 400, 
        essence: 15,
        item: { id: 'silverlight', name: 'Silverlight', description: 'Damage +15 against demons', type: 'weapon', bonus: { damage: 15 } }
      },
      completed: false,
      claimed: false
    },
    {
      id: 'dragon_master',
      name: 'Dragon Master',
      description: 'Kill 10 Blue Dragons.',
      objective: { type: 'kill', target: 10, current: 0, enemyType: 'blue_dragon' },
      reward: { 
        money: 1000, 
        essence: 50,
        item: { id: 'dragon_scimitar', name: 'Dragon Scimitar', description: 'Massive damage +25', type: 'weapon', bonus: { damage: 25 } }
      },
      completed: false,
      claimed: false
    }
  ];
  
  // Screen Shake
  shakeAmount: number = 0;
  
  // Boss Mechanics
  jadAttackTimer: number = 0;
  jadAttackType: 'mage' | 'range' | null = null;
  
  // Map
  path: Point[] = [];
  currentPathIndex: number = 0; // 0 for default, 1 for alternate
  
  // Wave Management
  enemiesToSpawn: Enemy[] = [];
  spawnTimer: number = 0;
  spawnInterval: number = 1000; // ms

  // Progression
  achievementPoints: number = 0;

  // Slayer
  slayerTask: SlayerTask | null = null;
  lastTaskType: EnemyType | null = null;
  consecutiveTasks: number = 0;

  // Audio
  audioCtx: AudioContext | null = null;
  soundCache: Map<string, HTMLAudioElement> = new Map();
  imageCache: Map<string, HTMLImageElement> = new Map();
  brokenImages: Set<string> = new Set();

  // Persistent Upgrades
  upgrades: GlobalUpgrades = {
    archerRange: 1.0,
    archerDamage: 1.0,
    magicDamage: 1.0,
    cannonSpeed: 1.0,
    slayerReward: 1.0,
    prayerEfficiency: 1.0,
    startingMoney: 0,
    rewardMultiplier: 1.0,
    waveSpeed: 1.0,
    towerCostReduction: 1.0,
    xpGainMultiplier: 1.0,
    prayerRegen: 0
  };

  constructor(canvas: HTMLCanvasElement, onStateChange: (state: any) => void, initialEssence: number = 0, upgrades?: Partial<GlobalUpgrades>) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.onStateChange = onStateChange;
    this.runeEssence = initialEssence;
    
    if (upgrades) {
      this.upgrades = { ...this.upgrades, ...upgrades };
    }

    this.initFarming(); // Initialize farming patches

    // Apply starting money upgrade
    this.money = 150 + this.upgrades.startingMoney;
    
    // Use fixed canvas size
    this.prevWidth = 1200;
    this.prevHeight = 800;
    this.canvas.width = this.prevWidth;
    this.canvas.height = this.prevHeight;

    // Init Audio & Images
    if (typeof window !== 'undefined') {
      try {
        this.audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        this.preloadSounds();
        this.preloadImages();
      } catch (e) {
        console.warn('AudioContext failed to initialize:', e);
      }
    }

    this.initPath();
    // this.resize(); // Disabled to prevent scaling issues
    // window.addEventListener('resize', () => this.resize()); // Disabled
    
    this.initNodes();
    this.assignSlayerTask();
  }

  preloadSounds() {
    const soundUrls: Record<string, string> = {
      ...ASSETS.sounds.death,
      ...ASSETS.sounds.misc
    };

    // Flatten shoot sounds
    Object.entries(ASSETS.sounds.shoot).forEach(([key, value]) => {
      if (typeof value === 'string') {
        soundUrls[key] = value;
      } else {
        Object.entries(value as Record<string, string>).forEach(([tier, url]) => {
          soundUrls[`${key}_${tier}`] = url;
        });
      }
    });

    Object.entries(soundUrls).forEach(([key, url]) => {
      const audio = new Audio();
      audio.crossOrigin = 'anonymous';
      audio.src = url;
      audio.preload = 'auto';
      audio.volume = this.settings.volume;
      this.soundCache.set(key, audio);
    });
  }

  updateSettings(settings: Partial<GameEngine['settings']>) {
    this.settings = { ...this.settings, ...settings };
    this.soundCache.forEach(audio => {
      audio.volume = this.settings.volume;
    });
    this.onStateChange({ settings: this.settings });
  }

  preloadImages() {
    const imageUrls = {
      ...ASSETS.enemies,
      ...ASSETS.pets,
      ...Object.fromEntries(Object.entries(ASSETS.towers).flatMap(([type, variants]) => 
        Object.entries(variants).map(([variant, url]) => [`${type}_${variant}`, url])
      )),
      ...ASSETS.items,
      ...ASSETS.misc
    };

    Object.entries(imageUrls).forEach(([key, url]) => {
      const img = new Image();
      img.onload = () => console.log(`Loaded image: ${key}`);
      img.onerror = () => {
        console.warn(`Failed to load image: ${key} (${url})`);
        this.brokenImages.add(key);
      };
      img.src = url;
      img.crossOrigin = 'anonymous';
      img.referrerPolicy = 'no-referrer';
      this.imageCache.set(key, img);
    });

    // Additional Fallbacks
    const portal = new Image();
    portal.src = 'https://oldschool.runescape.wiki/images/Transportation_logo.png';
    this.imageCache.set('portal', portal);
    
    const bones = new Image();
    bones.src = 'https://oldschool.runescape.wiki/images/Bones.png';
    this.imageCache.set('bones_loot', bones);
  }

  addMessage(text: string) {
    this.messages.push(text);
    if (this.messages.length > 50) this.messages.shift();
    this.onStateChange({ messages: [...this.messages] });
  }

  playSound(type: string) {
    const cached = this.soundCache.get(type);
    if (cached) {
      const now = performance.now();
      if (type === 'hit' || type.startsWith('shoot')) {
        const lastTime = (this as any)[`last_${type}_time`] || 0;
        if (now - lastTime < 50) return; 
        (this as any)[`last_${type}_time`] = now;
      }

      try {
        const sound = cached.cloneNode() as HTMLAudioElement;
        sound.volume = 0.15;
        sound.play().catch(() => {});
      } catch (e) {
        console.warn('Sound play error:', e);
      }
    }
  }

  resize() {
    const parent = this.canvas.parentElement;
    if (parent) {
      const rect = parent.getBoundingClientRect();
        const newWidth = rect.width;
        const newHeight = rect.height;
        
          if (this.prevWidth > 0 && this.prevHeight > 0 && (this.canvas.width !== newWidth || this.canvas.height !== newHeight)) {
             const scaleX = newWidth / this.prevWidth;
             const scaleY = newHeight / this.prevHeight;
             
             // Regenerate path according to new canvas size to avoid precision loss & click offset
             this.initPath(false, newWidth, newHeight); 
             
             // Scale Towers
           this.towers.forEach(t => { 
             t.x *= scaleX; 
             t.y *= scaleY; 
             t.range *= scaleX; // assuming range scales with width generally
           });
           
           // Scale Enemies
           this.enemies.forEach(e => {
             e.x *= scaleX;
             e.y *= scaleY;
             e.speed *= scaleX;
             e.baseSpeed *= scaleX;
           });
           
           // Projectiles
           this.projectiles.forEach(p => { p.x *= scaleX; p.y *= scaleY; });
           
           // Loots
           this.loots.forEach(l => { l.x *= scaleX; l.y *= scaleY; });
           
           // Particles
           this.particles.forEach(p => { p.x *= scaleX; p.y *= scaleY; });
        }
        
        this.canvas.width = newWidth;
        this.canvas.height = newHeight;
        this.prevWidth = newWidth;
        this.prevHeight = newHeight;
      }
    }

  updateMousePos(x: number, y: number) {
    this.mousePos = { x, y };
  }

  setSelectedTowerType(type: string | null) {
    this.selectedTowerType = type;
  }

  setPath(index: number) {
    this.currentPathIndex = index;
    this.initPath();
    // Reset game if path changes mid-game? For now, just reset entities
    this.enemies = [];
    this.projectiles = [];
    this.waveActive = false;
    this.enemiesToSpawn = [];
    this.addMessage(`Wave ${this.wave} has started!`);
    this.onStateChange({ isPlaying: false });
  }

  initPath(clearEnemies: boolean = true, forceWidth?: number, forceHeight?: number) {
    // Fill the current canvas dimensions
    let w = forceWidth || this.canvas.width || 800; // Let resize() mutate parent dimensions before calling
    let h = forceHeight || this.canvas.height || 600;
    
    // Save old path length to check if we need to reset enemies
    const oldPathLength = this.path.length;

    // Set theme based on path or wave
    if (this.currentPathIndex === 1) {
      this.theme = 'sand';
    } else if (this.wave >= 15) {
      this.theme = 'dark';
    } else {
      this.theme = 'grass';
    }

    if (this.currentPathIndex === 0) {
      // Winding Path (Default)
      this.path = [
        { x: -25, y: h * 0.2 },
        { x: w * 0.2, y: h * 0.2 },
        { x: w * 0.2, y: h * 0.8 },
        { x: w * 0.5, y: h * 0.8 },
        { x: w * 0.5, y: h * 0.4 },
        { x: w * 0.8, y: h * 0.4 },
        { x: w * 0.8, y: h * 0.6 },
        { x: w + 25, y: h * 0.6 }
      ];
    } else {
      // Spiral Path
      this.path = [
        { x: -25, y: h * 0.1 },
        { x: w * 0.9, y: h * 0.1 },
        { x: w * 0.9, y: h * 0.9 },
        { x: w * 0.1, y: h * 0.9 },
        { x: w * 0.1, y: h * 0.3 },
        { x: w * 0.7, y: h * 0.3 },
        { x: w * 0.7, y: h * 0.7 },
        { x: w * 0.3, y: h * 0.7 },
        { x: w * 0.3, y: h * 0.5 },
        { x: w + 25, y: h * 0.5 }
      ];
    }

    // Validate tower placements on new map
    const gridSize = 32;
    this.towers.forEach(tower => {
      if (!this.isValidPlacement(tower.x, tower.y)) {
        // Find nearest valid grid spot
        let found = false;
        for (let radius = 1; radius < 10 && !found; radius++) {
          for (let dx = -radius; dx <= radius && !found; dx++) {
            for (let dy = -radius; dy <= radius && !found; dy++) {
              const nx = tower.x + dx * gridSize;
              const ny = tower.y + dy * gridSize;
              if (this.isValidPlacement(nx, ny)) {
                tower.x = nx;
                tower.y = ny;
                found = true;
              }
            }
          }
        }
      }
    });

    // If path changed significantly and we're explicitly asked to clear layout-breaking bugs
    if (clearEnemies && oldPathLength > 0 && this.path.length !== oldPathLength && this.waveActive) {
      console.warn('Path length changed during wave, clearing enemies to prevent crash');
      this.enemies = [];
    }
  }

  assignSlayerTask() {
    const monsterUnlocks: { type: EnemyType, wave: number }[] = [
      { type: 'goblin', wave: 1 },
      { type: 'rat', wave: 1 },
      { type: 'skeleton', wave: 1 },
      { type: 'cow', wave: 2 },
      { type: 'zombie', wave: 2 },
      { type: 'ghost', wave: 1 },
      { type: 'imp', wave: 3 },
      { type: 'spider', wave: 2 },
      { type: 'hellhound', wave: 4 },
      { type: 'scorpion', wave: 3 },
      { type: 'fire_giant', wave: 5 },
      { type: 'bloodveld', wave: 6 },
      { type: 'hill_giant', wave: 4 },
      { type: 'black_demon', wave: 8 },
      { type: 'gargoyle', wave: 9 },
      { type: 'blue_dragon', wave: 10 },
      { type: 'nechryael', wave: 11 },
      { type: 'abyssal_demon', wave: 12 },
      { type: 'lesser_demon', wave: 5 },
      { type: 'dark_beast', wave: 15 },
      { type: 'green_dragon', wave: 7 }
    ];

    const available = monsterUnlocks.filter(m => m.wave <= this.wave && m.type !== this.lastTaskType);
    if (available.length === 0) return;

    const taskMonster = available[Math.floor(Math.random() * available.length)];
    const type = taskMonster.type;
    const count = 5 + Math.floor(Math.random() * 10) + Math.floor(this.wave / 2);

    // Consecutive bonus logic
    if (this.lastTaskType === type) {
      this.consecutiveTasks++;
    } else {
      this.consecutiveTasks = 0;
    }
    this.lastTaskType = type;

    const bonusMultiplier = 1 + (this.consecutiveTasks * 0.1);
    
    this.slayerTask = {
      type,
      count,
      total: count,
      reward: Math.floor((50 + (count * 2)) * this.upgrades.slayerReward * bonusMultiplier)
    };
    this.onStateChange({ 
      slayerTask: this.slayerTask,
      consecutiveTasks: this.consecutiveTasks 
    });
    this.playSound('task_assign');
  }

  start() {
    this.lastTime = performance.now();
    this.loop();
  }

  stop() {
    cancelAnimationFrame(this.animationId);
  }

  startWave() {
    if (this.waveActive) return;
    
    console.log(`Starting Wave ${this.wave}`);
    this.playSound('wave');
    this.waveActive = true;
    this.enemiesToSpawn = this.generateWave(this.wave);
    this.spawnInterval = 1000 / (this.upgrades.waveSpeed || 1);
    console.log(`Generated ${this.enemiesToSpawn.length} enemies for wave ${this.wave}. Path length: ${this.path.length}`);
    this.onStateChange({ 
      wave: this.wave, 
      isPlaying: true,
      remainingEnemies: this.enemiesToSpawn.length,
      prayerPoints: this.prayerPoints,
      maxPrayerPoints: this.maxPrayerPoints,
      specialAttackCharge: this.specialAttackCharge,
      achievements: this.achievements,
      pets: this.pets
    });
  }

  togglePrayer(type: PrayerType) {
    if (this.activePrayers.has(type)) {
      this.activePrayers.delete(type);
    } else if (this.prayerPoints > 0) {
      this.activePrayers.add(type);
      this.playSound('prayer_on');
    }
    this.onStateChange({ activePrayers: Array.from(this.activePrayers) });
  }

  useSpecialAttack() {
    if (this.specialAttackCharge >= 50) {
      this.specialAttackCharge -= 50;
      this.playSound('special_attack');
      
      // Effect: Massive AOE damage around all towers
      this.towers.forEach(tower => {
        this.enemies.forEach(enemy => {
          const dx = enemy.x - tower.x;
          const dy = enemy.y - tower.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < tower.range * 1.5) {
            this.damageEnemy(enemy, tower.damage * 2);
          }
        });
      });
      
      this.onStateChange({ specialAttackCharge: this.specialAttackCharge });
    }
  }

  checkAchievements() {
    let changed = false;
    this.achievements.forEach(ach => {
      if (ach.completed) return;
      if (ach.id === 'first_wave' && this.wave > 1) ach.completed = true;
      if (ach.id === 'rich' && this.money >= 1000) ach.completed = true;
      if (ach.id === 'slayer_master' && this.consecutiveTasks >= 5) ach.completed = true;
      if (ach.id === 'essence_hoarder' && this.runeEssence >= 50) ach.completed = true;
      if (ach.id === 'tower_master' && this.towers.length >= 10) ach.completed = true;
      
      if (ach.completed) {
        changed = true;
        this.achievementPoints += 10;
        this.playSound('level_up');
        this.particles.push({ x: 400, y: 300, life: 2, color: '#ffff00' });
      }
    });
    if (changed) this.onStateChange({ achievements: this.achievements, achievementPoints: this.achievementPoints });
  }

  getEnemyStats(type: EnemyType, waveMultiplier: number) {
    const baseStats: Record<EnemyType, { hp: number, level: number, speed: number, reward: number, color: string, deathSound?: string, weakness?: Element }> = {
      goblin: { hp: 5, level: 2, speed: 100, reward: 5, color: '#00ff00', deathSound: 'death_goblin' },
      rat: { hp: 2, level: 1, speed: 120, reward: 3, color: '#808080' },
      cow: { hp: 8, level: 2, speed: 80, reward: 10, color: '#8B4513', deathSound: 'death_cow' },
      imp: { hp: 4, level: 2, speed: 160, reward: 8, color: '#ff0000', deathSound: 'death_imp' },
      spider: { hp: 5, level: 2, speed: 130, reward: 12, color: '#ffff00', deathSound: 'death_spider' },
      scorpion: { hp: 17, level: 14, speed: 90, reward: 15, color: '#DAA520', deathSound: 'death_human' },
      hill_giant: { hp: 35, level: 28, speed: 70, reward: 25, color: '#A0522D', deathSound: 'death_human' },
      lesser_demon: { hp: 79, level: 82, speed: 100, reward: 35, color: '#800000', deathSound: 'death_demon' },
      green_dragon: { hp: 75, level: 79, speed: 80, reward: 60, color: '#006400', deathSound: 'death_dragon' },
      blue_dragon: { hp: 105, level: 111, speed: 75, reward: 80, color: '#0000CD', deathSound: 'death_dragon' },
      black_demon: { hp: 157, level: 172, speed: 110, reward: 70, color: '#000000', deathSound: 'death_demon' },
      abyssal_demon: { hp: 150, level: 124, speed: 180, reward: 75, color: '#4B0082', deathSound: 'death_abyssal_demon' },
      barrow_wight: { hp: 100, level: 100, speed: 50, reward: 120, color: '#F5F5DC', deathSound: 'death_zombie' },
      chaos_druid: { hp: 20, level: 13, speed: 120, reward: 40, color: '#32CD32', deathSound: 'death_human' },
      skeletal_mage: { hp: 40, level: 40, speed: 100, reward: 50, color: '#E6E6FA', deathSound: 'death_zombie' },
      skeleton: { hp: 18, level: 13, speed: 95, reward: 20, color: '#f0f0f0', deathSound: 'death_zombie' },
      zombie: { hp: 30, level: 24, speed: 75, reward: 25, color: '#4a5d23', deathSound: 'death_zombie' },
      ghost: { hp: 25, level: 19, speed: 110, reward: 30, color: '#a0d6d6', deathSound: 'death_ghost' },
      hellhound: { hp: 116, level: 122, speed: 150, reward: 50, color: '#ff4500', deathSound: 'death_demon' },
      fire_giant: { hp: 111, level: 86, speed: 75, reward: 60, color: '#ff8c00', weakness: 'water', deathSound: 'death_human' },
      bloodveld: { hp: 120, level: 76, speed: 90, reward: 65, color: '#ff00ff', deathSound: 'death_human' },
      gargoyle: { hp: 105, level: 111, speed: 80, reward: 70, color: '#708090', weakness: 'fire', deathSound: 'death_human' },
      nechryael: { hp: 105, level: 115, speed: 100, reward: 85, color: '#483D8B', deathSound: 'death_demon' },
      dark_beast: { hp: 220, level: 182, speed: 120, reward: 100, color: '#2F4F4F', deathSound: 'death_demon' },
      hydra: { hp: 300, level: 194, speed: 90, reward: 150, color: '#00FA9A', deathSound: 'death_boss' },
      jad: { hp: 250, level: 702, speed: 60, reward: 500, color: '#FF0000', deathSound: 'death_boss' },
      vorkath: { hp: 750, level: 732, speed: 50, reward: 1000, color: '#00FFFF', deathSound: 'death_dragon' },
      zulrah: { hp: 500, level: 725, speed: 70, reward: 800, color: '#2E8B57', deathSound: 'death_boss' }
    };

    const stats = baseStats[type];
    // Exponential scaling: each wave multiplies base HP significantly
    // waveMultiplier is the wave number. Wave 1 = ×1.0, Wave 5 = 1+(4*0.35)=×2.4, Wave 20 = ×7.65
    const hpScale = 1 + (waveMultiplier - 1) * 0.35;
    const speedScale = 1 + (waveMultiplier - 1) * 0.015; // Speed grows slowly (max ~30% at wave 20)
    const rewardScale = 1 + (waveMultiplier - 1) * 0.2; // Rewards also scale
    const effectiveHp = Math.floor(stats.hp * hpScale);
    const effectiveSpeed = Math.floor(stats.speed * speedScale);
    const effectiveReward = Math.floor(stats.reward * rewardScale);

    const isBoss = type === 'vorkath' || type === 'zulrah' || type === 'jad' || type === 'hydra';

    return {
      ...stats,
      hp: effectiveHp,
      maxHp: effectiveHp,
      speed: effectiveSpeed,
      reward: effectiveReward,
      burnTimer: 0,
      burnDamage: 0,
      groundTimer: 0,
      poisonTimer: 0,
      venomTimer: 0,
      venomDamage: 0,
      resistance: isBoss ? 0.5 : 0
    };
  }

  generateWave(waveNum: number): Enemy[] {
    console.log(`Generating wave ${waveNum} enemies`);
    const enemies: Enemy[] = [];
    
    // Wave composition logic
    const waveConfigs: { type: EnemyType, count: number }[] = [];
    
    if (waveNum === 1) {
      waveConfigs.push({ type: 'goblin', count: 5 });
      waveConfigs.push({ type: 'rat', count: 5 });
    } else if (waveNum === 2) {
      waveConfigs.push({ type: 'goblin', count: 8 });
      waveConfigs.push({ type: 'cow', count: 2 });
    } else if (waveNum === 3) {
      waveConfigs.push({ type: 'imp', count: 5 });
      waveConfigs.push({ type: 'spider', count: 3 });
    } else if (waveNum === 4) {
      waveConfigs.push({ type: 'scorpion', count: 5 });
      waveConfigs.push({ type: 'spider', count: 5 });
    } else if (waveNum === 5) {
      waveConfigs.push({ type: 'hill_giant', count: 3 });
      waveConfigs.push({ type: 'goblin', count: 10 });
    } else if (waveNum === 6) {
      waveConfigs.push({ type: 'black_demon', count: 3 });
      waveConfigs.push({ type: 'imp', count: 10 });
    } else if (waveNum === 7) {
      waveConfigs.push({ type: 'blue_dragon', count: 2 });
      waveConfigs.push({ type: 'hill_giant', count: 5 });
    } else if (waveNum === 8) {
      waveConfigs.push({ type: 'abyssal_demon', count: 5 });
      waveConfigs.push({ type: 'lesser_demon', count: 5 });
    } else if (waveNum === 10) {
      waveConfigs.push({ type: 'jad', count: 1 });
      waveConfigs.push({ type: 'lesser_demon', count: 5 });
    } else if (waveNum === 20) {
      waveConfigs.push({ type: 'vorkath', count: 1 });
      waveConfigs.push({ type: 'blue_dragon', count: 5 });
    } else if (waveNum === 30) {
      waveConfigs.push({ type: 'zulrah', count: 1 });
      waveConfigs.push({ type: 'green_dragon', count: 10 });
    } else if (waveNum === 11) {
      waveConfigs.push({ type: 'barrow_wight', count: 5 });
      waveConfigs.push({ type: 'skeletal_mage', count: 5 });
    } else if (waveNum === 12) {
      waveConfigs.push({ type: 'chaos_druid', count: 15 });
      waveConfigs.push({ type: 'black_demon', count: 5 });
    } else {
      // Procedural for other waves
      const difficulty = waveNum * 15;
      let remainingDifficulty = difficulty;
      
      while (remainingDifficulty > 0) {
        if (remainingDifficulty >= 200 && Math.random() > 0.95) {
          waveConfigs.push({ type: 'hydra', count: 1 });
          remainingDifficulty -= 200;
        } else if (remainingDifficulty >= 150 && Math.random() > 0.9) {
          waveConfigs.push({ type: 'dark_beast', count: 1 });
          remainingDifficulty -= 150;
        } else if (remainingDifficulty >= 100 && Math.random() > 0.85) {
          waveConfigs.push({ type: 'nechryael', count: 1 });
          remainingDifficulty -= 100;
        } else if (remainingDifficulty >= 80 && Math.random() > 0.8) {
          waveConfigs.push({ type: 'gargoyle', count: 1 });
          remainingDifficulty -= 80;
        } else if (remainingDifficulty >= 60 && Math.random() > 0.75) {
          waveConfigs.push({ type: 'bloodveld', count: 1 });
          remainingDifficulty -= 60;
        } else if (remainingDifficulty >= 50 && Math.random() > 0.7) {
          waveConfigs.push({ type: 'fire_giant', count: 1 });
          remainingDifficulty -= 50;
        } else if (remainingDifficulty >= 40 && Math.random() > 0.65) {
          waveConfigs.push({ type: 'hellhound', count: 1 });
          remainingDifficulty -= 40;
        } else if (remainingDifficulty >= 30 && Math.random() > 0.6) {
          waveConfigs.push({ type: 'ghost', count: 1 });
          remainingDifficulty -= 30;
        } else if (remainingDifficulty >= 20 && Math.random() > 0.5) {
          waveConfigs.push({ type: 'zombie', count: 1 });
          remainingDifficulty -= 20;
        } else if (remainingDifficulty >= 10) {
          waveConfigs.push({ type: 'skeleton', count: 1 });
          remainingDifficulty -= 10;
        } else {
          waveConfigs.push({ type: 'rat', count: 1 });
          remainingDifficulty -= 5;
        }
      }
    }

    // Ensure slayer task enemies spawn if task is active (on any wave)
    if (this.slayerTask && this.slayerTask.count > 0) {
      const taskType = this.slayerTask.type;
      
      // If the task type isn't already in the wave configuration (from fixed wave or random procedural), add it
      if (!waveConfigs.some(config => config.type === taskType)) {
        const taskSpawnCount = Math.min(this.slayerTask.count, Math.max(3, Math.floor(waveNum / 2)));
        waveConfigs.push({ type: taskType, count: taskSpawnCount });
      }
    }

    const multiplier = waveNum; // Pass wave number directly for exponential scaling

    if (this.path.length === 0) return enemies;

    for (const config of waveConfigs) {
      for (let i = 0; i < config.count; i++) {
        const stats = this.getEnemyStats(config.type, multiplier);
        enemies.push({
          id: Math.random().toString(36).substr(2, 9),
          x: this.path[0].x,
          y: this.path[0].y,
          ...stats,
          baseSpeed: stats.speed,
          pathIndex: 0,
          type: config.type,
          slowTimer: 0,
          stunTimer: 0,
          tauntTimer: 0
        });
      }
    }
    
    return enemies;
  }

  placeTower(type: string, x: number, y: number) {
    console.log(`Attempting to place tower ${type} at ${x}, ${y}`);
    let cost = 0;
    let range = 100;
    let damage = 10;
    let cooldown = 1000;
    let color = '#fff';
    let name = '';
    let upgradeCost = 0;
    let special: Tower['special'] = undefined;

    let mageMode: MageMode = 'elemental';
    let element: Element = 'air';
    let minDamage = 0;
    let maxDamage = 0;

    switch (type) {
      case 'archer':
        // Shortbow: max hit ~17 with moderate ammo. Rapid style.
        name = 'Shortbow';
        cost = 50;
        range = 7 * 25;
        damage = 13; // ~shortbow with addy arrows max hit
        cooldown = 3 * TICK * 1000; // 3 ticks
        color = '#9acd32';
        upgradeCost = 100;
        break;
      case 'wizard':
        // Air Strike: max hit ~8
        name = 'Air Strike';
        cost = 75;
        range = 7 * 25;
        damage = 8;
        cooldown = 5 * TICK * 1000; // 5 ticks
        color = '#a0cfff';
        upgradeCost = 150;
        mageMode = 'elemental';
        element = 'air';
        break;
      case 'cannon':
        // Dwarf Multicannon: max hit 30, hits up to 4 targets at once
        name = 'Dwarf Multicannon';
        cost = 250;
        range = 9 * 25; // 9 tiles
        minDamage = 0;  // Can splash
        maxDamage = 30; // OSRS max 30
        damage = 0;     // Uses min/max
        cooldown = 2 * TICK * 1000;
        color = '#cd5c5c';
        upgradeCost = 300;
        special = 'aoe';
        break;
      case 'tzhaar':
        // TzHaar-Ket melee: uses obsidian weapons; Toktz-xil-ak max ~35
        name = 'TzHaar-Ket';
        cost = 200;
        range = 2 * 25; // 2 tiles melee
        damage = 35;
        cooldown = 4 * TICK * 1000;
        color = '#8B0000';
        upgradeCost = 400;
        break;
      case 'slayer':
        // Slayer Helmet + Broad Bolts: max ~40
        name = 'Slayer Crossbow';
        cost = 125;
        range = 7 * 25;
        damage = 40;
        cooldown = 4 * TICK * 1000;
        color = '#4B0082';
        upgradeCost = 250;
        break;
      case 'toxic':
        // Toxic Blowpipe: max hit 20 with efficient darts, very fast, poisons
        name = 'Toxic Blowpipe';
        cost = 300;
        range = 5 * 25;
        damage = 20;
        cooldown = 2 * TICK * 1000;
        color = '#2a6b5a';
        upgradeCost = 500;
        special = 'slow'; // Poison = slow
        break;
    }

    const effectiveCost = Math.floor(cost * (this.upgrades.towerCostReduction || 1));
    const gridSize = 32;
    const snappedX = Math.round(x / gridSize) * gridSize;
    const snappedY = Math.round(y / gridSize) * gridSize;

    if (this.money >= effectiveCost) {
      if (this.isValidPlacement(snappedX, snappedY)) {
        console.log(`Placed tower ${type} successfully at ${snappedX}, ${snappedY}`);
        this.playSound('upgrade');
        this.money -= effectiveCost;
        this.towers.push({
          id: Math.random().toString(36).substr(2, 9),
          x: snappedX,
          y: snappedY,
          type: type as any,
          level: 1,
          maxLevel: 4,
          range,
          damage,
          cooldown,
          lastFired: 0,
          color,
          targetId: null,
          targetingPriority: 'first',
          name,
          upgradeCost,
          special,
          visualRadius: 18,
          disabledTimer: 0,
          minDamage,
          maxDamage,
          mageMode,
          element,
          specCharge: 0,
          specMax: 100,
          skills: {
            strength: { level: 1, xp: 0 },
            ranged: { level: 1, xp: 0 },
            magic: { level: 1, xp: 0 }
          },
          equipment: {
            weapon: null,
            shield: null,
            accessory: null
          }
        });
        this.upgradeTowerStats(this.towers[this.towers.length - 1]);
        this.awardPlayerXP('crafting', 20, snappedX, snappedY);
        this.onStateChange({ money: this.money });
      } else {
        console.warn('Invalid tower placement');
      }
    } else {
      console.warn('Not enough money for tower');
    }
  }

  setTargetingPriority(towerId: string, priority: TargetingPriority) {
    const tower = this.towers.find(t => t.id === towerId);
    if (tower) {
      tower.targetingPriority = priority;
      this.onStateChange({ towers: this.towers });
    }
  }

  upgradeTower(towerId: string) {
    const tower = this.towers.find(t => t.id === towerId);
    if (!tower) return;
    
    if (tower.level >= tower.maxLevel) return;
    const effectiveUpgradeCost = Math.floor(tower.upgradeCost * (this.upgrades.towerCostReduction || 1));
    if (this.money < effectiveUpgradeCost) return;

    this.playSound('upgrade');
    this.money -= effectiveUpgradeCost;
    tower.level++;
    tower.visualRadius += 2;

    // Add floating text for level up
    this.floatingTexts.push({
      x: tower.x,
      y: tower.y - 20,
      text: `Level Up!`,
      life: 2.0,
      color: '#ffff00',
      icon: tower.type === 'wizard' ? 'Magic' : tower.type === 'archer' ? 'Ranged' : 'Strength'
    });

    // Upgrade logic — OSRS-accurate weapon progression
    if (tower.type === 'archer') {
      if (tower.level === 2) {
        // Magic Shortbow: max hit ~26 (MSB(i) special fires 2x)
        tower.name = 'Magic Shortbow';
        tower.damage = 26;
        tower.cooldown = 3 * TICK * 1000;
        tower.range = 8 * 25 * this.upgrades.archerRange;
        tower.upgradeCost = 250;
        tower.color = '#32CD32';
        tower.specMax = 80; // Cheaper to fill spec bar
      } else if (tower.level === 3) {
        // Crystal Bow: max hit ~38, no ammo needed
        tower.name = 'Crystal Bow';
        tower.damage = 38;
        tower.cooldown = 5 * TICK * 1000; // Slower, stronger
        tower.range = 9 * 25 * this.upgrades.archerRange;
        tower.color = '#E0FFFF';
        tower.upgradeCost = 500;
      } else if (tower.level === 4) {
        // Bow of Faerdhinen: max hit ~53, hits fast
        tower.name = 'Bow of Faerdhinen';
        tower.damage = 53;
        tower.cooldown = 3 * TICK * 1000;
        tower.range = 10 * 25 * this.upgrades.archerRange;
        tower.color = '#a020f0';
        tower.specMax = 120; // Spec bar fills faster with more damage
      }
    } else if (tower.type === 'wizard') {
      const spellTiers = ['Strike', 'Bolt', 'Blast', 'Wave', 'Surge'];
      const ancientTiers = ['Rush', 'Burst', 'Blitz', 'Barrage'];
      
      if (tower.mageMode === 'elemental') {
        const tier = Math.min(tower.level - 1, 4);
        const elem = tower.element || 'air';
        tower.name = `${elem.charAt(0).toUpperCase()}${elem.slice(1)} ${spellTiers[tier]}`;
        // OSRS spell max hits per tier: ~8, 12, 18, 24, 30 (roughly)
        const spellMaxHits = [8, 12, 18, 24, 30];
        tower.damage = spellMaxHits[tier] * this.upgrades.magicDamage;
        tower.cooldown = 5 * TICK * 1000;
        tower.upgradeCost = 200 + (tower.level * 150);
        tower.fireSound = `wizard_${elem}`;
      } else if (tower.mageMode === 'ancients') {
        const tier = Math.min(tower.level - 1, 3);
        tower.name = `Ice ${ancientTiers[tier]}`;
        // Ice Rush/Burst/Blitz/Barrage: 16/20/23/29 max hit
        const ancientHits = [16, 20, 23, 29];
        tower.damage = ancientHits[tier] * this.upgrades.magicDamage;
        tower.fireSound = 'wizard_ice';
        tower.upgradeCost = 300 + (tower.level * 250);
        if (tower.level <= 2) {
          tower.cooldown = 5 * TICK * 1000;
          tower.special = 'slow';
        } else if (tower.level === 3) {
          tower.cooldown = 6 * TICK * 1000;
          tower.special = 'stun';
        } else {
          tower.cooldown = 8 * TICK * 1000;
          tower.special = 'aoe';
        }
      } else {
        // Utility mode: Ancient Sceptre bonuses
        const ancSceptreTiers = ['Lunar Staff', 'Ahrim\'s Staff', 'Ancient Sceptre', 'Tumeken\'s Shadow'];
        tower.name = ancSceptreTiers[Math.min(tower.level - 1, 3)];
        tower.damage = 0; // Utility: support, no attack (or minimal)
        tower.upgradeCost = 250 + (tower.level * 200);
      }
    } else if (tower.type === 'cannon') {
      // Cannon levels: Multicannon → Granite → Ballista (projectile)
      if (tower.level === 2) {
        tower.name = 'Granite Multicannon';
        tower.minDamage = 0;
        tower.maxDamage = 40;
        tower.upgradeCost = 500;
        tower.cooldown = 2 * TICK * 1000;
      } else if (tower.level === 3) {
        tower.name = 'Heavy Ballista';
        tower.minDamage = 15;
        tower.maxDamage = 60; // Ballista with javelins max ~84
        tower.upgradeCost = 900;
        tower.cooldown = 5 * TICK * 1000; // Slow but powerful
        tower.special = undefined; // Single target, but with stun
      } else if (tower.level === 4) {
        tower.name = 'Dragon Hunter Ballista';
        tower.minDamage = 20;
        tower.maxDamage = 84;
        tower.upgradeCost = 1500;
        tower.cooldown = 5 * TICK * 1000;
        tower.special = 'aoe';
        tower.color = '#8B0000';
      }
    } else if (tower.type === 'tzhaar') {
      if (tower.level === 2) {
        // Toktz-xil-ak: fast obsidian slash, max ~37
        tower.name = 'Toktz-xil-ak';
        tower.damage = 37;
        tower.range = 2 * 25;
        tower.upgradeCost = 800;
        tower.color = '#A52A2A';
        tower.cooldown = 3 * TICK * 1000; // Faster
      } else if (tower.level === 3) {
        // TzHaar-Ket-Om: flail, max ~75, chance to stun
        tower.name = 'TzHaar-Ket-Om';
        tower.damage = 75;
        tower.range = 3 * 25;
        tower.color = '#FF4500';
        tower.special = 'stun';
        tower.upgradeCost = 1200;
      } else if (tower.level === 4) {
        // Inquisitor's Mace: max ~100 with crush bonuses
        tower.name = 'Inquisitor\'s Mace';
        tower.damage = 100;
        tower.range = 3 * 25;
        tower.color = '#FF0000';
        tower.specMax = 50; // Spec fills very fast: AOE smash
      }
    } else if (tower.type === 'slayer') {
      if (tower.level === 2) {
        // Slayer Crossbow + Broad Bolts: max ~57
        tower.name = 'Karils Crossbow';
        tower.damage = 57;
        tower.upgradeCost = 500;
        tower.color = '#9370DB';
        tower.cooldown = 3 * TICK * 1000;
      } else if (tower.level === 3) {
        // Twisted Bow: max scaling, ~89 base without monster mag bonus
        tower.name = 'Twisted Bow';
        tower.damage = 89;
        tower.range = 10 * 25;
        tower.color = '#1a472a';
        tower.upgradeCost = 1000;
        tower.cooldown = 5 * TICK * 1000;
      } else if (tower.level === 4) {
        // Zaryte Crossbow: max ~100, best slayer crossbow
        tower.name = 'Zaryte Crossbow';
        tower.damage = 100;
        tower.range = 10 * 25;
        tower.color = '#0a0a0a';
        tower.specMax = 75; // Spec: armour piercing bolt
      }
    } else if (tower.type === 'toxic') {
      if (tower.level === 2) {
        // Zulrah's scales: Mutagen blowpipe upgrade
        tower.name = 'Serp. Helm Blowpipe';
        tower.damage = 28;
        tower.range = 6 * 25;
        tower.upgradeCost = 600;
        tower.color = '#2E8B57';
        tower.cooldown = 2 * TICK * 1000;
      } else if (tower.level === 3) {
        tower.name = 'Trident of the Swamp';
        tower.damage = 35;
        tower.range = 8 * 25;
        tower.upgradeCost = 1000;
        tower.special = 'slow';
      } else if (tower.level === 4) {
        tower.name = 'Magma Blowpipe';
        tower.damage = 45;
        tower.range = 9 * 25;
        tower.special = 'burn';
      }
    }

    this.upgradeTowerStats(tower); // Final pass for style/mode stats
    this.onStateChange({ money: this.money });
  }

  setArcherStyle(towerId: string, style: 'rapid' | 'long_range') {
    const tower = this.towers.find(t => t.id === towerId);
    if (tower && tower.type === 'archer') {
      tower.attackStyle = style;
      // Rapid = base stats (fast, normal range)
      // Long Range = +3 tiles range, but cooldown +1 tick (tradeoff) - fully reversible
      this.upgradeTowerStats(tower);
      this.onStateChange({ towers: this.towers });
    }
  }

  unequipItem(towerId: string, slot: 'weapon' | 'shield' | 'accessory') {
    const tower = this.towers.find(t => t.id === towerId);
    if (tower && tower.equipment[slot]) {
      const item = tower.equipment[slot];
      tower.equipment[slot] = null;
      this.inventory.push(item!);
      this.playSound('inventory_move');
      this.onStateChange({ towers: this.towers, inventory: this.inventory });
    }
  }

  setMageMode(towerId: string, mode: MageMode) {
    const tower = this.towers.find(t => t.id === towerId);
    if (tower && tower.type === 'wizard') {
      tower.mageMode = mode;
      if (mode === 'ancients') {
        tower.element = 'none';
        if (!tower.ancientType) tower.ancientType = 'ice';
      }
      if (mode === 'utility') {
        tower.element = 'none';
        tower.ancientType = undefined;
      }
      if (mode === 'elemental') {
        const elem = tower.element && tower.element !== 'none' ? tower.element : 'air';
        tower.element = elem;
        tower.ancientType = undefined;
      }
      this.upgradeTowerStats(tower);
      this.onStateChange({ towers: this.towers });
    }
  }

  setAncientType(towerId: string, type: AncientType) {
    const tower = this.towers.find(t => t.id === towerId);
    if (tower && tower.type === 'wizard' && tower.mageMode === 'ancients') {
      tower.ancientType = type;
      this.upgradeTowerStats(tower);
      this.onStateChange({ towers: this.towers });
    }
  }

  setMageElement(towerId: string, element: Element) {
    const tower = this.towers.find(t => t.id === towerId);
    if (tower && tower.type === 'wizard' && tower.mageMode === 'elemental') {
      tower.element = element;
      this.upgradeTowerStats(tower); // This now updates the name too
      this.onStateChange({ towers: this.towers });
    }
  }

  upgradeTowerStats(tower: Tower) {
    const tile = 25;
    const spellTiers = ['Strike', 'Bolt', 'Blast', 'Wave', 'Surge'];
    const ancientTiers = ['Rush', 'Burst', 'Blitz', 'Barrage'];
    
    // Level Bonus: 10% damage per level
    const levelMultiplier = 1 + (tower.level * 0.1);
    
    if (tower.type === 'archer') {
      tower.fireSound = 'archer_1';
      // Base stats per level (rapid style)
      const baseTiles = [7, 8, 9, 10][Math.min(tower.level - 1, 3)];
      const baseCooldownTicks = [3, 3, 5, 3][Math.min(tower.level - 1, 3)];
      
      const baseDamage = 10 * levelMultiplier;

      if (tower.attackStyle === 'long_range') {
        tower.range = (baseTiles + 3) * tile;
        tower.cooldown = (baseCooldownTicks + 1) * TICK * 1000;
        tower.damage = baseDamage;
      } else {
        // Rapid is default
        tower.range = baseTiles * tile;
        tower.cooldown = baseCooldownTicks * TICK * 1000;
        tower.damage = baseDamage;
      }
    } else if (tower.type === 'wizard') {
      const tier = Math.min(tower.level - 1, 4);
      if (tower.mageMode === 'elemental') {
        tower.range = 7 * tile;
        const elem = tower.element && tower.element !== 'none' ? tower.element : 'air';
        tower.name = `${elem.charAt(0).toUpperCase()}${elem.slice(1)} ${spellTiers[tier]}`;
        const spellMaxHits = [8, 12, 18, 24, 30];
        tower.damage = spellMaxHits[tier] * levelMultiplier;
        tower.fireSound = `wizard_${elem}_${tier}`;
        tower.special = undefined;
      } else if (tower.mageMode === 'ancients') {
        tower.range = 8 * tile;
        const ancientTier = Math.min(tower.level - 1, 3);
        const aType = tower.ancientType || 'ice';
        const typeNames: Record<string, string> = { ice: 'Ice', blood: 'Blood', shadow: 'Shadow', smoke: 'Smoke' };
        tower.name = `${typeNames[aType]} ${ancientTiers[ancientTier]}`;
        
        const ancientHits = [16, 20, 23, 29];
        tower.damage = ancientHits[ancientTier] * levelMultiplier;
        tower.fireSound = `ancient_${aType}_${ancientTier}`;
        
        if (aType === 'ice') {
          if (tower.level <= 2) {
            tower.special = 'slow';
          } else if (tower.level === 3) {
            tower.special = 'stun';
          } else {
            tower.special = 'aoe';
          }
        } else if (aType === 'blood') {
          tower.special = 'blood'; 
        } else if (aType === 'shadow') {
          tower.special = 'slow';
        } else if (aType === 'smoke') {
          tower.special = 'burn';
        }
      } else {
        // utility
        tower.range = 6 * tile;
        const utilTiers = ['Lunar Staff', "Ahrim's Staff", 'Ancient Sceptre', "Tumeken's Shadow"];
        tower.name = utilTiers[Math.min(tower.level - 1, 3)];
        tower.damage = 5 * levelMultiplier; // Utility does small damage now
        tower.special = undefined;
      }
    } else if (tower.type === 'cannon') {
        tower.fireSound = 'cannon_1';
        tower.range = 9 * tile;
        tower.damage = 30 * levelMultiplier;
    } else if (tower.type === 'tzhaar') {
        tower.fireSound = 'tzhaar_1';
        tower.range = (2 + tower.level) * tile;
        tower.damage = 25 * levelMultiplier;
    } else if (tower.type === 'slayer') {
        tower.fireSound = 'slayer_1';
        tower.range = 7 * tile;
        tower.damage = 15 * levelMultiplier;
    } else if (tower.type === 'toxic') {
        tower.fireSound = 'toxic_1';
        tower.range = 5 * tile;
        tower.damage = 8 * levelMultiplier;
    }
  }

  sellTower(towerId: string) {
    const index = this.towers.findIndex(t => t.id === towerId);
    if (index > -1) {
      this.playSound('sell');
      // Sell value increases with Crafting level
      const craftingBonus = 1 + (this.playerSkills.crafting.level - 1) * 0.02;
      this.money += Math.floor(25 * craftingBonus); 
      this.towers.splice(index, 1);
      this.onStateChange({ money: this.money, selectedPlacedTower: null });
    }
  }

  isValidPlacement(x: number, y: number): boolean {
    // Check collision with path
    const pathWidth = 25; // Adjusted from 40 for easier placement
    
    for (let i = 0; i < this.path.length - 1; i++) {
      const p1 = this.path[i];
      const p2 = this.path[i+1];
      
      // Distance from point to line segment
      const A = x - p1.x;
      const B = y - p1.y;
      const C = p2.x - p1.x;
      const D = p2.y - p1.y;

      const dot = A * C + B * D;
      const lenSq = C * C + D * D;
      let param = -1;
      if (lenSq !== 0) // in case of 0 length line
          param = dot / lenSq;

      let xx, yy;

      if (param < 0) {
        xx = p1.x;
        yy = p1.y;
      }
      else if (param > 1) {
        xx = p2.x;
        yy = p2.y;
      }
      else {
        xx = p1.x + param * C;
        yy = p1.y + param * D;
      }

      const dx = x - xx;
      const dy = y - yy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < pathWidth + 15) { // 15 is tower radius
        return false;
      }
    }
    
    // Check collision with other towers
    for (const tower of this.towers) {
      const dx = x - tower.x;
      const dy = y - tower.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 30) { // 15 + 15 radius
        return false;
      }
    }

    return true;
  }

  getEntityAt(x: number, y: number): { type: 'enemy' | 'tower', data: any } | null {
    // Check towers
    for (const tower of this.towers) {
      const dx = x - tower.x;
      const dy = y - tower.y;
      if (Math.sqrt(dx * dx + dy * dy) <= 15) {
        return { type: 'tower', data: tower };
      }
    }

    // Check enemies
    for (const enemy of this.enemies) {
      if (enemy.x < 0 || enemy.x > this.canvas.width || enemy.y < 0 || enemy.y > this.canvas.height) continue;
      if (enemy.pathIndex === 0) continue; 

      const dx = x - enemy.x;
      const dy = y - enemy.y;
      if (Math.sqrt(dx * dx + dy * dy) <= 20) {
        return { type: 'enemy', data: enemy };
      }
    }

    // Check pets (followers)
    for (const pet of this.pets) {
      if (pet.x !== undefined && pet.y !== undefined) {
        const dx = x - pet.x;
        const dy = y - pet.y;
        if (Math.sqrt(dx * dx + dy * dy) <= 15) {
          return { type: 'pet' as any, data: pet };
        }
      }
    }

    return null;
  }

  collectLootAt(x: number, y: number): boolean {
    const lootIndex = this.loots.findIndex(l => Math.sqrt(Math.pow(l.x-x,2)+Math.pow(l.y-y,2)) < 30);
    if (lootIndex === -1) return false;

    const loot = this.loots[lootIndex];
    if (loot.type === 'essence') {
      this.runeEssence += 5;
      this.damageNumbers.push({ x: loot.x, y: loot.y, text: '+5 Essence', life: 1.5, color: '#00ffff', velocityY: -40, velocityX: 0 });
      this.playSound('pick_up');
    } else if (loot.type === 'money') {
      const amt = loot.data || 20;
      this.money += amt;
      this.damageNumbers.push({ x: loot.x, y: loot.y, text: `+${amt} GP`, life: 1.5, color: '#ffff00', velocityY: -40, velocityX: 0 });
      this.playSound('sell');
    } else if (loot.type === 'bones') {
      this.awardPlayerXP('prayer', 15, loot.x, loot.y);
      this.playSound('bury_bones');
      this.damageNumbers.push({ x: loot.x, y: loot.y, text: '+15 Prayer XP', life: 1.5, color: '#ffffff', velocityY: -40, velocityX: 0 });
    } else if (loot.type === 'item' && loot.data) {
      this.inventory.push({ ...loot.data, id: Math.random().toString() });
      this.damageNumbers.push({ x: loot.x, y: loot.y, text: loot.data.name, life: 2.0, color: '#ff8000', velocityY: -50, velocityX: 0 });
      this.playSound('pick_up');
      this.addMessage(`Looted: ${loot.data.name}`);
    }
    this.loots.splice(lootIndex, 1);
    this.onStateChange({ runeEssence: this.runeEssence, money: this.money, inventory: this.inventory });
    return true;
  }

  initNodes() {
    this.nodes = [];
    const w = this.canvas.width;
    const h = this.canvas.height;

    // Add trees, rocks, herbs at fixed but valid positions
    const nodeConfigs = [
      { type: 'tree', name: 'Oak Tree', x: w * 0.1, y: h * 0.4, level: 1, xp: 15 },
      { type: 'tree', name: 'Willow Tree', x: w * 0.4, y: h * 0.1, level: 30, xp: 67 },
      { type: 'ore', name: 'Iron Rock', x: w * 0.7, y: h * 0.2, level: 15, xp: 35 },
      { type: 'ore', name: 'Coal Rock', x: w * 0.3, y: h * 0.6, level: 30, xp: 50 },
      { type: 'herb', name: 'Ranarr Weed', x: w * 0.6, y: h * 0.9, level: 25, xp: 40 },
      { type: 'herb', name: 'Snapdragon', x: w * 0.9, y: h * 0.3, level: 59, xp: 98 },
    ];

    nodeConfigs.forEach(config => {
      // Only add if not on path
      if (this.isValidPlacement(config.x, config.y)) {
        this.nodes.push({
          id: `node_${Math.random().toString(36).substr(2, 9)}`,
          x: config.x,
          y: config.y,
          type: config.type as any,
          name: config.name,
          level: config.level,
          xp: config.xp,
          respawnTimer: 0,
          maxRespawn: 15000 + Math.random() * 10000
        });
      }
    });
  }

  upgradeItem(itemId: string) {
    const itemIndex = this.inventory.findIndex(i => i.id === itemId);
    if (itemIndex === -1) return;
    const item = this.inventory[itemIndex];
    
    // Simple crafting logic: upgrade scimitars
    const progressions: Record<string, string> = {
      'Bronze Scimitar': 'Iron Scimitar',
      'Iron Scimitar': 'Steel Scimitar',
      'Steel Scimitar': 'Mithril Scimitar',
      'Mithril Scimitar': 'Adamant Scimitar',
      'Adamant Scimitar': 'Rune Scimitar',
      'Rune Scimitar': 'Dragon Scimitar'
    };

    const nextName = progressions[item.name];
    if (nextName) {
      if (this.money < 500) {
        this.addMessage("You need 500 GP to upgrade this item.");
        return;
      }
      if (this.playerSkills.crafting.level < 5) {
        this.addMessage("You need level 5 Crafting to upgrade items.");
        return;
      }

      this.money -= 500;
      this.playerSkills.crafting.xp += 50;
      
      // Tiered bonuses
      const damages: Record<string, number> = { 'Iron Scimitar': 10, 'Steel Scimitar': 20, 'Mithril Scimitar': 35, 'Adamant Scimitar': 55, 'Rune Scimitar': 80, 'Dragon Scimitar': 120 };
      
      this.inventory[itemIndex] = {
        ...item,
        name: nextName,
        bonus: { damage: damages[nextName] }
      };
      this.addMessage(`Successfully crafted ${nextName}!`);
      this.playSound('upgrade');
      
      if (this.playerSkills.crafting.xp >= this.playerSkills.crafting.level * 100) {
        this.playerSkills.crafting.level++;
        this.addMessage(`Level Up! You are now level ${this.playerSkills.crafting.level} Crafting.`);
      }
      this.onStateChange({ inventory: this.inventory, money: this.money, playerSkills: this.playerSkills });
    }
  }

  loop() {
    const now = performance.now();
    const rawDt = Math.min((now - this.lastTime) / 1000, this.maxDt);
    this.lastTime = now;

    // Apply Game Speed (only for game logic, not real-world timers)
    const dt = this.isPaused ? 0 : Math.min(rawDt * this.gameSpeed, this.maxDt * this.gameSpeed);
    this.gameTime += dt * 1000;

    this.update(dt, this.gameTime, rawDt);
    this.draw();
    this.animationId = requestAnimationFrame(() => this.loop());
  }

  pause() {
    this.isPaused = true;
    this.onStateChange({ isPaused: true });
  }

  resume() {
    this.isPaused = false;
    this.onStateChange({ isPaused: false });
  }

  setGold(amount: number) {
    this.money = Math.max(0, amount);
    this.onStateChange({ money: this.money });
  }

  calculateTowerStats(tower: Tower) {
    let damageMultiplier = 1.0;
    let rangeMultiplier = 1.0;
    let speedMultiplier = 1.0;

    // Apply Global Upgrades
    if (tower.type === 'archer') {
      rangeMultiplier *= this.upgrades.archerRange;
      damageMultiplier *= (this.upgrades.archerDamage || 1.0);
    } else if (tower.type === 'wizard') {
      damageMultiplier *= this.upgrades.magicDamage;
    } else if (tower.type === 'cannon') {
      speedMultiplier *= this.upgrades.cannonSpeed;
    }

    // Apply Prayer Bonuses
    if (tower.type === 'archer') {
      if (this.activePrayers.has('rigour')) { damageMultiplier *= 1.23; rangeMultiplier *= 1.0; }
      else if (this.activePrayers.has('eagle_eye')) damageMultiplier *= 1.15;
      else if (this.activePrayers.has('hawk_eye')) damageMultiplier *= 1.10;
      else if (this.activePrayers.has('sharp_eye')) damageMultiplier *= 1.05;
    } else if (tower.type === 'wizard') {
      if (this.activePrayers.has('augury')) damageMultiplier *= 1.25;
      else if (this.activePrayers.has('mystic_will')) damageMultiplier *= 1.05;
    } else if (tower.type === 'tzhaar') {
      if (this.activePrayers.has('piety')) damageMultiplier *= 1.23;
      else if (this.activePrayers.has('ultimate_strength')) damageMultiplier *= 1.15;
      else if (this.activePrayers.has('burst_of_strength')) damageMultiplier *= 1.05;
    }

    // Apply Potion Bonuses
    if (this.activePotions.some(p => p.type === 'overload')) {
      damageMultiplier *= 1.15;
      rangeMultiplier *= 1.1;
      speedMultiplier *= 1.1;
    }
    if (tower.type === 'archer' && this.activePotions.some(p => p.type === 'ranging')) {
      damageMultiplier *= 1.15;
      rangeMultiplier *= 1.1;
    }
    if (tower.type === 'wizard' && this.activePotions.some(p => p.type === 'magic')) {
      damageMultiplier *= 1.2;
    }
    if (tower.type === 'tzhaar' && this.activePotions.some(p => p.type === 'super_combat')) {
      damageMultiplier *= 1.15;
    }

    // Apply Support Tower (Utility Mage) Buffs
    this.towers.forEach(t => {
      if (t.id !== tower.id && t.type === 'wizard' && t.mageMode === 'utility') {
        const dist = Math.sqrt(Math.pow(t.x - tower.x, 2) + Math.pow(t.y - tower.y, 2));
        if (dist <= t.range) {
          // Buffs based on Utility Mage level
          if (t.level >= 1) rangeMultiplier *= 1.1;
          if (t.level >= 2) speedMultiplier *= 1.1;
          if (t.level >= 3) rangeMultiplier *= 1.1; // Stacked
          if (t.level >= 4) damageMultiplier *= 1.1;
        }
      }
    });

    // Equipment Bonuses
    if (tower.equipment.weapon) {
      if (tower.equipment.weapon.bonus.damage) damageMultiplier *= (1 + tower.equipment.weapon.bonus.damage / 100);
      if (tower.equipment.weapon.bonus.range) rangeMultiplier *= (1 + tower.equipment.weapon.bonus.range / 100);
      if (tower.equipment.weapon.bonus.cooldown) speedMultiplier *= (1 + tower.equipment.weapon.bonus.cooldown / 100);
    }
    if (tower.equipment.shield) {
      if (tower.equipment.shield.bonus.damage) damageMultiplier *= (1 + tower.equipment.shield.bonus.damage / 100);
      if (tower.equipment.shield.bonus.range) rangeMultiplier *= (1 + tower.equipment.shield.bonus.range / 100);
      if (tower.equipment.shield.bonus.cooldown) speedMultiplier *= (1 + tower.equipment.shield.bonus.cooldown / 100);
    }
    if (tower.equipment.accessory) {
      if (tower.equipment.accessory.bonus.damage) damageMultiplier *= (1 + tower.equipment.accessory.bonus.damage / 100);
      if (tower.equipment.accessory.bonus.range) rangeMultiplier *= (1 + tower.equipment.accessory.bonus.range / 100);
      if (tower.equipment.accessory.bonus.cooldown) speedMultiplier *= (1 + tower.equipment.accessory.bonus.cooldown / 100);
    }

    return {
      damageMultiplier,
      range: tower.range * rangeMultiplier,
      cooldown: tower.cooldown / speedMultiplier
    };
  }

  initFarming() {
    this.farmingPatches = [];
    if (this.currentRegion === 'misthalin') {
      this.farmingPatches.push({
        id: 'patch_1',
        x: 100,
        y: 150,
        type: 'allotment',
        seed: null,
        stage: 0,
        timer: 0,
        yield: 0,
        maxStage: 4
      });
      this.farmingPatches.push({
        id: 'patch_2',
        x: 150,
        y: 150,
        type: 'herb',
        seed: null,
        stage: 0,
        timer: 0,
        yield: 0,
        maxStage: 4
      });
    }
  }

  updateFarming(dt: number) {
    this.farmingPatches.forEach(patch => {
      if (patch.stage > 0 && patch.stage < patch.maxStage) {
        patch.timer -= dt;
        if (patch.timer <= 0) {
          patch.stage++;
          patch.timer = 10; // Default 10s per stage for now
          if (patch.stage === patch.maxStage) {
             this.addMessage(`A farming patch is ready to harvest!`);
             this.playSound('level_up'); // Reuse sound for now
          }
        }
      }
    });
  }

  plantSeed(patchId: string, seedItem: Item) {
    const patch = this.farmingPatches.find(p => p.id === patchId);
    if (!patch || patch.stage !== 0) return;
    if (patch.type !== seedItem.seedType) {
      this.addMessage(`You can't plant ${seedItem.name} in this patch.`);
      return;
    }
    
    patch.seed = seedItem.id;
    patch.stage = 1;
    patch.timer = seedItem.growthTime || 10;
    patch.yield = 3 + Math.floor(this.playerSkills.farming.level / 10);
    
    const idx = this.inventory.findIndex(i => i.id === seedItem.id);
    if (idx > -1) {
      this.inventory.splice(idx, 1);
      this.onStateChange({ inventory: this.inventory });
    }
    
    this.addMessage(`You plant the ${seedItem.name}.`);
    this.playSound('inventory_move');
  }

  harvestPatch(patchId: string) {
    const patch = this.farmingPatches.find(p => p.id === patchId);
    if (!patch || patch.stage !== patch.maxStage) return;
    
    const xp = 50 * patch.yield;
    this.awardPlayerXP('farming', xp, patch.x, patch.y);
    
    // Add harvested items
    // For now, generate a generic herb item if harvestItem is missing
    const itemId = patch.seed ? patch.seed.replace('_seed', '') : 'grimy_herb';
    
    for(let i=0; i<patch.yield; i++) {
      this.inventory.push({
        id: itemId,
        name: itemId.replace('_', ' '),
        description: 'A harvested crop.',
        type: 'herb',
        bonus: {},
        sellPrice: 100
      });
    }
    
    patch.seed = null;
    patch.stage = 0;
    patch.timer = 0;
    patch.yield = 0;
    
    this.addMessage(`You harvest the patch.`);
    this.playSound('inventory_move');
    this.onStateChange({ inventory: this.inventory });
  }

  makePotion(herbItem: Item, secondaryItem: Item) {
     // Simplified: Herb + Vial = Potion
     // Or just Herb -> Clean Herb -> Potion (with secondary)
     // Let's assume we just click a "Make Potion" button in UI which calls this
     
     // For now, let's just implement a simple "Clean Herb" action
     if (herbItem.type === 'herb' && herbItem.name.includes('grimy')) {
        const idx = this.inventory.findIndex(i => i.id === herbItem.id);
        if (idx > -1) {
           this.inventory[idx].name = herbItem.name.replace('grimy', 'clean');
           this.inventory[idx].description = 'A clean herb, ready for potion making.';
           this.awardPlayerXP('herblore', 10);
           this.playSound('inventory_move');
           this.onStateChange({ inventory: this.inventory });
        }
     }
  }

  sellItem(itemIndex: number) {
    const item = this.inventory[itemIndex];
    if (!item) return;
    
    // Sell price logic: Base price + (Wave * 5)
    // Cap at 5000 GP to prevent exploitation
    const basePrice = item.sellPrice || 50;
    const waveBonus = this.wave * 5;
    const price = Math.min(5000, basePrice + waveBonus);

    this.money += price;
    this.inventory.splice(itemIndex, 1);
    this.playSound('sell');
    this.addMessage(`Sold ${item.name} for ${price} GP`);
    this.onStateChange({ money: this.money, inventory: this.inventory });
  }

  update(dt: number, now: number, rawDt: number = dt) {
    // Update Farming
    this.updateFarming(dt / 1000); // dt is in ms, convert to seconds for farming timer

    // Update Shake
    if (this.shakeAmount > 0) {
      this.shakeAmount -= dt * 20;
      if (this.shakeAmount < 0) this.shakeAmount = 0;
    }

    // Update Particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      this.particles[i].life -= dt;
      if (this.particles[i].life <= 0) {
        this.particles.splice(i, 1);
      }
    }

    // Update Damage Numbers
    for (let i = this.damageNumbers.length - 1; i >= 0; i--) {
      const dn = this.damageNumbers[i];
      dn.life -= dt;
      dn.y += dn.velocityY * dt;
      dn.x += dn.velocityX * dt;
      dn.velocityY += 60 * dt; // Gravity
      if (dn.life <= 0) this.damageNumbers.splice(i, 1);
    }

    // Update Floating Texts
    for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
      const ftObj = this.floatingTexts[i];
      ftObj.life -= dt;
      ftObj.y -= 30 * dt; // Float up faster
      if (ftObj.life <= 0) this.floatingTexts.splice(i, 1);
    }

    // Update Loots — use rawDt so loot expiry is NOT sped up by game speed
    for (let i = this.loots.length - 1; i >= 0; i--) {
      this.loots[i].life -= rawDt;
      if (this.loots[i].life <= 0) this.loots.splice(i, 1);
    }

    // Update Potions
    for (let i = this.activePotions.length - 1; i >= 0; i--) {
      const p = this.activePotions[i];
      p.timer -= dt;
      if (p.timer <= 0) {
        this.activePotions.splice(i, 1);
      }
    }

    if (!this.waveActive && this.autoSpawnEnabled && this.autoSpawnTimer > 0) {
      this.autoSpawnTimer -= dt;
      if (this.autoSpawnTimer <= 0) {
        this.startWave();
      } else {
        this.onStateChange({ autoSpawnTimer: this.autoSpawnTimer });
      }
    }

    if (this.waveActive) {
      this.specialAttackCharge = Math.min(this.maxSpecialAttack, this.specialAttackCharge + dt * 2);
    }
    this.onStateChange({ specialAttackCharge: this.specialAttackCharge });

    if (this.wave > 1) {
      this.updateQuests('wave', this.wave);
    }

    // Prayer Drain
    if (this.activePrayers.size > 0 && this.prayerPoints > 0) {
      let totalDrain = 0;
      this.activePrayers.forEach(id => {
        const pray = this.allPrayers.find(p => p.id === id);
        if (pray) totalDrain += pray.drain;
      });
      
      const drainRate = (totalDrain / 10) * (this.upgrades.prayerEfficiency || 1) * (1 - (this.playerSkills.prayer.level - 1) * 0.01); 
      this.prayerPoints = Math.max(0, this.prayerPoints - dt * drainRate);
      
      if (this.prayerPoints <= 0) {
        this.activePrayers.clear();
        this.playSound('prayer_off');
        this.onStateChange({ activePrayers: [] });
      }
      this.onStateChange({ prayerPoints: this.prayerPoints });
    }

    this.checkAchievements();

    // Process Pet Quotes
    this.petQuoteTimer -= dt;
    if (this.petQuoteTimer <= 0) {
       if (this.followingPetId) {
          const pet = this.pets.find(p => p.id === this.followingPetId);
          if (pet) {
             const quotes = this.petQuotes[pet.type] || ["Hello!"];
             this.activeQuote = {
                text: quotes[Math.floor(Math.random() * quotes.length)],
                timer: 3.0 // Show for 3 seconds
             };
          }
       }
       this.petQuoteTimer = 15 + Math.random() * 20; // Next quote in 15-35s
    }

    if (this.activeQuote) {
       this.activeQuote.timer -= dt;
       if (this.activeQuote.timer <= 0) this.activeQuote = null;
    }
    this.enemies.forEach(enemy => {
      if (enemy.type === 'vorkath' || enemy.type === 'zulrah') {
        if (Math.random() < 0.005) { // Rare attack
          this.playSound('boss_attack');
          const targetTower = this.towers[Math.floor(Math.random() * this.towers.length)];
          if (targetTower) {
            targetTower.disabledTimer = 3; // Disable for 3 seconds
            this.particles.push({ x: targetTower.x, y: targetTower.y, life: 3, color: '#00ff00' });
          }
        }
      }
    });

    // Spawning
    if (this.waveActive && this.enemiesToSpawn.length > 0) {
      this.spawnTimer += dt * 1000;
      if (this.spawnTimer >= this.spawnInterval) {
        const enemy = this.enemiesToSpawn.shift();
        if (enemy) {
          if (enemy.type === 'vorkath' || enemy.type === 'zulrah' || enemy.type === 'jad') {
            this.addMessage(`A boss has appeared: ${enemy.type.toUpperCase()}!`);
          }
          // Safeguard: Ensure spawn point is valid
          if (isNaN(enemy.x) || isNaN(enemy.y)) {
            enemy.x = this.path[0].x;
            enemy.y = this.path[0].y;
          }
          this.enemies.push(enemy);
        }
        this.spawnTimer = 0;
        this.onStateChange({ remainingEnemies: this.enemiesToSpawn.length + this.enemies.length });
      }
    } else if (this.waveActive && this.enemiesToSpawn.length === 0 && this.enemies.length === 0) {
      // Wave complete
      this.waveActive = false;
      
      // Award player based on performance
      const performanceBonus = Math.floor((this.lives * 10) + (this.money * 0.05));
      // New Formula: Base + (Enemies * 2) + (Wave * 10)
      const baseReward = 50 + (this.enemiesToSpawn.length * 2) + (this.wave * 10);
      const totalMoneyReward = Math.floor((baseReward + performanceBonus) * (this.upgrades.rewardMultiplier || 1));
      
      // Rune Essence based on upgrade level and wave
      // Base 5 + Wave * 1.5
      const essenceReward = Math.floor((5 + (this.wave * 1.5)) * (1 + (this.upgrades.slayerReward || 0) * 0.1));
      
      this.money += totalMoneyReward;
      this.runeEssence += essenceReward;
      
      this.addMessage(`Wave ${this.wave} complete! Reward: ${totalMoneyReward} GP, ${essenceReward} Essence.`);
      this.floatingTexts.push({
        x: this.canvas.width / 2,
        y: this.canvas.height / 2,
        text: `WAVE COMPLETE! +${totalMoneyReward} GP`,
        life: 3,
        color: '#ffff00'
      });

      this.wave++;
      this.autoSpawnTimer = this.autoSpawnDelay; // Reset timer for next wave countdown
      this.onStateChange({ 
        wave: this.wave, 
        isPlaying: false, 
        autoSpawnTimer: this.autoSpawnTimer,
        money: this.money,
        runeEssence: this.runeEssence
      });
    }

    // Update Enemies
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const enemy = this.enemies[i];
      if (!enemy) continue;
      
      // Apply stun
      if (enemy.stunTimer > 0) {
        enemy.stunTimer -= dt;
        if (enemy.stunTimer <= 0) {
           // Stun over
        } else {
           // Stunned, skip movement
           continue;
        }
      }

      // Apply slow decay
      if (enemy.slowTimer > 0) {
        enemy.slowTimer -= dt;
        if (enemy.slowTimer <= 0) {
          enemy.speed = enemy.baseSpeed;
        }
      }

      // Apply taunt decay
      if (enemy.tauntTimer > 0) {
        enemy.tauntTimer -= dt;
        if (enemy.tauntTimer <= 0) {
          // Taunt over
        } else {
          // Taunted enemies move much slower
          enemy.speed = enemy.baseSpeed * 0.2;
        }
      }

      if (this.path.length <= enemy.pathIndex + 1) {
        // Enemy reached end of path
        if (!this.devMode) {
          this.lives--;
          this.shakeAmount = 10;
          this.onStateChange({ lives: this.lives });
          if (this.lives <= 0) this.resetGame();
          else this.playSound('hit');
        }
        this.enemies.splice(i, 1);
        continue;
      }

      if (isNaN(enemy.x) || isNaN(enemy.y)) {
        this.enemies.splice(i, 1);
        continue;
      }

      const target = this.path[enemy.pathIndex + 1];
      
      if (!target) {
        // Enemy has walked off the end of the path
        if (!this.devMode) {
          this.lives--;
          this.shakeAmount = 10;
          this.onStateChange({ lives: this.lives });
          if (this.lives <= 0) this.resetGame();
        }
        this.enemies.splice(i, 1);
        continue;
      }

      const dx = target.x - enemy.x;
      const dy = target.y - enemy.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      
      if (dist < 5) {
        enemy.pathIndex++;
      } else {
        const moveX = (dx / dist) * enemy.speed * dt;
        const moveY = (dy / dist) * enemy.speed * dt;
        enemy.x += moveX;
        enemy.y += moveY;
      }

      // Process Burn
      if (enemy.burnTimer > 0) {
        enemy.burnTimer -= dt;
        if (Math.random() < dt * 2) {
          this.damageEnemy(enemy, enemy.burnDamage, undefined, true);
        }
      }

      // Process Ground/Entangle
      if (enemy.groundTimer > 0) {
          enemy.groundTimer -= dt;
          enemy.speed = 0;
      }

      // Process Poison
      if (enemy.poisonTimer && enemy.poisonTimer > 0) {
        enemy.poisonTimer -= dt;
        if (Math.random() < dt * 0.5) {
          this.damageEnemy(enemy, 6, undefined, true);
        }
      }

      // Process Venom
      if (enemy.venomTimer && enemy.venomTimer > 0) {
        enemy.venomTimer -= dt;
        if (Math.random() < dt * 0.5) {
          this.damageEnemy(enemy, enemy.venomDamage || 6, undefined, true);
          enemy.venomDamage = Math.min(20, (enemy.venomDamage || 6) + 2);
        }
      }

      if (enemy.stunTimer > 0) {
          // Handled above via continue
      } else if (enemy.slowTimer > 0) {
          // Handled via speed adjustment
      }

      // Boss special attacks
      if (enemy.type === 'vorkath' && Math.random() < 0.005) {
        // Disable a random tower
        const target = this.towers[Math.floor(Math.random() * this.towers.length)];
        if (target) {
          target.disabledTimer = 300; // 5 seconds
          this.particles.push({ x: target.x, y: target.y, life: 1, color: '#00ff00' });
        }
      }

      if (enemy.type === 'zulrah' && Math.random() < 0.003) {
        // Spawn snakelings
        for (let i = 0; i < 3; i++) {
          const stats = this.getEnemyStats('rat', 1.5); // Use rat stats for snakelings
          this.enemies.push({
            id: Math.random().toString(36).substr(2, 9),
            x: enemy.x + (Math.random() - 0.5) * 20,
            y: enemy.y + (Math.random() - 0.5) * 20,
            hp: stats.hp,
            maxHp: stats.maxHp,
            speed: stats.speed * 1.5,
            baseSpeed: stats.speed * 1.5,
            pathIndex: enemy.pathIndex,
            type: 'rat',
            color: '#2E8B57',
            reward: 1,
            slowTimer: 0,
            stunTimer: 0,
            tauntTimer: 0,
            burnTimer: 0,
            burnDamage: 0,
            groundTimer: 0,
            resistance: 0
          });
        }
      }

      if (enemy.type === 'jad') {
        enemy.jadTimer = (enemy.jadTimer || 0) + dt * 1000;
        if (enemy.jadTimer > 4000) { // Every 4 seconds
          enemy.jadTimer = 0;
          enemy.jadAttackType = Math.random() > 0.5 ? 'mage' : 'range';
          enemy.jadAttackActive = true;
          enemy.jadAttackResolveTimer = 1500; // 1.5s warning
          
          // Visual warning
          this.particles.push({ x: enemy.x, y: enemy.y - 40, life: 1.5, color: enemy.jadAttackType === 'mage' ? '#0000ff' : '#00ff00' });
        }

        if (enemy.jadAttackActive && enemy.jadAttackResolveTimer !== undefined) {
          enemy.jadAttackResolveTimer -= dt * 1000;
          if (enemy.jadAttackResolveTimer <= 0) {
            enemy.jadAttackActive = false;
            // If Jad attacks and you don't have ANY prayer active, you lose a life
            // Actually OSRS Jad requires specific prayer, but simple mode: need any combat prayer
            if (this.activePrayers.size === 0) {
              this.lives--;
              this.shakeAmount = 10;
              this.onStateChange({ lives: this.lives });
            }
          }
        }
      }
    }

    this.towers.forEach(tower => {
      if (tower.disabledTimer > 0) {
        tower.disabledTimer -= dt;
        return;
      }

      // Calculate Effective Stats
      const stats = this.calculateTowerStats(tower);
      const effectiveRange = stats.range;
      const effectiveCooldown = stats.cooldown;
      const damageMultiplier = stats.damageMultiplier;

      // Targeting
      if (!tower.targetId || !this.enemies.find(e => e.id === tower.targetId)) {
        const inRangeEnemies = this.enemies.filter(enemy => {
          const isOffscreen = enemy.x < 0 || enemy.x > this.canvas.width || enemy.y < 0 || enemy.y > this.canvas.height;
          if (isOffscreen) return false;
          const d = Math.sqrt(Math.pow(enemy.x - tower.x, 2) + Math.pow(enemy.y - tower.y, 2));
          return d <= effectiveRange;
        });

        if (inRangeEnemies.length > 0) {
          let selectedEnemy: Enemy | null = null;
          const priority = tower.targetingPriority || 'first';

          switch (priority) {
            case 'first':
              selectedEnemy = inRangeEnemies.reduce((prev, curr) => {
                if (curr.pathIndex > prev.pathIndex) return curr;
                if (curr.pathIndex < prev.pathIndex) return prev;
                const nextPoint = this.path[curr.pathIndex + 1];
                if (!nextPoint) return prev;
                const dPrev = Math.sqrt(Math.pow(nextPoint.x - prev.x, 2) + Math.pow(nextPoint.y - prev.y, 2));
                const dCurr = Math.sqrt(Math.pow(nextPoint.x - curr.x, 2) + Math.pow(nextPoint.y - curr.y, 2));
                return dCurr < dPrev ? curr : prev;
              });
              break;
            case 'last':
              selectedEnemy = inRangeEnemies.reduce((prev, curr) => {
                if (curr.pathIndex < prev.pathIndex) return curr;
                if (curr.pathIndex > prev.pathIndex) return prev;
                const nextPoint = this.path[curr.pathIndex + 1];
                if (!nextPoint) return prev;
                const dPrev = Math.sqrt(Math.pow(nextPoint.x - prev.x, 2) + Math.pow(nextPoint.y - prev.y, 2));
                const dCurr = Math.sqrt(Math.pow(nextPoint.x - curr.x, 2) + Math.pow(nextPoint.y - curr.y, 2));
                return dCurr > dPrev ? curr : prev;
              });
              break;
            case 'strongest':
              selectedEnemy = inRangeEnemies.reduce((prev, curr) => curr.hp > prev.hp ? curr : prev);
              break;
            case 'weakest':
              selectedEnemy = inRangeEnemies.reduce((prev, curr) => curr.hp < prev.hp ? curr : prev);
              break;
            case 'closest':
            default:
              selectedEnemy = inRangeEnemies.reduce((prev, curr) => {
                const dPrev = Math.sqrt(Math.pow(prev.x - tower.x, 2) + Math.pow(prev.y - tower.y, 2));
                const dCurr = Math.sqrt(Math.pow(curr.x - tower.x, 2) + Math.pow(curr.y - tower.y, 2));
                return dCurr < dPrev ? curr : prev;
              });
              break;
          }
          tower.targetId = selectedEnemy?.id || null;
        } else {
          tower.targetId = null;
        }
      }

      const target = this.enemies.find(e => e.id === tower.targetId);
      if (target && Math.sqrt(Math.pow(target.x-tower.x,2)+Math.pow(target.y-tower.y,2)) <= effectiveRange) {
        if (this.gameTime - tower.lastFired >= effectiveCooldown) {
          let baseDmg = tower.damage;
          if (tower.type === 'cannon') {
             baseDmg = (tower.minDamage || 0) + Math.random() * ((tower.maxDamage || 0) - (tower.minDamage || 0));
          }
          let finalDamage = Math.floor(baseDmg * damageMultiplier);
          
          if (tower.type === 'wizard' && tower.mageMode === 'elemental' && target.weakness === tower.element) {
            finalDamage = Math.floor(finalDamage * 1.5);
          }

          tower.lastFired = this.gameTime;

          if (tower.type === 'cannon') {
            // Multicannon fires at multiple targets in range
            const targets = this.enemies
              .filter(e => Math.sqrt(Math.pow(e.x - tower.x, 2) + Math.pow(e.y - tower.y, 2)) <= effectiveRange)
              .sort((a, b) => b.pathIndex - a.pathIndex)
              .slice(0, tower.level >= 3 ? 4 : 2); // Level 3+ hits 4 targets

            targets.forEach(t => {
              this.projectiles.push({
                id: Math.random().toString(36).substr(2, 9),
                x: tower.x,
                y: tower.y,
                targetId: t.id,
                damage: finalDamage,
                speed: 600,
                type: 'cannonball',
                color: '#808080',
                sourceTowerId: tower.id,
                special: tower.level >= 4 ? 'aoe' : undefined
              });
            });
            this.playSound('cannon_fire');
            return; // Skip standard projectile creation
          }

          if (tower.type === 'wizard' && tower.mageMode === 'utility') {
             // Utility Mage is now a passive support tower, but can still fire periodic debuffs
             if (this.gameTime - tower.lastFired >= effectiveCooldown) {
                const rand = Math.random();
                const spell = tower.supportSpell || (rand < 0.5 ? 'curse' : 'bind');
                if (spell === 'curse') {
                   this.playSound('spell_curse');
                   this.damageEnemy(target, 15 + (tower.level * 10));
                   this.particles.push({ x: target.x, y: target.y, life: 0.5, color: '#ff0000' });
                } else if (spell === 'bind') {
                   this.playSound('spell_bind');
                   target.stunTimer = (1.5 + tower.level) * (1 - (target.resistance || 0));
                   this.particles.push({ x: target.x, y: target.y, life: 0.5, color: '#0000ff' });
                }
                tower.lastFired = this.gameTime;
             }
             return; // Utility Mage doesn't fire standard projectiles
          }

          // Projectile logic
          let pType: Projectile['type'] = 'arrow';
          let pColor = tower.color;
          
          if (tower.type === 'wizard') {
             if (tower.mageMode === 'ancients') {
                const aType = tower.ancientType || 'ice';
                pType = `ancient_${aType}` as Projectile['type'];
                pColor = aType === 'ice' ? '#00ffff' : (aType === 'blood' ? '#ff0000' : (aType === 'shadow' ? '#4b0082' : '#808080'));
             } else {
                pType = 'spell';
                if (tower.mageMode === 'elemental') {
                   const elem = tower.element || 'air';
                   pColor = elem === 'fire' ? '#ff4500' : (elem === 'water' ? '#0000ff' : (elem === 'earth' ? '#8b4513' : '#ffffff'));
                }
             }
          } else if (tower.type === 'toxic') pType = 'dart';
          else if (tower.type === 'slayer') pType = 'bolt';

          let pSpecial = tower.special;
          if (tower.type === 'wizard' && tower.mageMode === 'elemental') {
             if (tower.element === 'air') pSpecial = 'pushback';
             else if (tower.element === 'fire') pSpecial = 'burn';
             else if (tower.element === 'water') pSpecial = 'amp';
             else if (tower.element === 'earth') pSpecial = 'slow';
          }

          this.projectiles.push({
            id: Math.random().toString(),
            x: tower.x, y: tower.y,
            targetId: target.id,
            speed: 400,
            damage: finalDamage,
            color: pColor,
            type: pType,
            element: tower.element,
            sourceTowerId: tower.id,
            special: pSpecial && pSpecial !== 'rapid' ? pSpecial : undefined
          });

          // Spec charge and auto-fire
          if (!tower.specCharge) tower.specCharge = 0;
          tower.specCharge = Math.min(tower.specMax || 100, tower.specCharge + finalDamage * 0.5);
          if (tower.specCharge >= (tower.specMax || 100)) {
             tower.specCharge = 0;
             this.fireSpecialAttack(tower, target, finalDamage);
          }

          // Sound
          if (tower.type === 'wizard') {
            if (tower.mageMode === 'utility') {
               // Sounds handled in utility logic block above
            } else if (tower.mageMode === 'ancients') {
               this.playSound(`wizard_${tower.ancientType || 'ice'}`);
            } else {
               const elem = tower.element || 'air';
               this.playSound(elem === 'air' ? 'wizard' : `wizard_${elem}`);
            }
          } else {
             this.playSound(tower.fireSound || tower.type);
          }
        }
      } else {
        tower.targetId = null;
      }
    });

    // Handle Projectiles
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
       const p = this.projectiles[i];
       const target = this.enemies.find(e => e.id === p.targetId);
       if (!target) { this.projectiles.splice(i, 1); continue; }
       
       const dx = target.x - p.x; const dy = target.y - p.y;
       const dist = Math.sqrt(dx*dx+dy*dy);
       if (dist < 10) {
          if (p.special === 'aoe') {
             const radius = 80;
             this.enemies.forEach(e => {
                if (Math.sqrt(Math.pow(e.x-p.x,2)+Math.pow(e.y-p.y,2)) <= radius) {
                   this.damageEnemy(e, p.damage, p.sourceTowerId);
                }
             });
          } else {
             this.damageEnemy(target, p.damage, p.sourceTowerId);
             if (p.special === 'slow') this.applySlow(target);
             else if (p.special === 'stun') target.stunTimer = 5.0 * (1 - (target.resistance || 0));
             else if (p.special === 'pushback') target.pathIndex = Math.max(0, target.pathIndex - 1);
             else if (p.special === 'burn') { target.burnTimer = 5; target.burnDamage = Math.max(2, p.damage * 0.1); }
             else if (p.special === 'blood') {
                const percentDamage = target.maxHp * 0.03; // 3% of max HP
                this.damageEnemy(target, percentDamage, p.sourceTowerId, true);
             }
          }
          this.projectiles.splice(i, 1);
       } else {
          p.x += (dx / dist) * p.speed * dt;
          p.y += (dy / dist) * p.speed * dt;
       }
    }
  }

  damageEnemy(enemy: Enemy, damage: number, sourceTowerId?: string, isDot = false) {
    const actualDamage = Math.max(0, Math.floor(damage));
    enemy.hp -= actualDamage;
    if (!isDot) this.playSound('hit');

    // Create damage number
    this.damageNumbers.push({
      x: enemy.x + (Math.random() - 0.5) * 15,
      y: enemy.y - 15,
      text: actualDamage > 0 ? actualDamage.toString() : '0',
      life: 0.8,
      color: actualDamage > 50 ? '#ff0000' : (actualDamage > 0 ? '#ffff00' : '#808080'),
      velocityY: -80,
      velocityX: (Math.random() - 0.5) * 40
    });
    
    // Award XP to tower
    if (sourceTowerId) {
      const tower = this.towers.find(t => t.id === sourceTowerId);
      if (tower) {
        this.awardTowerXP(tower, actualDamage);
      }
    }
    
    // Add hit particle
    this.particles.push({
      x: enemy.x + (Math.random() - 0.5) * 10,
      y: enemy.y + (Math.random() - 0.5) * 10,
      life: 0.3,
      color: '#ff0000'
    });

    if (enemy.hp <= 0) {
      const index = this.enemies.indexOf(enemy);
      if (index > -1) {
        const deathSound = enemy.deathSound || 'kill';
        this.playSound(deathSound);
        
        this.enemies.splice(index, 1);
        
        // Update Quests
        this.updateQuests('kill', 1, enemy.type);

        // Monster Loot: Bones always drop; GP/Essence occasionally
        this.loots.push({
          id: Math.random().toString(),
          x: enemy.x + (Math.random() - 0.5) * 15,
          y: enemy.y + (Math.random() - 0.5) * 15,
          type: 'bones',
          life: 30, // 30 real seconds (rawDt based)
          size: 18
        });
        if (Math.random() < 0.2) {
          const lootType = Math.random() > 0.95 ? 'essence' : 'money';
          this.loots.push({
            id: Math.random().toString(),
            x: enemy.x,
            y: enemy.y,
            type: lootType,
            data: lootType === 'money' ? Math.floor(enemy.reward * 0.4) : undefined,
            life: 30,
            size: 20
          });
        }

        // GP Reward: Base drop always happens but reduced
        let gpReward = enemy.reward * 0.5 * (this.upgrades.rewardMultiplier || 1);
        if (this.pets.some(p => p.name === 'Snakeling')) gpReward = Math.floor(gpReward * 1.1);
        this.money += Math.floor(gpReward);

        // Essence Bonus: Capped at 2.5% of current wave number
        const maxEssence = Math.max(1, Math.round(this.wave * 0.025));
        if (Math.random() < 0.05 * (this.upgrades.rewardMultiplier || 1)) {
          const dropAmount = Math.max(1, Math.floor(Math.random() * maxEssence) + 1);
          this.runeEssence += dropAmount;
          this.addMessage(`You found ${dropAmount} Rune Essence!`);
        }

        // Achievements
        if (enemy.type === 'jad') {
          const ach = this.achievements.find(a => a.id === 'boss_slayer');
          if (ach) ach.completed = true;
        } else if (enemy.type === 'vorkath') {
          const ach = this.achievements.find(a => a.id === 'vorkath_slayer');
          if (ach) ach.completed = true;
        } else if (enemy.type === 'zulrah') {
          const ach = this.achievements.find(a => a.id === 'zulrah_slayer');
          if (ach) ach.completed = true;
        }

        // Item Drop: Rare
        if (Math.random() < 0.02) {
          const tiers = [
            { id: 'bronze_scimitar', name: 'Bronze Scimitar', bonus: { damage: 5 }, type: 'weapon' as const },
            { id: 'iron_scimitar', name: 'Iron Scimitar', bonus: { damage: 10 }, type: 'weapon' as const },
            { id: 'steel_scimitar', name: 'Steel Scimitar', bonus: { damage: 15 }, type: 'weapon' as const },
            { id: 'mithril_scimitar', name: 'Mithril Scimitar', bonus: { damage: 25 }, type: 'weapon' as const },
            { id: 'adamant_scimitar', name: 'Adamant Scimitar', bonus: { damage: 40 }, type: 'weapon' as const },
            { id: 'rune_scimitar', name: 'Rune Scimitar', bonus: { damage: 60 }, type: 'weapon' as const },
            { id: 'dragon_scimitar', name: 'Dragon Scimitar', bonus: { damage: 90 }, type: 'weapon' as const },
            { id: 'abyssal_whip', name: 'Abyssal Whip', bonus: { damage: 150 }, type: 'weapon' as const },
            { id: 'scythe_of_vitur', name: 'Scythe of Vitur', bonus: { damage: 250 }, type: 'weapon' as const }
          ];
          const maxTier = Math.min(tiers.length - 1, Math.floor(this.wave / 3));
          const drop = tiers[Math.floor(Math.random() * (maxTier + 1))];
          
          this.loots.push({
            id: Math.random().toString(),
            x: enemy.x + (Math.random()-0.5)*20,
            y: enemy.y + (Math.random()-0.5)*20,
            type: 'item',
            data: drop,
            life: 15,
            size: 25
          });
        }

        // Pet Drop
        const isBoss = enemy.type === 'vorkath' || enemy.type === 'zulrah' || enemy.type === 'jad';
        let dropChance = isBoss ? 0.5 : 0.01;
        if (this.pets.some(p => p.name === 'Baby Mole')) dropChance *= 1.5;

        if (Math.random() < dropChance) {
          const petTable: Partial<Record<string, { name: string, type: string, bonus: string }>> = {
            vorkath: { name: 'Vorki', type: 'vorki', bonus: 'Dragon Slayer: +15% DMG vs Dragons' },
            zulrah: { name: 'Snakeling', type: 'snakeling', bonus: 'Serpent Scale: +10% GP drops' },
            jad: { name: "TzRek-Jad", type: 'rift_guardian', bonus: 'Jad\'s Might: +20% fire damage' },
            green_dragon: { name: 'Prince Black Dragon', type: 'prince_black_dragon', bonus: 'Dragon Blood: +8% ATK vs Dragons' },
            blue_dragon: { name: 'Prince Black Dragon', type: 'prince_black_dragon', bonus: 'Dragon Blood: +8% ATK vs Dragons' },
            hydra: { name: 'Ikkle Hydra', type: 'heron', bonus: 'Hydra\'s Eye: +10% range' }
          };
          const petEntry = petTable[enemy.type];
          if (petEntry && !this.pets.find(p => p.name === petEntry.name)) {
            this.pets.push({ id: Math.random().toString(), ...petEntry });
            this.playSound('level_up');
          }
        }
        
        // Slayer Task
        if (this.slayerTask && this.slayerTask.type === enemy.type && this.slayerTask.count > 0) {
          this.slayerTask.count--;
          if (this.slayerTask.count === 0) {
            this.money += this.slayerTask.reward;
            this.playSound('task_assign');
            this.assignSlayerTask();
          }
        }

        this.onStateChange({ 
          money: this.money, 
          runeEssence: this.runeEssence, 
          pets: this.pets, 
          achievements: this.achievements,
          slayerTask: this.slayerTask,
          remainingEnemies: this.enemiesToSpawn.length + this.enemies.length
        });
      }
    }
  }

  awardPlayerXP(skillKey: keyof PlayerSkills, amount: number, x?: number, y?: number) {
    const skill = this.playerSkills[skillKey];
    skill.xp += amount;
    const nextLevelXP = Math.pow(skill.level, 2) * 100;
    if (skill.xp >= nextLevelXP) {
      skill.level++;
      skill.xp -= nextLevelXP;
      this.playSound('upgrade');
      this.addMessage(`Congratulations, you just advanced your ${skillKey.charAt(0).toUpperCase() + skillKey.slice(1)} level to ${skill.level}!`);
      this.floatingTexts.push({
        x: x ?? this.canvas.width / 2,
        y: y ?? this.canvas.height / 2,
        text: 'LEVEL UP!',
        life: 2,
        color: '#ffff00',
        icon: `${skillKey}_icon`
      });
    }
    this.onStateChange({ playerSkills: this.playerSkills });
  }

  awardTowerXP(tower: Tower, amount: number) {
    // Increased XP gain: 2x base + multiplier
    const xpGain = (amount * 2) * (this.upgrades.xpGainMultiplier || 1);
    let skillKey: keyof TowerSkills = 'strength';
    
    if (tower.type === 'archer') skillKey = 'ranged';
    else if (tower.type === 'wizard') skillKey = 'magic';
    else skillKey = 'strength';

    const skill = tower.skills[skillKey];
    skill.xp += xpGain;
    
    // Floating text for XP gain
    this.floatingTexts.push({
      x: tower.x,
      y: tower.y - 20,
      text: `+${Math.floor(xpGain)} XP`,
      life: 1.5,
      color: '#00ff00',
      icon: `${skillKey}_icon`
    });
    
    // Lower threshold: Level^1.8 * 80
    const nextLevelXP = Math.floor(Math.pow(skill.level, 1.8) * 80);
    if (skill.xp >= nextLevelXP) {
      skill.level++;
      skill.xp -= nextLevelXP;
      this.playSound('level_up');
      
      // Bonus stats based on level
      const dmgBonus = Math.floor(skill.level * 1.5);
      const rangeBonus = Math.floor(skill.level * 5);
      
      this.addMessage(`Your ${tower.name} reached level ${skill.level}! (+${dmgBonus} DMG)`);
      
      this.particles.push({ x: tower.x, y: tower.y - 20, life: 1, color: '#ffff00' });
      
      // Apply stats immediately
      this.upgradeTowerStats(tower);
    }
  }

  updateQuests(type: Quest['objective']['type'], amount: number, enemyType?: EnemyType) {
    let changed = false;
    this.quests.forEach(quest => {
      if (quest.completed) return;
      
      if (quest.objective.type === type) {
        if (type === 'kill') {
          if (quest.objective.enemyType === enemyType) {
            quest.objective.current += amount;
          }
        } else {
          quest.objective.current = amount;
        }

        if (quest.objective.current >= quest.objective.target) {
          quest.objective.current = quest.objective.target;
          quest.completed = true;
          this.playSound('level_up');
          changed = true;
        }
      }
    });
    if (changed) this.onStateChange({ quests: this.quests });
  }

  claimQuestReward(questId: string) {
    const quest = this.quests.find(q => q.id === questId);
    if (quest && quest.completed && !quest.claimed) {
      quest.claimed = true;
      if (quest.reward.money) this.money += quest.reward.money;
      if (quest.reward.essence) this.runeEssence += quest.reward.essence;
      if (quest.reward.item) this.inventory.push(quest.reward.item);
      
      this.playSound('upgrade');
      this.onStateChange({ 
        money: this.money, 
        runeEssence: this.runeEssence, 
        inventory: this.inventory,
        quests: this.quests 
      });
    }
  }

  fireSpecialAttack(tower: Tower, primaryTarget: any, baseDamage: number) {
    this.playSound('special_attack');
    this.particles.push({ x: tower.x, y: tower.y, life: 1.5, color: '#ffffff' });

    switch (tower.type) {
      case 'archer': {
        if (tower.name === 'Magic Shortbow') {
          const dmg = Math.floor(baseDamage * 0.85);
          this.projectiles.push({ id: Math.random().toString(36).substr(2,9), x: tower.x, y: tower.y, targetId: primaryTarget.id, speed: 600, damage: dmg, color: '#00ff00', type: 'arrow', sourceTowerId: tower.id });
          setTimeout(() => {
            const t = this.enemies.find(e => e.id === primaryTarget.id);
            if (t) this.projectiles.push({ id: Math.random().toString(36).substr(2,9), x: tower.x, y: tower.y, targetId: t.id, speed: 600, damage: dmg, color: '#00ff00', type: 'arrow', sourceTowerId: tower.id });
          }, 100);
        } else if (tower.name === 'Bow of Faerdhinen') {
          for (let i = 0; i < 3; i++) {
            setTimeout(() => {
              const target = this.enemies.find(e => e.id === primaryTarget.id);
              if (target) this.projectiles.push({ id: Math.random().toString(36).substr(2,9), x: tower.x, y: tower.y, targetId: target.id, speed: 550, damage: Math.floor(baseDamage), color: '#a020f0', type: 'arrow', sourceTowerId: tower.id });
            }, i * 120);
          }
        } else {
          this.damageEnemy(primaryTarget, Math.floor(baseDamage * 1.5), tower.id);
        }
        break;
      }
      case 'tzhaar': {
        if (tower.name === "Inquisitor's Mace") {
          const radius = 55;
          this.enemies.forEach(e => {
            const dx = e.x - primaryTarget.x; const dy = e.y - primaryTarget.y;
            if (Math.sqrt(dx*dx+dy*dy) <= radius) {
              this.damageEnemy(e, Math.floor(baseDamage * 1.25), tower.id);
              this.particles.push({ x: e.x, y: e.y, life: 0.8, color: '#ff4500' });
            }
          });
        } else if (tower.name === 'TzHaar-Ket-Om') {
          this.damageEnemy(primaryTarget, Math.floor(baseDamage * 1.2), tower.id);
          primaryTarget.stunTimer = 3.0 * (1 - (primaryTarget.resistance || 0));
        } else {
          this.damageEnemy(primaryTarget, Math.floor(baseDamage * 1.5), tower.id);
        }
        break;
      }
      case 'slayer': {
        if (tower.name === 'Zaryte Crossbow') {
          this.damageEnemy(primaryTarget, Math.floor(baseDamage * 1.5), tower.id);
          const nearby = this.enemies.find(e => e.id !== primaryTarget.id && Math.sqrt(Math.pow(e.x-primaryTarget.x,2)+Math.pow(e.y-primaryTarget.y,2)) < 40);
          if (nearby) this.damageEnemy(nearby, Math.floor(baseDamage * 0.75), tower.id);
        } else if (tower.name === 'Twisted Bow') {
          this.damageEnemy(primaryTarget, Math.floor(baseDamage), tower.id);
          this.damageEnemy(primaryTarget, Math.floor(baseDamage * 0.5), tower.id);
        } else {
          this.damageEnemy(primaryTarget, Math.floor(baseDamage * 1.2), tower.id);
        }
        break;
      }
      case 'wizard': {
        const radius = 100;
        this.enemies.forEach(e => {
          const dx = e.x - tower.x; const dy = e.y - tower.y;
          if (Math.sqrt(dx*dx+dy*dy) <= radius) {
            this.applySlow(e);
            this.particles.push({ x: e.x, y: e.y, life: 1, color: '#ff00ff' });
          }
        });
        break;
      }
      case 'cannon': {
        this.enemies.forEach(e => {
          const dx = e.x - tower.x; const dy = e.y - tower.y;
          if (Math.sqrt(dx*dx+dy*dy) <= tower.range) {
            const dmg = Math.floor((tower.minDamage || 0) + Math.random() * ((tower.maxDamage || 0) - (tower.minDamage || 0)));
            this.damageEnemy(e, dmg, tower.id);
            this.particles.push({ x: e.x, y: e.y, life: 0.5, color: '#ff6600' });
          }
        });
        break;
      }
    }
  }

  buyPotion(type: ActivePotion['type'] | 'super_restore' | 'prayer_potion', cost: number) {
    if (this.money >= cost) {
      this.money -= cost;
      this.playSound('potion_drink');
      
      if (type === 'super_restore' || type === 'prayer_potion') {
        const restoreAmount = type === 'super_restore' ? 20 : 10;
        this.prayerPoints = Math.min(this.maxPrayerPoints, this.prayerPoints + restoreAmount);
        this.addMessage(`You drank a ${type.replace('_', ' ')}!`);
      } else {
        const existing = this.activePotions.find(p => p.type === type);
        if (existing) {
          existing.timer += 60; // Add 60 seconds
        } else {
          this.activePotions.push({ type: type as ActivePotion['type'], timer: 60 });
        }
        this.addMessage(`You drank a ${type.replace('_', ' ')} potion!`);
      }
      
      this.onStateChange({ 
        money: this.money, 
        activePotions: this.activePotions,
        prayerPoints: this.prayerPoints 
      });
      return true;
    }
    return false;
  }

  buyAchievementUpgrade(upgradeId: string): boolean {
    const upgrades: { id: string, cost: number, apply: () => void }[] = [
      { id: 'extra_lives', cost: 50, apply: () => { this.lives = Math.min(100, this.lives + 5); this.onStateChange({ lives: this.lives }); } },
      { id: 'money_bonus', cost: 30, apply: () => { this.money += 500; this.onStateChange({ money: this.money }); } },
      { id: 'essence_bonus', cost: 20, apply: () => { this.runeEssence += 20; this.onStateChange({ runeEssence: this.runeEssence }); } },
      { id: 'prayer_bonus', cost: 25, apply: () => { this.maxPrayerPoints *= 1.5; this.prayerPoints = this.maxPrayerPoints; this.onStateChange({ prayerPoints: this.prayerPoints, maxPrayerPoints: this.maxPrayerPoints }); } },
      { id: 'reset_spec', cost: 10, apply: () => { this.towers.forEach(t => { t.specCharge = t.specMax || 100; }); } }
    ];
    const upgrade = upgrades.find(u => u.id === upgradeId);
    if (!upgrade || this.achievementPoints < upgrade.cost) return false;
    this.achievementPoints -= upgrade.cost;
    upgrade.apply();
    this.onStateChange({ achievementPoints: this.achievementPoints });
    return true;
  }

  toggleDevMode() {
    this.devMode = !this.devMode;
    this.onStateChange({ devMode: this.devMode });
  }

  resetProgress() {
    this.money = 150 + this.upgrades.startingMoney;
    this.runeEssence = 0;
    this.wave = 1;
    this.enemies = [];
    this.towers = [];
    this.projectiles = [];
    this.activePotions = [];
    this.inventory = [];
    this.playerSkills = {
      mining: { level: 1, xp: 0 },
      woodcutting: { level: 1, xp: 0 },
      herblore: { level: 1, xp: 0 },
      crafting: { level: 1, xp: 0 },
      prayer: { level: 1, xp: 0 },
      farming: { level: 1, xp: 0 }
    };
    this.upgrades = {
      archerRange: 1.0,
      archerDamage: 1.0,
      magicDamage: 1.0,
      cannonSpeed: 1.0,
      slayerReward: 1.0,
      prayerEfficiency: 1.0,
      startingMoney: 0,
      rewardMultiplier: 1.0,
      waveSpeed: 1.0,
      towerCostReduction: 1.0,
      xpGainMultiplier: 1.0,
      prayerRegen: 0
    };
    this.onStateChange({ 
      money: this.money, 
      runeEssence: this.runeEssence, 
      wave: this.wave, 
      inventory: this.inventory,
      playerSkills: this.playerSkills,
      upgrades: this.upgrades
    });
    this.addMessage("Progress reset.");
  }

  setWave(wave: number) {
    this.wave = Math.max(1, wave);
    this.waveActive = false;
    this.enemies = [];
    this.enemiesToSpawn = [];
    this.onStateChange({ wave: this.wave, isPlaying: false, enemies: [] });
    this.addMessage(`Wave set to ${this.wave}.`);
  }

  interactWithNode(nodeId: string) {
    const node = this.nodes.find(n => n.id === nodeId);
    if (!node || node.respawnTimer > 0) return;

    if (node.type === 'tree') {
      this.awardPlayerXP('woodcutting', 10, node.x, node.y);
      this.inventory.push({ id: Math.random().toString(), name: 'Logs', type: 'material', description: 'Useful for fletching.', sellPrice: 5, bonus: {} });
      this.addMessage("You chop some logs.");
      this.playSound('woodcut');
    } else if (node.type === 'ore') {
      this.awardPlayerXP('mining', 10, node.x, node.y);
      this.inventory.push({ id: Math.random().toString(), name: 'Iron Ore', type: 'material', description: 'Useful for smithing.', sellPrice: 10, bonus: {} });
      this.addMessage("You mine some ore.");
      this.playSound('mine');
    } else if (node.type === 'herb') {
      this.awardPlayerXP('farming', 10, node.x, node.y);
      this.inventory.push({ id: Math.random().toString(), name: 'Grimy Guam', type: 'herb', description: 'A dirty herb.', sellPrice: 15, bonus: {} });
      this.addMessage("You pick a herb.");
      this.playSound('pick_up');
    }

    node.respawnTimer = node.maxRespawn;
    this.onStateChange({ inventory: this.inventory });
  }

  applySlow(enemy: Enemy) {
    const duration = 2.0 * (1 - (enemy.resistance || 0));
    enemy.speed = enemy.baseSpeed * 0.5;
    enemy.slowTimer = Math.max(0.5, duration);
  }

  applyStun(enemy: Enemy) {
    enemy.stunTimer = 1.0 * (1 - (enemy.resistance || 0));
  }

  equipItem(towerId: string, itemId: string) {
    const tower = this.towers.find(t => t.id === towerId);
    const itemIndex = this.inventory.findIndex(i => i.id === itemId);
    if (!tower || itemIndex === -1) return;

    const item = this.inventory[itemIndex];
    if (item.type !== 'weapon' && item.type !== 'shield' && item.type !== 'accessory') {
      this.addMessage("You can't equip this item.");
      return;
    }

    const currentItem = tower.equipment[item.type];
    if (currentItem) {
      this.inventory.push(currentItem);
    }

    tower.equipment[item.type] = item;
    this.inventory.splice(itemIndex, 1);

    this.playSound('upgrade');
    this.onStateChange({ inventory: this.inventory });
  }

  resetGame() {
    // Full game reset — preserves runeEssence and upgrades only
    this.lives = 20;
    this.money = 150 + this.upgrades.startingMoney;
    this.wave = 1;
    this.enemies = [];
    this.towers = [];
    this.projectiles = [];
    this.particles = [];
    this.damageNumbers = [];
    this.floatingTexts = [];
    this.loots = [];
    this.waveActive = false;
    this.enemiesToSpawn = [];
    this.spawnTimer = 0;
    this.specialAttackCharge = 0;
    this.prayerPoints = this.maxPrayerPoints;
    this.activePrayers.clear();
    this.activePotions = [];
    this.slayerTask = null;
    this.consecutiveTasks = 0;
    this.lastTaskType = null;
    this.isPaused = false;
    this.inventory = [];
    this.quests = this.quests.map(q => ({ 
      ...q, 
      completed: false, 
      claimed: false, 
      objective: { ...q.objective, current: 0 } 
    }));
    this.achievements = this.achievements.map(a => ({ ...a, completed: false }));
    this.achievementPoints = 0;
    this.pets = [
      { id: 'pet_beaver', name: 'Beaver', type: 'beaver', bonus: 'Lucky Paw: +25% item drop chance' },
      { id: 'pet_tangleroot', name: 'Tangleroot', type: 'tangleroot', bonus: "Nature's Gift: +10% Rune Essence drops" }
    ];
    this.playerSkills = {
      mining: { level: 1, xp: 0 },
      woodcutting: { level: 1, xp: 0 },
      herblore: { level: 1, xp: 0 },
      crafting: { level: 1, xp: 0 },
      prayer: { level: 1, xp: 0 },
      farming: { level: 1, xp: 0 }
    };
    this.assignSlayerTask();
    this.initFarming();
    this.initPath();
    this.addMessage('You have been defeated. Your adventure begins anew.');
    this.onStateChange({ 
      lives: 20, 
      money: this.money, 
      wave: 1, 
      isPlaying: false,
      isPaused: false,
      specialAttackCharge: 0,
      prayerPoints: this.prayerPoints,
      maxPrayerPoints: this.maxPrayerPoints,
      inventory: [],
      quests: this.quests,
      achievements: this.achievements,
      achievementPoints: 0,
      pets: this.pets,
      playerSkills: this.playerSkills,
      activePotions: [],
      slayerTask: this.slayerTask
    });
  }

  drawPath() {
    if (!this.ctx) return;
    this.ctx.beginPath();
    if (this.theme === 'sand') this.ctx.strokeStyle = '#8d7b4f';
    else if (this.theme === 'dark') this.ctx.strokeStyle = '#000000';
    else this.ctx.strokeStyle = '#3d2b1f';
    this.ctx.lineWidth = 46;
    if (this.path.length > 0) {
      this.ctx.moveTo(this.path[0].x, this.path[0].y);
      for (let i = 1; i < this.path.length; i++) this.ctx.lineTo(this.path[i].x, this.path[i].y);
    }
    this.ctx.stroke();

    this.ctx.beginPath();
    if (this.theme === 'sand') this.ctx.strokeStyle = '#a69466';
    else if (this.theme === 'dark') this.ctx.strokeStyle = '#222222';
    else this.ctx.strokeStyle = '#5d4037';
    this.ctx.lineWidth = 40;
    if (this.path.length > 0) {
      this.ctx.moveTo(this.path[0].x, this.path[0].y);
      for (let i = 1; i < this.path.length; i++) this.ctx.lineTo(this.path[i].x, this.path[i].y);
    }
    this.ctx.stroke();

    this.ctx.beginPath();
    if (this.theme === 'sand') this.ctx.strokeStyle = '#b8a473';
    else if (this.theme === 'dark') this.ctx.strokeStyle = '#331111';
    else this.ctx.strokeStyle = '#795548';
    this.ctx.lineWidth = 32;
    if (this.path.length > 0) {
      this.ctx.moveTo(this.path[0].x, this.path[0].y);
      for (let i = 1; i < this.path.length; i++) this.ctx.lineTo(this.path[i].x, this.path[i].y);
    }
    this.ctx.stroke();
  }

  drawAmbientEffects() {
    if (this.currentRegion === 'morytania') {
       this.ctx.fillStyle = 'rgba(0, 20, 20, 0.2)';
       this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    } else if (this.currentRegion === 'wilderness') {
       this.ctx.fillStyle = 'rgba(50, 0, 0, 0.1)';
       this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    } else if (this.currentRegion === 'karamja') {
       this.ctx.fillStyle = 'rgba(255, 255, 0, 0.05)';
       this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }
  }

  draw() {
    if (!this.ctx || !this.canvas) return;
    const w = this.canvas.width;
    const h = this.canvas.height;
    if (w === 0 || h === 0) return;
    
    try {
      this.ctx.save();
      
      // Apply Shake
      if (this.shakeAmount > 0) {
        this.ctx.translate((Math.random() - 0.5) * this.shakeAmount, (Math.random() - 0.5) * this.shakeAmount);
      }

      // Draw Background Theme
      if (this.theme === 'grass') {
        this.ctx.fillStyle = '#2d4c1e'; // Dark grass
        this.ctx.fillRect(0, 0, w, h);
        
        // Grass tufts
        this.ctx.fillStyle = '#3a5f27';
        for (let i = 0; i < 100; i++) {
          const tx = (i * 137.5) % w;
          const ty = (i * 224.7) % h;
          this.ctx.fillRect(tx, ty, 2, 2);
          this.ctx.fillRect(tx + 2, ty + 2, 2, 4);
        }
      } else if (this.theme === 'sand') {
        this.ctx.fillStyle = '#c2ae78'; // Sand
        this.ctx.fillRect(0, 0, w, h);
        
        // Dunes/Sand ripples
        this.ctx.strokeStyle = '#b3a069';
        this.ctx.lineWidth = 1;
        for (let i = 0; i < 30; i++) {
          const ty = (i * 47.3) % h;
          this.ctx.beginPath();
          this.ctx.moveTo(0, ty);
          for (let x = 0; x < w; x += 20) {
            this.ctx.lineTo(x, ty + Math.sin(x * 0.05 + i) * 5);
          }
          this.ctx.stroke();
        }
      } else if (this.theme === 'dark') {
        this.ctx.fillStyle = '#1a1a1a'; // Dark/Wilderness
        this.ctx.fillRect(0, 0, w, h);
        
        // Cracks/Lava
        this.ctx.strokeStyle = '#331111';
        this.ctx.lineWidth = 2;
        for (let i = 0; i < 20; i++) {
          const tx = (i * 231.5) % w;
          const ty = (i * 157.7) % h;
          this.ctx.beginPath();
          this.ctx.moveTo(tx, ty);
          this.ctx.lineTo(tx + 40, ty + 30);
          this.ctx.lineTo(tx + 10, ty + 60);
          this.ctx.stroke();
        }
      }

      this.drawAmbientEffects();

      // Draw Grid
      this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
      this.ctx.lineWidth = 1;
      const gridSize = 32;
      for (let x = 0; x < w; x += gridSize) {
        this.ctx.beginPath();
        this.ctx.moveTo(x, 0);
        this.ctx.lineTo(x, h);
        this.ctx.stroke();
      }
      for (let y = 0; y < h; y += gridSize) {
        this.ctx.beginPath();
        this.ctx.moveTo(0, y);
        this.ctx.lineTo(w, y);
        this.ctx.stroke();
      }

      // Draw Farming Patches
      this.farmingPatches.forEach(patch => {
        // Draw patch background (brown rect)
        this.ctx.fillStyle = '#5d4037';
        this.ctx.fillRect(patch.x - 20, patch.y - 20, 40, 40);
        this.ctx.strokeStyle = '#3e2723';
        this.ctx.strokeRect(patch.x - 20, patch.y - 20, 40, 40);
        
        if (patch.stage > 0) {
          // Draw plant based on stage
          if (patch.type === 'allotment') {
             this.ctx.fillStyle = '#8bc34a'; // Green
          } else if (patch.type === 'herb') {
             this.ctx.fillStyle = '#4caf50'; // Darker green
          } else {
             this.ctx.fillStyle = '#ffeb3b'; // Flower
          }
          
          const size = 10 + (patch.stage * 5);
          this.ctx.fillRect(patch.x - size/2, patch.y - size/2, size, size);
          
          if (patch.stage === patch.maxStage) {
             // Ready indicator
             this.ctx.fillStyle = '#ff0000';
             this.ctx.font = 'bold 20px Arial';
             this.ctx.fillText('!', patch.x - 5, patch.y - 25);
          }
        }
      });

      // Set common styles
      this.ctx.lineCap = 'round';
      this.ctx.lineJoin = 'round';

      // Draw Spawn Portal
      if (this.path.length > 0) {
        const portalImg = this.imageCache.get('portal');
        if (portalImg && portalImg.complete && portalImg.naturalWidth > 0) {
          this.ctx.drawImage(portalImg, this.path[0].x - 30, this.path[0].y - 30, 60, 60);
          // Swirl effect
          this.ctx.strokeStyle = 'rgba(0, 255, 255, 0.4)';
          this.ctx.lineWidth = 2;
          this.ctx.beginPath();
          this.ctx.arc(this.path[0].x, this.path[0].y, 25 + Math.sin(this.gameTime/200) * 5, 0, Math.PI * 2);
          this.ctx.stroke();
        }
      }

    // Draw Path
    this.drawPath();
    
    // Draw Grid Indicator if a tower is selected
    if (this.selectedTowerType && this.mousePos) {
      const gridSize = 32;
      const snappedX = Math.round(this.mousePos.x / gridSize) * gridSize;
      const snappedY = Math.round(this.mousePos.y / gridSize) * gridSize;
      const isValid = this.isValidPlacement(snappedX, snappedY);
      
      this.ctx.fillStyle = isValid ? 'rgba(0, 255, 0, 0.2)' : 'rgba(255, 0, 0, 0.2)';
      this.ctx.fillRect(snappedX - gridSize/2, snappedY - gridSize/2, gridSize, gridSize);
      this.ctx.strokeStyle = isValid ? 'rgba(0, 255, 0, 0.5)' : 'rgba(255, 0, 0, 0.5)';
      this.ctx.lineWidth = 1;
      this.ctx.strokeRect(snappedX - gridSize/2, snappedY - gridSize/2, gridSize, gridSize);
      
      // Draw ghost tower
      this.ctx.save();
      this.ctx.globalAlpha = 0.5;
      const imgKey = `${this.selectedTowerType}_1`;
      const img = this.imageCache.get(imgKey);
      if (img && img.complete && img.naturalWidth > 0) {
        this.ctx.drawImage(img, snappedX - 18, snappedY - 18, 36, 36);
      } else {
        this.ctx.fillStyle = '#ffffff';
        this.ctx.beginPath();
        this.ctx.arc(snappedX, snappedY, 18, 0, Math.PI * 2);
        this.ctx.fill();
      }
      this.ctx.globalAlpha = 1.0;

      // Draw Range Preview
      let towerRange = 100;
      if (this.selectedTowerType === 'archer') towerRange = 7 * 25 * this.upgrades.archerRange;
      else if (this.selectedTowerType === 'wizard') towerRange = 7 * 25;
      else if (this.selectedTowerType === 'cannon') towerRange = 9 * 25;
      else if (this.selectedTowerType === 'tzhaar') towerRange = 2 * 25;
      else if (this.selectedTowerType === 'slayer') towerRange = 7 * 25;
      else if (this.selectedTowerType === 'toxic') towerRange = 5 * 25;

      this.ctx.beginPath();
      this.ctx.arc(snappedX, snappedY, towerRange, 0, Math.PI * 2);
      this.ctx.strokeStyle = isValid ? 'rgba(0, 255, 0, 0.5)' : 'rgba(255, 0, 0, 0.5)';
      this.ctx.lineWidth = 1;
      this.ctx.setLineDash([5, 5]);
      this.ctx.stroke();
      this.ctx.setLineDash([]);
      this.ctx.fillStyle = isValid ? 'rgba(0, 255, 0, 0.05)' : 'rgba(255, 0, 0, 0.05)';
      this.ctx.fill();

      this.ctx.restore();
    }

    // Draw Pets
      if (this.pets.length > 0) {
        const time = this.gameTime / 1000;
        this.pets.forEach((pet, index) => {
          // Movement logic: wander around the entire map
          const speed = 0.3;
          
          // Use a pseudo-random wander based on index and time
          // This allows pets to roam freely
          const wanderX = (Math.sin(time * speed + index * 100) * 0.4 + 0.5) * this.canvas.width;
          const wanderY = (Math.cos(time * speed * 0.8 + index * 200) * 0.4 + 0.5) * this.canvas.height;
          
          let x = wanderX;
          let y = wanderY;
          
          // Store position for tooltip detection
          pet.x = x;
          pet.y = y;

          const imgKey = pet.type; 
          const img = this.imageCache.get(imgKey);
          
          if (img && img.complete && img.naturalWidth > 0 && !this.brokenImages.has(imgKey)) {
            this.ctx.drawImage(img, x - 15, y - 15, 30, 30);
          } else {
            this.ctx.font = '20px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.fillText('🐾', x, y);
          }
          
          this.ctx.fillStyle = '#00ffff';
          this.ctx.font = 'bold 10px Arial';
          this.ctx.textAlign = 'center';
          this.ctx.fillText(pet.name, x, y + 20);
        });
      }

      // Draw Towers
      const now = this.gameTime;
      this.towers.forEach(tower => {
        if (isNaN(tower.x) || isNaN(tower.y)) return;
        
        // Animation: Bobbing (Uses real-time but clamped)
        const bob = Math.sin(now / 500 + tower.x) * 3;
        // Animation: Recoil (Independent of game speed visually, but triggered by timer)
        const recoilTime = now - tower.lastFired;
        // We want recoil to visually last 200ms regardless of speed, 
        // but it triggers based on lastFired which is gameTime... wait.
        // lastFired is performance.now() at line ~2213
        const recoil = recoilTime < 200 ? (1 - recoilTime / 200) * 5 : 0;
        
        let imgKey = `${tower.type}_${tower.level}`;
        if (tower.type === 'wizard') {
          if (tower.mageMode === 'elemental') {
            imgKey = `wizard_elemental_${tower.element || 'air'}`;
          } else if (tower.mageMode === 'ancients') {
            imgKey = `wizard_ancients`;
          } else if (tower.mageMode === 'utility') {
            imgKey = `wizard_utility`;
          } else {
            imgKey = `wizard_${tower.level}`;
          }
        }
        
        // Fallback to level-based key if specific one fails
        let img = this.imageCache.get(imgKey);
        if (!img || !img.complete || img.naturalWidth === 0 || this.brokenImages.has(imgKey)) {
          imgKey = `${tower.type}_${tower.level}`;
          img = this.imageCache.get(imgKey);
        }
        
        this.ctx.save();
        this.ctx.translate(tower.x, tower.y + bob + recoil);
        
        // Rotate towards target if exists
        if (tower.targetId) {
          const target = this.enemies.find(e => e.id === tower.targetId);
          if (target) {
            const angle = Math.atan2(target.y - tower.y, target.x - tower.x);
            this.ctx.rotate(angle + Math.PI / 2); // Images face up
          }
        }

        if (img && img.complete && img.naturalWidth > 0 && !this.brokenImages.has(imgKey)) {
          const size = (tower.visualRadius || 18) * 2;
          this.ctx.drawImage(img, -size/2, -size/2, size, size);
        } else {
          this.ctx.fillStyle = tower.color;
          this.ctx.beginPath();
          this.ctx.arc(0, 0, tower.visualRadius || 18, 0, Math.PI * 2);
          this.ctx.fill();
        }
        this.ctx.restore();
        
        // Border for high level
        if (tower.level >= 3) {
          this.ctx.strokeStyle = tower.level === 4 ? '#ff0000' : '#ffff00';
          this.ctx.lineWidth = 2;
          this.ctx.stroke();
        }

        // Draw Range if hovered, selected, or toggled
        if (tower.id === this.hoveredEntityId || tower.id === this.selectedEntityId || tower.showRange) {
          const stats = this.calculateTowerStats(tower);
          
          this.ctx.beginPath();
          this.ctx.strokeStyle = tower.showRange ? 'rgba(255, 255, 0, 0.4)' : 'rgba(255, 255, 255, 0.3)';
          this.ctx.lineWidth = 2;
          this.ctx.setLineDash([5, 5]);
          this.ctx.arc(tower.x, tower.y, stats.range, 0, Math.PI * 2);
          this.ctx.stroke();
          this.ctx.setLineDash([]);
          this.ctx.fillStyle = tower.showRange ? 'rgba(255, 255, 0, 0.08)' : 'rgba(255, 255, 255, 0.05)';
          this.ctx.fill();
        }

        // Disabled indicator (Boss attack)
        if (tower.disabledTimer > 0) {
          this.ctx.fillStyle = 'rgba(0, 255, 0, 0.3)';
          this.ctx.beginPath();
          this.ctx.arc(tower.x, tower.y, (tower.visualRadius || 18) + 2, 0, Math.PI * 2);
          this.ctx.fill();
          
          this.ctx.strokeStyle = '#00ff00';
          this.ctx.lineWidth = 2;
          this.ctx.setLineDash([5, 5]);
          this.ctx.stroke();
          this.ctx.setLineDash([]);
        }

        // Level indicator
        this.ctx.fillStyle = '#fff';
        this.ctx.font = 'bold 10px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText(tower.level.toString(), tower.x, tower.y + 4);
      });

      // Draw Gathering Nodes
      this.nodes.forEach(n => {
        if (n.respawnTimer > 0) return;
        let imgKey = 'tree';
        if (n.type === 'ore') imgKey = 'ore_adamant';
        if (n.type === 'herb') imgKey = 'ranarr';
        
        const img = this.imageCache.get(imgKey);
        if (img && img.complete) {
          this.ctx.drawImage(img, n.x - 16, n.y - 16, 32, 32);
        } else {
          this.ctx.fillStyle = n.type === 'tree' ? '#8B4513' : n.type === 'ore' ? '#555' : '#0f0';
          this.ctx.fillRect(n.x - 10, n.y - 10, 20, 20);
        }
        
        // Name tag
        this.ctx.fillStyle = '#ffff00';
        this.ctx.font = '8px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText(n.name, n.x, n.y - 18);
      });

      // Draw Enemies
      this.enemies.forEach(enemy => {
        if (isNaN(enemy.x) || isNaN(enemy.y)) return;

        const img = this.imageCache.get(enemy.type);
        const isBoss = enemy.type === 'vorkath' || enemy.type === 'zulrah' || enemy.type === 'jad';
        const size = isBoss ? 60 : 30;

        this.ctx.save();
        this.ctx.translate(enemy.x, enemy.y);
        
        // OSRS Rule #2: DO NOT rotate NPC images. They are sideways/front-facing in Wiki.
        // Rule Extension: Most face right. Mirror if moving left.
        const targetPoint = this.path[enemy.pathIndex + 1] || enemy;
        const movingLeft = targetPoint.x < enemy.x;
        
        if (img && img.complete && img.naturalWidth > 0 && !this.brokenImages.has(enemy.type)) {
          if (movingLeft) this.ctx.scale(-1, 1);
          this.ctx.drawImage(img, -size/2, -size/2, size, size);
        } else {
          this.ctx.fillStyle = enemy.color;
          this.ctx.beginPath();
          this.ctx.arc(0, 0, isBoss ? 20 : 10, 0, Math.PI * 2);
          this.ctx.fill();
        }
        this.ctx.restore();

        // Status effects
        if (enemy.slowTimer > 0) {
          this.ctx.strokeStyle = '#00ffff';
          this.ctx.lineWidth = 2;
          this.ctx.beginPath();
          this.ctx.arc(enemy.x, enemy.y, 12, 0, Math.PI * 2);
          this.ctx.stroke();
          this.ctx.font = '10px Arial';
          this.ctx.fillText('❄️', enemy.x - 15, enemy.y + 10);
        }
        if (enemy.stunTimer > 0) {
          // Frozen: icy blue ring + fill tint
          const pulseAlpha = 0.3 + 0.15 * Math.sin((this.gameTime / 1000) * 6);
          this.ctx.fillStyle = `rgba(100, 200, 255, ${pulseAlpha})`;
          this.ctx.beginPath();
          this.ctx.arc(enemy.x, enemy.y, (isBoss ? 20 : 10) + 4, 0, Math.PI * 2);
          this.ctx.fill();
          this.ctx.strokeStyle = '#00c8ff';
          this.ctx.lineWidth = 2.5;
          this.ctx.beginPath();
          this.ctx.arc(enemy.x, enemy.y, (isBoss ? 20 : 10) + 6, 0, Math.PI * 2);
          this.ctx.stroke();
          // Snowflake label
          this.ctx.font = `${isBoss ? 14 : 10}px Arial`;
          this.ctx.textAlign = 'center';
          this.ctx.fillStyle = '#ffffff';
          this.ctx.fillText('❄', enemy.x, enemy.y - (isBoss ? 28 : 20));
        }

        if (enemy.burnTimer > 0) {
          // Fire particles or glow
          const pulse = 0.5 + 0.5 * Math.sin((this.gameTime / 1000) * 10);
          this.ctx.fillStyle = `rgba(255, 100, 0, ${0.3 * pulse})`;
          this.ctx.beginPath();
          this.ctx.arc(enemy.x, enemy.y, (isBoss ? 25 : 15), 0, Math.PI * 2);
          this.ctx.fill();
          this.ctx.font = '12px Arial';
          this.ctx.fillText('🔥', enemy.x + 10, enemy.y - 10);
        }

        if ((enemy.poisonTimer || 0) > 0 || (enemy.venomTimer && enemy.venomTimer > 0)) {
          // Poison green tint
          this.ctx.fillStyle = 'rgba(0, 255, 0, 0.2)';
          this.ctx.beginPath();
          this.ctx.arc(enemy.x, enemy.y, (isBoss ? 20 : 10), 0, Math.PI * 2);
          this.ctx.fill();
          this.ctx.font = '12px Arial';
          this.ctx.fillText('🧪', enemy.x - 10, enemy.y - 10);
        }

        // Health bar
        const barWidth = isBoss ? 60 : 30;
        const barHeight = isBoss ? 6 : 4;
        const barY = isBoss ? enemy.y - 40 : enemy.y - 20;

        this.ctx.fillStyle = '#ff0000';
        this.ctx.fillRect(enemy.x - barWidth/2, barY, barWidth, barHeight);
        this.ctx.fillStyle = '#00ff00';
        this.ctx.fillRect(enemy.x - barWidth/2, barY, barWidth * (enemy.hp / enemy.maxHp), barHeight);

        if (isBoss) {
          this.ctx.strokeStyle = '#fff';
          this.ctx.lineWidth = 1;
          this.ctx.strokeRect(enemy.x - barWidth/2, barY, barWidth, barHeight);
          
          this.ctx.fillStyle = '#fff';
          this.ctx.font = 'bold 12px Arial';
          this.ctx.textAlign = 'center';
          this.ctx.fillText(enemy.type.toUpperCase(), enemy.x, barY - 5);
        }
        if (enemy.tauntTimer > 0) {
          this.ctx.strokeStyle = '#ff0000';
          this.ctx.lineWidth = 1;
          this.ctx.beginPath();
          this.ctx.arc(enemy.x, enemy.y, 16, 0, Math.PI * 2);
          this.ctx.stroke();
        }
      });

      // Draw Projectiles
      this.projectiles.forEach(p => {
        if (isNaN(p.x) || isNaN(p.y)) return;
        
        const target = this.enemies.find(e => e.id === p.targetId);
        let angle = 0;
        if (target) {
          angle = Math.atan2(target.y - p.y, target.x - p.x);
        }

        this.ctx.save();
        this.ctx.translate(p.x, p.y);
        this.ctx.rotate(angle);
        
        if (p.type === 'cannonball') {
           this.ctx.rotate(-angle); // Cannonballs don't rotate
           this.ctx.fillStyle = '#333';
           this.ctx.beginPath();
           this.ctx.arc(0, 0, 4, 0, Math.PI * 2);
           this.ctx.fill();
           this.ctx.strokeStyle = '#000';
           this.ctx.stroke();
        } else if (p.type === 'spell') {
           this.ctx.rotate(-angle); // Spells are spheres usually
           const colors: Record<string, string> = { air: '#ffffff', water: '#0000ff', earth: '#8b4513', fire: '#ff0000' };
           this.ctx.fillStyle = colors[p.element || 'air'];
           this.ctx.shadowBlur = 10;
           this.ctx.shadowColor = this.ctx.fillStyle as string;
           this.ctx.beginPath();
           this.ctx.arc(0, 0, 5, 0, Math.PI * 2);
           this.ctx.fill();
         } else if (p.type.startsWith('ancient_')) {
            this.ctx.rotate(-angle);
            const ancColors: Record<string, string> = { ice: '#00ffff', smoke: '#555', shadow: '#440044', blood: '#ff0000' };
            const type = p.type.replace('ancient_', '');
            this.ctx.fillStyle = ancColors[type] || '#fff';
            this.ctx.shadowBlur = 15;
            this.ctx.shadowColor = this.ctx.fillStyle as string;
            this.ctx.beginPath();
            this.ctx.arc(0, 0, 6, 0, Math.PI * 2);
            this.ctx.fill();
         } else if (p.type === 'dart') {
           this.ctx.fillStyle = '#00ff00';
           this.ctx.fillRect(-6, -1.5, 12, 3);
        } else if (p.type === 'arrow' || p.type === 'bolt') {
           this.ctx.fillStyle = p.color;
           this.ctx.fillRect(-8, -1, 16, 2);
           // Fletching/Head
           this.ctx.fillStyle = '#fff';
           this.ctx.fillRect(-8, -2, 3, 4);
        } else {
           this.ctx.fillStyle = p.color;
           this.ctx.beginPath();
           this.ctx.arc(0, 0, 3, 0, Math.PI * 2);
           this.ctx.fill();
        }
        
        this.ctx.restore();
      });

      // Draw Particles
      this.particles.forEach(p => {
        this.ctx.fillStyle = p.color;
        this.ctx.globalAlpha = p.life / 0.3;
        this.ctx.beginPath();
        this.ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.globalAlpha = 1.0;
      });

      // Draw Damage Numbers
      this.damageNumbers.forEach(dn => {
        this.ctx.fillStyle = dn.color;
        this.ctx.globalAlpha = dn.life;
        this.ctx.font = `bold ${Math.floor(12 + dn.life * 4)}px 'RuneScape', Arial`;
        this.ctx.textAlign = 'center';
        this.ctx.fillText(dn.text, dn.x, dn.y);
        this.ctx.globalAlpha = 1.0;
      });

      // Draw Floating Texts (Level ups, etc)
      this.floatingTexts.forEach(ft => {
        this.ctx.save();
        this.ctx.globalAlpha = Math.min(1, ft.life * 2);
        this.ctx.fillStyle = ft.color;
        this.ctx.font = `bold 16px 'RuneScape', Arial`;
        this.ctx.textAlign = 'center';
        this.ctx.shadowColor = '#000';
        this.ctx.shadowBlur = 4;
        this.ctx.shadowOffsetX = 1;
        this.ctx.shadowOffsetY = 1;
        this.ctx.fillText(ft.text, ft.x, ft.y);
        
        if (ft.icon) {
          const iconImg = this.imageCache.get(`${ft.icon.toLowerCase()}_icon`);
          if (iconImg && iconImg.complete && iconImg.naturalWidth > 0) {
            this.ctx.drawImage(iconImg, ft.x - 10, ft.y - 35, 20, 20);
          }
        }
        this.ctx.restore();
      });

      // Draw Loots — all loots show as bones icon (OSRS style), click to collect
      const bonesImg = this.imageCache.get('bones_loot');
      this.loots.forEach(loot => {
        this.ctx.save();
        this.ctx.translate(loot.x, loot.y);
        const pulse = 1 + Math.sin(now / 300) * 0.15;
        this.ctx.scale(pulse, pulse);
        
        // Draw bones icon
        if (bonesImg && bonesImg.complete && bonesImg.naturalWidth > 0) {
          this.ctx.drawImage(bonesImg, -12, -12, 24, 24);
        } else {
          this.ctx.font = '20px Arial';
          this.ctx.textAlign = 'center';
          this.ctx.fillText('🦴', 0, 8);
        }
        
        // Tinted glow based on loot type
        const glowColor = loot.type === 'essence' ? '#00ffff' : loot.type === 'item' ? '#ff8000' : '#ffff00';
        this.ctx.globalAlpha = 0.25 + 0.15 * Math.sin(now / 150);
        this.ctx.fillStyle = glowColor;
        this.ctx.beginPath();
        this.ctx.arc(0, 0, 14, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.globalAlpha = 1.0;
        
        this.ctx.restore();
      });

      this.ctx.restore();
    } catch (e) {
      console.error('Draw loop error:', e);
    } finally {
      this.ctx.restore();
    }
  }
}
