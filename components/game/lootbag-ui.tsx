'use client';

import React, { useEffect, useState } from 'react';
import { GEAR_ICONS } from '@/lib/game/assets';
import type { Item, Tower } from '@/lib/game/types';
import { canEquip, isUpgradeFor, isUpgradeForAny } from '@/lib/game/systems/tower-gear';
import { GearCompare, GearHeader, GearStats, gearTooltip } from './gear-ui';
import { HoverTip } from './HoverTip';
import { towerIcon, towerListName, wizardStaffUrl } from './tower-ui';
import { hideBrokenImg, ItemSlot, loadBool, SlotGrid } from './ui-kit';

/**
 * The **loot bag** — every gear piece dropped this run, and the other half of the
 * equip flow.
 *
 * A tower's own slot asks "which piece?"; a piece here asks "which tower?" — the
 * same picker read from the other end, so neither question makes the player walk
 * to the other panel. It is a page of the inventory interface (classic only: the
 * roguelite drops no gear), because a bag is a bag: what a run picked up belongs
 * behind the same stone as what it carries.
 */

export interface LootBagViewProps {
  bag: Item[];
  /** Read live off the engine rather than `UIState` — the picker equips real towers. */
  towers: Tower[];
  /** Which tower row the pointer is on, so the board can ring that tower. */
  hoverTowerId: string | null;
  onHoverTower: (t: Tower | null) => void;
  onEquip: (towerId: string, gearId: string) => void;
}

export function LootBagView({ bag, towers: towersOnBoard, hoverTowerId, onHoverTower, onEquip }: LootBagViewProps) {
  const [pick, setPick] = useState<number | null>(null);
  // Both filters default on: a deep run's bag fills with pieces nothing wants, and
  // every tower is listed for every piece. The useful answer is the short list —
  // the long one stays a click away.
  const [hideJunk, setHideJunk] = useState(() => loadBool('ui_bag_hide_junk', true));
  const [hideDowngrades, setHideDowngrades] = useState(() => loadBool('ui_bag_hide_downgrades', true));
  useEffect(() => { try { localStorage.setItem('ui_bag_hide_junk', JSON.stringify(hideJunk)); } catch { /* ignore */ } }, [hideJunk]);
  useEffect(() => { try { localStorage.setItem('ui_bag_hide_downgrades', JSON.stringify(hideDowngrades)); } catch { /* ignore */ } }, [hideDowngrades]);
  // The bag re-indexes when a piece is equipped (and grows on a drop), so an open
  // picker would end up pointing at a different item. Close it instead.
  useEffect(() => { setPick(null); }, [bag.length]);
  // Leaving this page must not leave a tower ringed on the board — the pointer
  // never gets a chance to leave the row it was on.
  useEffect(() => () => onHoverTower(null), [onHoverTower]);

  if (bag.length === 0) {
    return (
      <div className="mt-[0.6em] px-[0.2em] text-[0.75em] text-[#8f8158] leading-relaxed">
        Empty. Monsters drop gear as they die, and bosses drop the signature
        jewellery. Click a piece here, or a tower&apos;s own slot, to equip it.
      </div>
    );
  }

  const shown = bag
    .map((g, i) => ({ g, i }))
    .filter(({ g }) => !hideJunk || isUpgradeForAny(towersOnBoard, g));
  const hiddenCount = bag.length - shown.length;

  return (
    <>
      <label
        className="flex items-center gap-[0.4em] mt-[0.5em] px-[0.2em] text-[0.72em] text-[#d3c3a0] cursor-pointer select-none"
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

      {shown.length === 0 ? (
        <div className="mt-[0.5em] px-[0.2em] text-[0.72em] text-[#8f8158] leading-snug">
          Nothing here would improve a tower on the board: wrong style, too
          high a level, or beaten by what is already worn. Untick to see it all.
        </div>
      ) : (
        <SlotGrid
          cols={4}
          maxHeight="13em"
          label="Unequipped gear"
          right={hiddenCount > 0 ? `${shown.length}/${bag.length}` : bag.length}
        >
          {shown.map(({ g, i }) => (
            <HoverTip key={i} content={gearTooltip(g)}>
              <ItemSlot
                icon={GEAR_ICONS[g.id]}
                name={g.name}
                title={`Equip ${g.name}`}
                selected={pick === i}
                signature={g.rarity === 'signature'}
                onClick={() => setPick((cur) => (cur === i ? null : i))}
              />
            </HoverTip>
          ))}
        </SlotGrid>
      )}

      {/* Which tower takes this piece. A tower whose level is too low is listed but
          disabled, and one whose slot is full says what it would replace (equipping
          swaps — the old piece falls back into this bag). Hovering a row rings that
          tower on the board. Inline rather than a floating dropdown: this panel
          scrolls, and `overflow-y-auto` would clip one. */}
      {pick !== null && bag[pick] && (() => {
        const g = bag[pick]!;
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
          <div className="mt-[0.5em] rs-panel-inset p-[0.5em]">
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
