'use client';

import React, { useMemo, useState } from 'react';
import { ASSETS } from '@/lib/game/assets';
import type { UIState, UiStack } from '@/lib/game/core/engine';
import type { SeedId } from '@/lib/game/data/farming';
import { POTIONS, type PotionId } from '@/lib/game/data/herblore';
import type { Tower } from '@/lib/game/types';
import { brewBlocker, emptyPouch, emptyStock } from '@/lib/game/systems/herblore';
import { INVENTORY_SLOTS, type StackKind } from '@/lib/game/systems/inventory';
import { LootBagView } from './lootbag-ui';
import { OptionMenu, type MenuOption } from './OptionMenu';
import {
  InvGrid, ItemSlot, ShopFrame, type ShopTab,
} from './ui-kit';

/**
 * The **Inventory** interface — twenty-eight slots, and the loot bag on the second
 * tab.
 *
 * It is OSRS's arrangement down to the pixel: a 4×7 grid of 42×36 cells on the
 * client's own `invback` panel ({@link InvGrid}), borderless, because that is what
 * the backpack looks like. And it is here for OSRS's reason: nothing stacks in
 * these slots, so a herb is one square and a potion is one square, and by the late
 * run what to carry is a question with an answer. The inventory is what the rest of
 * the game reads — the bench brews from these slots, and a herb in the loot bag is
 * a herb left at home.
 *
 * The panel is the backpack and the tab rail under it, and nothing else. It opens
 * upward out of a stone in the bottom bar, so its own stones sit on its bottom
 * edge, where the click came from. There is no title bar: the lit stone says which
 * page is open, the slots in use are counted on the Inventory stone itself, and a
 * square is acted on through OSRS's **Choose Option** menu ({@link OptionMenu}) —
 * left-click or right-click it and the menu lists what can be done with it, which
 * is a herb consumed, a potion drunk, every recipe those can finish right now, and
 * moving the lot into the loot bag.
 *
 * The two pages are two different bags, not two views of one: the inventory holds
 * what a full run can carry, and the loot bag ({@link LootBagView}) holds
 * everything that did not fit — the gear that dropped, and whatever overflowed
 * these slots. It is unbounded and it stacks, so nothing a run picks up is ever
 * lost for want of a square.
 */

export interface InventoryViewProps {
  ui: UIState;
  /** Classic only: the roguelite drops no gear, so it has no loot bag of its own.
   *  Overflow can still open one — see `showBag` below. */
  showLootBag: boolean;
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
    ui, showLootBag, towers, hoverTowerId, onHoverTower, onEquipGear,
    onStoreStack, onTakeStack, onUseHerb, onBrewPotion, onDrinkPotion,
  } = props;
  const [page, setPage] = useState<'inventory' | 'lootbag'>('inventory');
  // The open Choose Option menu: where the click landed, and the square it landed
  // on. Held by the stack itself rather than by the slot index, because acting on
  // one moves the rest around.
  const [menu, setMenu] = useState<{ x: number; y: number; stack: UiStack } | null>(null);

  // The bag tab is classic's gear bag, and it is also where anything that did not
  // fit ends up — so the roguelite, which drops no gear, still needs the tab the
  // moment the bag holds anything at all, or what is in there is unreachable.
  const showBag = showLootBag || ui.bagStacks.length > 0 || ui.lootBag.length > 0;

  const free = useMemo(() => ui.inventory.reduce((n, s) => n + (s ? 0 : 1), 0), [ui.inventory]);
  const options = useMemo(
    () => (menu ? stackOptions(menu.stack, ui, onUseHerb, onBrewPotion, onDrinkPotion, onStoreStack) : []),
    [menu, ui, onUseHerb, onBrewPotion, onDrinkPotion, onStoreStack],
  );

  const tabs: ShopTab[] = [
    {
      id: 'inventory',
      label: 'Inventory',
      icon: ASSETS.misc.inventory_icon,
      // The one number the title bar used to carry, moved onto the stone it
      // belongs to: slots in use, the way the client counts a bag.
      badge: INVENTORY_SLOTS - free,
      title: 'What this run carries',
    },
    ...(showBag
      ? [{
        id: 'lootbag',
        label: 'Loot bag',
        icon: ASSETS.misc.loot_bag,
        badge: ui.lootBag.length + ui.bagStacks.length,
        title: 'Gear dropped this run, and whatever did not fit',
      } as ShopTab]
      : []),
  ];

  const onTab = (id: string) => {
    setMenu(null);
    setPage(id === 'lootbag' ? 'lootbag' : 'inventory');
  };

  /** The 28 slots, at the client's metrics. `rs-inv-page` marks the page that is
   *  *only* the backpack, so the panel around it can shrink to the grid. Nothing
   *  here carries a count: one square is one item. */
  const backpack = (onSlot: (s: UiStack, e: React.MouseEvent) => void) => (
    <InvGrid
      background={ASSETS.misc.inventory_background}
      postLeft={ASSETS.misc.inv_post_left}
      postRight={ASSETS.misc.inv_post_right}
      className="rs-inv-page"
    >
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
    </InvGrid>
  );

  // ──────────────────────────── the loot bag ─────────────────────────────
  if (page === 'lootbag' && showBag) {
    return (
      <ShopFrame tabs={tabs} activeTab="lootbag" onTab={onTab}>
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
      </ShopFrame>
    );
  }

  // ──────────────────────────── the inventory ────────────────────────────
  return (
    <ShopFrame tabs={tabs} activeTab="inventory" onTab={onTab}>
      {/* The bar-stone panel closes itself on right-click; a square inside it must
          keep that gesture for its own menu, so the event stops here. */}
      {backpack((s, e) => {
        e.preventDefault();
        e.stopPropagation();
        setMenu({ x: e.clientX, y: e.clientY, stack: s });
      })}
      {menu && (
        <OptionMenu x={menu.x} y={menu.y} options={options} onClose={() => setMenu(null)} />
      )}
    </ShopFrame>
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
