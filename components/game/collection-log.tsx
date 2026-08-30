'use client';

import React, { useMemo, useState } from 'react';
import { ENEMIES } from '@/lib/game/data/enemies';
import { ASSETS, iconUrl } from '@/lib/game/assets';
import { DRAFT_POOL, RARITY_WEIGHT, type DraftCard } from '@/lib/game/systems/roguelite-draft';
import { CA_TIERS, CA_TIER_NAMES, tierProgress } from '@/lib/game/systems/combat-achievements';
import { CA_TASKS } from '@/lib/game/data/combat-achievements';
import { DIFFICULTY_TIERS, tierLabel } from '@/lib/game/systems/difficulty';
import { bossTip } from '@/lib/game/systems/boss-tips';
import { MovablePanel } from './MovablePanel';
import { fs, fmt, fmtTime, hideBrokenImg, GoStat } from './ui-kit';
import { weaknessTag, enemySpriteStyle, enemySlugSpriteStyle, diversionSpriteStyle } from './enemy-ui';
import { LOOK_BY_SLUG, LOOKS_BY_TYPE, defaultLookSlug } from '@/lib/game/data/enemy-variants';
import { DIVERSIONS, type DiversionDef } from '@/lib/game/data/diversions';
import type { EnemyType } from '@/lib/game/types';
import { RARITY_COLOR, RARITY_LABEL, effectTag, renderWithStyleIcons, DraftCardView } from './draft-cards';
import { type Victories, type DifficultyProgress } from './save';

/**
 * The Collection Log: every monster, boss, draft card and Combat Achievement the
 * account has ever seen, with the lifetime counts behind each.
 *
 * Unobtained entries stay as darkened silhouettes rather than being hidden — the
 * log is a checklist, and what is missing is the point. Moved out of GameRoot.tsx
 * verbatim.
 */

/** Collection Log roster, split into the Bosses / Monsters tabs (computed once).
 *  Carries the stat fields the log can sort by (hp / speed / weakness / gold). */
export const LOG_ENTRIES = Object.entries(ENEMIES).map(([type, def]) => ({
  type,
  name: def.name,
  isBoss: !!def.isBoss,
  summonedBy: def.summonedBy,
  hp: def.hp,
  speed: def.speed,
  // The sort key, so "by Weakness" groups melee/ranged monsters together the same
  // way it groups the elements — not by which axis they happen to use.
  weakness: weaknessTag(def.weakness, def.styleWeakness)?.label ?? '',
  reward: def.reward,
}));
export const BOSS_ENTRIES = LOG_ENTRIES.filter((e) => e.isBoss);
// A boss's escorts are not monsters a wave can send, so they get no line of their
// own — like OSRS, they live on their summoner's page (see `SUMMONS_BY_BOSS`).
// Listing them here would also park an unobtainable entry in the roster.
export const MONSTER_ENTRIES = LOG_ENTRIES.filter((e) => !e.isBoss && !e.summonedBy);
/** Escorts grouped under the boss that summons them, for its detail page. */
export const SUMMONS_BY_BOSS = LOG_ENTRIES.reduce<Record<string, LogEntry[]>>((acc, e) => {
  if (e.summonedBy) (acc[e.summonedBy] ??= []).push(e);
  return acc;
}, {});
export type LogEntry = (typeof LOG_ENTRIES)[number];

/** Collection-log list controls: which entries to show, and how to order them. */
export type LogFilter = 'all' | 'obtained' | 'missing';
export const LOG_FILTERS: { key: LogFilter; label: string; hint: string }[] = [
  { key: 'all', label: 'All', hint: 'Show every entry' },
  { key: 'obtained', label: 'Logged', hint: 'Show only entries you have obtained' },
  { key: 'missing', label: 'Missing', hint: 'Show only entries you are still missing' },
];
/** Sort options offered per tab (enemy tabs vs the Cards tab). `name` is default.
 *  `obtained`/`missing` order by collection status; the rest by the named stat. */
