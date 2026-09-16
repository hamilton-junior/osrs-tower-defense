'use client';

import React, { useMemo, useState } from 'react';
import { ASSETS } from '@/lib/game/assets';
import type { UIState, UiStack } from '@/lib/game/core/engine';
import { SEED_BY_ID, type SeedId } from '@/lib/game/data/farming';
import { POTIONS, POTION_BY_ID, type PotionDef, type PotionId } from '@/lib/game/data/herblore';
import { FISH_BY_ID, type FishId } from '@/lib/game/data/fishing';
import type { Tower } from '@/lib/game/types';
import { brewBlocker, emptyPouch, emptyStock, outrankedBy, overhealCap, type BrewBlocker } from '@/lib/game/systems/herblore';
import type { StackKind } from '@/lib/game/systems/inventory';
import { LootBagView } from './lootbag-ui';
import { OptionMenu, type MenuOption } from './OptionMenu';
import { stackTip } from './stack-tip';
import { fmt, hideBrokenImg, InvGrid, ItemSlot } from './ui-kit';

/**
 * The **Inventory** interface — twenty-eight squares, the last of which is the
 * looting bag itself.
 *
 * It is OSRS's arrangement down to the pixel: a 4×7 grid of 42×36 cells, borderless
 * ({@link InvGrid}), on the dark translucent ground the resizable Modern client lays its
 * side panel over the world as, ringed by that client's own stone frame, because that is
 * what the backpack looks like. And it is here for OSRS's reason: nothing stacks in these
 * slots, so a herb is one square and a potion is one square, and by the late run what to
 * carry is a question with an answer.
 * The inventory is what the rest of the game reads — the bench brews from these slots,
 * and a herb in the loot bag is a herb left at home.
 *
 * There is no tab rail and no title bar. The panel is the backpack, and nothing
 * else: it opens upward out of the Inventory stone in the bottom bar, the slots in
 * use are counted on that stone, and a square is acted on through OSRS's **Choose
 * Option** menu ({@link OptionMenu}) — left-click or right-click it and the menu
 * lists what can be done with it, which is a herb consumed, a potion drunk, every
 * recipe it goes into, and moving the lot into the loot bag.
 *
 * The looting bag is carried the way OSRS carries one: as an item in the backpack,
 * always in the twenty-eighth square, which is why the run has twenty-seven slots
 * to fill rather than twenty-eight. Clicking that square opens the bag
 * ({@link LootBagView}) — the same backpack again, holding the gear that dropped
 * and everything that overflowed these slots. It is unbounded and it stacks, so
 * nothing a run picks up is ever lost for want of a square. Clicking the Inventory
 * stone comes back here; clicking it again closes the panel.
 */

/** Which of the two backpacks is on screen. */
export type InventoryPage = 'inventory' | 'lootbag';

export interface InventoryViewProps {
  ui: UIState;
  /** The open page, owned by `GameRoot`: the Inventory stone is the way back out of
   *  the loot bag, and the stone is not inside this component. */
  page: InventoryPage;
  onPage: (p: InventoryPage) => void;
  /** The board's towers, live off the engine — the loot bag equips them. */
  towers: Tower[];
  hoverTowerId: string | null;
  onHoverTower: (t: Tower | null) => void;
  onEquipGear: (towerId: string, gearId: string) => void;
  /** Push every one of a carried thing into the loot bag. */
  onStoreStack: (kind: StackKind, id: string) => void;
  /** Pull one back out of it, if a slot is free. */
  onTakeStack: (kind: StackKind, id: string) => void;
  /** Drag one carried square onto another: the two swap. */
  onMoveSlot: (from: number, to: number) => void;
  onUseHerb: (id: SeedId) => void;
  onBrewPotion: (id: PotionId) => void;
  onDrinkPotion: (id: PotionId) => void;
  onEatFood: (id: FishId) => void;
  /** Sell one instead of eating it, for a run that would rather have the gold. */
  onSellFood: (id: FishId) => void;
  /** A drag rearranged the looting bag: its whole key list, newly ordered. */
  onReorderBag: (keys: string[]) => void;
}

