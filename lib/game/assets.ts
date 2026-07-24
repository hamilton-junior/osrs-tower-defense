const WIKI = 'https://oldschool.runescape.wiki/images/';

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
 * cache-baked local asset, hot-linking only names with no bake yet.
 */
const LOCAL_BY_WIKI: Record<string, string> = {
  // GE consumables (data/shop.ts `wiki` keys)
  'Ranging_potion(4)': itemIcon('ranging_potion'),
  'Magic_potion(4)': itemIcon('magic_potion'),
  'Super_combat_potion(4)': itemIcon('super_combat_potion'),
  'Prayer_potion(4)': itemIcon('prayer_potion'),
  'Super_restore(4)': itemIcon('super_restore'),
  'Overload_(4)': itemIcon('overload_4'),
  Bronze_ore: itemIcon('bronze_ore'),
  Iron_ore: itemIcon('iron_ore'),
  Coal: itemIcon('coal'),
  Mithril_ore: itemIcon('mithril_ore'),
  Adamantite_ore: itemIcon('adamantite_ore'),
  Rune_ore: itemIcon('rune_ore'),
  Grimy_guam: itemIcon('grimy_guam'),
  Clean_guam: itemIcon('guam_leaf'),
  Grimy_ranarr: itemIcon('grimy_ranarr'),
  Clean_ranarr: itemIcon('ranarr_weed'),
  Vial_of_water: itemIcon('vial_of_water'),
  Eye_of_newt: itemIcon('eye_of_newt'),
  Limpwurt_root: itemIcon('limpwurt_root'),
  Red_spiders_eggs: itemIcon('red_spiders_eggs'),
  Bird_nest: itemIcon('bird_nest'),
  Snape_grass: itemIcon('snape_grass'),
  Guam_seed: itemIcon('guam_seed'),
  Harralander_seed: itemIcon('harralander_seed'),
  Toadflax_seed: itemIcon('toadflax_seed'),
  Ranarr_seed: itemIcon('ranarr_seed'),
  Snapdragon_seed: itemIcon('snapdragon_seed'),
  Torstol_seed: itemIcon('torstol_seed'),
  Potato_seed: itemIcon('potato_seed'),
  Onion_seed: itemIcon('onion_seed'),
  Cabbage_seed: itemIcon('cabbage_seed'),
  Sweetcorn_seed: itemIcon('sweetcorn_seed'),
  Watermelon_seed: itemIcon('watermelon_seed'),
  Snape_grass_seed: itemIcon('snape_grass_seed'),
  Bones: itemIcon('bones'),
  Big_bones: itemIcon('big_bones'),
  Dragon_bones: itemIcon('dragon_bones'),
  Logs: itemIcon('logs'),
  Oak_logs: itemIcon('oak_logs'),
  Willow_logs: itemIcon('willow_logs'),
  Yew_logs: itemIcon('yew_logs'),
  Magic_logs: itemIcon('magic_logs'),
  // Slayer rewards (data/slayer.ts `icon` keys) — each unlock wears the item it
  // actually is in game (the imbued helm, the bracelet that extends tasks, the
  // Eternal gem the superiors drop).
  Slayer_helmet: itemIcon('slayer_helmet'),
  'Slayer_helmet_(i)': itemIcon('slayer_helmet_i'),
  Bracelet_of_slaughter: itemIcon('bracelet_of_slaughter'),
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

/** Resolve a wiki icon filename (no extension) to its best URL. */
export const iconUrl = (wiki: string) => LOCAL_BY_WIKI[wiki] ?? `${WIKI}${wiki}.png`;

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
];
const DEATH_SOUNDS: Record<string, string> = {};
for (const t of DEATH_TYPES) DEATH_SOUNDS[t] = `${SND}/death_${t}.wav`;
// Scurrius' Giant rats are not borrowing a stand-in: `rat` in this game *is* the
// cache's Giant rat (NPC 2510), and Scurrius' own rat (7223) shares that rig and
// that voice. One clip, two enemy types — so no second copy of the same bytes.
// Scurrius himself has no entry: his sound id is not in the curated map (he
// post-dates it), and the generic `death` fallback stands rather than a borrowed cry.
DEATH_SOUNDS.giant_rat = DEATH_SOUNDS.rat;

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
    giant_mole: `${LOCAL}/models/giant_mole.png`,
    dusk: `${LOCAL}/models/dusk.png`,                   // Grotesque Guardians
    dawn: `${LOCAL}/models/dawn.png`,
    cerberus: `${LOCAL}/models/cerberus.png`,
    summoned_soul: `${LOCAL}/models/summoned_soul.png`,
    jad: `${LOCAL}/models/jad.png`,                     // TzTok-Jad
    vorkath: `${LOCAL}/models/vorkath.png`,
    zulrah: `${LOCAL}/models/zulrah.png`,               // serpentine
    superior_bloodveld: `${LOCAL}/models/superior_bloodveld.png`,         // Insatiable Bloodveld
    superior_abyssal_demon: `${LOCAL}/models/superior_abyssal_demon.png`, // Greater abyssal demon
    superior_gargoyle: `${LOCAL}/models/superior_gargoyle.png`,           // Marble gargoyle
    superior_nechryael: `${LOCAL}/models/superior_nechryael.png`,         // Nechryarch
  },
  pets: {
    beaver: `${LOCAL}/models/beaver.png`,
    rock_golem: `${LOCAL}/models/rock_golem.png`,
    tangleroot: `${LOCAL}/models/tangleroot.png`,
    heron: `${LOCAL}/models/heron.png`,
    rift_guardian: `${LOCAL}/models/rift_guardian.png`, // fire variant
    baby_mole: `${LOCAL}/models/baby_mole.png`,
    vorki: `${LOCAL}/models/vorki.png`,
    snakeling: `${LOCAL}/models/snakeling.png`,         // tanzanite
    prince_black_dragon: `${LOCAL}/models/prince_black_dragon.png`,
    kalphite_princess: `${LOCAL}/models/kalphite_princess.png`, // 2nd form
    tzrek_jad: `${LOCAL}/models/tzrek_jad.png`,
    ikkle_hydra: `${LOCAL}/models/ikkle_hydra.png`,     // serpentine
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
  items: {
    amulet_of_power: itemIcon('amulet_of_power'),
    anti_dragon_shield: itemIcon('anti_dragon_shield'),
    combat_bracelet: itemIcon('combat_bracelet'),
    silverlight: itemIcon('silverlight'),
    dragon_scimitar: itemIcon('dragon_scimitar'),
    logs: itemIcon('logs'),
    iron_ore: itemIcon('iron_ore'),
    grimy_guam: itemIcon('grimy_guam'),
    vial: itemIcon('vial'),
    guam_seed: itemIcon('guam_seed'),
    ranarr_seed: itemIcon('ranarr_seed'),
    potato_seed: itemIcon('potato_seed'),
    potato: itemIcon('potato'),
  },
  farming: {
    // Allotment patch states, cache-rendered from the LOC morph targets
    // (scripts/render-osrs-objects.mjs): raked soil → potato plant → potato.
    patch_empty: `${LOCAL}/objects/patch_empty.png`,
    patch_growing: `${LOCAL}/objects/patch_growing.png`,
    patch_ready: `${LOCAL}/objects/patch_ready.png`,
    guam: itemIcon('guam_leaf'),
    ranarr: itemIcon('ranarr_weed'),
    potato: itemIcon('potato'),
  },
  misc: {
    // Generic portal icon (legacy UI fallback only — the live spawn portal is
    // drawn procedurally in renderer.drawSpawnPortal, no sprite).
    portal: `${LOCAL}/ui/transportation_icon.png`, // MAP_ICON_TRANSPORTATION (1504)
    tree: `${LOCAL}/objects/tree.png`, // cache-rendered LOC (render-osrs-objects.mjs)
    ore_adamant: itemIcon('adamantite_ore'),
    ranarr: itemIcon('ranarr_weed'),
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
    bones_loot: itemIcon('bones'),
    skill_mining: `${LOCAL}/misc/skill_mining.png`,
    skill_woodcutting: `${LOCAL}/misc/skill_woodcutting.png`,
    skill_herblore: `${LOCAL}/misc/skill_herblore.png`,
    skill_crafting: `${LOCAL}/misc/skill_crafting.png`,
    skill_prayer: `${LOCAL}/misc/prayer_icon.png`,
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
    poison_hit_splat: `${LOCAL}/hitsplats/poison.png`,// green (1360)
    ranged_hit_splat: `${LOCAL}/hitsplats/heal.png`,  // gold (1362) — legacy renderer's ranged tint
    miss_hit_splat: `${LOCAL}/hitsplats/miss.png`,    // blue zero-splat (1358)
    background_pattern: `${LOCAL}/ui/back_pattern.png`, // TEXTURE_WOOD_DARK (452) — the interface wood tile
    orb_background: `${LOCAL}/ui/orb_background.png`, // MINIMAP_ORB_EMPTY (1059)
    inventory_background: `${LOCAL}/ui/inventory_background.png`, // FIXED_MODE_SIDE_PANEL_BACKGROUND (1031)
    hp_icon: `${LOCAL}/misc/hp_icon.png`,
    // Minimap data-orb glyphs — the authentic status symbols inside the HUD orbs
    // (extract-osrs-sprites.mjs). orb_run doubles as the Hasted affix icon.
    orb_hitpoints: `${LOCAL}/orbs/hitpoints.png`, // MINIMAP_ORB_HITPOINTS (1067)
    orb_prayer: `${LOCAL}/orbs/prayer.png`, // MINIMAP_ORB_PRAYER (1068)
    orb_run: `${LOCAL}/orbs/run_energy.png`, // MINIMAP_ORB_RUN (1069) — run off (brown)
    orb_run_on: `${LOCAL}/orbs/run_energy_on.png`, // MINIMAP_ORB_RUN_ACTIVATED (1070) — run on (gold)
    ge_logo: `${LOCAL}/ui/ge_logo.png`, // GE map icon, the gold scales (1531)
    essence_icon: itemIcon('pure_essence'),
    pets_tab_icon: `${LOCAL}/ui/follower_details.png`, // OPTIONS_FOLLOWER_RIGHT_CLICK_MENU (1166)
    prayer_icon: `${LOCAL}/misc/prayer_icon.png`,
    coins_icon: itemIcon('coins'),
    rune_essence_icon: itemIcon('rune_essence'),
    herblore_icon: `${LOCAL}/misc/skill_herblore.png`,
    farming_icon: `${LOCAL}/misc/farming_icon.png`,
    // Spellbook icons for the wizard panel (Elemental→Standard, Ancients→Ancient,
    // Utility→Arceuus) — cache-extracted TAB_MAGIC* sprites, served locally.
    spellbook_standard: `${LOCAL}/misc/spellbook_standard.png`,
    spellbook_ancient: `${LOCAL}/misc/spellbook_ancient.png`,
    spellbook_arceuus: `${LOCAL}/misc/spellbook_arceuus.png`,
    wiki_base: 'https://oldschool.runescape.wiki/images/',
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
    portal: `${LOCAL}/spotanims/portal.png`, // Void portal NPC (1739) idle swirl — looping
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
