/**
 * Per-tower "personality" maths — the signature mechanic that gives each
 * non-wizard tower a niche the wizard can't fill. Pure and unit-tested so the
 * engine just calls in. The design goal (see the niche table in the engine's
 * firing block): every tower must beat the wizard at *something*, because the
 * Elemental spellbook already owns single-target burst and Ancients owns AoE.
 *
 *  - Archer  → volume DPS: fast cadence + a Dark Bow twin-shot (light cleave),
 *              with only a modest anti-tank nudge so it doesn't become the
 *              boss-killer (that's the Slayer / Toxic niche).
 *  - Cannon  → full-damage splash (no Ancients falloff) over a growing radius.
 *  - Slayer  → bonus vs a monster *category* (task / superior / boss).
 *  - Toxic   → venom: a damage-over-time that ramps the longer it's reapplied.
 */

import type { MarkKind } from './targeting';

/**
 * The kind of lingering status a tower lays on hit, for the `unmarked` priority
 * (it spreads *this* effect across the wave). Derived from the tower's identity
 * at fire time — its type, and for a wizard its spellbook mode + element/ancient:
 *  - toxic → venom · tzhaar → stun (pushback & crush both stun)
 *  - elemental wizard: water → vuln, earth → stun, fire → burn, air → none (pure
 *    knockback leaves no timer)
 *  - ancient wizard: ice → slow, shadow → stun, smoke → poison, blood → none
 *  - archer / cannon / slayer / utility → none
 */
export function towerMarkKind(tower: {
  type: string;
  mageMode?: string | null;
  element?: string | null;
  ancientType?: string | null;
}): MarkKind {
  switch (tower.type) {
    case 'toxic': return 'venom';
    case 'tzhaar': return 'stun';
    case 'wizard': {
      const mode = tower.mageMode ?? 'elemental';
      if (mode === 'elemental') {
        switch (tower.element ?? 'air') {
          case 'water': return 'vuln';
          case 'earth': return 'stun';
          case 'fire': return 'burn';
          default: return 'none'; // air: knockback only
        }
      }
      if (mode === 'ancients') {
        switch (tower.ancientType ?? 'ice') {
          case 'ice': return 'slow';
          case 'shadow': return 'stun';
          case 'smoke': return 'poison';
          default: return 'none'; // blood: lifesteal, no mark
        }
      }
      return 'none'; // utility
    }
    default: return 'none'; // archer, cannon, slayer
  }
}

/** Arrows loosed per attack. The Dark Bow (tier 3+) looses two. */
export function archerArrowCount(level: number): number {
  return level >= 3 ? 2 : 1;
}

/**
 * Modest anti-tank scaling for the tier-4 bow (Bow of Faerdhinen / twisted-bow
 * flavour): the wizard's damage is fixed, so the bow gets a *small* edge vs
 * beefy targets. Capped at +20% so it stays a nudge, not the Slayer's job.
 * 0% at ≤40 max HP, ramping linearly to +20% at ≥400 max HP.
 */
export function bowAntiTankMult(maxHp: number): number {
  const t = Math.max(0, Math.min(1, (maxHp - 40) / 360));
  return 1 + 0.2 * t;
}

/**
 * Cannon splash radius by tier (logic px). Grows so the late cannon clearly
 * out-zones the Ancients barrage's fixed 80px blast — the cannon's whole point
 * is raw crowd-clear. 70 → 84 → 98 → 112.
 */
export function cannonBlastRadius(level: number): number {
  return 70 + (level - 1) * 14;
}

/**
 * Slayer weapon's native damage multiplier vs an enemy, keyed off its *category*
 * (independent of the Slayer Helmet, which stacks on top). The best applicable
 * bonus wins (they don't multiply): the current task target, then superiors,
 * then bosses. 1.0 against anything else.
 */
export function slayerWeaponBonus(enemyType: string, taskType: string | null, isBoss: boolean): number {
  let best = 1;
  if (taskType && enemyType === taskType) best = Math.max(best, 1.5);
  if (enemyType.startsWith('superior_')) best = Math.max(best, 1.3);
  if (isBoss) best = Math.max(best, 1.25);
  return best;
}

/**
 * Whether the Slayer tower *specialises* against this enemy — i.e. it's in one of
 * the categories {@link slayerWeaponBonus} rewards (the current task, a superior,
 * or a boss). The Slayer tower prioritises these regardless of the player's set
 * priority, then applies the normal priority *within* the favoured group; with no
 * favoured enemy in range it targets normally. Single source of truth with the
 * damage bonus: favoured ⇔ bonus > 1.
 */
export function isSlayerFavoredTarget(enemyType: string, taskType: string | null, isBoss: boolean): boolean {
  return slayerWeaponBonus(enemyType, taskType, isBoss) > 1;
}

/**
 * The venom cap's wave multiplier. Venom is single-target, so it must always
 * out-damage the Ancient Smoke *poison* (AoE, `dps = wave`) — and, because
 * single-target should out-scale AoE, the margin *grows* with the wave. This
 * saturating curve rises from ~1.15× the wave number early to ~1.7× late:
 *   mult(1) ≈ 1.15,  mult(22) ≈ 1.50,  mult(70) ≈ 1.68.
 * Always > 1, so `ceil(wave * mult) > wave` on every wave — venom beats poison
 * from the first wave and pulls further ahead the longer a run goes.
 */
export function venomWaveMult(wave: number): number {
  return 1.7 - 0.55 * Math.exp(-wave / 22);
}

/**
 * The venom DoT's damage-per-second ceiling. The larger of two floors wins:
 *  - the tower's own hit (`hitDamage * 0.6`), which dominates in the early game
 *    when a toxic hit is bigger than the wave number, and
 *  - the wave-scaled track (`wave * mult(wave)`), which dominates late and keeps
 *    venom strictly above the Smoke poison (see `venomWaveMult`).
 */
export function venomCap(wave: number, hitDamage: number): number {
  return Math.max(Math.floor(hitDamage * 0.6), Math.ceil(wave * venomWaveMult(wave)));
}

/**
 * Venom ramp parameters derived from a single toxic hit's damage. Each reapply
 * adds `step` to the poison's damage-per-second up to `cap`, so sustained fire
 * makes the venom hurt more — the toxic tower's niche is a DoT that *climbs*,
 * unlike the wizard's flat burn/poison. The cap scales with the wave (see
 * `venomCap`) so late-game venom keeps its single-target edge over AoE poison.
 * `dur` keeps it ticking after the enemy leaves range (set-and-forget chip).
 */
export function venomRamp(hitDamage: number, wave: number): { step: number; cap: number; dur: number } {
  const step = Math.max(2, Math.floor(hitDamage * 0.15));
  return { step, cap: Math.max(step, venomCap(wave, hitDamage)), dur: 4 };
}
