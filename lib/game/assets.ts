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
 * Wiki-filename → locally-baked icon. Data tables (GE shop, slayer rewards,
 * meta upgrades) key icons by wiki filename; `iconUrl` resolves them to the
 * cache-baked local asset.
 *
 * Every name a data table uses must have an entry here — assets come from the
 * game cache, never from an external host. `assets.test.ts` fails the build if
 * a table grows a name with no bake behind it.
 */
const LOCAL_BY_WIKI: Record<string, string> = {
  // GE consumables (data/ge.ts `wiki` keys)
  'Ranging_potion(4)': itemIcon('ranging_potion'),
  'Magic_potion(4)': itemIcon('magic_potion'),
  'Super_combat_potion(4)': itemIcon('super_combat_potion'),
  'Prayer_potion(4)': itemIcon('prayer_potion'),
  'Super_restore(4)': itemIcon('super_restore'),
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

export const ASSETS = {
  spells: SPELL_ICONS,
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
  },
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
    // The Construction saw over a crate (cache sprite 221) — OSRS's own symbol for
    // something you build, so it labels the Towers half of the build dock.
    construction_icon: `${LOCAL}/misc/construction_icon.png`,
    slayer_crossbow: `${LOCAL}/misc/slayer_icon.png`,
    // OSRS "Stats" (Skills) tab icon — the bar-chart glyph; used for the DPS tab.
    stats_icon: `${LOCAL}/misc/stats_icon.png`,
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
    // The game's red circle-slash (940), stamped over a tower that has been knocked
    // offline. The other cache circle-slashes are world-map key icons and carry the
    // thing being prohibited baked in; this one is the bare sign.
    blocked: `${LOCAL}/ui/blocked.png`,
    // Redemption's heart as the prayer book draws it unlocked/usable: the bright teal
    // symbol, with none of the gold disc the overhead headicons carry. Nothing prays
    // it here; it is borrowed as the mark on the start screen's "passion project"
    // notice, which is why it sits in ui/ and not prayers/ (a file in there is
    // expected to be a prayer the game can cast).
    redemption_heart: `${LOCAL}/ui/redemption_heart.png`,
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
    loot_bag: itemIcon('looting_bag'), // the classic-mode loot-bag stone
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
    venom: `${LOCAL}/hitsplats/venom.png`,   // dark green (1632)
    burn: `${LOCAL}/hitsplats/burn.png`,     // orange (1361)
    heal: `${LOCAL}/hitsplats/heal.png`,     // gold (1362)
  },
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
      select: `${LOCAL}/sounds/ui_select.wav`,          // soft poh build-select chime (970)
      interface_open: `${LOCAL}/sounds/ge_offer.wav`,   // GE add-offer chime (3925)
      interface_close: `${LOCAL}/sounds/ge_collect.wav`,// GE collect (3928)
      pick_up: `${SND}/pick_up.wav`,                    // pick2 (2582) — item-pickup plop
      cannon_fire: `${SND}/fire_cannon.wav`,             // mcannon_fire (1667)
      death: `${SND}/death_human.wav`,                  // human_death (512) — a life lost
      // The "You Are Dead!" jingle — the music played when you die. It's a MIDI
      // jingle (cache music index, not an index-4 synth), so it can't go through
      // extract-osrs-sounds.mjs; this is the wiki's ogg of the real thing.
      game_over: `${SND}/game_over.ogg`,
      magic_splash: `${LOCAL}/sounds/magic_splash.wav`, // splash (227)
      block: `${LOCAL}/sounds/combat_block.wav`,        // take-damage hitsplat (510)
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
