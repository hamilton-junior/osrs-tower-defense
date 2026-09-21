'use client';

import React from 'react';
import { ASSETS } from '@/lib/game/assets';
import { SEED_BY_ID } from '@/lib/game/data/farming';
import { POTION_BY_ID, type PotionDef } from '@/lib/game/data/herblore';
import { brewDamageMult, overhealCap } from '@/lib/game/systems/herblore';
import { hideBrokenImg, Price } from './ui-kit';

export interface PotionTipOptions {
  /** The bench's recipe row: herb, base potion and secondary as icons, then the
   *  gold. Held counts come along so a missing herb reads red before the click. */
  recipe?: {
    herbs: number;
    bases: number;
    money: number;
    level: number;
  };
  /** Current lives, for a dose that heals: previews it the way a fish does. */
  vitals?: { lives: number; maxLives: number };
  /** Waves still to run, for a dose already up. Replaces the full duration. */
  wavesLeft?: number;
  /** A grey line under the card, for a wall that lifts by itself (the wave ends). */
  note?: string;
  /** A red line under the card, for the one thing blocking the click right now. */
  warn?: string;
}

const STYLE_ICONS = {
  melee: ASSETS.misc.attack_icon,
  ranged: ASSETS.misc.ranged_icon,
  magic: ASSETS.misc.magic_icon,
} as const;

const ICON = 'w-[1.2em] h-[1.2em] object-contain shrink-0';

/**
 * The potion hover card, one build for every place a potion is hovered: the
 * inventory, the loot bag and the Herblore bench.
 *
 * It reads like the gear card beside it. An icon + name header, the potion's one
 * sentence, then what the dose does as icon + value chips, on the same icons the
 * tower panel reads its stats by: the hit splat for damage, the multicombat cross
 * for range, the Attack icon for attack speed. The header's second line is who the
 * dose reaches, as the combat-style icons, so the chips never have to repeat it.
 *
 * Green is what the dose gives, red what it takes. A Saradomin brew or a Zamorak
 * brew is a bargain, and the card shows both halves of it at once.
 */
export function potionTooltip(def: PotionDef, opts: PotionTipOptions = {}): React.ReactNode {
  return (
    <div className="flex flex-col gap-[0.4em]">
      <PotionHeader def={def} wavesLeft={opts.wavesLeft} />
      {opts.recipe && <RecipeChips def={def} {...opts.recipe} />}
      <span className="text-[0.74em] text-[#c9b78c] leading-snug">{def.tip}</span>
      <PotionChips def={def} vitals={opts.vitals} />
      {opts.note && <span className="text-[0.8em] text-[#8a7c5c]">{opts.note}</span>}
      {opts.warn && <span className="text-[0.8em] text-osrs-red">{opts.warn}</span>}
    </div>
  );
}

function PotionHeader({ def, wavesLeft }: { def: PotionDef; wavesLeft?: number }) {
  const b = def.boost;
  const styles = b && (b.damage || b.range || b.fireRate)
    ? (b.style ? [b.style] : (['melee', 'ranged', 'magic'] as const))
    : [];
  const waves = wavesLeft ?? def.waves;
  return (
    <div className="flex items-center gap-[0.45em]">
      <img src={def.icon} alt="" className="w-[1.9em] h-[1.9em] object-contain shrink-0" onError={hideBrokenImg} />
      <span className="flex flex-col leading-tight min-w-0">
        <span className="truncate text-white">{def.name}</span>
        <span className="flex items-center gap-[0.35em] text-[0.66em] uppercase tracking-wide text-[#9d8f6a] whitespace-nowrap">
          {styles.length > 0 && (
            <span className="flex items-center gap-[0.15em]">
              {styles.map((s) => (
                <img key={s} src={STYLE_ICONS[s]} alt={s} title={`${s} towers`} className="w-[1.35em] h-[1.35em] object-contain" onError={hideBrokenImg} />
              ))}
            </span>
          )}
          {waves > 0
            ? `${waves} wave${waves === 1 ? '' : 's'}${wavesLeft != null ? ' left' : ''}`
            : 'Instant'}
        </span>
      </span>
    </div>
  );
}

/** What the bench asks for one: every input as its own icon **and name**, then the
 *  gold, then the level while it is still out of reach. The name is spelled out
 *  because this card is the only place the recipe is readable — the tile itself has
 *  room for the icon and a count, and a herb sprite alone is not a word. */
