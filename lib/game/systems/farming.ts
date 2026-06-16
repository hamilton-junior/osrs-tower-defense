export type CompostType = 'compost' | 'supercompost' | 'ultracompost';

/** Per-stage chance a growing patch becomes diseased, reduced by compost tier. */
export function diseaseChance(compost?: CompostType): number {
  switch (compost) {
    case 'compost': return 0.08;
    case 'supercompost': return 0.03;
    case 'ultracompost': return 0.01;
    default: return 0.15;
  }
}

/** Crops yielded on harvest: 3 + 1 per 10 Farming levels, plus a compost bonus. */
export function baseFarmYield(farmingLevel: number, compost?: CompostType): number {
  let yieldAmount = 3 + Math.floor(farmingLevel / 10);
  if (compost === 'compost') yieldAmount += 1;
  else if (compost === 'supercompost') yieldAmount += 3;
  else if (compost === 'ultracompost') yieldAmount += 5;
  return yieldAmount;
}
