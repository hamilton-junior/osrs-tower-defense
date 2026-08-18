'use client';

import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/** `calc(base * var(--ui-scale, 1))` — the same UI-scale hookup every panel in
 *  `GameRoot` uses (`fs()` there), duplicated here so this file has no import
 *  cycle back into it. Only the bubble's *root* font-size needs this; every
 *  other size inside the bubble is a plain `em` against that root, which is
 *  what actually makes the whole thing track the UI −/+ control. */
const fs = (base: string) => `calc(${base} * var(--ui-scale, 1))`;

export interface HoverTipProps {
  /** Tooltip body: a plain string for simple prose, or composed JSX (a header
   *  row + description, an icon, colour). Falsy content (e.g. an empty gear
   *  slot with nothing equipped) means nothing to show — the trigger still
   *  renders, just inert. */
  content: React.ReactNode;
  /** The trigger — exactly one element (a `<button>`, `<span>`, `<div>` …).
   *  Its own onMouseEnter/Leave/Focus/Blur, if any, still fire — HoverTip
   *  composes with them rather than replacing them. Must not already carry a
   *  `ref` of its own (none of this file's call sites need one). */
  children: React.ReactElement<any>;
  /** Preferred side; flips to the other side automatically when the preferred
   *  side doesn't have room. @default 'top' */
  side?: 'top' | 'bottom';
  /** Force the bubble open regardless of hover/focus — the wave-event chip
   *  uses this to self-narrate for a few seconds when a wave starts. */
  show?: boolean;
  /** Bubble max-width, in em against the bubble's own (UI-scaled) font-size.
   *  @default 16 */
  widthEm?: number;
}

let idSeed = 0;

/**
 * The game's one hover/keyboard-focus tooltip. Wraps a single trigger element
 * and, on hover or focus, shows an `.rs-panel`-styled bubble with `content`.
 *
 * The bubble is rendered through `createPortal` straight onto `document.body`,
 * positioned in JS from the trigger's own `getBoundingClientRect()` — not as a
 * CSS-anchored `position: absolute` child of the trigger. That matters here:
 * several trigger sites in `GameRoot` live inside a scrolling `overflow-y-auto`
 * panel (the gear-slot picker dropdown, the loot-bag list, the essence/slayer
 * tab body …), and `overflow-y-auto` clips any `position: absolute` descendant
 * that spills past its own box — a CSS-anchored bubble would be cut off right
 * where it's needed most (a 13em-wide gear picker showing a multi-line
 * tooltip). Measuring the trigger's rect and painting the bubble as
 * `position: fixed` on `document.body` sidesteps that clip entirely, and also
 * sidesteps `MovablePanel`'s always-on `transform` (a `transform` on an
 * ancestor re-anchors `position: fixed` descendants to *that* ancestor instead
 * of the viewport — painting onto `document.body` keeps the math in plain
 * viewport coordinates regardless of which panel, moved or not, the trigger
 * happens to be inside).
 */
