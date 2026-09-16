'use client';

import React, { useEffect, useState } from 'react';
import { ASSETS, GEAR_ICONS } from '@/lib/game/assets';
import type { UiStack } from '@/lib/game/core/engine';
import { moveKey, stackKey, type StackKind } from '@/lib/game/systems/inventory';
import type { Item, Tower } from '@/lib/game/types';
import { canEquip, isUpgradeFor, isUpgradeForAny } from '@/lib/game/systems/tower-gear';
import { GearCompare, GearHeader, GearStats, gearTooltip } from './gear-ui';
import { HoverTip } from './HoverTip';
import { towerIcon, towerListName, wizardStaffUrl } from './tower-ui';
import { hideBrokenImg, InvGrid, ItemSlot, loadBool } from './ui-kit';

/**
 * The **loot bag** — everything the run picked up and is not carrying: the gear
 * that dropped, and whatever overflowed the backpack's twenty-seven slots.
 *
 * The bag itself is the backpack again: the Modern client's translucent ground,
 * four squares to a row ({@link InvGrid}). A real looting bag holds twenty-eight,
 * so that is the height one panel draws — but this one is unbounded, so a longer
 * haul scrolls inside that panel instead of paging.
 *
 * It stacks where the inventory does not. Two of the same gear piece are one square
 * with a 2 on it, and every herb or potion pushed out here piles into one square,
 * so a deep run reads as what it found rather than as a wall of repeats.
 *
 * The squares can be dragged around each other, the way the backpack's can. The
 * grid is built out of the bag's key order rather than out of fixed slots, so a drop
 * rewrites that order instead of swapping two positions — and a square the filter is
 * hiding keeps its place in it, so turning the filter off never scrambles an
 * arrangement made with it on.
 *
 * A tower's own slot asks "which piece?"; a piece here asks "which tower?" — the
 * same picker read from the other end, so neither question makes the player walk to
 * the other panel. A herb or a potion has no such question: clicking one pulls a
 * single item back into a free slot. The bag itself is a square in the backpack —
 * always the twenty-eighth — and clicking that square opens this page in the same
 * panel, because a bag is a bag.
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
  /** Bag keys newest first, gear and stacks in one list: the order the squares hang
   *  in. A square whose key is missing sorts last and keeps its own array's order. */
  order: string[];
  /** No free slot, so nothing can come back out right now. */
  invFull: boolean;
  /** Read live off the engine rather than `UIState` — the picker equips real towers. */
  towers: Tower[];
  /** Which tower row the pointer is on, so the board can ring that tower. */
  hoverTowerId: string | null;
  onHoverTower: (t: Tower | null) => void;
  onEquip: (towerId: string, gearId: string) => void;
  onTake: (kind: StackKind, id: string) => void;
  /** A drag landed: the bag's whole key list, in the order it should hang in now. */
  onReorder: (keys: string[]) => void;
}

/** One square of the bag's grid: a pile of gear, or a stack of herbs or potions.
 *  The two arrive in separate arrays and hang in the same grid, so they are merged
 *  into one list before the bag's order decides where each one sits. */
type BagCell =
  | { key: string; kind: 'gear'; pile: GearPile }
  | { key: string; kind: 'stack'; stack: UiStack };

