export interface ScalableEnemyStats {
  hp: number;
  speed: number;
  reward: number;
}

/** HP multiplier applied to an enemy's base HP for a given wave. */
export function hpScaleForWave(wave: number): number {
  // Gentler ramp for the first ten waves, steeper afterwards.
  return wave <= 10 ? 1 + (wave - 1) * 0.15 : 2.35 + (wave - 10) * 0.4;
}

/**
 * Scale a base enemy's hp/speed/reward to a given wave. Pure: returns new
 * values, floored exactly as the engine does.
 */
export function scaleEnemyStats(
  base: ScalableEnemyStats,
  wave: number,
): ScalableEnemyStats {
  return {
    hp: Math.floor(base.hp * hpScaleForWave(wave)),
    speed: Math.floor(base.speed * (1 + (wave - 1) * 0.01)),
    reward: Math.floor(base.reward * (1 + (wave - 1) * 0.15)),
  };
}
