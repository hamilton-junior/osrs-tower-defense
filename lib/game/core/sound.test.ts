import { describe, it, expect } from 'vitest';
import { soundCategory, isDeathSound } from './sound';

describe('soundCategory', () => {
  it('classifies firing, casting, impacts and deaths as combat', () => {
    for (const k of ['fire_archer', 'fire_tzhaar', 'cast_fire_3', 'cast_ice_4', 'hit_water_2', 'hit', 'death', 'death_goblin', 'base_hit']) {
      expect(soundCategory(k)).toBe('combat');
    }
  });
  it('classifies interface/meta sounds as ui', () => {
    for (const k of ['click', 'select', 'interface_open', 'interface_close', 'wave', 'sell', 'fireworks', 'game_over', 'prayer_on', 'prayer_on_piety', 'ge_offer']) {
      expect(soundCategory(k)).toBe('ui');
    }
  });
});

describe('isDeathSound', () => {
  // The wave-clear fade must not silence the kill that cleared the wave — a boss
  // dies as the last enemy, so its cry starts in the very frame combat is faded.
  it('matches the generic and per-type kill cries', () => {
    for (const k of ['death', 'death_goblin', 'death_zulrah', 'death_yt_hurkot']) {
      expect(isDeathSound(k)).toBe(true);
    }
  });
  it('does not match shots or impacts', () => {
    for (const k of ['fire_archer', 'cast_fire_3', 'hit_water_2', 'hit', 'base_hit', 'game_over']) {
      expect(isDeathSound(k)).toBe(false);
    }
  });
});
