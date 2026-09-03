'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { ASSETS, GEAR_ICONS } from '@/lib/game/assets';
import type { CombatStyle, TowerType } from '@/lib/game/types';
import type { DpsSnapshot, DpsTowerStat, DpsWaveStat, EffectStat } from '@/lib/game/systems/combat-stats';
import { TOWERS } from '@/lib/game/data/towers';
import { ENEMIES } from '@/lib/game/data/enemies';
import { HoverTip } from './HoverTip';
import { StyleIcon } from './draft-cards';
import { hideBrokenImg } from './ui-kit';

/**
 * The DPS meter: per-tower damage for the current wave or the whole run, with a
 * drill-down into what each tower's damage was actually made of.
 *
 * The engine sends the totals ready-made (`DpsSnapshot`); nothing here recomputes
 * combat, it only formats. Moved out of GameRoot.tsx verbatim.
 */

// ============================ DPS meter ============================

/** Effect tallies surfaced in a tower's drill-down, with how each is formatted,
 *  the OSRS icon that marks it and the one line that says what it is. Icons are
 *  the game's own status / spell / item sprites (local cache) so a row reads at a
 *  glance; adding an effect is one line here and one `recordEffect` in the sim.
 *
 *  Between them these cover every tower's signature, which is the point: archer →
 *  extra shots, cannon → splash, slayer → weapon bonus, toxic → venom, tzhaar →
 *  stuns, and each wizard spellbook its own status. A tower whose niche shows up
 *  nowhere in this table has no line in the meter, and reads as a plain damage
 *  number the player can't tell apart from any other.
 */
export const DPS_EFFECT_META: {
  key: keyof EffectStat; label: string; kind: 'dmg' | 'int' | 'sec' | 'tiles'; icon: string; tip: string;
}[] = [
  { key: 'burnDmg', label: 'Burn damage', kind: 'dmg', icon: ASSETS.debuffs.burn,
    tip: 'Damage from fire left burning on the enemy after the hit.' },
  { key: 'poisonDmg', label: 'Poison damage', kind: 'dmg', icon: ASSETS.debuffs.poison,
    tip: 'Damage from poison ticking on the enemy after the hit.' },
  { key: 'venomDmg', label: 'Venom damage', kind: 'dmg', icon: ASSETS.debuffs.venom,
    tip: 'Damage from venom, which hits harder the longer it is kept up.' },
  { key: 'chainDmg', label: 'Chain damage', kind: 'dmg', icon: ASSETS.misc.multicombat_icon,
    tip: 'Damage that jumped on to another enemy on its own.' },
  { key: 'healDenied', label: 'Healing denied', kind: 'dmg', icon: ASSETS.hitsplats.heal,
    tip: 'Health an enemy was not allowed to put back on its bar.' },
  { key: 'bloodBonusDmg', label: 'Blood bonus dmg', kind: 'dmg', icon: ASSETS.spells.Blood_Barrage,
    tip: 'Extra damage Blood adds from the target’s own maximum hitpoints.' },
  { key: 'taskBonusDmg', label: 'Slayer task bonus', kind: 'dmg', icon: ASSETS.misc.slayer_crossbow,
    tip: 'Extra damage every tower deals while the enemy is your Slayer task.' },
  { key: 'weaponBonusDmg', label: 'Weapon bonus dmg', kind: 'dmg', icon: ASSETS.misc.attack_icon,
    tip: 'Extra damage this tower’s own weapon and gear add against this enemy.' },
  { key: 'extraShots', label: 'Extra shots', kind: 'int', icon: GEAR_ICONS.dragon_arrow,
    tip: 'Shots loosed on top of the tower’s attack, at a second enemy.' },
  { key: 'roadHits', label: 'Road hits', kind: 'int', icon: ASSETS.misc.signpost,
    tip: 'Enemies caught further down the road by a shot aimed at another.' },
  { key: 'longShots', label: 'Long shots', kind: 'int', icon: ASSETS.misc.reticle,
    tip: 'Shots that reached a target standing outside the tower’s range.' },
  { key: 'stunCount', label: 'Enemies stunned', kind: 'int', icon: ASSETS.debuffs.stun,
    tip: 'How many enemies were frozen in place.' },
  { key: 'stunSeconds', label: 'Stun time', kind: 'sec', icon: ASSETS.debuffs.stun,
    tip: 'How long, all told, enemies were held still.' },
  { key: 'pushCount', label: 'Knockbacks', kind: 'int', icon: ASSETS.misc.strength_icon,
    tip: 'How many enemies were shoved back down the road.' },
  { key: 'pushTiles', label: 'Tiles pushed', kind: 'tiles', icon: ASSETS.misc.strength_icon,
    tip: 'How much road the enemies had to walk again.' },
  { key: 'slowCount', label: 'Slows applied', kind: 'int', icon: ASSETS.debuffs.slow,
    tip: 'How many enemies were slowed down.' },
  { key: 'ampCount', label: 'Enemies marked', kind: 'int', icon: ASSETS.debuffs.vuln,
    tip: 'How many enemies were marked to take more damage from everything.' },
  { key: 'splashHits', label: 'Splash hits', kind: 'int', icon: ASSETS.misc.magic_hit_splat,
    tip: 'Hits that landed on enemies standing next to the target.' },
  { key: 'lifeStealHeals', label: 'Lives stolen', kind: 'int', icon: ASSETS.misc.hp_icon,
    tip: 'Lives won back by killing with Blood.' },
];

