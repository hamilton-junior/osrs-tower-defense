/**
 * How many monster entries the next-wave strip may show before it collapses the
 * rest behind a "+N more".
 *
 * The strip is a floating panel over the board, and it wraps: every extra enemy
 * *type* in a wave adds width, then a whole new row. Late runs mix thirty-odd
 * types, which grew the panel into a wall across the top of the map that ate
 * every click meant for the ground under it — the tower simply would not place
 * (bug #9 / suggestion #18). Twelve entries is two comfortable rows at the
 * strip's `max-w`, so the panel's footprint stops depending on how deep the run
 * has gone.
 */
export const WAVE_PREVIEW_MAX = 12;

/**
 * Trim a wave preview to at most `max` entries, **never hiding a boss** — the
 * one line in the strip a player actually plans around. Bosses are kept first,
 * the remaining slots are filled in the wave's own order, and the result keeps
 * that original order so the strip doesn't reshuffle itself between waves.
 *
 * A wave carrying more bosses than `max` returns all of them: a boss you can't
 * see is worse than a tall panel.
 */
export function capWavePreview<T extends { isBoss?: boolean }>(
  preview: readonly T[],
  max = WAVE_PREVIEW_MAX,
): T[] {
  if (preview.length <= max) return [...preview];
  const keep = new Set<T>();
  for (const m of preview) if (m.isBoss) keep.add(m);
  for (const m of preview) {
    if (keep.size >= max) break;
    keep.add(m);
  }
  return preview.filter((m) => keep.has(m));
}