export function InventoryView(props: InventoryViewProps) {
  const {
    ui, page, onPage, towers, hoverTowerId, onHoverTower, onEquipGear,
    onStoreStack, onTakeStack, onMoveSlot, onUseHerb, onBrewPotion, onDrinkPotion,
    onEatFood, onSellFood, onReorderBag,
  } = props;
  // The open Choose Option menu: where the click landed, and the square it landed
  // on. Held by the stack itself rather than by the slot index, because acting on
  // one moves the rest around.
  const [menu, setMenu] = useState<{ x: number; y: number; stack: UiStack } | null>(null);
  // The square a drag started on. Read from here on drop rather than from the drag
  // payload, because an empty payload reads back as slot 0.
  const [dragFrom, setDragFrom] = useState<number | null>(null);

  const free = useMemo(() => ui.inventory.reduce((n, s) => n + (s ? 0 : 1), 0), [ui.inventory]);
  const options = useMemo(
    () => (menu ? stackOptions(menu.stack, ui, onUseHerb, onBrewPotion, onDrinkPotion, onEatFood, onSellFood, onStoreStack) : []),
    [menu, ui, onUseHerb, onBrewPotion, onDrinkPotion, onEatFood, onSellFood, onStoreStack],
  );
  const bagCount = ui.lootBag.length + ui.bagStacks.length;

  // ──────────────────────────── the loot bag ─────────────────────────────
  if (page === 'lootbag') {
    return (
      <LootBagView
        bag={ui.lootBag}
        stacks={ui.bagStacks}
        order={ui.bagOrder}
        invFull={free < 1}
        vitals={ui}
        towers={towers}
        hoverTowerId={hoverTowerId}
        onHoverTower={onHoverTower}
        onEquip={onEquipGear}
        onTake={onTakeStack}
        onReorder={onReorderBag}
      />
    );
  }

  // ──────────────────────────── the inventory ────────────────────────────
  /* The bar-stone panel closes itself on right-click; a square inside it must keep
     that gesture for its own menu, so the event stops here. */
  const onSlot = (s: UiStack, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setMenu({ x: e.clientX, y: e.clientY, stack: s });
  };
  const onBag = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setMenu(null);
    onPage('lootbag');
  };
  /* Rearranging the backpack, the way the client allows it: pick a square up and
     drop it on another, and the two swap. A drop on an empty square leaves a hole
     where the item was — nothing stacks here, so that is all "moved it there" can
     mean. Only a filled square can be picked up. */
  const dragProps = (i: number, filled: boolean) => ({
    draggable: filled,
    onDragStart: (e: React.DragEvent) => {
      if (!filled) return;
      setDragFrom(i);
      e.dataTransfer.effectAllowed = 'move';
      // Firefox starts no drag at all without a payload, even one nothing reads.
      e.dataTransfer.setData('text/plain', String(i));
    },
    onDragOver: (e: React.DragEvent) => {
      if (dragFrom === null || dragFrom === i) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
    },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      if (dragFrom === null || dragFrom === i) return;
      onMoveSlot(dragFrom, i);
      setDragFrom(null);
    },
    onDragEnd: () => setDragFrom(null),
  });

  return (
    <>
      {/* The same row the loot bag draws, so the two pages measure the same and
          the panel holds still when one is swapped for the other. What it says
          is the one thing to know about a backpack: how much room is left. */}
      <div className="rs-inv-head text-[0.75em]">
        <img src={ASSETS.misc.inventory_icon} alt="" className="w-[1.1em] h-[1.1em] object-contain" onError={hideBrokenImg} />
        <span className="flex-1">Inventory</span>
        <span className={free > 0 ? 'text-[#8a7c5c]' : 'text-[var(--osrs-red)]'}>
          {free > 0 ? `${free} free` : 'Full'}
        </span>
      </div>
      {/* Twenty-seven carried squares and the bag, at the client's metrics.
          `rs-inv-page` marks the page that is *only* the backpack, so the panel
          around it can shrink to the grid. Nothing carried here has a count: one
          square is one item. */}
      <InvGrid className="rs-inv-page">
        {ui.inventory.map((s, i) => (
          s
            ? (
              <ItemSlot
                key={`i${i}`}
                osrs
                icon={s.icon}
                name={s.name}
                tip={menu ? null : stackTip(s, ui)}
                drag={dragProps(i, true)}
                onClick={(e) => onSlot(s, e)}
                onContextMenu={(e) => onSlot(s, e)}
              />
            )
            : <ItemSlot key={`i${i}`} osrs drag={dragProps(i, false)} />
        ))}
        {/* The last square is the bag itself, the way a real looting bag rides in a
            real inventory. It carries what it holds as its count, so the panel says
            there is something in there without being opened. */}
        <ItemSlot
          osrs
          icon={ASSETS.misc.loot_bag}
          name="Looting bag"
          count={bagCount > 0 ? bagCount : undefined}
          title="Looting bag: the gear this run has found, and whatever did not fit"
          onClick={onBag}
          onContextMenu={onBag}
        />
      </InvGrid>
      {menu && (
        <OptionMenu x={menu.x} y={menu.y} options={options} onClose={() => setMenu(null)} />
      )}
    </>
  );
}

/**
 * The lines OSRS would put on that square, and only those: a herb is consumed, a
 * potion is drunk, a fish is eaten, a herb or potion grows a Brew line for every
 * recipe it goes into, and anything can be pushed into the loot bag. A Harralander
 * makes an Energy potion and a Combat potion, so both are listed. A recipe the run
 * cannot finish yet stays on the menu greyed, with the wall it is against (the
 * level, the other ingredient, the coins) printed after it.
 *
 * Using a thing is a between-waves action, so during a fight those lines stay and
 * grey out rather than vanishing: the option existing is what says it will be back
 * once the wave is over. Storing is not gated — moving stock between two bags never
 * touches the fight.
 */
