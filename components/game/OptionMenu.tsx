'use client';

import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { coinsIcon } from '@/lib/game/assets';
import { fmt } from './ui-kit';

/** `calc(base * var(--ui-scale, 1))` — the hookup every panel in `GameRoot` uses
 *  (`fs()` there), repeated here so this file has no import cycle back into it.
 *  Only the menu's *root* font-size needs it; everything inside is plain `em`. */
const fs = (base: string) => `calc(${base} * var(--ui-scale, 1))`;

export interface MenuOption {
  /** A small picture before the verb, for a line that names a thing better shown
   *  than spelled, like the skill a lamp is rubbed for. */
  icon?: string;
  /** The verb, in white — "Drink", "Consume", "Brew". */
  action: string;
  /** What the verb acts on, in the client's item orange. */
  target?: string;
  /** Greyed rather than gone: the line existing is what says the option is real
   *  and merely not available yet. */
  disabled?: boolean;
  /** Why it is greyed, printed after the target so the reason is on screen and
   *  not only in a tooltip a disabled button may never show. */
  note?: string;
  /** What the line pays, printed after the target in brackets. The number comes
   *  first and the coins follow it, the way every price in this interface reads. */
  coins?: number;
  /** Why this line is worth a second click — a few words, printed in red after
   *  **Sure?** until the press that commits. Set it only where the action would
   *  spend something for nothing; every other line stays one click. */
  confirm?: string;
  title?: string;
  /** Leave the menu open after the line runs, for a line whose `onSelect` swaps in
   *  the next set of options rather than doing the thing. */
  keepOpen?: boolean;
  onSelect: () => void;
}

export interface OptionMenuProps {
  /** Where the click landed, in viewport coordinates. */
  x: number;
  y: number;
  options: MenuOption[];
  onClose: () => void;
}

/**
 * OSRS's **Choose Option** menu: the little brown box that opens under the cursor
 * with one line per thing that can be done, and Cancel at the bottom.
 *
 * It is painted through `createPortal` onto `document.body` and positioned in JS
 * from the click's own viewport coordinates, for the two reasons `HoverTip` does
 * the same: the interface it opens over lives inside an `overflow-y-auto` panel,
 * which clips any `position: absolute` descendant that spills past its box, and a
 * `transform` on a `MovablePanel` ancestor would re-anchor a `position: fixed`
 * child to that panel instead of the viewport. On `document.body` the maths stays
 * in plain viewport coordinates either way.
 *
 * Only lines that mean something for this item are listed, which is the whole point
 * of the menu over a row of buttons. A line that is real but blocked right now, like
 * a recipe short of its level, stays greyed with the wall printed after it, so a herb
 * that goes into two potions shows both.
 */
export function OptionMenu({ x, y, options, onClose }: OptionMenuProps) {
  const [mounted, setMounted] = useState(false);
  const [pos, setPos] = useState({ left: x, top: y });
  // Which line is armed, if any. No timer disarms it the way the skills tile's does:
  // this menu is gone the moment the cursor commits anywhere else, so closing already
  // is the disarm.
  const [armed, setArmed] = useState(-1);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => setMounted(true), []);

  // Measured after paint, so a menu opened near the right or bottom edge slides
  // back inside instead of being cut off by the window.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const m = 6;
    setPos({
      left: Math.max(m, Math.min(x, window.innerWidth - r.width - m)),
      top: Math.max(m, Math.min(y, window.innerHeight - r.height - m)),
    });
  }, [x, y, mounted, options.length]);

  // Anything outside the box closes it, the way the client's menu goes away the
  // moment the cursor commits somewhere else. Capture phase, so a click on
  // another slot closes this menu and opens that one in the same event.
  useEffect(() => {
    if (!mounted) return;
    const away = (e: Event) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('mousedown', away, true);
    window.addEventListener('contextmenu', away, true);
    window.addEventListener('keydown', key, true);
    return () => {
      window.removeEventListener('mousedown', away, true);
      window.removeEventListener('contextmenu', away, true);
      window.removeEventListener('keydown', key, true);
    };
  }, [mounted, onClose]);

  // `document` does not exist while the static export is prerendered.
  if (!mounted) return null;

  return createPortal(
    <div
      ref={ref}
      className="rs-menu"
      role="menu"
      style={{ left: pos.left, top: pos.top, fontSize: fs('clamp(12px, 0.78vw, 17px)') }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="rs-menu-title">Choose Option</div>
      {options.map((o, i) => (
        <button
          key={`${o.action}-${o.target ?? i}`}
          type="button"
          role="menuitem"
          disabled={o.disabled}
          title={o.title}
          className="rs-menu-row"
          onClick={() => {
            if (o.confirm && armed !== i) { setArmed(i); return; }
            o.onSelect();
            if (!o.keepOpen) onClose();
          }}
        >
          {o.icon && <img className="rs-menu-icon" src={o.icon} alt="" />}
          <span>{o.action}</span>
          {o.target && <span className="rs-menu-target"> {o.target}</span>}
          {o.coins != null && (
            <span className="rs-menu-coins">
              {' ('}{fmt(o.coins)}
              <img src={coinsIcon(o.coins)} alt="gp" />
              {')'}
            </span>
          )}
          {o.disabled && o.note && <span className="rs-menu-why"> — {o.note}</span>}
          {armed === i && o.confirm && <span className="rs-menu-sure"> — Sure? {o.confirm}</span>}
        </button>
      ))}
      <button type="button" role="menuitem" className="rs-menu-row" onClick={onClose}>
        Cancel
      </button>
    </div>,
    document.body,
  );
}