export const ENEMY_SORTS: { key: string; label: string }[] = [
  { key: 'name', label: 'Name' },
  { key: 'count', label: 'Kills' },
  { key: 'hp', label: 'HP' },
  { key: 'speed', label: 'Move speed' },
  { key: 'weakness', label: 'Weakness' },
  { key: 'gold', label: 'Gold' },
  { key: 'obtained', label: 'Logged first' },
  { key: 'missing', label: 'Missing first' },
];
export const DIVERSION_SORTS: { key: string; label: string }[] = [
  { key: 'name', label: 'Name' },
  { key: 'count', label: 'Times met' },
  { key: 'obtained', label: 'Logged first' },
  { key: 'missing', label: 'Missing first' },
];
export const CARD_SORTS: { key: string; label: string }[] = [
  { key: 'name', label: 'Name' },
  { key: 'rarity', label: 'Rarity' },
  { key: 'count', label: 'Quantity' },
  { key: 'obtained', label: 'Logged first' },
  { key: 'missing', label: 'Missing first' },
];

/** Apply the collection-log filter, then sort, to the enemy roster of a tab.
 *  `dir` flips the whole ordering (1 = the sort's natural order, -1 = reversed). */
export function sortedEnemies(entries: readonly LogEntry[], killCounts: Record<string, number>, filter: LogFilter, sort: string, dir: 1 | -1): LogEntry[] {
  const kc = (e: LogEntry) => killCounts[e.type] ?? 0;
  const list = entries.filter((e) => filter === 'all' || (filter === 'obtained' ? kc(e) > 0 : kc(e) === 0));
  const byName = (a: LogEntry, b: LogEntry) => a.name.localeCompare(b.name);
  return list.sort((a, b) => dir * (() => {
    switch (sort) {
      case 'count': return kc(b) - kc(a) || byName(a, b);
      case 'hp': return b.hp - a.hp || byName(a, b);
      case 'speed': return b.speed - a.speed || byName(a, b);
      case 'gold': return b.reward - a.reward || byName(a, b);
      case 'weakness': return a.weakness.localeCompare(b.weakness) || byName(a, b);
      case 'obtained': return (kc(b) > 0 ? 1 : 0) - (kc(a) > 0 ? 1 : 0) || byName(a, b);
      case 'missing': return (kc(a) > 0 ? 1 : 0) - (kc(b) > 0 ? 1 : 0) || byName(a, b);
      default: return byName(a, b);
    }
  })());
}

/** Apply the collection-log filter, then sort, to the Distractions & Diversions
 *  cast. "Obtained" here means *met* — one has turned up on the board at least once. */
export function sortedDiversions(met: Record<string, number>, filter: LogFilter, sort: string, dir: 1 | -1): DiversionDef[] {
  const n = (d: DiversionDef) => met[d.id] ?? 0;
  const list = DIVERSIONS.filter((d) => filter === 'all' || (filter === 'obtained' ? n(d) > 0 : n(d) === 0));
  const byName = (a: DiversionDef, b: DiversionDef) => a.name.localeCompare(b.name);
  return list.sort((a, b) => dir * (() => {
    switch (sort) {
      case 'count': return n(b) - n(a) || byName(a, b);
      case 'obtained': return (n(b) > 0 ? 1 : 0) - (n(a) > 0 ? 1 : 0) || byName(a, b);
      case 'missing': return (n(a) > 0 ? 1 : 0) - (n(b) > 0 ? 1 : 0) || byName(a, b);
      default: return byName(a, b);
    }
  })());
}

/** Apply the collection-log filter, then sort, to the draft-card pool. */
export function sortedCards(cardCounts: Record<string, number>, filter: LogFilter, sort: string, dir: 1 | -1): DraftCard[] {
  const cc = (c: DraftCard) => cardCounts[c.id] ?? 0;
  const list = DRAFT_POOL.filter((c) => filter === 'all' || (filter === 'obtained' ? cc(c) > 0 : cc(c) === 0));
  const byName = (a: DraftCard, b: DraftCard) => a.name.localeCompare(b.name);
  return list.sort((a, b) => dir * (() => {
    switch (sort) {
      case 'count': return cc(b) - cc(a) || byName(a, b);
      case 'rarity': return RARITY_WEIGHT[a.rarity] - RARITY_WEIGHT[b.rarity] || byName(a, b);
      case 'obtained': return (cc(b) > 0 ? 1 : 0) - (cc(a) > 0 ? 1 : 0) || byName(a, b);
      case 'missing': return (cc(a) > 0 ? 1 : 0) - (cc(b) > 0 ? 1 : 0) || byName(a, b);
      default: return byName(a, b);
    }
  })());
}
/** Placeholder shown when a filter empties the current list (e.g. "Missing" with
 *  everything already logged). */
