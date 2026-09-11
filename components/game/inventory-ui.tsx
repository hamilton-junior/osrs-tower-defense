'use client';

import React, { useMemo, useState } from 'react';
import { ASSETS } from '@/lib/game/assets';
import type { UIState, UiStack } from '@/lib/game/core/engine';
import type { SeedId } from '@/lib/game/data/farming';
import { POTIONS, type PotionId } from '@/lib/game/data/herblore';
import type { Tower } from '@/lib/game/types';
import { brewBlocker, emptyPouch, emptyStock } from '@/lib/game/systems/herblore';
import type { StackKind } from '@/lib/game/systems/inventory';
import { LootBagView } from './lootbag-ui';
import { OptionMenu, type MenuOption } from './OptionMenu';
import { hideBrokenImg, InvGrid, ItemSlot } from './ui-kit';

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
 * recipe those can finish right now, and moving the lot into the loot bag.
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
  onUseHerb: (id: SeedId) => void;
  onBrewPotion: (id: PotionId) => void;
  onDrinkPotion: (id: PotionId) => void;
}

export function InventoryView(props: InventoryViewProps) {
  const {
    ui, page, onPage, towers, hoverTowerId, onHoverTower, onEquipGear,
    onStoreStack, onTakeStack, onUseHerb, onBrewPotion, onDrinkPotion,
  } = props;
  // The open Choose Option menu: where the click landed, and the square it landed
  // on. Held by the stack itself rather than by the slot index, because acting on
  // one moves the rest around.
  const [menu, setMenu] = useState<{ x: number; y: number; stack: UiStack } | null>(null);

  const free = useMemo(() => ui.inventory.reduce((n, s) => n + (s ? 0 : 1), 0), [ui.inventory]);
  const options = useMemo(
    () => (menu ? stackOptions(menu.stack, ui, onUseHerb, onBrewPotion, onDrinkPotion, onStoreStack) : []),
    [menu, ui, onUseHerb, onBrewPotion, onDrinkPotion, onStoreStack],
  );
  const bagCount = ui.lootBag.length + ui.bagStacks.length;

  // ──────────────────────────── the loot bag ─────────────────────────────
  if (page === 'lootbag') {
    return (
      <LootBagView
        bag={ui.lootBag}
        stacks={ui.bagStacks}
        invFull={free < 1}
        towers={towers}
        hoverTowerId={hoverTowerId}
        onHoverTower={onHoverTower}
        onEquip={onEquipGear}
        onTake={onTakeStack}
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
                title={s.tip}
                onClick={(e) => onSlot(s, e)}
                onContextMenu={(e) => onSlot(s, e)}
              />
            )
            : <ItemSlot key={`i${i}`} osrs />
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
 * potion is drunk, either grows a Brew line for every recipe it can finish right
 * now, and anything can be pushed into the loot bag. A recipe the run cannot pay
 * for — the level, the second ingredient, the coins — is not a greyed line here;
 * the Herblore bench is where a locked potion is read.
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
    : [{
      action: 'Drink',
      target: stack.name,
      disabled,
      note,
      title: stack.tip,
      onSelect: () => onDrinkPotion(stack.id as PotionId),
    }];

  // The engine brews out of the pouch and the shelf, so the menu asks the same
  // two the same way — `brewBlocker` is the one answer to "can this be made".
  const pouch = emptyPouch();
  for (const h of ui.herbPouch) pouch[h.seedId] = h.count;
  const stock = emptyStock();
  for (const p of ui.potionStock) stock[p.id] = p.count;

  for (const def of POTIONS) {
    const usesThis = stack.kind === 'herb' ? def.herb === stack.id : def.potionInput === stack.id;
    if (!usesThis) continue;
    if (brewBlocker(def, ui.herbloreLevel, pouch, stock, ui.money) !== null) continue;
    out.push({
      action: 'Brew',
      target: def.name,
      disabled,
      note,
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
