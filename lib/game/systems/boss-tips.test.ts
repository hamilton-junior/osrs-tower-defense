import { describe, it, expect } from 'vitest';
import { BOSS_TIPS, bossTip } from './boss-tips';
import { MECHANIC_BOSSES, SCHEDULABLE_BOSSES } from './boss-mechanics';

describe('boss tips', () => {
  it('covers every boss the player can actually meet', () => {
    // The Record<BossId, string> makes this exhaustive at compile time, but only for
    // ids already in the union — this catches a boss added to the roster with an
    // empty placeholder line, which typechecks and says nothing to the player.
    for (const b of [...MECHANIC_BOSSES, ...SCHEDULABLE_BOSSES]) {
      expect(BOSS_TIPS[b]?.trim().length ?? 0).toBeGreaterThan(20);
    }
  });

  it('says nothing about an ordinary monster', () => {
    expect(bossTip('goblin')).toBeUndefined();
  });
});
