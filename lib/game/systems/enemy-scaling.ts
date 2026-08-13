export interface ScalableEnemyStats {
  hp: number;
  speed: number;
  reward: number;
}

/** The wave at which {@link progressionHpMult} reaches {@link PROGRESSION_ANCHOR_MULT}. */
export const PROGRESSION_ANCHOR_WAVE = 70;
/** How much tougher the anchor wave is than the base ramp alone would make it. */
export const PROGRESSION_ANCHOR_MULT = 2;

/**
 * Endless-only HP acceleration. The normal run to victory is untouched — this is
 * exactly 1 up to and including the victory wave — then it climbs *exponentially*
 * in waves-past-victory. Paired with the bounded player-damage ceiling
 * (`softCapMult`), an exponential enemy term overtakes any fixed board with
 * certainty. `ENDLESS_HP_BASE` is a tuning knob (numbers are the user's to tune).
 */
export const ENDLESS_HP_BASE = 1.03;

export function endlessHpMult(wave: number, victoryWave: number): number {
  const past = wave - victoryWave;
  return past <= 0 ? 1 : ENDLESS_HP_BASE ** past;
}

/**
 * The base per-wave HP ramp: gentle for the first ten waves, steeper afterwards.
 * On its own this is what the game shipped with — {@link progressionHpMult} is
 * layered on top of it.
 */
function baseHpScale(wave: number): number {
  return wave <= 10 ? 1 + (wave - 1) * 0.15 : 2.35 + (wave - 10) * 0.4;
}

/**
 * The progression buff: a multiplier that itself climbs linearly with the wave —
 * 1x on wave 1 (nothing changes at the start) up to {@link PROGRESSION_ANCHOR_MULT}
 * on wave {@link PROGRESSION_ANCHOR_WAVE}, and onwards without a ceiling.
 *
 * The base ramp is linear, so a board that out-scales it once out-scales it forever
 * — which is exactly what players reported (runs coasting to wave 100, 200, 1400).
 * Making the *buff* linear makes the HP curve itself quadratic, so the difficulty
 * keeps climbing away from a fixed board instead of settling into a straight line
 * that towers eventually overtake.
 */
export function progressionHpMult(wave: number): number {
  const perWave = (PROGRESSION_ANCHOR_MULT - 1) / (PROGRESSION_ANCHOR_WAVE - 1);
  return 1 + Math.max(0, wave - 1) * perWave;
}

/** HP multiplier applied to an enemy's base HP for a given wave. */
export function hpScaleForWave(wave: number): number {
  return baseHpScale(wave) * progressionHpMult(wave);
}

/**
 * Scale a base enemy's hp/speed/reward to a given wave. Pure: returns new
 * values, floored exactly as the engine does.
 */
export function scaleEnemyStats(
  base: ScalableEnemyStats,
  wave: number,
  endlessMult = 1,
  diff: { hp: number; speed: number; reward: number } = { hp: 1, speed: 1, reward: 1 },
): ScalableEnemyStats {
  return {
    hp: Math.floor(base.hp * hpScaleForWave(wave) * endlessMult * diff.hp),
    speed: Math.floor(base.speed * (1 + (wave - 1) * 0.01) * diff.speed),
    reward: Math.floor(base.reward * (1 + (wave - 1) * 0.15) * diff.reward),
  };
}
