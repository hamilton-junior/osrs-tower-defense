import type { Element } from '../types';

export interface EnemyDef {
  type: string | any; // Keep flexible for now or use EnemyType
  name: string;
  hp: number;
  speed: number;
  color: string;
  reward: number;
  resistance?: number;
  deathSound?: string;
  weakness?: any;
  isBoss?: boolean;
  waveUnlock?: number;
  /** Sprite size multiplier at draw time (default 1). Used to compensate sprites
   *  whose art has heavy transparent padding so they read at a consistent
   *  on-screen size (e.g. Zulrah's serpentine pose). */
  renderScale?: number;
}

// `hp` mirrors each monster's real OSRS hitpoints. `reward` is a "threat weight"
// used only to size waves (see wave-generation); the gold the player earns is
// derived from (wave-scaled) HP in systems/rewards, not from `reward`.
export const ENEMIES: Record<string, EnemyDef> = {
  goblin: {
    type: 'goblin',
    name: 'Goblin',
    hp: 5,
    speed: 60,
    color: '#4a704a',
    reward: 2,
    waveUnlock: 1
  },
  rat: {
    type: 'rat',
    renderScale: 0.85,
    name: 'Giant Rat',
    hp: 8,
    speed: 80,
    color: '#8b8b8b',
    reward: 2,
    waveUnlock: 1
  },
  cow: {
    type: 'cow',
    renderScale: 1.05,
    name: 'Cow',
    hp: 8,
    speed: 40,
    color: '#ffffff',
    reward: 3,
    waveUnlock: 2
  },
  imp: {
    type: 'imp',
    renderScale: 0.75,
    name: 'Imp',
    hp: 8,
    speed: 120,
    color: '#ff0000',
    reward: 4,
    waveUnlock: 3
  },
  spider: {
    type: 'spider',
    renderScale: 0.95,
    name: 'Giant Spider',
    hp: 22,
    speed: 90,
    color: '#333333',
    reward: 5,
    waveUnlock: 2
  },
  skeleton: {
    type: 'skeleton',
    name: 'Skeleton',
    hp: 22,
    speed: 55,
    color: '#eeeeee',
    reward: 3,
    waveUnlock: 1
  },
  zombie: {
    type: 'zombie',
    renderScale: 0.9,
    name: 'Zombie',
    hp: 22,
    speed: 40,
    color: '#6b8e23',
    reward: 4,
    waveUnlock: 2
  },
  ghost: {
    type: 'ghost',
    name: 'Ghost',
    hp: 19,
    speed: 50,
    color: '#e0ffff',
    reward: 3,
    waveUnlock: 1
  },
  hellhound: {
    type: 'hellhound',
    renderScale: 1.1,
    name: 'Hellhound',
    hp: 116,
    speed: 70,
    color: '#ff4500',
    reward: 12,
    waveUnlock: 4
  },
  scorpion: {
    type: 'scorpion',
    renderScale: 0.85,
    name: 'Scorpion',
    hp: 17,
    speed: 60,
    color: '#d2b48c',
    reward: 7,
    waveUnlock: 3
  },
  fire_giant: {
    type: 'fire_giant',
    renderScale: 1.55,
    name: 'Fire Giant',
    hp: 111,
    speed: 35,
    color: '#ff0000',
    reward: 20,
    deathSound: 'demon',
    waveUnlock: 5
  },
  bloodveld: {
    type: 'bloodveld',
    renderScale: 1.15,
    name: 'Bloodveld',
    hp: 120,
    speed: 45,
    color: '#ff69b4',
    reward: 18,
    waveUnlock: 6
  },
  hill_giant: {
    type: 'hill_giant',
    renderScale: 1.55,
    name: 'Hill Giant',
    hp: 35,
    speed: 30,
    color: '#d2b48c',
    reward: 10,
    deathSound: 'demon',
    waveUnlock: 4
  },
  black_demon: {
    type: 'black_demon',
    renderScale: 1.45,
    name: 'Black Demon',
    hp: 157,
    speed: 40,
    color: '#1a1a1a',
    reward: 35,
    deathSound: 'demon',
    waveUnlock: 8
  },
  gargoyle: {
    type: 'gargoyle',
    renderScale: 1.15,
    name: 'Gargoyle',
    hp: 105,
    speed: 35,
    color: '#808080',
    reward: 32,
    waveUnlock: 9
  },
  blue_dragon: {
    type: 'blue_dragon',
    renderScale: 1.4,
    name: 'Blue Dragon',
    hp: 105,
    speed: 40,
    color: '#0000ff',
    reward: 50,
    deathSound: 'dragon',
    waveUnlock: 10
  },
  nechryael: {
    type: 'nechryael',
    renderScale: 1.2,
    name: 'Nechryael',
    hp: 105,
    speed: 45,
    color: '#4b0082',
    reward: 40,
    waveUnlock: 11
  },
  abyssal_demon: {
    type: 'abyssal_demon',
    renderScale: 1.1,
    name: 'Abyssal Demon',
    hp: 150,
    speed: 65,
    color: '#4b0082',
    reward: 56,
    deathSound: 'abyssal_demon',
    waveUnlock: 12
  },
  lesser_demon: {
    type: 'lesser_demon',
    renderScale: 1.25,
    name: 'Lesser Demon',
    hp: 79,
    speed: 50,
    color: '#8b0000',
    reward: 16,
    deathSound: 'demon',
    waveUnlock: 5
  },
  dark_beast: {
    type: 'dark_beast',
    renderScale: 1.3,
    name: 'Dark Beast',
    hp: 220,
    speed: 55,
    color: '#000000',
    reward: 90,
    waveUnlock: 15
  },
  green_dragon: {
    type: 'green_dragon',
    renderScale: 1.35,
    name: 'Green Dragon',
    hp: 75,
    speed: 45,
    color: '#228b22',
    reward: 30,
    deathSound: 'dragon',
    waveUnlock: 7
  },
  jad: {
    type: 'jad',
    name: 'TzTok-Jad',
    hp: 750,
    speed: 20,
    color: '#ff4500',
    reward: 400,
    deathSound: 'boss',
    isBoss: true,
    resistance: 0.5
  },
  vorkath: {
    type: 'vorkath',
    name: 'Vorkath',
    hp: 2250,
    speed: 15,
    color: '#4682b4',
    reward: 700,
    deathSound: 'boss',
    isBoss: true,
    resistance: 0.6
  },
  zulrah: {
    type: 'zulrah',
    name: 'Zulrah',
    hp: 1500,
    speed: 25,
    color: '#32cd32',
    reward: 800,
    deathSound: 'boss',
    isBoss: true,
    resistance: 0.4,
    // Zulrah's serpentine sprite has heavy padding; scale up so it reads as
    // large as Jad/Vorkath on the field.
    renderScale: 1.6
  },
  barrow_wight: {
    type: 'barrow_wight',
    name: 'Barrow Wight',
    hp: 100,
    speed: 35,
    color: '#8b0000',
    reward: 24,
    deathSound: 'demon',
    waveUnlock: 8
  },
  chaos_druid: {
    type: 'chaos_druid',
    name: 'Chaos Druid',
    hp: 30,
    speed: 55,
    color: '#2e8b57',
    reward: 9,
    deathSound: 'human',
    waveUnlock: 3
  },
  skeletal_mage: {
    type: 'skeletal_mage',
    name: 'Skeletal Mage',
    hp: 29,
    speed: 50,
    color: '#add8e6',
    reward: 15,
    deathSound: 'zombie',
    waveUnlock: 5
  },
  hydra: {
    type: 'hydra',
    renderScale: 1.5,
    name: 'Alchemical Hydra',
    // A mechanic boss (chemical vents / burst check): HP sits between Zulrah's
    // 1500 and Vorkath's 2250 so its vent windows have something to chew on.
    // `isBoss` also takes it out of the random spawn pool (wave-generation filters
    // bosses out) — bosses arrive on the schedule instead (see `rollWaveBosses`).
    hp: 1800,
    speed: 30,
    color: '#006400',
    reward: 750,
    deathSound: 'boss',
    isBoss: true,
    resistance: 0.45
  },
  giant_mole: {
    type: 'giant_mole',
    // The mole model is low and squat; scale up so it reads as a boss on the field.
    renderScale: 1.4,
    name: 'Giant Mole',
    // The gentlest boss, and the one a fresh account meets first (wave 10). Its HP
    // sits under Jad's 750 because the burrow already buys it survival: every cycle
    // it spends ~1s untouchable and skips the stretch you fortified. It is quick —
    // a mole that dawdled would never threaten anything — but each burrow also
    // pins it in place for the dig and the climb out, so the speed is paid for.
    hp: 700,
    speed: 40,
    color: '#6b4f36',
    reward: 380,
    deathSound: 'boss',
    isBoss: true,
    resistance: 0.3
  },
  dusk: {
    type: 'dusk',
    renderScale: 1.35,
    name: 'Dusk',
    // Half of the Grotesque Guardians, and the half a wave actually draws — he brings
    // Dawn with him. Their HP is set *per statue*, so the pair is ~2200 between them,
    // in Vorkath's league. It has to be split-able: the whole fight is about bleeding
    // both down together, which a single fat HP bar could never ask for.
    hp: 1100,
    speed: 22,
    color: '#6d7a5e',
    deathSound: 'boss',
    isBoss: true,
    reward: 480,
    resistance: 0.4
  },
  cerberus: {
    type: 'cerberus',
    renderScale: 1.5,
    name: 'Cerberus',
    // The style-lock check, and the last boss before the Hydra. His HP is high because
    // most of the fight is spent *not* hitting him: with all three souls up he is
    // armoured against everything, so the bar only really moves once the board has an
    // answer. It has to be worth the detour.
    hp: 2100,
    speed: 26,
    color: '#8b1a1a',
    deathSound: 'boss',
    isBoss: true,
    reward: 820,
    resistance: 0.45
  },
  summoned_soul: {
    type: 'summoned_soul',
    renderScale: 0.85,
    name: 'Summoned Soul',
    // An escort, not a wave enemy: Cerberus spawns it, it orbits him, it never walks the
    // path and it pays nothing on death (the payoff is the style it gives you back).
    // Its real HP is scaled off Cerberus at summon time; these are only the fallbacks.
    hp: 160,
    speed: 70,
    color: '#cfd8e6',
    reward: 0
  },
  dawn: {
    type: 'dawn',
    renderScale: 1.35,
    name: 'Dawn',
    // Never scheduled on her own (she is not in SCHEDULABLE_BOSSES) — Dusk summons her.
    // She flies, so she is the faster of the two, and the one that runs away with the
    // lead if you let the link stand.
    hp: 1100,
    speed: 28,
    color: '#8f7fbf',
    deathSound: 'boss',
    isBoss: true,
    reward: 480,
    resistance: 0.4
  },
  superior_bloodveld: {
    type: 'superior_bloodveld',
    renderScale: 1.3,
    name: 'Insatiable Bloodveld',
    hp: 312,
    speed: 50,
    color: '#ff1493',
    reward: 100,
    waveUnlock: 10
  },
  superior_abyssal_demon: {
    type: 'superior_abyssal_demon',
    renderScale: 1.25,
    name: 'Greater Abyssal Demon',
    hp: 400,
    speed: 75,
    color: '#8a2be2',
    reward: 150,
    deathSound: 'abyssal_demon',
    waveUnlock: 12
  },
  superior_gargoyle: {
    type: 'superior_gargoyle',
    renderScale: 1.3,
    name: 'Marble Gargoyle',
    hp: 215,
    speed: 40,
    color: '#696969',
    reward: 120,
    waveUnlock: 9
  },
  superior_nechryael: {
    type: 'superior_nechryael',
    renderScale: 1.35,
    name: 'Nechryarch',
    hp: 312,
    speed: 50,
    color: '#483d8b',
    reward: 130,
    waveUnlock: 11
  }
};