export const DPS_STYLE_LABEL: Record<CombatStyle | 'run', string> = { melee: 'Melee', ranged: 'Ranged', magic: 'Magic', run: 'Run Effects' };
export const DPS_STYLE_COLOR: Record<CombatStyle | 'run', string> = { melee: '#e07a4c', ranged: '#5bbf5b', magic: '#6aa9ff', run: '#c9a24a' };

/** Compact damage formatting (1.2k / 3.4m). */
export function dpsFmt(n: number): string {
  if (!isFinite(n)) return '0';
  const a = Math.abs(n);
  if (a >= 1_000_000) return (n / 1_000_000).toFixed(a >= 10_000_000 ? 0 : 1) + 'm';
  if (a >= 1000) return (n / 1000).toFixed(a >= 10_000 ? 0 : 1) + 'k';
  return Math.round(n).toString();
}

export function dpsEffectValue(v: number, kind: 'dmg' | 'int' | 'sec' | 'tiles'): string {
  if (kind === 'dmg') return dpsFmt(v);
  if (kind === 'int') return Math.round(v).toString();
  if (kind === 'sec') return v.toFixed(1) + 's';
  return v.toFixed(1); // tiles
}

/** A tower's stats collapsed to the current view (a single wave, or the run). */
export interface DpsRow {
  id: string;
  name: string;
  color: string;
  icon?: string;
  type: TowerType | 'run';
  style: CombatStyle | 'run';
  subLabel: string | null;
  isUtility: boolean;
  damage: number;
  dps: number;
  /** Per-enemy breakdown, grouped by wave (one group in wave view). */
  byWave: { wave: number; entries: { type: string; damage: number }[] }[];
  effects: Record<string, number>;
}

