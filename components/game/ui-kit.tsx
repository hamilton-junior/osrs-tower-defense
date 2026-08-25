'use client';

import React, { useEffect, useState } from 'react';

/**
 * Small presentational primitives and formatters shared across the interface.
 *
 * Everything here is UI-only: no engine import and no game state, so any panel
 * can pull from it without dragging the world in. Moved out of GameRoot.tsx
 * verbatim — this file introduces nothing, it only gives the shared bits a home.
 */

export const hideBrokenImg = (e: React.SyntheticEvent<HTMLImageElement>) => { (e.target as HTMLImageElement).style.display = 'none'; };
export const TICK_MS = 600; // OSRS game tick = 0.6s
export const TILE_PX = 32; // grid tile size in logic px (mirrors engine GRID)
export const pct = (frac: number) => `+${Math.round(frac * 100)}%`;

/** "3 ticks (1.8s)" from a cooldown in ms. */
export const attackSpeed = (cooldownMs: number) => {
  const ticks = Math.max(1, Math.round(cooldownMs / TICK_MS));
  return `${ticks} ${ticks === 1 ? 'tick' : 'ticks'} (${(cooldownMs / 1000).toFixed(1)}s)`;
};

/** Persisted boolean (panel minimize state), tolerant of absent/corrupt data. */
export function loadBool(key: string, fallback: boolean): boolean {
  if (typeof window === 'undefined') return fallback;
  try { const v = localStorage.getItem(key); return v == null ? fallback : !!JSON.parse(v); } catch { return fallback; }
}

/** Persisted positive number, tolerant of absent/corrupt data (SSR-safe). */
export function loadNum(key: string, fallback: number): number {
  if (typeof window === 'undefined') return fallback;
  try { const v = Number(localStorage.getItem(key)); return Number.isFinite(v) && v > 0 ? v : fallback; } catch { return fallback; }
}

/** Wrap a base font-size (usually a `clamp()`) so it also honours the global
 *  `--ui-scale` nudge from the controls bar. Most panels set their OWN font-size
 *  rather than inheriting `body`, so each must multiply by the scale for the
 *  UI −/+ control to reach it — otherwise only body-inheriting UI (e.g. the
 *  prayer bar) would scale. Panels then scale as one via their `em` children. */
export const fs = (base: string) => `calc(${base} * var(--ui-scale, 1))`;

/** Bounds of that nudge. The ceiling is what the bottom bar can hold: past it the
 *  bar's fixed-em controls no longer fit the row, so the group that may shrink
 *  clips (see `data-tut="controls"`) rather than growing the bar or spilling over
 *  the gold. Anything stored outside these bounds is clamped back on load. */
export const UI_SCALE_MIN = 0.7;
export const UI_SCALE_MAX = 1.6;
export const UI_SCALE_STEP = 0.1;

/** Collapse state for a tray, persisted under `key` so it survives the bar body
 *  unmounting when another tab is selected — the tray remounts and its local
 *  state would otherwise reset to expanded every time. */
export function usePersistedCollapse(key: string): [boolean, () => void] {
  const [collapsed, setCollapsed] = useState(() => loadBool(key, false));
  useEffect(() => { try { localStorage.setItem(key, JSON.stringify(collapsed)); } catch { /* ignore */ } }, [key, collapsed]);
  return [collapsed, () => setCollapsed((c) => !c)];
}

/** Render a stat value, showing `base → buffed` (buffed in green) when a buff
 *  has changed it; a plain string otherwise (the parent styles it). */
export function buffedDisplay(base: string, buffed: string, changed: boolean): React.ReactNode {
  if (!changed) return base;
  return (
    <span className="inline-flex items-center gap-[0.3em]">
      <span className="text-[#9a8d70] text-[0.85em]">{base}</span>
      <span className="text-[#cdbe91]">→</span>
      <span className="text-[#5bd75b]">{buffed}</span>
    </span>
  );
}

/** OSRS's stack notation: a quantity reads in full up to 99,999, then in thousands
 *  ("100k") up to 9999k, then in millions ("10M"). Abbreviating only past 100k is
 *  the point — below it, exact digits are what tell you whether you can afford the
 *  thing you're looking at.
 *
 *  `en-US` rather than the visitor's locale: the interface is English (a pt-BR
 *  browser would otherwise punctuate this "12.000" while the rest of the chrome
 *  says "gp"), and OSRS groups with commas. */
