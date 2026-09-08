'use client';

import React, { useMemo, useState } from 'react';
import { ASSETS } from '@/lib/game/assets';
import type { UIState, UiStack } from '@/lib/game/core/engine';
import type { SeedId } from '@/lib/game/data/farming';
import { POTIONS, type PotionId } from '@/lib/game/data/herblore';
import type { Tower } from '@/lib/game/types';
import { brewBlocker, emptyPouch, emptyStock } from '@/lib/game/systems/herblore';
import { INVENTORY_SLOTS } from '@/lib/game/systems/inventory';
import { LootBagView } from './lootbag-ui';
import { OptionMenu, type MenuOption } from './OptionMenu';
import {
  InvGrid, ItemSlot, ShopFrame, type ShopTab,
} from './ui-kit';

/**
 * The **Inventory** interface — twenty-eight slots, the loot bag on the second
 * tab, and a stone that opens the bank.
 *
 * It is OSRS's arrangement down to the pixel: a 4×7 grid of 42×36 cells on the
 * client's own `invback` panel ({@link InvGrid}), borderless, because that is what
 * the backpack looks like. And it is here for OSRS's reason: fourteen herbs plus
 * twenty potions is thirty-four stacks against twenty-eight slots, so by the late
 * run what to carry is a question with an answer. The inventory is what the rest
 * of the game reads — the bench brews from these slots, a herb in the bank is a
 * herb left at home — and the bank only opens between waves, because a loadout is
 * decided before the fighting, not during it.
 *
 * The panel is the backpack and the tab rail under it, and nothing else. It opens
 * upward out of a stone in the bottom bar, so its own stones sit on its bottom
 * edge, where the click came from. There is no title bar: the lit stone says which
 * page is open, the slots in use are counted on the Inventory stone itself, and a
 * stack is acted on through OSRS's **Choose Option** menu ({@link OptionMenu}) —
 * left-click or right-click a square and it lists what can be done with it, which
 * is a herb consumed, a potion drunk, and every recipe those can finish right now.
 *
 * The pages here are two different bags, not two views of one: the inventory holds
 * what gets used, and the loot bag holds tower gear, which is equipped rather than
 * used and so keeps its own page ({@link LootBagView}) inside this frame. The bank
 * is the third stone but not a third page — a bank is a window of its own in OSRS,
 * so that stone opens the bank window over the board, and this panel stays on
 * whatever page it was already showing.
 */

export interface InventoryViewProps {
  ui: UIState;
  /** Classic only: the roguelite drops no gear, so it has no loot bag. */
  showLootBag: boolean;
  /** The board's towers, live off the engine — the loot bag equips them. */
  towers: Tower[];
  hoverTowerId: string | null;
  onHoverTower: (t: Tower | null) => void;
  onEquipGear: (towerId: string, gearId: string) => void;
  /** The Bank stone is a switch for the bank window; the window moves the stacks. */
  onOpenBank: () => void;
  onCloseBank: () => void;
  onUseHerb: (id: SeedId) => void;
  onBrewPotion: (id: PotionId) => void;
  onDrinkPotion: (id: PotionId) => void;
}

export function InventoryView(props: InventoryViewProps) {
  const {
    ui, showLootBag, towers, hoverTowerId, onHoverTower, onEquipGear,
    onOpenBank, onCloseBank, onUseHerb, onBrewPotion, onDrinkPotion,
  } = props;
  // Which page is showing. The bank is not one of them — it is a window of its
  // own, and it is engine state besides (a wave may not start with it open).
  const [page, setPage] = useState<'inventory' | 'lootbag'>('inventory');
  // The open Choose Option menu: where the click landed, and the stack it landed
  // on. Held by the stack itself rather than by the slot, because acting on one
  // moves the rest around.
  const [menu, setMenu] = useState<{ x: number; y: number; stack: UiStack } | null>(null);

  const free = useMemo(() => ui.inventory.reduce((n, s) => n + (s ? 0 : 1), 0), [ui.inventory]);
  const options = useMemo(
    () => (menu ? stackOptions(menu.stack, ui, onUseHerb, onBrewPotion, onDrinkPotion) : []),
    [menu, ui, onUseHerb, onBrewPotion, onDrinkPotion],
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
    ...(showLootBag
      ? [{ id: 'lootbag', label: 'Loot bag', icon: ASSETS.misc.loot_bag, badge: ui.lootBag.length, title: 'Gear dropped this run' } as ShopTab]
      : []),
    {
      id: 'bank',
      label: 'Bank',
      // The gold marker the world map stamps on a bank booth — what a player
      // already reads as "bank" before anyone explains an interface to them.
      icon: ASSETS.misc.map_bank,
      badge: ui.bank.length,
      disabled: ui.waveActive,
      title: ui.waveActive ? 'Only between waves' : ui.bankOpen ? 'Close the bank' : 'Everything stored',
    },
  ];

  const onTab = (id: string) => {
    setMenu(null);
    // The bank stone is a switch for its window, not a page: pressing it again
    // closes the window, and this panel stays on the page it was showing.
    if (id === 'bank') { if (ui.bankOpen) onCloseBank(); else onOpenBank(); return; }
    setPage(id === 'lootbag' ? 'lootbag' : 'inventory');
  };

  /** The 28 slots, at the client's metrics. `rs-inv-page` marks the page that is
   *  *only* the backpack, so the panel around it can shrink to the grid. */
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
              count={s.count}
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
  if (page === 'lootbag' && showLootBag) {
    return (
      <ShopFrame tabs={tabs} activeTab="lootbag" onTab={onTab}>
        <LootBagView
          bag={ui.lootBag}
          towers={towers}
          hoverTowerId={hoverTowerId}
          onHoverTower={onHoverTower}
          onEquip={onEquipGear}
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
 * The lines OSRS would put on that stack, and only those: a herb is consumed, a
 * potion is drunk, and either grows a Brew line for every recipe it can finish
 * right now. A recipe the run cannot pay for — the level, the second ingredient,
 * the coins — is not a greyed line here; the Herblore bench is where a locked
 * potion is read.
 *
 * Every action is a between-waves one, so during a fight the lines stay and grey
 * out rather than vanishing: the option existing is what says it will be back once
 * the wave is over.
 */
function stackOptions(
  stack: UiStack,
  ui: UIState,
  onUseHerb: (id: SeedId) => void,
  onBrewPotion: (id: PotionId) => void,
  onDrinkPotion: (id: PotionId) => void,
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
  return out;
}
