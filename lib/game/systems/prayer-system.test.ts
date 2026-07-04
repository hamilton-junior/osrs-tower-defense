import { describe, it, expect } from 'vitest';
import { PrayerSystem } from './prayer-system';
import { DEFAULT_UPGRADES } from './meta-progression';
import type { GameEngine } from '../core/engine';

/** Minimal engine stand-in exposing just what PrayerSystem reads. */
function makeEngine(cfg: {
  wave: number;
  waveActive: boolean;
  towers: { type: string; mageMode?: string; supportSpell?: string; targetId: string | null }[];
  prayerEfficiency: number;
  prayerRegen?: number;
}): GameEngine {
  return {
    wave: cfg.wave,
    waveActive: cfg.waveActive,
    towers: cfg.towers,
    meta: { upgrades: { ...DEFAULT_UPGRADES, prayerEfficiency: cfg.prayerEfficiency, prayerRegen: cfg.prayerRegen ?? 0 } },
    playSound() {},
    notify() {},
    requestEmit() {},
  } as unknown as GameEngine;
}

/** A Prayer-Restoration ("Vile Vigour") wizard, flagged as actively casting. */
const battery = () => ({ type: 'wizard', mageMode: 'utility', supportSpell: 'sanctity', targetId: 'e' });

/** Turn on the three strongest prayers (all unlocked by wave 20). */
function prayTrio(p: PrayerSystem) {
  p.toggle('piety');
  p.toggle('rigour');
  p.toggle('augury');
  expect(p.active.size).toBe(3);
}

describe('PrayerSystem — drain of the three best prayers', () => {
  it('drains 14.4 pts/s with no meta upgrade', () => {
    const e = makeEngine({ wave: 20, waveActive: true, towers: [battery()], prayerEfficiency: 1 });
    const p = new PrayerSystem(e);
    p.points = 99;
    prayTrio(p);
    p.update(1);
    expect(p.points).toBeCloseTo(99 - 14.4); // 84.6
  });

  it('drains 7.92 pts/s with the maxed upgrade but too few batteries', () => {
    const towers = [battery(), battery(), battery(), battery()]; // 4 < 5
    const e = makeEngine({ wave: 20, waveActive: true, towers, prayerEfficiency: 0.55 });
    const p = new PrayerSystem(e);
    p.points = 99;
    prayTrio(p);
    expect(p.fullySustained()).toBe(false);
    p.update(1);
    expect(p.points).toBeCloseTo(99 - 7.92); // 91.08
  });
});

describe('PrayerSystem — zero-drain capstone', () => {
  it('never drains at BOTH metas maxed AND 5 batteries', () => {
    const towers = [battery(), battery(), battery(), battery(), battery()]; // 5
    const e = makeEngine({ wave: 20, waveActive: true, towers, prayerEfficiency: 0.55, prayerRegen: 1.0 });
    const p = new PrayerSystem(e);
    p.points = 42;
    prayTrio(p);
    expect(p.fullySustained()).toBe(true);
    p.update(1);
    // No drain at all — and with regen maxed the pool even ticks up (+1.0/s here)
    // instead of falling. The key assertion is simply: it never went down.
    expect(p.points).toBe(43);
  });

  it('needs ALL three — 5 batteries + maxed efficiency but un-maxed regen still drains', () => {
    const towers = [battery(), battery(), battery(), battery(), battery()];
    const e = makeEngine({ wave: 20, waveActive: true, towers, prayerEfficiency: 0.55, prayerRegen: 0.8 }); // regen one step short
    const p = new PrayerSystem(e);
    p.points = 99;
    prayTrio(p);
    expect(p.fullySustained()).toBe(false);
    p.update(1);
    expect(p.points).toBeLessThan(99);
  });

  it('needs ALL three — 5 batteries + maxed regen but un-maxed efficiency still drains', () => {
    const towers = [battery(), battery(), battery(), battery(), battery()];
    const e = makeEngine({ wave: 20, waveActive: true, towers, prayerEfficiency: 0.64, prayerRegen: 1.0 }); // efficiency one step short
    const p = new PrayerSystem(e);
    p.points = 99;
    prayTrio(p);
    expect(p.fullySustained()).toBe(false);
    p.update(1);
    expect(p.points).toBeLessThan(99);
  });
});