export function buildDpsRow(t: DpsTowerStat, view: 'wave' | 'total', wave: number, waveCombat: Record<number, number>): DpsRow {
  const slots: DpsWaveStat[] = view === 'wave' ? t.perWave.filter((w) => w.wave === wave) : t.perWave;
  let damage = 0, combat = 0, waveDenom = 0;
  const effects: Record<string, number> = {};
  const byWave: DpsRow['byWave'] = [];
  for (const w of slots) {
    damage += w.damage;
    combat += w.combatSeconds;
    waveDenom += waveCombat[w.wave] ?? 0;
    for (const [k, v] of Object.entries(w.effects)) if (v) effects[k] = (effects[k] ?? 0) + v;
    if (w.byEnemy.length) byWave.push({ wave: w.wave, entries: w.byEnemy });
  }
  // Utility / Run-FX rows have no engagement time of their own — rate them against
  // the board's combat clock; real towers use their own engaged seconds.
  const denom = t.isUtility || t.style === 'run' ? waveDenom : combat;
  return {
    id: t.id, name: t.name, color: t.color, icon: t.icon, type: t.type, style: t.style,
    subLabel: t.subLabel, isUtility: t.isUtility,
    damage, dps: denom > 0 ? damage / denom : 0, byWave, effects,
  };
}

/** One group of rows under the active grouping. */
interface DpsBucket {
  key: string;
  label: string;
  color: string;
  style: CombatStyle | 'run';
  icon?: string;
  rows: DpsRow[];
}

/** What every row needs from the panel around it: which view it is in, how to
 *  print a damage figure, the bar it is scaled against, and the open/hover state
 *  the whole list shares. Passed as one object so the row components keep short
 *  signatures. */
interface RowCtx {
  view: 'wave' | 'total';
  valLabel: (d: number) => string;
  maxDamage: number;
  expanded: string | null;
  setExpanded: (id: string | null) => void;
  onHoverTower: (id: string | null) => void;
}

/** The toolbar: view, wave nav, grouping, number format, empty-tower filter. */
function DpsToolbar({ view, setView, waves, curWave, lastWave, setWave, group, setGroup, format, setFormat, showEmpty, setShowEmpty }: {
  view: 'wave' | 'total';
  setView: (v: 'wave' | 'total') => void;
  waves: number[];
  curWave: number;
  lastWave: number;
  setWave: (w: number) => void;
  group: 'none' | 'tower' | 'style';
  setGroup: (g: 'none' | 'tower' | 'style') => void;
  format: 'number' | 'percent';
  setFormat: (f: (p: 'number' | 'percent') => 'number' | 'percent') => void;
  showEmpty: boolean;
  setShowEmpty: (b: boolean) => void;
}) {
  return (
    // One calm toolbar for every control — view, wave nav, grouping, format,
    // empty-tower filter — so they read as a single strip, not scattered chips.
    // Sticky so it stays put while the tower list scrolls in the tab body.
    <div className="rs-panel-inset flex flex-col gap-[0.35em] p-[0.45em] mb-[0.5em] sticky top-0 z-10" style={{ borderRadius: 0 }}>
      {/* View: by-wave (with a wave stepper) or the whole run. */}
      <div className="flex items-center justify-between gap-[0.4em] flex-wrap">
        <div className="flex gap-[0.3em]">
          <button onClick={() => setView('wave')} className={`rs-btn px-[0.7em] py-[0.15em] text-[0.75em] ${view === 'wave' ? 'rs-btn-primary' : ''}`}>By Wave</button>
          <button onClick={() => setView('total')} className={`rs-btn px-[0.7em] py-[0.15em] text-[0.75em] ${view === 'total' ? 'rs-btn-primary' : ''}`}>Total</button>
        </div>
        {view === 'wave' && waves.length > 0 && (
          <div className="flex items-center gap-[0.3em]">
            <button onClick={() => setWave(Math.max(waves[0], curWave - 1))} disabled={curWave <= waves[0]} className="rs-btn px-[0.5em] py-[0.1em] text-[0.72em] disabled:opacity-40">◀</button>
            <span className="text-[0.74em] text-[#f0e6d2] w-[4.4em] text-center">Wave {curWave}</span>
            <button onClick={() => setWave(Math.min(lastWave, curWave + 1))} disabled={curWave >= lastWave} className="rs-btn px-[0.5em] py-[0.1em] text-[0.72em] disabled:opacity-40">▶</button>
          </div>
        )}
      </div>

      {/* Group / number-format / show-empty controls. */}
      <div className="flex items-center justify-between gap-[0.4em] flex-wrap">
        <div className="flex items-center gap-[0.25em]">
          <span className="text-[0.62em] text-[#b3a585] uppercase tracking-wide mr-[0.1em]">Group</span>
          {([['none', 'None'], ['tower', 'Tower'], ['style', 'Type']] as const).map(([k, label]) => (
            <button key={k} onClick={() => setGroup(k)} className={`rs-btn px-[0.5em] py-[0.1em] text-[0.68em] ${group === k ? 'rs-btn-primary' : ''}`}>{label}</button>
          ))}
        </div>
        <div className="flex items-center gap-[0.4em]">
          <button
            onClick={() => setFormat((f) => (f === 'number' ? 'percent' : 'number'))}
            title="Toggle raw numbers / % of the wave (or run) total"
            className="rs-btn px-[0.55em] py-[0.1em] text-[0.68em]"
          >
            {format === 'number' ? '123' : '%'}
          </button>
          <label className="flex items-center gap-[0.25em] text-[0.66em] text-[#cdbe91] cursor-pointer select-none" title="Show towers that dealt no damage in this view">
            <input type="checkbox" className="rs-check" checked={showEmpty} onChange={(e) => setShowEmpty(e.target.checked)} />
            Empty
          </label>
        </div>
      </div>
    </div>
  );
}

