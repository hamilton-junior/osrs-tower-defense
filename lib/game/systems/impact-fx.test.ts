import { describe, it, expect } from 'vitest';
import { IMPACT_RECIPES, resolveImpactTheme, fanSample, type ImpactTheme } from './impact-fx';

const THEMES: ImpactTheme[] = ['air', 'water', 'earth', 'fire', 'ice', 'blood', 'shadow', 'smoke'];

describe('resolveImpactTheme', () => {
  it('maps ancient barrage types to their tier theme', () => {
    expect(resolveImpactTheme('ancient_ice')).toBe('ice');
    expect(resolveImpactTheme('ancient_blood')).toBe('blood');
    expect(resolveImpactTheme('ancient_shadow')).toBe('shadow');
    expect(resolveImpactTheme('ancient_smoke')).toBe('smoke');
  });

  it('maps elemental spells to their element', () => {
    expect(resolveImpactTheme('spell', 'fire')).toBe('fire');
    expect(resolveImpactTheme('spell', 'water')).toBe('water');
    expect(resolveImpactTheme('magic_projectile', 'earth')).toBe('earth');
  });

  it('falls back to air for an elementless / none spell', () => {
    expect(resolveImpactTheme('spell')).toBe('air');
    expect(resolveImpactTheme('spell', 'none')).toBe('air');
  });

  it('is null for non-magic shots (arrows, cannonballs keep the plain spark)', () => {
    expect(resolveImpactTheme('arrow', 'fire')).toBeNull();
    expect(resolveImpactTheme('cannonball')).toBeNull();
    expect(resolveImpactTheme('dart')).toBeNull();
    expect(resolveImpactTheme('godsword')).toBeNull();
  });
});

describe('IMPACT_RECIPES', () => {
  it('has a well-formed recipe for every theme', () => {
    for (const theme of THEMES) {
      const r = IMPACT_RECIPES[theme];
      expect(r, theme).toBeTruthy();
      // radiating shards — every theme has them, and they're internally consistent
      expect(r.shards.count).toBeGreaterThan(0);
      expect(r.shards.lenMax).toBeGreaterThanOrEqual(r.shards.lenMin);
      expect(r.shards.life).toBeGreaterThan(0);
      expect(r.shards.color).toMatch(/^#/);
      // particle burst is non-empty and internally consistent
      const p = r.particles;
      expect(p.count).toBeGreaterThan(0);
      expect(p.colors.length).toBeGreaterThan(0);
      expect(p.colors.every(c => /^#/.test(c))).toBe(true);
      expect(p.speedMax).toBeGreaterThanOrEqual(p.speedMin);
      expect(p.sizeMax).toBeGreaterThanOrEqual(p.sizeMin);
      expect(p.lifeMax).toBeGreaterThanOrEqual(p.lifeMin);
      expect(p.lifeMin).toBeGreaterThan(0);
      // directional debris: a bounded fan (0 < spread <= PI) and a forward punch
      expect(p.spread, theme).toBeGreaterThan(0);
      expect(p.spread, theme).toBeLessThanOrEqual(Math.PI);
      expect(p.forwardBias, theme).toBeGreaterThanOrEqual(0);
      // mystical spark accent — a bright, non-empty, well-formed twinkle
      const sp = r.spark;
      expect(sp.count, theme).toBeGreaterThan(0);
      expect(sp.color, theme).toMatch(/^#/);
      expect(sp.life, theme).toBeGreaterThan(0);
      expect(sp.size, theme).toBeGreaterThan(0);
    }
  });

  it('covers exactly the eight themes', () => {
    expect(Object.keys(IMPACT_RECIPES).sort()).toEqual([...THEMES].sort());
  });

  it('is a punchy directional burst, not a round bloom or a grenade', () => {
    // No round primitives (flash/ring) may creep back — the recipe is shards +
    // particles only — and the spray stays bounded (a burst, not an explosion).
    for (const theme of THEMES) {
      const r = IMPACT_RECIPES[theme] as unknown as Record<string, unknown>;
      expect(r.flash, theme).toBeUndefined();
      expect(r.ring, theme).toBeUndefined();
      expect(IMPACT_RECIPES[theme].particles.count, theme).toBeLessThanOrEqual(16);
      expect(IMPACT_RECIPES[theme].shards.count, theme).toBeLessThanOrEqual(10);
    }
  });

  it('smoke reads grey, not olive', () => {
    // Smoke is a colourless element (canonical #9a9a9a); every colour it uses must
    // be greyscale (r == g == b) so it never drifts back to the old green tint.
    const isGrey = (hex: string) => {
      const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
      expect(m, hex).toBeTruthy();
      const [, r, g, b] = m!;
      return r.toLowerCase() === g.toLowerCase() && g.toLowerCase() === b.toLowerCase();
    };
    const s = IMPACT_RECIPES.smoke;
    expect(isGrey(s.shards.color)).toBe(true);
    expect(s.particles.colors.every(isGrey)).toBe(true);
    expect(isGrey(s.spark.color)).toBe(true);
  });
});

describe('fanSample', () => {
  const O = { x: 0, y: 0 };
  /** `n` points evenly around the origin, in bearing order already. */
  const ring = (n: number, r = 100) =>
    Array.from({ length: n }, (_, i) => ({
      id: i,
      x: Math.cos((i / n) * Math.PI * 2) * r,
      y: Math.sin((i / n) * Math.PI * 2) * r,
    }));

  it('keeps everything when the set already fits', () => {
    const items = ring(4);
    expect(fanSample(items, O, 6)).toEqual(items);
    expect(fanSample(items, O, 4)).toEqual(items);
  });

  it('copies rather than handing back the caller its own array', () => {
    const items = ring(3);
    const out = fanSample(items, O, 6);
    expect(out).not.toBe(items);
  });

  it('never returns more than the cap', () => {
    for (const n of [7, 12, 40, 200]) {
      expect(fanSample(ring(n), O, 6)).toHaveLength(6);
    }
  });

  it('returns nothing for a cap of zero or less', () => {
    expect(fanSample(ring(10), O, 0)).toEqual([]);
    expect(fanSample(ring(10), O, -3)).toEqual([]);
  });

  it('spreads the survivors around the origin instead of taking one side', () => {
    // The whole point: a naive slice(0, 6) of a list built in spawn order would take
    // whichever six happened to be first, and a slam into a crowd would read as a
    // directional attack. Thirty bodies in a full circle, arriving in a deliberately
    // *unsorted* order — the six kept must still cover the circle.
    const items = ring(30);
    const shuffled = [...items].sort((a, b) => ((a.id * 7) % 30) - ((b.id * 7) % 30));
    const out = fanSample(shuffled, O, 6);
    const quadrants = new Set(out.map(p => (p.x >= 0 ? 0 : 2) + (p.y >= 0 ? 0 : 1)));
    expect(quadrants.size).toBe(4);
  });

  it('picks each survivor only once', () => {
    const out = fanSample(ring(9), O, 6);
    expect(new Set(out.map(p => p.id)).size).toBe(6);
  });

  it('measures bearings from the origin it is given, not from (0,0)', () => {
    // Two bodies north of a slam that landed well south of them are on *the same* side
    // of the board but on opposite sides of the thrower, and the fan has to know it.
    const items = [{ id: 0, x: -50, y: 500 }, { id: 1, x: 50, y: 500 }, { id: 2, x: 0, y: 400 }];
    const out = fanSample(items, { x: 0, y: 600 }, 2);
    expect(out).toHaveLength(2);
    expect(new Set(out.map(p => p.id)).size).toBe(2);
  });
});
