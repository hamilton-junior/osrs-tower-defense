const WIKI = 'https://oldschool.runescape.wiki/images/';

// Locally-bundled assets extracted from the game cache (see
// scripts/extract-osrs-sprites.mjs). Served from `public/`, base-path aware so
// they resolve under a GitHub Pages project subpath too.
const LOCAL = `${process.env.NEXT_PUBLIC_BASE_PATH || ''}/assets`;

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

export const ASSETS = {
  spells: SPELL_ICONS,
  enemies: {
    goblin: 'https://oldschool.runescape.wiki/images/Goblin.png',
    rat: 'https://oldschool.runescape.wiki/images/Giant_rat.png',
    cow: 'https://oldschool.runescape.wiki/images/Cow_%281%29.png',
    imp: 'https://oldschool.runescape.wiki/images/Imp.png',
    spider: 'https://oldschool.runescape.wiki/images/Spider.png',
    scorpion: 'https://oldschool.runescape.wiki/images/Scorpion.png',
    hill_giant: 'https://oldschool.runescape.wiki/images/Hill_Giant.png',
    lesser_demon: 'https://oldschool.runescape.wiki/images/Lesser_demon.png',
    green_dragon: 'https://oldschool.runescape.wiki/images/Green_dragon.png',
    blue_dragon: 'https://oldschool.runescape.wiki/images/Blue_dragon.png',
    black_demon: 'https://oldschool.runescape.wiki/images/Black_demon.png',
    abyssal_demon: 'https://oldschool.runescape.wiki/images/Abyssal_demon.png',
    barrow_wight: 'https://oldschool.runescape.wiki/images/Dharok_the_Wretched.png',
    chaos_druid: 'https://oldschool.runescape.wiki/images/Chaos_druid.png',
    skeletal_mage: 'https://oldschool.runescape.wiki/images/Skeleton_Mage_%28lv_16%29.png',
    skeleton: 'https://oldschool.runescape.wiki/images/Skeleton_%28level_22%2C_3%29.png',
    zombie: 'https://oldschool.runescape.wiki/images/Zombie_%28Level_13%2C_14%29.png',
    ghost: 'https://oldschool.runescape.wiki/images/Ghost.png',
    hellhound: 'https://oldschool.runescape.wiki/images/Hellhound.png',
    fire_giant: 'https://oldschool.runescape.wiki/images/Fire_giant.png',
    bloodveld: 'https://oldschool.runescape.wiki/images/Bloodveld.png',
    gargoyle: 'https://oldschool.runescape.wiki/images/Gargoyle.png',
    nechryael: 'https://oldschool.runescape.wiki/images/Nechryael.png',
    dark_beast: 'https://oldschool.runescape.wiki/images/Dark_beast.png',
    hydra: 'https://oldschool.runescape.wiki/images/Hydra.png',
    jad: 'https://oldschool.runescape.wiki/images/TzTok-Jad.png',
    vorkath: 'https://oldschool.runescape.wiki/images/Vorkath.png',
    zulrah: 'https://oldschool.runescape.wiki/images/Zulrah_%28serpentine%29.png',
    // Superior slayer variants (Bigger and Badder) — distinct NPC models.
    superior_bloodveld: 'https://oldschool.runescape.wiki/images/Insatiable_Bloodveld.png',
    superior_abyssal_demon: 'https://oldschool.runescape.wiki/images/Greater_abyssal_demon.png',
    superior_gargoyle: 'https://oldschool.runescape.wiki/images/Marble_gargoyle.png',
    superior_nechryael: 'https://oldschool.runescape.wiki/images/Nechryarch.png',
  },
  pets: {
    beaver: 'https://oldschool.runescape.wiki/images/Beaver.png',
    rock_golem: 'https://oldschool.runescape.wiki/images/Rock_golem.png',
    tangleroot: 'https://oldschool.runescape.wiki/images/Tangleroot.png',
    heron: 'https://oldschool.runescape.wiki/images/Heron.png',
    rift_guardian: 'https://oldschool.runescape.wiki/images/Rift_guardian_%28follower%2C_fire%29.png',
    baby_mole: 'https://oldschool.runescape.wiki/images/Baby_mole.png',
    vorki: 'https://oldschool.runescape.wiki/images/Vorki.png',
    snakeling: 'https://oldschool.runescape.wiki/images/Snakeling_%28tanzanite%29.png',
    prince_black_dragon: 'https://oldschool.runescape.wiki/images/Prince_black_dragon.png',
    kalphite_princess: 'https://oldschool.runescape.wiki/images/Kalphite_Princess_2nd_form.png',
    tzrek_jad: 'https://oldschool.runescape.wiki/images/TzRek-Jad.png',
    ikkle_hydra: 'https://oldschool.runescape.wiki/images/Ikkle_Hydra_%28serpentine%29.png',
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
    eagle_eye: `${LOCAL}/prayers/eagle_eye.png`,
    piety: `${LOCAL}/prayers/piety.png`,
    rigour: `${LOCAL}/prayers/rigour.png`,
    augury: `${LOCAL}/prayers/augury.png`,
  },
  towers: {
    archer: {
      1: 'https://oldschool.runescape.wiki/images/Shortbow.png',
      2: 'https://oldschool.runescape.wiki/images/Magic_shortbow.png',
      3: 'https://oldschool.runescape.wiki/images/Crystal_bow.png',
      4: 'https://oldschool.runescape.wiki/images/Bow_of_faerdhinen.png',
    },
    wizard: {
      1: 'https://oldschool.runescape.wiki/images/Staff_of_air.png',
      2: 'https://oldschool.runescape.wiki/images/Staff_of_water.png',
      3: 'https://oldschool.runescape.wiki/images/Ancient_staff.png',
      4: 'https://oldschool.runescape.wiki/images/Tumeken%27s_shadow.png',
      elemental_air: 'https://oldschool.runescape.wiki/images/Staff_of_air.png',
      elemental_water: 'https://oldschool.runescape.wiki/images/Staff_of_water.png',
      elemental_earth: 'https://oldschool.runescape.wiki/images/Staff_of_earth.png',
      elemental_fire: 'https://oldschool.runescape.wiki/images/Staff_of_fire.png',
      ancients: 'https://oldschool.runescape.wiki/images/Ancient_staff.png',
      // Ancients tower body = the Ancient sceptre variant matching the barrage.
      ancient_ice: 'https://oldschool.runescape.wiki/images/Ice_ancient_sceptre.png',
      ancient_blood: 'https://oldschool.runescape.wiki/images/Blood_ancient_sceptre.png',
      ancient_shadow: 'https://oldschool.runescape.wiki/images/Shadow_ancient_sceptre.png',
      ancient_smoke: 'https://oldschool.runescape.wiki/images/Smoke_ancient_sceptre.png',
      // Utility tower body: the Lunar staff (Lunar/Arceuus support magic).
      utility: 'https://oldschool.runescape.wiki/images/Lunar_staff.png',
    },
    cannon: {
      1: 'https://oldschool.runescape.wiki/images/Broken_multicannon.png',
      2: 'https://oldschool.runescape.wiki/images/Cannon_barrels_%28scenery%29.png',
      3: 'https://oldschool.runescape.wiki/images/Broken_multicannon_%28Shattered_Relics_League%29.png',
      4: 'https://oldschool.runescape.wiki/images/Dwarf_multicannon_%28Shattered_Relics_League%29.png',
    },
    slayer: {
      1: 'https://oldschool.runescape.wiki/images/Darklight.png',
      2: 'https://oldschool.runescape.wiki/images/Arclight.png',
      3: 'https://oldschool.runescape.wiki/images/Leaf-bladed_sword.png',
      4: 'https://oldschool.runescape.wiki/images/Emberlight.png',
    },
    tzhaar: {
      1: 'https://oldschool.runescape.wiki/images/TzHaar-Hur.png',
      2: 'https://oldschool.runescape.wiki/images/TzHaar-Mej.png',
      3: 'https://oldschool.runescape.wiki/images/TzHaar-Xil_%28sword%29.png',
      4: 'https://oldschool.runescape.wiki/images/TzHaar-Ket_%28level_149%29.png',
    },
    toxic: {
      1: 'https://oldschool.runescape.wiki/images/Tanzanite_fang.png',
      2: 'https://oldschool.runescape.wiki/images/Toxic_blowpipe.png',
      3: 'https://oldschool.runescape.wiki/images/Magic_fang.png',
      4: 'https://oldschool.runescape.wiki/images/Trident_of_the_swamp.png',
    },
  },
  items: {
    amulet_of_power: 'https://oldschool.runescape.wiki/images/Amulet_of_power.png',
    anti_dragon_shield: 'https://oldschool.runescape.wiki/images/Anti-dragon_shield.png',
    combat_bracelet: 'https://oldschool.runescape.wiki/images/Combat_bracelet.png',
    silverlight: 'https://oldschool.runescape.wiki/images/Silverlight.png',
    dragon_scimitar: 'https://oldschool.runescape.wiki/images/Dragon_scimitar.png',
    logs: 'https://oldschool.runescape.wiki/images/Logs.png',
    iron_ore: 'https://oldschool.runescape.wiki/images/Iron_ore.png',
    grimy_guam: 'https://oldschool.runescape.wiki/images/Grimy_guam_leaf.png',
    vial: 'https://oldschool.runescape.wiki/images/Vial_detail.png',
    guam_seed: 'https://oldschool.runescape.wiki/images/Guam_seed.png',
    ranarr_seed: 'https://oldschool.runescape.wiki/images/Ranarr_seed.png',
    potato_seed: 'https://oldschool.runescape.wiki/images/Potato_seed.png',
    potato: 'https://oldschool.runescape.wiki/images/Potato.png',
  },
  farming: {
    patch_empty: 'https://oldschool.runescape.wiki/images/Allotment_patch_%28empty%29.png',
    patch_growing: 'https://oldschool.runescape.wiki/images/Allotment_patch_%28growing%29.png',
    patch_ready: 'https://oldschool.runescape.wiki/images/Allotment_patch_%28ready%29.png',
    guam: 'https://oldschool.runescape.wiki/images/Guam_leaf.png',
    ranarr: 'https://oldschool.runescape.wiki/images/Ranarr_weed.png',
    potato: 'https://oldschool.runescape.wiki/images/Potato.png',
  },
  misc: {
    portal: 'https://oldschool.runescape.wiki/images/Transportation_logo.png',
    portal_shield: 'https://oldschool.runescape.wiki/images/Purple_Portal_Shield.png',
    tree: 'https://oldschool.runescape.wiki/images/Tree.png',
    ore_adamant: 'https://oldschool.runescape.wiki/images/Adamantite_ore.png',
    ranarr: 'https://oldschool.runescape.wiki/images/Ranarr_weed.png',
    // Skill/UI icons below are cache-extracted (SKILL_* sprite ids), served locally.
    magic_icon: `${LOCAL}/misc/magic_icon.png`,
    ranged_icon: `${LOCAL}/misc/ranged_icon.png`,
    strength_icon: `${LOCAL}/misc/strength_icon.png`,
    attack_icon: `${LOCAL}/misc/attack_icon.png`,
    bones_loot: 'https://oldschool.runescape.wiki/images/Bones.png',
    skill_mining: `${LOCAL}/misc/skill_mining.png`,
    skill_woodcutting: `${LOCAL}/misc/skill_woodcutting.png`,
    skill_herblore: `${LOCAL}/misc/skill_herblore.png`,
    skill_crafting: `${LOCAL}/misc/skill_crafting.png`,
    skill_prayer: `${LOCAL}/misc/prayer_icon.png`,
    slayer_crossbow: `${LOCAL}/misc/slayer_icon.png`,
    hit_splat: 'https://oldschool.runescape.wiki/images/Damage_hitsplat.png',
    magic_hit_splat: 'https://oldschool.runescape.wiki/images/Zero_damage_hitsplat.png',
    poison_hit_splat: 'https://oldschool.runescape.wiki/images/Poison_hit_splat.png',
    ranged_hit_splat: 'https://oldschool.runescape.wiki/images/Yellow-green_hitsplat.png',
    miss_hit_splat: 'https://oldschool.runescape.wiki/images/Shield_hitsplat.png',
    background_pattern: 'https://oldschool.runescape.wiki/images/Back_pattern.png',
    orb_background: 'https://oldschool.runescape.wiki/images/Orb_background.png',
    inventory_background: 'https://oldschool.runescape.wiki/images/Inventory_background.png',
    hp_icon: `${LOCAL}/misc/hp_icon.png`,
    ge_logo: 'https://oldschool.runescape.wiki/images/Grand_Exchange_logo.png',
    essence_icon: 'https://oldschool.runescape.wiki/images/Pure_essence_detail.png',
    pets_tab_icon: 'https://oldschool.runescape.wiki/images/Follower_Details.png',
    prayer_icon: `${LOCAL}/misc/prayer_icon.png`,
    coins_icon: 'https://oldschool.runescape.wiki/images/Coins_detail.png',
    rune_essence_icon: 'https://oldschool.runescape.wiki/images/Rune_essence_detail.png',
    herblore_icon: `${LOCAL}/misc/skill_herblore.png`,
    farming_icon: `${LOCAL}/misc/farming_icon.png`,
    // Spellbook icons for the wizard panel (Elemental→Standard, Ancients→Ancient,
    // Utility→Arceuus) — cache-extracted TAB_MAGIC* sprites, served locally.
    spellbook_standard: `${LOCAL}/misc/spellbook_standard.png`,
    spellbook_ancient: `${LOCAL}/misc/spellbook_ancient.png`,
    spellbook_arceuus: `${LOCAL}/misc/spellbook_arceuus.png`,
    wiki_base: 'https://oldschool.runescape.wiki/images/',
  },
  // Status-effect icons for the enemy hover panel (OSRS spell/status sprites).
  debuffs: {
    // slow = Giant snail, an NPC *model* (not a 2D sprite) — stays hot-linked
    // until the model-render track lands. The rest are cache-extracted sprites
    // (scripts/extract-osrs-sprites.mjs), served locally from public/.
    slow: 'https://oldschool.runescape.wiki/images/Giant_snail.png',
    stun: `${LOCAL}/debuffs/stun.png`, // SPELL_ENTANGLE (321)
    burn: `${LOCAL}/debuffs/burn.png`, // Burn hitsplat (1361)
    poison: `${LOCAL}/debuffs/poison.png`, // HITSPLAT_GREEN_POISON (1360)
    vuln: `${LOCAL}/debuffs/vuln.png`, // SPELL_WEAKEN (20)
  },
  sounds: {
    shoot: {
      archer: { 1: 'https://oldschool.runescape.wiki/images/transcoded/Longbow_attack.wav/Longbow_attack.wav.mp3' },
      wizard_air: { 0: 'https://oldschool.runescape.wiki/images/transcoded/Wind_Strike.ogg/Wind_Strike.ogg.mp3', 1: 'https://oldschool.runescape.wiki/images/transcoded/Wind_Bolt.ogg/Wind_Bolt.ogg.mp3', 2: 'https://oldschool.runescape.wiki/images/transcoded/Wind_Blast.ogg/Wind_Blast.ogg.mp3', 3: 'https://oldschool.runescape.wiki/images/transcoded/Wind_Wave.ogg/Wind_Wave.ogg.mp3', 4: 'https://oldschool.runescape.wiki/images/transcoded/Wind_Surge.ogg/Wind_Surge.ogg.mp3' },
      wizard_water: { 0: 'https://oldschool.runescape.wiki/images/transcoded/Water_Strike.ogg/Water_Strike.ogg.mp3', 1: 'https://oldschool.runescape.wiki/images/transcoded/Water_Bolt.ogg/Water_Bolt.ogg.mp3', 2: 'https://oldschool.runescape.wiki/images/transcoded/Water_Blast.ogg/Water_Blast.ogg.mp3', 3: 'https://oldschool.runescape.wiki/images/transcoded/Water_Wave.ogg/Water_Wave.ogg.mp3', 4: 'https://oldschool.runescape.wiki/images/transcoded/Water_Surge.ogg/Water_Surge.ogg.mp3' },
      wizard_earth: { 0: 'https://oldschool.runescape.wiki/images/transcoded/Earth_Strike.ogg/Earth_Strike.ogg.mp3', 1: 'https://oldschool.runescape.wiki/images/transcoded/Earth_Bolt.ogg/Earth_Bolt.ogg.mp3', 2: 'https://oldschool.runescape.wiki/images/transcoded/Earth_Blast.ogg/Earth_Blast.ogg.mp3', 3: 'https://oldschool.runescape.wiki/images/transcoded/Earth_Wave.ogg/Earth_Wave.ogg.mp3', 4: 'https://oldschool.runescape.wiki/images/Earth_Surge.ogg/Earth_Surge.ogg.mp3' },
      wizard_fire: { 0: 'https://oldschool.runescape.wiki/images/transcoded/Fire_Strike.ogg/Fire_Strike.ogg.mp3', 1: 'https://oldschool.runescape.wiki/images/transcoded/Fire_Bolt.ogg/Fire_Bolt.ogg.mp3', 2: 'https://oldschool.runescape.wiki/images/transcoded/Fire_Blast.ogg/Fire_Blast.ogg.mp3', 3: 'https://oldschool.runescape.wiki/images/transcoded/Fire_Wave.ogg/Fire_Wave.ogg.mp3', 4: 'https://oldschool.runescape.wiki/images/Fire_Surge.ogg/Fire_Surge.ogg.mp3' },
      ancient_ice: { 0: 'https://oldschool.runescape.wiki/images/transcoded/Ice_Rush.ogg/Ice_Rush.ogg.mp3', 1: 'https://oldschool.runescape.wiki/images/transcoded/Ice_Burst.ogg/Ice_Burst.ogg.mp3', 2: 'https://oldschool.runescape.wiki/images/transcoded/Ice_Blitz.ogg/Ice_Blitz.ogg.mp3', 3: 'https://oldschool.runescape.wiki/images/transcoded/Ice_Barrage.ogg/Ice_Barrage.ogg.mp3' },
      ancient_blood: { 0: 'https://oldschool.runescape.wiki/images/transcoded/Blood_Rush.ogg/Blood_Rush.ogg.mp3', 1: 'https://oldschool.runescape.wiki/images/transcoded/Blood_Burst.ogg/Blood_Burst.ogg.mp3', 2: 'https://oldschool.runescape.wiki/images/transcoded/Blood_Blitz.ogg/Blood_Blitz.ogg.mp3', 3: 'https://oldschool.runescape.wiki/images/transcoded/Blood_Barrage.ogg/Blood_Barrage.ogg.mp3' },
      ancient_shadow: { 0: 'https://oldschool.runescape.wiki/images/transcoded/Shadow_Rush.ogg/Shadow_Rush.ogg.mp3', 1: 'https://oldschool.runescape.wiki/images/transcoded/Shadow_Burst.ogg/Shadow_Burst.ogg.mp3', 2: 'https://oldschool.runescape.wiki/images/transcoded/Shadow_Blitz.ogg/Shadow_Blitz.ogg.mp3', 3: 'https://oldschool.runescape.wiki/images/transcoded/Shadow_Barrage.ogg/Shadow_Barrage.ogg.mp3' },
      ancient_smoke: { 0: 'https://oldschool.runescape.wiki/images/transcoded/Smoke_Rush.ogg/Smoke_Rush.ogg.mp3', 1: 'https://oldschool.runescape.wiki/images/transcoded/Smoke_Burst.ogg/Smoke_Burst.ogg.mp3', 2: 'https://oldschool.runescape.wiki/images/transcoded/Smoke_Blitz.ogg/Smoke_Blitz.ogg.mp3', 3: 'https://oldschool.runescape.wiki/images/Smoke_Barrage.ogg/Smoke_Barrage.ogg.mp3' },
      cannon: { 1: 'https://oldschool.runescape.wiki/images/transcoded/Darkness_impact.wav/Darkness_impact.wav.mp3' },
      tzhaar: { 1: 'https://oldschool.runescape.wiki/images/Superheat_Item.ogg' },
      slayer: { 1: 'https://oldschool.runescape.wiki/images/transcoded/Magic_Dart.ogg/Magic_Dart.ogg.mp3' },
      support: { 1: 'https://oldschool.runescape.wiki/images/transcoded/Heal_Other_cast.ogg/Heal_Other_cast.ogg.mp3' },
      toxic: { 1: 'https://oldschool.runescape.wiki/images/transcoded/Dart_attack.wav/Dart_attack.wav.ogg' },
    },
    death: {
      demon: 'https://oldschool.runescape.wiki/images/transcoded/Demon_death.ogg/Demon_death.ogg.mp3',
      dragon: 'https://oldschool.runescape.wiki/images/transcoded/Dragon_death.ogg/Dragon_death.ogg.mp3',
      boss: 'https://oldschool.runescape.wiki/images/transcoded/Boss_death.ogg/Boss_death.ogg.mp3',
      goblin: 'https://oldschool.runescape.wiki/images/transcoded/Goblin_death.ogg/Goblin_death.ogg.mp3',
      imp: 'https://oldschool.runescape.wiki/images/transcoded/Imp_death.ogg/Imp_death.ogg.mp3',
      abyssal_demon: 'https://oldschool.runescape.wiki/images/transcoded/Abyssal_demon_death.ogg/Abyssal_demon_death.ogg.mp3',
      ghost: 'https://oldschool.runescape.wiki/images/transcoded/Ghost_death.wav/Ghost_death.wav.ogg',
      human: 'https://oldschool.runescape.wiki/images/transcoded/Man_death.ogg/Man_death.ogg.mp3',
      cow: 'https://oldschool.runescape.wiki/images/transcoded/Cow_death.wav/Cow_death.wav.ogg',
      spider: 'https://oldschool.runescape.wiki/images/transcoded/Giant_spider_death.ogg/Giant_spider_death.ogg.mp3',
      zombie: 'https://oldschool.runescape.wiki/images/transcoded/Zombie_death.ogg/Zombie_death.ogg.mp3',
    },
    misc: {
      hit: 'https://oldschool.runescape.wiki/images/transcoded/Melee_hit_sound.ogg/Melee_hit_sound.ogg.mp3',
      kill: 'https://oldschool.runescape.wiki/images/transcoded/Zombie_death.ogg/Zombie_death.ogg.mp3',
      wave: 'https://oldschool.runescape.wiki/images/transcoded/Teleport_sound.ogg/Teleport_sound.ogg.mp3',
      upgrade: 'https://oldschool.runescape.wiki/images/transcoded/Level-up_sound.wav/Level-up_sound.wav.mp3',
      sell: 'https://oldschool.runescape.wiki/images/transcoded/Coins.wav/Coins.wav.ogg',
      boss_attack: 'https://oldschool.runescape.wiki/images/transcoded/Vorkath_attack_sound.ogg/Vorkath_attack_sound.ogg.mp3',
      prayer_on: 'https://oldschool.runescape.wiki/images/transcoded/Protect_from_Melee.ogg/Protect_from_Melee.ogg.mp3',
      prayer_off: 'https://oldschool.runescape.wiki/images/transcoded/Rapid_Heal.ogg/Rapid_Heal.ogg.mp3',
      potion: 'https://oldschool.runescape.wiki/images/transcoded/Liquid.wav/Liquid.wav.ogg',
      special_attack: 'https://oldschool.runescape.wiki/images/transcoded/Special_attack_sound.ogg/Special_attack_sound.ogg.mp3',
      click: 'https://oldschool.runescape.wiki/images/transcoded/Button_click.ogg/Button_click.ogg.mp3',
      interface_open: 'https://oldschool.runescape.wiki/images/transcoded/Interface_open.ogg/Interface_open.ogg.mp3',
      interface_close: 'https://oldschool.runescape.wiki/images/transcoded/Interface_close.ogg/Interface_close.ogg.mp3',
      pick_up: 'https://oldschool.runescape.wiki/images/transcoded/Pick_up_item.ogg/Pick_up_item.ogg.mp3',
      cannon_fire: 'https://oldschool.runescape.wiki/images/transcoded/Dwarf_multicannon_fire.ogg/Dwarf_multicannon_fire.ogg.mp3',
      death: 'https://oldschool.runescape.wiki/images/transcoded/Man_death.ogg/Man_death.ogg.mp3',
    }
  }
};