/** An opened row's drill-down: what this tower hit, and what its effects did. */
function DpsRowDetail({ r, ctx }: { r: DpsRow; ctx: RowCtx }) {
  const enemyMax = r.byWave.reduce((m, g) => Math.max(m, ...g.entries.map((e) => e.damage)), 1);
  // Run Effects is a board-wide bucket, not a tower shooting specific monsters —
  // so it drops the per-enemy list and shows only the values it generated
  // (damage / CC / heals), by effect. Real towers keep both.
  const isRun = r.style === 'run';
  const shownEffects = DPS_EFFECT_META.filter((m) => (r.effects[m.key] ?? 0) > 0.05);
  return (
    <div className="mt-[0.4em] pl-[1.6em] pr-[0.2em] flex flex-col gap-[0.5em]">
      {/* Per-enemy breakdown (grouped by wave in Total view) — towers only. */}
      {!isRun && (r.byWave.length > 0 ? r.byWave.map((g) => (
        <div key={g.wave}>
          {ctx.view === 'total' && <div className="text-[0.62em] text-[#b3a585] uppercase tracking-wide mb-[0.15em]">Wave {g.wave}</div>}
          <div className="flex flex-col gap-[0.15em]">
            {g.entries.map((e) => (
              <div key={e.type} className="flex items-center gap-[0.4em]">
                <span className="text-[0.68em] text-[#cdbe91] w-[7em] truncate shrink-0">{ENEMIES[e.type as keyof typeof ENEMIES]?.name ?? e.type}</span>
                <span className="flex-1 h-[0.4em] bg-[#241d15] overflow-hidden">
                  <span className="block h-full" style={{ width: `${Math.max(2, (e.damage / enemyMax) * 100)}%`, background: r.color }} />
                </span>
                <span className="text-[0.68em] text-[#ffd257] w-[3.2em] text-right shrink-0">{ctx.valLabel(e.damage)}</span>
              </div>
            ))}
          </div>
        </div>
      )) : <div className="text-[0.66em] text-[#8a7f68] italic">No damage this {ctx.view === 'wave' ? 'wave' : 'run'} yet.</div>)}

      {/* Effect-specific tallies (only the non-zero ones for this row). For a
          run row these carry the whole drill-down; for towers they sit under
          the per-enemy list (so the divider only shows when something's above). */}
      {shownEffects.length > 0 ? (
        <div
          className={`grid grid-cols-2 gap-x-[0.6em] gap-y-[0.15em] ${isRun ? '' : 'mt-[0.1em] pt-[0.35em]'}`}
          style={isRun ? undefined : { borderTop: '1px solid #2b231a' }}
        >
          {shownEffects.map((m) => (
            <div key={m.key} className="flex items-center justify-between gap-[0.4em]">
              <HoverTip content={m.tip}>
                <span className="flex items-center gap-[0.35em] min-w-0">
                  <img src={m.icon} alt="" className="w-[1em] h-[1em] object-contain shrink-0" onError={hideBrokenImg} />
                  <span className="text-[0.66em] text-[#b3a585] truncate">{m.label}</span>
                </span>
              </HoverTip>
              <span className="text-[0.7em] text-[#e7d9b6] font-bold shrink-0">
                {m.kind === 'dmg' ? ctx.valLabel(r.effects[m.key] ?? 0) : dpsEffectValue(r.effects[m.key] ?? 0, m.kind)}
              </span>
            </div>
          ))}
        </div>
      ) : isRun ? (
        <div className="text-[0.66em] text-[#8a7f68] italic">No run effects this {ctx.view === 'wave' ? 'wave' : 'run'} yet.</div>
      ) : null}
    </div>
  );
}

