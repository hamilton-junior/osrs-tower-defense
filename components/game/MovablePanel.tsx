'use client';

import React, { CSSProperties, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { boundsReady, fitPanelOffset, type PanelBox } from '@/lib/game/systems/panel-fit';

function load<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const v = window.localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}

function save(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

interface Props {
  /** Stable id used to persist this panel's drag offset + lock. */
  id: string;
  className?: string;
  style?: CSSProperties;
  /** When true (global UI lock), the panel can't be dragged. */
  globalLock?: boolean;
  /** Optional `data-tut` marker so the guided tour can spotlight this panel. */
  tut?: string;
  children: React.ReactNode;
}

/**
 * Wraps an absolutely-positioned panel and makes it draggable: drag from any
 * empty part of the panel (interactive controls are excluded), right-click to
 * snap it back to its original spot, and a small pin in the corner locks just
 * this panel. A global lock (passed in) disables dragging for everything. The
 * per-panel offset and lock persist in localStorage.
 */
/** The nearest ancestor that clips what overflows it, or null when only the window does. */
function clipOf(node: HTMLElement): HTMLElement | null {
  for (let n = node.parentElement; n && n !== document.body; n = n.parentElement) {
    const cs = getComputedStyle(n);
    if (cs.overflowX !== 'visible' || cs.overflowY !== 'visible') return n;
  }
  return null;
}

/** What can show a panel: its clipping ancestor's box, cut to the window. A board
 *  panel is clipped by the board's area, so the window alone is not enough — a
 *  panel below the board's bottom edge is still on screen, and invisible. */
function boundsOf(clip: HTMLElement | null): PanelBox {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  if (!clip) return { left: 0, top: 0, width: vw, height: vh };
  const r = clip.getBoundingClientRect();
  const left = Math.max(0, r.left);
  const top = Math.max(0, r.top);
  return { left, top, width: Math.min(vw, r.right) - left, height: Math.min(vh, r.bottom) - top };
}

/**
 * Did this pointer land on an element's native scrollbar rather than its content?
 *
 * A scrollbar drag is reported against the *scrolling element itself*, so it looks
 * exactly like a press on an ordinary panel background — nothing in the event says
 * "scrollbar". The one thing that separates them is where it landed: `clientWidth`
 * and `clientHeight` stop at the padding box, and the scrollbar gutter sits outside
 * it. Without this check, dragging the Collection Log's scrollbar dragged the whole
 * window instead of scrolling it.
 */
function onScrollbar(target: HTMLElement, clientX: number, clientY: number): boolean {
  if (target.scrollWidth <= target.clientWidth && target.scrollHeight <= target.clientHeight) return false;
  const r = target.getBoundingClientRect();
  return clientX - r.left > target.clientWidth || clientY - r.top > target.clientHeight;
}

export function MovablePanel({ id, className, style, globalLock = false, tut, children }: Props) {
  // Where the player put the panel — the only offset saved.
  const [offset, setOffset] = useState(() => load(`ui_pos_${id}`, { x: 0, y: 0 }));
  // Where it is drawn: that offset, pulled back inside what can show it.
  const [shown, setShown] = useState(offset);
  const shownRef = useRef(shown);
  shownRef.current = shown;
  const [locked, setLocked] = useState(() => load(`ui_lock_${id}`, false));
  const el = useRef<HTMLDivElement>(null);
  const drag = useRef<{ sx: number; sy: number; ox: number; oy: number; base: PanelBox; bounds: PanelBox } | null>(null);

  useEffect(() => save(`ui_pos_${id}`, offset), [id, offset]);
  useEffect(() => save(`ui_lock_${id}`, locked), [id, locked]);

  // Fit the saved offset to the room the panel has now, and again whenever that
  // room changes: a window resize, a zoom, or the board being sized at all. The
  // board has no height on the first render, so a fit made then would push every
  // bottom-anchored panel down by the board's height — and it once did, and saved
  // it, which hid the prayer bar under the board's edge for good. Only the drawn
  // offset is fitted; the saved one changes only when the player drags.
  useLayoutEffect(() => {
    const node = el.current;
    if (!node) return;
    const clip = clipOf(node);
    const refit = () => {
      const bounds = boundsOf(clip);
      if (!boundsReady(bounds)) return;
      const r = node.getBoundingClientRect();
      const cur = shownRef.current;
      const base = { left: r.left - cur.x, top: r.top - cur.y, width: r.width, height: r.height };
      const next = fitPanelOffset(offset, base, bounds);
      setShown((prev) => (prev.x === next.x && prev.y === next.y ? prev : next));
    };
    refit();
    const ro = new ResizeObserver(refit);
    ro.observe(node);
    if (clip) ro.observe(clip);
    window.addEventListener('resize', refit);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', refit);
    };
  }, [offset]);

  const canDrag = !globalLock && !locked;

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (!canDrag || e.button !== 0) return;
    // Don't start a drag from interactive controls inside the panel.
    if ((e.target as HTMLElement).closest('button, input, select, a, [data-no-drag]')) return;
    // …nor from a scrollbar: that press belongs to the scroll area, not the panel.
    if (onScrollbar(e.target as HTMLElement, e.clientX, e.clientY)) return;
    const node = e.currentTarget as HTMLElement;
    const rect = node.getBoundingClientRect();
    const cur = shownRef.current;
    drag.current = {
      sx: e.clientX, sy: e.clientY, ox: cur.x, oy: cur.y,
      base: { left: rect.left - cur.x, top: rect.top - cur.y, width: rect.width, height: rect.height },
      bounds: boundsOf(clipOf(node)),
    };
    node.setPointerCapture(e.pointerId);
  }, [canDrag]);

  // Chrome hands the page one pointermove per hardware sample, so a 1000 Hz mouse
  // re-rendered this panel a thousand times a second while it was being dragged;
  // Firefox folds them onto the frame first, which is why the same drag only ever
  // stuttered on Chrome. Keep the latest sample and move the panel once a frame —
  // it can only be painted that often anyway.
  const sample = useRef<{ cx: number; cy: number } | null>(null);
  const raf = useRef(0);

  const applyDrag = useCallback(() => {
    raf.current = 0;
    const d = drag.current;
    const s = sample.current;
    sample.current = null;
    if (!d || !s) return;
    // Constrain to what can show it, so a panel can never be dragged out of sight.
    const next = fitPanelOffset({ x: d.ox + (s.cx - d.sx), y: d.oy + (s.cy - d.sy) }, d.base, d.bounds);
    setOffset(next);
    setShown(next);
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!drag.current) return;
    sample.current = { cx: e.clientX, cy: e.clientY };
    if (!raf.current) raf.current = requestAnimationFrame(applyDrag);
  }, [applyDrag]);

  const endDrag = useCallback(() => {
    // Spend the sample the pending frame was going to use, so the panel ends up
    // where the pointer was released rather than a frame short of it.
    if (raf.current) { cancelAnimationFrame(raf.current); applyDrag(); }
    drag.current = null;
    sample.current = null;
  }, [applyDrag]);

  const onContextMenu = useCallback((e: React.MouseEvent) => {
    // Right-click anywhere on the panel snaps it back to its anchor.
    e.preventDefault();
    e.stopPropagation();
    setOffset({ x: 0, y: 0 });
  }, []);

  const moved = offset.x !== 0 || offset.y !== 0;

  return (
    <div
      ref={el}
      // The panel itself always captures pointer events, wherever it is currently
      // drawn (moved or not). Its anchor wrappers are `pointer-events-none`, so the
      // empty box the wrapper keeps at the original spot never blocks the board —
      // only the visible panel does. Without this the wrapper's ghost ate clicks at
      // the anchor (couldn't place towers under a moved-away panel; worst at the top).
      className={className ? `${className} pointer-events-auto` : 'pointer-events-auto'}
      data-tut={tut}
      style={{ ...style, transform: `translate(${shown.x}px, ${shown.y}px)`, cursor: canDrag ? 'move' : undefined }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onContextMenu={onContextMenu}
    >
      {!globalLock && (
        <button
          data-no-drag
          onClick={() => setLocked((l) => !l)}
          title={locked ? 'Unlock this panel' : 'Lock this panel'}
          className="absolute -top-2 -right-2 z-10 w-5 h-5 flex items-center justify-center rounded-full border border-[#1b1712] bg-[#2b231a] text-[11px] leading-none opacity-70 hover:opacity-100"
        >
          {locked ? '🔒' : '📌'}
        </button>
      )}
      {moved && !globalLock && !locked && (
        <span className="absolute -bottom-4 left-1/2 -translate-x-1/2 text-[9px] text-[#b3a585] whitespace-nowrap pointer-events-none">
          right-click to reset
        </span>
      )}
      {children}
    </div>
  );
}
