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
export const UI_SCALE_STEP = 0.05;

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
export function Vital({ icon, orb, orbColor, title, value, valueColor, fill, fillColor, wide }: {
  icon?: string;
  /** The empty sphere the OSRS client draws behind a data-orb glyph. Passed in
      rather than imported, so this file keeps its no-dependencies rule; the two
      sprites share a canvas, so the glyph needs no nudging to sit on it. */
  orb?: string;
  /** The colour that fills that sphere, bottom-up, with the same share the gauge
      shows — the client's own data orbs drain exactly like this. Vertical, since
      it fills a ball and not a bar. Without it the sphere stays empty and black. */
  orbColor?: string;
  title: string;
  value: React.ReactNode;
  valueColor?: string;
  fill: number;
  fillColor: string;
  /** Stretch to fill the room it is given, gauge and all, instead of hugging its
      number. Used in the bottom bar, where the vitals own a whole empty section. */
  wide?: boolean;
}) {
  const pct = Math.max(0, Math.min(1, fill)) * 100;
  return (
    <div className={`rs-vital${wide ? ' rs-vital-wide' : ''}`} title={title}>
      <span className="rs-vital-row">
        {icon && (
          <span
            className="rs-vital-orb"
            style={orb ? ({ '--rs-orb': `url(${orb})` } as React.CSSProperties) : undefined}
          >
            {orb && orbColor && (
              <span className="rs-vital-orb-clip">
                <span
                  className="rs-vital-orb-fill"
                  style={{ height: `${pct}%`, background: orbColor }}
                />
              </span>
            )}
            <img src={icon} alt="" onError={hideBrokenImg} />
          </span>
        )}
        <span className="rs-vital-value" style={valueColor ? { color: valueColor } : undefined}>{value}</span>
      </span>
      <span className="rs-vital-bar">
        <span
          className="rs-vital-fill"
          style={{ width: `${pct}%`, background: fillColor }}
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

/* ══════════════════════════════ the shop standard ═════════════════════════
 * OSRS's minigame shops — Nightmare Zone, Barbarian Assault, the Mage Arena —
 * are all the same interface wearing different stock: a titled frame, a strip of
 * tabs when there is more than one page, a scrolling grid of item squares, and a
 * detail strip under it that names whatever is selected and carries its buttons.
 * Nothing is hidden behind a hover and nothing is one click deep: every option
 * the player has is on the screen.
 *
 * These four pieces are that interface. A new shop should be a list of items and
 * a couple of handlers, not a new layout.
 */

/** One page of a {@link ShopFrame}. */
export interface ShopTab {
  id: string;
  label: string;
  icon?: string;
  /** A count in the corner, drawn only when above zero. */
  badge?: number;
  title?: string;
  disabled?: boolean;
}

/** The frame: title bar, optional tab strip, and whatever the page puts inside. */
export function ShopFrame({ icon, title, right, tabs, activeTab, onTab, children }: {
  icon: string;
  title: string;
  /** The one number that belongs beside the title — gold held, slots free. */
  right?: React.ReactNode;
  tabs?: ShopTab[];
  activeTab?: string;
  onTab?: (id: string) => void;
  children: React.ReactNode;
}) {
  return (
    <>
      <div className="rs-panel-title flex items-center gap-2">
        <img src={icon} alt="" className="w-[1.3em] h-[1.3em] object-contain" onError={hideBrokenImg} />
        <span className="flex-1">{title}</span>
        {right != null && <span className="text-[0.8em] text-osrs-yellow font-bold">{right}</span>}
      </div>
      {tabs && tabs.length > 0 && (
        <div className="flex items-center gap-[0.25em] mt-[0.45em]">
          {/* Icon only, the way the client's own interface tabs are: the picture is
              the whole button, and the name lives in the tooltip. A tab with no icon
              falls back to its label rather than rendering a blank square. */}
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              title={t.title ?? t.label}
              aria-label={t.label}
              disabled={t.disabled}
              onClick={() => onTab?.(t.id)}
              className={`rs-btn flex-1 flex items-center justify-center gap-[0.3em] py-[0.25em] text-[0.75em] ${t.id === activeTab ? 'rs-btn-primary' : ''}`}
            >
              {t.icon
                ? <img src={t.icon} alt="" className="w-[1.5em] h-[1.5em] object-contain" onError={hideBrokenImg} />
                : t.label}
              {t.badge != null && t.badge > 0 && <span className="text-osrs-yellow font-bold">{t.badge}</span>}
            </button>
          ))}
        </div>
      )}
      {children}
    </>
  );
}

/** The stock: a fixed-column grid of squares in its own scroll box, so a shop
 *  that grows past the panel scrolls rather than shoving the buttons off-screen. */
export function SlotGrid({ cols, maxHeight = '13em', label, right, children }: {
  cols: number;
  maxHeight?: string;
  label?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <>
      {(label || right != null) && (
        <div className="flex items-center justify-between gap-2 mt-[0.5em] px-[0.2em] text-[0.78em]">
          <span className="text-[#cdbe91] uppercase tracking-wide">{label}</span>
          {right != null && <span className="text-osrs-yellow font-bold">{right}</span>}
        </div>
      )}
      <div className="rs-panel-inset mt-[0.3em] p-[0.3em] overflow-y-auto" style={{ maxHeight }}>
        <div className="grid gap-[0.25em]" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
          {children}
        </div>
      </div>
    </>
  );
}

