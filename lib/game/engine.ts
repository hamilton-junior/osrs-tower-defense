
export interface Point {
  x: number;
  y: number;
}

export interface GlobalUpgrades {
  archerRange: number; // multiplier, e.g. 1.0
  magicDamage: number;
  cannonSpeed: number;
  slayerReward: number;
  prayerEfficiency: number;
  startingMoney: number;
  rewardMultiplier: number;
  waveSpeed: number;
}

export type PrayerType = 'thick_skin' | 'burst_of_strength' | 'clarity_of_thought' | 'sharp_eye' | 'mystic_will' | 'piety' | 'rigour' | 'augury';

export interface ActivePotion {
  type: 'overload' | 'super_restore' | 'prayer_potion';
  timer: number;
}

export interface Pet {
  id: string;
  name: string;
  type: string;
  bonus: string;
}

export interface Achievement {
  id: string;
  name: string;
  description: string;
  completed: boolean;
}

export type EnemyType = 'goblin' | 'rat' | 'cow' | 'imp' | 'spider' | 'scorpion' | 'hill_giant' | 'lesser_demon' | 'green_dragon' | 'jad' | 'blue_dragon' | 'black_demon' | 'abyssal_demon' | 'barrow_wight' | 'chaos_druid' | 'skeletal_mage' | 'vorkath' | 'zulrah' | 'skeleton' | 'zombie' | 'ghost' | 'hellhound' | 'fire_giant' | 'bloodveld' | 'gargoyle' | 'nechryael' | 'dark_beast' | 'hydra';

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
}

export type TowerType = 'archer' | 'wizard' | 'cannon' | 'tzhaar' | 'slayer' | 'support';

export interface TowerSkill {
  level: number;
  xp: number;
}

export interface TowerSkills {
  attack: TowerSkill;
  strength: TowerSkill;
  defense: TowerSkill;
  ranged: TowerSkill;
  magic: TowerSkill;
}

export interface Item {
  id: string;
  name: string;
  description: string;
  bonus: {
    damage?: number;
    range?: number;
    cooldown?: number;
    defense?: number;
  };
  type: 'weapon' | 'shield' | 'accessory';
}

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
  name: string;
  upgradeCost: number;
  special?: 'slow' | 'aoe' | 'rapid' | 'stun';
  visualRadius: number;
  disabledTimer: number;
  skills: TowerSkills;
  equipment: {
    weapon: Item | null;
    shield: Item | null;
    accessory: Item | null;
  };
}

export interface Projectile {
  id: string;
  x: number;
  y: number;
  targetId: string;
  speed: number;
  damage: number;
  color: string;
  special?: 'slow' | 'aoe' | 'stun';
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
  
  // Game State
  money: number = 150; // Increased starting money
  lives: number = 20;
  wave: number = 1;
  waveActive: boolean = false;
  runeEssence: number = 0;
  
  // Prayer System
  prayerPoints: number = 10;
  maxPrayerPoints: number = 10;
  activePrayers: Set<PrayerType> = new Set();
  prayerDrainTimer: number = 0;

  // Special Attack
  specialAttackCharge: number = 0;
  maxSpecialAttack: number = 100;

  // Potions
  activePotions: ActivePotion[] = [];

  // Pets & Achievements
  pets: Pet[] = [];
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
  
  // Items & Quests
  inventory: Item[] = [];
  quests: Quest[] = [
    {
      id: 'cooks_assistant',
      name: "Cook's Assistant",
      description: 'Kill 20 Goblins for the cook.',
      objective: { type: 'kill', target: 20, current: 0, enemyType: 'goblin' },
      reward: { money: 100, essence: 5 },
      completed: false,
      claimed: false
    },
    {
      id: 'dragon_slayer',
      name: 'Dragon Slayer',
      description: 'Defeat 5 Green Dragons.',
      objective: { type: 'kill', target: 5, current: 0, enemyType: 'green_dragon' },
      reward: { money: 500, essence: 20 },
      completed: false,
      claimed: false
    },
    {
      id: 'wave_master',
      name: 'Wave Master',
      description: 'Reach Wave 10.',
      objective: { type: 'wave', target: 10, current: 0 },
      reward: { money: 300, essence: 10 },
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
    magicDamage: 1.0,
    cannonSpeed: 1.0,
    slayerReward: 1.0,
    prayerEfficiency: 1.0,
    startingMoney: 0,
    rewardMultiplier: 1.0,
    waveSpeed: 1.0
  };

  constructor(canvas: HTMLCanvasElement, onStateChange: (state: any) => void, initialEssence: number = 0, upgrades?: Partial<GlobalUpgrades>) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.onStateChange = onStateChange;
    this.runeEssence = initialEssence;
    
    if (upgrades) {
      this.upgrades = { ...this.upgrades, ...upgrades };
    }

    // Apply starting money upgrade
    this.money = 150 + this.upgrades.startingMoney;
    
    // Set default size immediately
    this.canvas.width = 800;
    this.canvas.height = 600;

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

    this.resize();
    window.addEventListener('resize', () => this.resize());
    
    this.initPath();
    this.assignSlayerTask();
  }

  preloadSounds() {
    const soundUrls = {
      shoot_archer: 'https://oldschool.runescape.wiki/images/Shortbow_attack.ogg',
      shoot_wizard: 'https://oldschool.runescape.wiki/images/Wind_Strike_cast.ogg',
      shoot_cannon: 'https://oldschool.runescape.wiki/images/Dwarf_multicannon_fire.ogg',
      shoot_tzhaar: 'https://oldschool.runescape.wiki/images/TzHaar-Ket_attack.ogg',
      shoot_slayer: 'https://oldschool.runescape.wiki/images/Slayer_staff_cast.ogg',
      shoot_support: 'https://oldschool.runescape.wiki/images/Heal_Other_cast.ogg',
      hit: 'https://oldschool.runescape.wiki/images/Melee_hit_sound.ogg',
      kill: 'https://oldschool.runescape.wiki/images/Death_sound.ogg',
      wave: 'https://oldschool.runescape.wiki/images/Teleport_sound.ogg',
      upgrade: 'https://oldschool.runescape.wiki/images/Level_up_sound.ogg',
      sell: 'https://oldschool.runescape.wiki/images/Coins_drop_sound.ogg',
      boss_attack: 'https://oldschool.runescape.wiki/images/Vorkath_attack_sound.ogg',
      prayer_on: 'https://oldschool.runescape.wiki/images/Prayer_on.ogg',
      prayer_off: 'https://oldschool.runescape.wiki/images/Prayer_off.ogg',
      potion: 'https://oldschool.runescape.wiki/images/Drink_potion.ogg',
      special_attack: 'https://oldschool.runescape.wiki/images/Special_attack_sound.ogg',
      death_dragon: 'https://oldschool.runescape.wiki/images/Dragon_death.ogg',
      death_demon: 'https://oldschool.runescape.wiki/images/Demon_death.ogg',
      death_boss: 'https://oldschool.runescape.wiki/images/Boss_death.ogg'
    };

    Object.entries(soundUrls).forEach(([key, url]) => {
      const audio = new Audio(url);
      audio.preload = 'auto';
      audio.volume = 0.3;
      this.soundCache.set(key, audio);
    });
  }