/** One tower's line: its share of the damage, and its drill-down when open. */
function DpsRowView({ r, ctx }: { r: DpsRow; ctx: RowCtx }) {
  const open = ctx.expanded === r.id;
  // Run Effects has no single tower on the board — nothing to ring/range.
  const boardId = r.style === 'run' ? null : r.id;
  return (
    <div
      className="rs-panel-inset px-[0.4em] py-[0.3em]"
      style={{ borderRadius: 0 }}
      onMouseEnter={() => ctx.onHoverTower(boardId)}
      onMouseLeave={() => ctx.onHoverTower(null)}
    >
      <button
        onClick={() => ctx.setExpanded(open ? null : r.id)}
        title="Show per-enemy + effect breakdown"
        className="w-full flex items-center gap-[0.5em] text-left"
      >
        <span className="text-[0.7em] w-[1em] shrink-0 text-[#b3a585]">{open ? '▾' : '▸'}</span>
        {r.icon
          ? <img src={r.icon} alt="" className="w-[1.5em] h-[1.5em] object-contain shrink-0" onError={hideBrokenImg} />
          : <span className="w-[1.5em] shrink-0 text-center text-[0.9em]">✦</span>}
        <span className="flex-1 min-w-0">
          <span className="flex items-center justify-between gap-[0.4em]">
            <span className="truncate text-[0.8em]" style={{ color: r.isUtility ? '#c9a24a' : '#f0e6d2' }}>
              {r.name}
              {/* A Utility wizard never fires, so this row is not damage it dealt —
                  it is the extra its aura added to other towers' hits, peeled off
                  their totals rather than added on top. Unlabelled, it read as
                  "support is the top damage dealer" and invited spamming it, which
                  the aura's diminishing returns silently punish. */}
              {r.isUtility && (
                <HoverTip content="Extra damage this aura added to other towers' hits — not damage it dealt, and already deducted from their totals. The board total is unchanged.">
                  <span className="text-[0.72em] text-[#9a8d70] ml-[0.3em]">
                    (extra)
                  </span>
                </HoverTip>
              )}
            </span>
            <span className="shrink-0 flex items-baseline gap-[0.5em]">
              <span className="text-[0.82em] font-bold" style={{ color: '#ffd257' }}>{ctx.valLabel(r.damage)}</span>
              <span className="text-[0.66em] text-[#8fbf8f] w-[3.4em] text-right">{dpsFmt(r.dps)}/s</span>
            </span>
          </span>
          <span className="block mt-[0.2em] h-[0.42em] bg-[#241d15] overflow-hidden" style={{ boxShadow: 'inset 1px 1px 0 #100d09' }}>
            <span className="block h-full" style={{ width: `${Math.max(2, (r.damage / ctx.maxDamage) * 100)}%`, background: r.isUtility ? '#c9a24a' : r.color }} />
          </span>
        </span>
      </button>

      {open && <DpsRowDetail r={r} ctx={ctx} />}
    </div>
  );
}