export const fmt = (n: number) =>
  n >= 10_000_000 ? `${Math.floor(n / 1_000_000)}M`
    : n >= 100_000 ? `${Math.floor(n / 1000)}k`
      : n.toLocaleString('en-US');

/** The colour half of the same convention, on the same rungs {@link fmt} steps at:
 *  yellow below 100k, white from 100k, green from 10M. Shape and colour always
 *  agree, so the tint reports an order of magnitude before you've read a digit. */
export const stackClass = (n: number) =>
  n >= 10_000_000 ? 'text-osrs-green' : n >= 100_000 ? 'text-osrs-white' : 'text-osrs-yellow';

/** Seconds → `m:ss` (or `h:mm:ss` past an hour) for the run-summary timer. */
export const fmtTime = (s: number) => {
  const t = Math.max(0, Math.floor(s));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const sec = t % 60;
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  return `${h > 0 ? `${h}:` : ''}${mm}:${String(sec).padStart(2, '0')}`;
};
/**
 * One of the run's vitals in the bottom bar: the OSRS glyph, the number beside
 * it, and a hairline gauge underneath. A vital is always a share of something,
 * so the gauge is not optional — a plain count belongs on whatever control
 * already owns it (the wave sits on the Start Wave button), not here wearing a
 * bar that is always full.
 */
export function Vital({ icon, orb, title, value, valueColor, fill, fillColor, wide }: {
  icon?: string;
  /** The empty sphere the OSRS client draws behind a data-orb glyph. Passed in
      rather than imported, so this file keeps its no-dependencies rule; the two
      sprites share a canvas, so the glyph needs no nudging to sit on it. */
  orb?: string;
  title: string;
  value: React.ReactNode;
  valueColor?: string;
  fill: number;
  fillColor: string;
  /** Stretch to fill the room it is given, gauge and all, instead of hugging its
      number. Used in the bottom bar, where the vitals own a whole empty section. */
  wide?: boolean;
}) {
  return (
    <div className={`rs-vital${wide ? ' rs-vital-wide' : ''}`} title={title}>
      <span className="rs-vital-row">
        {icon && (
          <span
            className="rs-vital-orb"
            style={orb ? { backgroundImage: `url(${orb})` } : undefined}
          >
            <img src={icon} alt="" onError={hideBrokenImg} />
          </span>
        )}
        <span className="rs-vital-value" style={valueColor ? { color: valueColor } : undefined}>{value}</span>
      </span>
      <span className="rs-vital-bar">
        <span
          className="rs-vital-fill"
          style={{ width: `${Math.max(0, Math.min(1, fill)) * 100}%`, background: fillColor }}
        />
      </span>
    </div>
  );
}

export function GoStat({ icon, label, value }: { icon?: string; label: string; value: React.ReactNode }) {
  return (
    <div className="rs-panel-inset flex flex-col items-center gap-1 py-2">
      {icon && (
        <img src={icon} alt="" className="w-5 h-5 object-contain" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
      )}
      <span className="text-osrs-yellow font-bold leading-none">{value}</span>
      <span className="text-[0.72em] text-[#d3c3a0] uppercase tracking-wide">{label}</span>
    </div>
  );
}

/** A stat's label cell in the enemy panel's two-column grid: its OSRS icon plus the
 *  name. (The tower panel uses {@link Stat}, which lays label and value out itself.) */
export function StatLabel({ icon, title, children }: { icon: string; title?: string; children: React.ReactNode }) {
  return (
    <span className="text-[#d3c3a0] flex items-center gap-[0.35em]" title={title}>
      <img src={icon} alt="" className="w-[1.05em] h-[1.05em] object-contain shrink-0" onError={hideBrokenImg} />
      {children}
    </span>
  );
}

export function Stat({ icon, label, value }: { icon?: string; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="flex items-center gap-[0.4em] text-[#cdbe91]">
        {icon && (
          <img src={icon} alt="" className="w-[1.2em] h-[1.2em] object-contain" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
        )}
        {label}
      </span>
      <span className="text-osrs-yellow font-bold whitespace-nowrap">{value}</span>
    </div>
  );
}