function stackOptions(
  stack: UiStack,
  ui: UIState,
  onUseHerb: (id: SeedId) => void,
  onBrewPotion: (id: PotionId) => void,
  onDrinkPotion: (id: PotionId) => void,
  onEatFood: (id: FishId) => void,
  onSellFood: (id: FishId) => void,
  onStoreStack: (kind: StackKind, id: string) => void,
): MenuOption[] {
  const disabled = ui.waveActive;
  const note = disabled ? 'only between waves' : undefined;
  const out: MenuOption[] = stack.kind === 'herb'
    ? [{
      action: 'Consume',
      target: stack.name,
      disabled,
      note,
      title: 'Eat it raw: its effect rides the next wave',
      onSelect: () => onUseHerb(stack.id as SeedId),
    }]
    : stack.kind === 'food'
      ? [{
        action: 'Eat',
        target: stack.name,
        disabled,
        note,
        title: stack.tip,
        onSelect: () => onEatFood(stack.id as FishId),
      }, {
        // Ungated, the way Store is: gold moving changes nothing about a fight. The
        // price is on the line, so the choice between a life and the coins is made
        // without leaving the menu.
        action: 'Sell',
        target: stack.name,
        coins: FISH_BY_ID[stack.id as FishId]?.gold,
        title: 'Sell one for gold instead of eating it',
        onSelect: () => onSellFood(stack.id as FishId),
      }]
      : [drinkOption(stack, ui, onDrinkPotion)];

  // The engine brews out of the pouch and the shelf, so the menu asks the same
  // two the same way — `brewBlocker` is the one answer to "can this be made".
  const pouch = emptyPouch();
  for (const h of ui.herbPouch) pouch[h.seedId] = h.count;
  const stock = emptyStock();
  for (const p of ui.potionStock) stock[p.id] = p.count;

  for (const def of POTIONS) {
    const usesThis = stack.kind === 'herb' ? def.herb === stack.id : def.potionInput === stack.id;
    if (!usesThis) continue;
    const blocker = brewBlocker(def, ui.herbloreLevel, pouch, stock, ui.money);
    out.push({
      action: 'Brew',
      target: def.name,
      disabled: disabled || blocker !== null,
      // The recipe's own wall comes first: "only between waves" is over in a
      // minute, a missing level is not.
      note: blocker ? brewWall(blocker, def) : note,
      title: def.tip,
      onSelect: () => onBrewPotion(def.id),
    });
  }

  // Last line, the way the client keeps the tidying-up action out of the way of
  // the one you came for. It moves every square of that thing at once: picking
  // them off one at a time is not a decision, it is clicking.
  out.push({
    action: 'Store',
    target: stack.name,
    title: 'Move all of them into the loot bag',
    onSelect: () => onStoreStack(stack.kind, stack.id),
  });
  return out;
}

/**
 * The Drink line, held to the same rules as the Herblore bench's tile so the two
 * places a potion is drunk from never disagree.
 *
 * It greys out on the walls the engine would refuse it at, with the reason on the
 * line. And it asks before the two drinks that spend a dose for little: another of
 * a potion that is still running only starts its clock over, and a Saradomin brew
 * at the overheal ceiling heals nothing and still leaves its debt.
 */
function drinkOption(stack: UiStack, ui: UIState, onDrinkPotion: (id: PotionId) => void): MenuOption {
  const def = POTION_BY_ID[stack.id as PotionId];
  const lifeCost = def?.lifeCost ?? 0;
  const covered = def ? outrankedBy(ui.activePotions, def) : null;
  const wall = lifeCost > 0 && ui.lives <= lifeCost ? 'too few lives'
    : def?.clearsBrew && ui.brewStacks < 1 ? 'no brew to clear'
    : covered ? `${covered.name} already covers it`
    : null;
  const running = ui.activePotions.find((a) => a.id === stack.id);
  const capped = !!def?.overheals && ui.lives >= overhealCap(ui.maxLives);
  return {
    action: 'Drink',
    target: stack.name,
    disabled: ui.waveActive || wall !== null,
    note: wall ?? (ui.waveActive ? 'only between waves' : undefined),
    confirm: running
      ? `it still has ${running.wavesLeft} wave${running.wavesLeft === 1 ? '' : 's'} left`
      : capped ? 'it heals nothing and still leaves a brew'
      : undefined,
    title: stack.tip,
    onSelect: () => onDrinkPotion(stack.id as PotionId),
  };
}

/** What a greyed Brew line says it is missing, a few words long. */
function brewWall(blocker: BrewBlocker, def: PotionDef): string {
  switch (blocker) {
    case 'level': return `needs Herblore ${def.level}`;
    case 'herb': return def.herb ? `needs ${SEED_BY_ID[def.herb].herbName}` : 'needs its herb';
    case 'potion': return def.potionInput ? `needs ${POTION_BY_ID[def.potionInput].name}` : 'needs its potion';
    case 'gold': return `needs ${fmt(def.cost)} gp`;
  }
}