/**
 * Elemental weaknesses, themed so each element has worthwhile targets across
 * the whole roster: Water counters fire creatures & demons, Fire counters the
 * undead/nature/insects, Earth grounds giants/dragons/stone/reptiles, and Air
 * preys on the agile/magical/ethereal. An Elemental wizard deals +50% to an
 * enemy matching its element (see systems/magic `weaknessMultiplier`).
 */
const WEAKNESSES: Partial<Record<string, Element>> = {
  // Water — fire creatures & demons
  imp: 'water', hellhound: 'water', fire_giant: 'water', lesser_demon: 'water',
  black_demon: 'water', abyssal_demon: 'water', superior_abyssal_demon: 'water',
  nechryael: 'water', superior_nechryael: 'water', jad: 'water',
  // Fire — undead, nature & insects
  skeleton: 'fire', zombie: 'fire', barrow_wight: 'fire', spider: 'fire',
  scorpion: 'fire', chaos_druid: 'fire', cow: 'fire',
  // Earth — giants, dragons, stone & reptiles
  goblin: 'earth', hill_giant: 'earth', gargoyle: 'earth', superior_gargoyle: 'earth',
  blue_dragon: 'earth', green_dragon: 'earth', vorkath: 'earth', hydra: 'earth',
  bloodveld: 'earth', superior_bloodveld: 'earth', giant_mole: 'earth',
  // Living statues: stone answers to earth. Both halves read the same, so the pair
  // never splits the player's answer — the fight is about order, not element.
  dusk: 'earth', dawn: 'earth',
  // A hellhound: water, like every other demon-kin in the table.
  cerberus: 'water',
  // Air — agile, magical & ethereal
  rat: 'air', ghost: 'air', skeletal_mage: 'air', dark_beast: 'air', zulrah: 'air',
};

for (const [type, weakness] of Object.entries(WEAKNESSES)) {
  if (ENEMIES[type]) ENEMIES[type].weakness = weakness;
}