/** The twenty-eight slots at OSRS's own metrics: a 4×7 grid of 42×36 cells on the
 *  client's `invback` panel, which is exactly 190×261 — that grid plus its border.
 *  Every number is the client's, multiplied by `--ui-scale` in CSS, so the whole
 *  thing grows with the UI control and nothing else about it moves.
 *
 *  The background comes in as a prop rather than an import, the same way
 *  {@link Vital} takes its orb: this file stays free of the game's asset table. */
export function InvGrid({ background, children }: { background: string; children: React.ReactNode }) {
  return (
    <div
      className="rs-inv mx-auto mt-[0.4em]"
      style={{ '--rs-invback': `url(${background})` } as React.CSSProperties}
    >
      {children}
    </div>
  );
}

/** One square. With no icon it is an empty slot — drawn, not skipped, because the
 *  shape of the grid is what tells the player how much room is left. */
export function ItemSlot({ icon, name, count, selected = false, dim = false, signature = false, osrs = false, title, onClick }: {
  icon?: string;
  name?: string;
  count?: number;
  selected?: boolean;
  dim?: boolean;
  /** A boss's own drop: the square is marked even before it is picked. */
  signature?: boolean;
  /** Draw it as an {@link InvGrid} cell — OSRS's borderless 42×36 square with a
   *  36×32 icon — instead of the panel's own bordered slot. */
  osrs?: boolean;
  title?: string;
  onClick?: () => void;
}) {
  const base = osrs ? 'rs-inv-slot' : 'rs-slot';
  if (!icon) return <div className={base} />;
  return (
    <button
      type="button"
      title={title ?? name}
      aria-label={name}
      onClick={onClick}
      className={`${base} ${selected ? 'selected' : ''} ${signature ? 'signature' : ''} ${dim ? 'rs-slot-unafford' : ''}`}
    >
      <img src={icon} alt="" onError={hideBrokenImg} />
      {count != null && <span className={`rs-slot-count ${stackClass(count)}`}>{fmt(count)}</span>}
    </button>
  );
}

/** The detail strip: what is selected, the one line that says what it does, and
 *  its buttons. With nothing selected it shows the hint instead, so the strip
 *  never collapses and the buttons never move. */
export function DetailPane({ icon, name, line, hint, children }: {
  icon?: string;
  name?: string;
  line?: string;
  /** Shown when nothing is selected. */
  hint: string;
  children?: React.ReactNode;
}) {
  if (!name) {
    return (
      <div className="rs-panel-inset mt-[0.5em] p-[0.5em] text-[0.75em] text-[#8f8158] leading-snug">
        {hint}
      </div>
    );
  }
  return (
    <div className="rs-panel-inset mt-[0.5em] p-[0.5em]">
      <div className="flex items-center gap-[0.5em]">
        {icon && <img src={icon} alt="" className="w-[1.6em] h-[1.6em] object-contain shrink-0" onError={hideBrokenImg} />}
        <div className="min-w-0">
          <div className="text-osrs-yellow font-bold text-[0.85em] truncate">{name}</div>
          {line && <div className="text-[0.72em] text-[#d3c3a0] leading-snug">{line}</div>}
        </div>
      </div>
      {children && <div className="flex items-center gap-[0.3em] mt-[0.45em]">{children}</div>}
    </div>
  );
}

/** How many a click moves. OSRS's own row, X included. */
export type ShopQty = number | 'all';

export function QtyBar({ value, onChange, label = 'Quantity' }: {
  value: ShopQty;
  onChange: (q: ShopQty) => void;
  label?: string;
}) {
  const [custom, setCustom] = useState(25);
  const preset = (n: ShopQty, text: string) => (
    <button
      key={text}
      type="button"
      onClick={() => onChange(n)}
      className={`rs-btn px-[0.55em] py-[0.15em] text-[0.72em] ${value === n ? 'rs-btn-primary' : ''}`}
    >
      {text}
    </button>
  );
  const customOn = typeof value === 'number' && value !== 1 && value !== 5 && value !== 10;
  return (
    <div className="flex items-center gap-[0.3em] mt-[0.4em] px-[0.2em]">
      <span className="text-[0.7em] text-[#8f8158] uppercase tracking-wide mr-auto">{label}</span>
      {preset(1, '1')}
      {preset(5, '5')}
      {preset(10, '10')}
      <button
        type="button"
        onClick={() => onChange(Math.max(1, custom))}
        className={`rs-btn px-[0.55em] py-[0.15em] text-[0.72em] ${customOn ? 'rs-btn-primary' : ''}`}
      >
        X
      </button>
      <input
        type="number"
        min={1}
        value={custom}
        onChange={(e) => {
          const n = Math.max(1, Math.floor(Number(e.target.value) || 1));
          setCustom(n);
          if (customOn) onChange(n);
        }}
        className="rs-num w-[3.2em] text-[0.72em]"
        aria-label="Custom quantity"
      />
      {preset('all', 'All')}
    </div>
  );
}
