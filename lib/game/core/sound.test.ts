import { describe, it, expect } from 'vitest';
import { soundCategory } from './sound';

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