/** A collapsible group of rows, headed by its own total. */
function DpsBucketView({ b, ctx, group, collapsed, onToggle }: {
  b: DpsBucket;
  ctx: RowCtx;
  group: 'none' | 'tower' | 'style';
  collapsed: boolean;
  onToggle: () => void;
}) {
  const bTotal = b.rows.reduce((s, r) => s + r.damage, 0);
  return (
    <div className="flex flex-col gap-[0.25em]">
      <button
        onClick={onToggle}
        className="flex items-center justify-between gap-[0.4em] px-[0.4em] py-[0.2em]"
        style={{ background: '#2b231a', boxShadow: 'inset 1px 1px 0 #6f6250, inset -1px -1px 0 #1b1610' }}
      >
        <span className="flex items-center gap-[0.4em] min-w-0">
          <span className="text-[0.7em] text-[#b3a585]">{collapsed ? '▸' : '▾'}</span>
          {group === 'style' && b.style !== 'run'
            ? <StyleIcon style={b.style} />
            : b.icon
              ? <img src={b.icon} alt="" className="w-[1.3em] h-[1.3em] object-contain shrink-0" onError={hideBrokenImg} />
              : <span className="w-[0.7em] h-[0.7em] shrink-0" style={{ background: b.color }} />}
          <span className="text-[0.76em] font-bold text-[#f0e6d2] truncate">{b.label}</span>
          <span className="text-[0.64em] text-[#8a7f68]">×{b.rows.length}</span>
        </span>
        <span className="text-[0.76em] font-bold shrink-0" style={{ color: '#ffd257' }}>{ctx.valLabel(bTotal)}</span>
      </button>
      {!collapsed && (
        <div className="flex flex-col gap-[0.25em] pl-[0.3em]">
          {b.rows.map((r) => <DpsRowView key={r.id} r={r} ctx={ctx} />)}
        </div>
      )}
    </div>
  );
}

/** DPS meter: per-tower damage dealt, by wave or total, groupable by tower type /
 *  damage type, with a per-enemy + per-effect drill-down on each tower. Rendered
 *  as an interface tab inside the main side panel (the tab body owns the scroll). */
// Memoised: the parent GameRoot re-renders on every UIState push (money/lives
// tick constantly during a wave), but this 1-row-per-tower panel only depends on
// `snap` (refreshed at ~4 Hz) and a stable `onHoverTower`. Without memo it re-ran
// the whole table on every gold tick — the fast-forward stutter behind bug #16.
export const DpsView = React.memo(DpsViewBase);

/** This function is the panel's own state and layout; the toolbar, the rows and
 *  the group headers are their own components above. */
