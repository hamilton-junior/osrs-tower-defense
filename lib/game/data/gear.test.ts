import { describe, it, expect } from 'vitest';
import { GEAR, GEAR_POOL } from './gear';
import { TOWER_AMMO_CLASS } from '../systems/tower-gear';

describe('gear pool', () => {
  it('every id matches its record key', () => {
    for (const [key, item] of Object.entries(GEAR)) expect(item.id).toBe(key);
  });

  it('ammo declares an ammoClass; jewellery declares none', () => {
    for (const g of GEAR_POOL) {
      if (g.type === 'ammo') expect(g.ammoClass).toBeDefined();
      if (g.type === 'jewellery') expect(g.ammoClass).toBeUndefined();
    }
  });

  it('every declared ammoClass is one some tower actually consumes', () => {
    const classes = new Set(Object.values(TOWER_AMMO_CLASS));
    for (const g of GEAR_POOL) {
      if (g.type === 'ammo') expect(classes.has(g.ammoClass!)).toBe(true);
    }
  });

  it('signatures carry a gearEffect and drop from bosses only', () => {
    for (const g of GEAR_POOL) {
      if (g.rarity === 'signature') expect(g.gearEffect).toBeDefined();
      if (g.gearEffect) expect(g.rarity).toBe('signature');
    }
  });
});