function RecipeChips({ def, herbs, bases, money, level }: { def: PotionDef } & NonNullable<PotionTipOptions['recipe']>) {
  const herb = def.herb ? SEED_BY_ID[def.herb] : null;
  const base = def.potionInput ? POTION_BY_ID[def.potionInput] : null;
  const inputs = [
    herb && { key: 'herb', icon: herb.herbIcon, name: herb.herbName, held: herbs },
    base && { key: 'base', icon: base.icon, name: base.name, held: bases },
    def.secondary && { key: 'secondary', icon: def.secondary.icon, name: def.secondary.name, held: null },
  ].filter((i): i is { key: string; icon: string; name: string; held: number | null } => !!i);
  return (
    <div className="flex flex-wrap items-center gap-x-[0.6em] gap-y-[0.2em] text-[0.8em] whitespace-nowrap">
      {inputs.map((i, n) => (
        <React.Fragment key={i.key}>
          {n > 0 && <span className="text-[#9d8f6a]">+</span>}
          <span className="flex items-center gap-[0.25em]" title={i.name}>
            <img src={i.icon} alt={i.name} className={ICON} onError={hideBrokenImg} />
            <span className="text-[#cdbe91]">{i.name}</span>
            {i.held != null && (
              <span className={`tabular-nums ${i.held > 0 ? 'text-osrs-yellow' : 'text-osrs-red'}`}>{i.held}</span>
            )}
          </span>
        </React.Fragment>
      ))}
      <Price amount={def.cost} afford={money >= def.cost} />
      {level < def.level && (
        <span className="flex items-center gap-[0.3em] text-osrs-red">
          <img src={ASSETS.misc.skill_herblore} alt="Requires" className={ICON} onError={hideBrokenImg} />
          Lvl {def.level}
        </span>
      )}
    </div>
  );
}

const pctOf = (frac: number) => Math.round(frac * 100);

/** Every effect the dose carries, as an icon and a value. */
export function PotionChips({ def, vitals }: { def: PotionDef; vitals?: PotionTipOptions['vitals'] }) {
  const chips: { key: string; icon: string; label: string; value: React.ReactNode; tone: 'good' | 'bad' }[] = [];
  const b = def.boost;
  if (b?.damage) chips.push({ key: 'damage', icon: ASSETS.misc.hit_splat, label: 'Damage', value: `+${pctOf(b.damage)}%`, tone: 'good' });
  if (b?.range) chips.push({ key: 'range', icon: ASSETS.misc.multicombat_icon, label: 'Range', value: `+${pctOf(b.range)}%`, tone: 'good' });
  if (b?.fireRate) chips.push({ key: 'speed', icon: ASSETS.misc.attack_icon, label: 'Attack speed', value: `+${pctOf(b.fireRate)}%`, tone: 'good' });
  if (def.steady) chips.push({ key: 'steady', icon: ASSETS.misc.blocked, label: 'Towers cannot be knocked offline', value: 'Immune', tone: 'good' });
  if (def.prayerDrain) chips.push({ key: 'prayer', icon: ASSETS.misc.prayer_icon, label: 'Prayer drain', value: `−${pctOf(def.prayerDrain)}%`, tone: 'good' });
  if (def.lives) chips.push({ key: 'lives', icon: ASSETS.misc.orb_hitpoints, label: 'Lives', value: <HealValue heal={def.lives} overheals={!!def.overheals} vitals={vitals} />, tone: 'good' });
  if (def.livesOnClear) chips.push({ key: 'regen', icon: ASSETS.misc.orb_hitpoints, label: 'Lives on every wave cleared', value: `+${def.livesOnClear}/wave`, tone: 'good' });
  if (def.clearsBrew) chips.push({ key: 'clear', icon: POTION_BY_ID.brew.icon, label: 'Brews cleared', value: def.clearsBrew === 'all' ? 'Clears all' : `Clears ${def.clearsBrew}`, tone: 'good' });
  if (def.lifeCost) chips.push({ key: 'cost', icon: ASSETS.misc.orb_hitpoints, label: 'Lives to drink it', value: `−${def.lifeCost}`, tone: 'bad' });
  if (def.livesPerWave) chips.push({ key: 'drain', icon: ASSETS.misc.orb_hitpoints, label: 'Lives at the end of every wave', value: `−${def.livesPerWave}/wave`, tone: 'bad' });
  if (def.brewStacks) chips.push({ key: 'debt', icon: ASSETS.misc.hit_splat, label: 'Damage, until a restore clears it', value: `−${pctOf(1 - brewDamageMult(def.brewStacks))}%`, tone: 'bad' });
  if (chips.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-[0.8em] gap-y-[0.2em] text-[0.8em] whitespace-nowrap">
      {chips.map((c) => (
        <span key={c.key} className="flex items-center gap-[0.3em]" title={c.label}>
          <img src={c.icon} alt={c.label} className={ICON} onError={hideBrokenImg} />
          <span className={c.tone === 'good' ? 'text-osrs-green' : 'text-osrs-red'}>{c.value}</span>
        </span>
      ))}
    </div>
  );
}

/** A dose's heal, previewed like a fish: the heal itself always green, and where it
 *  leaves the orb after it, red when the dose would heal nothing. */
function HealValue({ heal, overheals, vitals }: { heal: number; overheals: boolean; vitals?: PotionTipOptions['vitals'] }) {
  if (!vitals) return <>+{heal}</>;
  const cap = overheals ? overhealCap(vitals.maxLives) : vitals.maxLives;
  const gain = Math.max(0, Math.min(heal, cap - vitals.lives));
  const tone = gain === 0 ? 'text-osrs-red' : gain < heal ? 'text-osrs-yellow' : 'text-osrs-green';
  return (
    <>
      +{heal} <span className={tone}>({vitals.lives + gain}/{cap})</span>
    </>
  );
}
