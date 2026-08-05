import type { Item } from '../types';

/**
 * The Classic-mode gear pool. TEMPORARY minimal set (Task 2 replaces this with
 * the full per-class ammo ladders): one arrow (archer), one melee kit (slayer /
 * tzhaar), one universal jewellery piece, and the two signature effects. Ammo is
 * class-gated to the tower's `ammoClass` (see `TOWER_AMMO_CLASS`); jewellery is
 * universal. Common pieces carry only `bonus` (folded by calculateTowerStats);
 * signatures also carry a `gearEffect`. Icons are baked from the OSRS cache (see
 * assets.ts / render-osrs-items.mjs). Numbers are a starting point; balance is
 * the user's.
 */
export const GEAR: Record<string, Item> = {
  // --- ammo: arrows (archer) ---
  bronze_arrows_g: { id: 'bronze_arrows_g', name: 'Bronze arrows', description: 'Basic ammunition for the archer tower.', type: 'ammo', ammoClass: 'arrows', levelReq: 1, rarity: 'common', bonus: { damage: 10 } },
  // --- ammo: melee kit (slayer, tzhaar) ---
  whetstone_kit_g: { id: 'whetstone_kit_g', name: 'Whetstone kit', description: "Keeps a melee tower's edge sharp.", type: 'ammo', ammoClass: 'melee_kit', levelReq: 1, rarity: 'common', bonus: { damage: 8 } },
  // --- jewellery (universal) ---
  amulet_of_power_g: { id: 'amulet_of_power_g', name: 'Amulet of power', description: 'Balanced power for any tower.', type: 'jewellery', levelReq: 1, rarity: 'common', bonus: { damage: 5, xpBonus: 10 } },
  // --- signatures (boss drops; carry a gearEffect) ---
  twisted_arrows_g: { id: 'twisted_arrows_g', name: 'Twisted arrows', description: 'Damage climbs against tougher foes.', type: 'ammo', ammoClass: 'arrows', levelReq: 40, rarity: 'signature', gearEffect: 'anti_tank', bonus: { damage: 30, range: 20 } },
  bane_amulet_g: { id: 'bane_amulet_g', name: 'Bane amulet', description: 'Bane of task monsters, superiors and bosses.', type: 'jewellery', levelReq: 30, rarity: 'signature', gearEffect: 'slayer_bane', bonus: { damage: 25 } },
};

/** Flat list, handy for the drop roll and the equip picker. */
export const GEAR_POOL: Item[] = Object.values(GEAR);
