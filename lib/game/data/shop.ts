
export interface ShopItem {
  id: string;
  name: string;
  desc: string;
  cost: number;
  wiki: string;
  type: 'potion' | 'essence' | 'scroll';
}

export const GE_CONSUMABLES: ShopItem[] = [
  { id: 'ranging', name: 'Ranging Potion', desc: 'Archer Damage & Range +15%', cost: 100, wiki: 'Ranging_potion(4)', type: 'potion' },
  { id: 'magic', name: 'Magic Potion', desc: 'Wizard Damage +20%', cost: 150, wiki: 'Magic_potion(4)', type: 'potion' },
  { id: 'super_combat', name: 'Super Combat Potion', desc: 'TzHaar Damage +15%', cost: 200, wiki: 'Super_combat_potion(4)', type: 'potion' },
  { id: 'prayer_potion', name: 'Prayer Potion', desc: 'Restore 10 Prayer Points', cost: 50, wiki: 'Prayer_potion(4)', type: 'potion' },
  { id: 'super_restore', name: 'Super Restore', desc: 'Restore 20 Prayer Points', cost: 100, wiki: 'Super_restore(4)', type: 'potion' },
  { id: 'overload', name: 'Overload Potion', desc: 'All Towers +15% Stats', cost: 500, wiki: 'Overload_(4)', type: 'potion' },
];
