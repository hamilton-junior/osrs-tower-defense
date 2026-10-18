'use client';

import React, { useEffect, useState } from 'react';
import type { UIState } from '@/lib/game/core/engine';
import { ASSETS } from '@/lib/game/assets';
import { LONG_PRESS_MS, handInUse, pressDrifted, touchHint } from '@/lib/game/systems/touch-input';
import { hideBrokenImg } from './ui-kit';

/**
 * The pieces of the interface that exist for a finger: the line that says how to
 * put down what is in hand (and the way to cancel it, since a touch screen has no
 * right-click), tooltips read by press-and-hold, the ask to turn a phone sideways,
 * and the fullscreen button.
 */

/**
 * The hint over the bar while something is in hand. With a mouse it shows only for
 * a tower, the one thing that is picked from the bar, and right-click cancels. On a
 * touch screen it shows for anything in hand, says that a tap aims and a second tap
 * on the same tile puts it down, and carries the cancel. There it stands at the
 * right end, clear of the tower's tooltip: a tap on the dock opens that tooltip
 * too, and with no pointer to leave the slot it stays up until the next tap.
 */
export function ArmedHint({ ui, touch, onCancel }: {
  ui: UIState;
  touch: boolean;
  onCancel: () => void;
}) {
  const hand = handInUse(ui);
  if (touch ? !hand : !ui.selectedTowerType) return null;
  return (
    <div
      className={`rs-panel absolute bottom-full mb-[0.4em] px-[0.8em] py-[0.25em] z-10 flex items-center gap-[0.6em] ${touch ? 'right-[0.6em]' : 'left-1/2 -translate-x-1/2 pointer-events-none'}`}
    >
      <p className="text-[0.72em] text-[#d3c3a0] whitespace-nowrap">
        {touch && hand
          ? touchHint(hand)
          : ui.selectedTowerType === 'wizard'
            ? 'Click a tile to choose its spellbook there · right‑click to cancel'
            : 'Click the map to place · right‑click to cancel'}
      </p>
      {touch && (
        <button className="rs-btn px-[0.7em] py-[0.2em] text-[0.72em]" onClick={onCancel} title="Put it back">
          ✕ Cancel
        </button>
      )}
    </div>
  );
}

/**
 * A finger's tooltip: hold on anything that carries a `title` and its text comes up
 * above the finger. Browsers show `title` only on mouse hover, so on a touch screen
 * every one of those explanations was out of reach. The tap that the lift would
 * have made is swallowed, so reading a button's tooltip never presses it.
 */