export function HoverTip({ content, children, side = 'top', show = false, widthEm = 16 }: HoverTipProps) {
  const [hover, setHover] = useState(false);
  const [focus, setFocus] = useState(false);
  const [mounted, setMounted] = useState(false);
  const triggerRef = useRef<HTMLElement | null>(null);
  const bubbleRef = useRef<HTMLDivElement | null>(null);
  const [style, setStyle] = useState<React.CSSProperties>({ position: 'fixed', top: 0, left: 0, visibility: 'hidden' });
  const idRef = useRef<string | null>(null);
  if (idRef.current == null) idRef.current = `hovertip-${++idSeed}`;

  // Portals touch `document`, which doesn't exist during the static export's
  // server-side prerender — defer them to after mount.
  useEffect(() => setMounted(true), []);

  const open = !!content && (show || hover || focus);

  useLayoutEffect(() => {
    if (!open) return;
    const reposition = () => {
      const t = triggerRef.current;
      const b = bubbleRef.current;
      if (!t || !b) return;
      const tr = t.getBoundingClientRect();
      const br = b.getBoundingClientRect();
      const gap = 8;
      const margin = 6;
      const spaceAbove = tr.top;
      const spaceBelow = window.innerHeight - tr.bottom;
      // Flip to whichever side actually has room, preferring the caller's side.
      let placement = side;
      if (placement === 'top' && spaceAbove < br.height + gap && spaceBelow > spaceAbove) placement = 'bottom';
      if (placement === 'bottom' && spaceBelow < br.height + gap && spaceAbove > spaceBelow) placement = 'top';
      let top = placement === 'top' ? tr.top - gap - br.height : tr.bottom + gap;
      top = Math.max(margin, Math.min(top, window.innerHeight - br.height - margin));
      let left = tr.left + tr.width / 2 - br.width / 2;
      left = Math.max(margin, Math.min(left, window.innerWidth - br.width - margin));
      setStyle({ position: 'fixed', top, left, visibility: 'visible' });
    };
    reposition();
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    // The trigger can also move with nothing scrolling or resizing: a MovablePanel
    // dragged under the pointer, a panel that grew a section, the UI-scale control.
    // Follow it — one rAF while a bubble is open, doing nothing until the rect
    // actually changes, is cheaper than the bubble sitting somewhere stale.
    let raf = 0;
    let last = '';
    const follow = () => {
      const t = triggerRef.current;
      if (t) {
        const r = t.getBoundingClientRect();
        const key = `${r.top}|${r.left}|${r.width}|${r.height}`;
        if (key !== last) { last = key; reposition(); }
      }
      raf = requestAnimationFrame(follow);
    };
    raf = requestAnimationFrame(follow);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
    };
  }, [open, side]);

  const childProps = children.props as Record<string, unknown>;
  const prevEnter = childProps.onMouseEnter as ((e: React.MouseEvent) => void) | undefined;
  const prevLeave = childProps.onMouseLeave as ((e: React.MouseEvent) => void) | undefined;
  const prevMove = childProps.onMouseMove as ((e: React.MouseEvent) => void) | undefined;
  const prevFocus = childProps.onFocus as ((e: React.FocusEvent) => void) | undefined;
  const prevBlur = childProps.onBlur as ((e: React.FocusEvent) => void) | undefined;

  const trigger = React.cloneElement(children, {
    ref: (node: HTMLElement | null) => { triggerRef.current = node; },
    tabIndex: (childProps.tabIndex as number | undefined) ?? 0,
    'aria-describedby': open ? idRef.current : (childProps['aria-describedby'] as string | undefined),
    onMouseEnter: (e: React.MouseEvent) => { prevEnter?.(e); setHover(true); },
    // A trigger can appear *under* a pointer that never moves — the wave-event
    // chip mounts when a wave starts, right where the cursor already is. No
    // mouseenter fires for that, so the bubble would refuse to open until the
    // pointer left and came back. Any movement over the trigger recovers it.
    onMouseMove: (e: React.MouseEvent) => { prevMove?.(e); setHover(true); },
    onMouseLeave: (e: React.MouseEvent) => { prevLeave?.(e); setHover(false); },
    // Focus opens the bubble for *keyboard* users only. A plain click also focuses
    // the trigger, and treating that as intent pinned the bubble open until you
    // clicked somewhere else — exactly what happens when a slot in the loot bag is
    // clicked to open its picker. `:focus-visible` is the browser's own answer to
    // "was this focus keyboard-driven"; older engines that don't know the selector
    // throw, and fall back to the old behaviour.
    onFocus: (e: React.FocusEvent) => {
      prevFocus?.(e);
      let keyboard = true;
      try { keyboard = (e.target as HTMLElement).matches(':focus-visible'); } catch { /* older engine */ }
      if (keyboard) setFocus(true);
    },
    onBlur: (e: React.FocusEvent) => { prevBlur?.(e); setFocus(false); },
  });

  return (
    <>
      {trigger}
      {mounted && open && createPortal(
        <div
          ref={bubbleRef}
          role="tooltip"
          id={idRef.current ?? undefined}
          className="rs-panel"
          style={{
            ...style,
            zIndex: 2000,
            pointerEvents: 'none',
            padding: '0.45em 0.6em',
            maxWidth: `${widthEm}em`,
            width: 'max-content',
            fontSize: fs('clamp(13px, 0.85vw, 18px)'),
            lineHeight: 1.35,
            textAlign: 'left',
          }}
        >
          {content}
        </div>,
        document.body,
      )}
    </>
  );
}
