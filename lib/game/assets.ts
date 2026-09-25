import type { BiomeId, SceneryId } from './data/biomes';

// Locally-bundled assets extracted from the game cache (see
// scripts/extract-osrs-sprites.mjs). Served from `public/`, base-path aware so
// they resolve under a GitHub Pages project subpath too.
const LOCAL = `${process.env.NEXT_PUBLIC_BASE_PATH || ''}/assets`;

/** Authentic inventory icon baked from the game cache
 *  (scripts/render-osrs-items.mjs → public/assets/items/<slug>.png). */
export const itemIcon = (slug: string) => `${LOCAL}/items/${slug}.png`;

/** Cache-rendered NPC model portrait
 *  (scripts/render-osrs-npcs.mjs → public/assets/models/<slug>.png). */
export const npcModel = (slug: string) => `${LOCAL}/models/${slug}.png`;

/**
 * The coin pile the client would draw for a stack of `n`.
 *
 * OSRS swaps the Coins icon at fixed sizes — 1, 2, 3, 4, 5, 25, 100, 250, 1000,
 * 10000 — so a purse reads as an amount before the number is parsed. Those
 * thresholds and the item ids behind them are not invented here: item 995
 * carries them as `countObj`/`countCo` pairs in the cache, and each id is baked
 * to `coins_<threshold>.png` by scripts/render-osrs-items.mjs.
 *
 * Descending, so the first match wins. A stack of 0 falls through to the single
 * coin: the HUD does show 0 gold, and a coin pile that vanishes would make the
 * bar jump — in game a 0 stack simply does not exist, so there is nothing to be
 * faithful to.
 */
const COIN_STACKS: ReadonlyArray<readonly [number, string]> = [
  [10_000, 'coins_10000'], [1_000, 'coins_1000'], [250, 'coins_250'],
  [100, 'coins_100'], [25, 'coins_25'], [5, 'coins_5'],
  [4, 'coins_4'], [3, 'coins_3'], [2, 'coins_2'],
];

export const coinsIcon = (n: number): string => {
  for (const [min, slug] of COIN_STACKS) if (n >= min) return itemIcon(slug);
  return itemIcon('coins_1');
};

/**
 * Wiki-filename → locally-baked icon. Data tables (potion buffs, slayer rewards,
 * meta upgrades) key icons by wiki filename; `iconUrl` resolves them to the
 * cache-baked local asset.
 *
 * Every name a data table uses must have an entry here — assets come from the
 * game cache, never from an external host. `assets.test.ts` fails the build if
 * a table grows a name with no bake behind it.
 */
const LOCAL_BY_WIKI: Record<string, string> = {
  // Potion buffs (data/potion-buffs.ts `wiki` keys)
  'Ranging_potion(4)': itemIcon('ranging_potion'),
  'Magic_potion(4)': itemIcon('magic_potion'),
  'Super_combat_potion(4)': itemIcon('super_combat_potion'),
  'Overload_(4)': itemIcon('overload_4'),
  // Slayer rewards (data/slayer.ts `icon` keys) — each unlock wears the item it
  // actually is in game (the imbued helm, the bracelet that extends tasks, the
  // Eternal gem the superiors drop).
  Slayer_helmet: itemIcon('slayer_helmet'),
  'Slayer_helmet_(i)': itemIcon('slayer_helmet_i'),
  Bracelet_of_slaughter: itemIcon('bracelet_of_slaughter'),
  Expeditious_bracelet: itemIcon('expeditious_bracelet'),
  Slayer_ring: itemIcon('slayer_ring'),
  Giant_pouch: itemIcon('giant_pouch'),
  Eternal_gem: itemIcon('eternal_gem'),
  Enchanted_gem: itemIcon('enchanted_gem'),
  Pure_essence: itemIcon('pure_essence'),
  // Meta-progression upgrades (systems/meta-progression.ts `icon` keys)
  Coins_detail: itemIcon('coins'),
  Cannon_barrels: itemIcon('cannon_barrels'),
  Ranged_icon: `${LOCAL}/misc/ranged_icon.png`,
  Magic_icon: `${LOCAL}/misc/magic_icon.png`,
  Prayer_icon: `${LOCAL}/misc/prayer_icon.png`,
  // HUD icons that are real items
  Collection_log: itemIcon('collection_log'),
  // The assembled cannon is a scenery OBJECT (the item icon is a flatpack
  // crate), so this maps to the cache-rendered LOC from the objects pass.
  Dwarf_multicannon: `${LOCAL}/objects/dwarf_multicannon.png`,
};

/** A transparent 1x1 — what an unmapped icon renders as. Self-contained, so a
 *  missing bake shows nothing instead of reaching for an external host. */
const NO_ICON =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

/** Resolve a wiki icon filename (no extension) to its locally-baked asset. */
export const iconUrl = (wiki: string) => LOCAL_BY_WIKI[wiki] ?? NO_ICON;

/** The bakes `iconUrl` knows about — read by the asset-coverage test. */
export const localIconNames = (): string[] => Object.keys(LOCAL_BY_WIKI);

/**
 * Classic-mode tower gear icons (data/gear.ts `GEAR`), keyed by gear id.
 * The icon slug IS the gear id (see gear.ts's header comment) — baked from
 * the OSRS cache by scripts/render-osrs-items.mjs's "ammo/jewellery rework"
 * TARGETS group. Ammo/rune/kit ladders use `AmmoClass`-keyed comments below;
 * jewellery + the two boss-drop signatures follow.
 */
export const GEAR_ICONS: Record<string, string> = {
  // arrows
  bronze_arrow: itemIcon('bronze_arrow'),
  iron_arrow: itemIcon('iron_arrow'),
  steel_arrow: itemIcon('steel_arrow'),
  mithril_arrow: itemIcon('mithril_arrow'),
  adamant_arrow: itemIcon('adamant_arrow'),
  rune_arrow: itemIcon('rune_arrow'),
  amethyst_arrow: itemIcon('amethyst_arrow'),
  dragon_arrow: itemIcon('dragon_arrow'),
  // darts
  bronze_dart: itemIcon('bronze_dart'),
  iron_dart: itemIcon('iron_dart'),
  steel_dart: itemIcon('steel_dart'),
  black_dart: itemIcon('black_dart'),
  mithril_dart: itemIcon('mithril_dart'),
  adamant_dart: itemIcon('adamant_dart'),
  rune_dart: itemIcon('rune_dart'),
  dragon_dart: itemIcon('dragon_dart'),
  // cannonballs
  cannonball: itemIcon('cannonball'),
  granite_cannonball: itemIcon('granite_cannonball'),
  // runes
  mind_rune: itemIcon('mind_rune'),
  chaos_rune: itemIcon('chaos_rune'),
  tome_of_water: itemIcon('tome_of_water'),
  tome_of_earth: itemIcon('tome_of_earth'),
  death_rune: itemIcon('death_rune'),
  tome_of_fire: itemIcon('tome_of_fire'),
  blood_rune: itemIcon('blood_rune'),
  mages_book: itemIcon('mages_book'),
  wrath_rune: itemIcon('wrath_rune'),
  // melee_kit: gloves
  bronze_gloves: itemIcon('bronze_gloves'),
  iron_gloves: itemIcon('iron_gloves'),
  steel_gloves: itemIcon('steel_gloves'),
  black_gloves: itemIcon('black_gloves'),
  mithril_gloves: itemIcon('mithril_gloves'),
  adamant_gloves: itemIcon('adamant_gloves'),
  rune_gloves: itemIcon('rune_gloves'),
  dragon_gloves: itemIcon('dragon_gloves'),
  barrows_gloves: itemIcon('barrows_gloves'),
  // melee_kit: defenders
  bronze_defender: itemIcon('bronze_defender'),
  iron_defender: itemIcon('iron_defender'),
  steel_defender: itemIcon('steel_defender'),
  black_defender: itemIcon('black_defender'),
  mithril_defender: itemIcon('mithril_defender'),
  adamant_defender: itemIcon('adamant_defender'),
  rune_defender: itemIcon('rune_defender'),
  dragon_defender: itemIcon('dragon_defender'),
  avernic_defender: itemIcon('avernic_defender'),
  // universal jewellery
  amulet_of_strength: itemIcon('amulet_of_strength'),
  amulet_of_power: itemIcon('amulet_of_power'),
  amulet_of_glory: itemIcon('amulet_of_glory'),
  amulet_of_fury: itemIcon('amulet_of_fury'),
  amulet_of_torture: itemIcon('amulet_of_torture'),
  // boss-drop signatures
  amulet_of_blood_fury: itemIcon('amulet_of_blood_fury'),
  salve_amulet_ei: itemIcon('salve_amulet_ei'),
  amulet_of_the_damned: itemIcon('amulet_of_the_damned'),
};

