'use client';

import React from 'react';
import { ASSETS, GEAR_ICONS } from '@/lib/game/assets';
import type { Item, AmmoClass } from '@/lib/game/types';
import { hideBrokenImg, Stat } from './ui-kit';

/**
 * How a piece of Classic gear reads in the interface: its stat table, the hover
 * card, and the before/after a swap would produce.
 *
 * One table (`GEAR_STAT_DEFS`) feeds all three, so the hover card, the loot bag's
 * stat block and the swap comparison can never drift apart or order the lines
 * differently. Moved out of GameRoot.tsx verbatim.
 */

/**
 * The stat lines a gear piece can carry, in a fixed order with the icon each one
 * is read by. One table so the hover card, the loot bag's always-on stat block
 * and the swap comparison can never drift apart or list them in a different
 * order. `unit` is what follows the number.
 */
export const GEAR_STAT_DEFS: { key: 'damage' | 'damagePct' | 'range' | 'cooldown' | 'xpBonus'; icon: string; label: string; unit: string }[] = [
  { key: 'damage', icon: ASSETS.misc.strength_icon, label: 'Damage', unit: '' },
  { key: 'damagePct', icon: ASSETS.misc.hit_splat, label: 'Damage boost', unit: '%' },
  { key: 'range', icon: ASSETS.misc.multicombat_icon, label: 'Range', unit: '%' },
  { key: 'cooldown', icon: ASSETS.misc.attack_icon, label: 'Attack speed', unit: '%' },
  { key: 'xpBonus', icon: ASSETS.misc.xp_icon, label: 'XP gain', unit: '%' },
];
/** `Kit`/`Ammo`/`Runes`/`Jewellery` — which slot a piece goes in, as the UI says it. */
export function gearSlotLabel(item: Item): string {
  return item.type === 'ammo'
    ? (item.ammoClass ? AMMO_CLASS_LABEL[item.ammoClass] : 'Ammo')
    : 'Jewellery';
}

/** Icon + name + slot·rarity — the header every gear surface leads with. */
export function GearHeader({ item, note }: { item: Item; note?: string }) {
  const signature = item.rarity === 'signature';
  return (
    <div className="flex items-center gap-[0.45em]">
      <img src={GEAR_ICONS[item.id]} alt="" className="w-[1.9em] h-[1.9em] object-contain shrink-0" onError={hideBrokenImg} />
      <span className="flex flex-col leading-tight min-w-0">
        <span className={`truncate ${signature ? 'text-osrs-yellow' : 'text-white'}`}>{item.name}</span>
        <span className="text-[0.66em] uppercase tracking-wide text-[#9d8f6a] truncate">
          {note ?? `${gearSlotLabel(item)}${signature ? ' · Signature' : ''}`}
        </span>
      </span>
    </div>
  );
}

/** A piece's own stats: one `Stat` row per bonus it carries, then its level gate
 *  (the same Level icon the tower panel uses). */
export function GearStats({ item }: { item: Item }) {
  const rows = GEAR_STAT_DEFS.filter((d) => item.bonus[d.key]);
  return (
    <div className="space-y-[0.15em] text-[0.8em]">
      {rows.length === 0 ? (
        <div className="text-[#8a7c5c]">No stat bonus</div>
      ) : (
        rows.map((d) => (
          <Stat key={d.key} icon={d.icon} label={d.label} value={`+${item.bonus[d.key]}${d.unit}`} />
        ))
      )}
      <Stat icon={ASSETS.misc.stats_icon} label="Requires" value={`Lvl ${item.levelReq ?? 1}`} />
    </div>
  );
}

/**
 * What a swap actually costs or buys: every stat either piece carries, as
 * `worn → incoming` with the difference. A drop that looks like an upgrade
 * because it is shinier can easily be a downgrade on the stat that matters, so
 * the delta is the point — green for better, red for worse.
 */
export function GearCompare({ from, to }: { from: Item; to: Item }) {
  const rows = GEAR_STAT_DEFS.filter((d) => from.bonus[d.key] || to.bonus[d.key]);
  return (
    <div className="space-y-[0.15em] text-[0.8em]">
      {rows.map((d) => {
        const a = from.bonus[d.key] ?? 0;
        const b = to.bonus[d.key] ?? 0;
        const diff = b - a;
        return (
          <Stat
            key={d.key}
            icon={d.icon}
            label={d.label}
            value={
              <span className="flex items-center gap-[0.35em]">
                <span className="text-[#9d8f6a]">{a}{d.unit}</span>
                <span className="text-[#6f6449]">→</span>
                <span>{b}{d.unit}</span>
                {diff !== 0 && (
                  <span className={diff > 0 ? 'text-osrs-green' : 'text-osrs-red'}>
                    ({diff > 0 ? '+' : ''}{diff}{d.unit})
                  </span>
                )}
              </span>
            }
          />
        );
      })}
      <Stat icon={ASSETS.misc.stats_icon} label="Requires" value={`Lvl ${to.levelReq ?? 1}`} />
    </div>
  );
}

/**
 * Classic gear: the hover card for a piece, shown from the equipment slots, the
 * equip picker, the tower picker and the loot bag. Reads like the tower panel —
 * an icon + name header, then one stat row each (icon, what it is, how much) —
 * so a bow's stats and an arrow's stats are read the same way. Signature pieces
 * (a boss-drop `gearEffect`) lead with what the effect does.
 */
export function gearTooltip(item: Item): React.ReactNode {
  return (
    <div className="flex flex-col gap-[0.4em]">
      <GearHeader item={item} />
      {item.rarity === 'signature' && item.description && (
        <p className="text-[0.74em] text-[#c9b78c] leading-snug">{item.description}</p>
      )}
      <GearStats item={item} />
    </div>
  );
}

/** Slot-1 label per the tower's ammo class — arrows/darts/cannonballs feed off
 *  "Ammo", casters read "Runes", melee towers read "Kit" (mirrors the OSRS
 *  ammo-slot naming per combat style). Slot-2 (jewellery) is always "Jewellery". */
export const AMMO_CLASS_LABEL: Record<AmmoClass, string> = {
  arrows: 'Ammo',
  darts: 'Ammo',
  cannonballs: 'Ammo',
  runes: 'Runes',
  melee_kit: 'Kit',
};
