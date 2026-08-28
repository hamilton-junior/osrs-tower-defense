import { describe, it, expect } from 'vitest';
import { ENEMY_LOOKS, LOOK_BY_SLUG, LOOKS_BY_TYPE, defaultLookSlug, lookName, lookType } from './enemy-variants';
import { ENEMIES } from './enemies';
import { ENEMY_ANIMS } from './enemy-anims';
import type { EnemyType } from '../types';

describe('ENEMY_LOOKS', () => {
  it('names a monster that actually exists', () => {
    for (const l of ENEMY_LOOKS) expect(ENEMIES[l.of], `${l.slug} belongs to ${l.of}`).toBeTruthy();
  });

  it('only names looks that have baked clips behind them', () => {
    for (const l of ENEMY_LOOKS) expect(ENEMY_ANIMS[l.slug], `${l.slug} has no bake`).toBeTruthy();
  });

  it('gives every look its own name', () => {
    const names = ENEMY_LOOKS.map((l) => l.name);
    expect(new Set(names).size).toBe(names.length);
    expect(new Set(ENEMY_LOOKS.map((l) => l.slug)).size).toBe(ENEMY_LOOKS.length);
  });

  it('includes each grouped monster\'s own default look, so nothing is left out of its viewer', () => {
    for (const [type, looks] of Object.entries(LOOKS_BY_TYPE)) {
      const own = defaultLookSlug(type);
      expect(looks?.some((l) => l.slug === own), `${type} viewer is missing its default look ${own}`).toBe(true);
    }
  });

  /** The point of the table: a baked model a player can meet on the field must be
   *  reachable from a screen. Either it is a monster's own look, or it is named here. */
  it('leaves no baked model unreachable from the Bestiary', () => {
    const owned = new Set(Object.keys(ENEMIES).map((t) => defaultLookSlug(t)));
    for (const slug of Object.keys(ENEMY_ANIMS)) {
      expect(owned.has(slug) || slug in LOOK_BY_SLUG, `${slug} is baked but named nowhere`).toBe(true);
    }
  });

  it('resolves a slug back to its name and its monster', () => {
    expect(lookName('verac')).toBe('Verac the Defiled');
    expect(lookType('verac')).toBe('barrow_wight');
    // A plain monster is its own look.
    expect(lookName('goblin')).toBe(ENEMIES.goblin.name);
    expect(lookType('goblin' as EnemyType)).toBe('goblin');
    // …and one whose bake is filed under another slug still resolves.
    expect(defaultLookSlug('summoned_soul')).toBe('soul_melee');
  });
});