/**
 * Spell-icon URLs keyed by wiki file name (e.g. `Fire_Wave`, `Ice_Barrage`),
 * generated from the elemental (Wind/Water/Earth/Fire × Strike/Bolt/Blast/Wave)
 * and ancient (Ice/Blood/Shadow/Smoke × Rush/Burst/Blitz/Barrage) lines. Used as
 * both the tower's spell badge and its projectile sprite. Keys mirror
 * `systems/magic`'s `*SpellName` helpers; a missing file degrades gracefully.
 */
const SPELL_ICONS: Record<string, string> = {};
for (const w of ['Wind', 'Water', 'Earth', 'Fire']) {
  for (const t of ['Strike', 'Bolt', 'Blast', 'Wave']) SPELL_ICONS[`${w}_${t}`] = `${LOCAL}/spells/${w}_${t}.png`;
}
for (const w of ['Ice', 'Blood', 'Shadow', 'Smoke']) {
  for (const t of ['Rush', 'Burst', 'Blitz', 'Barrage']) SPELL_ICONS[`${w}_${t}`] = `${LOCAL}/spells/${w}_${t}.png`;
}
// Utility (Arceuus spellbook) support-spell icons.
SPELL_ICONS['Death_Charge'] = `${LOCAL}/spells/Death_Charge.png`;
SPELL_ICONS['Undead_Grasp'] = `${LOCAL}/spells/Undead_Grasp.png`;
SPELL_ICONS['Vile_Vigour'] = `${LOCAL}/spells/Vile_Vigour.png`;
// Standard-book Curse — the "Curse of Darkness" wave-event badge.
SPELL_ICONS['Curse'] = `${LOCAL}/spells/Curse.png`;

// --- Sound effects decoded straight from the OSRS game cache ----------------
// (scripts/extract-osrs-sounds.mjs → public/assets/sounds/). IDs sourced from
// the wiki's List_of_sound_IDs config names, so every clip is the authentic
// in-game sound rather than a sparse wiki transcode.
const SND = `${LOCAL}/sounds`;

// Tower attack + spell-cast clips, keyed to match the legacy `shoot` shape the
// sound layer already reads (`wizard_<el>` 0-4 = Strike/Bolt/Blast/Wave/Surge,
// `ancient_<el>` 0-3 = Rush/Burst/Blitz/Barrage).
const SHOOT_SOUNDS: Record<string, Record<number, string>> = {
  archer: { 1: `${SND}/fire_archer.wav` },
  cannon: { 1: `${SND}/fire_cannon.wav` },
  tzhaar: { 1: `${SND}/fire_tzhaar.wav` },
  slayer: { 1: `${SND}/fire_slayer.wav` },
  toxic: { 1: `${SND}/fire_toxic.wav` },
  support: { 1: `${SND}/cast_support.wav` },
};
for (const el of ['air', 'water', 'earth', 'fire']) {
  SHOOT_SOUNDS[`wizard_${el}`] = { 0: `${SND}/cast_${el}_1.wav`, 1: `${SND}/cast_${el}_2.wav`, 2: `${SND}/cast_${el}_3.wav`, 3: `${SND}/cast_${el}_4.wav`, 4: `${SND}/cast_${el}_5.wav` };
}
// Ancients reuse one cast clip across all four tiers (the per-tier variety is in
// the HIT clip), so every index points at the same `cast_<el>.wav`.
for (const an of ['ice', 'blood', 'shadow', 'smoke']) {
  const cast = `${SND}/cast_${an}.wav`;
  SHOOT_SOUNDS[`ancient_${an}`] = { 0: cast, 1: cast, 2: cast, 3: cast };
}

// Spell IMPACT clips, played when a bolt connects (keyed `<el|anc>_<tier>`).
// Elemental has five tiers (Strike..Surge); ancients have four (Rush..Barrage).
const SPELL_HIT: Record<string, string> = {};
for (const el of ['air', 'water', 'earth', 'fire']) {
  for (let l = 1; l <= 5; l++) SPELL_HIT[`${el}_${l}`] = `${SND}/hit_${el}_${l}.wav`;
}
for (const an of ['ice', 'blood', 'shadow', 'smoke']) {
  for (let l = 1; l <= 4; l++) SPELL_HIT[`${an}_${l}`] = `${SND}/hit_${an}_${l}.wav`;
}

// Per-enemy-type death clips — each enemy maps to its own cache death sound.
const DEATH_TYPES = [
  'goblin', 'rat', 'cow', 'imp', 'spider', 'skeleton', 'zombie', 'ghost',
  'hellhound', 'scorpion', 'fire_giant', 'bloodveld', 'hill_giant', 'black_demon',
  'gargoyle', 'blue_dragon', 'nechryael', 'abyssal_demon', 'lesser_demon',
  'dark_beast', 'green_dragon', 'jad', 'vorkath', 'zulrah', 'barrow_wight',
  'chaos_druid', 'skeletal_mage', 'hydra', 'superior_bloodveld',
  'superior_abyssal_demon', 'superior_gargoyle', 'superior_nechryael',
  // Bosses and their adds — each with its own cry, never a borrowed one.
  'giant_mole', 'cerberus', 'dusk', 'dawn', 'yt_hurkot', 'summoned_soul',
  'scurrius', 'brutus', 'kbd', 'corporeal_beast', 'dark_core',
  // General Graardor and his three sergeants. He dies with the clip OSRS files under his
  // own name (`godwars_bandos_avatar_death`); the sergeants are orks, and OSRS ships one
  // ork death cry for all of them — one voice they genuinely share, not a borrowed one.
  'graardor', 'strongstack', 'steelwill', 'grimspike',
  // Nex and her wards. She dies with her own `nex2021_death`; the four acolytes are
  // voiceless in the cache, so Fumus bakes the human death cry and the other three alias
  // to it below -- one file, because it is literally the same clip.
  'nex', 'fumus',
  // Kharidian. Every one of these used to borrow a neighbour's voice; each now
  // ships the clip OSRS itself files under that monster's name. Two took a
  // deduction: the kalphite Guardian's family is filed `kalthite_lord` (Jagex's
  // own spelling, and OSRS's four kalphites are Worker/Soldier/Guardian/Queen
  // against sound families worker/soldier/lord/queen), and the Scarab mage's is
  // `locust_mage` — NPC 794 sits beside the Locust rider (795) and the family
  // runs locust / locust_mage / locust_rider in step.
  'mummy', 'scarab_mage', 'locust_rider', 'kalphite_worker', 'kalphite_guardian',
  'jackal', 'vulture', 'desert_lizard', 'dust_devil',
  // The Wilderness, Karamja, Trollweiss and the Fight Caves. Four of these die with a
  // clip filed under a neighbour's name rather than their own, because the cache holds
  // no clip under theirs: the Ankou (the skeleton's cry, its own species'), the Tz-Kih
  // (the caves' Hur cry — there is no kih or kek clip at all), the Cave horror (the
  // horror family's death, whose only cave-variant entry is a howl) and the Giant
  // mosquito (the one mosquito death the cache ships). Each was settled with the user.
  'ankou', 'ent', 'giant_mosquito', 'cave_horror', 'bronze_dragon',
  'wolf', 'thrower_troll', 'troll_general',
  'tz_kih', 'tok_xil', 'yt_mejkot', 'ket_zek',
  // Misthalin. Both frogs are filed under `toad`, OSRS's own name for them.
  'cave_bug', 'cave_slime', 'giant_bat', 'big_frog', 'giant_frog',
  // The regional locals. The Ice troll is the one concession: OSRS gives it its
  // own hit and attack clips but no death of its own, so `troll_death` is the
  // sound the game itself falls back to for it.
  'ice_warrior', 'ice_troll', 'harpie_bug_swarm',
];
const DEATH_SOUNDS: Record<string, string> = {};
for (const t of DEATH_TYPES) DEATH_SOUNDS[t] = `${SND}/death_${t}.wav`;