  preloadImages() {
    const imageUrls: Record<string, string> = {
      // Enemies
      goblin: 'https://oldschool.runescape.wiki/images/Goblin.png',
      rat: 'https://oldschool.runescape.wiki/images/Giant_rat.png',
      cow: 'https://oldschool.runescape.wiki/images/Cow.png',
      imp: 'https://oldschool.runescape.wiki/images/Imp.png',
      spider: 'https://oldschool.runescape.wiki/images/Giant_spider.png',
      scorpion: 'https://oldschool.runescape.wiki/images/Scorpion.png',
      hill_giant: 'https://oldschool.runescape.wiki/images/Hill_giant.png',
      lesser_demon: 'https://oldschool.runescape.wiki/images/Lesser_demon.png',
      green_dragon: 'https://oldschool.runescape.wiki/images/Green_dragon.png',
      blue_dragon: 'https://oldschool.runescape.wiki/images/Blue_dragon.png',
      black_demon: 'https://oldschool.runescape.wiki/images/Black_demon.png',
      abyssal_demon: 'https://oldschool.runescape.wiki/images/Abyssal_demon.png',
      jad: 'https://oldschool.runescape.wiki/images/TzTok-Jad.png',
      barrow_wight: 'https://oldschool.runescape.wiki/images/Dharok_the_Wretched.png',
      chaos_druid: 'https://oldschool.runescape.wiki/images/Chaos_druid.png',
      skeletal_mage: 'https://oldschool.runescape.wiki/images/Skeletal_mage.png',
      skeleton: 'https://oldschool.runescape.wiki/images/Skeleton.png',
      zombie: 'https://oldschool.runescape.wiki/images/Zombie.png',
      ghost: 'https://oldschool.runescape.wiki/images/Ghost.png',
      hellhound: 'https://oldschool.runescape.wiki/images/Hellhound.png',
      fire_giant: 'https://oldschool.runescape.wiki/images/Fire_giant.png',
      bloodveld: 'https://oldschool.runescape.wiki/images/Bloodveld.png',
      gargoyle: 'https://oldschool.runescape.wiki/images/Gargoyle.png',
      nechryael: 'https://oldschool.runescape.wiki/images/Nechryael.png',
      dark_beast: 'https://oldschool.runescape.wiki/images/Dark_beast.png',
      hydra: 'https://oldschool.runescape.wiki/images/Hydra.png',
      // Towers
      archer_1: 'https://oldschool.runescape.wiki/images/Shortbow.png',
      archer_2: 'https://oldschool.runescape.wiki/images/Magic_shortbow.png',
      archer_3: 'https://oldschool.runescape.wiki/images/Crystal_bow.png',
      archer_4: 'https://oldschool.runescape.wiki/images/Bow_of_faerdhinen.png',
      
      wizard_1: 'https://oldschool.runescape.wiki/images/Staff_of_air.png',
      wizard_2: 'https://oldschool.runescape.wiki/images/Staff_of_water.png',
      wizard_3: 'https://oldschool.runescape.wiki/images/Ancient_staff.png',
      wizard_4: 'https://oldschool.runescape.wiki/images/Tumeken%27s_shadow.png',
      
      cannon_1: 'https://oldschool.runescape.wiki/images/Dwarf_multicannon_built.png',
      cannon_2: 'https://oldschool.runescape.wiki/images/Golden_multicannon.png',
      cannon_3: 'https://oldschool.runescape.wiki/images/Granite_multicannon.png',
      cannon_4: 'https://oldschool.runescape.wiki/images/Heavy_ballista.png',
      
      tzhaar_1: 'https://oldschool.runescape.wiki/images/TzHaar-Ket.png',
      tzhaar_2: 'https://oldschool.runescape.wiki/images/TzHaar-Xil.png',
      tzhaar_3: 'https://oldschool.runescape.wiki/images/TzHaar-Mej.png',
      tzhaar_4: 'https://oldschool.runescape.wiki/images/TzKal-Zuk.png',
      
      slayer_1: 'https://oldschool.runescape.wiki/images/Slayer_helmet.png',
      slayer_2: 'https://oldschool.runescape.wiki/images/Broad_bolts_detail.png',
      slayer_3: 'https://oldschool.runescape.wiki/images/Leaf-bladed_battleaxe.png',
      slayer_4: 'https://oldschool.runescape.wiki/images/Slayer_helmet_%28i%29.png',
      
      support_1: 'https://oldschool.runescape.wiki/images/Ancient_mace.png',
      support_2: 'https://oldschool.runescape.wiki/images/War_banner.png',
      support_3: 'https://oldschool.runescape.wiki/images/Altar_of_Gielinor.png',
      support_4: 'https://oldschool.runescape.wiki/images/Saradomin_statue.png'
    };

    Object.entries(imageUrls).forEach(([key, url]) => {
      const img = new Image();
      img.onload = () => console.log(`Loaded image: ${key}`);
      img.onerror = () => {
        console.warn(`Failed to load image: ${key} (${url})`);
        this.brokenImages.add(key);
      };
      img.src = url;
      img.referrerPolicy = 'no-referrer';
      this.imageCache.set(key, img);
    });
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
      if (rect.width > 0 && rect.height > 0) {
        this.canvas.width = rect.width;
        this.canvas.height = rect.height;
        this.initPath(); // Re-calculate path based on new size
        console.log(`Resized canvas to ${this.canvas.width}x${this.canvas.height}`);
      }
    }
  }

  setPath(index: number) {
    this.currentPathIndex = index;
    this.initPath();
    // Reset game if path changes mid-game? For now, just reset entities
    this.enemies = [];
    this.projectiles = [];
    this.waveActive = false;
    this.enemiesToSpawn = [];
    this.onStateChange({ isPlaying: false });
  }

  initPath() {
    let w = this.canvas.width;
    let h = this.canvas.height;
    
    // Fallback if canvas is not yet sized
    if (w <= 0) w = 800;
    if (h <= 0) h = 600;
    
    // Save old path length to check if we need to reset enemies
    const oldPathLength = this.path.length;

    if (this.currentPathIndex === 0) {
      // Winding Path (Default)
      this.path = [
        { x: -50, y: h * 0.2 },
        { x: w * 0.2, y: h * 0.2 },
        { x: w * 0.2, y: h * 0.8 },
        { x: w * 0.5, y: h * 0.8 },
        { x: w * 0.5, y: h * 0.4 },
        { x: w * 0.8, y: h * 0.4 },
        { x: w * 0.8, y: h * 0.6 },
        { x: w + 50, y: h * 0.6 }
      ];
    } else {
      // Spiral Path
      this.path = [
        { x: -50, y: h * 0.1 },
        { x: w * 0.9, y: h * 0.1 },
        { x: w * 0.9, y: h * 0.9 },
        { x: w * 0.1, y: h * 0.9 },
        { x: w * 0.1, y: h * 0.3 },
        { x: w * 0.7, y: h * 0.3 },
        { x: w * 0.7, y: h * 0.7 },
        { x: w * 0.3, y: h * 0.7 },
        { x: w * 0.3, y: h * 0.5 },
        { x: w * 0.5, y: h * 0.5 }
      ];
    }

    // If path changed significantly, we might need to clear enemies to avoid crashes
    if (oldPathLength > 0 && this.path.length !== oldPathLength && this.waveActive) {
      console.warn('Path changed during wave, clearing enemies to prevent crash');
      this.enemies = [];
    }
  }

  assignSlayerTask() {
    const tasks: EnemyType[] = [
      'goblin', 'rat', 'cow', 'imp', 'spider', 'scorpion', 
      'hill_giant', 'lesser_demon', 'barrow_wight', 'chaos_druid', 'skeletal_mage'
    ];
    const type = tasks[Math.floor(Math.random() * tasks.length)];
    const count = 10 + Math.floor(Math.random() * 20);
    
    // Consecutive bonus logic
    if (this.lastTaskType === type) {
      this.consecutiveTasks++;
    } else {
      this.consecutiveTasks = 0;
    }
    this.lastTaskType = type;

    const bonusMultiplier = 1 + (this.consecutiveTasks * 0.1); // 10% bonus per consecutive task of same type
    
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

  buyPotion(type: 'overload' | 'super_restore' | 'prayer_potion') {
    const costs = { overload: 100, super_restore: 50, prayer_potion: 30 };
    if (this.money >= costs[type]) {
      this.money -= costs[type];
      if (type === 'overload') {
        this.activePotions.push({ type: 'overload', timer: 30 }); // 30 seconds
      } else if (type === 'super_restore' || type === 'prayer_potion') {
        this.prayerPoints = Math.min(this.maxPrayerPoints, this.prayerPoints + (type === 'super_restore' ? 10 : 5));
      }
      this.playSound('potion');
      this.onStateChange({ money: this.money, prayerPoints: this.prayerPoints });
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
        this.playSound('level_up');
        this.particles.push({ x: 400, y: 300, life: 2, color: '#ffff00' });
      }
    });
    if (changed) this.onStateChange({ achievements: this.achievements });
  }

  getEnemyStats(type: EnemyType, waveMultiplier: number) {
    const baseStats: Record<EnemyType, { hp: number, speed: number, reward: number, color: string }> = {
      goblin: { hp: 10, speed: 100, reward: 5, color: '#00ff00' },
      rat: { hp: 5, speed: 120, reward: 3, color: '#808080' },
      cow: { hp: 30, speed: 60, reward: 10, color: '#8B4513' },
      imp: { hp: 15, speed: 150, reward: 8, color: '#ff0000' },
      spider: { hp: 40, speed: 90, reward: 12, color: '#ffff00' },
      scorpion: { hp: 60, speed: 70, reward: 15, color: '#DAA520' },
      hill_giant: { hp: 150, speed: 50, reward: 25, color: '#A0522D' },
      lesser_demon: { hp: 100, speed: 110, reward: 30, color: '#800000' },
      green_dragon: { hp: 300, speed: 80, reward: 50, color: '#006400' },
      jad: { hp: 1000, speed: 40, reward: 500, color: '#FF4500' },
      // New Enemies
      blue_dragon: { hp: 400, speed: 75, reward: 60, color: '#0000CD' },
      black_demon: { hp: 200, speed: 100, reward: 40, color: '#000000' },
      abyssal_demon: { hp: 250, speed: 130, reward: 45, color: '#4B0082' },
      barrow_wight: { hp: 600, speed: 40, reward: 80, color: '#F5F5DC' },
      chaos_druid: { hp: 80, speed: 140, reward: 20, color: '#32CD32' },
      skeletal_mage: { hp: 120, speed: 90, reward: 25, color: '#E6E6FA' },
      vorkath: { hp: 2000, speed: 30, reward: 1000, color: '#4682B4' },
      zulrah: { hp: 1500, speed: 50, reward: 800, color: '#2E8B57' },
      skeleton: { hp: 50, speed: 90, reward: 10, color: '#f0f0f0' },
      zombie: { hp: 70, speed: 70, reward: 12, color: '#4a5d23' },
      ghost: { hp: 40, speed: 110, reward: 15, color: '#a0d6d6' },
      hellhound: { hp: 180, speed: 120, reward: 35, color: '#ff4500' },
      fire_giant: { hp: 220, speed: 60, reward: 40, color: '#ff8c00' },
      bloodveld: { hp: 250, speed: 80, reward: 45, color: '#ff00ff' },
      gargoyle: { hp: 350, speed: 50, reward: 55, color: '#808080' },
      nechryael: { hp: 300, speed: 90, reward: 60, color: '#4b0082' },
      dark_beast: { hp: 500, speed: 100, reward: 100, color: '#1a1a1a' },
      hydra: { hp: 800, speed: 70, reward: 200, color: '#006400' }
    };

    const stats = baseStats[type];
    return {
      ...stats,
      hp: Math.floor(stats.hp * waveMultiplier),
      maxHp: Math.floor(stats.hp * waveMultiplier)
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

    const multiplier = 1 + (waveNum * 0.1); // 10% stronger per wave

    if (this.path.length === 0) return enemies;

    for (const config of waveConfigs) {
      for (let i = 0; i < config.count; i++) {
        const stats = this.getEnemyStats(config.type, multiplier);
        enemies.push({
          id: Math.random().toString(36).substr(2, 9),
          x: this.path[0].x,
          y: this.path[0].y,
          hp: stats.hp,
          maxHp: stats.maxHp,
          speed: stats.speed,
          baseSpeed: stats.speed,
          pathIndex: 0,
          type: config.type,
          color: stats.color,
          reward: stats.reward,
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

    switch (type) {
      case 'archer':
        name = 'Shortbow';
        cost = 50;
        range = 150 * this.upgrades.archerRange;
        damage = 8;
        cooldown = 600;
        color = '#00ff00';
        upgradeCost = 100;
        break;
      case 'wizard':
        name = 'Wind Strike';
        cost = 75;
        range = 120;
        damage = 15 * this.upgrades.magicDamage;
        cooldown = 1200;
        color = '#0000ff';
        upgradeCost = 150;
        special = 'slow';
        break;
      case 'cannon':
        name = 'Dwarf Cannon';
        cost = 150;
        range = 180;
        damage = 30;
        cooldown = 2000 / this.upgrades.cannonSpeed;
        color = '#ff0000';
        upgradeCost = 300;
        special = 'aoe';
        break;
      case 'tzhaar':
        name = 'TzHaar-Ket';
        cost = 200;
        range = 60; // Melee
        damage = 50;
        cooldown = 1500;
        color = '#8B0000';
        upgradeCost = 400;
        break;
      case 'slayer':
        name = 'Slayer Tower';
        cost = 125;
        range = 160;
        damage = 25;
        cooldown = 1000;
        color = '#4B0082';
        upgradeCost = 250;
        break;
      case 'support':
        name = 'Support Banner';
        cost = 100;
        range = 100; // Aura range
        damage = 0;
        cooldown = 2000;
        color = '#FFFFFF';
        upgradeCost = 200;
        break;
    }

    if (this.money >= cost) {
      if (this.isValidPlacement(x, y)) {
        console.log(`Placed tower ${type} successfully`);
        this.playSound('upgrade');
        this.money -= cost;
        this.towers.push({
          id: Math.random().toString(36).substr(2, 9),
          x,
          y,
          type: type as any,
          level: 1,
          maxLevel: 4,
          range,
          damage,
          cooldown,
          lastFired: 0,
          color,
          targetId: null,
          name,
          upgradeCost,
          special,
          visualRadius: 18,
          disabledTimer: 0,
          skills: {
            attack: { level: 1, xp: 0 },
            strength: { level: 1, xp: 0 },
            defense: { level: 1, xp: 0 },
            ranged: { level: 1, xp: 0 },
            magic: { level: 1, xp: 0 }
          },
          equipment: {
            weapon: null,
            shield: null,
            accessory: null
          }
        });
        this.onStateChange({ money: this.money });
      } else {
        console.warn('Invalid tower placement');
      }
    } else {
      console.warn('Not enough money for tower');
    }
  }

  upgradeTower(towerId: string) {
    const tower = this.towers.find(t => t.id === towerId);
    if (!tower) return;
    
    if (tower.level >= tower.maxLevel) return;
    if (this.money < tower.upgradeCost) return;

    this.playSound('upgrade');
    this.money -= tower.upgradeCost;
    tower.level++;
    tower.visualRadius += 2;

    // Upgrade logic
    if (tower.type === 'archer') {
      if (tower.level === 2) {
        tower.name = 'Magic Shortbow';
        tower.damage = 15;
        tower.cooldown = 500;
        tower.range = 170 * this.upgrades.archerRange;
        tower.upgradeCost = 250;
        tower.color = '#32CD32';
      } else if (tower.level === 3) {
        tower.name = 'Crystal Bow';
        tower.damage = 35;
        tower.cooldown = 400;
        tower.range = 250 * this.upgrades.archerRange;
        tower.color = '#E0FFFF';
        tower.upgradeCost = 500;
      } else if (tower.level === 4) {
        tower.name = 'Bow of Faerdhinen';
        tower.damage = 80;
        tower.cooldown = 300;
        tower.range = 300 * this.upgrades.archerRange;
        tower.color = '#FF0000'; // Saeldor/Fbow red
        tower.special = 'rapid';
      }
    } else if (tower.type === 'wizard') {
      if (tower.level === 2) {
        tower.name = 'Water Bolt';
        tower.damage = 30 * this.upgrades.magicDamage;
        tower.cooldown = 1100;
        tower.upgradeCost = 400;
        tower.color = '#1E90FF';
      } else if (tower.level === 3) {
        tower.name = 'Ice Barrage';
        tower.damage = 60 * this.upgrades.magicDamage;
        tower.cooldown = 1500;
        tower.range = 150;
        tower.special = 'aoe'; // Becomes AoE slow
        tower.color = '#B0E0E6';
        tower.upgradeCost = 750;
      } else if (tower.level === 4) {
        tower.name = "Tumeken's Shadow";
        tower.damage = 150 * this.upgrades.magicDamage;
        tower.cooldown = 1200;
        tower.range = 200;
        tower.color = '#FFD700';
        tower.special = 'aoe';
      }
    } else if (tower.type === 'cannon') {
      if (tower.level === 2) {
        tower.name = 'Gold Cannon';
        tower.damage = 100;
        tower.range = 240;
        tower.upgradeCost = 600;
        tower.color = '#FFD700';
        tower.special = 'stun'; // Chance to stun
        tower.cooldown = 1800 / this.upgrades.cannonSpeed;
      } else if (tower.level === 3) {
        tower.name = 'Granite Cannon';
        tower.damage = 250;
        tower.range = 280;
        tower.color = '#696969';
        tower.special = 'stun'; // Higher chance/duration?
        tower.cooldown = 1600 / this.upgrades.cannonSpeed;
        tower.upgradeCost = 1000;
      } else if (tower.level === 4) {
        tower.name = 'Heavy Ballista';
        tower.damage = 800;
        tower.range = 350;
        tower.cooldown = 3000 / this.upgrades.cannonSpeed;
        tower.color = '#4B3621';
        tower.special = 'stun';
      }
    } else if (tower.type === 'tzhaar') {
      if (tower.level === 2) {
        tower.name = 'TzHaar-Xil';
        tower.damage = 100;
        tower.range = 70;
        tower.upgradeCost = 800;
        tower.color = '#A52A2A';
      } else if (tower.level === 3) {
        tower.name = 'TzHaar-Mej';
        tower.damage = 250;
        tower.range = 100;
        tower.color = '#FF4500';
        tower.special = 'stun'; // Melee stun
        tower.upgradeCost = 1200;
      } else if (tower.level === 4) {
        tower.name = 'Infernal Ket';
        tower.damage = 500;
        tower.range = 120;
        tower.color = '#FF0000';
        tower.special = 'aoe'; // Burn effect
      }
    } else if (tower.type === 'slayer') {
      if (tower.level === 2) {
        tower.name = 'Broad Bolts';
        tower.damage = 45;
        tower.range = 180;
        tower.upgradeCost = 500;
        tower.color = '#9370DB';
      } else if (tower.level === 3) {
        tower.name = 'Leaf-Bladed Axe';
        tower.damage = 100;
        tower.range = 80; // Melee
        tower.color = '#228B22';
        tower.upgradeCost = 1000;
      } else if (tower.level === 4) {
        tower.name = 'Slayer Master';
        tower.damage = 300;
        tower.range = 200;
        tower.color = '#000000';
      }
    } else if (tower.type === 'support') {
      if (tower.level === 2) {
        tower.name = 'War Banner';
        tower.range = 130;
        tower.upgradeCost = 400;
        tower.color = '#F0F8FF';
      } else if (tower.level === 3) {
        tower.name = 'Holy Altar';
        tower.range = 160;
        tower.color = '#FFFAF0';
        tower.upgradeCost = 800;
      } else if (tower.level === 4) {
        tower.name = 'Saradomin Shrine';
        tower.range = 200;
        tower.color = '#0000FF';
      }
    }

    this.onStateChange({ money: this.money });
  }

  sellTower(towerId: string) {
    const index = this.towers.findIndex(t => t.id === towerId);
    if (index > -1) {
      // Refund 50% of value (approximate logic for now just base cost)
      // Ideally track total investment
      this.playSound('sell');
      this.money += 25; 
      this.towers.splice(index, 1);
      this.onStateChange({ money: this.money });
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
      const dx = x - enemy.x;
      const dy = y - enemy.y;
      if (Math.sqrt(dx * dx + dy * dy) <= 10) {
        return { type: 'enemy', data: enemy };
      }
    }

    return null;
  }

  loop() {
    const now = performance.now();
    const dt = (now - this.lastTime) / 1000; // Delta time in seconds
    this.lastTime = now;

    this.update(dt, now);
    this.draw();

    this.animationId = requestAnimationFrame(() => this.loop());
  }

  update(dt: number, now: number) {
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

    // Update Potions
    this.activePotions.forEach((p, i) => {
      p.timer -= dt;
      if (p.timer <= 0) this.activePotions.splice(i, 1);
    });

    // Update Prayer
    if (this.activePrayers.size > 0 && this.waveActive) {
      this.prayerDrainTimer += dt;
      if (this.prayerDrainTimer >= 1 / (this.upgrades.prayerEfficiency || 1)) {
        this.prayerPoints = Math.max(0, this.prayerPoints - this.activePrayers.size * 0.1);
        this.prayerDrainTimer = 0;
        if (this.prayerPoints <= 0) {
          this.activePrayers.clear();
          this.playSound('prayer_off');
          this.onStateChange({ activePrayers: [] });
        }
        this.onStateChange({ prayerPoints: this.prayerPoints });
      }
    }

    // Update Special Attack Charge
    if (this.waveActive) {
      this.specialAttackCharge = Math.min(this.maxSpecialAttack, this.specialAttackCharge + dt * 2);
      this.onStateChange({ specialAttackCharge: this.specialAttackCharge });
    }

    // Update Quests for waves
    if (this.wave > 1) {
      this.updateQuests('wave', this.wave);
    }

    this.checkAchievements();

    // Boss Map Attacks
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
      this.wave++;
      this.onStateChange({ wave: this.wave, isPlaying: false });
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
        // Safety check: if path changed or index is invalid
        this.enemies.splice(i, 1);
        continue;
      }

      if (isNaN(enemy.x) || isNaN(enemy.y)) {
        this.enemies.splice(i, 1);
        continue;
      }

      const target = this.path[enemy.pathIndex + 1];
      
      if (!target) {
        // Reached end
        this.lives--;
        this.shakeAmount = 10;
        this.enemies.splice(i, 1);
        this.onStateChange({ lives: this.lives });
        if (this.lives <= 0) {
          this.resetGame();
        }
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
            tauntTimer: 0
          });
        }
      }

      if (enemy.type === 'jad') {
        this.jadAttackTimer += dt * 1000;
        if (this.jadAttackTimer > 4000) { // Every 4 seconds
          this.jadAttackTimer = 0;
          this.jadAttackType = Math.random() > 0.5 ? 'mage' : 'range';
          
          // Visual warning
          this.particles.push({ x: enemy.x, y: enemy.y - 40, life: 1.5, color: this.jadAttackType === 'mage' ? '#0000ff' : '#00ff00' });
          
          // Delayed check for prayer
          setTimeout(() => {
            if (this.enemies.find(e => e.id === enemy.id)) {
              // If Jad attacks and you don't have ANY prayer active, you lose a life
              if (this.activePrayers.size === 0) {
                this.lives--;
                this.shakeAmount = 10;
                this.onStateChange({ lives: this.lives });
              }
              this.jadAttackType = null;
            }
          }, 1500);
        }
      }
    }

    // Support Aura
    this.towers.forEach(tower => {
      if (tower.disabledTimer > 0) {
        tower.disabledTimer -= dt;
        return;
      }
      
      let damageMultiplier = 1.0;
      let rangeMultiplier = 1.0;
      let speedMultiplier = 1.0;

      // Apply Support Aura from nearby Support Towers
      this.towers.forEach(other => {
        if (other.type === 'support' && other.id !== tower.id) {
          const dx = other.x - tower.x;
          const dy = other.y - tower.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist <= other.range) {
            damageMultiplier *= 1.1 + (other.level * 0.05); // 15% - 30% bonus
            rangeMultiplier *= 1.05 + (other.level * 0.02); // 7% - 13% bonus
          }
        }
      });

      // Apply Overload / Prayer Buffs
      if (this.activePotions.some(p => p.type === 'overload')) {
        damageMultiplier *= 1.2;
        rangeMultiplier *= 1.1;
      }

      if (this.activePrayers.has('piety')) damageMultiplier *= 1.2;
      if (this.activePrayers.has('rigour')) rangeMultiplier *= 1.2;
      if (this.activePrayers.has('augury')) damageMultiplier *= 1.15;

      let slayerBonus = 1.0;
      if (tower.type === 'slayer' && this.slayerTask) {
        const target = this.enemies.find(e => e.id === tower.targetId);
        if (target && target.type === this.slayerTask.type) {
          slayerBonus = 1.5 + (tower.level * 0.5); // 2x - 3.5x damage
        }
      }

      const effectiveRange = tower.range * rangeMultiplier;
      const effectiveDamage = tower.damage * damageMultiplier * slayerBonus;
      const effectiveCooldown = tower.cooldown / speedMultiplier;

      // Find target
      if (!tower.targetId || !this.enemies.find(e => e.id === tower.targetId)) {
        // Simple targeting: closest
        let closestDist = Infinity;
        let closestId = null;
        
        for (const enemy of this.enemies) {
          const dx = enemy.x - tower.x;
          const dy = enemy.y - tower.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          
          if (dist <= effectiveRange && dist < closestDist) {
            closestDist = dist;
            closestId = enemy.id;
          }
        }
        tower.targetId = closestId;
      }

      // Fire
      if (tower.targetId && now - tower.lastFired >= effectiveCooldown && effectiveDamage > 0) {
        const target = this.enemies.find(e => e.id === tower.targetId);
        if (target) {
          // Check range again
          const dx = target.x - tower.x;
          const dy = target.y - tower.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          
          if (dist <= effectiveRange) {
            this.playSound(`shoot_${tower.type}`);
            
            // Tzhaar Taunt Logic
            if (tower.type === 'tzhaar') {
              // Taunt all enemies in range
              this.enemies.forEach(e => {
                const edx = e.x - tower.x;
                const edy = e.y - tower.y;
                if (Math.sqrt(edx * edx + edy * edy) <= effectiveRange) {
                  e.tauntTimer = 2.0; // 2 second taunt
                }
              });
            }

            this.projectiles.push({
              id: Math.random().toString(36).substr(2, 9),
              x: tower.x,
              y: tower.y,
              targetId: tower.targetId,
              speed: 400,
              damage: effectiveDamage,
              color: tower.color,
              special: tower.special === 'aoe' ? 'aoe' : (tower.special === 'slow' ? 'slow' : (tower.special === 'stun' ? 'stun' : undefined)),
              sourceTowerId: tower.id
            });
            tower.lastFired = now;
          } else {
            tower.targetId = null;
          }
        } else {
          tower.targetId = null;
        }
      }
    });

    // Update Projectiles
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      const target = this.enemies.find(e => e.id === p.targetId);
      
      if (!target) {
        this.projectiles.splice(i, 1);
        continue;
      }

      const dx = target.x - p.x;
      const dy = target.y - p.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      
      if (dist < 10) {
        // Hit
        if (p.special === 'aoe') {
          // AoE Damage
          const aoeRadius = 60;
          this.enemies.forEach(e => {
            const edx = e.x - p.x;
            const edy = e.y - p.y;
            if (Math.sqrt(edx * edx + edy * edy) <= aoeRadius) {
              this.damageEnemy(e, p.damage, p.sourceTowerId);
              if (p.color === '#B0E0E6') { // Ice Barrage check
                 this.applySlow(e);
              }
            }
          });
        } else {
          // Single Target
          this.damageEnemy(target, p.damage, p.sourceTowerId);
          if (p.special === 'slow') {
            this.applySlow(target);
          } else if (p.special === 'stun') {
            if (Math.random() < 0.2) { // 20% chance to stun
              this.applyStun(target);
            }
          }
        }
        
        this.projectiles.splice(i, 1);
      } else {
        const moveX = (dx / dist) * p.speed * dt;
        const moveY = (dy / dist) * p.speed * dt;
        p.x += moveX;
        p.y += moveY;
      }
    }
  }

  damageEnemy(enemy: Enemy, damage: number, sourceTowerId?: string) {
    enemy.hp -= damage;
    this.playSound('hit');
    
    // Award XP to tower
    if (sourceTowerId) {
      const tower = this.towers.find(t => t.id === sourceTowerId);
      if (tower) {
        this.awardTowerXP(tower, damage);
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
        // Play specific death sound
        if (enemy.type.includes('dragon') || enemy.type === 'vorkath') {
          this.playSound('death_dragon');
        } else if (enemy.type.includes('demon')) {
          this.playSound('death_demon');
        } else if (enemy.type === 'jad' || enemy.type === 'zulrah') {
          this.playSound('death_boss');
        } else {
          this.playSound('kill');
        }
        
        this.enemies.splice(index, 1);
        
        // Update Quests
        this.updateQuests('kill', 1, enemy.type);

        // GP Bonus from Pets & Upgrades
        let gpReward = enemy.reward * (this.upgrades.rewardMultiplier || 1);
        if (this.pets.some(p => p.name === 'Snakeling')) gpReward = Math.floor(gpReward * 1.1);
        this.money += Math.floor(gpReward);

        // Essence Bonus from Upgrades
        if (Math.random() < 0.1 * (this.upgrades.rewardMultiplier || 1)) {
          this.runeEssence += 1;
          this.onStateChange({ runeEssence: this.runeEssence });
        }

        // Achievement checks for bosses
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

        this.onStateChange({ remainingEnemies: this.enemiesToSpawn.length + this.enemies.length });
        
        // Item Drop (2% chance)
        if (Math.random() < 0.02) {
          const items: Item[] = [
            { id: 'iron_longsword', name: 'Iron Longsword', description: 'Dmg +5', bonus: { damage: 5 }, type: 'weapon' },
            { id: 'oak_shortbow', name: 'Oak Shortbow', description: 'Range +20', bonus: { range: 20 }, type: 'weapon' },
            { id: 'steel_shield', name: 'Steel Shield', description: 'Def +5', bonus: { defense: 5 }, type: 'shield' },
            { id: 'amulet_of_power', name: 'Amulet of Power', description: 'Dmg +10, Range +10', bonus: { damage: 10, range: 10 }, type: 'accessory' }
          ];
          const drop = items[Math.floor(Math.random() * items.length)];
          this.inventory.push({ ...drop, id: Math.random().toString() });
          this.onStateChange({ inventory: this.inventory });
        }

        // Pet Drop (1% chance from normal, 20% from bosses)
        const isBoss = enemy.type === 'vorkath' || enemy.type === 'zulrah' || enemy.type === 'jad';
        let dropChance = isBoss ? 0.2 : 0.01;
        
        // Luck Bonus from Pets
        if (this.pets.some(p => p.name === 'Pet Rock')) dropChance *= 1.5;

        if (Math.random() < dropChance) {
          const petNames = { vorkath: 'Vorki', zulrah: 'Snakeling', jad: 'TzRek-Jad' };
          const petName = isBoss ? petNames[enemy.type as keyof typeof petNames] : 'Pet Rock';
          const newPet = { id: Math.random().toString(), name: petName, type: enemy.type, bonus: isBoss ? 'GP +10%' : 'Luck +50%' };
          if (!this.pets.find(p => p.name === petName)) {
            this.pets.push(newPet);
            this.playSound('level_up');
            this.onStateChange({ pets: this.pets });
          }
        }
        
        // Rune Essence Drop (10% chance)
        let essenceChance = 0.1;
        if (this.pets.some(p => p.name === 'Vorki')) essenceChance = 0.15;
        if (Math.random() < essenceChance) {
          this.runeEssence++;
          this.onStateChange({ runeEssence: this.runeEssence });
        }

        // Slayer Task
        if (this.slayerTask && this.slayerTask.type === enemy.type && this.slayerTask.count > 0) {
          this.slayerTask.count--;
          if (this.slayerTask.count === 0) {
            this.money += this.slayerTask.reward;
            this.assignSlayerTask(); // New task
          } else {
            this.onStateChange({ slayerTask: this.slayerTask });
          }
        }

        this.onStateChange({ money: this.money });
      }
    }
  }

  awardTowerXP(tower: Tower, amount: number) {
    const xpGain = amount / 2;
    let skillKey: keyof TowerSkills = 'attack';
    
    if (tower.type === 'archer') skillKey = 'ranged';
    else if (tower.type === 'wizard') skillKey = 'magic';
    else if (tower.type === 'cannon') skillKey = 'strength';
    else if (tower.type === 'tzhaar') skillKey = 'attack';

    const skill = tower.skills[skillKey];
    skill.xp += xpGain;
    
    const nextLevelXP = Math.pow(skill.level, 2) * 100;
    if (skill.xp >= nextLevelXP) {
      skill.level++;
      skill.xp -= nextLevelXP;
      this.playSound('level_up');
      this.particles.push({ x: tower.x, y: tower.y - 20, life: 1, color: '#ffff00' });
      
      // Improve stats based on level up
      if (skillKey === 'ranged' || skillKey === 'magic' || skillKey === 'attack') {
        tower.damage += 2;
      }
      if (skillKey === 'strength') {
        tower.damage += 5;
      }
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

  applySlow(enemy: Enemy) {
    enemy.speed = enemy.baseSpeed * 0.5;
    enemy.slowTimer = 2.0; // 2 seconds slow
  }

  applyStun(enemy: Enemy) {
    enemy.stunTimer = 1.0; // 1 second stun
  }

  equipItem(towerId: string, itemId: string) {
    const tower = this.towers.find(t => t.id === towerId);
    const itemIndex = this.inventory.findIndex(i => i.id === itemId);
    if (!tower || itemIndex === -1) return;

    const item = this.inventory[itemIndex];
    
    // Unequip current item in slot if any
    const currentItem = tower.equipment[item.type];
    if (currentItem) {
      this.inventory.push(currentItem);
      // Remove bonuses
      if (currentItem.bonus.damage) tower.damage -= currentItem.bonus.damage;
      if (currentItem.bonus.range) tower.range -= currentItem.bonus.range;
      if (currentItem.bonus.cooldown) tower.cooldown += currentItem.bonus.cooldown;
    }

    // Equip new item
    tower.equipment[item.type] = item;
    this.inventory.splice(itemIndex, 1);

    // Apply bonuses
    if (item.bonus.damage) tower.damage += item.bonus.damage;
    if (item.bonus.range) tower.range += item.bonus.range;
    if (item.bonus.cooldown) tower.cooldown -= item.bonus.cooldown;

    this.playSound('upgrade');
    this.onStateChange({ inventory: this.inventory });
  }

  unequipItem(towerId: string, slot: 'weapon' | 'shield' | 'accessory') {
    const tower = this.towers.find(t => t.id === towerId);
    if (!tower) return;

    const item = tower.equipment[slot];
    if (item) {
      this.inventory.push(item);
      // Remove bonuses
      if (item.bonus.damage) tower.damage -= item.bonus.damage;
      if (item.bonus.range) tower.range -= item.bonus.range;
      if (item.bonus.cooldown) tower.cooldown += item.bonus.cooldown;
      
      tower.equipment[slot] = null;
      this.playSound('sell');
      this.onStateChange({ inventory: this.inventory });
    }
  }

  resetGame() {
    this.lives = 20;
    this.money = 150;
    this.wave = 1;
    this.enemies = [];
    this.towers = [];
    this.projectiles = [];
    this.waveActive = false;
    this.onStateChange({ lives: 20, money: 150, wave: 1, isPlaying: false });
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

      // Clear
      this.ctx.fillStyle = '#1a1a1a'; // Very dark background
      this.ctx.fillRect(0, 0, w, h);

      // Set common styles
      this.ctx.lineCap = 'round';
      this.ctx.lineJoin = 'round';

      // Draw Path Border (Outer)
      this.ctx.beginPath();
      this.ctx.strokeStyle = '#3d2b1f'; // Dark brown border
      this.ctx.lineWidth = 46;
      if (this.path.length > 0) {
        this.ctx.moveTo(this.path[0].x, this.path[0].y);
        for (let i = 1; i < this.path.length; i++) {
          this.ctx.lineTo(this.path[i].x, this.path[i].y);
        }
      }
      this.ctx.stroke();

      // Draw Path (Middle)
      this.ctx.beginPath();
      this.ctx.strokeStyle = '#5d4037'; // Medium brown
      this.ctx.lineWidth = 40;
      if (this.path.length > 0) {
        this.ctx.moveTo(this.path[0].x, this.path[0].y);
        for (let i = 1; i < this.path.length; i++) {
          this.ctx.lineTo(this.path[i].x, this.path[i].y);
        }
      }
      this.ctx.stroke();

      // Draw Path (Center)
      this.ctx.beginPath();
      this.ctx.strokeStyle = '#795548'; // Light brown dirt
      this.ctx.lineWidth = 32;
      if (this.path.length > 0) {
        this.ctx.moveTo(this.path[0].x, this.path[0].y);
        for (let i = 1; i < this.path.length; i++) {
          this.ctx.lineTo(this.path[i].x, this.path[i].y);
        }
      }
      this.ctx.stroke();

      // Draw Pets
      if (this.pets.length > 0) {
        const time = performance.now() / 1000;
        this.pets.forEach((pet, index) => {
          // Movement logic: wander around, but avoid the path if wave is active
          const wanderRadius = 100;
          const speed = 0.5;
          const basePos = this.path[0] || { x: 100, y: 100 };
          
          // Wander target
          const targetX = basePos.x + Math.cos(time * speed + index * 2) * wanderRadius;
          const targetY = basePos.y + Math.sin(time * speed + index * 2) * wanderRadius;
          
          let x = targetX;
          let y = targetY;

          // If wave active, try to stay away from the path
          if (this.waveActive) {
            // Simple avoidance: push away from path center
            this.path.forEach(point => {
              const dx = x - point.x;
              const dy = y - point.y;
              const dist = Math.sqrt(dx * dx + dy * dy);
              if (dist < 50) {
                x += (dx / dist) * 20;
                y += (dy / dist) * 20;
              }
            });
          }

          const imgKey = pet.type; // Use the enemy type as the pet image key
          const img = this.imageCache.get(imgKey);
          
          if (img && img.complete && img.naturalWidth > 0 && !this.brokenImages.has(imgKey)) {
            this.ctx.drawImage(img, x - 10, y - 10, 20, 20);
          } else {
            this.ctx.font = '16px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.fillText('🐾', x, y);
          }
          
          this.ctx.fillStyle = '#00ffff';
          this.ctx.font = 'bold 10px Arial';
          this.ctx.textAlign = 'center';
          this.ctx.fillText(pet.name, x, y + 15);
        });
      }

      // Draw Towers
      this.towers.forEach(tower => {
        if (isNaN(tower.x) || isNaN(tower.y)) return;
        
        const imgKey = `${tower.type}_${tower.level}`;
        const img = this.imageCache.get(imgKey);
        if (img && img.complete && img.naturalWidth > 0 && !this.brokenImages.has(imgKey)) {
          const size = (tower.visualRadius || 18) * 2;
          this.ctx.drawImage(img, tower.x - size/2, tower.y - size/2, size, size);
        } else {
          this.ctx.fillStyle = tower.color;
          this.ctx.beginPath();
          this.ctx.arc(tower.x, tower.y, tower.visualRadius || 18, 0, Math.PI * 2);
          this.ctx.fill();
        }
        
        // Border for high level
        if (tower.level >= 3) {
          this.ctx.strokeStyle = tower.level === 4 ? '#ff0000' : '#ffff00';
          this.ctx.lineWidth = 2;
          this.ctx.stroke();
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

      // Draw Enemies
      this.enemies.forEach(enemy => {
        if (isNaN(enemy.x) || isNaN(enemy.y)) return;

        const img = this.imageCache.get(enemy.type);
        const isBoss = enemy.type === 'vorkath' || enemy.type === 'zulrah' || enemy.type === 'jad';
        const size = isBoss ? 60 : 30;

        if (img && img.complete && img.naturalWidth > 0 && !this.brokenImages.has(enemy.type)) {
          this.ctx.drawImage(img, enemy.x - size/2, enemy.y - size/2, size, size);
        } else {
          this.ctx.fillStyle = enemy.color;
          this.ctx.beginPath();
          this.ctx.arc(enemy.x, enemy.y, isBoss ? 20 : 10, 0, Math.PI * 2);
          this.ctx.fill();
        }

        // Status effects
        if (enemy.slowTimer > 0) {
          this.ctx.strokeStyle = '#00ffff';
          this.ctx.lineWidth = 2;
          this.ctx.beginPath();
          this.ctx.arc(enemy.x, enemy.y, 12, 0, Math.PI * 2);
          this.ctx.stroke();
        }
        if (enemy.stunTimer > 0) {
          this.ctx.strokeStyle = '#ffff00';
          this.ctx.lineWidth = 2;
          this.ctx.beginPath();
          this.ctx.arc(enemy.x, enemy.y, 14, 0, Math.PI * 2);
          this.ctx.stroke();
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
        this.ctx.fillStyle = p.color;
        this.ctx.beginPath();
        this.ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
        this.ctx.fill();
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

      this.ctx.restore();
    } catch (e) {
      console.error('Draw loop error:', e);
    }
  }
}
