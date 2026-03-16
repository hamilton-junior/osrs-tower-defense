

import { ASSETS } from './assets';
import * as Types from './types';
import { PRAYERS } from './data/prayers';
import { ACHIEVEMENTS } from './data/achievements';
import { QUESTS } from './data/quests';
import { ENEMIES } from './data/enemies';
import { TOWERS } from './data/towers';
import { ITEMS, ITEM_PROGRESSIONS } from './data/items';
import { LANDMARK_WAVES } from './data/waves';
import { NODE_CONFIGS } from './data/nodes';
import { TICK, ARCHER_STATS, SPELL_MAX_HITS, WIZARD_SPELL_TIERS, ANCIENT_HITS, ANCIENT_TIERS, UTILITY_TIERS } from './data/tower-stats';

// Re-export types for backward compatibility if needed, or just import from Types
export type Point = Types.Point;
export type GlobalUpgrades = Types.GlobalUpgrades;
export type PrayerType = Types.PrayerType;
export type ActivePotion = Types.ActivePotion;
export type Pet = Types.Pet;
export type Achievement = Types.Achievement;
export type EnemyType = Types.EnemyType;
export type Element = Types.Element;
export type Enemy = Types.Enemy;
export type TowerType = Types.TowerType;
export type MageMode = Types.MageMode;
export type AncientType = Types.AncientType;
export type SupportSpell = Types.SupportSpell;
export type TowerSkill = Types.TowerSkill;
export type TowerSkills = Types.TowerSkills;
export type PlayerSkills = Types.PlayerSkills;
export type GatheringNode = Types.GatheringNode;
export type Item = Types.Item;
export type Region = Types.Region;
export type TargetingPriority = Types.TargetingPriority;
export type Tower = Types.Tower;
export type Projectile = Types.Projectile;
export type SlayerTask = Types.SlayerTask;
export type Quest = Types.Quest;
export type FarmingPatch = Types.FarmingPatch;

// OSRS Game Tick is imported from data/tower-stats.ts

export class GameEngine {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  onStateChange: (state: any) => void;
  
  animationId: number = 0;
  lastTime: number = 0;
  prevWidth: number = 0;
  prevHeight: number = 0;

  gameSpeed: number = 1;
  gameTime: number = 0;
  maxDt: number = 0.1;
  isPaused: boolean = false;
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
  
  achievements: Achievement[] = JSON.parse(JSON.stringify(ACHIEVEMENTS));
  quests: Quest[] = JSON.parse(JSON.stringify(QUESTS));
  allPrayers = PRAYERS;

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

  inventory: Item[] = [];
  
  shakeAmount: number = 0;
  jadAttackTimer: number = 0;
  jadAttackType: 'mage' | 'range' | null = null;
  path: Point[] = [];
  currentPathIndex: number = 0; 
  enemiesToSpawn: Enemy[] = [];
  spawnTimer: number = 0;
  spawnInterval: number = 1000; 

  achievementPoints: number = 0;
  slayerTask: SlayerTask | null = null;
  lastTaskType: EnemyType | null = null;
  consecutiveTasks: number = 0;

  audioCtx: AudioContext | null = null;
  soundCache: Map<string, HTMLAudioElement> = new Map();
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
    const available = Object.values(ENEMIES).filter(e => 
      e.waveUnlock !== undefined && 
      e.waveUnlock <= this.wave && 
      e.type !== this.lastTaskType &&
      !e.isBoss
    );
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

    const hpScale = 1 + (waveMultiplier - 1) * 0.35;
    const speedScale = 1 + (waveMultiplier - 1) * 0.015;
    const rewardScale = 1 + (waveMultiplier - 1) * 0.2;
    const effectiveHp = Math.floor(enemyDef.hp * hpScale);
    const effectiveSpeed = Math.floor(enemyDef.speed * speedScale);
    const effectiveReward = Math.floor(enemyDef.reward * rewardScale);

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
    const waveConfigs: { type: EnemyType, count: number }[] = [];
    
