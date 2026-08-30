import type { Element, EnemyDef, StyleWeakness } from '../types';

// `hp` mirrors each monster's real OSRS hitpoints. `reward` is a "threat weight"
// used only to size waves (see wave-generation); the gold the player earns is
// derived from (wave-scaled) HP in systems/rewards, not from `reward`.
// `region` is the home tag: absent means generic (rolls on any map), present means
// the monster only appears while the run is in that region. Seventeen of these are
// local; the rest are the backbone every biome fills its waves from. The split is
// enforced in systems/enemy-regions and reasoned about in docs/enemy-roster.md.
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
    region: 'lumbridge',
    renderScale: 1.05,
    name: 'Cow',
    hp: 8,
    speed: 40,
    color: '#ffffff',
    reward: 3,
    waveUnlock: 2
  },
  // ── Misthalin ──────────────────────────────────────────────────────────────
  // Lumbridge and Varrock's own ladder, so the tutorial region stops playing on
  // the generic backbone with a cow in it. `hp` is each monster's real OSRS
  // hitpoints; the seven span wave 1 to wave 7 without touching the backbone.
  cave_bug: {
    type: 'cave_bug',
    region: 'lumbridge',
    renderScale: 0.8,
    name: 'Cave bug',
    hp: 5,
    speed: 95,
    color: '#8a7b3f',
    reward: 2,
    waveUnlock: 1
  },
  cave_slime: {
    type: 'cave_slime',
    region: 'lumbridge',
    renderScale: 0.9,
    name: 'Cave slime',
    hp: 25,
    speed: 30,
    color: '#8fbf5f',
    reward: 6,
    waveUnlock: 3
  },
  big_frog: {
    type: 'big_frog',
    region: 'lumbridge',
    renderScale: 0.95,
    name: 'Big frog',
    hp: 25,
    speed: 75,
    color: '#3f7a3f',
    reward: 6,
    waveUnlock: 3
  },
  hobgoblin: {
    type: 'hobgoblin',
    region: 'lumbridge',
    name: 'Hobgoblin',
    hp: 29,
    speed: 60,
    color: '#7d6a3a',
    reward: 8,
    waveUnlock: 4
  },
  giant_bat: {
    type: 'giant_bat',
    region: 'lumbridge',
    renderScale: 1.1,
    name: 'Giant bat',
    hp: 32,
    speed: 110,
    color: '#5a4b40',
    reward: 9,
    waveUnlock: 4
  },
  moss_giant: {
    type: 'moss_giant',
    region: 'lumbridge',
    renderScale: 1.5,
    name: 'Moss giant',
    hp: 60,
    speed: 32,
    color: '#55703f',
    reward: 14,
    waveUnlock: 5
  },
  giant_frog: {
    type: 'giant_frog',
    region: 'lumbridge',
    renderScale: 1.25,
    name: 'Giant frog',
    hp: 100,
    speed: 65,
    color: '#2f6b34',
    reward: 20,
    waveUnlock: 7
  },
  // ── Kharidian Desert ───────────────────────────────────────────────────────
  // The desert played on one scorpion and the backbone. These nine give it its own
  // ladder — the carrion birds and pack hunters at the bottom, the kalphite hive as
  // its spine, and the tomb-dwellers as its heavy end. `hp` is each monster's real
  // OSRS hitpoints.
  vulture: {
    type: 'vulture',
    region: 'alkharid',
    name: 'Vulture',
    hp: 10,
    speed: 105,
    color: '#6b5c4a',
    reward: 3,
    waveUnlock: 1
  },
  desert_lizard: {
    type: 'desert_lizard',
    region: 'alkharid',
    renderScale: 0.9,
    name: 'Desert lizard',
    hp: 25,
    speed: 70,
    color: '#c8b070',
    reward: 6,
    waveUnlock: 3
  },
  jackal: {
    type: 'jackal',
    region: 'alkharid',
    renderScale: 0.85,
    name: 'Jackal',
    hp: 27,
    speed: 100,
    color: '#a67c52',
    reward: 7,
    waveUnlock: 3
  },
  kalphite_worker: {
    type: 'kalphite_worker',
    region: 'alkharid',
    name: 'Kalphite Worker',
    hp: 40,
    speed: 55,
    color: '#b08a4a',
    reward: 11,
    waveUnlock: 4
  },
  scarab_mage: {
    type: 'scarab_mage',
    region: 'alkharid',
    renderScale: 0.95,
    name: 'Scarab mage',
    hp: 50,
    speed: 50,
    color: '#8a6f3a',
    reward: 13,
    waveUnlock: 5
  },
  mummy: {
    type: 'mummy',
    region: 'alkharid',
    renderScale: 1.1,
    name: 'Mummy',
    hp: 90,
    speed: 30,
    color: '#cdc4ad',
    reward: 20,
    waveUnlock: 6
  },
  locust_rider: {
    type: 'locust_rider',
    region: 'alkharid',
    renderScale: 1.2,
    name: 'Locust rider',
    hp: 90,
    speed: 60,
    color: '#9b7f3c',
    reward: 22,
    waveUnlock: 7
  },
  dust_devil: {
    type: 'dust_devil',
    region: 'alkharid',
    renderScale: 1.05,
    name: 'Dust devil',
    hp: 105,
    speed: 85,
    color: '#7a6f66',
    reward: 26,
    waveUnlock: 8
  },
  kalphite_guardian: {
    type: 'kalphite_guardian',
    region: 'alkharid',
    renderScale: 1.6,
    name: 'Kalphite Guardian',
    hp: 170,
    speed: 35,
    color: '#8a6b2f',
    reward: 40,
    waveUnlock: 9
  },
  // ───────────────────────────────────────────────────────────────────────────
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
    region: 'morytania',
    name: 'Ghost',
    hp: 19,
    speed: 50,
    color: '#e0ffff',
    reward: 3,
    waveUnlock: 1
  },
  hellhound: {
    type: 'hellhound',
    region: 'wilderness',
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
    region: 'alkharid',
    renderScale: 0.85,
    name: 'Scorpion',
    hp: 17,
    speed: 60,
    color: '#d2b48c',
    reward: 7,
    waveUnlock: 3
  },
  harpie_bug_swarm: {
    type: 'harpie_bug_swarm',
    region: 'karamja',
    renderScale: 0.9,
    name: 'Harpie Bug Swarm',
    hp: 25,
    speed: 115,
    color: '#22354f',
    reward: 8,
    waveUnlock: 3
  },
  fire_giant: {
    type: 'fire_giant',
    region: 'tzhaar',
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
  ice_warrior: {
    type: 'ice_warrior',
    region: 'trollweiss',
    name: 'Ice Warrior',
    hp: 59,
    speed: 55,
    color: '#8fd0e8',
    reward: 13,
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
    region: 'morytania',
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
    region: 'morytania',
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
  jogre: {
    type: 'jogre',
    region: 'karamja',
    renderScale: 1.45,
    name: 'Jogre',
    hp: 70,
    speed: 35,
    color: '#6b7f4a',
    reward: 15,
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
    region: 'wilderness',
    renderScale: 1.35,
    name: 'Green Dragon',
    hp: 75,
    speed: 45,
    color: '#228b22',
    reward: 30,
    deathSound: 'dragon',
    waveUnlock: 7
  },
  ice_troll: {
    type: 'ice_troll',
    region: 'trollweiss',
    renderScale: 1.35,
    name: 'Ice Troll',
    hp: 80,
    speed: 30,
    color: '#b9c6cc',
    reward: 26,
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
    region: 'morytania',
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
    region: 'wilderness',
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
    region: 'morytania',
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
  brutus: {
    type: 'brutus',
    name: 'Brutus',
    // The first boss a fresh account meets, and the lightest on the ladder. His charge
    // buys him nothing but a few seconds out of your towers' reach — he never skips road
    // the way the Mole does — so he needs less health than the Mole to stay honest. A
    // bull that ambled would read as a joke, so he is quick, but every charge costs him
    // the walk back: the speed is paid for twice over.
    hp: 520,
    speed: 46,
    color: '#8a5a3b',
    reward: 320,
    deathSound: 'boss',
    isBoss: true,
    resistance: 0.25
  },
  scurrius: {
    type: 'scurrius',
    name: 'Scurrius',
    // The tier-0 companion to Brutus. He needs a *deep* bar rather than a tough one:
    // the fight is about the bar being split up, so it has to have enough in it to
    // split. His real OSRS hitpoints are 500 (cache NPC 7222, stats[3]); the extra
    // here buys the shear enough room to fire several times before the floor.
    hp: 900,
    speed: 40,
    color: '#7d6b58',
    reward: 340,
    deathSound: 'boss',
    isBoss: true,
    resistance: 0.2
  },
  kbd: {
    type: 'kbd',
    // He is the biggest thing on the board and has to read that way at a glance.
    renderScale: 1.5,
    name: 'King Black Dragon',
    // Fourth on the ladder, between the Mole (700) and Jad (750). His mechanic takes
    // nothing away from the player's board except its *value*, so he cannot lean on the
    // bar the way Vorkath does — the fight is meant to be decided by where the towers
    // were built, not by how long the health lasts. The dragonfire is already a large
    // effective damage cut against a clustered board, and doubling that with a fat bar
    // would just be a wall.
    hp: 780,
    speed: 34,
    color: '#3f3a44',
    reward: 420,
    deathSound: 'boss',
    isBoss: true,
    resistance: 0.3
  },
  giant_rat: {
    type: 'giant_rat',
    // Sheared off Scurrius, so it lives on his Collection Log page rather than in the
    // Monsters roster — it is not something a wave can send.
    summonedBy: 'scurrius',
    // The cache's Giant rat (NPC 7223) shares its rig with NPC 2510, which the game
    // already ships baked as `rat`. Pointing at that slug costs no new asset work.
    animSlug: 'rat',
    renderScale: 0.9,
    name: 'Giant Rat',
    // Overwritten per-spawn from `scurriusRatHp` — this is only the table default.
    hp: 54,
    speed: 64,
    color: '#8b8b8b',
    // Deliberately small: the payoff for killing a rat is denying the refund, not gold.
    // Inflating gold here would pay the player for the boss's own mechanic firing.
    reward: 4
  },
  giant_mole: {
    type: 'giant_mole',
    // The mole model is low and squat; scale up so it reads as a boss on the field.
    renderScale: 1.4,
    // Its cell is shared with the burrow and climb-out clips, which sink the whole
    // model below the ground line, so the mole standing on the road is baked into
    // the top of that cell — measured, its body centre is ~0.3 of a drawn size
    // above the point it walks on. Everything that lands *on* the mole is raised
    // by that much; the dust rings still belong to the ground and stay put.
    bodyRise: 0.3,
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
    reward: 0,
    summonedBy: 'cerberus',
    // The trio (melee/ranged/magic) shares one type and one log line; the melee
    // soul stands in for it. On the field each gets its own clip via `animType`.
    animSlug: 'soul_melee'
  },
  yt_hurkot: {
    type: 'yt_hurkot',
    renderScale: 0.9,
    name: 'Yt-HurKot',
    // Jad's Fight-Cave healers: an escort, not a wave enemy. Below half HP Jad
    // summons a ring of them and they claw his health back until cut down; they
    // never walk the path and pay nothing (the payoff is denying Jad's heal).
    // Real HP is scaled off Jad at summon time — this is only the log's fallback.
    hp: 60,
    speed: 70,
    color: '#c94f2e',
    reward: 0,
    summonedBy: 'jad'
    // Slug defaults to `yt_hurkot` (its own baked clip) — no animSlug needed.
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
    hp: 330,
    speed: 75,
    color: '#8a2be2',
    reward: 150,
    deathSound: 'abyssal_demon',
    waveUnlock: 12
  },
  superior_gargoyle: {
    type: 'superior_gargoyle',
    region: 'morytania',
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
    region: 'morytania',
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
 * ── Weaknesses ──────────────────────────────────────────────────────────────
 *
 * Every monster gets **exactly one answer**, on exactly one of two axes:
 *
 * - an {@link Element} — the wizard's axis, four choices deep, +50% for the
 *   matching Elemental spell (systems/magic `weaknessMultiplier`);
 * - a {@link StyleWeakness} — melee or ranged, +50% for any tower of that style
 *   (systems/affixes `styleWeaknessMult`).
 *
 * The two never appear on the same species, and `styleWeakness` is never `magic`:
 * a magic answer is *always* spelled as an element, so the wizard's four-way choice
 * stays its own puzzle instead of collapsing into "wizard, any element". A test in
 * enemies.test.ts holds both rules.
 *
 * Why the split exists at all: before it, all 39 typed monsters carried an
 * elemental weakness and nothing else, so magic was the only style with favoured
 * targets and there was never a reason to answer a wave with a bow or a blade.
 *
 * Sourcing. The picks below come from each monster's real OSRS defence table
 * (`dstab`/`dslash`/`dcrush`, `dlight`/`dstandard`/`dheavy`, `dmagic` on the wiki
 * infobox): the style whose lowest defence sits clearly under the others. Where
 * OSRS ties all three — which is most of the low-level roster, and is why almost
 * nothing in OSRS is *genuinely* ranged-weak — the pick is ours, flagged inline.
 */

/** Elemental answers: Water counters fire creatures & demons, Fire the
 *  undead/nature/insects, Earth the dragons/stone/burrowers, Air the
 *  agile/magical/ethereal. */
const WEAKNESSES: Partial<Record<string, Element>> = {
  // Water — fire creatures & demons
  hellhound: 'water', fire_giant: 'water', lesser_demon: 'water',
  black_demon: 'water', abyssal_demon: 'water', superior_abyssal_demon: 'water',
  nechryael: 'water', superior_nechryael: 'water',
  // The one monster OSRS itself hands you the answer to: an ice cooler is what
  // kills a desert lizard, and water is this game's cold.
  desert_lizard: 'water',
  // Fire — undead, nature & insects
  zombie: 'fire', barrow_wight: 'fire', scorpion: 'fire', cow: 'fire',
  // Karamja's swarm is the fire bucket's other half — insects — and Trollweiss'
  // armoured warrior is the one answer no player needs told: ice melts.
  harpie_bug_swarm: 'fire', ice_warrior: 'fire',
  // Misthalin: a cave bug is an insect, and a moss giant is a walking hedge —
  // the two readings the fire bucket was written for.
  cave_bug: 'fire', moss_giant: 'fire',
  // Kharidian: a mummy is undead and a locust is an insect — the bucket's two
  // readings again, one on each of the desert's heavy bodies.
  mummy: 'fire', locust_rider: 'fire',
  // Earth — dragons, stone & burrowers
  blue_dragon: 'earth', green_dragon: 'earth', giant_mole: 'earth',
  // The dragon bucket's boss: the same answer as every other dragon on the board, so
  // meeting him never asks the player to re-learn what a dragon is weak to.
  kbd: 'earth',
  // The kalphite hive burrows, which is the whole reason the earth bucket lists
  // burrowers — and it keeps both rungs of the line reading the same.
  kalphite_worker: 'earth', kalphite_guardian: 'earth',
  // Living statues: stone answers to earth. Both halves read the same, so the pair
  // never splits the player's answer — the fight is about order, not element.
  dusk: 'earth', dawn: 'earth',
  // Earth, straight off the wiki: Brutus carries a 25% elemental weakness to it.
  brutus: 'earth',
  // Air — agile, magical & ethereal
  rat: 'air', giant_rat: 'air', ghost: 'air', zulrah: 'air',
  // The only thing on the board that actually flies.
  giant_bat: 'air',
  // The desert's flyer, and its whirlwind: a vulture circles and a dust devil is
  // literally moving air.
  vulture: 'air', dust_devil: 'air',
  // A deviation: OSRS gives Scurrius no elemental weakness at all. Leaving him blank
  // would make him the one boss the table skips, and it would read as an oversight
  // rather than a decision — every rat in the game is Air, including the ones he
  // shears off himself. Note the consequence: an Air wizard is paid the bonus on
  // both halves of the encounter, so shearing hands it *more* favoured targets.
  scurrius: 'air',
};

/** Combat-triangle answers: the monsters a bow or a blade is the right tool for. */
const STYLE_WEAKNESSES: Partial<Record<string, StyleWeakness>> = {
  // ── Melee ──
  // Crush is the lowest melee defence on every undead and every statue in OSRS,
  // and the gargoyles are the textbook case (dcrush −20 against dmagic +20 — the
  // rock-hammer monster). Their 40% Earth weakness is real too; the one-answer
  // rule picks the more iconic of the two.
  skeleton: 'melee', gargoyle: 'melee', superior_gargoyle: 'melee',
  // dstab 30 against dranged 100 / dmagic 90: a dark beast is armoured against
  // everything you'd rather use.
  dark_beast: 'melee',
  // Ours: OSRS gives goblins, hill giants and bloodvelds a flat defence across all
  // three styles and no element. They are also the three monsters an OSRS player
  // has meleed more than any other, so melee is where they read.
  goblin: 'melee', hill_giant: 'melee', bloodveld: 'melee', superior_bloodveld: 'melee',
  // A troll takes its lowest defence to crush in OSRS, and a troll is the monster
  // the word "crush" was invented for.
  ice_troll: 'melee',
  // Misthalin, and all three ours: OSRS ties every defence on these. A hobgoblin is
  // the rung an OSRS player meleed straight after the goblin, and a slime and a
  // giant frog are both soft, slow bodies you walk up to rather than kite.
  hobgoblin: 'melee', cave_slime: 'melee', giant_frog: 'melee',
  // Kharidian, ours: OSRS ties the jackal's defences too, and a jackal is an
  // unarmoured dog — nothing about it asks for a bow or a spell.
  jackal: 'melee',
  // dcrush 25 against dranged 100; and Vorkath's dmagic 240 is the highest defence
  // stat in this roster, so a lance is the answer to both.
  cerberus: 'melee', vorkath: 'melee',
  // The healers are 0 melee defence and 100 to everything else — reach them or
  // watch Jad drink. It is the mechanic, stated as a stat.
  yt_hurkot: 'melee',
  // ── Ranged ──
  // The only monster in the roster OSRS itself makes ranged-weak: dranged 45
  // against dstab 75 / dmagic 150.
  hydra: 'ranged',
  // Ours, and the reason this axis needed inventing at all: OSRS almost never
  // writes a ranged weakness down. Each of these is something you would rather
  // shoot than approach — a spider, a darting imp, an unarmoured druid, a mystic
  // behind its own magic defence (dmagic 140), and the fight every OSRS player
  // learns to range: Jad.
  spider: 'ranged', imp: 'ranged', chaos_druid: 'ranged', skeletal_mage: 'ranged',
  jad: 'ranged',
  // Ours, and the same argument: a jogre is slow, huge and melee-only, so the whole
  // point of one is never letting it arrive.
  jogre: 'ranged',
  // Ours: a big frog leaps, and the whole point of one is hitting it before it lands.
  big_frog: 'ranged',
  // Ours: the scarab mage hides behind its own magic defence and stands still to
  // cast, which is the definition of a target you shoot.
  scarab_mage: 'ranged',
};

for (const [type, weakness] of Object.entries(WEAKNESSES)) {
  if (ENEMIES[type]) ENEMIES[type].weakness = weakness;
}
for (const [type, styleWeakness] of Object.entries(STYLE_WEAKNESSES)) {
  if (ENEMIES[type]) ENEMIES[type].styleWeakness = styleWeakness;
}
