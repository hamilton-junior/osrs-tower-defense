'use client';

import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/** `calc(base * var(--ui-scale, 1))` — the UI-scale hookup every panel uses
 *  (`fs()` in GameRoot), duplicated here so this file has no import cycle back
 *  into it. Only the flyout's root needs it; everything inside is plain `em`. */
const fs = (base: string) => `calc(${base} * var(--ui-scale, 1))`;

export interface VolumeControlProps {
  volume: number;
  muted: boolean;
  onVolume: (v: number) => void;
  onToggleMute: () => void;
}

/**
 * The bar's sound control: a mute button with the volume slider parked above it,
 * the way the Windows tray does it — the slider is out of the way until you reach
 * for the icon, which is what keeps that width free for more buttons.
 *
 * The flyout is portalled onto `document.body` and positioned from the button's
 * own rect, exactly like `HoverTip`. It has to be: the bar's control group is
 * `overflow-hidden` (it clips itself rather than painting over the gold pile at a
 * large interface scale), and a `position: absolute` popup rising out of that box
 * is cut off entirely — the first cut of this control was invisible for that one
 * reason. Unlike HoverTip's bubble this panel is *interactive*, so it takes
 * pointer events and keeps itself open while the pointer is on it.
 *
 * Three things hold it open, and all three are the same intent: the pointer over
 * the button, the pointer over the flyout, and a drag in progress — a knob drag
 * wanders off the panel constantly, and losing the slider from under your own hand
 * is worse than any space it costs. Leaving closes it after a short grace, so the
 * gap between button and panel isn't a trapdoor.
 */
export function VolumeControl({ volume, muted, onVolume, onToggleMute }: VolumeControlProps) {
  const [hover, setHover] = useState(false);
  const [drag, setDrag] = useState(false);
  const [mounted, setMounted] = useState(false);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const popRef = useRef<HTMLDivElement | null>(null);
  const closeAt = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [style, setStyle] = useState<React.CSSProperties>({ position: 'fixed', top: 0, left: 0, visibility: 'hidden' });

  // Portals touch `document`, which doesn't exist during the static export's
  // prerender — defer to after mount.
  useEffect(() => setMounted(true), []);

  const open = hover || drag;

  const stayOpen = () => {
    if (closeAt.current) { clearTimeout(closeAt.current); closeAt.current = null; }
    setHover(true);
  };
  const leave = () => {
    if (closeAt.current) clearTimeout(closeAt.current);
    closeAt.current = setTimeout(() => setHover(false), 180);
  };
  useEffect(() => () => { if (closeAt.current) clearTimeout(closeAt.current); }, []);

  // A drag ends wherever the pointer happens to be, including off the panel and
  // off the window — so the release is watched at the window, not on the input.
  useEffect(() => {
    if (!drag) return;
    const up = () => setDrag(false);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, [drag]);

  useLayoutEffect(() => {
    if (!open) { setStyle(s => ({ ...s, visibility: 'hidden' })); return; }
    const place = () => {
      const b = btnRef.current;
      const p = popRef.current;
      if (!b || !p) return;
      const br = b.getBoundingClientRect();
      const pr = p.getBoundingClientRect();
      const gap = 8;
      const margin = 6;
      // Above the button, centred on it, and never off the edge of the screen.
      const top = Math.max(margin, br.top - gap - pr.height);
      const left = Math.max(margin, Math.min(br.left + br.width / 2 - pr.width / 2, window.innerWidth - pr.width - margin));
      setStyle({ position: 'fixed', top, left, visibility: 'visible' });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open]);

  return (
    <>
      <button
        ref={btnRef}
        onClick={onToggleMute}
        onMouseEnter={stayOpen}
        onMouseMove={stayOpen}
        onMouseLeave={leave}
        onFocus={stayOpen}
        onBlur={leave}
        title={muted ? 'Unmute (M)' : 'Mute (M)'}
        className="rs-btn relative px-[0.66em] py-[0.33em] text-[0.7em] ml-[0.33em]"
      >
        {muted ? '🔇' : '🔊'}
        <span className="rs-key">M</span>
      </button>
      {mounted && open && createPortal(
        <div
          ref={popRef}
          onMouseEnter={stayOpen}
          onMouseLeave={leave}
          className="rs-panel flex items-center gap-[0.5em]"
          style={{
            ...style,
            zIndex: 2000,
            padding: '0.4em 0.6em',
            width: 'max-content',
            fontSize: fs('clamp(13px, 0.85vw, 18px)'),
          }}
        >
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={muted ? 0 : volume}
            onChange={(e) => onVolume(Number(e.target.value))}
            onPointerDown={() => setDrag(true)}
            title={`Volume ${Math.round(volume * 100)}%`}
            className="rs-volume w-[7em]"
            aria-label="Volume"
          />
          <span
            className="text-[0.7em] text-osrs-orange tabular-nums w-[2.7em] text-right select-none"
            title="Current volume"
          >
            {muted ? 'off' : `${Math.round(volume * 100)}%`}
          </span>
        </div>,
        document.body,
      )}
    </>
  );
}
