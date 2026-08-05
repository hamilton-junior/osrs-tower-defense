import { describe, it, expect } from 'vitest';
import { GEAR, GEAR_POOL, AMMO_TIERS, JEWELLERY_TIERS, SIGNATURES } from './gear';
import { TOWER_AMMO_CLASS } from '../systems/tower-gear';
import type { AmmoClass } from '../types';

describe('gear pool', () => {
  it('every id matches its record key (stable ids)', () => {
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

  it('damage is monotonic non-decreasing within each ammo ladder (in tier order)', () => {
    for (const cls of Object.keys(AMMO_TIERS) as AmmoClass[]) {
      const dmgs = AMMO_TIERS[cls].map(t => GEAR[t.id].bonus.damage!);
      for (let i = 1; i < dmgs.length; i++) expect(dmgs[i]).toBeGreaterThanOrEqual(dmgs[i - 1]);
    }
  });

  it('damage is monotonic non-decreasing within the jewellery ladder', () => {
    const dmgs = JEWELLERY_TIERS.map(t => GEAR[t.id].bonus.damage!);
    for (let i = 1; i < dmgs.length; i++) expect(dmgs[i]).toBeGreaterThanOrEqual(dmgs[i - 1]);
  });

  it('has exactly two signatures, both jewellery, each with a gearEffect', () => {
    const sigs = GEAR_POOL.filter(g => g.rarity === 'signature');
    expect(sigs.length).toBe(2);
    for (const s of sigs) {
      expect(s.type).toBe('jewellery');
      expect(s.gearEffect).toBeDefined();
    }
    expect(SIGNATURES.length).toBe(2);
    expect(new Set(SIGNATURES.map(s => s.gearEffect))).toEqual(new Set(['anti_tank', 'slayer_bane']));
  });

  it('every AmmoClass has at least one common (non-signature) item', () => {
    const classes: AmmoClass[] = ['arrows', 'darts', 'cannonballs', 'runes', 'melee_kit'];
    for (const cls of classes) {
      const common = GEAR_POOL.filter(g => g.type === 'ammo' && g.ammoClass === cls && g.rarity !== 'signature');
      expect(common.length).toBeGreaterThanOrEqual(1);
    }
  });
});
