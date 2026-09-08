'use client';

import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/** `calc(base * var(--ui-scale, 1))` — the hookup every panel in `GameRoot` uses
 *  (`fs()` there), repeated here so this file has no import cycle back into it.
 *  Only the menu's *root* font-size needs it; everything inside is plain `em`. */
const fs = (base: string) => `calc(${base} * var(--ui-scale, 1))`;

export interface MenuOption {
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
  title?: string;
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
 * Only lines that mean something right now are listed — that is the whole point
 * of the menu over a row of buttons. A recipe the run cannot finish is not a
 * greyed line here; it is a rung on the Herblore bench.
 */
export function OptionMenu({ x, y, options, onClose }: OptionMenuProps) {
  const [mounted, setMounted] = useState(false);
  const [pos, setPos] = useState({ left: x, top: y });
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
          onClick={() => { o.onSelect(); onClose(); }}
        >
          <span>{o.action}</span>
          {o.target && <span className="rs-menu-target"> {o.target}</span>}
          {o.disabled && o.note && <span className="rs-menu-why"> — {o.note}</span>}
        </button>
      ))}
      <button type="button" role="menuitem" className="rs-menu-row" onClick={onClose}>
        Cancel
      </button>
    </div>,
    document.body,
  );
}
