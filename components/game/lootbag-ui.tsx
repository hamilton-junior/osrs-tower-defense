'use client';

import React, { useEffect, useState } from 'react';
import { ASSETS, GEAR_ICONS } from '@/lib/game/assets';
import type { UiStack } from '@/lib/game/core/engine';
import type { StackKind } from '@/lib/game/systems/inventory';
import type { Item, Tower } from '@/lib/game/types';
import { canEquip, isUpgradeFor, isUpgradeForAny } from '@/lib/game/systems/tower-gear';
import { GearCompare, GearHeader, GearStats, gearTooltip } from './gear-ui';
import { HoverTip } from './HoverTip';
import { towerIcon, towerListName, wizardStaffUrl } from './tower-ui';
import { hideBrokenImg, InvGrid, ItemSlot, loadBool } from './ui-kit';

/**
 * The **loot bag** — everything the run picked up and is not carrying: the gear
 * that dropped, and whatever overflowed the twenty-eight slots.
 *
 * The bag itself is the backpack again: the client's own panel between its two
 * posts, four squares to a row ({@link InvGrid}). A real looting bag holds
 * twenty-eight, so that is the height one panel draws — but this one is unbounded,
 * so a longer haul scrolls inside that panel instead of paging. The sprite behind
 * the squares stays put while they move, and keeps its own proportions.
 *
 * It stacks where the inventory does not. Two of the same gear piece are one square
 * with a 2 on it, and every herb or potion pushed out here piles into one square,
 * so a deep run reads as what it found rather than as a wall of repeats.
 *
 * A tower's own slot asks "which piece?"; a piece here asks "which tower?" — the
 * same picker read from the other end, so neither question makes the player walk to
 * the other panel. A herb or a potion has no such question: clicking one pulls a
 * single item back into a free slot. The page lives inside the inventory interface
 * (classic only: the roguelite drops no gear), because a bag is a bag.
 */

/** What a looting bag holds in OSRS, and so how tall one panel of it draws. */
const BAG_SLOTS = 28;
const COLUMNS = 4;

/** One square: a pile of the same gear piece, in the order the first one dropped. */
interface GearPile {
  item: Item;
  count: number;
}

/** Fold repeats together. Equipping takes an id, not a position, so the pile only
 *  ever needs one of them — and one square with a 3 on it says more than three
 *  identical squares do. */
function pileGear(items: Item[]): GearPile[] {
  const out: GearPile[] = [];
  const at = new Map<string, GearPile>();
  for (const item of items) {
    const held = at.get(item.id);
    if (held) { held.count += 1; continue; }
    const pile = { item, count: 1 };
    at.set(item.id, pile);
    out.push(pile);
  }
  return out;
}

export interface LootBagViewProps {
  bag: Item[];
  /** The herbs and potions that overflowed the inventory, or were pushed out here. */
  stacks: UiStack[];
  /** No free slot, so nothing can come back out right now. */
  invFull: boolean;
  /** Read live off the engine rather than `UIState` — the picker equips real towers. */
  towers: Tower[];
  /** Which tower row the pointer is on, so the board can ring that tower. */
  hoverTowerId: string | null;
  onHoverTower: (t: Tower | null) => void;
  onEquip: (towerId: string, gearId: string) => void;
  onTake: (kind: StackKind, id: string) => void;
}