export function LootBagView({
  bag, stacks, order, invFull, towers: towersOnBoard, hoverTowerId, onHoverTower, onEquip, onTake, onReorder,
}: LootBagViewProps) {
  const [pick, setPick] = useState<string | null>(null);
  // The square a drag started on, held by key rather than by position: the grid
  // re-ranks underneath a drag, and an empty drag payload reads back as slot 0.
  const [dragKey, setDragKey] = useState<string | null>(null);
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

  const allPiles = pileGear(bag);
  const hidden = new Set(
    allPiles
      .filter(({ item }) => hideJunk && !isUpgradeForAny(towersOnBoard, item))
      .map(({ item }) => `gear:${item.id}`),
  );
  const hiddenCount = hidden.size;
  // The grid is one list: whatever arrived last hangs first, of either kind. A key
  // the engine no longer tracks sorts to the end, where a stable sort leaves gear
  // ahead of stacks — the grouping the bag falls back to.
  const allCells: BagCell[] = [
    ...allPiles.map((pile) => ({ key: `gear:${pile.item.id}`, kind: 'gear' as const, pile })),
    ...stacks.map((stack) => ({ key: stackKey(stack.kind, stack.id), kind: 'stack' as const, stack })),
  ];
  const rank = (k: string) => {
    const i = order.indexOf(k);
    return i < 0 ? order.length : i;
  };
  allCells.sort((a, b) => rank(a.key) - rank(b.key));
  // The filter takes squares off the page; it never re-orders them. A drag is
  // resolved against the full list, so the pieces it is hiding keep their places.
  const cells = allCells.filter((c) => !hidden.has(c.key));
  const filled = cells.length;
  // Every square is a handle. The drop rewrites the whole order rather than swapping
  // two squares, because there are no slots here to swap.
  const dragProps = (key: string) => ({
    draggable: true,
    onDragStart: (e: React.DragEvent) => {
      setDragKey(key);
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', key);
    },
    onDragOver: (e: React.DragEvent) => {
      if (dragKey === null || dragKey === key) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
    },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      if (dragKey === null || dragKey === key) return;
      onReorder(moveKey(allCells.map((c) => c.key), dragKey, key));
      setDragKey(null);
    },
    onDragEnd: () => setDragKey(null),
  });
  // Keep the panel a full backpack tall, and every row full, so the scrolling grid
  // stays the shape the client draws rather than a ragged half-page.
  const padding = Math.max(BAG_SLOTS, Math.ceil(filled / COLUMNS) * COLUMNS) - filled;
  const picked = pick ? bag.find((g) => g.id === pick) : undefined;

  // Which tower takes this piece. A tower whose level is too low is listed but
  // disabled, and one whose slot is full says what it would replace (equipping
  // swaps — the old piece falls back into this bag). Hovering a row rings that
  // tower on the board.
  //
  // It is drawn *over* the squares rather than above them. A floating dropdown
  // would be clipped by the scrolling grid, and a block stacked on the page would
  // make the panel taller the moment a square was clicked — the backpack would
  // change size under the hand using it. Covering the grid keeps the page one
  // fixed shape and puts the answer where the question was asked.
  const picker = picked && (() => {
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
    // Every piece a listed tower already wears, once each. Each one is a
    // before/after the stat block may be asked to show.
    const wornPieces: Item[] = [];
    for (const { t } of towers) {
      const w = t.equipment[slot];
      if (w && !wornPieces.some((p) => p.id === w.id)) wornPieces.push(w);
    }
    return (
      <>
        {/* The picked piece's stats stay on screen for as long as the picker is
            open — the decision is "is this worth a slot?", and you cannot answer
            it from a tooltip you have to keep summoning. Hovering a tower that
            already wears something turns the same block into that swap's
            before/after. The way out is a button, because the square that opened
            the picker is under the picker now. */}
        <div className="flex items-start gap-[0.4em]">
          <div className="flex-1 min-w-0">
            <GearHeader item={g} note={worn ? `Replacing ${worn.name}` : undefined} />
          </div>
          <button
            type="button"
            className="rs-btn px-[0.4em] py-0 text-[0.7em] shrink-0"
            title="Back to the bag"
            onClick={() => { setPick(null); onHoverTower(null); }}
          >
            ✕
          </button>
        </div>
        {g.rarity === 'signature' && g.description && (
          <p className="mt-[0.3em] text-[0.72em] text-[#c9b78c] leading-snug">{g.description}</p>
        )}
        {/* Every block it can show, stacked in one grid cell with only the live one
            visible. The cell is as tall as the tallest of them whatever is hovered,
            so moving the mouse along the list below never moves the list. A block
            that changed height under the cursor would move the row out from under
            it, un-hover it, shrink back and hover it again, over and over. */}
        <div className="mt-[0.35em] grid">
          {[null, ...wornPieces].map((w) => {
            const live = (w?.id ?? null) === (worn?.id ?? null);
            return (
              <div key={w?.id ?? 'own'} className={`col-start-1 row-start-1 ${live ? '' : 'invisible'}`} aria-hidden={!live}>
                {w ? <GearCompare from={w} to={g} /> : <GearStats item={g} />}
              </div>
            );
          })}
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
          <div className="space-y-[0.1em] mt-[0.25em]">
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
      </>
    );
  })();

  return (
    <>
      {/* The one row above the squares, and the same row the inventory page draws,
          so the two pages are the same size and the panel does not move when one is
          swapped for the other. The bag names itself — with the tab rail gone there
          is nothing else to say which backpack this is — and carries the only
          question this page can be asked. How to leave is in the row's tooltip: the
          Inventory stone that opened the bag is also the way back out of it. */}
      <div className="rs-inv-head text-[0.75em]" title="Click the Inventory stone to go back to the backpack">
        <img src={ASSETS.misc.loot_bag} alt="" className="w-[1.1em] h-[1.1em] object-contain" onError={hideBrokenImg} />
        <span className="flex-1 truncate">Looting bag</span>
        <label
          className="flex items-center gap-[0.3em] shrink-0 cursor-pointer select-none"
          title="Show only the pieces that would improve a tower on the board. The rest stay in the bag — nothing can wear them, or what those towers already wear is better."
        >
          <input
            type="checkbox"
            className="rs-check"
            checked={hideJunk}
            onChange={(e) => setHideJunk(e.target.checked)}
          />
          Upgrades only
          {hiddenCount > 0 && <span className="text-[#8a7c5c]">({hiddenCount})</span>}
        </label>
      </div>

      {/* The grid is drawn whether or not anything is in it — an empty backpack is
          still the backpack, and a page that vanishes into a paragraph reads as a
          broken panel. The line goes *inside* the squares, centred, and says which
          kind of empty this is: nothing found yet, or everything filtered out. It
          overlays rather than stacks so the page is one backpack tall either way,
          and the picker covers the same squares for the same reason. */}
      <InvGrid
        className="rs-inv-page rs-inv-scroll"
        cover={picker || undefined}
        overlay={filled === 0 ? (
          allPiles.length === 0 && stacks.length === 0
            ? 'Empty. Monsters drop gear as they die, and bosses drop the signature jewellery. Whatever will not fit in the inventory waits here too.'
            : 'Nothing here would improve a tower on the board: wrong style, too high a level, or beaten by what is already worn. Untick to see it all.'
        ) : undefined}
      >
        {cells.map((cell) => {
          if (cell.kind === 'gear') {
            const { item, count } = cell.pile;
            return (
              <HoverTip key={cell.key} content={gearTooltip(item)}>
                <ItemSlot
                  osrs
                  icon={GEAR_ICONS[item.id]}
                  name={item.name}
                  count={count > 1 ? count : undefined}
                  title={`Equip ${item.name}`}
                  selected={pick === item.id}
                  signature={item.rarity === 'signature'}
                  drag={dragProps(cell.key)}
                  onClick={() => setPick((cur) => (cur === item.id ? null : item.id))}
                />
              </HoverTip>
            );
          }
          // A herb or a potion has one thing to ask, so it is a click and not a
          // picker: one comes back, into the first free square.
          const s = cell.stack;
          return (
            <ItemSlot
              key={cell.key}
              osrs
              icon={s.icon}
              name={s.name}
              count={s.count}
              dim={invFull}
              title={invFull ? 'Inventory full' : `Take one ${s.name}`}
              drag={dragProps(cell.key)}
              onClick={() => onTake(s.kind, s.id)}
            />
          );
        })}
        {Array.from({ length: padding }, (_, j) => <ItemSlot key={`e${j}`} osrs />)}
      </InvGrid>
    </>
  );
}
