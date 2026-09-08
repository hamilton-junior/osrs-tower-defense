'use client';

import React, { useMemo, useState } from 'react';
import { ASSETS } from '@/lib/game/assets';
import type { UIState } from '@/lib/game/core/engine';
import { stackKey, type StackKind } from '@/lib/game/systems/inventory';
import { MovablePanel } from './MovablePanel';
import { fs, InvGrid, ItemSlot, type ShopQty } from './ui-kit';

/**
 * The **bank**, drawn the way the client draws it.
 *
 * It is a window of its own, because that is what a bank is in OSRS: the booth
 * opens its own framed panel over the world, with the backpack carried inside it,
 * and none of it belongs to the interface tabs along the bottom of the screen. So
 * it is a {@link MovablePanel} like every other panel that floats over the board —
 * draggable, pinnable, right-click to snap it back.
 *
 * Every piece of chrome here is OSRS's own sprite at its native size: the tab
 * plates the categories sit on, the rounded plates under the quantity row, the
 * chest that deposits everything carried, and the X that closes the window. The
 * layout is the client's too — counts top-left, the bank's name across the middle,
 * the stored stacks eight to a row, the quantity buttons beneath them, and what
 * the run carries underneath all of it.
 *
 * One thing here has no sprite behind it, because the client has none either: the
 * ground under the stored grid. OSRS draws that area flat and stamps the icons on
 * top, so stretching the backpack's leather panel across eight columns would be
 * inventing a sprite by distorting one. The flat ground is the faithful answer;
 * the backpack below keeps its real panel and its posts.
 *
 * The tabs are not decoration. A bank tab shows only what it holds — herbs,
 * potions — and a category with nothing in it is not drawn at all, so every tab
 * icon on screen is a real stack's own current icon.
 *
 * One quantity serves both directions: a click in the stored grid withdraws, a
 * click in the backpack deposits. No drag, no menu.
 */

type BankTab = 'all' | StackKind;

export interface BankWindowProps {
  ui: UIState;
  onWithdraw: (kind: StackKind, id: string, qty: ShopQty) => void;
  onDeposit: (kind: StackKind, id: string, qty: ShopQty) => void;
  onClose: () => void;
  globalLock: boolean;
}

/** How many squares of ground the grid always draws, full or not: four rows, the
 *  way an empty bank still looks like a bank rather than a strip of wood. */
const MIN_CELLS = 32;

