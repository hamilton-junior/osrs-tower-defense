import { describe, it, expect } from 'vitest';
import { PrayerSystem } from './prayer-system';
import { DEFAULT_UPGRADES } from './meta-progression';
import type { GameEngine } from '../core/engine';

/** Minimal engine stand-in exposing just what PrayerSystem reads. */
function makeEngine(cfg: {
  wave: number;
  waveActive: boolean;
  towers: { type: string; mageMode?: string; supportSpell?: string; targetId: string | null }[];
  prayerRegen?: number;
}): GameEngine {
  return {
    wave: cfg.wave,
    waveActive: cfg.waveActive,
    towers: cfg.towers,
    meta: { upgrades: { ...DEFAULT_UPGRADES, prayerRegen: cfg.prayerRegen ?? 0 } },
    playSound() {},
    notify() {},
    requestEmit() {},
  } as unknown as GameEngine;
}

/** A Prayer Ward ("Vile Vigour") wizard, flagged as actively casting. */
const ward = () => ({ type: 'wizard', mageMode: 'utility', supportSpell: 'sanctity', targetId: 'e' });
const wards = (n: number) => Array.from({ length: n }, ward);

/** Turn on the three strongest prayers (all unlocked by wave 20). */
function prayTrio(p: PrayerSystem) {
  p.toggle('piety');
  p.toggle('rigour');
  p.toggle('augury');
  expect(p.active.size).toBe(3);
}

describe('PrayerSystem — three best prayers, base drain', () => {
  it('drains 14.4 pts/s with no wards and no regen', () => {
    const e = makeEngine({ wave: 20, waveActive: true, towers: [ward()], prayerRegen: 0 });
    // one ward present but regen 0 → reduction is only 1·0.08 = 0.08
    const p = new PrayerSystem(e);
    p.points = 99;
    prayTrio(p);
    p.update(1);
    expect(p.points).toBeCloseTo(99 - 14.4 * (1 - 0.08)); // 13.248/s → 85.75
  });

  it('drains a clean 14.4 pts/s with nothing helping', () => {
    const e = makeEngine({ wave: 20, waveActive: true, towers: [], prayerRegen: 0 });
    // No wards; but with no towers there is nothing attacking, so add a plain
    // attacker to make the wave "draining" without contributing reduction.
    (e.towers as unknown[]).push({ type: 'archer', targetId: 'e' });
    const p = new PrayerSystem(e);
    p.points = 99;
    prayTrio(p);
    expect(p.drainReduction()).toBe(0);
    p.update(1);
    expect(p.points).toBeCloseTo(99 - 14.4);
  });
});

describe('PrayerSystem — Prayer Ward drain reduction', () => {
  it('halves the drain with 5 wards AND regen maxed (7.2 pts/s)', () => {
    const e = makeEngine({ wave: 20, waveActive: true, towers: wards(5), prayerRegen: 1.0 });
    const p = new PrayerSystem(e);
    p.points = 99;
    prayTrio(p);
    expect(p.drainReduction()).toBeCloseTo(0.5); // 5·0.08 + 0.10
    p.update(1);
    expect(p.points).toBeCloseTo(99 - 7.2);
  });

  it('reduces less without maxed regen — 5 wards alone give -40%', () => {
    const e = makeEngine({ wave: 20, waveActive: true, towers: wards(5), prayerRegen: 0 });
    const p = new PrayerSystem(e);
    p.points = 99;
    prayTrio(p);
    expect(p.drainReduction()).toBeCloseTo(0.4);
    p.update(1);
    expect(p.points).toBeCloseTo(99 - 14.4 * 0.6); // 8.64/s → 90.36
  });

  it('never cuts below half — extra wards past 5 are capped', () => {
    const e = makeEngine({ wave: 20, waveActive: true, towers: wards(10), prayerRegen: 1.0 });
    const p = new PrayerSystem(e);
    p.points = 99;
    prayTrio(p);
    expect(p.drainReduction()).toBe(0.5); // capped, not 0.9
    p.update(1);
    expect(p.points).toBeCloseTo(99 - 7.2); // still half, never zero
  });
});
