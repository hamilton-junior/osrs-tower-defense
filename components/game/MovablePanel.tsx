'use client';

import React, { CSSProperties, useCallback, useEffect, useRef, useState } from 'react';

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
/** Keep a panel's drag offset within the viewport: given the panel's untransformed
 *  top-left (`base*`) and size, clamp `(nx, ny)` so the panel stays on screen (with
 *  an 8px margin). Falls back gracefully when the panel is larger than the viewport. */
function clampOffset(
  nx: number, ny: number,
  baseLeft: number, baseTop: number, w: number, h: number,
): { x: number; y: number } {
  const m = 8;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const minX = m - baseLeft;
  const maxX = vw - m - w - baseLeft;
  const minY = m - baseTop;
  const maxY = vh - m - h - baseTop;
  return {
    x: Math.min(Math.max(nx, minX), Math.max(minX, maxX)),
    y: Math.min(Math.max(ny, minY), Math.max(minY, maxY)),
  };
}

export function MovablePanel({ id, className, style, globalLock = false, tut, children }: Props) {
  const [offset, setOffset] = useState(() => load(`ui_pos_${id}`, { x: 0, y: 0 }));
  const [locked, setLocked] = useState(() => load(`ui_lock_${id}`, false));
  const el = useRef<HTMLDivElement>(null);
  const drag = useRef<{ sx: number; sy: number; ox: number; oy: number; baseLeft: number; baseTop: number; w: number; h: number } | null>(null);

  useEffect(() => save(`ui_pos_${id}`, offset), [id, offset]);
  useEffect(() => save(`ui_lock_${id}`, locked), [id, locked]);

  // A persisted offset (saved on a larger window, or before a zoom change) can
  // leave a panel partly off-screen on load — pull it back into view once mounted.
  useEffect(() => {
    const node = el.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    const baseLeft = rect.left - offset.x;
    const baseTop = rect.top - offset.y;
    const c = clampOffset(offset.x, offset.y, baseLeft, baseTop, rect.width, rect.height);
    if (c.x !== offset.x || c.y !== offset.y) setOffset(c);
    // Run once on mount; drag handlers keep it in bounds thereafter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const canDrag = !globalLock && !locked;

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (!canDrag || e.button !== 0) return;
    // Don't start a drag from interactive controls inside the panel.
    if ((e.target as HTMLElement).closest('button, input, select, a, [data-no-drag]')) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    drag.current = {
      sx: e.clientX, sy: e.clientY, ox: offset.x, oy: offset.y,
      baseLeft: rect.left - offset.x, baseTop: rect.top - offset.y, w: rect.width, h: rect.height,
    };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }, [canDrag, offset]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const nx = d.ox + (e.clientX - d.sx);
    const ny = d.oy + (e.clientY - d.sy);
    // Constrain to the viewport so a panel can never be dragged off the playable area.
    setOffset(clampOffset(nx, ny, d.baseLeft, d.baseTop, d.w, d.h));
  }, []);

  const endDrag = useCallback(() => { drag.current = null; }, []);

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
      className={className}
      data-tut={tut}
      style={{ ...style, transform: `translate(${offset.x}px, ${offset.y}px)`, cursor: canDrag ? 'move' : undefined }}
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