// The three shared clips below are not stand-ins — OSRS genuinely gives these
// pairs one voice, so a second copy of the same bytes would be dead weight.
// `rat` in this game *is* the cache's Giant rat (NPC 2510), and Scurrius' own rat
// (7223) shares that rig and that cry; a hobgoblin is a goblin's throat; and every
// giant in OSRS dies to the same bellow, so the moss giant is the hill giant's.
DEATH_SOUNDS.giant_rat = DEATH_SOUNDS.rat;
DEATH_SOUNDS.hobgoblin = DEATH_SOUNDS.goblin;
DEATH_SOUNDS.moss_giant = DEATH_SOUNDS.hill_giant;
// The one voice still borrowed, and deliberately so — a settled exception, not a
// loose end. OSRS has no jogre death clip at all: the whole named sound map holds
// no `jogre` and no plain ogre death, only the undead Zogre's (916), which is a
// different creature. So the Jogre keeps the hill giant's bellow. Written down in
// docs/enemy-roster.md beside the death-cry rule; do not cite it as a precedent.
DEATH_SOUNDS.jogre = DEATH_SOUNDS.hill_giant;
// Nex's four acolytes are the same legitimate case as the giants: they are human-rigged,
// the cache gives them no voice of their own, and the clip they die to is the one human
// death cry OSRS ships. Fumus bakes it; the other three point at that same file.
DEATH_SOUNDS.umbra = DEATH_SOUNDS.fumus;
DEATH_SOUNDS.cruor = DEATH_SOUNDS.fumus;
DEATH_SOUNDS.glacies = DEATH_SOUNDS.fumus;
// The Fight Caves' Kek, and the smaller one it splits into. The cache ships no kek
// clip at any name — `scripts/data/osrs-sound-names.tsv` holds hur, xil, mej and ket
// and nothing else, and every one of the Kek's own animations carries an empty sound
// map — so this is the same absence the Tz-Kih was settled on, answered the same way:
// the caves' Hur cry, which is the file the Tz-Kih already bakes. It is also the lightest
// of the four, and the other three are already spoken for by Ket-Zek, Yt-MejKot and
// Tok-Xil. One clip, because the two Tz-Keks are one creature at two sizes. Settled with
// the user, like the other four; see docs/enemy-roster.md.
DEATH_SOUNDS.tz_kek = DEATH_SOUNDS.tz_kih;
DEATH_SOUNDS.tz_kek_half = DEATH_SOUNDS.tz_kih;