export function DpsViewBase({ snap, onHoverTower }: { snap: DpsSnapshot | null; onHoverTower: (id: string | null) => void }) {
  // Clear the board highlight when the panel unmounts (tab switch / minimise).
  useEffect(() => () => onHoverTower(null), [onHoverTower]);
  const [view, setView] = useState<'wave' | 'total'>('wave');
  const [wave, setWave] = useState<number | null>(null);
  const [group, setGroup] = useState<'none' | 'tower' | 'style'>('none');
  const [format, setFormat] = useState<'number' | 'percent'>('number');
  const [showEmpty, setShowEmpty] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<string | null>(null);

  const waves = snap?.waves ?? [];
  const lastWave = waves.length ? waves[waves.length - 1] : 1;
  const curWave = wave != null && waves.includes(wave) ? wave : lastWave;

  const rows = useMemo(() => {
    if (!snap) return [] as DpsRow[];
    return snap.towers
      .map((t) => buildDpsRow(t, view, curWave, snap.waveCombat))
      .filter((r) => showEmpty || r.damage > 0.5)
      .sort((a, b) => b.damage - a.damage);
  }, [snap, view, curWave, showEmpty]);

  const grandTotal = rows.reduce((s, r) => s + r.damage, 0);
  const maxDamage = rows.reduce((m, r) => Math.max(m, r.damage), 0) || 1;

  // Value label for a damage amount, honouring the number/percent toggle.
  const valLabel = (d: number) => (format === 'percent'
    ? (grandTotal > 0 ? (d / grandTotal * 100).toFixed(1) : '0') + '%'
    : dpsFmt(d));

  // Bucket the rows for the active grouping (each bucket is collapsible).
  const buckets = useMemo<DpsBucket[]>(() => {
    if (group === 'none') return [{ key: '', label: '', color: '', style: 'run' as CombatStyle | 'run', icon: undefined as string | undefined, rows }];
    const map = new Map<string, DpsBucket>();
    for (const r of rows) {
      let key: string, label: string, color: string;
      if (group === 'style') {
        key = r.style; label = DPS_STYLE_LABEL[r.style]; color = DPS_STYLE_COLOR[r.style];
      } else if (r.type === 'wizard') {
        key = `wizard:${r.subLabel}`; label = `Wizard · ${r.subLabel}`; color = r.color;
      } else {
        key = r.type; label = r.type === 'run' ? 'Run Effects' : (TOWERS[r.type]?.baseName ?? r.type); color = r.color;
      }
      let b = map.get(key);
      // The bucket's badge is the first tower's live icon (Tower groups); Damage
      // groups render a combat-style icon in the header instead.
      if (!b) { b = { key, label, color, style: r.style, icon: r.icon, rows: [] }; map.set(key, b); }
      b.rows.push(r);
    }
    const arr = [...map.values()];
    // Every grouping ranks its buckets by total damage dealt, high → low.
    arr.sort((a, b) => b.rows.reduce((s, r) => s + r.damage, 0) - a.rows.reduce((s, r) => s + r.damage, 0));
    return arr;
  }, [rows, group]);

  const toggleCollapse = (k: string) => setCollapsed((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; });

  const ctx: RowCtx = { view, valLabel, maxDamage, expanded, setExpanded, onHoverTower };

  return (
    <div className="flex flex-col">
      <DpsToolbar
        view={view} setView={setView}
        waves={waves} curWave={curWave} lastWave={lastWave} setWave={setWave}
        group={group} setGroup={setGroup}
        format={format} setFormat={setFormat}
        showEmpty={showEmpty} setShowEmpty={setShowEmpty}
      />

      <div className="flex flex-col gap-[0.3em]">
        {!snap || rows.length === 0 ? (
          <div className="text-[0.78em] text-[#b3a585] text-center py-[2em] px-[1em] leading-relaxed">
            {snap && snap.waves.length > 0
              ? 'No damage recorded for this view yet.'
              : 'No damage yet — start a wave and your towers will show up here.'}
          </div>
        ) : group === 'none' ? (
          rows.map((r) => <DpsRowView key={r.id} r={r} ctx={ctx} />)
        ) : (
          buckets.map((b) => (
            <DpsBucketView
              key={b.key}
              b={b}
              ctx={ctx}
              group={group}
              collapsed={collapsed.has(b.key)}
              onToggle={() => toggleCollapse(b.key)}
            />
          ))
        )}
      </div>

      {/* Footer: the grand total for the current view + a note on the DPS window. */}
      <div className="flex items-center justify-between mt-[0.5em] pt-[0.4em] text-[0.68em]" style={{ borderTop: '1px solid #2b231a' }}>
        <span className="text-[#b3a585]">{view === 'wave' ? `Wave ${curWave}` : 'Whole run'} · {rows.length} tower{rows.length === 1 ? '' : 's'}</span>
        <span className="text-[#f0e6d2] font-bold">Total {dpsFmt(grandTotal)}</span>
      </div>
    </div>
  );
}
