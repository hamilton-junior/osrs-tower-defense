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
];
const DEATH_SOUNDS: Record<string, string> = {};
for (const t of DEATH_TYPES) DEATH_SOUNDS[t] = `${SND}/death_${t}.wav`;

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
    // Superior slayer variants (Bigger and Badder) — NPC models rendered from
    // the game cache (scripts/render-osrs-npcs.mjs), served locally.
    superior_bloodveld: `${LOCAL}/models/superior_bloodveld.png`,         // Insatiable Bloodveld
    superior_abyssal_demon: `${LOCAL}/models/superior_abyssal_demon.png`, // Greater abyssal demon
    superior_gargoyle: `${LOCAL}/models/superior_gargoyle.png`,           // Marble gargoyle
    superior_nechryael: `${LOCAL}/models/superior_nechryael.png`,         // Nechryarch
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
    // Generic portal icon (legacy UI fallback only — the live spawn portal is
    // drawn procedurally in renderer.drawSpawnPortal, no sprite).
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
  // Baked spotanim (GFX) sprite sheets — animated cache effects rendered offline
  // to a horizontal sheet by scripts/render-osrs-spotanims.mjs. Played frame by
  // frame at runtime (see lib/game/data/spotanims.ts + GameRenderer.drawEffects).
  spotanims: {
    spawn: `${LOCAL}/spotanims/spawn.png`, // Teleport gem (spotanim 111) — enemy materialise
    portal: `${LOCAL}/spotanims/portal.png`, // Void portal NPC (1739) idle swirl — looping
  },
  sounds: {
    shoot: SHOOT_SOUNDS,
    spellHit: SPELL_HIT,
    death: DEATH_SOUNDS,
    misc: {
      // Core SFX repointed to authentic clips decoded straight from the OSRS game
      // cache (scripts/extract-osrs-sounds.mjs → public/assets/sounds/), so they no
      // longer depend on the sparse, transcoded wiki set. The remaining wiki URLs
      // are clips with no verified cache id yet.
      hit: `${LOCAL}/sounds/combat_hit.wav`,            // attack-hit thud (2498)
      kill: 'https://oldschool.runescape.wiki/images/transcoded/Zombie_death.ogg/Zombie_death.ogg.mp3',
      wave: `${LOCAL}/sounds/ui_teleport.wav`,          // teleport vwoop (200)
      upgrade: 'https://oldschool.runescape.wiki/images/transcoded/Level-up_sound.wav/Level-up_sound.wav.mp3',
      sell: `${LOCAL}/sounds/ui_coins.wav`,             // coin tinkle (3924)
      boss_attack: 'https://oldschool.runescape.wiki/images/transcoded/Vorkath_attack_sound.ogg/Vorkath_attack_sound.ogg.mp3',
      prayer_on: `${LOCAL}/sounds/prayer_generic_on.wav`,  // thick-skin "vwoom" (2690)
      prayer_off: `${LOCAL}/sounds/prayer_off.wav`,        // deactivate vwoop (2663)
      potion: 'https://oldschool.runescape.wiki/images/transcoded/Liquid.wav/Liquid.wav.ogg',
      special_attack: 'https://oldschool.runescape.wiki/images/transcoded/Special_attack_sound.ogg/Special_attack_sound.ogg.mp3',
      click: `${LOCAL}/sounds/ui_click.wav`,            // boop (2266)
      select: `${LOCAL}/sounds/ui_select.wav`,          // soft poh build-select chime (970)
      interface_open: `${LOCAL}/sounds/ge_offer.wav`,   // GE add-offer chime (3925)
      interface_close: `${LOCAL}/sounds/ge_collect.wav`,// GE collect (3928)
      pick_up: 'https://oldschool.runescape.wiki/images/transcoded/Pick_up_item.ogg/Pick_up_item.ogg.mp3',
      cannon_fire: `${SND}/fire_cannon.wav`,             // mcannon_fire (1667)
      death: 'https://oldschool.runescape.wiki/images/transcoded/Man_death.ogg/Man_death.ogg.mp3',
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