export function TouchTitleTip() {
  const [tip, setTip] = useState<{ text: string; x: number; y: number } | null>(null);
  useEffect(() => {
    let timer = 0;
    let hide = 0;
    let start: { x: number; y: number } | null = null;
    // Set once a hold has shown its tip, until the next press: the click (and on
    // Android the context menu) that the same press goes on to fire is not a press.
    let held = false;
    const cancel = () => {
      if (timer) window.clearTimeout(timer);
      timer = 0;
      start = null;
    };
    const down = (e: PointerEvent) => {
      held = false;
      cancel();
      if (hide) { window.clearTimeout(hide); hide = 0; }
      setTip(null);
      if (e.pointerType !== 'touch') return;
      const el = e.target instanceof Element ? e.target.closest<HTMLElement>('[title]') : null;
      const text = el?.title;
      if (!text) return;
      const at = { x: e.clientX, y: e.clientY };
      start = at;
      timer = window.setTimeout(() => {
        timer = 0;
        held = true;
        setTip({ text, ...at });
      }, LONG_PRESS_MS);
    };
    const move = (e: PointerEvent) => {
      if (start && timer && pressDrifted(start, { x: e.clientX, y: e.clientY })) cancel();
    };
    const up = () => {
      cancel();
      if (held) hide = window.setTimeout(() => { hide = 0; setTip(null); }, 1600);
    };
    const swallow = (e: Event) => {
      if (!held) return;
      e.preventDefault();
      e.stopPropagation();
    };
    document.addEventListener('pointerdown', down, true);
    document.addEventListener('pointermove', move, true);
    document.addEventListener('pointerup', up, true);
    document.addEventListener('pointercancel', up, true);
    document.addEventListener('click', swallow, true);
    document.addEventListener('contextmenu', swallow, true);
    return () => {
      cancel();
      if (hide) window.clearTimeout(hide);
      document.removeEventListener('pointerdown', down, true);
      document.removeEventListener('pointermove', move, true);
      document.removeEventListener('pointerup', up, true);
      document.removeEventListener('pointercancel', up, true);
      document.removeEventListener('click', swallow, true);
      document.removeEventListener('contextmenu', swallow, true);
    };
  }, []);
  if (!tip) return null;
  // Above the finger, which covers whatever is under it, and kept on the screen.
  const half = Math.min(140, window.innerWidth / 2 - 8);
  const left = Math.min(Math.max(tip.x, half + 8), window.innerWidth - half - 8);
  return (
    <div
      className="rs-panel fixed z-[3000] pointer-events-none px-[0.7em] py-[0.35em] text-[#d3c3a0] leading-snug text-center"
      style={{
        left, top: Math.max(8, tip.y - 36), maxWidth: half * 2,
        transform: 'translate(-50%, -100%)', fontSize: 13,
      }}
    >
      {tip.text}
    </div>
  );
}

/**
 * Asks for the phone to be turned sideways. The board is 2.25 times as wide as it
 * is tall, so held upright a phone would draw it a few centimetres high. Shown by
 * CSS alone (`.rs-rotate-hint`), only for a touch screen held upright, so a narrow
 * desktop window never sees it.
 */
export function RotateHint() {
  return (
    <div className="rs-rotate-hint fixed inset-0 z-[4000] bg-black flex-col items-center justify-center gap-4 p-6 text-center">
      <img src={ASSETS.misc.compass} alt="" className="w-16 h-16 object-contain" onError={hideBrokenImg} />
      <p className="text-osrs-orange text-2xl">Turn your device sideways</p>
      <p className="text-[#d3c3a0] text-base">The game is played in landscape.</p>
    </div>
  );
}

/** Whether this browser can take the page fullscreen. iPhone Safari cannot. */
const canFullscreen = () => typeof document !== 'undefined' && !!document.fullscreenEnabled;

/**
 * Takes the game fullscreen and holds it in landscape where the browser allows it.
 * On a phone the address bar takes a sixth of a landscape screen, and all of that
 * height is board. Absent where the browser has no fullscreen for a page (iPhone
 * Safari), so it never shows a button that does nothing.
 */
export function FullscreenButton({ className = '' }: { className?: string }) {
  const [on, setOn] = useState(false);
  const [able] = useState(canFullscreen);
  useEffect(() => {
    const sync = () => setOn(!!document.fullscreenElement);
    sync();
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, []);
  if (!able) return null;
  const toggle = async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        return;
      }
      await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
      // Only a fullscreen page may lock its orientation, and not every browser lets
      // it even then; the rotate hint covers the rest.
      const orientation = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
      await orientation.lock?.('landscape').catch(() => {});
    } catch { /* refused: the page stays as it was */ }
  };
  return (
    <button
      data-idle-keep=""
      onClick={() => { void toggle(); }}
      title={on ? 'Leave fullscreen' : 'Fullscreen'}
      className={className}
    >
      <svg viewBox="0 0 16 16" width="1em" height="1em" aria-hidden fill="none" stroke="currentColor" strokeWidth="2">
        {on
          ? <path d="M6 1v5H1M10 1v5h5M6 15v-5H1M10 15v-5h5" />
          : <path d="M1 6V1h5M15 6V1h-5M1 10v5h5M15 10v5h-5" />}
      </svg>
    </button>
  );
}
