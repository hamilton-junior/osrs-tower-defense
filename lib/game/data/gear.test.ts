import { describe, it, expect } from 'vitest';
import { GEAR, GEAR_POOL } from './gear';
import { TOWER_STYLES } from './towers';
import type { WeaponClass } from '../types';

const WEAPON_CLASS_FOR: Record<string, WeaponClass> = {
  slayer: 'scimitar', tzhaar: 'maul', archer: 'bow',
  toxic: 'blowpipe', cannon: 'cannonball', wizard: 'staff',
};

describe('gear pool', () => {
  it('every id matches its record key', () => {
    for (const [key, item] of Object.entries(GEAR)) expect(item.id).toBe(key);
  });

  it('weapons declare a style + weaponClass; accessories declare neither', () => {
    for (const g of GEAR_POOL) {
      if (g.type === 'weapon') { expect(g.style).toBeDefined(); expect(g.weaponClass).toBeDefined(); }
      if (g.type === 'accessory') { expect(g.style).toBeUndefined(); expect(g.weaponClass).toBeUndefined(); }
    }
  });

  it('a weapon\'s style matches every tower that wields its class', () => {
    for (const g of GEAR_POOL) {
      if (g.type !== 'weapon' || !g.weaponClass) continue;
      for (const [type, cls] of Object.entries(WEAPON_CLASS_FOR)) {
        if (cls === g.weaponClass) expect(g.style).toBe(TOWER_STYLES[type as keyof typeof TOWER_STYLES].style);
      }
    }
  });

  it('every tower type has at least one common weapon of its class', () => {
    for (const cls of Object.values(WEAPON_CLASS_FOR)) {
      const common = GEAR_POOL.filter(g => g.weaponClass === cls && g.rarity === 'common');
      expect(common.length, `class ${cls}`).toBeGreaterThan(0);
    }
  });

  it('signatures carry a gearEffect and drop from bosses only', () => {
    for (const g of GEAR_POOL) {
      if (g.rarity === 'signature') expect(g.gearEffect).toBeDefined();
      if (g.gearEffect) expect(g.rarity).toBe('signature');
    }
  });
});