export function BankWindow({ ui, onWithdraw, onDeposit, onClose, globalLock }: BankWindowProps) {
  const [tab, setTab] = useState<BankTab>('all');
  // How much a click moves. It lives here rather than in the inventory: it is this
  // window's own control, and it dies with the window.
  const [qty, setQty] = useState<ShopQty>(1);
  // What the X button holds, kept separately so typing in it does not fight the
  // preset that is currently lit.
  const [custom, setCustom] = useState(50);

  const free = useMemo(() => ui.inventory.reduce((n, s) => n + (s ? 0 : 1), 0), [ui.inventory]);

  const kinds = useMemo(() => {
    const out: { kind: StackKind; icon: string; label: string }[] = [];
    for (const k of ['herb', 'potion'] as StackKind[]) {
      const first = ui.bank.find((s) => s.kind === k);
      if (first) out.push({ kind: k, icon: first.icon, label: k === 'herb' ? 'Herbs' : 'Potions' });
    }
    return out;
  }, [ui.bank]);

  // A tab whose category empties out would otherwise leave the window showing an
  // empty grid with no way back, so the view falls to All.
  const active: BankTab = tab !== 'all' && !kinds.some((k) => k.kind === tab) ? 'all' : tab;
  const shown = active === 'all' ? ui.bank : ui.bank.filter((s) => s.kind === active);
  const cells = Math.max(MIN_CELLS, Math.ceil(shown.length / 8) * 8);

  const depositAll = () => {
    // One stack can hold more than one slot, so the same key would be deposited
    // twice — and the second call would move a stack that is already home.
    const done = new Set<string>();
    for (const s of ui.inventory) {
      if (!s) continue;
      const key = stackKey(s.kind, s.id);
      if (done.has(key)) continue;
      done.add(key);
      onDeposit(s.kind, s.id, 'all');
    }
  };

  return (
    <MovablePanel
      id="bank"
      globalLock={globalLock}
      className="rs-panel absolute top-8 left-1/2 z-30 p-[0.6em]"
      style={{ marginLeft: 'calc(-181px * var(--ui-scale, 1))', fontSize: fs('clamp(13px, 0.85vw, 18px)') }}
    >
      <div
        className="rs-bank"
        style={{
          '--rs-bank-tab': `url(${ASSETS.misc.bank_tab})`,
          '--rs-bank-tab-on': `url(${ASSETS.misc.bank_tab_on})`,
          '--rs-bank-btn': `url(${ASSETS.misc.bank_button})`,
          '--rs-bank-btn-on': `url(${ASSETS.misc.bank_button_on})`,
          '--rs-close': `url(${ASSETS.misc.window_close})`,
          '--rs-close-on': `url(${ASSETS.misc.window_close_on})`,
        } as React.CSSProperties}
      >
        <div className="rs-bank-head">
          <span className="rs-bank-count" title="Stacks stored, and free backpack slots">
            <b>{ui.bank.length}</b>
            <i>{free}</i>
          </span>
          <span className="rs-bank-name">The Bank of Gielinor</span>
          <button type="button" className="rs-bank-close" title="Close bank" aria-label="Close bank" onClick={onClose} />
        </div>

        <div className="rs-bank-tabs">
          <button
            type="button"
            className={`rs-bank-tab${active === 'all' ? ' rs-bank-tab-on' : ''}`}
            title="Everything stored"
            onClick={() => setTab('all')}
          >
            <img src={ASSETS.misc.map_bank} alt="All" />
          </button>
          {kinds.map(({ kind, icon, label }) => (
            <button
              key={kind}
              type="button"
              className={`rs-bank-tab${active === kind ? ' rs-bank-tab-on' : ''}`}
              title={label}
              onClick={() => setTab(kind)}
            >
              <img src={icon} alt={label} />
            </button>
          ))}
        </div>

        <div className="rs-bank-scroll">
          <div className="rs-bank-grid">
            {Array.from({ length: cells }, (_, i) => {
              const s = shown[i];
              return s
                ? (
                  <ItemSlot
                    key={stackKey(s.kind, s.id)}
                    osrs
                    icon={s.icon}
                    name={s.name}
                    count={s.count}
                    title={`Withdraw ${s.name} — ${s.tip}`}
                    onClick={() => onWithdraw(s.kind, s.id, qty)}
                  />
                )
                : <ItemSlot key={`e${i}`} osrs />;
            })}
          </div>
        </div>

        <div className="rs-bank-foot">
          <button
            type="button"
            className="rs-bank-dep"
            title="Deposit everything carried"
            onClick={depositAll}
          >
            <img src={ASSETS.misc.bank_deposit} alt="Deposit all" />
          </button>
          {([1, 5, 10] as const).map((n) => (
            <button
              key={n}
              type="button"
              className={`rs-bank-btn${qty === n ? ' rs-bank-btn-on' : ''}`}
              title={`Move ${n} at a time`}
              onClick={() => setQty(n)}
            >
              {n}
            </button>
          ))}
          <button
            type="button"
            className={`rs-bank-btn${qty === custom ? ' rs-bank-btn-on' : ''}`}
            title="Move the typed amount"
            onClick={() => setQty(custom)}
          >
            X
          </button>
          <input
            type="number"
            min={1}
            className="rs-num"
            style={{ width: 'calc(42px * var(--ui-scale, 1))' }}
            value={custom}
            title="How many X moves"
            onChange={(e) => {
              const n = Math.max(1, Math.floor(Number(e.target.value) || 1));
              setCustom(n);
              if (typeof qty === 'number' && qty !== 1 && qty !== 5 && qty !== 10) setQty(n);
            }}
          />
          <button
            type="button"
            className={`rs-bank-btn${qty === 'all' ? ' rs-bank-btn-on' : ''}`}
            title="Move the whole stack"
            onClick={() => setQty('all')}
          >
            All
          </button>
        </div>

        {/* The window's bottom half: the same twenty-eight slots the Inventory page
            draws, on the client's own panel between its own posts. A click here
            deposits, so there is no Choose Option menu on these squares. */}
        <InvGrid
          background={ASSETS.misc.inventory_background}
          postLeft={ASSETS.misc.inv_post_left}
          postRight={ASSETS.misc.inv_post_right}
        >
          {ui.inventory.map((s, i) => (
            s
              ? (
                <ItemSlot
                  key={`b${i}`}
                  osrs
                  icon={s.icon}
                  name={s.name}
                  count={s.count}
                  title={`Deposit ${s.name} — ${s.tip}`}
                  onClick={() => onDeposit(s.kind, s.id, qty)}
                />
              )
              : <ItemSlot key={`b${i}`} osrs />
          ))}
        </InvGrid>

        <div className="mt-[0.35em] px-[0.2em] text-[0.72em] text-[#8f8158] leading-snug">
          Click a stored stack to withdraw it, a carried one to deposit it.
        </div>
      </div>
    </MovablePanel>
  );
}
