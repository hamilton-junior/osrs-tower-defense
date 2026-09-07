'use client';

import React, { useMemo, useState } from 'react';
import { ASSETS } from '@/lib/game/assets';
import type { UIState, UiStack } from '@/lib/game/core/engine';
import type { SeedId } from '@/lib/game/data/farming';
import type { PotionId } from '@/lib/game/data/herblore';
import type { Tower } from '@/lib/game/types';
import { INVENTORY_SLOTS, stackKey, type StackKind } from '@/lib/game/systems/inventory';
import { LootBagView } from './lootbag-ui';
import {
  DetailPane, InvGrid, ItemSlot, QtyBar, ShopFrame, SlotGrid, type ShopQty, type ShopTab,
} from './ui-kit';

/**
 * The **Inventory** interface — twenty-eight slots, a bank behind them, and the
 * loot bag on the third tab.
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
 * The three tabs are three different bags, not three views of one: the inventory
 * holds what gets used, the bank holds the overflow, and the loot bag holds tower
 * gear, which is equipped rather than used and so keeps its own page
 * ({@link LootBagView}) inside this frame.
 *
 * Built out of the shop primitives in `ui-kit` ({@link ShopFrame},
 * {@link SlotGrid}, {@link DetailPane}, {@link QtyBar}) — the same skeleton every
 * OSRS minigame shop wears, so the next shop is a list of items rather than a new
 * screen.
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
  onOpenBank: () => void;
  onCloseBank: () => void;
  onDeposit: (kind: StackKind, id: string, qty: ShopQty) => void;
  onWithdraw: (kind: StackKind, id: string, qty: ShopQty) => void;
  onUseHerb: (id: SeedId) => void;
  onDrinkPotion: (id: PotionId) => void;
}

export function InventoryView(props: InventoryViewProps) {
  const {
    ui, showLootBag, towers, hoverTowerId, onHoverTower, onEquipGear,
    onOpenBank, onCloseBank, onDeposit, onWithdraw,
  } = props;
  // Selection is held by what the stack *is*, not by which slot it sits in: a
  // deposit moves stacks around, and a selection that followed the slot would end
  // up pointing at whatever landed there.
  const [picked, setPicked] = useState<string | null>(null);
  const [qty, setQty] = useState<ShopQty>(1);
  // Which page is showing. The bank is not one of them — it is engine state (a
  // wave may not start with it open), so an open bank overrides this.
  const [page, setPage] = useState<'inventory' | 'lootbag'>('inventory');

  const free = useMemo(() => ui.inventory.reduce((n, s) => n + (s ? 0 : 1), 0), [ui.inventory]);
  const sel = useMemo(
    () => ui.inventory.find((s): s is UiStack => !!s && stackKey(s.kind, s.id) === picked) ?? null,
    [ui.inventory, picked],
  );

  const tabs: ShopTab[] = [
    { id: 'inventory', label: 'Inventory', icon: ASSETS.misc.inventory_icon, title: 'What this run carries' },
    ...(showLootBag
      ? [{ id: 'lootbag', label: 'Loot bag', icon: ASSETS.misc.loot_bag, badge: ui.lootBag.length, title: 'Gear dropped this run' } as ShopTab]
      : []),
    {
      id: 'bank',
      label: 'Bank',
      icon: ASSETS.misc.bank_chest,
      badge: ui.bank.length,
      disabled: ui.waveActive,
      title: ui.waveActive ? 'Only between waves' : 'Everything stored',
    },
  ];

  const onTab = (id: string) => {
    if (id === 'bank') { onOpenBank(); return; }
    if (ui.bankOpen) onCloseBank();
    setPage(id === 'lootbag' ? 'lootbag' : 'inventory');
  };

  /** The 28 slots, at the client's metrics. Both the inventory page and the bank's
   *  bottom half are the same backpack, so they are the same grid. */
  const backpack = (onSlot: (s: UiStack) => void, slotTitle: (s: UiStack) => string, selectable: boolean) => (
    <InvGrid background={ASSETS.misc.inventory_background}>
      {ui.inventory.map((s, i) => (
        s
          ? (
            <ItemSlot
              key={`i${i}`}
              osrs
              icon={s.icon}
              name={s.name}
              count={s.count}
              title={slotTitle(s)}
              selected={selectable && picked === stackKey(s.kind, s.id)}
              onClick={() => onSlot(s)}
            />
          )
          : <ItemSlot key={`i${i}`} osrs />
      ))}
    </InvGrid>
  );

  // ─────────────────────────────── the bank ───────────────────────────────
  // OSRS's own layout: what is stored on top, what is carried underneath, and one
  // quantity serving both directions. A click in the top grid withdraws, a click
  // in the backpack deposits — no drag, no menu.
  if (ui.bankOpen) {
    return (
      <ShopFrame
        icon={ASSETS.misc.bank_chest}
        title="Bank"
        right={`${free}/${INVENTORY_SLOTS} free`}
        tabs={tabs}
        activeTab="bank"
        onTab={onTab}
      >
        <SlotGrid cols={8} maxHeight="11em" label="Bank" right={`${ui.bank.length} stored`}>
          {ui.bank.length === 0
            ? Array.from({ length: 8 }, (_, i) => <ItemSlot key={`e${i}`} />)
            : ui.bank.map((s) => (
              <ItemSlot
                key={stackKey(s.kind, s.id)}
                icon={s.icon}
                name={s.name}
                count={s.count}
                title={`Withdraw ${s.name} — ${s.tip}`}
                onClick={() => onWithdraw(s.kind, s.id, qty)}
              />
            ))}
        </SlotGrid>

        <QtyBar value={qty} onChange={setQty} />

        <div className="flex items-center justify-between gap-2 mt-[0.5em] px-[0.2em] text-[0.78em]">
          <span className="text-[#cdbe91] uppercase tracking-wide">Inventory</span>
          <span className="text-osrs-yellow font-bold">{free} free</span>
        </div>
        {backpack(
          (s) => onDeposit(s.kind, s.id, qty),
          (s) => `Deposit ${s.name} — ${s.tip}`,
          false,
        )}

        <div className="mt-[0.45em] px-[0.2em] text-[0.72em] text-[#8f8158] leading-snug">
          Click the bank to withdraw, the inventory to deposit.
        </div>
        <button type="button" onClick={onCloseBank} className="rs-btn w-full mt-[0.45em] py-[0.3em] text-[0.8em]">
          Close bank
        </button>
      </ShopFrame>
    );
  }

  // ──────────────────────────── the loot bag ─────────────────────────────
  if (page === 'lootbag' && showLootBag) {
    return (
      <ShopFrame
        icon={ASSETS.misc.loot_bag}
        title="Loot bag"
        right={ui.lootBag.length > 0 ? `${ui.lootBag.length} held` : undefined}
        tabs={tabs}
        activeTab="lootbag"
        onTab={onTab}
      >
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
    <ShopFrame
      icon={ASSETS.misc.inventory_icon}
      title="Inventory"
      right={`${free}/${INVENTORY_SLOTS} free`}
      tabs={tabs}
      activeTab="inventory"
      onTab={onTab}
    >
      {backpack(
        (s) => setPicked((cur) => (cur === stackKey(s.kind, s.id) ? null : stackKey(s.kind, s.id))),
        (s) => s.tip,
        true,
      )}

      <DetailPane
        icon={sel?.icon}
        name={sel?.name}
        line={sel?.tip}
        hint="Empty. Harvested herbs and brewed potions land here; a full inventory sends the rest to the bank."
      >
        {sel && <StackActions {...props} stack={sel} />}
      </DetailPane>
    </ShopFrame>
  );
}

/** What can be done with the selected stack. Both actions are between-waves ones,
 *  so both grey out during a fight rather than disappearing — the button staying
 *  put is what says the option exists and is merely not available yet. */
function StackActions({ ui, stack, onUseHerb, onDrinkPotion }: InventoryViewProps & { stack: UiStack }) {
  const blocked = ui.waveActive;
  const why = blocked ? 'Only between waves' : undefined;
  if (stack.kind === 'herb') {
    return (
      <button
        type="button"
        disabled={blocked}
        title={why ?? `Drink ${stack.name} raw: its effect rides the next wave`}
        onClick={() => onUseHerb(stack.id as SeedId)}
        className="rs-btn rs-btn-primary flex-1 py-[0.25em] text-[0.78em]"
      >
        Use
      </button>
    );
  }
  return (
    <button
      type="button"
      disabled={blocked}
      title={why ?? `Drink ${stack.name}`}
      onClick={() => onDrinkPotion(stack.id as PotionId)}
      className="rs-btn rs-btn-primary flex-1 py-[0.25em] text-[0.78em]"
    >
      Drink
    </button>
  );
}