export const ASSETS = {
  spells: SPELL_ICONS,
  // The start screen's castle lobby: two raw cache textures
  // (scripts/render-osrs-objects.mjs) and the torch LOC's flame as an 18-frame
  // sheet (scripts/render-osrs-spotanims.mjs, `lobby_torch`).
  lobby: {
    wall: `${LOCAL}/lobby/lobby_wall.png`,
    floor: `${LOCAL}/lobby/lobby_floor.png`,
    torch: `${LOCAL}/spotanims/lobby_torch.png`,
  },
  // Enemy & pet portraits — NPC models rendered from the game cache
  // (scripts/render-osrs-npcs.mjs, same NPC ids as the animated clips),
  // served locally from public/assets/models/.
  enemies: {
    goblin: `${LOCAL}/models/goblin.png`,
    rat: `${LOCAL}/models/rat.png`,
    cow: `${LOCAL}/models/cow.png`,
    imp: `${LOCAL}/models/imp.png`,
    spider: `${LOCAL}/models/spider.png`,
    scorpion: `${LOCAL}/models/scorpion.png`,
    hill_giant: `${LOCAL}/models/hill_giant.png`,
    lesser_demon: `${LOCAL}/models/lesser_demon.png`,
    green_dragon: `${LOCAL}/models/green_dragon.png`,
    blue_dragon: `${LOCAL}/models/blue_dragon.png`,
    black_demon: `${LOCAL}/models/black_demon.png`,
    abyssal_demon: `${LOCAL}/models/abyssal_demon.png`,
    barrow_wight: `${LOCAL}/models/barrow_wight.png`,   // Dharok the Wretched
    chaos_druid: `${LOCAL}/models/chaos_druid.png`,
    skeletal_mage: `${LOCAL}/models/skeletal_mage.png`,
    skeleton: `${LOCAL}/models/skeleton.png`,
    zombie: `${LOCAL}/models/zombie.png`,
    ghost: `${LOCAL}/models/ghost.png`,
    hellhound: `${LOCAL}/models/hellhound.png`,
    fire_giant: `${LOCAL}/models/fire_giant.png`,
    bloodveld: `${LOCAL}/models/bloodveld.png`,
    gargoyle: `${LOCAL}/models/gargoyle.png`,
    nechryael: `${LOCAL}/models/nechryael.png`,
    dark_beast: `${LOCAL}/models/dark_beast.png`,
    hydra: `${LOCAL}/models/hydra.png`,
    brutus: `${LOCAL}/models/brutus.png`,
    kbd: `${LOCAL}/models/kbd.png`,                     // King Black Dragon
    giant_mole: `${LOCAL}/models/giant_mole.png`,
    dusk: `${LOCAL}/models/dusk.png`,                   // Grotesque Guardians
    dawn: `${LOCAL}/models/dawn.png`,
    cerberus: `${LOCAL}/models/cerberus.png`,
    corporeal_beast: `${LOCAL}/models/corporeal_beast.png`,
    dark_core: `${LOCAL}/models/dark_core.png`,
    graardor: `${LOCAL}/models/graardor.png`,           // General Graardor
    strongstack: `${LOCAL}/models/strongstack.png`,     // Sergeant Strongstack (his melee guard)
    steelwill: `${LOCAL}/models/steelwill.png`,         // Sergeant Steelwill (his mage guard)
    grimspike: `${LOCAL}/models/grimspike.png`,         // Sergeant Grimspike (his ranged guard)
    nex: `${LOCAL}/models/nex.png`,                     // Nex
    fumus: `${LOCAL}/models/fumus.png`,                 // Fumus, her smoke acolyte
    umbra: `${LOCAL}/models/umbra.png`,                 // Umbra, her shadow acolyte
    cruor: `${LOCAL}/models/cruor.png`,                 // Cruor, her blood acolyte
    glacies: `${LOCAL}/models/glacies.png`,             // Glacies, her ice acolyte
    summoned_soul: `${LOCAL}/models/summoned_soul.png`,
    jad: `${LOCAL}/models/jad.png`,                     // TzTok-Jad
    vorkath: `${LOCAL}/models/vorkath.png`,
    zulrah: `${LOCAL}/models/zulrah.png`,               // serpentine
    superior_bloodveld: `${LOCAL}/models/superior_bloodveld.png`,         // Insatiable Bloodveld
    superior_abyssal_demon: `${LOCAL}/models/superior_abyssal_demon.png`, // Greater abyssal demon
    superior_gargoyle: `${LOCAL}/models/superior_gargoyle.png`,           // Marble gargoyle
    superior_nechryael: `${LOCAL}/models/superior_nechryael.png`,         // Nechryarch
    // Regional locals — each one only ever walks its own biome.
    ice_warrior: `${LOCAL}/models/ice_warrior.png`,                       // Trollweiss
    ice_troll: `${LOCAL}/models/ice_troll.png`,
    jogre: `${LOCAL}/models/jogre.png`,                                   // Karamja
    harpie_bug_swarm: `${LOCAL}/models/harpie_bug_swarm.png`,
    cave_bug: `${LOCAL}/models/cave_bug.png`,                             // Misthalin
    cave_slime: `${LOCAL}/models/cave_slime.png`,
    big_frog: `${LOCAL}/models/big_frog.png`,
    giant_frog: `${LOCAL}/models/giant_frog.png`,
    hobgoblin: `${LOCAL}/models/hobgoblin.png`,
    giant_bat: `${LOCAL}/models/giant_bat.png`,
    moss_giant: `${LOCAL}/models/moss_giant.png`,
    vulture: `${LOCAL}/models/vulture.png`,                               // Kharidian
    desert_lizard: `${LOCAL}/models/desert_lizard.png`,
    jackal: `${LOCAL}/models/jackal.png`,
    kalphite_worker: `${LOCAL}/models/kalphite_worker.png`,
    scarab_mage: `${LOCAL}/models/scarab_mage.png`,
    mummy: `${LOCAL}/models/mummy.png`,
    locust_rider: `${LOCAL}/models/locust_rider.png`,
    dust_devil: `${LOCAL}/models/dust_devil.png`,
    kalphite_guardian: `${LOCAL}/models/kalphite_guardian.png`,
    ankou: `${LOCAL}/models/ankou.png`,                                   // Wilderness
    ent: `${LOCAL}/models/ent.png`,
    giant_mosquito: `${LOCAL}/models/giant_mosquito.png`,                 // Karamja
    cave_horror: `${LOCAL}/models/cave_horror.png`,
    bronze_dragon: `${LOCAL}/models/bronze_dragon.png`,
    wolf: `${LOCAL}/models/wolf.png`,                                     // Trollweiss
    thrower_troll: `${LOCAL}/models/thrower_troll.png`,
    troll_general: `${LOCAL}/models/troll_general.png`,
    tz_kih: `${LOCAL}/models/tz_kih.png`,                                 // TzHaar
    tok_xil: `${LOCAL}/models/tok_xil.png`,
    yt_mejkot: `${LOCAL}/models/yt_mejkot.png`,
    ket_zek: `${LOCAL}/models/ket_zek.png`,
    // Both Tz-Keks are NPC 2191's model at two sizes, so the log's small one shows
    // the big one's face — it is the same creature.
    tz_kek: `${LOCAL}/models/tz_kek.png`,
    tz_kek_half: `${LOCAL}/models/tz_kek.png`,
  },
  // Boss pets — one portrait per PetId in lib/game/data/pets.ts, rendered from the
  // pet's own NPC id by scripts/render-osrs-npcs.mjs (slug `pet_<id>`).
  pets: {
    tzrek_jad: `${LOCAL}/models/pet_tzrek_jad.png`,
    vorki: `${LOCAL}/models/pet_vorki.png`,
    snakeling: `${LOCAL}/models/pet_snakeling.png`,
    ikkle_hydra: `${LOCAL}/models/pet_ikkle_hydra.png`,
    smol_heredit: `${LOCAL}/models/pet_smol_heredit.png`,
    scurry: `${LOCAL}/models/pet_scurry.png`,
    prince_black_dragon: `${LOCAL}/models/pet_prince_black_dragon.png`,
    baby_mole: `${LOCAL}/models/pet_baby_mole.png`,
    noon: `${LOCAL}/models/pet_noon.png`,
    hellpuppy: `${LOCAL}/models/pet_hellpuppy.png`,
    dark_core: `${LOCAL}/models/pet_dark_core.png`,
    graardor_jr: `${LOCAL}/models/pet_graardor_jr.png`,
    nexling: `${LOCAL}/models/pet_nexling.png`,
    tangleroot: `${LOCAL}/models/pet_tangleroot.png`,
    herbi: `${LOCAL}/models/pet_herbi.png`,
    baby_chinchompa: `${LOCAL}/models/pet_baby_chinchompa.png`,
    heron: `${LOCAL}/models/pet_heron.png`,
  } as Record<string, string>,
  // Combat Achievement tier icons — the game's own CaTierSwords sprites (3393-3398),
  // one blade per tier, bronze for Easy up to the last for Grandmaster.
  achievements: {
    easy: `${LOCAL}/achievements/easy.png`,
    medium: `${LOCAL}/achievements/medium.png`,
    hard: `${LOCAL}/achievements/hard.png`,
    elite: `${LOCAL}/achievements/elite.png`,
    master: `${LOCAL}/achievements/master.png`,
    grandmaster: `${LOCAL}/achievements/grandmaster.png`,
  },
  // Achievement Diary rewards — each region's own OSRS reward item, baked from
  // the cache at its tier-4 def (the grey-and-purple diary set). One per diary;
  // the tier decides how strong it is, not which icon it uses.
  diaryRewards: {
    explorers_ring: itemIcon('explorers_ring'),
    desert_amulet: itemIcon('desert_amulet'),
    morytania_legs: itemIcon('morytania_legs'),
    wilderness_sword: itemIcon('wilderness_sword'),
    fremennik_sea_boots: itemIcon('fremennik_sea_boots'),
    karamja_gloves: itemIcon('karamja_gloves'),
  },
  // Prayer icons — cache-extracted sprites served locally (PRAYER_* sprite ids).
  prayers: {
    burst_of_strength: `${LOCAL}/prayers/burst_of_strength.png`,
    sharp_eye: `${LOCAL}/prayers/sharp_eye.png`,
    mystic_will: `${LOCAL}/prayers/mystic_will.png`,
    mystic_lore: `${LOCAL}/prayers/mystic_lore.png`,
    mystic_might: `${LOCAL}/prayers/mystic_might.png`,
    hawk_eye: `${LOCAL}/prayers/hawk_eye.png`,
    ultimate_strength: `${LOCAL}/prayers/ultimate_strength.png`,
    protect_from_magic: `${LOCAL}/prayers/protect_from_magic.png`,
    protect_from_missiles: `${LOCAL}/prayers/protect_from_missiles.png`,
    protect_from_melee: `${LOCAL}/prayers/protect_from_melee.png`,
    // Overhead "headicons" — the same three prayers as OSRS draws them above a
    // praying head, on the game's own gold disc. Use these over the board (the
    // bare book icons above have no backdrop and vanish against the terrain).
    overhead_melee: `${LOCAL}/prayers/overhead_melee.png`,
    overhead_missiles: `${LOCAL}/prayers/overhead_missiles.png`,
    overhead_magic: `${LOCAL}/prayers/overhead_magic.png`,
    eagle_eye: `${LOCAL}/prayers/eagle_eye.png`,
    piety: `${LOCAL}/prayers/piety.png`,
    rigour: `${LOCAL}/prayers/rigour.png`,
    augury: `${LOCAL}/prayers/augury.png`,
  },
  // Tower badges — authentic inventory icons baked from the game cache
  // (scripts/render-osrs-items.mjs). TzHaar stays wiki: those are NPC models
  // (phase-4 of the extraction track).
  towers: {
    archer: {
      1: itemIcon('shortbow'),
      2: itemIcon('magic_shortbow'),
      // Tier 3 is the Dark Bow (twin-shot) — match the sprite to the name.
      3: itemIcon('dark_bow'),
      4: itemIcon('bow_of_faerdhinen'),
    },
    wizard: {
      1: itemIcon('staff_of_air'),
      2: itemIcon('staff_of_water'),
      3: itemIcon('ancient_staff'),
      4: itemIcon('tumekens_shadow'),
      elemental_air: itemIcon('staff_of_air'),
      elemental_water: itemIcon('staff_of_water'),
      elemental_earth: itemIcon('staff_of_earth'),
      elemental_fire: itemIcon('staff_of_fire'),
      ancients: itemIcon('ancient_staff'),
      // Ancients tower body = the Ancient sceptre variant matching the barrage.
      ancient_ice: itemIcon('ice_ancient_sceptre'),
      ancient_blood: itemIcon('blood_ancient_sceptre'),
      ancient_shadow: itemIcon('shadow_ancient_sceptre'),
      ancient_smoke: itemIcon('smoke_ancient_sceptre'),
      // Utility tower body: the Lunar staff (Lunar/Arceuus support magic).
      utility: itemIcon('lunar_staff'),
    },
    // Tier progression: four *distinct*, fully-built cannons (a half-assembled
    // multicannon firing made no sense) — Goblin paint cannon → ship cannon
    // (Cabin Fever) → Dwarf multicannon → Shattered Relics ornament kit,
    // cache-rendered from the model defs (scripts/render-osrs-objects.mjs).
    cannon: {
      1: `${LOCAL}/objects/goblin_paint_cannon.png`,
      2: `${LOCAL}/objects/ship_cannon.png`,
      3: `${LOCAL}/objects/dwarf_multicannon.png`,
      4: `${LOCAL}/objects/shattered_cannon.png`,
    },
    slayer: {
      1: itemIcon('darklight'),
      2: itemIcon('arclight'),
      3: itemIcon('leaf_bladed_sword'),
      4: itemIcon('emberlight'),
    },
    tzhaar: {
      // Cache-rendered NPC models (scripts/render-osrs-npcs.mjs).
      1: `${LOCAL}/models/tzhaar_hur.png`,
      2: `${LOCAL}/models/tzhaar_mej.png`,
      3: `${LOCAL}/models/tzhaar_xil.png`, // sword variant
      4: `${LOCAL}/models/tzhaar_ket.png`,
    },
    // Fused weapons: one tier, so one icon (see systems/tower-fusion).
    scorching_bow: { 1: itemIcon('scorching_bow') },
    venator_bow: { 1: itemIcon('venator_bow') },
    noxious_halberd: { 1: itemIcon('noxious_halberd') },
    purging_staff: { 1: itemIcon('purging_staff') },
    toxic_staff_of_the_dead: { 1: itemIcon('toxic_staff_of_the_dead') },
    eclipse_atlatl: { 1: itemIcon('eclipse_atlatl') },
    toxic: {
      1: itemIcon('tanzanite_fang'),
      2: itemIcon('toxic_blowpipe'),
      3: itemIcon('magic_fang'),
      4: itemIcon('trident_of_the_swamp'),
    },
  },
  misc: {
    // Skill/UI icons below are cache-extracted (SKILL_* sprite ids), served locally.
    magic_icon: `${LOCAL}/misc/magic_icon.png`,
    ranged_icon: `${LOCAL}/misc/ranged_icon.png`,
    strength_icon: `${LOCAL}/misc/strength_icon.png`,
    attack_icon: `${LOCAL}/misc/attack_icon.png`,
    // The Defence shield — used for an enemy's Tenacity (its resistance stat).
    defence_icon: `${LOCAL}/misc/defence_icon.png`,
    // The clue-scroll compass, cache-rendered: a dial with a needle. It stands in
    // for elapsed time in the run summary — OSRS has no clock sprite.
    compass: itemIcon('compass'),
    // The wooden signpost from beside the Lumbridge Guide (object model 1402),
    // rendered by scripts/render-osrs-objects.mjs. It heads "The Road Forks",
    // where the compass used to sit — a compass says which way is north, a
    // signpost says the road splits, which is the choice being offered.
    signpost: `${LOCAL}/objects/signpost.png`,
    // The spade: the tool OSRS digs with, and the icon for bending the road.
    spade: itemIcon('spade'),
    // The Gold speedrun trophy — OSRS's own two-handled gold cup. It marks a
    // player who has won a run, where a typed star used to sit.
    trophy: itemIcon('trophy'),
    // The Hunter paw print (cache sprite 220) — the skill the road traps belong to.
    hunter_icon: `${LOCAL}/misc/hunter_icon.png`,
    // The Farming sapling (cache sprite 217) — heads the allotment patches.
    farming_icon: `${LOCAL}/misc/farming_icon.png`,
    // The Construction saw over a crate (cache sprite 221) — OSRS's own symbol for
    // something you build, so it labels the Towers half of the build dock.
    construction_icon: `${LOCAL}/misc/construction_icon.png`,
    // The Smithing anvil (cache sprite 210) — the skill OSRS makes weapons at.
    // It heads the shop tooltip's Forge section, where two towers are quoted as
    // the weapon they become.
    skill_smithing: `${LOCAL}/misc/skill_smithing.png`,
    // The Herblore pestle and mortar (cache sprite 202) — heads the potion bench,
    // and marks a Herblore level-up.
    skill_herblore: `${LOCAL}/misc/skill_herblore.png`,
    // The Fishing rod and fish (cache sprite 211) — heads the Fishing page, and
    // marks a Fishing level-up.
    skill_fishing: `${LOCAL}/misc/skill_fishing.png`,
    slayer_crossbow: `${LOCAL}/misc/slayer_icon.png`,
    // OSRS "Stats" (Skills) tab icon — the bar-chart glyph. It heads the Skills
    // interface, which is what the tab is in OSRS; the DPS meter, being damage
    // rather than progression, takes `hit_splat` instead.
    stats_icon: `${LOCAL}/misc/stats_icon.png`,
    // The backpack off OSRS's own Inventory tab (sprite 900, out of the side
    // panel's icon block), for the stone that opens the backpack.
    inventory_icon: `${LOCAL}/misc/inventory_icon.png`,
    // Multi-combat (crossed-swords) indicator — used as the Home/Wave sidebar tab.
    // Cache-extracted (MULTI_COMBAT_ZONE_CROSSED_SWORDS 442), like the splats below.
    multicombat_icon: `${LOCAL}/ui/multicombat_icon.png`,
    // The corner brackets of OSRS's click marker (518) — a reticle framing a point,
    // for the `unmarked` targeting button. Not to be confused with `compass` above,
    // which is the clue-scroll item standing in for a clock.
    reticle: `${LOCAL}/ui/reticle.png`,
    // Bare arrow glyphs (1185 / 1186) — the "most / least" markers the targeting
    // priority buttons pair with a dimension icon.
    arrow_up: `${LOCAL}/ui/arrow_up.png`,
    arrow_down: `${LOCAL}/ui/arrow_down.png`,
    // The interface tab buttons (1180 / 1181) — the stone squares resizable mode
    // puts a tab's icon on, grey while idle and red under the open tab. 33x36 each,
    // laid flush against one another the way the client rails them.
    tab_stone: `${LOCAL}/ui/tab_stone.png`,
    tab_stone_on: `${LOCAL}/ui/tab_stone_on.png`,
    // The stone frame resizable mode rings a side panel with (the 1141-1149 nine-slice,
    // with the pale corner caps 2903-2906 baked over its four chamfered corners),
    // baked as one 24x24 image laid out the way CSS `border-image` reads it: columns and
    // rows of 6/12/6, so the corners keep their own size and the edges tile to whatever
    // the panel measures. CSS reaches it through `--rs-stone-frame`, which GameRoot sets
    // from here — a stylesheet cannot see NEXT_PUBLIC_BASE_PATH.
    stone_frame: `${LOCAL}/ui/stone_frame.png`,
    // The game's red circle-slash (940), stamped over a tower that has been knocked
    // offline. The other cache circle-slashes are world-map key icons and carry the
    // thing being prohibited baked in; this one is the bare sign.
    blocked: `${LOCAL}/ui/blocked.png`,
    // Bandos's own sigil, cut off the top of his altar (LOC 26366) — the one place the
    // emblem is geometry rather than a texture painted on armour. It stands under a body
    // his General's slam has shaken free of crowd control.
    bandos_symbol: `${LOCAL}/ui/bandos_symbol.png`,
    // Redemption's heart as the prayer book draws it unlocked/usable: the bright teal
    // symbol, with none of the gold disc the overhead headicons carry. Nothing prays
    // it here; it is borrowed as the mark on the start screen's "passion project"
    // notice, which is why it sits in ui/ and not prayers/ (a file in there is
    // expected to be a prayer the game can cast).
    redemption_heart: `${LOCAL}/ui/redemption_heart.png`,
    // The PK skull a skulled player wears overhead (headicons_pk 439, frame 0), and
    // the light blue one worn under the Forinthry Surge, the revenant buff (frame 3).
    // The Account tab marks enemies killed and bosses killed with them.
    pk_skull: `${LOCAL}/ui/pk_skull.png`,
    pk_skull_forinthry: `${LOCAL}/ui/pk_skull_forinthry.png`,
    // The Achievement Diaries side tab (sprite 1298), for the Account tab's diary count.
    diaries_icon: `${LOCAL}/misc/diaries_icon.png`,
    // OSRS has no random-event sprite, so the Genie stands in: he is one of the
    // random events this game sends onto the board. Baked apart from his diversion
    // render, framed on the figure with his shadow cut, to read at stat-cell size.
    random_event: npcModel('random_event'),
    hit_splat: `${LOCAL}/hitsplats/hit.png`,          // red damage (1359)
    magic_hit_splat: `${LOCAL}/hitsplats/miss.png`,   // blue zero-splat (1358)
    hp_icon: `${LOCAL}/misc/hp_icon.png`,
    // Minimap data-orb glyphs — the authentic status symbols inside the HUD orbs
    // (extract-osrs-sprites.mjs). orb_run doubles as the Hasted affix icon.
    // The glyphs are drawn *on* orb_background, the empty sphere the client draws
    // behind every one of them — same 26×26 canvas, so the two line up 1:1.
    orb_background: `${LOCAL}/ui/orb_background.png`, // MINIMAP_ORB_EMPTY (1059)
    orb_hitpoints: `${LOCAL}/orbs/hitpoints.png`, // MINIMAP_ORB_HITPOINTS (1067)
    orb_prayer: `${LOCAL}/orbs/prayer.png`, // MINIMAP_ORB_PRAYER (1068)
    orb_run: `${LOCAL}/orbs/run_energy.png`, // MINIMAP_ORB_RUN (1069) — run off (brown)
    orb_run_on: `${LOCAL}/orbs/run_energy_on.png`, // MINIMAP_ORB_RUN_ACTIVATED (1070) — run on (gold)
    prayer_icon: `${LOCAL}/misc/prayer_icon.png`,
    coins_icon: itemIcon('coins'),
    loot_bag: itemIcon('looting_bag'), // the classic-mode loot bag, a tab in the Inventory
    // Mystic cards (the Guardians of the Rift reward) — OSRS's own pack of cards,
    // and therefore *the* icon for anything about reward cards: the roguelite, a
    // card roll, the draft. Use this rather than picking a fresh stand-in.
    cards_icon: itemIcon('mystic_cards'),
    xp_icon: itemIcon('antique_lamp'), // XP-gain stat rows (OSRS's experience lamp)
    rune_essence_icon: itemIcon('rune_essence'),
    // Spellbook icons for the wizard panel (Elemental→Standard, Ancients→Ancient,
    // Utility→Arceuus) — cache-extracted TAB_MAGIC* sprites, served locally.
    spellbook_standard: `${LOCAL}/misc/spellbook_standard.png`,
    spellbook_ancient: `${LOCAL}/misc/spellbook_ancient.png`,
    spellbook_arceuus: `${LOCAL}/misc/spellbook_arceuus.png`,
  },
  // The real interface hitsplats, cache-extracted (extract-osrs-sprites.mjs),
  // keyed by the core engine's HitsplatKind. Drawn on-canvas by the renderer.
  hitsplats: {
    hit: `${LOCAL}/hitsplats/hit.png`,       // red damage (1359)
    miss: `${LOCAL}/hitsplats/miss.png`,     // blue zero-splat (1358)
    poison: `${LOCAL}/hitsplats/poison.png`, // green (1360)
    venom: `${LOCAL}/hitsplats/venom.png`,   // teal (1632)
    burn: `${LOCAL}/hitsplats/burn.png`,     // orange (1361)
    heal: `${LOCAL}/hitsplats/heal.png`,     // purple cross (1629)
    armour: `${LOCAL}/hitsplats/armour.png`, // orange chestplate (1628)
    shield: `${LOCAL}/hitsplats/shield.png`, // teal shield (1419)
  },
  // The ground a farming allotment stands on: the real OSRS allotment's raked-earth
  // quad (scripts/render-osrs-objects.mjs), baked looking straight down so it fills
  // its tile. What grows in it is not baked scenery — it is the player's own seed
  // and herb icons, so a guam patch shows a guam (see core/render/farming.ts).
  farming: {
    soil: `${LOCAL}/objects/patch_empty.png`, // Allotment (8573)
  },
  // The board's own ground, and the two liquids a pool can hold. OSRS has no
  // model to bake for any of this, because terrain there is a floor overlay —
  // what a player recognises is the texture itself. Each one is baked at its own
  // size by scripts/render-osrs-objects.mjs.
  //
  // Each region carries **two to four** floors rather than one: the board squares
  // are 64 logic px and the field is 225 of them, so a single texture repeated flat
  // read as wallpaper. The first entry is the pattern the whole board is paved with
  // and every entry after it is scattered over that as soft round blots, one
  // scatter each (see `paintGround` in `core/render/terrain.ts`) — so a fourth
  // texture is a fourth scatter, and the order here is the order they are laid.
  //
  // Two regions must never share a floor: Morytania and the Wilderness were dealt
  // the same wet stone and black rot, and a player crossing between them saw one
  // region with the lights turned down. They own their palettes outright now.
  terrain: {
    ground: {
      lumbridge: [`${LOCAL}/terrain/ground_lumbridge_a.png`, `${LOCAL}/terrain/ground_lumbridge_b.png`, `${LOCAL}/terrain/ground_lumbridge_c.png`, `${LOCAL}/terrain/ground_lumbridge_d.png`], // 129 meadow grass · 191 leafy grass · 32 trodden dirt · 203 dry grass tufts
      alkharid: [`${LOCAL}/terrain/ground_alkharid_a.png`, `${LOCAL}/terrain/ground_alkharid_b.png`, `${LOCAL}/terrain/ground_alkharid_c.png`], // 18 flat sand · 42 drifted sand · 118 wind-packed grit
      morytania: [`${LOCAL}/terrain/ground_morytania_a.png`, `${LOCAL}/terrain/ground_morytania_b.png`, `${LOCAL}/terrain/ground_morytania_c.png`, `${LOCAL}/terrain/ground_morytania_d.png`], // 190 swamp moss · 178 standing silt · 201 rotted mulch · 193 churned bog
      wilderness: [`${LOCAL}/terrain/ground_wilderness_a.png`, `${LOCAL}/terrain/ground_wilderness_b.png`, `${LOCAL}/terrain/ground_wilderness_c.png`], // 117 burnt earth · 119 charred grit · 204 dead scrub
      trollweiss: [`${LOCAL}/terrain/ground_trollweiss_a.png`, `${LOCAL}/terrain/ground_trollweiss_b.png`], // 91 snow · 1 packed ice
      karamja: [`${LOCAL}/terrain/ground_karamja_a.png`, `${LOCAL}/terrain/ground_karamja_b.png`, `${LOCAL}/terrain/ground_karamja_c.png`, `${LOCAL}/terrain/ground_karamja_d.png`], // 32 jungle mud · 129 clearing grass · 192 leaf litter · 199 shaded undergrowth
      tzhaar: [`${LOCAL}/terrain/ground_tzhaar_a.png`, `${LOCAL}/terrain/ground_tzhaar_b.png`, `${LOCAL}/terrain/ground_tzhaar_c.png`], // 119 black basalt · 59 cooling crust · 95 obsidian sheet
    } as Record<BiomeId, string[]>,
    // Both liquids are baked into the static background with the ground: the
    // client scrolls their u/v, but a scrolling pool under a camera that never
    // moves reads as the whole board sliding.
    water: `${LOCAL}/terrain/liquid_water.png`, // texture 24
    lava: `${LOCAL}/terrain/liquid_lava.png`,   // texture 31, molten rock
    // The props standing on the board, one entry per {@link SceneryId}. Each is a
    // LOC model rendered side-on out of the cache, and the board stands it on the
    // bottom edge of its tile the way the client stands a LOC on the ground.
    scenery: {
      lumb_tree: `${LOCAL}/scenery/lumb_tree.png`,                 // 1276 Tree
      lumb_rock: `${LOCAL}/scenery/lumb_rock.png`,                 // 2257 Rocks
      lumb_bush: `${LOCAL}/scenery/lumb_bush.png`,                 // 1118 Bush
      lumb_pebbles: `${LOCAL}/scenery/lumb_pebbles.png`,           // 10792 Stones
      lumb_oak: `${LOCAL}/scenery/lumb_oak.png`,                   // 4540 Oak tree
      lumb_willow: `${LOCAL}/scenery/lumb_willow.png`,             // 4541 Willow tree
      lumb_flowers: `${LOCAL}/scenery/lumb_flowers.png`,           // 1192 Flowers
      lumb_haystack: `${LOCAL}/scenery/lumb_haystack.png`,         // 300 Haystack
      lumb_stump: `${LOCAL}/scenery/lumb_stump.png`,               // 1342 Tree stump
      lumb_reeds: `${LOCAL}/scenery/lumb_reeds.png`,               // 5139 Reeds
      khar_cactus: `${LOCAL}/scenery/khar_cactus.png`,             // 6277 Cactus
      khar_cactus_dry: `${LOCAL}/scenery/khar_cactus_dry.png`,     // 2671 Kharidian cactus (Dry)
      khar_rock: `${LOCAL}/scenery/khar_rock.png`,                 // 2231 Rocks
      khar_rubble: `${LOCAL}/scenery/khar_rubble.png`,             // 12 Rock pile
      khar_palm: `${LOCAL}/scenery/khar_palm.png`,                 // 8085 Palm tree
      khar_sandstone: `${LOCAL}/scenery/khar_sandstone.png`,       // 11386 Sandstone rocks
      khar_cactus_tall: `${LOCAL}/scenery/khar_cactus_tall.png`,   // 1396 Cactus
      khar_dead_tree: `${LOCAL}/scenery/khar_dead_tree.png`,       // 1283 Dead tree
      khar_ruins: `${LOCAL}/scenery/khar_ruins.png`,               // 11072 Ruins
      mory_dead_tree: `${LOCAL}/scenery/mory_dead_tree.png`,       // 1282 Dead tree
      mory_grave: `${LOCAL}/scenery/mory_grave.png`,               // 404 Gravestone
      mory_mushroom: `${LOCAL}/scenery/mory_mushroom.png`,         // 1163 Mushroom
      mory_bones: `${LOCAL}/scenery/mory_bones.png`,               // 3665 Bones
      mory_tombstone: `${LOCAL}/scenery/mory_tombstone.png`,       // 402 Tombstone
      mory_coffin: `${LOCAL}/scenery/mory_coffin.png`,             // 398 Coffin
      mory_toadstools: `${LOCAL}/scenery/mory_toadstools.png`,     // 1166 Mushrooms
      mory_fungus: `${LOCAL}/scenery/mory_fungus.png`,             // 1170 Fungus
      mory_twisted_tree: `${LOCAL}/scenery/mory_twisted_tree.png`, // 30852 Burnt tree
      mory_swamp_tree: `${LOCAL}/scenery/mory_swamp_tree.png`,     // 13847 Swamp tree
      mory_dead_birch: `${LOCAL}/scenery/mory_dead_birch.png`,     // 13844 Swamp tree
      mory_swamp_bubbles: `${LOCAL}/scenery/mory_swamp_bubbles.png`, // 684 Swamp bubbles
      mory_rotting_log: `${LOCAL}/scenery/mory_rotting_log.png`,   // 3508 Rotting log
      mory_rotten_stump: `${LOCAL}/scenery/mory_rotten_stump.png`, // 29737 Rotten stump
      mory_mausoleum: `${LOCAL}/scenery/mory_mausoleum.png`,       // 10055 Mausoleum
      wild_boulder: `${LOCAL}/scenery/wild_boulder.png`,           // 3753 Boulders
      wild_boulder_big: `${LOCAL}/scenery/wild_boulder_big.png`,   // 3754 Boulders
      wild_stones: `${LOCAL}/scenery/wild_stones.png`,             // 26633 Stones
      wild_chaos_altar: `${LOCAL}/scenery/wild_chaos_altar.png`,   // 411 Chaos altar
      wild_pillar: `${LOCAL}/scenery/wild_pillar.png`,             // 34795 Ruined Pillar
      wild_skeleton: `${LOCAL}/scenery/wild_skeleton.png`,         // 12245 Skeleton
      wild_skeleton_curled: `${LOCAL}/scenery/wild_skeleton_curled.png`, // 12247 Skeleton
      wild_skull_heap: `${LOCAL}/scenery/wild_skull_heap.png`,     // 42803 Skulls
      wild_skull_pile: `${LOCAL}/scenery/wild_skull_pile.png`,     // 12453 Skulls
      wild_ruins: `${LOCAL}/scenery/wild_ruins.png`,               // 3755 Ruins
      wild_spire: `${LOCAL}/scenery/wild_spire.png`,               // 2704 Rocks
      troll_pine: `${LOCAL}/scenery/troll_pine.png`,               // 60091 Pine tree (frosted)
      troll_ice_boulder: `${LOCAL}/scenery/troll_ice_boulder.png`, // 5039 Ice covered boulder
      troll_icicle: `${LOCAL}/scenery/troll_icicle.png`,           // 554 Icicle
      troll_snow: `${LOCAL}/scenery/troll_snow.png`,               // 15615 Snow
      troll_ice_chunks: `${LOCAL}/scenery/troll_ice_chunks.png`,   // 6472 Ice chunks
      troll_snow_mound: `${LOCAL}/scenery/troll_snow_mound.png`,   // 15616 Snow
      troll_snowy_bush: `${LOCAL}/scenery/troll_snowy_bush.png`,   // 46511 Snowy Bush
      troll_dead_tree: `${LOCAL}/scenery/troll_dead_tree.png`,     // 1291 Dead tree
      troll_snow_tree: `${LOCAL}/scenery/troll_snow_tree.png`,     // 46509 Evergreen tree
      troll_snow_tree_tall: `${LOCAL}/scenery/troll_snow_tree_tall.png`, // 46510 Evergreen tree
      kara_palm: `${LOCAL}/scenery/kara_palm.png`,                 // 2577 Palm tree
      kara_jungle_tree: `${LOCAL}/scenery/kara_jungle_tree.png`,   // 2887 Jungle tree
      kara_fern: `${LOCAL}/scenery/kara_fern.png`,                 // 1298 Fern
      kara_banana: `${LOCAL}/scenery/kara_banana.png`,             // 2073 Banana tree
      kara_palm_young: `${LOCAL}/scenery/kara_palm_young.png`,     // 2578 Palm tree
      kara_tropical_palm: `${LOCAL}/scenery/kara_tropical_palm.png`, // 57815 Tropical palm
      kara_flowers: `${LOCAL}/scenery/kara_flowers.png`,           // 1196 Flowers
      kara_fungus: `${LOCAL}/scenery/kara_fungus.png`,             // 21741 Fungus
      tz_brazier: `${LOCAL}/scenery/tz_brazier.png`,               // 11017 Brazier
      tz_sulphur_vent: `${LOCAL}/scenery/tz_sulphur_vent.png`,     // 11851 Sulphur vent (model 9295)
      tz_rock_pillar: `${LOCAL}/scenery/tz_rock_pillar.png`,       // 30284 Rocky support
      tz_column: `${LOCAL}/scenery/tz_column.png`,                 // 11937 Column (Mor Ul Rek)
      tz_crate: `${LOCAL}/scenery/tz_crate.png`,                   // 11969 Crate
    } as Record<SceneryId, string>,
  },
  // Party Pete's balloons: the Party Room balloon (LOC 115) and its five recolours
  // (116-120), stood upright by scripts/render-osrs-objects.mjs. Indexed by the
  // balloon's colour variant.
  partyBalloons: [
    `${LOCAL}/objects/party_balloon_0.png`,
    `${LOCAL}/objects/party_balloon_1.png`,
    `${LOCAL}/objects/party_balloon_2.png`,
    `${LOCAL}/objects/party_balloon_3.png`,
    `${LOCAL}/objects/party_balloon_4.png`,
    `${LOCAL}/objects/party_balloon_5.png`,
  ],
  // Status-effect icons for the enemy hover panel (OSRS spell/status sprites).
  debuffs: {
    // slow = Giant snail, an NPC *model* rendered from the cache
    // (scripts/render-osrs-npcs.mjs). The rest are cache-extracted sprites
    // (scripts/extract-osrs-sprites.mjs), served locally from public/.
    slow: `${LOCAL}/models/giant_snail.png`,
    stun: `${LOCAL}/debuffs/stun.png`, // SPELL_ENTANGLE (321)
    burn: `${LOCAL}/debuffs/burn.png`, // Burn hitsplat (1361)
    poison: `${LOCAL}/debuffs/poison.png`, // HITSPLAT_GREEN_POISON (1360)
    venom: `${LOCAL}/debuffs/venom.png`, // HITSPLAT_DARK_GREEN_VENOM (1632)
    vuln: `${LOCAL}/debuffs/vuln.png`, // SPELL_WEAKEN (20)
  },
  // Baked spotanim (GFX) sprite sheets — animated cache effects rendered offline
  // to a horizontal sheet by scripts/render-osrs-spotanims.mjs. Played frame by
  // frame at runtime (see lib/game/data/spotanims.ts + GameRenderer.drawEffects).
  spotanims: {
  },
  sounds: {
    shoot: SHOOT_SOUNDS,
    spellHit: SPELL_HIT,
    death: DEATH_SOUNDS,
    misc: {
      // Core SFX — every clip decoded straight from the OSRS game cache
      // (scripts/extract-osrs-sounds.mjs → public/assets/sounds/). Sound ids
      // verified against the wiki List_of_sound_IDs config-name dump.
      hit: `${LOCAL}/sounds/combat_hit.wav`,            // attack-hit thud (2498)
      kill: `${SND}/death_zombie.wav`,                  // zombie_death (922) — same clip the wiki mp3 transcoded
      wave: `${LOCAL}/sounds/ui_teleport.wav`,          // teleport vwoop (200)
      fireworks: `${SND}/fireworks.wav`,                // firework (2396) — relic-pickup celebration burst
      sell: `${LOCAL}/sounds/ui_coins.wav`,             // coin tinkle (3924)
      boss_attack: `${SND}/boss_attack.wav`,            // vorkath_attack (1521)
      zulrah_hiss: `${SND}/zulrah_hiss.wav`,            // snake_hiss (799) — Zulrah's morph cry
      vorkath_shield: `${SND}/vorkath_shield.wav`,      // vorkath (1511) — his ice shield going up
      kbd_breath: `${SND}/kbd_breath.wav`,              // firebreath (159) — the King Black Dragon's breath landing
      kbd_stomp: `${SND}/kbd_stomp.wav`,                // dragonslayer_dragonstomp3 (3752) — embedded in his own rear-up anim
      graardor_slam: `${SND}/graardor_slam.wav`,        // godwars_bandos_avatar_punch (3843) — his own slam, the attack that shatters prayers
      nex_ward: `${SND}/nex_ward.wav`,                  // nex2021_nex_deflect (5196) — her ward snapping into place
      nex_break: `${SND}/nex_break.wav`,                // nex2021_turmoil_power_up (5202) — the ward failing
      prayer_on: `${LOCAL}/sounds/prayer_generic_on.wav`,  // thick-skin "vwoom" (2690)
      prayer_off: `${LOCAL}/sounds/prayer_off.wav`,        // deactivate vwoop (2663)
      potion: `${SND}/potion.wav`,                      // liquid (2401) — potion gulp
      special_attack: `${SND}/special_attack.wav`,      // puncture (2537) — the dragon dagger spec
      click: `${LOCAL}/sounds/ui_click.wav`,            // boop (2266)
      lobby_torch: `${LOCAL}/sounds/lobby_torch.wav`,   // torch_crackling (7746), looped
      select: `${LOCAL}/sounds/ui_select.wav`,          // soft poh build-select chime (970)
      interface_open: `${LOCAL}/sounds/ge_offer.wav`,   // GE add-offer chime (3925)
      interface_close: `${LOCAL}/sounds/ge_collect.wav`,// GE collect (3928)
      pick_up: `${SND}/pick_up.wav`,                    // pick2 (2582) — item-pickup plop
      balloon_pop: `${SND}/balloon_pop.wav`,            // pop1 (2214) — a Party Pete balloon bursting
      cannon_fire: `${SND}/fire_cannon.wav`,             // mcannon_fire (1667)
      death: `${SND}/death_human.wav`,                  // human_death (512) — a life lost
      // The "You Are Dead!" jingle — the music played when you die. It's a MIDI
      // jingle (cache music index, not an index-4 synth), so it can't go through
      // extract-osrs-sounds.mjs; this is the wiki's ogg of the real thing.
      game_over: `${SND}/game_over.ogg`,
      magic_splash: `${LOCAL}/sounds/magic_splash.wav`, // splash (227)
      block: `${LOCAL}/sounds/combat_block.wav`,        // take-damage hitsplat (510)
      // Fishing (Task 7): a cast, a catch, and eating the catch — each its own
      // cache-decoded clip, none of them a stand-in for another sound.
      cast_line: `${LOCAL}/sounds/cast_line.wav`,       // fishing_cast (2600) — the line going in
      fish_caught: `${LOCAL}/sounds/fish_caught.wav`,   // varlamore_pm_fish_catch_01 (7904)
      eat: `${LOCAL}/sounds/eat.wav`,                   // eat (2393)
    },
    // Per-prayer activation clips, decoded from the cache. Prayers OSRS gives a
    // unique activation sound get their own; the rest fall back to `misc.prayer_on`
    // (the generic vwoom) in sound.ts. Deactivation is one shared clip (prayer_off).
    prayer: {
      ultimate_strength: `${LOCAL}/sounds/prayer_ultimate_strength.wav`, // 2691
      protect_from_magic: `${LOCAL}/sounds/prayer_protect_magic.wav`,    // 2675
      protect_from_missiles: `${LOCAL}/sounds/prayer_protect_missiles.wav`, // 2677
      protect_from_melee: `${LOCAL}/sounds/prayer_protect_melee.wav`,    // 2676
      eagle_eye: `${LOCAL}/sounds/prayer_eagle_eye.wav`,                 // 2665
      mystic_might: `${LOCAL}/sounds/prayer_mystic_might.wav`,           // 2669
      piety: `${LOCAL}/sounds/prayer_piety.wav`,                         // 3825
      rigour: `${LOCAL}/sounds/prayer_rigour.wav`,                       // 2685
      augury: `${LOCAL}/sounds/prayer_augury.wav`,                       // 2670
    } as Record<string, string>,
  }
};
