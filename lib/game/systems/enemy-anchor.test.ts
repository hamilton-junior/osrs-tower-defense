import { describe, it, expect } from 'vitest';
import { ENEMIES } from '../data/enemies';
import type { EnemyType } from '../types';
import { bodyY, drawnSize } from './enemy-anchor';

describe('enemy anchor', () => {
  it('leaves every monster without a bodyRise exactly where it stands', () => {
    for (const def of Object.values(ENEMIES)) {
      if (def.bodyRise) continue;
      expect(bodyY({ type: def.type, y: 400, isBoss: def.isBoss, renderScale: def.renderScale })).toBe(400);
    }
  });

  it('raises the Giant Mole onto the body its dig clip left room above', () => {
    const mole = ENEMIES.giant_mole;
    const size = drawnSize(mole); // 60 * 1.4 = 84
    expect(size).toBeCloseTo(84);
    // The walking body is baked into the top of the cell — about a quarter of the
    // drawn size above the point. Anything pinned to the point lands in the dirt.
    expect(bodyY({ type: 'giant_mole', y: 400, isBoss: mole.isBoss, renderScale: mole.renderScale }))
      .toBeCloseTo(400 - 0.3 * 84);
  });

  it('scales the rise with the sprite, not with the raw board size', () => {
    const big = bodyY({ type: 'giant_mole', y: 0, isBoss: true, renderScale: 2 });
    const small = bodyY({ type: 'giant_mole', y: 0, isBoss: true, renderScale: 1 });
    expect(big).toBeCloseTo(small * 2);
  });

  it('measures a boss sprite at twice a regular enemy', () => {
    expect(drawnSize({ isBoss: true })).toBe(60);
    expect(drawnSize({})).toBe(30);
  });

  it('ignores a type that is not a monster', () => {
    expect(bodyY({ type: 'not_a_monster' as EnemyType, y: 123 })).toBe(123);
  });
});
