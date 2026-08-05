
import { ASSETS } from './assets';
import { 
  Point, GlobalUpgrades, PrayerType, ActivePotion, Pet, Achievement, 
  EnemyType, Element, Enemy, TowerType, MageMode, AncientType, 
  SupportSpell, TowerSkill, TowerSkills, PlayerSkills, GatheringNode, 
  Item, Region, TargetingPriority, Tower, Projectile, SlayerTask,
  Quest, FarmingPatch, Hitsplat, HitsplatType, GameSettings, EngineStatePatch
} from './types';
import { PRAYERS } from './data/prayers';
import { ACHIEVEMENTS } from './data/achievements';
import { QUESTS } from './data/quests';
import { ENEMIES } from './data/enemies';
import { TOWERS } from './data/towers';
import { ITEMS, ITEM_PROGRESSIONS } from './data/items';
import { LANDMARK_WAVES } from './data/waves';
import { NODE_CONFIGS } from './data/nodes';
import { PET_DROP_TABLE, LootDrop } from './data/drops';
import { HERBLORE_RECIPES } from './data/herblore';
import { MAGIC_SPELLS } from './data/spells';
import { POH_UPGRADES } from './data/construction';
import { TICK, ARCHER_STATS, SPELL_MAX_HITS, WIZARD_SPELL_TIERS, ANCIENT_HITS, ANCIENT_TIERS, UTILITY_TIERS } from './data/tower-stats';
import { distance, distanceSq, isValidPlacement as isValidPlacementGeom } from './systems/geometry';
import { playerXpForLevel, towerXpForLevel, applyXpGain } from './systems/leveling';
import { scaleEnemyStats } from './systems/enemy-scaling';
import { nextPriceMultiplier } from './systems/economy';
import { selectTarget } from './systems/targeting';
import { buildWaveConfigs } from './systems/wave-generation';
import { rollSlayerTask } from './systems/slayer';
import { calculateTowerStats as calcTowerStats } from './systems/tower-combat';
import { prayerDrainRate } from './systems/prayer';
import { rollItemDrops } from './systems/loot';
import { crossedInterval } from './systems/timing';
import { FarmingSystem } from './systems/farming-system';
import { SLAYER_MASTERS } from './data/slayer';
import { GameRenderer } from './renderer';

// OSRS Game Tick is imported from data/tower-stats.ts

export class GameEngine {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  renderer: GameRenderer;
  onStateChange: (state: EngineStatePatch) => void;

  animationId: number = 0;
  lastTime: number = 0;
  prevWidth: number = 0;
  prevHeight: number = 0;

  gameSpeed: number = 1;
  gameTime: number = 0;
  maxDt: number = 0.1;
  isPaused: boolean = false;
  
  readonly LOGIC_WIDTH = 1920;
  readonly LOGIC_HEIGHT = 1080;

  autoSpawnEnabled: boolean = false;
  autoSpawnDelay: number = 3; 
  autoSpawnTimer: number = 0;
  hoveredEntityId: string | null = null;
  selectedEntityId: string | null = null;
  money: number = 60;
  lives: number = 20;
  wave: number = 1;
  waveActive: boolean = false;
  runeEssence: number = 0;
  devMode: boolean = false; 
  gameOver: boolean = false;
  
  prayerPoints: number = 10;
  maxPrayerPoints: number = 10;
  activePrayers: Set<PrayerType> = new Set();
  prayerDrainTimer: number = 0;

  mousePos: Point = { x: 0, y: 0 };
  selectedTowerType: string | null = null;

  specialAttackCharge: number = 0;
  maxSpecialAttack: number = 100;

  activePotions: ActivePotion[] = [];

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
  
  achievements: Achievement[] = structuredClone(ACHIEVEMENTS);
  quests: Quest[] = structuredClone(QUESTS);
  allPrayers = PRAYERS;

  enemies: Enemy[] = [];
  towers: Tower[] = [];
  projectiles: Projectile[] = [];
  particles: { x: number, y: number, life: number, color: string }[] = [];
  damageNumbers: { x: number, y: number, text: string, life: number, color: string, velocityY: number, velocityX: number }[] = [];
  hitsplats: Hitsplat[] = [];
  deathAnimations: { x: number, y: number, type: string, life: number, loot?: { id: string, x: number, y: number, type: 'essence' | 'money' | 'item' | 'bones', data?: any, life: number, size: number }[] }[] = [];
  floatingTexts: { x: number, y: number, text: string, life: number, color: string, icon?: string }[] = [];
  loots: { id: string, x: number, y: number, type: 'essence' | 'money' | 'item' | 'bones', data?: any, life: number, size: number }[] = [];
  nodes: GatheringNode[] = [];
  farming!: FarmingSystem;
  currentRegion: Region = 'misthalin';
  playerSkills: PlayerSkills = {
    mining: { level: 1, xp: 0 },
    woodcutting: { level: 1, xp: 0 },
    herblore: { level: 1, xp: 0 },
    crafting: { level: 1, xp: 0 },
    prayer: { level: 1, xp: 0 },
    farming: { level: 1, xp: 0 },
    magic: { level: 1, xp: 0 },
    construction: { level: 1, xp: 0 }
  };
  theme: 'grass' | 'sand' | 'dark' = 'grass';
  messages: string[] = ["Welcome to OSRS Tower Defense!"];
  settings: GameSettings = {
    volume: 0.3,
    showRangeAlways: false,
    particles: true
  };

  inventory: Item[] = [];
  pohUpgrades: string[] = [];
  
  shakeAmount: number = 0;
  jadAttackTimer: number = 0;
  jadAttackType: 'mage' | 'range' | null = null;
  path: Point[] = [];
  currentPathIndex: number = 0; 
  enemiesToSpawn: Enemy[] = [];
  spawnTimer: number = 0;
  spawnInterval: number = 1000; 

  achievementPoints: number = 0;
  slayerPoints: number = 0;
  slayerTask: SlayerTask | null = null;
  slayerMaster: string = 'turael';
  lastTaskType: EnemyType | null = null;
  consecutiveTasks: number = 0;
  unlockedTowers: string[] = ['archer', 'wizard', 'tzhaar', 'toxic'];
  blockedEnemies: string[] = [];
  extendedTasks: string[] = [];
  biggerAndBadder: boolean = false;
  slayerHelmet: boolean = false;
  
  // Boss mechanics state
  acidPools: { x: number, y: number, radius: number, duration: number }[] = [];
  zombifiedSpawn: { x: number, y: number, hp: number, id: string, targetTowerId: string } | null = null;
  zulrahPhase: 'serpentine' | 'magma' | 'tanzanite' = 'serpentine';
  jadStyle: 'magic' | 'ranged' = 'magic';
  bossTimer: number = 0;

  // Economy state
  itemPriceMultipliers: Record<string, number> = {};
  itemsSoldThisWave: Record<string, number> = {};
  lastEconomyUpdateWave: number = 0;

  audioCtx: AudioContext | null = null;
  soundCache: Map<string, HTMLAudioElement> = new Map();
  soundThrottle: Map<string, number> = new Map();
  imageCache: Map<string, HTMLImageElement> = new Map();
  brokenImages: Set<string> = new Set();

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

