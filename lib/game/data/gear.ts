import type { Item } from '../types';

/**
 * The Classic-mode gear pool. Weapons are style- and class-gated; accessories are
 * universal. Common pieces carry only `bonus` (folded by calculateTowerStats);
 * signatures also carry a `gearEffect`. Line lengths vary by class on purpose —
 * some OSRS weapon families tier deeper than others. Icons are baked from the OSRS
 * cache (see assets.ts / render-osrs-items.mjs). Numbers are a starting point;
 * balance is the user's.
 */
export const GEAR: Record<string, Item> = {
  // --- melee: scimitar (slayer) ---
  iron_scimitar_g:  { id: 'iron_scimitar_g',  name: 'Iron scimitar',  description: 'A slayer-tower blade.', type: 'weapon', style: 'melee', weaponClass: 'scimitar', levelReq: 1,  rarity: 'common', bonus: { damage: 10 } },
  rune_scimitar_g:  { id: 'rune_scimitar_g',  name: 'Rune scimitar',  description: 'Runite edge.',          type: 'weapon', style: 'melee', weaponClass: 'scimitar', levelReq: 12, rarity: 'common', bonus: { damage: 30 } },
  dragon_scimitar_g:{ id: 'dragon_scimitar_g',name: 'Dragon scimitar',description: 'Ancient steel.',         type: 'weapon', style: 'melee', weaponClass: 'scimitar', levelReq: 25, rarity: 'common', bonus: { damage: 55 } },
  // --- melee: maul (tzhaar) ---
  warhammer_g:  { id: 'warhammer_g',  name: 'Warhammer',      description: 'A blunt starter.', type: 'weapon', style: 'melee', weaponClass: 'maul', levelReq: 1,  rarity: 'common', bonus: { damage: 8 } },
  granite_maul_g:{ id: 'granite_maul_g',name: 'Granite maul',  description: 'Heavy rock.',      type: 'weapon', style: 'melee', weaponClass: 'maul', levelReq: 12, rarity: 'common', bonus: { damage: 28 } },
  tzhaar_ket_om:{ id: 'tzhaar_ket_om',name: 'TzHaar-ket-om',  description: 'Obsidian maul.',    type: 'weapon', style: 'melee', weaponClass: 'maul', levelReq: 25, rarity: 'common', bonus: { damage: 50 } },
  // --- ranged: bow (archer) ---
  shortbow_g:      { id: 'shortbow_g',      name: 'Shortbow',       description: 'Quick draw.',   type: 'weapon', style: 'ranged', weaponClass: 'bow', levelReq: 1,  rarity: 'common', bonus: { damage: 8,  range: 10 } },
  magic_shortbow_g:{ id: 'magic_shortbow_g',name: 'Magic shortbow', description: 'Enchanted yew.', type: 'weapon', style: 'ranged', weaponClass: 'bow', levelReq: 12, rarity: 'common', bonus: { damage: 26, range: 15 } },
  dark_bow_g:      { id: 'dark_bow_g',      name: 'Dark bow',       description: 'Twin arrows.',   type: 'weapon', style: 'ranged', weaponClass: 'bow', levelReq: 25, rarity: 'common', bonus: { damage: 48, range: 20 } },
  // --- ranged: blowpipe (toxic) ---
  toxic_blowpipe_g:{ id: 'toxic_blowpipe_g',name: 'Toxic blowpipe', description: 'Venomous dart-thrower.', type: 'weapon', style: 'ranged', weaponClass: 'blowpipe', levelReq: 20, rarity: 'common', bonus: { damage: 34, cooldown: 15 } },
  // --- ranged: cannonball (cannon) ---
  cannonball_g:        { id: 'cannonball_g',        name: 'Cannonball',         description: 'Standard shot.', type: 'weapon', style: 'ranged', weaponClass: 'cannonball', levelReq: 1,  rarity: 'common', bonus: { damage: 6 } },
  granite_cannonball_g:{ id: 'granite_cannonball_g',name: 'Granite cannonball', description: 'Denser shot.',    type: 'weapon', style: 'ranged', weaponClass: 'cannonball', levelReq: 15, rarity: 'common', bonus: { damage: 22 } },
  // --- magic: staff (wizard) ---
  battlestaff_g:{ id: 'battlestaff_g',name: 'Battlestaff',  description: 'Solid focus.',   type: 'weapon', style: 'magic', weaponClass: 'staff', levelReq: 1,  rarity: 'common', bonus: { damage: 8 } },
  mystic_staff_g:{ id: 'mystic_staff_g',name: 'Mystic staff',description: 'Mystic-tipped.', type: 'weapon', style: 'magic', weaponClass: 'staff', levelReq: 12, rarity: 'common', bonus: { damage: 24 } },
  ancient_staff_g:{ id: 'ancient_staff_g',name: 'Ancient staff',description: 'Zarosian relic.', type: 'weapon', style: 'magic', weaponClass: 'staff', levelReq: 25, rarity: 'common', bonus: { damage: 46 } },
  // --- accessories (universal) ---
  amulet_of_power_g:{ id: 'amulet_of_power_g',name: 'Amulet of power',description: 'Balanced power.', type: 'accessory', levelReq: 1,  rarity: 'common', bonus: { damage: 5, xpBonus: 10 } },
  combat_bracelet_g:{ id: 'combat_bracelet_g',name: 'Combat bracelet',description: 'Sturdy band.',   type: 'accessory', levelReq: 15, rarity: 'common', bonus: { damage: 8 } },
  // --- signatures (boss drops; carry a gearEffect) ---
  twisted_bow_g:{ id: 'twisted_bow_g',name: 'Twisted bow', description: 'Damage climbs against tougher foes.', type: 'weapon', style: 'ranged', weaponClass: 'bow',      levelReq: 40, rarity: 'signature', gearEffect: 'twisted_bow', bonus: { damage: 30, range: 20 } },
  darklight_g:  { id: 'darklight_g',  name: 'Darklight',   description: 'Bane of task monsters, superiors and bosses.', type: 'weapon', style: 'melee', weaponClass: 'scimitar', levelReq: 30, rarity: 'signature', gearEffect: 'darklight', bonus: { damage: 25 } },
};

/** Flat list, handy for the drop roll and the equip picker. */
export const GEAR_POOL: Item[] = Object.values(GEAR);