export function LootBagView({
  bag, stacks, invFull, towers: towersOnBoard, hoverTowerId, onHoverTower, onEquip, onTake,
}: LootBagViewProps) {
  const [pick, setPick] = useState<string | null>(null);
  // Both filters default on: a deep run's bag fills with pieces nothing wants, and
  // every tower is listed for every piece. The useful answer is the short list —
  // the long one stays a click away.
  const [hideJunk, setHideJunk] = useState(() => loadBool('ui_bag_hide_junk', true));
  const [hideDowngrades, setHideDowngrades] = useState(() => loadBool('ui_bag_hide_downgrades', true));
  useEffect(() => { try { localStorage.setItem('ui_bag_hide_junk', JSON.stringify(hideJunk)); } catch { /* ignore */ } }, [hideJunk]);
  useEffect(() => { try { localStorage.setItem('ui_bag_hide_downgrades', JSON.stringify(hideDowngrades)); } catch { /* ignore */ } }, [hideDowngrades]);
  // Equipping the picked piece takes it out of the bag. The picker is keyed by the
  // piece's id rather than its position, so the rest re-ordering underneath cannot
  // point it at something else — but a piece that is gone still closes it.
  useEffect(() => { setPick((cur) => (cur && bag.some((g) => g.id === cur) ? cur : null)); }, [bag]);
  // Leaving this page must not leave a tower ringed on the board — the pointer
  // never gets a chance to leave the row it was on.
  useEffect(() => () => onHoverTower(null), [onHoverTower]);

  if (bag.length === 0 && stacks.length === 0) {
    return (
      <div className="mt-[0.6em] px-[0.2em] text-[0.75em] text-[#8f8158] leading-relaxed">
        Empty. Monsters drop gear as they die, and bosses drop the signature
        jewellery. Whatever will not fit in the inventory waits here too.
      </div>
    );
  }

  const allPiles = pileGear(bag);
  const piles = allPiles.filter(({ item }) => !hideJunk || isUpgradeForAny(towersOnBoard, item));
  const hiddenCount = allPiles.length - piles.length;
  const filled = piles.length + stacks.length;
  // Keep the panel a full backpack tall, and every row full, so the scrolling grid
  // stays the shape the client draws rather than a ragged half-page.
  const padding = Math.max(BAG_SLOTS, Math.ceil(filled / COLUMNS) * COLUMNS) - filled;
  const picked = pick ? bag.find((g) => g.id === pick) : undefined;

  return (
    <>
      <label
        className="rs-inv-col flex flex-wrap items-center gap-[0.4em] mt-[0.5em] px-[0.2em] text-[0.72em] text-[#d3c3a0] cursor-pointer select-none"
        title="Hide pieces that would not improve any tower on the board: nothing can wear them, or what those towers already wear is better"
      >
        <input
          type="checkbox"
          className="rs-check"
          checked={hideJunk}
          onChange={(e) => setHideJunk(e.target.checked)}
        />
        Hide non-upgrades
        {hiddenCount > 0 && <span className="text-[#8a7c5c]">({hiddenCount} hidden)</span>}
      </label>

      {filled === 0 ? (
        <div className="rs-inv-col mt-[0.5em] px-[0.2em] text-[0.72em] text-[#8f8158] leading-snug">
          Nothing here would improve a tower on the board: wrong style, too
          high a level, or beaten by what is already worn. Untick to see it all.
        </div>
      ) : (
        <InvGrid
          background={ASSETS.misc.inventory_background}
          postLeft={ASSETS.misc.inv_post_left}
          postRight={ASSETS.misc.inv_post_right}
          className="rs-inv-page rs-inv-scroll"
        >
          {piles.map(({ item, count }) => (
            <HoverTip key={item.id} content={gearTooltip(item)}>
              <ItemSlot
                osrs
                icon={GEAR_ICONS[item.id]}
                name={item.name}
                count={count > 1 ? count : undefined}
                title={`Equip ${item.name}`}
                selected={pick === item.id}
                signature={item.rarity === 'signature'}
                onClick={() => setPick((cur) => (cur === item.id ? null : item.id))}
              />
            </HoverTip>
          ))}
          {/* A herb or a potion has one thing to ask, so it is a click and not a
              picker: one comes back, into the first free square. */}
          {stacks.map((s) => (
            <ItemSlot
              key={`${s.kind}:${s.id}`}
              osrs
              icon={s.icon}
              name={s.name}
              count={s.count}
              dim={invFull}
              title={invFull ? 'Inventory full' : `Take one ${s.name}`}
              onClick={() => onTake(s.kind, s.id)}
            />
          ))}
          {Array.from({ length: padding }, (_, j) => <ItemSlot key={`e${j}`} osrs />)}
        </InvGrid>
      )}

      {/* Which tower takes this piece. A tower whose level is too low is listed but
          disabled, and one whose slot is full says what it would replace (equipping
          swaps — the old piece falls back into this bag). Hovering a row rings that
          tower on the board. Inline rather than a floating dropdown: this panel
          scrolls, and `overflow-y-auto` would clip one. */}
      {picked && (() => {
        const g = picked;
        const slot: 'ammo' | 'jewellery' = g.type === 'ammo' ? 'ammo' : 'jewellery';
        const all = towersOnBoard
          .map((t) => ({ t, check: canEquip(t, g), upgrade: isUpgradeFor(t, g) }))
          .filter(({ check }) => check.ok || check.reason === 'level');
        // Best first: a free slot, then a real gain, then the ones listed only so
        // you can see why they are not worth it.
        const ordered = [...all].sort((a, b) => {
          const rank = (x: typeof a) => (x.upgrade ? (x.t.equipment[slot] ? 1 : 0) : 2);
          return rank(a) - rank(b) || towerListName(a.t).localeCompare(towerListName(b.t));
        });
        const towers = hideDowngrades ? ordered.filter((x) => x.upgrade) : ordered;
        const buried = ordered.length - towers.length;
        const hovered = towers.find(({ t }) => t.id === hoverTowerId)?.t;
        const worn = hovered?.equipment[slot];
        return (
          <div className="rs-inv-col mt-[0.5em] rs-panel-inset p-[0.5em]">
            {/* The picked piece's stats stay on screen for as long as the picker is
                open — the decision is "is this worth a slot?", and you cannot answer
                it from a tooltip you have to keep summoning. Hovering a tower that
                already wears something turns the same block into that swap's
                before/after. */}
            <GearHeader item={g} note={worn ? `Replacing ${worn.name}` : undefined} />
            {g.rarity === 'signature' && g.description && (
              <p className="mt-[0.3em] text-[0.72em] text-[#c9b78c] leading-snug">{g.description}</p>
            )}
            <div className="mt-[0.35em]">
              {worn ? <GearCompare from={worn} to={g} /> : <GearStats item={g} />}
            </div>
            <div className="flex items-center justify-between gap-2 mt-[0.45em] pt-[0.35em] border-t border-[var(--rs-keyline)]">
              <span className="text-[0.68em] uppercase tracking-wide text-[#9d8f6a]">Equip on</span>
              <label
                className="flex items-center gap-[0.35em] text-[0.7em] text-[#d3c3a0] cursor-pointer select-none"
                title="Hide towers this piece would not improve: a full slot with something better in it, or a level you have not reached"
              >
                <input
                  type="checkbox"
                  className="rs-check"
                  checked={hideDowngrades}
                  onChange={(e) => setHideDowngrades(e.target.checked)}
                />
                Hide downgrades
                {buried > 0 && <span className="text-[#8a7c5c]">({buried})</span>}
              </label>
            </div>
            {towers.length === 0 ? (
              <div className="text-[0.7em] text-[#8a7c5c] px-[0.2em] py-[0.15em] leading-snug">
                {ordered.length === 0
                  ? 'No tower on the board can take this piece.'
                  : 'No tower would gain from it. Untick the filter to equip it anyway.'}
              </div>
            ) : (
              <div className="max-h-[12em] overflow-y-auto space-y-[0.1em] pr-[0.1em] mt-[0.25em]">
                {towers.map(({ t, check, upgrade }) => {
                  const wornHere = t.equipment[slot];
                  const icon = t.type === 'wizard' ? wizardStaffUrl(t) : towerIcon(t.type);
                  return (
                    <button
                      key={t.id}
                      type="button"
                      disabled={!check.ok}
                      onMouseEnter={() => onHoverTower(t)}
                      onMouseLeave={() => onHoverTower(null)}
                      onFocus={() => onHoverTower(t)}
                      onBlur={() => onHoverTower(null)}
                      onClick={() => {
                        onEquip(t.id, g.id);
                        onHoverTower(null);
                        setPick(null);
                      }}
                      className={`w-full flex items-center gap-[0.4em] px-[0.3em] py-[0.25em] text-left text-[0.72em] ${
                        check.ok ? 'hover:bg-[#3a3122] text-[#d3c3a0]' : 'opacity-45 cursor-not-allowed text-[#d3c3a0]'
                      }`}
                    >
                      {icon && <img src={icon} alt="" className="w-[1.3em] h-[1.3em] object-contain shrink-0" onError={hideBrokenImg} />}
                      <span className="flex-1 truncate">{towerListName(t)}</span>
                      {!check.ok ? (
                        <span className="text-[0.9em] text-osrs-red whitespace-nowrap">Requires Lv {g.levelReq}</span>
                      ) : wornHere ? (
                        <span className={`flex items-center gap-[0.25em] text-[0.9em] whitespace-nowrap ${upgrade ? 'text-[#9d8f6a]' : 'text-[#6f6449]'}`}>
                          {upgrade ? 'swaps' : 'worse'}
                          <img src={GEAR_ICONS[wornHere.id]} alt={wornHere.name} title={wornHere.name} className="w-[1.1em] h-[1.1em] object-contain" onError={hideBrokenImg} />
                        </span>
                      ) : (
                        <span className="text-[0.9em] text-osrs-green whitespace-nowrap">empty</span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })()}
    </>
  );
}
