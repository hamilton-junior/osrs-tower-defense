import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { GEAR, GEAR_POOL, AMMO_TIERS, JEWELLERY_TIERS, SIGNATURES } from './gear';
import { GEAR_ICONS } from '../assets';
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

  // The regression net for the "extensible for future towers" mandate: add a tier
  // to a ladder and forget its icon → this fails, instead of the slot silently
  // rendering the text fallback. Slug === id, so the baked file is items/<id>.png.
  it('every gear id has a GEAR_ICONS entry and a baked PNG on disk', () => {
    for (const id of Object.keys(GEAR)) {
      expect(GEAR_ICONS[id], `GEAR_ICONS missing "${id}"`).toBeTruthy();
      const file = join(process.cwd(), 'public', 'assets', 'items', `${id}.png`);
      expect(existsSync(file), `missing baked icon ${id}.png`).toBe(true);
    }
  });

  it('GEAR_ICONS has no orphan keys (every icon key is a real gear id)', () => {
    for (const key of Object.keys(GEAR_ICONS)) {
      expect(GEAR[key], `orphan GEAR_ICONS key "${key}"`).toBeDefined();
    }
  });

  // Makes the monotonic-damage tests above meaningful: damage grows with tier
  // INDEX by construction, so those tests can't catch a ladder authored out of
  // levelReq order (a low-level tier hitting harder than a high-level one). Assert
  // each ladder is already sorted by levelReq, so index order === level order.
  it('each ladder is authored in non-decreasing levelReq order', () => {
    const sortedIds = (tiers: { id: string; levelReq: number }[]) =>
      [...tiers].sort((a, b) => a.levelReq - b.levelReq).map(t => t.id);
    for (const cls of Object.keys(AMMO_TIERS) as AmmoClass[]) {
      expect(AMMO_TIERS[cls].map(t => t.id)).toEqual(sortedIds(AMMO_TIERS[cls]));
    }
    expect(JEWELLERY_TIERS.map(t => t.id)).toEqual(sortedIds(JEWELLERY_TIERS));
  });
});
