import { describe, it, expect } from 'vitest';
import { ENEMIES } from './enemies';

/**
 * The weakness table is hand-curated data, so the rules it is curated *under* have
 * to be asserted somewhere or the next person to add a monster will quietly break
 * them. These are those rules, not a restatement of the table's contents — adding a
 * monster should never mean editing this file.
 */
describe('weaknesses', () => {
  const all = Object.entries(ENEMIES);

  it('gives every monster at most one answer', () => {
    // An elemental weakness is the wizard's axis; a style weakness is everyone
    // else's. A monster carrying both would hand the player two right answers and
    // make the choice meaningless.
    const both = all.filter(([, def]) => def.weakness && def.weakness !== 'none' && def.styleWeakness);
    expect(both.map(([type]) => type)).toEqual([]);
  });

  it('never spells a magic answer as a style', () => {
    // Magic's weakness is always an element, so the wizard's four-way choice stays
    // its own puzzle instead of collapsing to "wizard, any element".
    const magic = all.filter(([, def]) => (def.styleWeakness as string) === 'magic');
    expect(magic.map(([type]) => type)).toEqual([]);
  });

  it('leaves no combat style without targets', () => {
    // The bug this whole axis exists to fix: every monster used to be elemental, so
    // a bow or a blade was never the *right* answer to anything.
    for (const style of ['melee', 'ranged'] as const) {
      const targets = all.filter(([, def]) => def.styleWeakness === style);
      expect(targets.length, `nothing is weak to ${style}`).toBeGreaterThanOrEqual(4);
    }
    for (const el of ['air', 'water', 'earth', 'fire'] as const) {
      const targets = all.filter(([, def]) => def.weakness === el);
      expect(targets.length, `nothing is weak to ${el}`).toBeGreaterThanOrEqual(4);
    }
  });

  it('gives at least one boss to each answer, so late waves ask the question too', () => {
    const bossAnswers = new Set(
      all.filter(([, def]) => def.isBoss)
        .map(([, def]) => def.styleWeakness ?? (def.weakness !== 'none' ? def.weakness : undefined))
        .filter(Boolean) as string[],
    );
    expect(bossAnswers).toContain('melee');
    expect(bossAnswers).toContain('ranged');
  });
});