    // Landmark waves
    if (LANDMARK_WAVES[waveNum]) {
      waveConfigs.push(...LANDMARK_WAVES[waveNum]);
    } else {
      // Dynamic procedural wave generator
      const budget = waveNum * 20;
      let remainingBudget = budget;
      
      // Filter enemies that can spawn at this wave level
      const spawnableEnemies = Object.values(ENEMIES).filter(e => !e.isBoss);
      
      while (remainingBudget > 5) {
        const affordable = spawnableEnemies.filter(e => e.reward <= remainingBudget);
        if (affordable.length === 0) {
           waveConfigs.push({ type: 'rat', count: 1 });
           remainingBudget -= 5;
           continue;
        }
        const choice = affordable[Math.floor(Math.random() * affordable.length)];
        waveConfigs.push({ type: choice.type, count: 1 });
        remainingBudget -= choice.reward;
      }
    }

    if (this.path.length === 0) return enemies;

    for (const config of waveConfigs) {
      for (let i = 0; i < config.count; i++) {
        const baseStats = this.getEnemyStats(config.type, waveNum);
        enemies.push({
          id: Math.random().toString(36).substr(2, 9),
          x: this.path[0].x,
          y: this.path[0].y,
          pathIndex: 0,
          slowTimer: 0,
          stunTimer: 0,
          tauntTimer: 0,
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
            weapon: null,
            shield: null,
            accessory: null
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
    // Add floating text for level up
    this.floatingTexts.push({
      x: tower.x,
      y: tower.y - 20,
      text: `Level Up!`,
      life: 2.0,
      color: '#ffff00',
      icon: tower.type === 'wizard' ? 'Magic' : tower.type === 'archer' ? 'Ranged' : 'Strength'
    });

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
          tower.special = 'slow';
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

  collectLootAt(x: number, y: number, hoverPickup: boolean = false): boolean {
    const radius = hoverPickup ? 20 : 30;
    const lootIndex = this.loots.findIndex(l => Math.sqrt(Math.pow(l.x-x,2)+Math.pow(l.y-y,2)) < radius);
    if (lootIndex === -1) return false;

    const loot = this.loots[lootIndex];
    // In hover mode, only pick up bones
    if (hoverPickup && loot.type !== 'bones') return false;

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

    NODE_CONFIGS.forEach(config => {
      const x = config.x * w;
      const y = config.y * h;
      
      // Only add if not on path
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
    });
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
    if (this.waveActive) {
      for (let i = this.activePotions.length - 1; i >= 0; i--) {
        const p = this.activePotions[i];
        p.timer -= dt;
        if (p.timer <= 0) {
          this.activePotions.splice(i, 1);
        }
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
    if (this.waveActive && this.activePrayers.size > 0 && this.prayerPoints > 0) {
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
            green_dragon: { name: 'Prince Black Dragon', type: 'prince_black_dragon', bonus: 'Dragon Blood: +8% DMG vs Dragons' },
            blue_dragon: { name: 'Prince Black Dragon', type: 'prince_black_dragon', bonus: 'Dragon Blood: +8% DMG vs Dragons' },
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
      this.inventory.push({ id: Math.random().toString(), name: 'Copper Ore', description: 'Used in smithing.', bonus: {}, type: 'material', sellPrice: 10 });
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
        this.ctx.shadowColor = '#000';
        this.ctx.shadowBlur = 4;
        this.ctx.shadowOffsetX = 1;
        this.ctx.shadowOffsetY = 1;

        if (ft.text.includes('XP')) {
            this.ctx.font = `bold 11px 'RuneScape', Arial`;
            this.ctx.textAlign = 'left';
            const textWidth = this.ctx.measureText(ft.text).width;
            
            if (ft.icon) {
              const iconImg = this.imageCache.get(ft.icon.toLowerCase());
              if (iconImg && iconImg.complete && iconImg.naturalWidth > 0) {
                this.ctx.drawImage(iconImg, ft.x - textWidth/2 - 12, ft.y - 10, 10, 10);
              }
            }
            this.ctx.fillText(ft.text, ft.x - textWidth/2 + 2, ft.y);
        } else {
            this.ctx.font = `bold 16px 'RuneScape', Arial`;
            this.ctx.textAlign = 'center';
            this.ctx.fillText(ft.text, ft.x, ft.y);
            
            if (ft.icon) {
              const iconImg = this.imageCache.get(ft.icon.toLowerCase());
              if (iconImg && iconImg.complete && iconImg.naturalWidth > 0) {
                this.ctx.drawImage(iconImg, ft.x - 10, ft.y - 35, 20, 20);
              }
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
