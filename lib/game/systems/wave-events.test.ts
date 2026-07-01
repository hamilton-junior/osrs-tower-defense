import { describe, it, expect } from 'vitest';
import {
  WAVE_EVENTS,
  EVENT_UNLOCK_WAVE,
  EVENT_CHANCE_BASE,
  EVENT_CHANCE_CAP,
  eventChanceForWave,
  rollWaveEvent,
  resolveEventMods,
} from './wave-events';

describe('WAVE_EVENTS pool', () => {
  it('has well-formed, uniquely-identified events', () => {
    expect(WAVE_EVENTS.length).toBeGreaterThan(0);
    const ids = new Set<string>();
    for (const e of WAVE_EVENTS) {
      expect(e.id, e.id).not.toBe('');
      expect(ids.has(e.id), `duplicate id ${e.id}`).toBe(false);
      ids.add(e.id);
      expect(e.name).not.toBe('');
      expect(e.desc).not.toBe('');
      expect(e.color).toMatch(/^#/);
      expect(e.icon).toMatch(/^https?:\/\//);
      expect(e.weight).toBeGreaterThan(0);
      expect(['hazard', 'boon']).toContain(e.tone);
      // effect has at least one modifier, and every present one is a positive mult
      const vals = Object.values(e.effect);
      expect(vals.length).toBeGreaterThan(0);
      for (const v of vals) expect(v).toBeGreaterThan(0);
    }
  });

  it('offers both hazards and boons', () => {
    expect(WAVE_EVENTS.some(e => e.tone === 'hazard')).toBe(true);
    expect(WAVE_EVENTS.some(e => e.tone === 'boon')).toBe(true);
  });

  it("only boons or the risk/reward event pay bonus gold; no hazard is a free win", () => {
    for (const e of WAVE_EVENTS) {
      if ((e.effect.goldMult ?? 1) > 1) {
        // a gold-boosting event must also make the wave harder (or be a boon)
        const harder = (e.effect.enemyHpMult ?? 1) > 1 || (e.effect.enemySpeedMult ?? 1) > 1
          || (e.effect.enemyCountMult ?? 1) > 1;
        expect(e.tone === 'boon' || harder, `${e.id} gives free gold`).toBe(true);
      }
    }
  });
});

describe('eventChanceForWave', () => {
  it('is zero before the unlock wave', () => {
    expect(eventChanceForWave(EVENT_UNLOCK_WAVE - 1)).toBe(0);
    expect(eventChanceForWave(1)).toBe(0);
  });

  it('starts at the base on the unlock wave and ramps up, capped', () => {
    expect(eventChanceForWave(EVENT_UNLOCK_WAVE)).toBeCloseTo(EVENT_CHANCE_BASE);
    expect(eventChanceForWave(EVENT_UNLOCK_WAVE + 5)).toBeGreaterThan(EVENT_CHANCE_BASE);
    expect(eventChanceForWave(1000)).toBe(EVENT_CHANCE_CAP);
  });
});

describe('rollWaveEvent', () => {
  it('never rolls on a boss wave', () => {
    // rng returning 0 would otherwise force an event
    expect(rollWaveEvent(50, true, () => 0)).toBeNull();
  });

  it('never rolls before the unlock wave', () => {
    expect(rollWaveEvent(EVENT_UNLOCK_WAVE - 1, false, () => 0)).toBeNull();
  });

  it('returns null when the chance roll fails', () => {
    // first rng() >= chance → no event
    expect(rollWaveEvent(EVENT_UNLOCK_WAVE, false, () => 0.999)).toBeNull();
  });

  it('returns a pool event when the chance roll passes', () => {
    // rng: first call (chance gate) low → pass; second call (weighted pick) → 0 → first event
    const seq = [0, 0];
    let i = 0;
    const ev = rollWaveEvent(20, false, () => seq[i++] ?? 0);
    expect(ev).not.toBeNull();
    expect(WAVE_EVENTS).toContain(ev!);
  });

  it('the weighted pick can reach the last event', () => {
    const seq = [0, 0.999999];
    let i = 0;
    const ev = rollWaveEvent(20, false, () => seq[i++] ?? 0.999999);
    expect(ev).toBe(WAVE_EVENTS[WAVE_EVENTS.length - 1]);
  });
});

describe('resolveEventMods', () => {
  it('defaults everything to 1 for no event', () => {
    expect(resolveEventMods(null)).toEqual({
      towerDamage: 1, towerRange: 1, towerFireRate: 1,
      enemyHp: 1, enemySpeed: 1, enemyCount: 1, gold: 1,
    });
  });

  it('reads an event effect into the matching fields, defaulting the rest', () => {
    const infestation = WAVE_EVENTS.find(e => e.id === 'infestation')!;
    const m = resolveEventMods(infestation);
    expect(m.enemyCount).toBeCloseTo(infestation.effect.enemyCountMult!);
    expect(m.enemyHp).toBeCloseTo(infestation.effect.enemyHpMult!);
    expect(m.towerDamage).toBe(1);
    expect(m.gold).toBe(1);
  });
});
