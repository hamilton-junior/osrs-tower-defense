import { describe, it, expect } from 'vitest';
import { IMPACT_RECIPES, resolveImpactTheme, type ImpactTheme } from './impact-fx';

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
      // flash core blooms with a positive radius/life
      expect(r.flash.r).toBeGreaterThan(0);
      expect(r.flash.life).toBeGreaterThan(0);
      expect(r.flash.color).toMatch(/^#/);
      // ring expands outward
      expect(r.ring.r1).toBeGreaterThan(r.ring.r0);
      expect(r.ring.life).toBeGreaterThan(0);
      expect(r.ring.color).toMatch(/^#/);
      // shards (optional) are internally consistent when present
      if (r.shards) {
        expect(r.shards.count).toBeGreaterThan(0);
        expect(r.shards.lenMax).toBeGreaterThanOrEqual(r.shards.lenMin);
        expect(r.shards.life).toBeGreaterThan(0);
        expect(r.shards.color).toMatch(/^#/);
      }
      // particle burst is non-empty and internally consistent
      const p = r.particles;
      expect(p.count).toBeGreaterThan(0);
      expect(p.colors.length).toBeGreaterThan(0);
      expect(p.colors.every(c => /^#/.test(c))).toBe(true);
      expect(p.speedMax).toBeGreaterThanOrEqual(p.speedMin);
      expect(p.sizeMax).toBeGreaterThanOrEqual(p.sizeMin);
      expect(p.lifeMax).toBeGreaterThanOrEqual(p.lifeMin);
      expect(p.lifeMin).toBeGreaterThan(0);
    }
  });

  it('covers exactly the eight themes', () => {
    expect(Object.keys(IMPACT_RECIPES).sort()).toEqual([...THEMES].sort());
  });

  it('stays crisp, not a blown-out explosion', () => {
    // Guard against the effects creeping back to the over-scaled "grenade" look:
    // small flashes, short shockwaves, a handful of motes.
    for (const theme of THEMES) {
      const r = IMPACT_RECIPES[theme];
      expect(r.flash.r, theme).toBeLessThanOrEqual(14);
      expect(r.ring.r1, theme).toBeLessThanOrEqual(30);
      expect(r.particles.count, theme).toBeLessThanOrEqual(10);
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
    expect(isGrey(s.flash.color)).toBe(true);
    expect(isGrey(s.ring.color)).toBe(true);
    expect(s.particles.colors.every(isGrey)).toBe(true);
  });
});