export function LogEmpty() {
  return (
    <div className="flex-1 min-h-0 flex items-center justify-center text-[0.8em] text-[#b3a585] py-[2em]">
      Nothing here for this filter.
    </div>
  );
}
/** Collection Log / Boss Log: a centred OSRS window with Bosses / Monsters / Cards
 *  tabs. Enemies show their baked sprite + lifetime kill count; the Cards tab shows
 *  every draft card with its lifetime pick count. Unobtained entries are darkened
 *  silhouettes (collection-log style). A completion counter per tab. */
export function CollectionLog({ killCounts, cardCounts, diversionsMet, achievements, victories, difficulty, tab, setTab, onClose, globalLock }: {
  killCounts: Record<string, number>;
  cardCounts: Record<string, number>;
  /** Lifetime meetings per Distraction & Diversion id. */
  diversionsMet: Record<string, number>;
  /** Completed Combat Achievement ids, account-wide. */
  achievements: string[];
  victories: Victories;
  difficulty: DifficultyProgress;
  tab: 'bosses' | 'monsters' | 'cards' | 'diversions' | 'victories' | 'difficulty' | 'achievements';
  setTab: (t: 'bosses' | 'monsters' | 'cards' | 'diversions' | 'victories' | 'difficulty' | 'achievements') => void;
  onClose: () => void;
  globalLock: boolean;
}) {
  const isCards = tab === 'cards';
  const isDiversions = tab === 'diversions';
  const isVictories = tab === 'victories';
  const isDifficulty = tab === 'difficulty';
  const isAchievements = tab === 'achievements';
  // Unknown stored ids (a task retired in a later patch) are kept in the store but
  // never counted here — the ladder only knows the tasks that exist today.
  const caDone = useMemo(() => new Set(achievements), [achievements]);
  const caProgress = useMemo(() => tierProgress(caDone), [caDone]);
  // Memoised so the empty case is one stable array: a fresh literal per render would
  // re-run every list memo below on tabs that show no enemies at all.
  const entries = useMemo(() => (tab === 'bosses' ? BOSS_ENTRIES : tab === 'monsters' ? MONSTER_ENTRIES : []), [tab]);
  const total = isAchievements ? CA_TASKS.length : isCards ? DRAFT_POOL.length : isDiversions ? DIVERSIONS.length : entries.length;
  const obtained = isAchievements
    ? CA_TASKS.filter((t) => caDone.has(t.id)).length
    : isCards
    ? DRAFT_POOL.filter((c) => (cardCounts[c.id] ?? 0) > 0).length
    : isDiversions
    ? DIVERSIONS.filter((d) => (diversionsMet[d.id] ?? 0) > 0).length
    : entries.filter((e) => (killCounts[e.type] ?? 0) > 0).length;
  const complete = total > 0 && obtained === total;
  // The clicked entry, shown as a detail card (stats + animated sprite). Enemy
  // tabs only — cards self-describe, so the Cards grid isn't drill-down.
  const [selected, setSelected] = useState<string | null>(null);
  // List controls: show all/logged/missing, and the sort key + direction. Sort
  // keys are tab-specific, so reset to 'name' when the active tab changes.
  const [filter, setFilter] = useState<LogFilter>('all');
  const [sort, setSort] = useState('name');
  const [dir, setDir] = useState<1 | -1>(1);
  const sortOptions = isCards ? CARD_SORTS : isDiversions ? DIVERSION_SORTS : ENEMY_SORTS;
  const dispEnemies = useMemo(() => sortedEnemies(entries, killCounts, filter, sort, dir), [entries, killCounts, filter, sort, dir]);
  const dispCards = useMemo(() => sortedCards(cardCounts, filter, sort, dir), [cardCounts, filter, sort, dir]);
  const dispDiversions = useMemo(() => sortedDiversions(diversionsMet, filter, sort, dir), [diversionsMet, filter, sort, dir]);
  return (
    <MovablePanel
      id="collection-log"
      globalLock={globalLock}
      className="rs-panel absolute top-10 left-1/2 z-30 w-[30em] flex flex-col p-3"
      style={{ marginLeft: '-15em', maxHeight: '82vh', fontSize: fs('clamp(14px, 0.9vw, 19px)') }}
    >
      <div className="rs-panel-title flex items-center justify-between">
        <span className="flex items-center gap-2">
          <img src={iconUrl('Collection_log')} alt="" className="w-[1.3em] h-[1.3em] object-contain" onError={hideBrokenImg} />
          Collection Log
        </span>
        <button onClick={onClose} title="Close" className="rs-btn px-[0.5em] py-0 text-[0.8em]">✕</button>
      </div>
      <div className="flex items-center justify-between gap-[0.4em] mt-[0.4em] mb-[0.5em]">
        {/* The tabs no longer fit one row beside the counter at every UI scale, so the
            strip wraps and the counter keeps its corner rather than spilling out. */}
        <div className="flex flex-wrap gap-[0.3em] min-w-0">
          {(['bosses', 'monsters', 'cards', 'diversions', 'victories', 'difficulty', 'achievements'] as const).map((t) => (
            <button
              key={t}
              onClick={() => { setTab(t); setSelected(null); setSort('name'); }}
              title={
                t === 'cards' ? 'Reward cards collected'
                  : t === 'diversions' ? 'Distractions & Diversions you have met'
                  : t === 'victories' ? 'Runs won'
                  : t === 'difficulty' ? 'New Game+ progress'
                  : t === 'achievements' ? 'Combat Achievements — clear a tier for its title'
                  : `${t === 'bosses' ? 'Bosses' : 'Monsters'} slain`
              }
              className={`rs-btn px-[0.8em] py-[0.15em] text-[0.78em] capitalize ${tab === t ? 'rs-btn-primary' : ''}`}
            >
              {t}
            </button>
          ))}
        </div>
        {!isVictories && !isDifficulty && (
          <span className="text-[0.78em] font-bold shrink-0 whitespace-nowrap self-start" style={{ color: complete ? 'var(--osrs-green)' : 'var(--osrs-yellow)' }}>
            {obtained}/{total} {isAchievements ? 'done' : 'found'}
          </span>
        )}
      </div>

      {/* List controls (grid view only): filter by collection status, and choose
          the sort key + direction. Hidden in the drill-down detail view and the
          Victories record and Difficulty view (neither has a list to filter). */}
      {!selected && !isVictories && !isDifficulty && !isAchievements && (
        <div className="flex items-center justify-between gap-[0.4em] mb-[0.5em] flex-wrap">
          <div className="flex gap-[0.2em]">
            {LOG_FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                title={f.hint}
                className={`rs-btn px-[0.55em] py-[0.1em] text-[0.7em] ${filter === f.key ? 'rs-btn-primary' : ''}`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-[0.3em]">
            <span className="text-[0.66em] text-[#b3a585] uppercase tracking-wide">Sort</span>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value)}
              title="Choose how to sort the list"
              className="rs-select text-[0.72em] px-[0.3em] py-[0.1em]"
            >
              {sortOptions.map((o) => (
                <option key={o.key} value={o.key}>{o.label}</option>
              ))}
            </select>
            <button
              onClick={() => setDir((d) => (d === 1 ? -1 : 1))}
              title={dir === 1 ? 'Descending order' : 'Ascending order'}
              className="rs-btn px-[0.5em] py-[0.1em] text-[0.72em] leading-none"
            >
              {sort === 'name' ? (dir === 1 ? 'A→Z' : 'Z→A') : (dir === 1 ? '▼' : '▲')}
            </button>
          </div>
        </div>
      )}
      {isAchievements
        ? (
          <div className="overflow-y-auto custom-scrollbar pr-[0.2em] flex-1 min-h-0 py-[0.1em]">
            {CA_TIERS.map((tier) => {
              const p = caProgress[tier];
              const cleared = p.total > 0 && p.done === p.total;
              return (
                <div key={tier} className="mb-3 last:mb-0">
                  <div className="flex items-center justify-between mb-[0.2em]">
                    <span className="flex items-center gap-[0.35em]">
                      <img src={ASSETS.achievements[tier]} alt="" className="w-[1.45em] h-[1.45em] object-contain" onError={hideBrokenImg} />
                      <span className="text-[0.66em] uppercase tracking-wide text-[#b3a585]">{CA_TIER_NAMES[tier]}</span>
                    </span>
                    <span className={`text-[0.72em] ${cleared ? 'text-osrs-yellow font-bold' : 'text-[#cdbe91]'}`}>
                      {p.done}/{p.total}{cleared ? ' · Title earned' : ''}
                    </span>
                  </div>
                  <div className="rs-progress"><div className="rs-progress-fill" style={{ width: `${p.total > 0 ? (p.done / p.total) * 100 : 0}%` }} /></div>
                  {CA_TASKS.filter((t) => t.tier === tier).map((t) => {
                    const done = caDone.has(t.id);
                    return (
                      <div key={t.id} className="py-[0.25em]">
                        <div className={done ? 'text-osrs-yellow font-bold' : 'text-[#8a7d5c]'}>
                          {done ? '★ ' : ''}{t.name}
                          {t.mode ? <span className="text-[0.72em] text-[#b3a585]"> ({t.mode === 'classic' ? 'Classic' : 'Roguelite'} only)</span> : null}
                        </div>
                        {/* The description is what tells a player how to earn it, so it
                            stays legible on an unearned task rather than dimming with it. */}
                        <div className="text-[0.72em] text-[#b3a585] leading-snug">{t.desc}</div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )
        : isDifficulty
        ? (
          <div className="overflow-y-auto custom-scrollbar pr-[0.2em] flex-1 min-h-0 py-[0.1em]">
            {(['classic', 'roguelite'] as const).map((mode) => (
              <div key={mode} className="mb-3 last:mb-0">
                <div className="text-[0.66em] text-[#b3a585] uppercase tracking-wide mb-[0.2em]">
                  {mode === 'classic' ? 'Classic' : 'Roguelite'}
                </div>
                {DIFFICULTY_TIERS.map((t) => {
                  const rec = difficulty.records[`${mode}:${t.id}`];
                  const cleared = t.id <= difficulty.highestCleared[mode];
                  return (
                    <div key={t.id} className="flex items-center justify-between py-[0.3em]">
                      <span className={cleared ? 'text-osrs-yellow font-bold' : 'text-[#8a7d5c]'}>
                        {cleared ? '★ ' : ''}{tierLabel(t.id)}
                      </span>
                      <span className="text-[0.8em] text-[#cdbe91]">
                        {rec?.fastestSeconds != null ? fmtTime(rec.fastestSeconds) : '—'}
                        {rec && rec.highestEndlessWave > 0 ? ` · Endless ${rec.highestEndlessWave}` : ''}
                      </span>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )
        : isVictories
        ? (
          <div className="overflow-y-auto custom-scrollbar pr-[0.2em] flex-1 min-h-0 py-[0.1em]">
            {victories.total === 0 ? (
              <div className="text-center text-[#b3a585] text-[0.82em] py-[2em] leading-relaxed">
                No runs won yet.<br />Defeat every boss in a single run to claim victory.
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2 text-[0.9em]">
                  <GoStat icon={ASSETS.misc.multicombat_icon} label="Victories" value={fmt(victories.total)} />
                  <GoStat icon={ASSETS.misc.compass} label="Fastest clear" value={victories.fastestSeconds == null ? '—' : fmtTime(victories.fastestSeconds)} />
                  <GoStat icon={ASSETS.misc.stats_icon} label="Highest Endless" value={victories.highestEndlessWave > 0 ? `Wave ${fmt(victories.highestEndlessWave)}` : '—'} />
                  <GoStat icon={ASSETS.misc.cards_icon} label="Roguelite wins" value={fmt(victories.byMode.roguelite)} />
                </div>
                <div className="rs-panel-inset flex items-center justify-center gap-[0.5em] py-[0.5em] mt-3 text-[0.82em] text-[#d3c3a0]">
                  <span className="flex items-center gap-[0.3em] text-osrs-yellow font-bold">
                    <img src={ASSETS.misc.trophy} alt="" className="w-[1.1em] h-[1.1em] object-contain" />
                    Champion
                  </span>
                  <span className="uppercase tracking-wide">
                    {victories.byMode.classic} classic · {victories.byMode.roguelite} roguelite
                  </span>
                </div>
              </>
            )}
          </div>
        )
        : isDiversions
        ? dispDiversions.length === 0
          ? <LogEmpty />
          : (
            // No drill-down: a diversion is one sprite, one line and one payout, and
            // all three fit on the card. What the log is for here is the checklist —
            // who has turned up on your board, and how often.
            <div className="grid grid-cols-3 gap-[0.4em] overflow-y-auto custom-scrollbar pr-[0.2em] flex-1 min-h-0">
              {dispDiversions.map((d) => {
                const n = diversionsMet[d.id] ?? 0;
                return (
                  <div
                    key={d.id}
                    className={`rs-log-entry ${n > 0 ? '' : 'rs-log-locked'}`}
                    title={n > 0 ? `${d.name} — ${d.tip} · met ${n} time${n === 1 ? '' : 's'}` : `${d.name} — not met yet`}
                  >
                    <div className="rs-log-sprite" style={diversionSpriteStyle(d.id, n > 0)} />
                    <span className="rs-log-name">{d.name}</span>
                    <span className="rs-log-kc">{n > 0 ? `× ${fmt(n)}` : '0'}</span>
                  </div>
                );
              })}
            </div>
          )
        : isCards
        ? selected
          ? (() => {
              // Inspect one card enlarged; wrap-around prev/next follow the
              // current filter+sort order (fall back to the full pool if the
              // selected card was filtered out).
              const nav = dispCards.some((c) => c.id === selected) ? dispCards : DRAFT_POOL;
              const idx = nav.findIndex((c) => c.id === selected);
              const card = nav[idx];
              if (!card) return null;
              const prev = nav[(idx - 1 + nav.length) % nav.length];
              const next = nav[(idx + 1) % nav.length];
              return (
                <CardInspect
                  card={card}
                  count={cardCounts[card.id] ?? 0}
                  onBack={() => setSelected(null)}
                  onPrev={() => setSelected(prev.id)}
                  onNext={() => setSelected(next.id)}
                  position={{ index: idx + 1, total: nav.length }}
                />
              );
            })()
          : dispCards.length === 0
          ? <LogEmpty />
          : (
            <div className="grid grid-cols-3 gap-[0.55em] overflow-y-auto custom-scrollbar pr-[0.2em] flex-1 min-h-0 py-[0.1em]">
              {dispCards.map((c) => {
                const n = cardCounts[c.id] ?? 0;
                return (
                  <div key={c.id} className="transition-transform duration-100 hover:scale-[1.06] hover:z-10">
                    <DraftCardView card={c} locked={n === 0} count={n} fill onPick={() => setSelected(c.id)} />
                  </div>
                );
              })}
            </div>
          )
        : selected
        ? (() => {
            // A summon (escort) has no line in the roster — it lives on its
            // summoner's page. When one is opened, browse within that boss's
            // escorts and let Back return to the boss; otherwise navigate the
            // current filter+sort order (falling back to the full tab list if the
            // selected entry was filtered out). Wrap around so prev/next stay live.
            const summoner = ENEMIES[selected]?.summonedBy;
            const nav = summoner
              ? (SUMMONS_BY_BOSS[summoner] ?? [])
              : dispEnemies.some((e) => e.type === selected) ? dispEnemies : entries;
            const idx = nav.findIndex((e) => e.type === selected);
            const prev = nav[(idx - 1 + nav.length) % nav.length];
            const next = nav[(idx + 1) % nav.length];
            return (
              <LogDetail
                type={selected}
                kc={killCounts[selected] ?? 0}
                killCounts={killCounts}
                onBack={() => setSelected(summoner ?? null)}
                onPrev={() => setSelected(prev.type)}
                onNext={() => setSelected(next.type)}
                onSelect={setSelected}
                position={{ index: idx + 1, total: nav.length }}
              />
            );
          })()
        : dispEnemies.length === 0
        ? <LogEmpty />
        : (
          <div className="grid grid-cols-3 gap-[0.4em] overflow-y-auto custom-scrollbar pr-[0.2em] flex-1 min-h-0">
            {dispEnemies.map((e) => {
              const kc = killCounts[e.type] ?? 0;
              const seen = kc > 0;
              const style = enemySpriteStyle(e.type, true);
              return (
                <button
                  key={e.type}
                  onClick={() => setSelected(e.type)}
                  className={`rs-log-entry ${seen ? '' : 'rs-log-locked'}`}
                  title={`${e.name} — ${kc} kill${kc === 1 ? '' : 's'} · click for info`}
                >
                  <div className="rs-log-sprite" style={style}>{style ? null : '?'}</div>
                  <span className="rs-log-name">{e.name}</span>
                  <span className="rs-log-kc">{seen ? `× ${fmt(kc)}` : '0'}</span>
                </button>
              );
            })}
          </div>
        )}
    </MovablePanel>
  );
}

/** Detail card for one bestiary entry: an enlarged looping walk sprite + the
 *  enemy's combat stats and lifetime kill count. Opened by clicking a log card.
 *  A boss's page also lists the escorts it summons — they have no line of their
 *  own in the roster, so this is where they are collected. */
export function LogDetail({ type, kc, killCounts, onBack, onPrev, onNext, onSelect, position }: {
  type: string; kc: number; killCounts: Record<string, number>; onBack: () => void;
  onPrev: () => void; onNext: () => void; onSelect: (type: string) => void;
  position: { index: number; total: number };
}) {
  // Which body is on show. One monster, several looks: the Barrows brothers share
  // a stat block, so the log keeps one entry and lets you leaf through the bodies.
  const [pickedLook, setPickedLook] = useState<string | null>(null);
  const def = ENEMIES[type as keyof typeof ENEMIES];
  const looks = LOOKS_BY_TYPE[type as EnemyType];
  // A look picked for the *previous* monster can't match this one's, so walking to
  // the next entry falls back to its own body without an effect to reset it.
  const shown = pickedLook && looks?.some((l) => l.slug === pickedLook) ? pickedLook : defaultLookSlug(type);
  if (!def) return null;
  const wk = weaknessTag(def.weakness, def.styleWeakness);
  const style = enemySlugSpriteStyle(shown, true);
  const summons = SUMMONS_BY_BOSS[type] ?? [];
  return (
    <div className="overflow-y-auto custom-scrollbar pr-[0.2em] flex-1 min-h-0">
      <div className="flex items-center justify-between mb-[0.6em]">
        <button onClick={onBack} title="Back to the list" className="rs-btn px-[0.7em] py-[0.2em] text-[0.75em]">◂ Back</button>
        <div className="flex items-center gap-[0.4em]">
          <button onClick={onPrev} title="Previous (anterior)" className="rs-btn px-[0.7em] py-[0.2em] text-[0.85em] leading-none">‹</button>
          <span className="text-[0.7em] text-[#d3c3a0] tabular-nums">{position.index} / {position.total}</span>
          <button onClick={onNext} title="Next (próximo)" className="rs-btn px-[0.7em] py-[0.2em] text-[0.85em] leading-none">›</button>
        </div>
      </div>
      <div className="rs-panel-inset p-[0.7em] flex gap-[0.8em] items-start">
        <div
          className="rs-log-sprite shrink-0"
          style={{ ...style, fontSize: '2.4em' }}
        >
          {style ? null : '?'}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-[0.5em] mb-[0.4em]">
            <span className="text-osrs-orange font-bold text-[1.05em] truncate">{def.name}</span>
            {def.isBoss && <span className="text-[0.6em] text-osrs-red uppercase tracking-wide">Boss</span>}
          </div>
          {looks && looks.length > 1 && LOOK_BY_SLUG[shown] && (
            <div className="text-[0.72em] text-[#cdbb91] -mt-[0.25em] mb-[0.35em] truncate">{LOOK_BY_SLUG[shown]!.name}</div>
          )}
          <div className="grid grid-cols-2 gap-x-[0.6em] gap-y-[0.2em] text-[0.78em]">
            <span className="text-[#d3c3a0]">Kills</span>
            <span className="text-right text-osrs-yellow font-bold">{fmt(kc)}</span>
            <span className="text-[#d3c3a0]">HP</span>
            <span className="text-right text-white">{def.hp}</span>
            <span className="text-[#d3c3a0]">Move speed</span>
            <span className="text-right text-white">{def.speed}</span>
            <span className="text-[#d3c3a0]">Weakness</span>
            <span className="text-right capitalize" style={{ color: wk?.color ?? '#9a9a9a' }}>{wk ? wk.label : 'None'}</span>
            <span className="text-[#d3c3a0]">Gold</span>
            <span className="text-right text-osrs-yellow">{def.reward}</span>
          </div>
        </div>
      </div>
      {bossTip(type) && (
        <div className="rs-panel-inset p-[0.7em] mt-[0.5em]">
          <div className="text-[0.7em] text-[#b3a585] uppercase tracking-wide mb-[0.4em]">How to kill</div>
          <p className="text-[0.75em] text-[#cdbb91] leading-snug">{bossTip(type)}</p>
        </div>
      )}
      {looks && looks.length > 1 && (
        <div className="rs-panel-inset p-[0.7em] mt-[0.5em]">
          <div className="text-[0.7em] text-[#b3a585] uppercase tracking-wide mb-[0.5em]">Variants</div>
          <div className="flex flex-wrap gap-[0.4em]">
            {looks.map((l) => (
              <button
                key={l.slug}
                onClick={() => setPickedLook(l.slug)}
                title={l.name}
                className={`flex flex-col items-center gap-[0.15em] rounded px-[0.25em] py-[0.15em] border transition-colors ${shown === l.slug ? 'border-osrs-orange bg-osrs-orange/15' : 'border-transparent hover:bg-[#3a3327]'}`}
              >
                <div className="rs-log-sprite shrink-0" style={{ ...enemySlugSpriteStyle(l.slug, shown === l.slug), fontSize: '0.75em' }} />
                <span className="text-[0.62em] text-[#e8dcc0] max-w-[6em] truncate">{l.name}</span>
              </button>
            ))}
          </div>
          <p className="text-[0.68em] text-[#9a8d70] mt-[0.5em] leading-snug">
            The same monster wearing a different body — stats, drops and kills are shared.
          </p>
        </div>
      )}
      {summons.length > 0 && (
        <div className="rs-panel-inset p-[0.7em] mt-[0.5em]">
          <div className="text-[0.7em] text-[#b3a585] uppercase tracking-wide mb-[0.5em]">Summons</div>
          <div className="flex flex-col gap-[0.4em]">
            {summons.map((s) => {
              const n = killCounts[s.type] ?? 0;
              return (
                <button
                  key={s.type}
                  onClick={() => onSelect(s.type)}
                  title={`${s.name} — ${n} kill${n === 1 ? '' : 's'} · click for stats`}
                  className={`flex items-center gap-[0.6em] w-full text-left rounded px-[0.2em] py-[0.1em] transition-colors hover:bg-[#3a3327] ${n > 0 ? '' : 'rs-log-locked'}`}
                >
                  <div className="rs-log-sprite shrink-0" style={{ ...enemySpriteStyle(s.type, true), fontSize: '0.75em' }} />
                  <span className="flex-1 min-w-0 truncate text-[0.8em] text-[#e8dcc0]">{s.name}</span>
                  <span className="text-[0.8em] tabular-nums" style={{ color: n > 0 ? 'var(--osrs-yellow)' : '#7a7060' }}>
                    {n > 0 ? `× ${fmt(n)}` : '0'}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="text-[0.68em] text-[#9a8d70] mt-[0.5em] leading-snug">
            Escorts, not wave monsters — they only appear alongside {def.name}, and pay no gold.
          </p>
        </div>
      )}
    </div>
  );
}

/** Detail view for one draft card: the card face rendered large enough to read,
 *  plus its rarity, full examine text and lifetime pick count. Opened by clicking
 *  a Cards-tab entry; prev/next wrap around the whole pool. Always full-colour
 *  (even un-drafted) so the card can actually be inspected. */
export function CardInspect({ card, count, onBack, onPrev, onNext, position }: {
  card: DraftCard; count: number; onBack: () => void;
  onPrev: () => void; onNext: () => void;
  position: { index: number; total: number };
}) {
  const obtained = count > 0;
  return (
    <div className="overflow-y-auto custom-scrollbar pr-[0.2em] flex-1 min-h-0">
      <div className="flex items-center justify-between mb-[0.6em]">
        <button onClick={onBack} title="Back to the list" className="rs-btn px-[0.7em] py-[0.2em] text-[0.75em]">◂ Back</button>
        <div className="flex items-center gap-[0.4em]">
          <button onClick={onPrev} title="Previous (anterior)" className="rs-btn px-[0.7em] py-[0.2em] text-[0.85em] leading-none">‹</button>
          <span className="text-[0.7em] text-[#d3c3a0] tabular-nums">{position.index} / {position.total}</span>
          <button onClick={onNext} title="Next (próximo)" className="rs-btn px-[0.7em] py-[0.2em] text-[0.85em] leading-none">›</button>
        </div>
      </div>
      <div className="flex flex-col items-center gap-[0.7em]">
        <div style={{ width: 'clamp(150px, 46%, 200px)' }}>
          <DraftCardView card={card} fill />
        </div>
        <div className="rs-panel-inset p-[0.6em] w-full grid grid-cols-2 gap-x-[0.6em] gap-y-[0.25em] text-[0.78em]">
          <span className="text-[#d3c3a0]">Rarity</span>
          <span className="text-right font-bold" style={{ color: RARITY_COLOR[card.rarity] }}>{RARITY_LABEL[card.rarity]}</span>
          <span className="text-[#d3c3a0]">Effect</span>
          <span className="text-right text-white flex items-center justify-end gap-[0.2em] flex-wrap">{renderWithStyleIcons(effectTag(card.effect))}</span>
          <span className="text-[#d3c3a0]">Drafted</span>
          <span className="text-right font-bold" style={{ color: obtained ? 'var(--osrs-yellow)' : '#9a9a9a' }}>
            {obtained ? `× ${fmt(count)}` : 'Not yet'}
          </span>
        </div>
      </div>
    </div>
  );
}
