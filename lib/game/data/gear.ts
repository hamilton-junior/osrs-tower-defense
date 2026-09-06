import type { AmmoClass, GearEffectId, Item } from '../types';

/**
 * Classic-mode gear content: real OSRS tier ladders (ammo/runes/kit, one per
 * `AmmoClass`) plus a universal jewellery ladder and two boss-drop signature
 * amulets. `AMMO_TIERS` / `JEWELLERY_TIERS` / `SIGNATURES` are the source-of-truth
 * tables (id/name/levelReq); the generator below turns each entry into an `Item`
 * via the per-class bonus rule so the numbers live in one place. Icons are baked
 * from the OSRS cache (see assets.ts `GEAR_ICONS` / scripts/render-osrs-items.mjs) —
 * `id` here IS the baked-icon slug.
 */

interface TierEntry {
  id: string;
  name: string;
  levelReq: number;
}

/**
 * Per-class tier ladders (validated OSRS progressions — never invent a tier).
 * `melee_kit` is shared by both melee towers (slayer, tzhaar) and is really two
 * RFD reward sub-lines — gloves and defenders — merged into one progression:
 * interleaved by `levelReq` (gloves first on a tie) so a defender and its
 * paired glove sit at *consecutive* tiers of one shared ladder rather than two
 * parallel ladders. This keeps the bonus-rule index `i` a single running count
 * across the merged list, which is both simple and trivially monotonic.
 */
export const AMMO_TIERS: Record<AmmoClass, TierEntry[]> = {
  arrows: [
    { id: 'bronze_arrow', name: 'Bronze arrow', levelReq: 1 },
    { id: 'iron_arrow', name: 'Iron arrow', levelReq: 4 },
    { id: 'steel_arrow', name: 'Steel arrow', levelReq: 8 },
    { id: 'mithril_arrow', name: 'Mithril arrow', levelReq: 13 },
    { id: 'adamant_arrow', name: 'Adamant arrow', levelReq: 19 },
    { id: 'rune_arrow', name: 'Rune arrow', levelReq: 26 },
    { id: 'amethyst_arrow', name: 'Amethyst arrow', levelReq: 34 },
    { id: 'dragon_arrow', name: 'Dragon arrow', levelReq: 44 },
  ],
  darts: [
    { id: 'bronze_dart', name: 'Bronze dart', levelReq: 1 },
    { id: 'iron_dart', name: 'Iron dart', levelReq: 4 },
    { id: 'steel_dart', name: 'Steel dart', levelReq: 8 },
    { id: 'black_dart', name: 'Black dart', levelReq: 11 },
    { id: 'mithril_dart', name: 'Mithril dart', levelReq: 14 },
    { id: 'adamant_dart', name: 'Adamant dart', levelReq: 19 },
    { id: 'rune_dart', name: 'Rune dart', levelReq: 26 },
    { id: 'dragon_dart', name: 'Dragon dart', levelReq: 40 },
  ],
  cannonballs: [
    { id: 'cannonball', name: 'Cannonball', levelReq: 1 },
    { id: 'granite_cannonball', name: 'Granite cannonball', levelReq: 15 },
  ],
  runes: [
    { id: 'mind_rune', name: 'Mind rune', levelReq: 1 },
    { id: 'chaos_rune', name: 'Chaos rune', levelReq: 8 },
    { id: 'tome_of_water', name: 'Tome of water', levelReq: 12 },
    { id: 'tome_of_earth', name: 'Tome of earth', levelReq: 16 },
    { id: 'death_rune', name: 'Death rune', levelReq: 18 },
    { id: 'tome_of_fire', name: 'Tome of fire', levelReq: 22 },
    { id: 'blood_rune', name: 'Blood rune', levelReq: 28 },
    { id: 'mages_book', name: "Mage's book", levelReq: 30 },
    { id: 'wrath_rune', name: 'Wrath rune', levelReq: 38 },
  ],
  melee_kit: [
    { id: 'bronze_gloves', name: 'Bronze gloves', levelReq: 1 },
    { id: 'bronze_defender', name: 'Bronze defender', levelReq: 1 },
    { id: 'iron_gloves', name: 'Iron gloves', levelReq: 4 },
    { id: 'iron_defender', name: 'Iron defender', levelReq: 4 },
    { id: 'steel_gloves', name: 'Steel gloves', levelReq: 7 },
    { id: 'steel_defender', name: 'Steel defender', levelReq: 7 },
    { id: 'black_gloves', name: 'Black gloves', levelReq: 10 },
    { id: 'black_defender', name: 'Black defender', levelReq: 10 },
    { id: 'mithril_gloves', name: 'Mithril gloves', levelReq: 13 },
    { id: 'mithril_defender', name: 'Mithril defender', levelReq: 13 },
    { id: 'adamant_gloves', name: 'Adamant gloves', levelReq: 18 },
    { id: 'adamant_defender', name: 'Adamant defender', levelReq: 18 },
    { id: 'rune_gloves', name: 'Rune gloves', levelReq: 24 },
    { id: 'rune_defender', name: 'Rune defender', levelReq: 24 },
    { id: 'dragon_gloves', name: 'Dragon gloves', levelReq: 32 },
    { id: 'dragon_defender', name: 'Dragon defender', levelReq: 32 },
    { id: 'barrows_gloves', name: 'Barrows gloves', levelReq: 42 },
    { id: 'avernic_defender', name: 'Avernic defender', levelReq: 44 },
  ],
};