  constructor(canvas: HTMLCanvasElement, onStateChange: (state: EngineStatePatch) => void, initialEssence: number = 0, upgrades?: Partial<GlobalUpgrades>) {
    console.log('GameEngine constructor start');
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.renderer = new GameRenderer(this);
    this.onStateChange = onStateChange;
    this.runeEssence = initialEssence;
    
    if (upgrades) {
      this.upgrades = { ...this.upgrades, ...upgrades };
    }

    console.log('GameEngine initFarming start');
    this.farming = new FarmingSystem(this);
    this.farming.init(); // Initialize farming patches
    console.log('GameEngine initFarming end');

    // Apply starting money upgrade
    this.money = 200 + this.upgrades.startingMoney;
    
    // Use logic dimensions
    this.prevWidth = this.LOGIC_WIDTH;
    this.prevHeight = this.LOGIC_HEIGHT;
    this.canvas.width = this.prevWidth;
    this.canvas.height = this.prevHeight;

    // Initial state sync
    this.onStateChange(this.getState());

    // Init Audio & Images
    if (typeof window !== 'undefined') {
      try {
        console.log('GameEngine AudioContext init start');
        this.audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        this.preloadSounds();
        this.preloadImages();
        console.log('GameEngine AudioContext init end');
      } catch (e) {
        console.warn('AudioContext failed to initialize:', e);
      }
    }

    console.log('GameEngine initPath start');
    this.initPath();
    
    console.log('GameEngine initNodes start');
    this.initNodes();
    console.log('GameEngine assignSlayerTask start');
    this.assignSlayerTask();
    console.log('GameEngine constructor end');
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
      img.referrerPolicy = 'no-referrer';
      img.onload = () => console.log(`Loaded image: ${key}`);
      img.onerror = () => {
        console.warn(`Failed to load image: ${key} (${url})`);
        this.brokenImages.add(key);
      };
      img.src = url;
      this.imageCache.set(key, img);
    });

    // Additional Fallbacks if any (none needed now as all are in ASSETS)
  }

  isImageValid(img: HTMLImageElement | undefined, key?: string): boolean {
    if (!img) return false;
    if (key && this.brokenImages.has(key)) return false;
    // An image is broken if it's complete but has no naturalWidth
    return img.complete && img.naturalWidth > 0;
  }

  addMessage(text: string) {
    this.messages.push(text);
    if (this.messages.length > 50) this.messages.shift();
    this.onStateChange({ messages: [...this.messages] });
  }

  playSound(type: string) {
    const cached = this.soundCache.get(type);
    console.log('Playing sound:', type, cached);
    if (cached) {
      const now = performance.now();
      if (type === 'hit' || type.startsWith('shoot')) {
        const lastTime = this.soundThrottle.get(type) || 0;
        if (now - lastTime < 50) return;
        this.soundThrottle.set(type, now);
      }

      try {
        const sound = cached.cloneNode() as HTMLAudioElement;
        sound.volume = 0.15;
        sound.play().catch((e) => console.error('Sound play failed:', e));
      } catch (e) {
        console.warn('Sound play error:', e);
      }
    }
  }

  resize() {
    if (!this.canvas) return;
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    
    const dpr = window.devicePixelRatio || 1;
    
    // Set actual resolution (this resets context state)
    const newWidth = Math.floor(rect.width * dpr);
    const newHeight = Math.floor(rect.height * dpr);
    
    if (this.canvas.width !== newWidth || this.canvas.height !== newHeight) {
      this.canvas.width = newWidth;
      this.canvas.height = newHeight;
      // Context state is reset when width/height changes
      if (this.ctx) {
        this.ctx.imageSmoothingEnabled = false;
      }
    }
    
    this.prevWidth = rect.width;
    this.prevHeight = rect.height;
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
    // Use logic dimensions for path generation
    let w = forceWidth || this.LOGIC_WIDTH;
    let h = forceHeight || this.LOGIC_HEIGHT;
    
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
    const master = SLAYER_MASTERS.find(m => m.id === this.slayerMaster) || SLAYER_MASTERS[0];
    const task = rollSlayerTask(master, {
      enemies: Object.values(ENEMIES),
      wave: this.wave,
      lastTaskType: this.lastTaskType,
      blockedEnemies: this.blockedEnemies,
      extendedTasks: this.extendedTasks,
      consecutiveTasks: this.consecutiveTasks,
      slayerRewardMultiplier: this.upgrades.slayerReward,
    });
    if (!task) return;

    this.lastTaskType = task.type;
    this.slayerTask = task;
    this.onStateChange({ slayerTask: this.slayerTask });
    this.playSound('task_assign');
  }

  setSlayerMaster(masterId: string) {
    const master = SLAYER_MASTERS.find(m => m.id === masterId);
    if (master && this.playerSkills.magic.level >= master.levelReq) { // Using magic level as a proxy for combat level req
      this.slayerMaster = masterId;
      this.addMessage(`You are now using ${master.name} as your Slayer Master.`);
      this.onStateChange({ slayerMaster: this.slayerMaster });
    } else if (master) {
      this.addMessage(`You need level ${master.levelReq} Magic to use ${master.name}.`);
    }
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
    
    if (!this.slayerTask) {
      this.assignSlayerTask();
    }

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
      this.playSound('prayer_off');
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
      this.shakeAmount = 20; // Add screen shake
      
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

  getEnemyStats(type: EnemyType, waveMultiplier: number): Omit<Enemy, 'id' | 'x' | 'y' | 'pathIndex' | 'slowTimer' | 'stunTimer' | 'tauntTimer'> {
    const enemyDef = ENEMIES[type];
    if (!enemyDef) {
       console.error(`Enemy type ${type} not found in registry`);
       return {
         ...ENEMIES['goblin'],
         hp: 1,
         maxHp: 1,
         baseSpeed: 100,
         burnTimer: 0,
         burnDamage: 0,
         groundTimer: 0,
         resistance: 0
       };
    }

    const { hp: effectiveHp, speed: effectiveSpeed, reward: effectiveReward } =
      scaleEnemyStats(
        { hp: enemyDef.hp, speed: enemyDef.speed, reward: enemyDef.reward },
        waveMultiplier,
      );

    return {
      ...enemyDef,
      hp: effectiveHp,
      maxHp: effectiveHp,
      speed: effectiveSpeed,
      baseSpeed: effectiveSpeed,
      reward: effectiveReward,
      burnTimer: 0,
      burnDamage: 0,
      groundTimer: 0,
      poisonTimer: 0,
      venomTimer: 0,
      venomDamage: 0,
      resistance: enemyDef.isBoss ? (enemyDef.resistance || 0.5) : 0
    };
  }

  generateWave(waveNum: number): Enemy[] {
    const enemies: Enemy[] = [];
    const waveConfigs = buildWaveConfigs(waveNum, {
      enemies: Object.values(ENEMIES),
      blockedEnemies: this.blockedEnemies,
      slayerTask: this.slayerTask,
      landmark: LANDMARK_WAVES[waveNum],
    });

    if (this.path.length === 0) return enemies;

    for (const config of waveConfigs) {
      for (let i = 0; i < config.count; i++) {
        let actualType = config.type;
        
        // Superior monster chance (1/100) if Bigger and Badder is unlocked
        if (this.biggerAndBadder && !ENEMIES[actualType].isBoss) {
            const superiorType = `superior_${actualType}`;
            if (ENEMIES[superiorType] && Math.random() < 0.01) {
                actualType = superiorType as any;
                this.addMessage(`A superior monster has appeared: ${ENEMIES[actualType].name}!`);
            }
        }
        
        const baseStats = this.getEnemyStats(actualType, waveNum);
        enemies.push({
          id: Math.random().toString(36).substr(2, 9),
          x: this.path[0].x,
          y: this.path[0].y,
          pathIndex: 0,
          slowTimer: 0,
          stunTimer: 0,
          tauntTimer: 0,
          shakeX: 0,
          shakeY: 0,
          ...baseStats
        });
      }
    }
    
    return enemies;
  }

  placeTower(type: string, x: number, y: number) {
    const towerDef = TOWERS[type];
    if (!towerDef) {
       console.error(`Tower type ${type} not found in registry`);
       return;
    }

    const firstTier = towerDef.tiers[0];
    const effectiveCost = Math.floor(firstTier.upgradeCost * (this.upgrades.towerCostReduction || 1));
    const gridSize = 32;
    const snappedX = Math.round(x / gridSize) * gridSize;
    const snappedY = Math.round(y / gridSize) * gridSize;

    if (this.money >= effectiveCost) {
      if (this.isValidPlacement(snappedX, snappedY)) {
        this.playSound('upgrade');
        this.money -= effectiveCost;
        this.towers.push({
          id: Math.random().toString(36).substr(2, 9),
          x: snappedX,
          y: snappedY,
          type: type as any,
          level: 1,
          maxLevel: towerDef.tiers.length,
          range: firstTier.range,
          damage: firstTier.damage,
          cooldown: firstTier.cooldown,
          lastFired: 0,
          color: firstTier.color,
          targetId: null,
          targetingPriority: 'first',
          name: firstTier.name,
          upgradeCost: towerDef.tiers[1] ? towerDef.tiers[1].upgradeCost : 0,
          special: firstTier.special,
          visualRadius: 18,
          disabledTimer: 0,
          minDamage: firstTier.minDamage || 0,
          maxDamage: firstTier.maxDamage || 0,
          mageMode: type === 'wizard' ? 'elemental' : undefined,
          element: type === 'wizard' ? 'air' : undefined,
          specCharge: 0,
          specMax: 100,
          skills: {
            strength: { level: 1, xp: 0 },
            ranged: { level: 1, xp: 0 },
            magic: { level: 1, xp: 0 }
          },
          equipment: {
            ammo: null,
            jewellery: null
          }
        });
        this.upgradeTowerStats(this.towers[this.towers.length - 1]);
        this.awardPlayerXP('crafting', 20, snappedX, snappedY);
        this.onStateChange({ money: this.money });
      }
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
    // Update upgrade cost from data for next level
    const towerDef = TOWERS[tower.type];
    if (towerDef && towerDef.tiers[tower.level]) {
      tower.upgradeCost = towerDef.tiers[tower.level].upgradeCost;
    } else {
      tower.upgradeCost = 0;
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

  unequipItem(towerId: string, slot: 'ammo' | 'jewellery') {
    const tower = this.towers.find(t => t.id === towerId);
    if (tower && tower.equipment[slot]) {
      const item = tower.equipment[slot];
      tower.equipment[slot] = null;
      this.addItemToInventory(item!);
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
    const towerDef = TOWERS[tower.type];
    if (!towerDef) return;
    const tierData = towerDef.tiers[Math.min(tower.level - 1, towerDef.tiers.length - 1)];
    
    // Level Bonus: 5% damage per skill level (calculated in calculateTowerStats)
    const tier = Math.min(tower.level - 1, towerDef.tiers.length - 1);

    const tile = 25;

    if (tower.type === 'archer') {
      const stats = ARCHER_STATS[Math.min(tier, 3)];
      const baseTiles = stats.tiles;
      const baseCooldownTicks = stats.cooldownTicks;
      
      const baseDamage = tierData.damage;

      if (tower.level === 2) tower.specMax = 80;
      else if (tower.level === 4) tower.specMax = 120;
      else tower.specMax = 100;

      if (tower.attackStyle === 'long_range') {
        tower.range = (baseTiles + 3) * tile;
        tower.cooldown = (baseCooldownTicks + 1) * TICK * 1000;
        tower.damage = baseDamage;
      } else {
        tower.range = baseTiles * tile;
        tower.cooldown = baseCooldownTicks * TICK * 1000;
        tower.damage = baseDamage;
      }
    } else if (tower.type === 'wizard') {
      if (tower.mageMode === 'elemental') {
        tower.range = tierData.range;
        const elem = tower.element && tower.element !== 'none' ? tower.element : 'air';
        tower.name = `${elem.charAt(0).toUpperCase()}${elem.slice(1)} ${WIZARD_SPELL_TIERS[tier]}`;
        tower.damage = tierData.damage;
        tower.fireSound = `wizard_${elem}_${tier}`;
        tower.special = undefined;
      } else if (tower.mageMode === 'ancients') {
        tower.range = tierData.range;
        const ancientTier = Math.min(tower.level - 1, 3);
        const aType = tower.ancientType || 'ice';
        const typeNames: Record<string, string> = { ice: 'Ice', blood: 'Blood', shadow: 'Shadow', smoke: 'Smoke' };
        tower.name = `${typeNames[aType]} ${ANCIENT_TIERS[ancientTier]}`;
        
        tower.damage = tierData.damage;
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
          tower.special = 'aoe_slow';
        } else if (aType === 'smoke') {
          tower.special = 'burn';
        }
      } else {
        // utility
        tower.range = tierData.range;
        tower.name = UTILITY_TIERS[Math.min(tower.level - 1, 3)];
        tower.damage = tierData.damage;
        tower.special = undefined;
      }
    } else if (tower.type === 'cannon') {
        tower.fireSound = 'cannon_1';
        tower.range = tierData.range;
        tower.damage = tierData.damage;
        tower.minDamage = tierData.minDamage || 0;
        tower.maxDamage = tierData.maxDamage || 0;
    } else if (tower.type === 'tzhaar') {
        tower.fireSound = 'tzhaar_1';
        tower.range = tierData.range;
        tower.damage = tierData.damage;
    } else if (tower.type === 'slayer') {
        tower.fireSound = 'slayer_1';
        tower.range = tierData.range;
        tower.damage = tierData.damage;
    } else if (tower.type === 'toxic') {
        tower.fireSound = 'toxic_1';
        tower.range = tierData.range;
        tower.damage = tierData.damage;
    }
  }

  sellTower(towerId: string) {
    const index = this.towers.findIndex(t => t.id === towerId);
    if (index > -1) {
      this.playSound('sell');
      // Sell value increases with Crafting level
      const craftingBonus = 1 + (this.playerSkills.crafting.level - 1) * 0.02;
      const towerDef = TOWERS[this.towers[index].type];
      const cost = towerDef.tiers.slice(0, this.towers[index].level).reduce((sum, t) => sum + t.upgradeCost, 0);
      this.money += Math.floor(cost * 0.75 * craftingBonus); 
      this.towers.splice(index, 1);
      this.onStateChange({ money: this.money, selectedPlacedTower: null });
    }
  }

  isValidPlacement(x: number, y: number): boolean {
    // pathClearance = pathWidth (25) + tower radius (15); towerClearance = 2 radii.
    return isValidPlacementGeom(x, y, this.path, this.towers, 40, 30);
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
      if (enemy.x < 0 || enemy.x > this.LOGIC_WIDTH || enemy.y < 0 || enemy.y > this.LOGIC_HEIGHT) continue;
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

  collectLootAt(x: number, y: number, hoverPickup: boolean = false): boolean {
    const radius = hoverPickup ? 20 : 30;
    const lootIndex = this.loots.findIndex(l => distance(l.x, l.y, x, y) < radius);
    if (lootIndex === -1) return false;

    const loot = this.loots[lootIndex];
    // In hover mode, only pick up bones, unless in dev mode
    if (hoverPickup && loot.type !== 'bones' && !this.devMode) return false;

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
      this.addItemToInventory(loot.data);
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
    const w = this.LOGIC_WIDTH;
    const h = this.LOGIC_HEIGHT;

    // Filter nodes based on player skill levels
    const availableNodes = NODE_CONFIGS.filter(config => {
      if (config.type === 'tree') return this.playerSkills.woodcutting.level >= config.level;
      if (config.type === 'ore') return this.playerSkills.mining.level >= config.level;
      if (config.type === 'herb') return this.playerSkills.herblore.level >= config.level;
      return false;
    });

    if (availableNodes.length === 0) {
      // Fallback to basic nodes if none are available (shouldn't happen with level 1 nodes)
      availableNodes.push(...NODE_CONFIGS.filter(c => c.level === 1));
    }

    const nodeCount = 8;
    for (let i = 0; i < nodeCount; i++) {
      const config = availableNodes[Math.floor(Math.random() * availableNodes.length)];
      
      const x = (0.1 + Math.random() * 0.8) * w;
      const y = (0.1 + Math.random() * 0.8) * h;
      
      if (this.isValidPlacement(x, y)) {
        this.nodes.push({
          id: `node_${Math.random().toString(36).substr(2, 9)}`,
          x,
          y,
          type: config.type,
          name: config.name,
          level: config.level,
          xp: config.xp,
          respawnTimer: 0,
          maxRespawn: 15000 + Math.random() * 10000
        });
      }
    }
  }

  upgradeItem(itemId: string) {
    const itemIndex = this.inventory.findIndex(i => i.id === itemId);
    if (itemIndex === -1) return;
    const item = this.inventory[itemIndex];
    
    const nextName = ITEM_PROGRESSIONS[item.name];
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
    return calcTowerStats(tower, {
      upgrades: this.upgrades,
      activePrayers: this.activePrayers,
      activePotions: this.activePotions,
      allTowers: this.towers,
    });
  }

  // Farming logic lives in FarmingSystem; the engine exposes its patches and
  // delegates the UI-called actions.
  get farmingPatches(): FarmingPatch[] { return this.farming.patches; }

  plantSeed(patchId: string, seedItem: Item) { this.farming.plantSeed(patchId, seedItem); }

  applyCompost(patchId: string, compostItem: Item) { this.farming.applyCompost(patchId, compostItem); }

  curePatch(patchId: string) { this.farming.curePatch(patchId); }

  harvestPatch(patchId: string) { this.farming.harvestPatch(patchId); }

  makePotion(herbId: string, secondaryId: string) {
    const herbIdx = this.inventory.findIndex(i => i.id.startsWith(herbId));
    const secIdx = this.inventory.findIndex(i => i.id.startsWith(secondaryId));
    const vialIdx = this.inventory.findIndex(i => i.id.startsWith('vial_of_water'));

    if (herbIdx === -1 || secIdx === -1 || vialIdx === -1) {
      this.addMessage("You don't have the required ingredients.");
      return;
    }

    const recipe = HERBLORE_RECIPES.find(r => r.herb === herbId && r.secondary === secondaryId);
    if (!recipe) {
      this.addMessage("Nothing interesting happens.");
      return;
    }

    if (this.playerSkills.herblore.level < recipe.level) {
      this.addMessage(`You need a Herblore level of ${recipe.level} to make this potion.`);
      return;
    }

    // Remove ingredients (reverse order to not mess up indices)
    const indicesToRemove = [herbIdx, secIdx, vialIdx].sort((a, b) => b - a);
    indicesToRemove.forEach(idx => {
      this.inventory.splice(idx, 1);
    });

    const potionItem = ITEMS[recipe.id];
    if (potionItem) {
      this.addItemToInventory(potionItem);
      this.awardPlayerXP('herblore', recipe.xp);
      this.addMessage(`You mix the ${recipe.herb.replace('clean_', '')} into your vial of water, then add the ${recipe.secondary.replace(/_/g, ' ')}.`);
      this.playSound('inventory_move');
      this.onStateChange({ inventory: [...this.inventory] });
    }
  }

  castSpell(spellId: string, targetItemIndex?: number) {
    const spell = MAGIC_SPELLS.find(s => s.id === spellId);
    if (!spell) return;

    if (this.playerSkills.magic && this.playerSkills.magic.level < spell.level) {
      this.addMessage(`You need a Magic level of ${spell.level} to cast this spell.`);
      return;
    }

    // Check runes
    for (const [runeId, amount] of Object.entries(spell.runes)) {
      const count = this.inventory.filter(i => i.id.startsWith(runeId)).length;
      if (count < (amount as number)) {
        this.addMessage(`You don't have enough ${runeId.replace('_', ' ')}s.`);
        return;
      }
    }

    // Execute spell
    if (spellId === 'bones_to_peaches') {
      let bonesConverted = 0;
      for (let i = 0; i < this.inventory.length; i++) {
        if (this.inventory[i].id.includes('bones')) {
          this.inventory[i] = { ...ITEMS.potato, id: `peach_${Math.random()}`, name: 'Peach', description: 'Heals 5 HP.', sellPrice: 10 };
          bonesConverted++;
        }
      }
      if (bonesConverted === 0) {
        this.addMessage("You don't have any bones to convert.");
        return;
      }
      this.lives = Math.min(20, this.lives + bonesConverted * 5);
      this.addMessage(`Converted ${bonesConverted} bones to peaches and healed ${bonesConverted * 5} HP!`);
    } else if (spellId === 'high_alchemy') {
      if (targetItemIndex === undefined || !this.inventory[targetItemIndex]) return;
      const item = this.inventory[targetItemIndex];
      if (item.id.includes('rune')) {
        this.addMessage("You can't alch runes.");
        return;
      }
      const value = Math.floor((item.sellPrice || 10) * 1.5);
      this.money += value;
      this.inventory.splice(targetItemIndex, 1);
      this.addMessage(`You alched ${item.name} for ${value} coins.`);
    } else if (spellId === 'superheat_item') {
      if (targetItemIndex === undefined || !this.inventory[targetItemIndex]) return;
      const item = this.inventory[targetItemIndex];
      if (!item.id.includes('ore')) {
        this.addMessage("You can only superheat ore.");
        return;
      }
      this.inventory[targetItemIndex] = { ...item, id: item.id.replace('ore', 'bar'), name: item.name.replace('ore', 'bar'), sellPrice: (item.sellPrice || 10) * 2 };
      this.addMessage(`You superheated the ${item.name}.`);
    } else if (spellId === 'ice_barrage') {
      if (this.enemies.length === 0) {
        this.addMessage("No enemies to freeze.");
        return;
      }
      this.enemies.forEach(e => {
        e.stunTimer = 5;
        this.particles.push({ x: e.x, y: e.y, life: 2, color: '#00ffff' });
      });
      this.addMessage("You cast Ice Barrage and freeze the enemies!");
    } else if (spellId === 'blood_barrage') {
      if (this.enemies.length === 0) {
        this.addMessage("No enemies to drain.");
        return;
      }
      let totalDamage = 0;
      this.enemies.forEach(e => {
        const dmg = 20;
        this.damageEnemy(e, dmg, 'magic');
        totalDamage += dmg;
        this.particles.push({ x: e.x, y: e.y, life: 1, color: '#ff0000' });
      });
      const heal = Math.floor(totalDamage / 4);
      this.lives = Math.min(20, this.lives + heal);
      this.addMessage(`You cast Blood Barrage, dealing damage and healing ${heal} HP!`);
    }

    // Consume runes
    for (const [runeId, amount] of Object.entries(spell.runes)) {
      let removed = 0;
      for (let i = this.inventory.length - 1; i >= 0; i--) {
        if (this.inventory[i].id.startsWith(runeId)) {
          this.inventory.splice(i, 1);
          removed++;
          if (removed === amount) break;
        }
      }
    }

    this.awardPlayerXP('magic', spell.xp);
    this.playSound('magic_hit');
    this.onStateChange({ inventory: [...this.inventory], money: this.money, lives: this.lives });
  }

  unlockTower(towerId: string, cost: number) {
    if (this.slayerPoints >= cost && !this.unlockedTowers.includes(towerId)) {
      this.slayerPoints -= cost;
      this.unlockedTowers.push(towerId);
      this.addMessage(`You unlocked the ${towerId} tower!`);
      this.onStateChange({ slayerPoints: this.slayerPoints, unlockedTowers: [...this.unlockedTowers] });
    }
  }

  unlockSlayerReward(rewardId: string, cost: number) {
    if (this.slayerPoints >= cost) {
      if (rewardId === 'bigger_and_badder' && !this.biggerAndBadder) {
        this.slayerPoints -= cost;
        this.biggerAndBadder = true;
        this.addMessage("You unlocked 'Bigger and Badder'! Superior monsters can now spawn.");
        this.onStateChange({ slayerPoints: this.slayerPoints, biggerAndBadder: true });
      } else if (rewardId === 'slayer_helmet' && !this.slayerHelmet) {
        this.slayerPoints -= cost;
        this.slayerHelmet = true;
        this.addMessage("You unlocked the Slayer Helmet! All towers deal 15% more damage to your Slayer task targets.");
        this.onStateChange({ slayerPoints: this.slayerPoints, slayerHelmet: true });
      }
    }
  }

  blockEnemy(enemyType: string, cost: number) {
    if (this.slayerPoints >= cost && !this.blockedEnemies.includes(enemyType)) {
      this.slayerPoints -= cost;
      this.blockedEnemies.push(enemyType);
      this.addMessage(`You blocked ${enemyType} from spawning.`);
      this.onStateChange({ slayerPoints: this.slayerPoints, blockedEnemies: [...this.blockedEnemies] });
    }
  }

  extendTask(enemyType: string, cost: number) {
    if (this.slayerPoints >= cost && !this.extendedTasks.includes(enemyType)) {
      this.slayerPoints -= cost;
      this.extendedTasks.push(enemyType);
      this.addMessage(`You extended tasks for ${enemyType}.`);
      this.onStateChange({ slayerPoints: this.slayerPoints, extendedTasks: [...this.extendedTasks] });
    }
  }

  skipTask(cost: number) {
    if (this.slayerPoints >= cost && this.slayerTask) {
      this.slayerPoints -= cost;
      this.slayerTask = null;
      this.consecutiveTasks = 0;
      this.addMessage(`You skipped your Slayer task. Your streak has been reset.`);
      this.assignSlayerTask();
      this.onStateChange({ slayerPoints: this.slayerPoints, slayerTask: this.slayerTask, consecutiveTasks: 0 });
    }
  }

  buildUpgrade(upgradeId: string) {
    if (this.pohUpgrades.includes(upgradeId)) return;

    const upgrade = POH_UPGRADES[upgradeId];
    if (!upgrade) return;

    if (this.playerSkills.construction.level < upgrade.levelReq) {
      this.addMessage(`You need level ${upgrade.levelReq} Construction to build this.`);
      return;
    }

    // Check materials
    for (const req of upgrade.materials) {
      const count = this.inventory.filter(i => i.id.startsWith(req.id)).length;
      if (count < req.amount) {
        this.addMessage(`You don't have enough materials.`);
        return;
      }
    }

    // Consume materials
    for (const req of upgrade.materials) {
      let removed = 0;
      for (let i = this.inventory.length - 1; i >= 0; i--) {
        if (this.inventory[i].id.startsWith(req.id)) {
          this.inventory.splice(i, 1);
          removed++;
          if (removed === req.amount) break;
        }
      }
    }

    this.pohUpgrades.push(upgradeId);
    this.awardPlayerXP('construction', upgrade.xpReward);
    this.playSound('click'); // Or a building sound
    this.addMessage(`You built a new POH upgrade!`);
    
    // Apply buffs immediately if needed, or they will be applied in getters
    this.onStateChange({ inventory: [...this.inventory], pohUpgrades: [...this.pohUpgrades] });
  }

  sellItem(itemIndex: number) {
    const item = this.inventory[itemIndex];
    if (!item) return;
    
    // Live Economy logic: Base price * Multiplier
    const basePrice = item.sellPrice || 50;
    const multiplier = this.itemPriceMultipliers[item.id] || 1.0;
    const price = Math.floor(basePrice * multiplier);

    this.money += price;
    this.inventory.splice(itemIndex, 1);
    
    // Track sales for economy
    this.itemsSoldThisWave[item.id] = (this.itemsSoldThisWave[item.id] || 0) + 1;

    this.playSound('sell');
    this.addMessage(`Sold ${item.name} for ${price} GP (Multiplier: ${multiplier.toFixed(2)}x)`);
    this.onStateChange({ money: this.money, inventory: this.inventory });
  }

  updateEconomy() {
    // Fluctuating economy logic
    // Called every 5 waves
    this.addMessage("The Grand Exchange economy is shifting...");
    
    // Base items to fluctuate
    const itemsToFluctuate = [
      'logs', 'oak_logs', 'willow_logs', 'yew_logs', 'magic_logs',
      'bronze_ore', 'iron_ore', 'coal', 'mithril_ore', 'adamantite_ore', 'rune_ore',
      'grimy_guam', 'clean_guam', 'grimy_ranarr', 'clean_ranarr',
      'guam_seed', 'ranarr_seed', 'potato_seed'
    ];

    itemsToFluctuate.forEach(itemId => {
      const current = this.itemPriceMultipliers[itemId] || 1.0;
      const soldCount = this.itemsSoldThisWave[itemId] || 0;
      this.itemPriceMultipliers[itemId] = nextPriceMultiplier(current, soldCount);
    });

    // Reset sales tracker
    this.itemsSoldThisWave = {};
    this.lastEconomyUpdateWave = this.wave;
    
    this.onStateChange({ itemPriceMultipliers: this.itemPriceMultipliers });
  }

  getState() {
    return {
      money: this.money,
      lives: this.lives,
      wave: this.wave,
      waveActive: this.waveActive,
      runeEssence: this.runeEssence,
      prayerPoints: this.prayerPoints,
      maxPrayerPoints: this.maxPrayerPoints,
      activePrayers: Array.from(this.activePrayers),
      specialAttackCharge: this.specialAttackCharge,
      activePotions: this.activePotions,
      inventory: this.inventory,
      playerSkills: this.playerSkills,
      currentRegion: this.currentRegion,
      messages: this.messages,
      settings: this.settings,
      slayerTask: this.slayerTask,
      achievementPoints: this.achievementPoints,
      autoSpawnEnabled: this.autoSpawnEnabled,
      autoSpawnTimer: this.autoSpawnTimer,
      followingPetId: this.followingPetId,
      activeQuote: this.activeQuote,
      farmingPatches: this.farmingPatches
    };
  }

  update(dt: number, now: number, rawDt: number = dt) {
    if (this.isPaused || this.gameOver) return;
    this.handleBossMechanics(dt);

    // Update Nodes
    this.nodes.forEach(node => {
      if (node.respawnTimer > 0) {
        node.respawnTimer -= dt * 1000;
      }
    });

    // Update Farming
    this.farming.update(dt); // dt is already in seconds (growthTime is in seconds)

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

    // Update Hitsplats
    for (let i = this.hitsplats.length - 1; i >= 0; i--) {
      const hs = this.hitsplats[i];
      hs.life -= dt;
      hs.y += hs.velocityY * dt;
      hs.x += hs.velocityX * dt;
      hs.velocityY += 60 * dt; // Gravity
      if (hs.life <= 0) this.hitsplats.splice(i, 1);
    }

    // Update Death Animations
    for (let i = this.deathAnimations.length - 1; i >= 0; i--) {
      const da = this.deathAnimations[i];
      da.life -= dt;
      if (da.life <= 0) {
        // Drop loot if any
        if (da.loot) {
          da.loot.forEach(loot => this.loots.push(loot));
        }
        this.deathAnimations.splice(i, 1);
      }
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
    let potionsChanged = false;
    for (let i = this.activePotions.length - 1; i >= 0; i--) {
      const p = this.activePotions[i];
      p.timer -= dt;
      if (p.timer <= 0) {
        this.activePotions.splice(i, 1);
        potionsChanged = true;
      }
    }
    if (potionsChanged) this.onStateChange({ activePotions: [...this.activePotions] });

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
    if (this.waveActive && this.activePrayers.size > 0 && this.prayerPoints > 0) {
      const drainRate = prayerDrainRate(
        this.activePrayers,
        this.allPrayers,
        this.upgrades.prayerEfficiency,
        this.playerSkills.prayer.level,
      );
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
      
      // Economy update every 5 waves
      if (this.wave % 5 === 0) {
        this.updateEconomy();
      }
      
      // Award player based on performance
      const performanceBonus = Math.floor((this.lives * 0.1) + (this.money * 0.005));
      // Nerfed Formula (≈2/3 of old): 1 + Wave
      const baseReward = 1 + this.wave;
      const totalMoneyReward = Math.floor((baseReward + performanceBonus) * (this.upgrades.rewardMultiplier || 1));
      
      // Rune Essence based on upgrade level and wave
      // Base 5 + Wave * 1.5
      const essenceReward = Math.floor((5 + (this.wave * 1.5)) * (1 + (this.upgrades.slayerReward || 0) * 0.1));
      
      this.money += totalMoneyReward;
      this.runeEssence += essenceReward;
      
      this.addMessage(`Wave ${this.wave} complete! Reward: ${totalMoneyReward} GP, ${essenceReward} Essence.`);
      
      // Node Respawn Logic
      const respawnable = this.nodes.find(n => n.respawnTimer > 0);
      if (respawnable) respawnable.respawnTimer = 0;

      this.floatingTexts.push({
        x: this.LOGIC_WIDTH / 2,
        y: this.LOGIC_HEIGHT / 2,
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

      // Decay shake
      if (enemy.shakeX) enemy.shakeX *= 0.8;
      if (enemy.shakeY) enemy.shakeY *= 0.8;
      if (enemy.shakeX && Math.abs(enemy.shakeX) < 0.1) enemy.shakeX = 0;
      if (enemy.shakeY && Math.abs(enemy.shakeY) < 0.1) enemy.shakeY = 0;
      
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
          if (this.lives <= 0) {
            this.gameOver = true;
            this.isPaused = true;
            this.onStateChange({ gameOver: true, isPlaying: false });
            this.playSound('death');
          }
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
          if (this.lives <= 0) {
            this.gameOver = true;
            this.isPaused = true;
            this.onStateChange({ gameOver: true, isPlaying: false });
            this.playSound('death');
          }
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
      if ((enemy.burnTimer ?? 0) > 0) {
        enemy.burnTimer = (enemy.burnTimer ?? 0) - dt;
        if (Math.random() < dt * 2) {
          this.damageEnemy(enemy, enemy.burnDamage ?? 0, undefined, true);
        }
      }

      if (enemy.magicResistDrainTimer && enemy.magicResistDrainTimer > 0) {
        enemy.magicResistDrainTimer -= dt;
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
          const stats = this.getEnemyStats('rat', 1.5);
          this.enemies.push({
            id: Math.random().toString(36).substr(2, 9),
            x: enemy.x + (Math.random() - 0.5) * 20,
            y: enemy.y + (Math.random() - 0.5) * 20,
            pathIndex: enemy.pathIndex,
            slowTimer: 0,
            stunTimer: 0,
            tauntTimer: 0,
            ...stats,
            name: stats.name,
            color: '#2E8B57', // Zulrah-style green
            reward: 1
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
              this.shakeAmount = 25;
              this.onStateChange({ lives: this.lives });
            }
          }
        }
      }
    }

    this.towers.forEach(tower => {
      // Update recoil
      if (tower.recoil && tower.recoil > 0) {
        tower.recoil *= 0.85; // Decay
        if (tower.recoil < 0.1) tower.recoil = 0;
      }

      if (tower.disabledTimer > 0) {
        tower.disabledTimer -= dt;
        return;
      }

      // Calculate Effective Stats
      const stats = this.calculateTowerStats(tower);
      const effectiveRange = stats.range;
      const rangeSq = effectiveRange * effectiveRange;
      const effectiveCooldown = stats.cooldown;
      const damageMultiplier = stats.damageMultiplier;
      const flatDamageBonus = stats.flatDamageBonus;

      // Targeting
      if (!tower.targetId || !this.enemies.find(e => e.id === tower.targetId)) {
        const inRangeEnemies = this.enemies.filter(enemy => {
          const isOffscreen = enemy.x < 0 || enemy.x > this.LOGIC_WIDTH || enemy.y < 0 || enemy.y > this.LOGIC_HEIGHT;
          if (isOffscreen) return false;
          return distanceSq(enemy.x, enemy.y, tower.x, tower.y) <= rangeSq;
        });

        if (inRangeEnemies.length > 0) {
          const selectedEnemy = selectTarget(
            inRangeEnemies,
            tower.x,
            tower.y,
            this.path,
            tower.targetingPriority || 'first',
          );
          tower.targetId = selectedEnemy?.id || null;
        } else {
          tower.targetId = null;
        }
      }

      const target = this.enemies.find(e => e.id === tower.targetId);
      if (target && distanceSq(target.x, target.y, tower.x, tower.y) <= rangeSq) {
        if (this.gameTime - tower.lastFired >= effectiveCooldown) {
          let baseDmg = tower.damage;
          if (tower.type === 'cannon') {
             baseDmg = (tower.minDamage || 0) + Math.random() * ((tower.maxDamage || 0) - (tower.minDamage || 0));
          }
          let finalDamage = Math.floor((baseDmg + flatDamageBonus) * damageMultiplier);
          
          if (tower.type === 'wizard' && tower.mageMode === 'elemental' && target.weakness === tower.element) {
            finalDamage = Math.floor(finalDamage * 1.5);
          }

          tower.lastFired = this.gameTime;

          // Add recoil
          const angle = Math.atan2(target.y - tower.y, target.x - tower.x);
          tower.recoil = 12;
          tower.recoilAngle = angle + Math.PI;

          if (tower.type === 'cannon') {
            // Multicannon fires at multiple targets in range
            const targets = this.enemies
              .filter(e => distance(e.x, e.y, tower.x, tower.y) <= effectiveRange)
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
                const spell = tower.supportSpell || (rand < 0.5 ? 'curse' : 'enfeeble');
                if (spell === 'curse') {
                   this.playSound('spell_curse');
                   this.damageEnemy(target, 15 + (tower.level * 10));
                   this.particles.push({ x: target.x, y: target.y, life: 0.5, color: '#ff0000' });
                } else if (spell === 'enfeeble') {
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
             this.awardPlayerXP('magic', finalDamage * 0.1, tower.x, tower.y);
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
             else if (tower.element === 'earth') pSpecial = 'stun';
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
          if (p.special === 'aoe' || p.special === 'aoe_slow') {
             const radius = 80;
             this.enemies.forEach(e => {
                if (distance(e.x, e.y, p.x, p.y) <= radius) {
                   this.damageEnemy(e, p.damage, p.sourceTowerId);
                   if (p.special === 'aoe_slow') this.applySlow(e);
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

          // Add magic sparks
          if (p.type === 'spell' || p.type.startsWith('ancient_')) {
            if (Math.random() < 0.3) {
              this.particles.push({
                x: p.x + (Math.random() - 0.5) * 10,
                y: p.y + (Math.random() - 0.5) * 10,
                life: 0.3,
                color: p.color
              });
            }
          }
       }
    }
  }

  /** Spawn a collectable item loot at an enemy's position (with a small scatter). */
  spawnItemLoot(enemy: Enemy, data: LootDrop) {
    this.loots.push({
      id: Math.random().toString(),
      x: enemy.x + (Math.random() - 0.5) * 20,
      y: enemy.y + (Math.random() - 0.5) * 20,
      type: 'item',
      data,
      life: 15,
      size: 25,
    });
  }

  damageEnemy(enemy: Enemy, damage: number, sourceTowerId?: string, isDot = false) {
    let damageMultiplier = 1.0;
    
    // Slayer Helmet Buff (15% damage vs task)
    if (this.slayerHelmet && this.slayerTask && enemy.type === this.slayerTask.type) {
        damageMultiplier *= 1.15;
    }
    
    const tower = sourceTowerId ? this.towers.find(t => t.id === sourceTowerId) : null;
    let type: HitsplatType = isDot ? 'poison' : (tower?.type === 'wizard' ? 'magic' : (tower?.type === 'archer' ? 'ranged' : 'melee'));
    
    if (enemy.magicResistDrainTimer && enemy.magicResistDrainTimer > 0 && type === 'magic') {
        damageMultiplier = 1.15;
    }
    const actualDamage = Math.max(0, Math.floor(damage * damageMultiplier));
    enemy.hp -= actualDamage;
    if (!isDot) this.playSound('hit');

    // Enemy shake for powerful hits
    if (actualDamage > 100) {
      enemy.shakeX = (Math.random() - 0.5) * 10;
      enemy.shakeY = (Math.random() - 0.5) * 10;
    }
    
    // Create hitsplat
    if (actualDamage === 0) {
      type = 'miss';
    }
    
    this.hitsplats.push({
      x: enemy.x + (Math.random() - 0.5) * 20,
      y: enemy.y - 20,
      damage: actualDamage,
      type: type,
      life: 1.0,
      velocityY: -100,
      velocityX: (Math.random() - 0.5) * 50
    });
    
    // Create damage number (for text only)
    this.damageNumbers.push({
      x: enemy.x + (Math.random() - 0.5) * 20,
      y: enemy.y - 20,
      text: actualDamage > 0 ? actualDamage.toString() : '0',
      life: 1.0,
      color: '#ffffff', // Text color will be white, hitsplat image will provide the color
      velocityY: -100,
      velocityX: (Math.random() - 0.5) * 50
    });
    
    // Award XP to tower
    if (sourceTowerId) {
      const tower = this.towers.find(t => t.id === sourceTowerId);
      if (tower) {
        this.awardTowerXP(tower, actualDamage);
      }
    }
    
    // Add hit particles
    const particleCount = isDot ? 2 : (actualDamage > 100 ? 12 : (actualDamage > 50 ? 6 : 3));
    for (let i = 0; i < particleCount; i++) {
      this.particles.push({
        x: enemy.x + (Math.random() - 0.5) * 20,
        y: enemy.y + (Math.random() - 0.5) * 20,
        life: 0.5,
        color: isDot ? '#ff6600' : (actualDamage > 100 ? '#ff0000' : (actualDamage > 50 ? '#ff4444' : '#ffffff'))
      });
    }

    if (enemy.hp <= 0) {
      const index = this.enemies.indexOf(enemy);
      if (index > -1) {
        const deathSound = enemy.deathSound || 'kill';
        this.playSound(deathSound);
        
        // Death particles - more dramatic
        const isBoss = enemy.type === 'vorkath' || enemy.type === 'zulrah' || enemy.type === 'jad';
        const deathParticleCount = isBoss ? 50 : 20;
        for (let i = 0; i < deathParticleCount; i++) {
          this.particles.push({
            x: enemy.x,
            y: enemy.y,
            life: isBoss ? 1.2 : 0.8,
            color: enemy.color
          });
        }

        if (isBoss) this.shakeAmount = 15;

        this.enemies.splice(index, 1);
        
        this.deathAnimations.push({
          x: enemy.x,
          y: enemy.y,
          type: 'bones_loot',
          life: 1.0,
          loot: [
            {
              x: enemy.x + (Math.random() - 0.5) * 15,
              y: enemy.y + (Math.random() - 0.5) * 15,
              type: 'bones',
              id: this.getBoneType(enemy.type) || 'bones',
              life: 30,
              size: 18
            }
          ]
        });
        
        // Update Quests
        this.updateQuests('kill', 1, enemy.type);
        
        // Monster Loot: Bones always drop; GP/Essence occasionally
        if (Math.random() < 0.2) {
          const lootType = Math.random() > 0.95 ? 'essence' : 'money';
          this.deathAnimations[this.deathAnimations.length - 1].loot!.push({
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
        if (this.pohUpgrades.includes('oak_table')) gpReward = Math.floor(gpReward * 1.1);
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

        // Item / resource drops (weapon, runes, seeds, farming & construction supplies)
        const itemDrops = rollItemDrops({
          wave: this.wave,
          hasTeakShelves: this.pohUpgrades.includes('teak_shelves'),
        });
        for (const drop of itemDrops) this.spawnItemLoot(enemy, drop);

        // Pet Drop
        let dropChance = isBoss ? 0.5 : 0.01;
        if (this.pets.some(p => p.name === 'Baby Mole')) dropChance *= 1.5;

        if (Math.random() < dropChance) {
          const petEntry = PET_DROP_TABLE[enemy.type];
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
            this.consecutiveTasks++;
            this.slayerPoints += 10 + Math.floor(this.consecutiveTasks * 2);
            this.addMessage(`Slayer task complete! Reward: ${this.slayerTask.reward} GP and ${10 + Math.floor(this.consecutiveTasks * 2)} Slayer Points.`);
            this.playSound('quest_complete');
            this.slayerTask = null;
            
            // Check achievements
            const ach = this.achievements.find(a => a.id === 'slayer_master');
            if (ach && this.consecutiveTasks >= 5) ach.completed = true;
          }
        }

        this.onStateChange({ 
          money: this.money, 
          runeEssence: this.runeEssence, 
          pets: this.pets, 
          achievements: this.achievements,
          slayerTask: this.slayerTask,
          slayerPoints: this.slayerPoints,
          consecutiveTasks: this.consecutiveTasks,
          remainingEnemies: this.enemiesToSpawn.length + this.enemies.length
        });
      }
    }
  }

  handleBossMechanics(dt: number) {
    const boss = this.enemies.find(e => e.isBoss);
    if (!boss) {
      this.acidPools = [];
      this.zombifiedSpawn = null;
      return;
    }

    this.bossTimer += dt;

    // Vorkath Mechanics
    if (boss.type === 'vorkath') {
      // Acid Phase every 15 seconds
      if (crossedInterval(this.bossTimer, dt, 15)) {
        this.addMessage("Vorkath is using his Acid Phase!");
        for (let i = 0; i < 5; i++) {
          const randomPathIndex = Math.floor(Math.random() * this.path.length);
          this.acidPools.push({
            x: this.path[randomPathIndex].x,
            y: this.path[randomPathIndex].y,
            radius: 40,
            duration: 5
          });
        }
      }

      // Zombified Spawn every 25 seconds
      if (crossedInterval(this.bossTimer, dt, 25)) {
        if (this.towers.length > 0) {
          const strongestTower = [...this.towers].sort((a, b) => b.damage - a.damage)[0];
          this.addMessage("Vorkath summoned a Zombified Spawn! Kill it before it reaches your tower!");
          strongestTower.disabledTimer = 10;
          this.zombifiedSpawn = {
            x: boss.x,
            y: boss.y,
            hp: 30,
            id: Math.random().toString(36).substr(2, 9),
            targetTowerId: strongestTower.id
          };
        }
      }
    }

    // Zulrah Mechanics
    if (boss.type === 'zulrah') {
      // Phase shift every 10 seconds
      if (crossedInterval(this.bossTimer, dt, 10)) {
        const phases: ('serpentine' | 'magma' | 'tanzanite')[] = ['serpentine', 'magma', 'tanzanite'];
        this.zulrahPhase = phases[Math.floor(Math.random() * phases.length)];
        this.addMessage(`Zulrah shifted to ${this.zulrahPhase} phase!`);
        
        if (this.zulrahPhase === 'serpentine') {
          boss.color = '#32cd32';
          boss.resistance = 0.4;
        } else if (this.zulrahPhase === 'magma') {
          boss.color = '#ff4500';
          boss.resistance = 0.7; // Melee phase, high defense
        } else if (this.zulrahPhase === 'tanzanite') {
          boss.color = '#00ffff';
          boss.resistance = 0.2; // Ranged phase, low defense
        }
      }
    }

    // Jad Mechanics
    if (boss.type === 'jad') {
      // Style switch every 5 seconds
      if (crossedInterval(this.bossTimer, dt, 5)) {
        this.jadStyle = Math.random() < 0.5 ? 'magic' : 'ranged';
        this.addMessage(`Jad is using ${this.jadStyle}!`);
        boss.color = this.jadStyle === 'magic' ? '#0000ff' : '#00ff00';
      }
    }

    // Update Acid Pools
    for (let i = this.acidPools.length - 1; i >= 0; i--) {
      this.acidPools[i].duration -= dt;
      if (this.acidPools[i].duration <= 0) {
        this.acidPools.splice(i, 1);
      }
    }

    // Update Zombified Spawn
    if (this.zombifiedSpawn) {
      const targetTower = this.towers.find(t => t.id === this.zombifiedSpawn!.targetTowerId);
      if (targetTower) {
        const dx = targetTower.x - this.zombifiedSpawn.x;
        const dy = targetTower.y - this.zombifiedSpawn.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 5) {
          this.addMessage("The Zombified Spawn reached your tower! It's frozen for longer!");
          targetTower.disabledTimer = 15;
          this.zombifiedSpawn = null;
        } else {
          this.zombifiedSpawn.x += (dx / dist) * 100 * dt;
          this.zombifiedSpawn.y += (dy / dist) * 100 * dt;
        }
      } else {
        this.zombifiedSpawn = null;
      }
    }
  }

  awardPlayerXP(skillKey: keyof PlayerSkills, amount: number, x?: number, y?: number) {
    const skill = this.playerSkills[skillKey];
    const result = applyXpGain(skill, amount, playerXpForLevel);
    skill.level = result.level;
    skill.xp = result.xp;
    if (result.leveledUp) {
      this.playSound('upgrade');
      this.addMessage(`Congratulations, you just advanced your ${skillKey.charAt(0).toUpperCase() + skillKey.slice(1)} level to ${skill.level}!`);
      this.initNodes(); // Refresh nodes
      this.floatingTexts.push({
        x: x ?? this.LOGIC_WIDTH / 2,
        y: y ?? this.LOGIC_HEIGHT / 2,
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

    // Floating text for XP gain
    this.floatingTexts.push({
      x: tower.x,
      y: tower.y - 20,
      text: `+${Math.floor(xpGain)} XP`,
      life: 1.5,
      color: '#00ff00',
      icon: `${skillKey}_icon`
    });

    const result = applyXpGain(skill, xpGain, towerXpForLevel);
    skill.level = result.level;
    skill.xp = result.xp;
    if (result.leveledUp) {
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
            changed = true;
          }
        } else {
          quest.objective.current = amount;
          changed = true;
        }

        if (quest.objective.current >= quest.objective.target) {
          quest.objective.current = quest.objective.target;
          quest.completed = true;
          this.playSound('level_up');
          this.addMessage("Task Complete!");
        }
      }
    });
    if (changed) this.onStateChange({ quests: [...this.quests] });
  }

  claimQuestReward(questId: string) {
    const quest = this.quests.find(q => q.id === questId);
    if (quest && quest.completed && !quest.claimed) {
      quest.claimed = true;
      if (quest.reward.money) this.money += quest.reward.money;
      if (quest.reward.essence) this.runeEssence += quest.reward.essence;
      if (quest.reward.item) this.addItemToInventory(quest.reward.item);
      
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
          const nearby = this.enemies.find(e => e.id !== primaryTarget.id && distance(e.x, e.y, primaryTarget.x, primaryTarget.y) < 40);
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

  buyItem(item: any) {
    if (this.money >= item.cost) {
      this.money -= item.cost;
      const baseItem = ITEMS[item.id];
      this.addItemToInventory({
        id: item.id,
        name: item.name,
        description: item.desc,
        type: item.type,
        sellPrice: Math.floor(item.cost * 0.5),
        bonus: {},
        seedType: baseItem?.seedType
      });
      this.playSound('inventory_move');
      this.addMessage(`You bought ${item.name}!`);
      this.onStateChange({ money: this.money, inventory: this.inventory });
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
    this.money = 60 + this.upgrades.startingMoney;
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
      farming: { level: 1, xp: 0 },
      magic: { level: 1, xp: 0 },
      construction: { level: 1, xp: 0 }
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

    // Check level requirement
    const skillKey = node.type === 'tree' ? 'woodcutting' : (node.type === 'ore' ? 'mining' : 'farming');
    if (this.playerSkills[skillKey].level < node.level) {
      this.addMessage(`You need a ${skillKey} level of ${node.level} to interact with this.`);
      return;
    }

    if (node.type === 'tree') {
      this.awardPlayerXP('woodcutting', node.xp, node.x, node.y);
      const logName = node.name === 'Tree' ? 'Logs' : node.name.replace(' Tree', ' Logs');
      this.addItemToInventory({ id: Math.random().toString(), name: logName, type: 'material', description: `Logs from a ${node.name}.`, sellPrice: 5 + node.level, bonus: {} });
      this.addMessage(`You chop some ${logName}.`);
      this.playSound('woodcut');
    } else if (node.type === 'ore') {
      this.awardPlayerXP('mining', node.xp, node.x, node.y);
      const oreName = node.name.replace(' Rock', ' Ore');
      this.addItemToInventory({ id: Math.random().toString(), name: oreName, description: `Ore from a ${node.name}.`, bonus: {}, type: 'material', sellPrice: 10 + node.level });
      this.addMessage(`You mine some ${oreName}.`);
      this.playSound('mine');
    } else if (node.type === 'herb') {
      this.awardPlayerXP('farming', node.xp, node.x, node.y);
      const herbName = node.name.includes('Leaf') || node.name.includes('Weed') ? `Grimy ${node.name}` : `Grimy ${node.name}`;
      this.addItemToInventory({ id: Math.random().toString(), name: herbName, type: 'herb', description: `A dirty ${node.name}.`, sellPrice: 15 + node.level, bonus: {} });
      this.addMessage(`You pick a ${herbName}.`);
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

  useItem(itemId: string, towerId?: string) {
    const itemIndex = this.inventory.findIndex(i => i.id === itemId);
    if (itemIndex === -1) return;

    const item = this.inventory[itemIndex];

    if (item.type === 'bone') {
      this.buryBone(itemIndex);
      return;
    }

    if (item.type === 'potion') {
      // Handle potion drinking
      const potionType = item.id.replace('_(3)', '').replace('_(2)', '').replace('_(1)', '').split('_').slice(0, -1).join('_') || item.id;
      // Extract base potion name, e.g., 'attack_potion' from 'attack_potion_12345'
      const baseType = item.name.toLowerCase().replace(' (3)', '').replace('(3)', '').replace(' ', '_');
      
      this.playSound('potion_drink');
      
      if (baseType === 'prayer_potion' || baseType === 'super_restore') {
        const restoreAmount = baseType === 'super_restore' ? 20 : 10;
        this.prayerPoints = Math.min(this.maxPrayerPoints, this.prayerPoints + restoreAmount);
        this.addMessage(`You drank a ${item.name}!`);
      } else if (baseType === 'saradomin_brew') {
        this.lives = Math.min(100, this.lives + 5);
        this.addMessage(`You drank a ${item.name} and restored 5 HP!`);
      } else {
        const existing = this.activePotions.find(p => p.type === baseType);
        if (existing) {
          existing.timer += 60;
        } else {
          this.activePotions.push({ type: baseType as ActivePotion['type'], timer: 60 });
        }
        this.addMessage(`You drank a ${item.name}!`);
      }
      
      this.inventory.splice(itemIndex, 1);
      this.onStateChange({ 
        inventory: this.inventory,
        activePotions: this.activePotions,
        prayerPoints: this.prayerPoints,
        lives: this.lives
      });
      return;
    }

    if (!towerId) {
      this.addMessage("Select a tower first to equip this item.");
      return;
    }

    const tower = this.towers.find(t => t.id === towerId);
    if (!tower) return;

    if (item.type !== 'ammo' && item.type !== 'jewellery') {
      this.addMessage("You can't equip this item.");
      return;
    }

    const currentItem = tower.equipment[item.type];
    if (currentItem) {
      this.addItemToInventory(currentItem);
    }

    tower.equipment[item.type] = item;
    this.inventory.splice(itemIndex, 1);

    this.playSound('upgrade');
    this.onStateChange({ inventory: this.inventory });
  }

  addItemToInventory(item: Item, quantity: number = 1) {
    const isStackable = item.stackable || item.type === 'material' || item.type === 'seed' || item.type === 'herb' || item.id.includes('rune');
    
    if (isStackable) {
      const existing = this.inventory.find(i => i.id === item.id);
      if (existing) {
        existing.quantity = (existing.quantity || 1) + quantity;
        this.onStateChange({ inventory: [...this.inventory] });
        return;
      }
    }

    const newItem = { ...item, quantity, stackable: isStackable };
    if (!isStackable) {
      newItem.id = `${item.id}_${Math.random().toString(36).substr(2, 9)}`;
    }
    
    this.inventory.push(newItem);
    this.onStateChange({ inventory: [...this.inventory] });
  }

  getBoneType(enemyType: string): string | null {
    if (['goblin', 'rat', 'cow', 'imp', 'spider', 'skeleton', 'zombie', 'ghost'].includes(enemyType)) return 'bones';
    if (['hellhound', 'scorpion', 'fire_giant', 'hill_giant', 'black_demon', 'gargoyle', 'lesser_demon', 'dark_beast', 'barrow_wight', 'chaos_druid', 'skeletal_mage'].includes(enemyType)) return 'big_bones';
    if (['blue_dragon', 'green_dragon', 'jad', 'vorkath', 'zulrah', 'hydra'].includes(enemyType)) return 'dragon_bones';
    return null;
  }

  buryBone(itemIndex: number) {
    const item = this.inventory[itemIndex];
    if (!item || item.type !== 'bone') return;

    const xp = item.bonus.xpBonus || 15;
    this.awardPlayerXP('prayer', xp);
    this.playSound('bury_bones');
    this.addMessage(`You bury the ${item.name} and gain ${xp} Prayer XP.`);

    if (item.quantity && item.quantity > 1) {
      item.quantity--;
    } else {
      this.inventory.splice(itemIndex, 1);
    }

    this.onStateChange({ inventory: [...this.inventory] });
  }
  restartGame() {
    this.gameOver = false;
    this.isPaused = false;
    this.resetGame();
    this.onStateChange({ 
      gameOver: false, 
      lives: this.lives, 
      money: this.money, 
      wave: this.wave,
      isPlaying: false,
      towers: [],
      enemies: []
    });
  }

  resetGame() {
    // Full game reset — preserves runeEssence and upgrades only
    this.lives = 20;
    this.money = 60 + this.upgrades.startingMoney;
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
      farming: { level: 1, xp: 0 },
      magic: { level: 1, xp: 0 },
      construction: { level: 1, xp: 0 }
    };
    this.assignSlayerTask();
    this.farming.init();
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

  draw() {
    this.renderer.draw();
  }
}