/** Universal jewellery ladder — fits any tower (no `ammoClass`). */
export const JEWELLERY_TIERS: TierEntry[] = [
  { id: 'amulet_of_strength', name: 'Amulet of strength', levelReq: 1 },
  { id: 'amulet_of_power', name: 'Amulet of power', levelReq: 8 },
  { id: 'amulet_of_glory', name: 'Amulet of glory', levelReq: 16 },
  { id: 'amulet_of_fury', name: 'Amulet of fury', levelReq: 28 },
  { id: 'amulet_of_torture', name: 'Amulet of torture', levelReq: 40 },
];

/** Universal jewellery signatures — boss-only drops. Each carries the `gearEffect`
 *  its behaviour is keyed off and the one line the hover card leads with, on top of
 *  the stat line every signature shares. */
export const SIGNATURES: (TierEntry & { gearEffect: GearEffectId; blurb: string })[] = [
  { id: 'amulet_of_blood_fury', name: 'Amulet of blood fury', levelReq: 40, gearEffect: 'blood_fury',
    blurb: 'Hits harder the tougher the enemy, and a kill can win a lost life back.' },
  { id: 'salve_amulet_ei', name: 'Salve amulet (ei)', levelReq: 30, gearEffect: 'slayer_bane',
    blurb: 'Hits harder against your Slayer task, superiors and bosses.' },
  { id: 'amulet_of_the_damned', name: 'Amulet of the damned', levelReq: 35, gearEffect: 'cc_breaker',
    blurb: 'Whatever it hits takes full slows and stuns for a moment.' },
];

const GROWTH = 1.35;
const BASE_DMG: Record<AmmoClass | 'jewellery', number> = {
  arrows: 5,
  darts: 4,
  cannonballs: 6,
  runes: 6,
  melee_kit: 5,
  jewellery: 5,
};

/** damage = round(baseDmg[class] * growth^i), the shared bonus-rule curve. */
function tierDamage(cls: AmmoClass | 'jewellery', i: number): number {
  return Math.round(BASE_DMG[cls] * Math.pow(GROWTH, i));
}

function ammoDescription(cls: AmmoClass, name: string): string {
  const noun = cls === 'runes' ? 'runes' : cls === 'melee_kit' ? 'melee kit' : cls;
  return `${name}: ${noun} tier for the matching tower's ammo slot.`;
}

/** Build the full `AmmoClass` ladders into `Item`s via the bonus rule: damage
 *  from the shared curve, arrows add `range: 6 + 2*i`, darts add `cooldown: 5 + i`
 *  (both folded as +%/100 by `calculateTowerStats` — untouched here). */
function buildAmmoItems(): Item[] {
  const items: Item[] = [];
  for (const cls of Object.keys(AMMO_TIERS) as AmmoClass[]) {
    const tiers = AMMO_TIERS[cls];
    tiers.forEach((tier, i) => {
      const bonus: Item['bonus'] = { damage: tierDamage(cls, i) };
      if (cls === 'arrows') bonus.range = 6 + 2 * i;
      if (cls === 'darts') bonus.cooldown = 5 + i;
      items.push({
        id: tier.id,
        name: tier.name,
        description: ammoDescription(cls, tier.name),
        type: 'ammo',
        ammoClass: cls,
        levelReq: tier.levelReq,
        rarity: 'common',
        bonus,
      });
    });
  }
  return items;
}

/** Universal jewellery ladder. The two lowest tiers add `xpBonus` (indexed by
 *  id, not position, since only `amulet_of_power`/`amulet_of_glory` carry it). */
function buildJewelleryItems(): Item[] {
  const XP_BONUS: Record<string, number> = { amulet_of_power: 10, amulet_of_glory: 15 };
  return JEWELLERY_TIERS.map((tier, i) => {
    const bonus: Item['bonus'] = { damage: tierDamage('jewellery', i) };
    if (XP_BONUS[tier.id] !== undefined) bonus.xpBonus = XP_BONUS[tier.id];
    return {
      id: tier.id,
      name: tier.name,
      description: `${tier.name}: universal jewellery, fits any tower.`,
      type: 'jewellery',
      levelReq: tier.levelReq,
      rarity: 'common',
      bonus,
    } as Item;
  });
}

/** Boss-drop signature jewellery: the shared stat line plus the effect id the
 *  firing pipeline reads (systems/tower-gear.ts). The stats are half flat, half
 *  percentage — the flat half carries an early tower, the percentage half keeps the
 *  piece worth its slot on a maxed one, which a flat 25 stopped doing long before
 *  the boss that drops it was even scheduled. */
function buildSignatureItems(): Item[] {
  return SIGNATURES.map(sig => ({
    id: sig.id,
    name: sig.name,
    description: sig.blurb,
    type: 'jewellery',
    levelReq: sig.levelReq,
    rarity: 'signature',
    gearEffect: sig.gearEffect,
    bonus: { damage: 20, damagePct: 20 },
  } as Item));
}

/** The full Classic-mode gear pool, keyed by id (== the baked-icon slug). */
export const GEAR: Record<string, Item> = Object.fromEntries(
  [...buildAmmoItems(), ...buildJewelleryItems(), ...buildSignatureItems()].map(item => [item.id, item]),
);

/** Flat list, handy for the drop roll and the equip picker. */
export const GEAR_POOL: Item[] = Object.values(GEAR);
