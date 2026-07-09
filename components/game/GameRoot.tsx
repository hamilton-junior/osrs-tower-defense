'use client';

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { GameEngine, type UIState, type EnemyHoverInfo, type DebuffId, type UnlockItem, type GameMode } from '@/lib/game/core/engine';
import { DRAFT_POOL, RARITY_WEIGHT, type DraftCard, type DraftRarity, type DraftEffect } from '@/lib/game/systems/roguelite-draft';
import { RELICS, type Relic, type RelicTier } from '@/lib/game/systems/relics';
import { AFFIX_DEFS } from '@/lib/game/systems/affixes';
import { TOWERS, TOWER_STYLES } from '@/lib/game/data/towers';
import { utilityAuraBonus, diminishingSum, synergyDamageMult } from '@/lib/game/systems/tower-combat';
import { MovablePanel } from './MovablePanel';
import { DebugPanel } from './DebugPanel';
import { PRAYERS, TOWER_PRAYERS } from '@/lib/game/data/prayers';
import { ASSETS, iconUrl } from '@/lib/game/assets';
import { waveClearBonus } from '@/lib/game/systems/rewards';
import { GLOBAL_UPGRADE_DEFS, DEFAULT_UPGRADES, nextCost, isMaxed, formatUpgradeValue, refundValue } from '@/lib/game/systems/meta-progression';
import { SLAYER_REWARDS } from '@/lib/game/data/slayer';
import { ENEMIES } from '@/lib/game/data/enemies';
import { ENEMY_ANIMS, clipDurationS } from '@/lib/game/data/enemy-anims';
import { isPrayerUnlocked, prayerUnlockWave } from '@/lib/game/systems/prayer';
import { ELEMENTS, ELEMENT_ORDER, ANCIENTS, ANCIENT_ORDER, SUPPORT_SPELLS, SUPPORT_ORDER, ELEMENTAL_TIER_NAMES, ANCIENT_TIER_NAMES, elementalSpellName, ancientSpellName, ancientHit, spellSpriteName } from '@/lib/game/systems/magic';
import { MAX_PRAYER_WARDS } from '@/lib/game/systems/prayer-system';
import type { TowerType, PrayerType, MageMode, CombatStyle } from '@/lib/game/types';
import type { DpsSnapshot, DpsTowerStat, DpsWaveStat, EffectStat } from '@/lib/game/systems/combat-stats';
import { FEEDBACK, FEEDBACK_ENABLED, feedbackUrl, type FeedbackContext } from '@/lib/game/feedback';

const TOWER_ORDER: TowerType[] = ['archer', 'wizard', 'cannon', 'tzhaar', 'slayer', 'toxic'];
/** Which interface fills the bottom-right sidebar body (OSRS tabbed-sidebar
 *  model — one stone per interface). 'home' = wave control + tower shop. */
type SideTab = 'home' | 'essence' | 'slayer' | 'dps';
const PRIORITY_LABELS = { first: '1st', last: 'Last', strongest: 'Str', weakest: 'Weak', closest: 'Near' } as const;
const towerIcon = (type: TowerType) => (ASSETS.towers as Record<string, Record<number, string>>)[type]?.[1];
const towerTierIcon = (type: TowerType, tier: number) => (ASSETS.towers as Record<string, Record<number, string>>)[type]?.[tier];
/** Wiki spell-icon URL for a spell-file name (e.g. `Fire_Wave`), if it exists. */
const spellIconUrl = (name: string): string | undefined => ASSETS.spells[name];
/** Label, OSRS icon, theme color and a one-line description for each enemy
 *  debuff. The color frames the icon (a RuneLite-style badge) so the five read
 *  apart at a glance; the description shows on hover in the info panel. */
const DEBUFF_META: Record<DebuffId, { label: string; icon: string; color: string; desc: string }> = {
  slow: { label: 'Slowed', icon: ASSETS.debuffs.slow, color: '#5f7d96', desc: 'Movement speed reduced' },
  stun: { label: 'Stunned', icon: ASSETS.debuffs.stun, color: '#9c6b3f', desc: 'Rooted in place — cannot move' },
  burn: { label: 'Burning', icon: ASSETS.debuffs.burn, color: '#ff7a2a', desc: 'Taking fire damage over time' },
  poison: { label: 'Poisoned', icon: ASSETS.debuffs.poison, color: '#5bd75b', desc: 'Taking poison damage over time' },
  venom: { label: 'Envenomed', icon: ASSETS.debuffs.venom, color: '#0b5c0b', desc: 'Taking venom damage that ramps the longer it stacks' },
  vuln: { label: 'Vulnerable', icon: ASSETS.debuffs.vuln, color: '#c87bff', desc: 'Takes increased damage' },
};
/** Staves cycled per spellbook in the wizard's on-tile picker. */
const WIZ_TOWER = ASSETS.towers.wizard as Record<string, string>;
const WIZARD_STAVES = ['elemental_air', 'elemental_water', 'elemental_earth', 'elemental_fire'].map((k) => WIZ_TOWER[k]);
const WIZARD_SCEPTRES = ['ancient_ice', 'ancient_blood', 'ancient_shadow', 'ancient_smoke'].map((k) => WIZ_TOWER[k]);
const WIZARD_UTILITY_STAFF = WIZ_TOWER['utility'];
/** The staff sprite a placed wizard shows — matches its spellbook & element,
 *  the same image the board renders. */
const wizardStaffUrl = (t: { mageMode?: MageMode; element?: string; ancientType?: string }): string | undefined => {
  const mode = t.mageMode ?? 'elemental';
  if (mode === 'ancients') return WIZ_TOWER[`ancient_${t.ancientType ?? 'ice'}`];
  if (mode === 'utility') return WIZ_TOWER['utility'];
  return WIZ_TOWER[`elemental_${t.element ?? 'air'}`];
};
/** Spellbook tab icon for a wizard's mode (Elemental→Standard, Ancients→Ancient,
 *  Utility→Arceuus). */
const spellbookIcon = (mode?: MageMode): string =>
  mode === 'ancients' ? ASSETS.misc.spellbook_ancient
    : mode === 'utility' ? ASSETS.misc.spellbook_arceuus
      : ASSETS.misc.spellbook_standard;
/** The old 6-tower on-map picker is kept in the source but disabled — the wizard
 *  now gets a spellbook picker on its tile instead. Flip to re-enable it. */
const SHOW_TOWER_PICKER = false;
const hideBrokenImg = (e: React.SyntheticEvent<HTMLImageElement>) => { (e.target as HTMLImageElement).style.display = 'none'; };

/** Attack type per tower, for the damage icon/label in the stats panel. */
const TOWER_COMBAT: Record<TowerType, { icon: string; label: string }> = {
  archer: { icon: ASSETS.misc.ranged_icon, label: 'Ranged' },
  wizard: { icon: ASSETS.misc.magic_icon, label: 'Magic' },
  cannon: { icon: ASSETS.misc.ranged_icon, label: 'Ranged' },
  tzhaar: { icon: ASSETS.misc.strength_icon, label: 'Melee' },
  slayer: { icon: ASSETS.misc.strength_icon, label: 'Melee' },
  toxic: { icon: ASSETS.misc.ranged_icon, label: 'Ranged' },
};

/** Each non-wizard tower's signature niche — the specific scenario where it earns
 *  its slot over the wizard (which owns raw single-target + AoE). Copy mirrors the
 *  maths in systems/tower-identity.ts and the on-hit effects in the engine. Notes
 *  gated on a tier the tower hasn't reached are shown locked, so upgrading carries
 *  a visible promise. The wizard returns null — it has its own spellbook section. */
function towerSignature(
  type: TowerType,
  level: number,
): { label: string; desc: string; notes: { text: string; active: boolean }[] } | null {
  switch (type) {
    case 'archer':
      return {
        label: 'Twin Shot',
        desc: 'Fast, relentless arrows — raw single-target volume.',
        notes: [
          { text: 'Lv3 Dark Bow: looses a 2nd arrow at the next target', active: level >= 3 },
          { text: 'Lv4: arrows bite harder vs high-HP foes', active: level >= 4 },
        ],
      };
    case 'cannon':
      return {
        label: 'Full Splash',
        desc: 'Every shell detonates for FULL damage on all caught in the blast — no AoE falloff like the Ancients barrage.',
        notes: [{ text: 'Blast radius widens with each tier', active: true }],
      };
    case 'tzhaar':
      return {
        label: 'Knockback',
        desc: 'Shoves enemies back down the path, stalling the rush — crowd control the wizard can’t match.',
        notes: [
          { text: 'Every hit also briefly stuns (daggers 0.3–0.45s)', active: true },
          { text: 'Lv3 maul: crushes for the full 0.6s stun', active: level >= 3 },
        ],
      };
    case 'slayer':
      return {
        label: 'Slayer Mark',
        desc: 'Bonus damage by monster category — your answer to tasks, Superiors and bosses.',
        notes: [
          { text: '+50% vs your current Slayer task', active: true },
          { text: '+30% vs Superiors · +25% vs bosses', active: true },
        ],
      };
    case 'toxic':
      return {
        label: 'Venom',
        desc: 'Drips venom — its own dark-green DoT, apart from poison.',
        notes: [
          { text: 'Each hit ramps the venom up to a damage-scaled cap', active: true },
          { text: 'Keeps ticking after foes leave its range', active: true },
          { text: 'Ignores crowd-control resistance — bites bosses just as hard', active: true },
        ],
      };
    case 'wizard':
      return {
        label: 'Arcane Mastery',
        desc: 'The complete caster — pick a spellbook below to specialise.',
        notes: [
          { text: 'Elemental: raw single-target + weakness bonus', active: true },
          { text: 'Ancients: true AoE barrages with a status', active: true },
          { text: 'Utility: an always-on aura that buffs nearby towers', active: true },
        ],
      };
    default:
      return null;
  }
}

const TICK_MS = 600; // OSRS game tick = 0.6s
const TILE_PX = 32; // grid tile size in logic px (mirrors engine GRID)
const pct = (frac: number) => `+${Math.round(frac * 100)}%`;

/** "3 ticks (1.8s)" from a cooldown in ms. */
const attackSpeed = (cooldownMs: number) => {
  const ticks = Math.max(1, Math.round(cooldownMs / TICK_MS));
  return `${ticks} ${ticks === 1 ? 'tick' : 'ticks'} (${(cooldownMs / 1000).toFixed(1)}s)`;
};

const INITIAL: UIState = {
  money: 200, lives: 20, maxLives: 20, wave: 1, waveActive: false,
  remaining: 0, waveTotal: 0, bossWave: false, wavePreview: [], activeEvent: null, bossOnField: false, gameOver: false, selectedTowerType: null, selectedTowerId: null,
  multiSelectedIds: [],
  movingTowerId: null, pendingPlacement: null, pendingMageMode: 'elemental', gameSpeed: 1, paused: false, muted: false, volume: 0.75,
  notice: null, noticeIcon: null, noticeSeq: 0,
  slayerTask: null, slayerPoints: 0, slayerStreak: 0, slayerMaster: 'Turael', slayerHelmet: false,
  prayerPoints: 10, prayerMax: 10, activePrayers: [],
  geOffers: [],
  essence: 0, upgrades: { ...DEFAULT_UPGRADES },
  unlocks: [], unlockSeq: 0,
  killCounts: {},
  cardCounts: {},
  bossesSeen: {},
  dpsStats: null,
  lastWaveSandbox: false,
  gameMode: 'roguelite', pendingDraft: null,
  runMods: {
    damage: { melee: 1, ranged: 1, magic: 1 },
    range: { melee: 1, ranged: 1, magic: 1 },
    fireRate: { melee: 1, ranged: 1, magic: 1 },
  },
  runCards: [],
  pendingRelics: null, ownedRelics: [], draftRerolls: 0,
  autoplay: false, autoplaySecs: 3,
  biomeName: 'Misthalin Plains',
  lifestealSeq: 0,
};

/** Title shown above an unlock's name in the collection-log popup, per kind. */
const UNLOCK_LABEL: Record<UnlockItem['kind'], string> = { prayer: 'Prayer Unlocked' };

const SAVE_KEYS = { essence: 'osrs_td_essence', upgrades: 'osrs_td_upgrades', killCounts: 'osrs_td_killcounts', cardCounts: 'osrs_td_cardcounts', bossesSeen: 'osrs_td_bosses_seen' } as const;

/** Read the persisted account save (meta-progression + Collection Log) from
 *  localStorage, tolerating absent/corrupt data — the engine re-clamps it. */
function loadSave(): { essence: number; upgrades: unknown; killCounts: unknown; cardCounts: unknown; bossesSeen: unknown } {
  if (typeof window === 'undefined') return { essence: 0, upgrades: undefined, killCounts: undefined, cardCounts: undefined, bossesSeen: undefined };
  let essence = 0;
  let upgrades: unknown;
  let killCounts: unknown;
  let cardCounts: unknown;
  let bossesSeen: unknown;
  try { essence = parseInt(localStorage.getItem(SAVE_KEYS.essence) ?? '0', 10) || 0; } catch { /* ignore */ }
  try { upgrades = JSON.parse(localStorage.getItem(SAVE_KEYS.upgrades) ?? 'null'); } catch { /* ignore */ }
  try { killCounts = JSON.parse(localStorage.getItem(SAVE_KEYS.killCounts) ?? 'null'); } catch { /* ignore */ }
  try { cardCounts = JSON.parse(localStorage.getItem(SAVE_KEYS.cardCounts) ?? 'null'); } catch { /* ignore */ }
  try { bossesSeen = JSON.parse(localStorage.getItem(SAVE_KEYS.bossesSeen) ?? 'null'); } catch { /* ignore */ }
  return { essence, upgrades, killCounts, cardCounts, bossesSeen };
}

const prayerIcon = (id: PrayerType) => (ASSETS.prayers as Record<string, string>)[id];
/** Icon for a GE offer / slayer reward / meta upgrade: resolves the data table's
 *  wiki filename to the cache-baked local asset (wiki hot-link as fallback). */
const geIcon = (wiki: string) => iconUrl(wiki);

/** Collection Log roster, split into the Bosses / Monsters tabs (computed once).
 *  Carries the stat fields the log can sort by (hp / speed / weakness / gold). */
const LOG_ENTRIES = Object.entries(ENEMIES).map(([type, def]) => ({
  type,
  name: def.name,
  isBoss: !!def.isBoss,
  hp: def.hp,
  speed: def.speed,
  weakness: def.weakness ?? '',
  reward: def.reward,
}));
const BOSS_ENTRIES = LOG_ENTRIES.filter((e) => e.isBoss);
const MONSTER_ENTRIES = LOG_ENTRIES.filter((e) => !e.isBoss);
type LogEntry = (typeof LOG_ENTRIES)[number];

/** Collection-log list controls: which entries to show, and how to order them. */
type LogFilter = 'all' | 'obtained' | 'missing';
const LOG_FILTERS: { key: LogFilter; label: string; hint: string }[] = [
  { key: 'all', label: 'All', hint: 'Show every entry' },
  { key: 'obtained', label: 'Logged', hint: 'Show only entries you have obtained' },
  { key: 'missing', label: 'Missing', hint: 'Show only entries you are still missing' },
];
/** Sort options offered per tab (enemy tabs vs the Cards tab). `name` is default.
 *  `obtained`/`missing` order by collection status; the rest by the named stat. */
const ENEMY_SORTS: { key: string; label: string }[] = [
  { key: 'name', label: 'Name' },
  { key: 'count', label: 'Kills' },
  { key: 'hp', label: 'HP' },
  { key: 'speed', label: 'Move speed' },
  { key: 'weakness', label: 'Weakness' },
  { key: 'gold', label: 'Gold' },
  { key: 'obtained', label: 'Logged first' },
  { key: 'missing', label: 'Missing first' },
];
const CARD_SORTS: { key: string; label: string }[] = [
  { key: 'name', label: 'Name' },
  { key: 'rarity', label: 'Rarity' },
  { key: 'count', label: 'Quantity' },
  { key: 'obtained', label: 'Logged first' },
  { key: 'missing', label: 'Missing first' },
];

/** Apply the collection-log filter, then sort, to the enemy roster of a tab.
 *  `dir` flips the whole ordering (1 = the sort's natural order, -1 = reversed). */
function sortedEnemies(entries: readonly LogEntry[], killCounts: Record<string, number>, filter: LogFilter, sort: string, dir: 1 | -1): LogEntry[] {
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

/** Apply the collection-log filter, then sort, to the draft-card pool. */
function sortedCards(cardCounts: Record<string, number>, filter: LogFilter, sort: string, dir: 1 | -1): DraftCard[] {
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

/** Show an enemy's baked walk sheet as an icon: the first frame statically, or
 *  (when `animate`) the whole walk cycle looping via a CSS steps animation. The
 *  element width equals one frame, so the shift is `frames` element-widths; we
 *  express it in `em` (3.4em = the `.rs-log-sprite` width) so it tracks the
 *  card's font-size. Returns undefined if nothing is baked. */
function enemySpriteStyle(type: string, animate = false): React.CSSProperties | undefined {
  const clip = ENEMY_ANIMS[type]?.clips.walk;
  if (!clip) return undefined;
  const base: React.CSSProperties = {
    backgroundImage: `url(${clip.url})`,
    backgroundSize: `${clip.frames * 100}% 100%`,
    backgroundPosition: 'left center',
    backgroundRepeat: 'no-repeat',
  };
  if (!animate || clip.frames <= 1) return base;
  const dur = Math.max(0.5, clipDurationS(clip));
  return {
    ...base,
    ['--rs-walk-shift' as string]: `-${clip.frames * 3.4}em`,
    animation: `rs-log-walk ${dur}s steps(${clip.frames}) infinite`,
  };
}

/** Persisted boolean (panel minimize state), tolerant of absent/corrupt data. */
function loadBool(key: string, fallback: boolean): boolean {
  if (typeof window === 'undefined') return fallback;
  try { const v = localStorage.getItem(key); return v == null ? fallback : !!JSON.parse(v); } catch { return fallback; }
}

/** Persisted positive number, tolerant of absent/corrupt data (SSR-safe). */
function loadNum(key: string, fallback: number): number {
  if (typeof window === 'undefined') return fallback;
  try { const v = Number(localStorage.getItem(key)); return Number.isFinite(v) && v > 0 ? v : fallback; } catch { return fallback; }
}

/** Wrap a base font-size (usually a `clamp()`) so it also honours the global
 *  `--ui-scale` nudge from the controls bar. Most panels set their OWN font-size
 *  rather than inheriting `body`, so each must multiply by the scale for the
 *  UI −/+ control to reach it — otherwise only body-inheriting UI (e.g. the
 *  prayer bar) would scale. Panels then scale as one via their `em` children. */
const fs = (base: string) => `calc(${base} * var(--ui-scale, 1))`;

/** Collapse state for a tray, persisted under `key` so it survives the combat
 *  sidebar body unmounting when its tab is minimised — the tray remounts and its
 *  local state would otherwise reset to expanded every time. */
function usePersistedCollapse(key: string): [boolean, () => void] {
  const [collapsed, setCollapsed] = useState(() => loadBool(key, false));
  useEffect(() => { try { localStorage.setItem(key, JSON.stringify(collapsed)); } catch { /* ignore */ } }, [key, collapsed]);
  return [collapsed, () => setCollapsed((c) => !c)];
}

/** Render a stat value, showing `base → buffed` (buffed in green) when a buff
 *  has changed it; a plain string otherwise (the parent styles it). */
function buffedDisplay(base: string, buffed: string, changed: boolean): React.ReactNode {
  if (!changed) return base;
  return (
    <span className="inline-flex items-center gap-[0.3em]">
      <span className="text-[#9a8d70] text-[0.85em]">{base}</span>
      <span className="text-[#cdbe91]">→</span>
      <span className="text-[#5bd75b]">{buffed}</span>
    </span>
  );
}

const fmt = (n: number) => (n >= 10000 ? `${Math.floor(n / 1000)}k` : n.toLocaleString());

/** Seconds → `m:ss` (or `h:mm:ss` past an hour) for the run-summary timer. */
const fmtTime = (s: number) => {
  const t = Math.max(0, Math.floor(s));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const sec = t % 60;
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  return `${h > 0 ? `${h}:` : ''}${mm}:${String(sec).padStart(2, '0')}`;
};

export default function GameRoot() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const [ui, setUi] = useState<UIState>(INITIAL);
  const [banner, setBanner] = useState<{ text: string; tone: 'start' | 'done' | 'boss' } | null>(null);
  const [toast, setToast] = useState<{ text: string; icon: string | null } | null>(null);
  // Collection-log unlock popups, shown one at a time from a queue.
  const [unlockQueue, setUnlockQueue] = useState<{ id: number; item: UnlockItem }[]>([]);
  const unlockIdRef = useRef(0);
  const lastUnlockSeq = useRef(0);
  const [hoverShop, setHoverShop] = useState<TowerType | null>(null);
  // Marquee drag-box multi-select (for batch tower upgrades). Start is kept in
  // client coords; the rendered box is in container pixels. `dragged` suppresses
  // the click that fires on mouse-up after a real drag.
  const marqueeStart = useRef<{ cx: number; cy: number } | null>(null);
  const marqueeDragged = useRef(false);
  const [marqueeBox, setMarqueeBox] = useState<{ l: number; t: number; w: number; h: number } | null>(null);
  // Bottom-right sidebar: which interface tab fills the panel body. The compact
  // shop-style interfaces (Home/towers, GE, Essence, Slayer Rewards) swap inline;
  // Collection Log and Debug still pop out their own larger windows.
  const [tab, setTab] = useState<SideTab>('home');
  const [logOpen, setLogOpen] = useState(false);
  const [logTab, setLogTab] = useState<'bosses' | 'monsters' | 'cards'>('monsters');
  // The title / mode-select screen gates the very first wave; it returns on
  // restart so each run picks its mode afresh.
  const [runStarted, setRunStarted] = useState(false);
  const [debugOpen, setDebugOpen] = useState(false);
  // "How to Play" reference guide — reachable any time from the start screen or
  // the ❓ stone. (The FIRST-visit onboarding is the guided tour below, not this.)
  const [helpOpen, setHelpOpen] = useState(false);
  // In-game feedback launcher (opens NocoDB form links in a new tab). Only shown
  // when at least one form URL is configured in lib/game/feedback.ts.
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  // Learn-as-you-go coaching: instead of one long up-front tour, a single
  // contextual tip surfaces the first time each situation comes up (place a
  // tower, send the first wave, first boss / affix / event…). Each tip is
  // dismissed once and remembered in localStorage, so the game teaches itself
  // gradually without overwhelming a newcomer.
  const [learnSeen, setLearnSeen] = useState<string[]>(() => {
    try { const v = JSON.parse(localStorage.getItem('osrs_td_learn_seen') ?? 'null'); return Array.isArray(v) ? v : []; } catch { return []; }
  });
  useEffect(() => { try { localStorage.setItem('osrs_td_learn_seen', JSON.stringify(learnSeen)); } catch { /* ignore */ } }, [learnSeen]);
  const markTipSeen = useCallback((id: string) => setLearnSeen((s) => (s.includes(id) ? s : [...s, id])), []);
  // "Skip tips" retires every remaining tip; "Replay tips" (from the ❓ guide)
  // wipes the seen set so they all surface again as you play.
  const skipAllTips = useCallback(() => setLearnSeen(LEARN_STEPS.map((s) => s.id)), []);
  const resetTips = useCallback(() => { setHelpOpen(false); setLearnSeen([]); }, []);
  // Minimize state for the prayer bar (collapses to the best prayer per style).
  const [prayersMin, setPrayersMin] = useState(() => loadBool('ui_min_prayers', false));
  useEffect(() => { try { localStorage.setItem('ui_min_prayers', JSON.stringify(prayersMin)); } catch { /* ignore */ } }, [prayersMin]);
  // Docked sidebar collapse: collapsed = a thin rail of tab stones (map grows).
  const [sideCollapsed, setSideCollapsed] = useState(() =>
    (typeof window !== 'undefined' && window.innerWidth < 900) || loadBool('ui_side_collapsed', false));
  useEffect(() => { try { localStorage.setItem('ui_side_collapsed', JSON.stringify(sideCollapsed)); } catch { /* ignore */ } }, [sideCollapsed]);
  // The canvas element resizes when the aside collapses/expands — re-measure.
  useEffect(() => { engineRef.current?.resize(); }, [sideCollapsed]);
  // Start/stop the engine's per-run damage-stats streaming — only while the DPS
  // tab is the visible interface (the engine snapshots its stats just then).
  const dpsVisible = tab === 'dps' && !sideCollapsed;
  useEffect(() => { engineRef.current?.setDpsPanelOpen(dpsVisible); }, [dpsVisible]);
  // Stable so DpsView's unmount-cleanup effect doesn't re-fire every stats tick.
  const highlightTower = useCallback((id: string | null) => engineRef.current?.setHighlightTower(id), []);
  // Optionally hide the always-on Start Wave button (above the tower dock) and
  // drive waves with the spacebar only. Off by default — the button is shown.
  const [hideStartWave, setHideStartWave] = useState(() => loadBool('ui_hide_startwave', false));
  useEffect(() => { try { localStorage.setItem('ui_hide_startwave', JSON.stringify(hideStartWave)); } catch { /* ignore */ } }, [hideStartWave]);
  // Global UI text scale — a manual multiplier on top of the viewport-adaptive
  // base font-size (globals.css), applied as the `--ui-scale` CSS var the body
  // reads. Lets the player dial the whole em-based interface up/down for their
  // display without touching the browser zoom. Persisted; default 1.0 (100%).
  const [uiScale, setUiScale] = useState(() => loadNum('ui_scale', 1));
  useEffect(() => {
    try { localStorage.setItem('ui_scale', String(uiScale)); } catch { /* ignore */ }
    document.documentElement.style.setProperty('--ui-scale', String(uiScale));
  }, [uiScale]);
  // Click a tab stone: from the collapsed rail, expand into that tab; when
  // expanded, clicking the active stone collapses the sidebar (OSRS minimise
  // gesture), any other stone just switches interface.
  const onSideTab = useCallback((t: SideTab) => {
    if (sideCollapsed) { setSideCollapsed(false); setTab(t); return; } // rail → expand into the tab
    if (tab === t) { setSideCollapsed(true); return; } // active stone → collapse (old minimise gesture)
    setTab(t);
  }, [tab, sideCollapsed]);
  // Drives the on-map picker's per-tick animation (cycling staves/spells).
  const [pickerHover, setPickerHover] = useState<TowerType | null>(null);
  const [spellbookHover, setSpellbookHover] = useState<MageMode | null>(null);
  const [animTick, setAnimTick] = useState(0);
  // The enemy info panel: the clicked/pinned enemy, or whichever is hovered.
  const [enemyPanel, setEnemyPanel] = useState<{ info: EnemyHoverInfo; pinned: boolean } | null>(null);
  // Measured pixel size of the enemy panel, so we can clamp it fully on-screen
  // (a %-based flip can't know the panel's real height → it still clipped).
  const enemyPanelRef = useRef<HTMLDivElement>(null);
  const [enemyPanelSize, setEnemyPanelSize] = useState({ w: 0, h: 0 });
  // Whether the upgrade button is hovered, to preview the next tier's stats.
  const [upgradeHover, setUpgradeHover] = useState(false);
  // No global UI lock anymore — each MovablePanel still has its own 📌 pin to
  // lock just itself. Kept as a constant so the panels' globalLock prop stays wired.
  const uiLocked = false;
  const prevWaveActive = useRef(false);

  // Poll the active enemy (pinned by a click, else hovered) so its HP/effects
  // read live and the panel tracks it as it moves.
  useEffect(() => {
    const id = setInterval(() => setEnemyPanel(engineRef.current?.activeEnemySummary() ?? null), 80);
    return () => clearInterval(id);
  }, []);

  // Measure the enemy panel after each render so its placement can be clamped by
  // its true height/width (avoids the flip-but-still-clipped case near the top).
  useLayoutEffect(() => {
    const el = enemyPanelRef.current;
    if (!el) return;
    const w = el.offsetWidth, h = el.offsetHeight;
    if (w !== enemyPanelSize.w || h !== enemyPanelSize.h) setEnemyPanelSize({ w, h });
  });

  // Tick the picker animations on the OSRS cadence, only while it's open.
  useEffect(() => {
    if (!ui.pendingPlacement) { setPickerHover(null); setSpellbookHover(null); return; }
    const id = setInterval(() => setAnimTick((t) => t + 1), 600);
    return () => clearInterval(id);
  }, [ui.pendingPlacement]);

  // ctx.font never triggers an @font-face download, so kick the OSRS faces off
  // now; the canvas redraws every frame and picks them up once loaded.
  useEffect(() => {
    document.fonts?.load('16px RuneScape');
    document.fonts?.load('bold 16px RuneScape');
    document.fonts?.load('12px "RuneScape Small"');
  }, []);

  useEffect(() => {
    if (!canvasRef.current) return;
    const engine = new GameEngine(canvasRef.current, (patch) => setUi((prev) => ({ ...prev, ...patch })), loadSave());
    engineRef.current = engine;
    engine.resize();
    engine.start();
    // Auto-start now lives in the main menu (toggle under Start Wave); its choice
    // persists across runs via localStorage (see the checkbox onChange below).
    engine.setAutoplay(loadBool('ui_autostart', false));
    const onResize = () => engine.resize();
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      engine.stop();
      engineRef.current = null;
    };
  }, []);

  // Persist meta-progression (essence + bought upgrades) whenever it changes, so
  // it carries across runs and reloads. Skips the very first emit (the values the
  // engine just loaded) to avoid a redundant write.
  const metaLoaded = useRef(false);
  useEffect(() => {
    if (!metaLoaded.current) { metaLoaded.current = true; return; }
    try {
      localStorage.setItem(SAVE_KEYS.essence, String(ui.essence));
      localStorage.setItem(SAVE_KEYS.upgrades, JSON.stringify(ui.upgrades));
    } catch { /* ignore */ }
  }, [ui.essence, ui.upgrades]);

  // Persist the Collection Log (lifetime kills per type) separately — it changes
  // on every kill, so it gets its own effect rather than re-writing the meta save.
  const kcLoaded = useRef(false);
  useEffect(() => {
    if (!kcLoaded.current) { kcLoaded.current = true; return; }
    try { localStorage.setItem(SAVE_KEYS.killCounts, JSON.stringify(ui.killCounts)); } catch { /* ignore */ }
  }, [ui.killCounts]);

  // Persist the Cards collection log (lifetime draft-card picks) — like killCounts,
  // it changes mid-run (on each draft pick) so it gets its own effect.
  const ccLoaded = useRef(false);
  useEffect(() => {
    if (!ccLoaded.current) { ccLoaded.current = true; return; }
    try { localStorage.setItem(SAVE_KEYS.cardCounts, JSON.stringify(ui.cardCounts)); } catch { /* ignore */ }
  }, [ui.cardCounts]);

  // Persist which bosses have been seen (gates boss modifiers). Changes the first
  // time each boss appears, so it gets its own effect like the logs above.
  const bsLoaded = useRef(false);
  useEffect(() => {
    if (!bsLoaded.current) { bsLoaded.current = true; return; }
    try { localStorage.setItem(SAVE_KEYS.bossesSeen, JSON.stringify(ui.bossesSeen)); } catch { /* ignore */ }
  }, [ui.bossesSeen]);

  // Flash a banner when a wave begins, and a "complete" banner when it ends.
  useEffect(() => {
    const prev = prevWaveActive.current;
    if (ui.waveActive && !prev) {
      setBanner(
        ui.bossWave
          ? { text: `⚠ BOSS INCOMING ⚠`, tone: 'boss' }
          : { text: `Wave ${ui.wave}`, tone: 'start' },
      );
    } else if (!ui.waveActive && prev && !ui.gameOver) {
      if (ui.lastWaveSandbox) {
        // A debug sandbox wave: no payout, no progression — just acknowledge it.
        setBanner({ text: `Custom Wave Complete!`, tone: 'done' });
      } else {
        const completed = ui.wave - 1;
        const bonus = Math.round(waveClearBonus(completed) * ui.upgrades.rewardMultiplier);
        setBanner({ text: `Wave ${completed} Complete   +${bonus} gp`, tone: 'done' });
      }
    }
    prevWaveActive.current = ui.waveActive;
  }, [ui.waveActive, ui.wave, ui.gameOver, ui.bossWave, ui.lastWaveSandbox]);

  // Auto-dismiss whichever banner is showing.
  useEffect(() => {
    if (!banner) return;
    const t = setTimeout(() => setBanner(null), 1900);
    return () => clearTimeout(t);
  }, [banner]);

  // Show a transient toast whenever the engine reports a blocked action.
  useEffect(() => {
    if (!ui.noticeSeq || !ui.notice) return;
    setToast({ text: ui.notice, icon: ui.noticeIcon });
    const t = setTimeout(() => setToast(null), 1400);
    return () => clearTimeout(t);
  }, [ui.noticeSeq, ui.notice, ui.noticeIcon]);

  // Enqueue each new unlock batch (a wave can unlock several prayers at once),
  // then show them one at a time as collection-log popups.
  useEffect(() => {
    if (!ui.unlockSeq || ui.unlockSeq === lastUnlockSeq.current) return;
    lastUnlockSeq.current = ui.unlockSeq;
    if (ui.unlocks.length === 0) return;
    setUnlockQueue((q) => [...q, ...ui.unlocks.map((item) => ({ id: ++unlockIdRef.current, item }))]);
  }, [ui.unlockSeq, ui.unlocks]);

  // Advance the popup queue; each popup holds ~4.2s (matches the CSS animation).
  useEffect(() => {
    if (unlockQueue.length === 0) return;
    const t = setTimeout(() => setUnlockQueue((q) => q.slice(1)), 4200);
    return () => clearTimeout(t);
  }, [unlockQueue]);

  // Keyboard shortcuts: Esc = pause combat (or cancel a pending action), Space =
  // start next wave, 1/2/5 = speed, Q/W/E/R = swap the selected wizard's element/
  // barrage/field, M = mute.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const eng = engineRef.current;
      if (!eng) return;
      switch (e.key) {
        case 'Escape': e.preventDefault(); eng.escape(); break;
        case ' ': e.preventDefault(); eng.startWave(); break;
        case '1': eng.setGameSpeed(1); break;
        case '2': eng.setGameSpeed(2); break;
        case '3': case '5': eng.setGameSpeed(5); break;
        case 'q': case 'Q': eng.selectWizardSlot(0); break;
        case 'w': case 'W': eng.selectWizardSlot(1); break;
        case 'e': case 'E': eng.selectWizardSlot(2); break;
        case 'r': case 'R': eng.selectWizardSlot(3); break;
        case 'm': case 'M': eng.toggleMute(); break;
        default: break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const toLogic = useCallback((clientX: number, clientY: number) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    const engine = engineRef.current;
    if (!rect || rect.width === 0 || !engine) return { x: 0, y: 0 };
    return {
      x: ((clientX - rect.left) / rect.width) * engine.width,
      y: ((clientY - rect.top) / rect.height) * engine.height,
    };
  }, []);

  const onMove = useCallback((e: React.MouseEvent) => {
    const { x, y } = toLogic(e.clientX, e.clientY);
    engineRef.current?.setPointer(x, y);
    // Marquee drag: once moved past a small threshold, draw the selection box.
    const start = marqueeStart.current;
    if (start && (e.buttons & 1)) {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      if (Math.hypot(e.clientX - start.cx, e.clientY - start.cy) > 6) marqueeDragged.current = true;
      if (marqueeDragged.current) {
        const x0 = start.cx - rect.left, y0 = start.cy - rect.top;
        const x1 = e.clientX - rect.left, y1 = e.clientY - rect.top;
        setMarqueeBox({ l: Math.min(x0, x1), t: Math.min(y0, y1), w: Math.abs(x1 - x0), h: Math.abs(y1 - y0) });
      }
    }
  }, [toLogic]);

  // Start a marquee only when not placing/moving a tower (so click-to-place is
  // untouched). Left button only.
  const onMouseDown = useCallback((e: React.MouseEvent) => {
    const eng = engineRef.current;
    if (e.button !== 0 || !eng || eng.selectedTowerType || eng.movingTowerId) return;
    marqueeStart.current = { cx: e.clientX, cy: e.clientY };
    marqueeDragged.current = false;
  }, []);

  const onMouseUp = useCallback((e: React.MouseEvent) => {
    const start = marqueeStart.current;
    marqueeStart.current = null;
    setMarqueeBox(null);
    if (start && marqueeDragged.current) {
      const a = toLogic(start.cx, start.cy);
      const b = toLogic(e.clientX, e.clientY);
      engineRef.current?.selectTowersInBox(a.x, a.y, b.x, b.y);
    }
  }, [toLogic]);

  const onClick = useCallback((e: React.MouseEvent) => {
    // A real marquee drag already handled selection on mouse-up; swallow the click.
    if (marqueeDragged.current) { marqueeDragged.current = false; return; }
    const { x, y } = toLogic(e.clientX, e.clientY);
    engineRef.current?.handleClick(x, y, e.shiftKey);
  }, [toLogic]);

  const onContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    engineRef.current?.cancelAction();
  }, []);

  // Which boon stat-group chip (damage/range/speed) is hovered in the tower
  // panel — drives its breakdown popover AND highlights the contributing cards
  // over in the Boons panel.
  const [hoverBoonGroup, setHoverBoonGroup] = useState<BoonGroupId | null>(null);

  const selectedTower = ui.selectedTowerId
    ? engineRef.current?.towers.find((t) => t.id === ui.selectedTowerId) ?? null
    : null;
  // Effective (buffed) stats for the selected tower, plus the active potions and
  // prayers boosting it — so the panel can show the bonus and its origin. Boosts
  // key off the tower's combat style and skip unboostable weapons (the cannon).
  const eff = selectedTower ? engineRef.current?.effectiveStats(selectedTower.id) ?? null : null;
  const towerStyle = selectedTower ? TOWER_STYLES[selectedTower.type] : null;
  // The Utility wizard is support-only: it never attacks, so its panel omits the
  // damage / attack-speed lines (its "range" is the aura radius instead).
  const isUtility = selectedTower?.type === 'wizard' && selectedTower.mageMode === 'utility';
  // One chip per active boost on this tower: icon + amount. Potions/prayers key
  // off the weapon's style (boostable only); the Utility aura buffs EVERY tower
  // (incl. the cannon), so it's listed separately with its net (post-diminishing)
  // bonus — which is why it must be computed outside the boostable guard.
  const towerBoosts: { key: string; icon: string; amount: string; title: string }[] = [];
  // Boon-derived stat buffs on the selected tower, grouped by stat. Each group
  // renders as ONE chip (the tower's total from boons); hovering it opens the
  // per-card breakdown and highlights those cards in the Boons panel.
  const boonGroups: Record<BoonGroupId, { total: number; sources: BoonSource[] }> = {
    damage: { total: 1, sources: [] },
    range: { total: 1, sources: [] },
    speed: { total: 1, sources: [] },
  };
  if (selectedTower) {
    if (towerStyle?.boostable) {
      for (const o of ui.geOffers) {
        if (o.kind === 'buff' && o.activeSecs > 0 && (!o.style || o.style === towerStyle.style)) {
          towerBoosts.push({ key: `pot-${o.id}`, icon: geIcon(o.wiki), amount: pct(o.dmg ?? 0), title: `${o.name} — ${o.desc}` });
        }
      }
      for (const p of TOWER_PRAYERS) {
        if (p.style === towerStyle.style && ui.activePrayers.includes(p.id)) {
          const def = PRAYERS.find((d) => d.id === p.id)!;
          towerBoosts.push({ key: `pray-${p.id}`, icon: prayerIcon(p.id), amount: pct(p.dmg), title: `${def.name} — ${def.description}` });
        }
      }
    }
    // Net Utility-aura bonus (with diminishing returns) from in-range supporters.
    const auraR: number[] = [], auraS: number[] = [], auraD: number[] = [];
    for (const t of engineRef.current?.towers ?? []) {
      if (t.id === selectedTower.id || t.type !== 'wizard' || t.mageMode !== 'utility') continue;
      if (Math.hypot(t.x - selectedTower.x, t.y - selectedTower.y) > t.range) continue;
      const b = utilityAuraBonus(t.level);
      if (b.range) auraR.push(b.range);
      if (b.speed) auraS.push(b.speed);
      if (b.damage) auraD.push(b.damage);
    }
    const netD = diminishingSum(auraD), netR = diminishingSum(auraR), netS = diminishingSum(auraS);
    const parts: string[] = [];
    if (netD) parts.push(`${pct(netD)} damage`);
    if (netR) parts.push(`${pct(netR)} range`);
    if (netS) parts.push(`${pct(netS)} attack speed`);
    if (parts.length && WIZARD_UTILITY_STAFF) {
      towerBoosts.push({ key: 'aura', icon: WIZARD_UTILITY_STAFF, amount: pct(netD || netR || netS), title: `Utility aura — ${parts.join(', ')}` });
    }
    // Roguelite relics that touch THIS tower: placement synergies (per-tower,
    // layout-dependent) and magic-spellbook specialisations — one chip each.
    const eng = engineRef.current;
    if (eng && ui.gameMode === 'roguelite') {
      const syn = eng.runFx.synergy;
      for (const key of Object.keys(SYNERGY_CARD_ID) as (keyof typeof syn)[]) {
        if (!syn[key]) continue;
        const m = synergyDamageMult(selectedTower, eng.towers, { [key]: syn[key] } as typeof syn, eng.portalPoint);
        if (m > 1.001) {
          const card = CARD_BY_ID[SYNERGY_CARD_ID[key]];
          if (card) towerBoosts.push({ key: `relic-${key}`, icon: card.icon, amount: pct(m - 1), title: `${card.name} — ${effectTag(card.effect)}` });
        }
      }
      if (selectedTower.type === 'wizard') {
        const mode = selectedTower.mageMode ?? 'elemental';
        const b = eng.runFx.mageBuff[mode];
        if (b && (b.damage > 1 || b.range > 1 || b.fireRate > 1)) {
          const card = CARD_BY_ID[MAGE_CARD_ID[mode]];
          const amt = b.damage > 1 ? b.damage - 1 : b.range > 1 ? b.range - 1 : b.fireRate - 1;
          if (card) towerBoosts.push({ key: 'relic-mage', icon: card.icon, amount: pct(amt), title: `${card.name} — ${effectTag(card.effect)}` });
        }
      }
      // Run-wide draft "boons": the per-style stat buffs (damage / range / attack
      // speed) that pile up in the Boons panel also lift THIS tower. Rather than
      // one chip per card, fold them into the per-stat `boonGroups` — the panel
      // shows one chip per stat with the TOTAL, and hovering it breaks the total
      // back down into the contributing cards. (mageBuff / synergy cards are
      // handled above; here we only fold the flat damage/range/fireRate cards
      // that hit this tower's style or all towers.)
      const style = towerStyle?.style;
      if (style) {
        for (const rc of ui.runCards) {
          const card = CARD_BY_ID[rc.id];
          if (!card) continue;
          const parts = card.effect.kind === 'multi' ? card.effect.effects : [card.effect];
          let dmg = 1, rng = 1, spd = 1;
          for (const p of parts) {
            if ((p.kind === 'damage' || p.kind === 'range' || p.kind === 'fireRate') && (!p.style || p.style === style)) {
              if (p.kind === 'damage') dmg *= p.mult;
              else if (p.kind === 'range') rng *= p.mult;
              else spd *= p.mult;
            }
          }
          if (dmg === 1 && rng === 1 && spd === 1) continue; // nothing for this style
          // A stat card can be drafted repeatedly — compound its bonus by the stack.
          const n = rc.count;
          dmg **= n; rng **= n; spd **= n;
          const fold = (group: BoonGroupId, mult: number) => {
            if (mult <= 1) return;
            boonGroups[group].total *= mult; // stacks multiply, matching the engine
            boonGroups[group].sources.push({ id: rc.id, icon: card.icon, name: card.name, count: n, frac: mult - 1 });
          };
          fold('damage', dmg);
          fold('range', rng);
          fold('speed', spd);
        }
      }
    }
  }
  // Active buffs anywhere, for the always-on infobox cluster (RuneLite-style).
  const activeInfoboxes = ui.geOffers.filter((o) => o.activeSecs > 0);

  // Pre-render the selected tower's stat values, highlighting buffed ones.
  let dmgNode: React.ReactNode = null;
  let rangeNode: React.ReactNode = null;
  let speedNode: React.ReactNode = null;
  if (selectedTower) {
    const buff = (n: number) => (eff ? Math.floor((n + eff.flatDamageBonus) * eff.damageMultiplier) : n);
    if (selectedTower.type === 'cannon' && selectedTower.maxDamage != null) {
      const lo = selectedTower.minDamage ?? 0;
      const hi = selectedTower.maxDamage;
      dmgNode = buffedDisplay(`${lo}–${hi}`, `${buff(lo)}–${buff(hi)}`, buff(lo) !== lo || buff(hi) !== hi);
    } else {
      // Ancients wizards hit for the Ice-barrage values, not the tier's base.
      const b = selectedTower.type === 'wizard' && (selectedTower.mageMode ?? 'elemental') === 'ancients'
        ? ancientHit(selectedTower.level)
        : selectedTower.damage;
      dmgNode = buffedDisplay(String(b), String(buff(b)), buff(b) !== b);
    }
    const baseTiles = Math.round(selectedTower.range / TILE_PX);
    const effTiles = eff ? Math.round(eff.range / TILE_PX) : baseTiles;
    rangeNode = buffedDisplay(`${baseTiles} tiles`, `${effTiles} tiles`, effTiles !== baseTiles);
    const effCd = eff ? eff.cooldown : selectedTower.cooldown;
    speedNode = buffedDisplay(attackSpeed(selectedTower.cooldown), attackSpeed(effCd), Math.round(effCd) !== Math.round(selectedTower.cooldown));
  }
  // Next-tier preview for the upgrade button's hover tooltip: what each stat
  // becomes at the next level, with the tower's current buffs folded in (shown
  // in green) so the player sees the real post-upgrade values, not just raw tiers.
  const upgradePreview = (() => {
    if (!selectedTower || selectedTower.level >= selectedTower.maxLevel) return null;
    const next = TOWERS[selectedTower.type]?.tiers[selectedTower.level]; // 0-indexed → next tier
    if (!next) return null;
    const flat = eff?.flatDamageBonus ?? 0;
    const dmgMul = eff?.damageMultiplier ?? 1;
    const rangeMul = eff && selectedTower.range ? eff.range / selectedTower.range : 1;
    const cdMul = eff && selectedTower.cooldown ? eff.cooldown / selectedTower.cooldown : 1;
    const buffDmg = (n: number) => Math.floor((n + flat) * dmgMul);
    const dmgBuffed = dmgMul !== 1 || flat !== 0;
    const rows: { label: string; from: string; to: string; buffed?: string }[] = [];

    // Utility wizard never attacks → no damage / attack-speed rows; only its aura range.
    if (!isUtility) {
      if (selectedTower.type === 'cannon' && selectedTower.maxDamage != null && next.maxDamage != null) {
        const fromLo = selectedTower.minDamage ?? 0, fromHi = selectedTower.maxDamage;
        const toLo = next.minDamage ?? 0, toHi = next.maxDamage;
        rows.push({ label: 'Damage', from: `${fromLo}–${fromHi}`, to: `${toLo}–${toHi}`, buffed: dmgBuffed ? `${buffDmg(toLo)}–${buffDmg(toHi)}` : undefined });
      } else {
        const isAnc = selectedTower.type === 'wizard' && (selectedTower.mageMode ?? 'elemental') === 'ancients';
        const fromD = isAnc ? ancientHit(selectedTower.level) : selectedTower.damage;
        const toD = isAnc ? ancientHit(selectedTower.level + 1) : next.damage;
        rows.push({ label: 'Damage', from: String(fromD), to: String(toD), buffed: dmgBuffed ? String(buffDmg(toD)) : undefined });
      }
    }
    rows.push({
      label: isUtility ? 'Aura range' : 'Range',
      from: `${Math.round(selectedTower.range / TILE_PX)}`,
      to: `${Math.round(next.range / TILE_PX)} tiles`,
      buffed: rangeMul !== 1 ? `${Math.round((next.range * rangeMul) / TILE_PX)} tiles` : undefined,
    });
    if (!isUtility) {
      rows.push({
        label: 'Attack speed',
        from: attackSpeed(selectedTower.cooldown),
        to: attackSpeed(next.cooldown),
        buffed: cdMul !== 1 ? attackSpeed(next.cooldown * cdMul) : undefined,
      });
    }
    return { name: next.name, cost: selectedTower.upgradeCost, rows, anyBuffed: rows.some((r) => r.buffed) };
  })();

  const moving = !!ui.movingTowerId;
  const moveCost = selectedTower ? engineRef.current?.moveTowerCost(selectedTower) ?? 0 : 0;
  const sellValue = selectedTower ? engineRef.current?.sellValue(selectedTower) ?? 0 : 0;
  // The wizard's current cast (e.g. "Fire Wave" / "Ice Barrage") drives the
  // panel title icon/name; utility casts nothing offensive (null).
  const wizSpell = selectedTower?.type === 'wizard' ? spellSpriteName(selectedTower) : null;
  const wizSpellIcon = wizSpell ? spellIconUrl(wizSpell) : undefined;
  const wizSpellLabel = wizSpell ? wizSpell.replace('_', ' ') : null;
  // Logic-space dims, so the on-map picker can be placed by percentage.
  const engW = engineRef.current?.width || 1920;
  const engH = engineRef.current?.height || 1080;

  // Hovered spellbook preview: the 4 spell tiers (each cycling its elements),
  // or the 3 utility fields. Rendered above the options in a fixed-height row so
  // hovering never reflows the popup (which would jitter the buttons + flicker).
  const spellbookPreview: { icon?: string; tier: string }[] = (() => {
    if (!spellbookHover) return [];
    if (spellbookHover === 'utility') {
      return SUPPORT_ORDER.map((id) => ({ icon: spellIconUrl(SUPPORT_SPELLS[id].spell), tier: SUPPORT_SPELLS[id].label }));
    }
    // All four tiers show the SAME element at once, cycling together — easier to
    // read than each tier on a different element.
    return [0, 1, 2, 3].map((t) => {
      if (spellbookHover === 'ancients') {
        const el = ANCIENT_ORDER[animTick % ANCIENT_ORDER.length];
        return { icon: spellIconUrl(ancientSpellName(el, t + 1)), tier: ANCIENT_TIER_NAMES[t] };
      }
      const el = ELEMENT_ORDER[animTick % ELEMENT_ORDER.length];
      return { icon: spellIconUrl(elementalSpellName(el, t + 1)), tier: ELEMENTAL_TIER_NAMES[t] };
    });
  })();

  // One quick-prayer toggle button (shared by the full bar and the minimized
  // "best per style" view). Locked prayers preview greyed-out with their wave.
  const prayerButton = (p: (typeof TOWER_PRAYERS)[number]) => {
    const def = PRAYERS.find((d) => d.id === p.id)!;
    const locked = !isPrayerUnlocked(def.level, ui.wave);
    const on = ui.activePrayers.includes(p.id);
    const icon = prayerIcon(p.id);
    const title = locked
      ? `🔒 Unlocks at Wave ${prayerUnlockWave(def.level)} — ${def.name}: ${def.description}`
      : `${def.name} — ${def.description}`;
    return (
      <button
        key={p.id}
        title={title}
        disabled={locked}
        onClick={() => engineRef.current?.togglePrayer(p.id)}
        className={`rs-prayer ${on ? 'rs-prayer-on' : ''} ${locked ? 'rs-prayer-locked' : ''}`}
      >
        {icon && <img src={icon} alt={def.name} onError={hideBrokenImg} />}
        {locked && <span className="rs-prayer-lock">{prayerUnlockWave(def.level)}</span>}
      </button>
    );
  };
  // The strongest currently-unlocked prayer for each combat style (TOWER_PRAYERS
  // is ordered ascending by level, so the last unlocked per style is the best).
  // These are what the prayer bar shows when minimized.
  const bestPrayerPerStyle = (['melee', 'ranged', 'magic'] as const)
    .map((style) => {
      const unlocked = TOWER_PRAYERS.filter(
        (p) => p.style === style && isPrayerUnlocked(PRAYERS.find((d) => d.id === p.id)!.level, ui.wave),
      );
      return unlocked.length ? unlocked[unlocked.length - 1] : null;
    })
    .filter((p): p is (typeof TOWER_PRAYERS)[number] => p !== null);

  return (
    <div className="w-full h-full flex overflow-hidden bg-black select-none font-osrs">
      <div className="relative flex-1 min-w-0 h-full overflow-hidden">
      <canvas
        ref={canvasRef}
        data-tut="map"
        className="absolute inset-0 w-full h-full block cursor-crosshair touch-none"
        style={{ imageRendering: 'pixelated' }}
        onMouseMove={onMove}
        onMouseDown={onMouseDown}
        onMouseUp={onMouseUp}
        onClick={onClick}
        onContextMenu={onContextMenu}
      />

      {/* Marquee selection box while dragging to multi-select towers. */}
      {marqueeBox && (
        <div
          className="absolute z-20 pointer-events-none border border-[#6edcff] bg-[#6edcff]/10"
          style={{ left: marqueeBox.l, top: marqueeBox.t, width: marqueeBox.w, height: marqueeBox.h }}
        />
      )}

      {/* Batch-upgrade panel for a marquee multi-selection. */}
      {ui.multiSelectedIds.length > 0 && (() => {
        const info = engineRef.current?.multiUpgradeInfo ?? { count: 0, cost: 0 };
        const afford = ui.money >= info.cost;
        return (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 rs-panel p-2 flex items-center gap-[0.6em]" style={{ fontSize: fs('clamp(13px, 0.85vw, 17px)') }}>
            <span className="text-osrs-orange font-bold whitespace-nowrap">{ui.multiSelectedIds.length} towers</span>
            <button
              className="rs-btn rs-btn-primary px-[0.7em] py-[0.3em] flex items-center gap-[0.3em] disabled:opacity-50"
              disabled={info.count === 0}
              title={info.count === 0 ? 'All selected towers are max level' : `Upgrade ${info.count} tower(s) one tier`}
              onClick={() => engineRef.current?.upgradeMultiSelected()}
            >
              <span className="text-[#5bd75b] font-bold">⬆</span>
              Upgrade {info.count > 0 ? `(${info.count})` : ''}
              {info.count > 0 && <span style={{ color: afford ? 'var(--osrs-yellow)' : 'var(--osrs-red)' }}>{fmt(info.cost)} gp</span>}
            </button>
            <button className="rs-btn px-[0.6em] py-[0.3em]" title="Deselect all towers" onClick={() => engineRef.current?.clearMultiSelect()}>Clear</button>
          </div>
        );
      })()}

      {/* Enemy info — pinned by a click (stays until you click elsewhere) or else
          following the hovered enemy. Positioned in pixels and clamped by the
          panel's measured size so it is never clipped, on any edge. */}
      {enemyPanel && (() => {
        const { info, pinned } = enemyPanel;
        const ratio = Math.max(0, info.hp / info.maxHp);
        const wk = info.weakness ? ELEMENTS[info.weakness as keyof typeof ELEMENTS] : null;
        // A wave event (Frenzy/Blood Moon) or a speed affix bakes into baseSpeed but
        // not naturalSpeed — flag the difference so a hastened/slowed enemy reads at
        // a glance (▲ red = faster than normal, ▼ cyan = slower).
        const natSpeed = info.naturalSpeed ?? info.baseSpeed;
        const speedShift = info.baseSpeed > natSpeed ? 'up' : info.baseSpeed < natSpeed ? 'down' : null;
        // Enemy position in container pixels (canvas fills the container).
        const rect = canvasRef.current?.getBoundingClientRect();
        const cw = rect?.width ?? window.innerWidth;
        const ch = rect?.height ?? window.innerHeight;
        const ex = (info.x / engW) * cw;
        const ey = (info.y / engH) * ch;
        const m = 8;           // viewport margin
        const gap = 22;        // clearance between the enemy sprite and the panel
        const pw = enemyPanelSize.w, ph = enemyPanelSize.h;
        // Horizontal: centered on the enemy, clamped to the viewport.
        const left = Math.max(m, Math.min(cw - pw - m, ex - pw / 2));
        // Vertical: above the enemy by default; drop below only if the *measured*
        // panel would clip the top; then clamp so it can never exit either edge.
        let top = ey - gap - ph;
        if (top < m) top = ey + gap;
        top = Math.max(m, Math.min(ch - ph - m, top));
        return (
          <div
            ref={enemyPanelRef}
            className={`absolute z-20 ${pinned ? 'pointer-events-auto' : 'pointer-events-none'}`}
            style={{ left: `${left}px`, top: `${top}px`, visibility: pw === 0 ? 'hidden' : 'visible' }}
          >
            <div
              className={`rs-panel px-[0.7em] py-[0.5em] w-[12em] ${pinned ? 'ring-1 ring-osrs-orange/70' : ''}`}
              style={{ fontSize: fs('clamp(14px, 0.9vw, 19px)') }}
            >
              <div className="flex items-center justify-between gap-2 mb-[0.3em]">
                <span className="flex items-center gap-[0.3em] min-w-0">
                  <span className="text-osrs-orange font-bold truncate">{info.name}</span>
                  {/* Modifier badges: one small icon per affix, hover for its effect
                      (mirrors the debuff badges below). */}
                  {info.affixes.length > 0 && (
                    <span className="flex items-center gap-[0.2em] shrink-0 pointer-events-auto">
                      {info.affixes.map((a) => {
                        const def = AFFIX_DEFS[a];
                        const desc = a === 'armored' && info.armoredStyle ? `${def.desc} (${info.armoredStyle})` : def.desc;
                        return (
                          <span key={a} className="relative group flex">
                            <span
                              className="flex items-center justify-center w-[1.35em] h-[1.35em] rounded-[3px] border"
                              style={{ borderColor: def.color, background: `${def.color}22`, boxShadow: `0 0 4px ${def.color}66` }}
                            >
                              <img src={def.icon} alt={def.name} className="w-[1em] h-[1em] object-contain" onError={hideBrokenImg} />
                            </span>
                            <span className="rs-panel absolute bottom-full left-1/2 -translate-x-1/2 mb-[0.4em] px-[0.5em] py-[0.3em] hidden group-hover:block whitespace-nowrap z-30 pointer-events-none text-[0.72em]">
                              <span className="font-bold" style={{ color: def.color }}>{def.name}</span>
                              <span className="text-[#d3c3a0]"> — {desc}</span>
                            </span>
                          </span>
                        );
                      })}
                    </span>
                  )}
                </span>
                <span className="flex items-center gap-[0.4em] shrink-0">
                  {info.isBoss && <span className="text-[0.6em] text-osrs-red uppercase tracking-wide">Boss</span>}
                  {pinned && (
                    <button
                      title="Close (or click elsewhere)"
                      onClick={() => engineRef.current?.unpinEnemy()}
                      className="text-[#cdbe91] hover:text-white leading-none text-[1em] px-[0.2em] -mr-[0.2em]"
                    >
                      ✕
                    </button>
                  )}
                </span>
              </div>
              <div className="rs-progress mb-[0.35em]">
                <div className="rs-progress-fill" style={{ width: `${Math.round(ratio * 100)}%`, background: ratio > 0.5 ? '#3c3' : ratio > 0.25 ? '#e0c020' : '#e23a3a' }} />
              </div>
              <div className="grid grid-cols-2 gap-x-[0.6em] gap-y-[0.15em] text-[0.74em]">
                <span className="text-[#d3c3a0]">HP</span>
                <span className="text-right text-white">{info.hp}/{info.maxHp}</span>
                <span className="text-[#d3c3a0]">Weakness</span>
                <span className="text-right capitalize" style={{ color: wk?.color ?? '#9a9a9a' }}>{wk ? wk.label : 'None'}</span>
                <span className="text-[#d3c3a0]">Move speed</span>
                <span className="text-right text-white flex items-center justify-end gap-[0.3em]">
                  <span>{info.speed}{info.speed !== info.baseSpeed ? ` (${info.baseSpeed})` : ''}</span>
                  {speedShift && (
                    <span
                      className="text-[0.9em] leading-none font-bold"
                      style={{ color: speedShift === 'up' ? '#ff6a4d' : '#57c8ff' }}
                      title={`${speedShift === 'up' ? 'Hastened' : 'Slowed'} by an event or affix — normally ${natSpeed}`}
                    >
                      {speedShift === 'up' ? '▲' : '▼'}
                    </span>
                  )}
                </span>
                <span className="text-[#d3c3a0]">Gold</span>
                <span className="text-right text-osrs-yellow">{info.reward}</span>
                {info.tenacity > 0 && (
                  <>
                    <span className="text-[#d3c3a0]" title="Resistance to non-damaging debuffs (slow, stun, etc.)">Tenacity</span>
                    <span className="text-right text-osrs-cyan">{Math.round(info.tenacity * 100)}%</span>
                  </>
                )}
              </div>
              {info.effects.length > 0 && (
                <div className="mt-[0.4em] pt-[0.35em] border-t border-[#3a2f1d] flex flex-wrap items-center gap-[0.4em] pointer-events-auto">
                  {info.effects.map((id) => {
                    const meta = DEBUFF_META[id];
                    return (
                      <span key={id} className="relative group flex">
                        <span
                          className="flex items-center justify-center w-[1.7em] h-[1.7em] rounded-[3px] border"
                          style={{ borderColor: meta.color, background: `${meta.color}22`, boxShadow: `0 0 4px ${meta.color}66` }}
                        >
                          <img
                            src={meta.icon}
                            alt={meta.label}
                            className="w-[1.25em] h-[1.25em] object-contain"
                            onError={hideBrokenImg}
                          />
                        </span>
                        {/* Hover tooltip: what the icon means. */}
                        <span className="rs-panel absolute bottom-full left-1/2 -translate-x-1/2 mb-[0.4em] px-[0.5em] py-[0.3em] hidden group-hover:block whitespace-nowrap z-30 pointer-events-none text-[0.72em]">
                          <span className="font-bold" style={{ color: meta.color }}>{meta.label}</span>
                          <span className="text-[#d3c3a0]"> — {meta.desc}</span>
                        </span>
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* Wizard spellbook picker: opens on the tapped tile when placing a wizard.
          Each option's icon cycles its staves (Elemental → 4 elemental staves,
          Ancients → 4 sceptres, Utility → Lunar staff); hovering one previews its
          spells cycling. Picking a spellbook builds the wizard there. */}
      {ui.pendingPlacement && ui.selectedTowerType === 'wizard' && (
        <div
          className="absolute z-30"
          style={{
            left: `${(ui.pendingPlacement.x / engW) * 100}%`,
            top: `${(ui.pendingPlacement.y / engH) * 100}%`,
            transform: 'translate(-50%, -118%)',
          }}
        >
          <div className="rs-panel p-[0.7em]" style={{ fontSize: fs('clamp(15px, 1vw, 21px)') }}>
            <div className="text-center text-[0.66em] text-[#d3c3a0] uppercase tracking-wide mb-[0.4em]">Choose spellbook</div>

            {/* Preview ABOVE the options, fixed height so hovering never reflows
                the popup (which would jitter the buttons under the cursor). */}
            <div className="flex items-end justify-center gap-[0.4em] mb-[0.5em] h-[3.4em] border-b border-[#3a2f1d] pb-[0.4em]">
              {spellbookHover
                ? spellbookPreview.map((it, idx) => (
                    <div key={idx} className="flex flex-col items-center w-[2.4em]">
                      {it.icon && <img src={it.icon} alt="" className="w-[2em] h-[2em]" onError={hideBrokenImg} />}
                      <span className="text-[0.5em] text-[#cdbb91] mt-[0.15em] leading-none text-center">{it.tier}</span>
                    </div>
                  ))
                : <span className="text-[0.62em] text-[#b3a585] self-center">Hover a spellbook to preview its spells</span>}
            </div>

            <div className="flex gap-[0.4em] justify-center">
              {([
                { mode: 'elemental', label: 'Elemental', icon: WIZARD_STAVES[animTick % WIZARD_STAVES.length] },
                { mode: 'ancients', label: 'Ancients', icon: WIZARD_SCEPTRES[animTick % WIZARD_SCEPTRES.length] },
                { mode: 'utility', label: 'Utility', icon: WIZARD_UTILITY_STAFF },
              ] as { mode: MageMode; label: string; icon?: string }[]).map(({ mode, label, icon }) => (
                <button
                  key={mode}
                  title={label}
                  onClick={() => engineRef.current?.confirmWizardSpellbook(mode)}
                  onMouseEnter={() => setSpellbookHover(mode)}
                  onMouseLeave={() => setSpellbookHover((h) => (h === mode ? null : h))}
                  className="rs-slot flex flex-col items-center w-[3.6em]"
                >
                  {icon
                    ? <img src={icon} alt={label} onError={hideBrokenImg} />
                    : <span className="text-[0.6em]">{label}</span>}
                  <span className="text-[0.58em] text-[#cdbb91] mt-[0.15em]">{label}</span>
                </button>
              ))}
            </div>

            <div className="text-center text-[0.62em] text-[#b3a585] mt-[0.3em]">right‑click to cancel</div>
          </div>
        </div>
      )}

      {/* Legacy general 6-tower picker — disabled (SHOW_TOWER_PICKER) but kept. */}
      {SHOW_TOWER_PICKER && ui.pendingPlacement && (
        <div
          className="absolute z-30"
          style={{
            left: `${(ui.pendingPlacement.x / engW) * 100}%`,
            top: `${(ui.pendingPlacement.y / engH) * 100}%`,
            transform: 'translate(-50%, -118%)',
          }}
        >
          <div className="rs-panel p-2" style={{ fontSize: fs('clamp(13px, 0.85vw, 18px)') }}>
            <div className="flex gap-[0.3em]">
              {TOWER_ORDER.map((type) => {
                const cost = Math.ceil(TOWERS[type].tiers[0].upgradeCost * ui.upgrades.towerCostReduction);
                const afford = ui.money >= cost;
                const base = type === 'wizard' ? WIZARD_STAVES[animTick % WIZARD_STAVES.length] : towerIcon(type);
                return (
                  <button
                    key={type}
                    disabled={!afford}
                    title={`${TOWERS[type].baseName} — ${cost} gp`}
                    onClick={() => engineRef.current?.confirmPlacement(type)}
                    onMouseEnter={() => setPickerHover(type)}
                    onMouseLeave={() => setPickerHover((h) => (h === type ? null : h))}
                    className={`rs-slot ${afford ? '' : 'rs-slot-unafford'}`}
                  >
                    {base
                      ? <img src={base} alt={TOWERS[type].baseName} onError={hideBrokenImg} />
                      : <span className="text-[0.5em] capitalize">{TOWERS[type].baseName}</span>}
                    <span className="rs-slot-cost" style={{ color: afford ? 'var(--osrs-yellow)' : 'var(--osrs-red)' }}>{cost}</span>
                  </button>
                );
              })}
            </div>

            {pickerHover && (() => {
              const i = animTick % 4;
              let icon: string | undefined;
              let label: string;
              if (pickerHover === 'wizard') {
                const spell = elementalSpellName(ELEMENT_ORDER[i], i + 1); // element+tier cycle together
                icon = spellIconUrl(spell);
                label = spell.replace('_', ' ');
              } else {
                icon = towerTierIcon(pickerHover, i + 1);
                label = TOWERS[pickerHover].tiers[i].name;
              }
              return (
                <div className="mt-[0.4em] flex items-center gap-[0.4em] px-[0.2em] border-t border-[#3a2f1d] pt-[0.4em]">
                  {icon && <img src={icon} alt="" className="w-[1.6em] h-[1.6em] object-contain" onError={hideBrokenImg} />}
                  <span className="text-[0.72em] text-osrs-yellow">{label}</span>
                </div>
              );
            })()}

            <div className="text-center text-[0.62em] text-[#b3a585] mt-[0.3em]">right‑click to cancel</div>
          </div>
        </div>
      )}

      {/* Wave start / complete banner */}
      {banner && (
        <div
          className={`rs-wave-banner ${banner.tone === 'done' ? 'rs-wave-banner-done' : ''} ${banner.tone === 'boss' ? 'rs-wave-banner-boss' : ''} absolute left-1/2 top-1/2 z-20 pointer-events-none whitespace-nowrap text-center`}
        >
          {banner.text}
        </div>
      )}

      {/* Blocked-action toast (e.g. not enough gold) */}
      {toast && (
        <div
          key={ui.noticeSeq}
          className="rs-toast absolute left-1/2 bottom-[16%] -translate-x-1/2 z-30 pointer-events-none whitespace-nowrap flex items-center gap-[0.4em] justify-center"
        >
          {toast.icon ? (
            <img src={toast.icon} alt="" className="w-[1.2em] h-[1.2em] object-contain" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
          ) : (
            <span>⚠</span>
          )}
          {toast.text}
        </div>
      )}

      {/* Collection-log unlock popup (top-centre): celebrates prayers (and, later,
          other unlock kinds) as they come online with the wave. */}
      {unlockQueue[0] && (
        <div className="absolute left-1/2 top-[14%] -translate-x-1/2 z-40 pointer-events-none">
          <div key={unlockQueue[0].id} className="rs-unlock-popup">
            {unlockQueue[0].item.icon && (
              <img
                src={unlockQueue[0].item.icon}
                alt=""
                className="rs-unlock-icon"
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
            )}
            <div className="flex flex-col">
              <span className="rs-unlock-title">{UNLOCK_LABEL[unlockQueue[0].item.kind]}</span>
              <span className="rs-unlock-name">{unlockQueue[0].item.name}</span>
              <span className="rs-unlock-desc">{unlockQueue[0].item.desc}</span>
            </div>
          </div>
        </div>
      )}

      {/* Always-on top-center HUD cluster: (1) a wave strip showing live progress
          while fighting or the always-visible next-wave monster preview while prepping,
          and (2) the active wave-event twist chip + buff infoboxes (RuneLite-style icon
          + remaining seconds) beneath it. Timers pause between waves, so the infoboxes
          double as a "ready to pull" cue. The whole cluster drops below the boss HP bar
          while a boss is alive, so the bar stays topmost. */}
      {runStarted && !ui.gameOver && (
        <div
          data-tut="waveevent"
          className="absolute left-1/2 -translate-x-1/2 z-10 flex flex-col items-center gap-[0.35em] transition-[top] duration-300"
          style={{ top: ui.bossOnField ? '4.5rem' : '0.5rem', fontSize: fs('clamp(13px, 0.85vw, 18px)') }}
        >
          {/* Wave strip: progress while fighting, next-wave preview while prepping. */}
          {(ui.waveActive || ui.wavePreview.length > 0) && (
            <div className="rs-panel px-[0.7em] py-[0.35em] pointer-events-none min-w-[16em] max-w-[46em]">
              {ui.waveActive ? (
                <>
                  <div className="flex items-center justify-between gap-[1em] text-[0.8em] text-osrs-orange mb-[0.2em]">
                    <span>⚔ Wave {ui.wave}{ui.bossWave ? ' — BOSS' : ''}</span>
                    <span className="text-[#cdbe91]">{ui.remaining} left</span>
                  </div>
                  <div className="rs-progress">
                    <div
                      className={`rs-progress-fill ${ui.bossWave ? 'rs-progress-fill-boss' : ''}`}
                      style={{ width: `${ui.waveTotal ? Math.round(((ui.waveTotal - ui.remaining) / ui.waveTotal) * 100) : 0}%` }}
                    />
                  </div>
                </>
              ) : (
                <>
                  <div className="text-center text-[0.62em] text-[#d3c3a0] uppercase tracking-wide mb-[0.25em]">
                    Next: Wave {ui.wave} · {ui.wavePreview.reduce((s, m) => s + m.count, 0)} incoming
                  </div>
                  <div className="flex items-center justify-center gap-[0.7em] flex-wrap">
                    {ui.wavePreview.map((m) => {
                      const style = enemySpriteStyle(m.type);
                      // The strip is click-through so it never blocks the map; each entry
                      // opts pointer events back in, or its `title` tooltip never fires.
                      return (
                        <span key={m.type} className="flex items-center gap-[0.3em] pointer-events-auto" title={m.name}>
                          <span className="inline-block w-[1.5em] h-[1.5em] shrink-0" style={style ? { ...style, imageRendering: 'pixelated' } : undefined} />
                          <span className={`text-[0.7em] ${m.isBoss ? 'text-osrs-red font-bold uppercase tracking-wide' : 'text-[#e8dcc0]'}`}>
                            {m.isBoss ? `⚠ ${m.name}` : `×${m.count}`}
                          </span>
                        </span>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          )}
          {/* Event chip + potion infoboxes (existing row, now BELOW the strip). */}
          {((ui.waveActive && ui.activeEvent) || activeInfoboxes.length > 0) && (
            <div className="flex items-start gap-[0.4em]">
              {ui.waveActive && ui.activeEvent && <WaveEventChip event={ui.activeEvent} />}
              {activeInfoboxes.map((o) => (
                <div
                  key={o.id}
                  className="rs-infobox relative group pointer-events-auto"
                  role="img"
                  aria-label={`${o.name} — ${o.desc} · ${o.activeSecs}s left`}
                >
                  <img src={geIcon(o.wiki)} alt={o.name} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                  <span className="rs-infobox-time">{o.activeSecs}</span>
                  <span className="rs-panel absolute top-full left-1/2 -translate-x-1/2 mt-[0.4em] p-[0.5em] w-[17em] hidden group-hover:block z-40 pointer-events-none text-left">
                    <span className="flex items-center gap-[0.4em] leading-none">
                      <span className="text-[0.85em] font-bold text-osrs-orange">{o.name}</span>
                      <span className="text-[0.58em] uppercase tracking-wide px-[0.35em] py-[0.05em] rounded-sm text-osrs-orange">
                        {o.activeSecs}s left
                      </span>
                    </span>
                    <span className="block text-[0.68em] text-[#cdbe91] mt-[0.25em] leading-tight">{o.desc}</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Top-right data-orb cluster (OSRS minimap-orb style) */}
      <div data-tut="hud" className="absolute top-4 right-4 flex flex-col gap-2 z-10 items-end">
        <div className="relative">
          <div key={ui.lifestealSeq} className={ui.lifestealSeq > 0 ? 'rs-orb-blip' : undefined}>
            <Orb
              icon={ASSETS.misc.orb_hitpoints}
              title="Lives"
              value={ui.lives}
              valueColor={ui.lives <= 5 ? '#ff4b4b' : undefined}
              fill={ui.lives / ui.maxLives}
              fillColor="linear-gradient(180deg, #e23a3a, #8a0000)"
            />
          </div>
          {ui.lifestealSeq > 0 && (
            <span key={`h${ui.lifestealSeq}`} className="rs-lifesteal-pop" aria-hidden>
              ❤ +1
            </span>
          )}
        </div>
        <Orb
          icon={ASSETS.misc.coins_icon}
          title="Gold"
          value={fmt(ui.money)}
          fill={1}
          fillColor="linear-gradient(180deg, #ecc63c, #957a10)"
        />
        <Orb
          icon={ASSETS.misc.attack_icon}
          title="Wave"
          value={ui.wave}
          fill={1}
          fillColor="linear-gradient(180deg, #3ac0c0, #0a6b6b)"
        />
        <Orb
          icon={ASSETS.misc.orb_prayer}
          title="Prayer"
          value={ui.prayerPoints}
          fill={ui.prayerPoints / ui.prayerMax}
          fillColor="linear-gradient(180deg, #6db3f2, #1f5fa8)"
        />
      </div>

      {/* Selected tower panel (top-left) */}
      {selectedTower && (
        <MovablePanel
          id="tower"
          globalLock={uiLocked}
          className="rs-panel absolute top-4 left-4 p-3 z-10 w-[17em]"
          style={{ fontSize: fs('clamp(14px, 0.92vw, 20px)') }}
        >
          <div className="rs-panel-title flex items-center gap-2" style={{ fontSize: '1.05em' }}>
            {(() => {
              // The wizard shows its actual staff (matching the board), not the
              // generic tier-1 icon — so it changes with element/spellbook.
              const staff = selectedTower.type === 'wizard' ? wizardStaffUrl(selectedTower) : towerIcon(selectedTower.type);
              return staff ? <img src={staff} alt="" className="w-[1.4em] h-[1.4em]" onError={hideBrokenImg} /> : null;
            })()}
            {wizSpellIcon && (
              <img src={wizSpellIcon} alt="" className="w-[1.4em] h-[1.4em]" onError={hideBrokenImg} />
            )}
            <span className="truncate">{wizSpellLabel ?? selectedTower.name}</span>
          </div>

          <div className="space-y-[0.4em] px-[0.2em] mt-[0.5em]">
            {/* The Utility wizard is a pure support aura — it never attacks, so it
                has no Damage / Attack-speed line; its "range" is the aura radius. */}
            {!isUtility && (
              <>
                <Stat
                  icon={TOWER_COMBAT[selectedTower.type].icon}
                  label={`Damage (${TOWER_COMBAT[selectedTower.type].label})`}
                  value={dmgNode}
                />
                <Stat icon={ASSETS.misc.attack_icon} label="Attack speed" value={speedNode} />
              </>
            )}
            <Stat label={isUtility ? 'Aura range' : 'Range'} value={rangeNode} />
            <Stat label="Level" value={`${selectedTower.level}/${selectedTower.maxLevel}`} />
          </div>

          {/* Signature niche — what this tower does that the wizard can't, made
              explicit so players grasp each tower's identity. */}
          {(() => {
            const sig = towerSignature(selectedTower.type, selectedTower.level);
            if (!sig) return null;
            return (
              <div className="mt-[0.6em] px-[0.2em]">
                <div className="flex items-center gap-[0.4em] mb-[0.25em]">
                  <span className="text-[0.72em] text-[#d3c3a0] uppercase tracking-wide">Signature</span>
                  <span className="text-[0.74em] text-osrs-yellow font-semibold">{sig.label}</span>
                </div>
                <p className="text-[0.72em] text-[#b3a585] leading-snug">{sig.desc}</p>
                {sig.notes.length > 0 && (
                  <ul className="mt-[0.3em] space-y-[0.15em]">
                    {sig.notes.map((n, i) => (
                      <li
                        key={i}
                        className={`text-[0.7em] leading-snug flex gap-[0.35em] ${n.active ? 'text-[#9ccf9c]' : 'text-[#7a6f57]'}`}
                      >
                        <span>{n.active ? '▸' : '▹'}</span>
                        <span>{n.text}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })()}

          {/* Active boosts on this tower (origin of the green stats): each shows
              the source icon + its damage bonus — potion timers live up top.
              Boon-card buffs collapse into one chip per stat (damage / range /
              speed); hovering a group opens the per-card breakdown and lights
              those cards up in the Boons panel. */}
          {(towerBoosts.length > 0 || BOON_GROUP_META.some((g) => boonGroups[g.id].total > 1)) && (
            <div className="mt-[0.6em] px-[0.2em]">
              <div className="text-[0.68em] text-[#5bd75b] uppercase tracking-wide mb-[0.3em]">Active boosts</div>
              <div className="flex flex-wrap gap-[0.3em]">
                {towerBoosts.map((b) => (
                  <span key={b.key} className="rs-buff-chip" title={b.title}>
                    <img src={b.icon} alt="" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                    <span className="rs-buff-secs">{b.amount}</span>
                  </span>
                ))}
                {BOON_GROUP_META.map((g) => {
                  const grp = boonGroups[g.id];
                  if (grp.total <= 1) return null;
                  return (
                    <span
                      key={`boons-${g.id}`}
                      className="rs-buff-chip relative cursor-help"
                      style={{ borderColor: g.color }}
                      onMouseEnter={() => setHoverBoonGroup(g.id)}
                      onMouseLeave={() => setHoverBoonGroup(null)}
                    >
                      <span className="font-bold text-[0.88em]" style={{ color: g.color, textShadow: '1px 1px 0 #000' }}>{g.label}</span>
                      <span className="rs-buff-secs">{pct(grp.total - 1)}</span>
                      {hoverBoonGroup === g.id && (
                        <div className="absolute bottom-full left-0 mb-[0.35em] z-50 rs-panel-inset p-[0.45em] w-max max-w-[16em] shadow-[0_2px_8px_rgba(0,0,0,0.8)]">
                          <div className="text-[0.68em] uppercase tracking-wide mb-[0.3em] whitespace-nowrap" style={{ color: g.color }}>
                            {g.title} — {pct(grp.total - 1)} total
                          </div>
                          {grp.sources.map((s) => (
                            <div key={s.id} className="flex items-center gap-[0.35em] text-[0.72em] text-[#d3c3a0] leading-[1.6] whitespace-nowrap">
                              <img src={s.icon} alt="" className="w-[1.2em] h-[1.2em] object-contain" onError={hideBrokenImg} />
                              <span className="flex-1 pr-[0.6em]">{s.name}{s.count > 1 ? ` ×${s.count}` : ''}</span>
                              <span className="rs-buff-secs">{pct(s.frac)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          {/* Utility wizards project an aura instead of firing, so target priority
              is meaningless for them — hide it. */}
          {!isUtility && (
            <div className="mt-[0.7em]">
              <div className="text-[0.72em] text-[#d3c3a0] mb-[0.3em] px-[0.2em] uppercase tracking-wide">Target priority</div>
              <div className="grid grid-cols-5 gap-[0.3em]">
                {(['first', 'last', 'strongest', 'weakest', 'closest'] as const).map((p) => (
                  <button
                    key={p}
                    title={p}
                    onClick={() => engineRef.current?.setTargetingPriority(selectedTower.id, p)}
                    className={`rs-btn px-0 py-[0.35em] text-[0.7em] ${selectedTower.targetingPriority === p ? 'rs-btn-primary' : ''}`}
                  >
                    {PRIORITY_LABELS[p]}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Wizard spellbook is locked at purchase; only the element/barrage
              (its variant) can be retuned here. */}
          {selectedTower.type === 'wizard' && (
            <div className="mt-[0.7em]">
              <div className="flex items-center justify-between mb-[0.3em] px-[0.2em]">
                <span className="text-[0.72em] text-[#d3c3a0] uppercase tracking-wide">Spellbook</span>
                <span className="flex items-center gap-[0.3em] text-[0.72em] text-osrs-yellow capitalize">
                  <img src={spellbookIcon(selectedTower.mageMode)} alt="" className="w-[1.2em] h-[1.2em]" onError={hideBrokenImg} />
                  {selectedTower.mageMode ?? 'elemental'}
                </span>
              </div>

              {(selectedTower.mageMode ?? 'elemental') === 'elemental' && (
                <div className="grid grid-cols-4 gap-[0.3em]">
                  {ELEMENT_ORDER.map((el) => {
                    const spell = elementalSpellName(el, selectedTower.level);
                    const icon = spellIconUrl(spell);
                    const active = (selectedTower.element ?? 'air') === el;
                    return (
                      <button
                        key={el}
                        title={`${spell.replace('_', ' ')} — ${ELEMENTS[el].desc}; +50% vs weakness`}
                        onClick={() => engineRef.current?.setWizardElement(selectedTower.id, el)}
                        className={`rs-btn flex items-center justify-center px-0 py-[0.3em] ${active ? 'rs-btn-primary' : ''}`}
                        style={{ borderBottom: `2px solid ${ELEMENTS[el].color}` }}
                      >
                        {icon
                          ? <img src={icon} alt={ELEMENTS[el].label} className="w-[1.6em] h-[1.6em] object-contain"
                              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                          : <span className="text-[0.66em]" style={{ color: ELEMENTS[el].color }}>{ELEMENTS[el].label}</span>}
                      </button>
                    );
                  })}
                </div>
              )}

              {selectedTower.mageMode === 'ancients' && (
                <div className="grid grid-cols-4 gap-[0.3em]">
                  {ANCIENT_ORDER.map((a) => {
                    const spell = ancientSpellName(a, selectedTower.level);
                    const icon = spellIconUrl(spell);
                    const active = (selectedTower.ancientType ?? 'ice') === a;
                    return (
                      <button
                        key={a}
                        title={`${spell.replace('_', ' ')} — ${ANCIENTS[a].desc}`}
                        onClick={() => engineRef.current?.setAncientType(selectedTower.id, a)}
                        className={`rs-btn flex items-center justify-center px-0 py-[0.3em] ${active ? 'rs-btn-primary' : ''}`}
                        style={{ borderBottom: `2px solid ${ANCIENTS[a].color}` }}
                      >
                        {icon
                          ? <img src={icon} alt={ANCIENTS[a].label} className="w-[1.6em] h-[1.6em] object-contain"
                              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                          : <span className="text-[0.66em]" style={{ color: ANCIENTS[a].color }}>{ANCIENTS[a].label}</span>}
                      </button>
                    );
                  })}
                </div>
              )}

              {selectedTower.mageMode === 'utility' && (
                <>
                  <div className="grid grid-cols-3 gap-[0.3em]">
                    {SUPPORT_ORDER.map((s) => {
                      const icon = spellIconUrl(SUPPORT_SPELLS[s].spell);
                      const active = (selectedTower.supportSpell ?? 'curse') === s;
                      // Prayer Ward (sanctity) is capped on the field: block picking
                      // a new one once the cap is reached (but never the one already set).
                      const wardCapped = s === 'sanctity' && !active
                        && (engineRef.current?.prayerWardCount() ?? 0) >= MAX_PRAYER_WARDS;
                      return (
                        <button
                          key={s}
                          disabled={wardCapped}
                          title={wardCapped
                            ? `Max ${MAX_PRAYER_WARDS} Prayer Ward wizards on the field`
                            : `${SUPPORT_SPELLS[s].label} — ${SUPPORT_SPELLS[s].desc}`}
                          onClick={() => engineRef.current?.setSupportSpell(selectedTower.id, s)}
                          className={`rs-btn flex items-center justify-center px-0 py-[0.3em] ${active ? 'rs-btn-primary' : ''} ${wardCapped ? 'opacity-40 cursor-not-allowed' : ''}`}
                          style={{ borderBottom: `2px solid ${SUPPORT_SPELLS[s].color}` }}
                        >
                          {icon
                            ? <img src={icon} alt={SUPPORT_SPELLS[s].label} className="w-[1.6em] h-[1.6em] object-contain" onError={hideBrokenImg} />
                            : <span className="text-[0.62em]" style={{ color: SUPPORT_SPELLS[s].color }}>{SUPPORT_SPELLS[s].label}</span>}
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-[0.72em] text-[#b3a585] mt-[0.35em] px-[0.2em] leading-snug">
                    {SUPPORT_SPELLS[selectedTower.supportSpell ?? 'curse'].desc}.
                    Always-on aura boosts nearby towers' range, speed &amp; damage too.
                  </p>
                </>
              )}

              {(selectedTower.mageMode ?? 'elemental') === 'elemental' && (
                <p className="text-[0.72em] text-[#b3a585] mt-[0.35em] px-[0.2em] leading-snug">
                  {ELEMENTS[(selectedTower.element ?? 'air') as keyof typeof ELEMENTS].desc}
                </p>
              )}

              {selectedTower.mageMode === 'ancients' && (
                <p className="text-[0.72em] text-[#b3a585] mt-[0.35em] px-[0.2em] leading-snug">
                  {ANCIENTS[selectedTower.ancientType ?? 'ice'].desc}
                </p>
              )}
            </div>
          )}

          {moving ? (
            <div className="mt-[0.7em] text-center text-[0.8em] text-osrs-orange leading-snug">
              ▸ Click a tile to move here ({moveCost} gp)<br />
              <span className="text-[#d3c3a0]">right‑click to cancel</span>
            </div>
          ) : (
            <div className="mt-[0.7em] space-y-[0.4em] text-[0.95em]">
              {selectedTower.level < selectedTower.maxLevel && (
                <div
                  className="relative"
                  onMouseEnter={() => setUpgradeHover(true)}
                  onMouseLeave={() => setUpgradeHover(false)}
                >
                  {upgradeHover && upgradePreview && (
                    <div className="absolute bottom-full left-0 right-0 mb-2 z-30 rs-panel p-[0.6em] text-[0.8em] shadow-xl pointer-events-none">
                      <div className="flex items-center gap-[0.4em] mb-[0.45em] text-osrs-yellow font-bold">
                        <span className="text-[#5bd75b]">⬆</span>
                        <span className="truncate">Next tier: {upgradePreview.name}</span>
                      </div>
                      <div className="space-y-[0.3em]">
                        {upgradePreview.rows.map((r) => (
                          <div key={r.label} className="flex items-center justify-between gap-[0.6em]">
                            <span className="text-[#d3c3a0] whitespace-nowrap">{r.label}</span>
                            <span className="flex items-center gap-[0.3em] text-right">
                              <span className="text-[#9a8d70]">{r.from}</span>
                              <span className="text-[#cdbe91]">→</span>
                              <span className="text-[#e7d9b5]">{r.to}</span>
                              {r.buffed && <span className="text-[#5bd75b]">({r.buffed})</span>}
                            </span>
                          </div>
                        ))}
                      </div>
                      {upgradePreview.anyBuffed && (
                        <div className="text-[0.82em] text-[#5bd75b] mt-[0.45em]">(green) = with current buffs</div>
                      )}
                      <div className="flex items-center justify-between gap-[0.6em] mt-[0.45em] pt-[0.4em] border-t border-[#3a3327]">
                        <span className="text-[#d3c3a0] whitespace-nowrap">Cost</span>
                        <span className={ui.money < selectedTower.upgradeCost ? 'text-[#ff6b6b]' : 'text-osrs-yellow'}>
                          {selectedTower.upgradeCost} gp
                          {ui.money < selectedTower.upgradeCost && ` (need ${selectedTower.upgradeCost - ui.money} more)`}
                        </span>
                      </div>
                    </div>
                  )}
                  <button
                    className="rs-btn w-full flex items-center justify-center gap-[0.3em] px-[0.4em] py-[0.45em]"
                    title={`Upgrade to next tier for ${selectedTower.upgradeCost} gp`}
                    disabled={ui.money < selectedTower.upgradeCost}
                    onClick={() => engineRef.current?.upgradeTower(selectedTower.id)}
                  >
                    <span className="text-[#5bd75b] font-bold">⬆</span>
                    Upgrade — {selectedTower.upgradeCost} gp
                  </button>
                </div>
              )}
              <div className="flex gap-[0.4em]">
                <button
                  className="rs-btn flex-1 flex items-center justify-center gap-[0.3em] px-[0.4em] py-[0.45em]"
                  title={`Move this tower for ${moveCost} gp`}
                  disabled={ui.money < moveCost}
                  onClick={() => engineRef.current?.beginMoveTower(selectedTower.id)}
                >
                  <span className="text-[#cdbe91]">✥</span> Move ({moveCost} gp)
                </button>
                <button
                  className="rs-btn flex-1 px-[0.4em] py-[0.45em]"
                  title={`Sell this tower for ${sellValue} gp (75% refund)`}
                  onClick={() => engineRef.current?.sellTower(selectedTower.id)}
                >
                  Sell ({sellValue} gp)
                </button>
              </div>
            </div>
          )}
        </MovablePanel>
      )}

      {/* Speed + sound control (bottom-left) */}
      <MovablePanel id="controls" tut="controls" globalLock={uiLocked} className="rs-panel absolute bottom-4 left-4 p-2 z-10 flex items-center gap-1">
        <button
          onClick={() => engineRef.current?.togglePause()}
          title={ui.paused ? 'Resume' : 'Pause'}
          disabled={ui.gameOver}
          className={`rs-btn px-2 py-1 text-xs mr-1 ${ui.paused ? 'rs-btn-primary' : ''}`}
        >
          {ui.paused ? '▶' : '⏸'}
        </button>
        <span className="text-[10px] text-[#d3c3a0] mr-1 uppercase tracking-wide">Speed</span>
        {[1, 2, 5].map((s) => (
          <button
            key={s}
            onClick={() => engineRef.current?.setGameSpeed(s)}
            title={`Run the game at ${s}× speed`}
            className={`rs-btn px-2 py-1 text-xs ${ui.gameSpeed === s ? 'rs-btn-primary' : ''}`}
          >
            {s}×
          </button>
        ))}
        <button
          onClick={() => engineRef.current?.toggleMute()}
          title={ui.muted ? 'Unmute' : 'Mute'}
          className="rs-btn px-2 py-1 text-xs ml-1"
        >
          {ui.muted ? '🔇' : '🔊'}
        </button>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={ui.muted ? 0 : ui.volume}
          onChange={(e) => engineRef.current?.setVolume(Number(e.target.value))}
          title={`Volume ${Math.round(ui.volume * 100)}%`}
          className="rs-volume ml-1 w-20"
          aria-label="Volume"
        />
        <span
          className="ml-1 text-xs text-osrs-orange tabular-nums w-8 text-right select-none"
          title="Current volume"
        >
          {ui.muted ? 'off' : `${Math.round(ui.volume * 100)}%`}
        </span>
        {/* Show/hide the always-on Start Wave button (spacebar still sends waves). */}
        <span className="text-[10px] text-[#d3c3a0] ml-2 mr-1 uppercase tracking-wide select-none">Start&nbsp;▶</span>
        <button
          onClick={() => setHideStartWave((v) => !v)}
          aria-pressed={!hideStartWave}
          title={hideStartWave
            ? 'Start Wave button is hidden — press Space to send waves. Click to show it.'
            : 'Hide the Start Wave button and send waves with Space instead.'}
          className={`rs-btn px-2 py-1 text-xs ${hideStartWave ? '' : 'rs-btn-primary'}`}
        >
          {hideStartWave ? 'Off' : 'On'}
        </button>
        {/* Global UI text-size nudge, on top of the viewport-adaptive base size. */}
        <span className="text-[10px] text-[#d3c3a0] ml-2 mr-1 uppercase tracking-wide select-none">UI</span>
        <button
          onClick={() => setUiScale((v) => Math.max(0.7, +(v - 0.1).toFixed(2)))}
          disabled={uiScale <= 0.7}
          title="Smaller interface"
          className="rs-btn px-2 py-1 text-xs disabled:opacity-40"
        >
          −
        </button>
        <span className="text-xs text-osrs-orange tabular-nums w-9 text-center select-none" title="Interface size">
          {Math.round(uiScale * 100)}%
        </span>
        <button
          onClick={() => setUiScale((v) => Math.min(1.6, +(v + 0.1).toFixed(2)))}
          disabled={uiScale >= 1.6}
          title="Larger interface"
          className="rs-btn px-2 py-1 text-xs disabled:opacity-40"
        >
          +
        </button>
      </MovablePanel>

      {debugOpen && (
        <DebugPanel
          engineRef={engineRef}
          ui={ui}
          globalLock={uiLocked}
          onClose={() => setDebugOpen(false)}
        />
      )}

      {/* Collection Log / Boss Log — lifetime kills per enemy, account-wide. */}
      {logOpen && (
        <CollectionLog
          killCounts={ui.killCounts}
          cardCounts={ui.cardCounts}
          tab={logTab}
          setTab={setLogTab}
          onClose={() => setLogOpen(false)}
          globalLock={uiLocked}
        />
      )}

      {/* Quick-prayers bar (bottom-center): all tower prayers shown; locked ones
          are previewed greyed-out with the wave they unlock (OSRS prayer-book
          style). Draggable + minimizable — an outer wrapper holds the centred
          anchor so MovablePanel's own transform only carries the drag offset. */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10">
        <MovablePanel id="prayers" tut="prayers" globalLock={uiLocked} className="rs-panel p-2 flex items-center gap-[0.3em]">
          {prayersMin ? (
            <>
              <button
                data-no-drag
                onClick={() => setPrayersMin(false)}
                title="Show all prayers"
                className="rs-btn px-[0.4em] py-0 text-xs mr-[0.1em] self-stretch"
              >
                »
              </button>
              {bestPrayerPerStyle.length > 0
                ? bestPrayerPerStyle.map((p) => prayerButton(p))
                : <span className="text-[0.7em] text-[#b3a585] px-[0.3em]">No prayers yet</span>}
            </>
          ) : (
            <>
              <button
                data-no-drag
                onClick={() => setPrayersMin(true)}
                title="Collapse to best prayers"
                className="rs-btn px-[0.4em] py-0 text-xs mr-[0.1em] self-stretch"
              >
                «
              </button>
              {/* Section brand: a fixed square wrapper guarantees the prayer icon
                  is contained (never stretched), independent of the global rule. */}
              <span className="inline-flex items-center justify-center w-[1.4em] h-[1.4em] shrink-0 mr-[0.1em] opacity-80">
                <img src={ASSETS.misc.prayer_icon} alt="" className="max-w-full max-h-full object-contain" style={{ imageRendering: 'pixelated' }} />
              </span>
              {TOWER_PRAYERS.map((p) => prayerButton(p))}
            </>
          )}
        </MovablePanel>
      </div>

      {/* Combat paused: a non-blocking banner only. The sim (enemies, towers,
          projectiles, DoTs, prayer & potion timers) is frozen, but the player can
          still place, move, sell towers and pick spells — so it doesn't capture
          pointer events. Resume with Esc or the ⏸ button. */}
      {ui.paused && !ui.gameOver && (
        <div className="absolute inset-x-0 top-0 mt-2 flex justify-center z-20 pointer-events-none">
          <div className="rs-panel px-[1.1em] py-[0.4em] text-center" style={{ fontSize: fs('clamp(13px, 0.85vw, 17px)') }}>
            <div className="text-osrs-orange font-bold">❚❚ COMBAT PAUSED</div>
            <div className="text-[#cdbe91] text-[0.8em]">build freely · press Esc or ⏸ to resume</div>
          </div>
        </div>
      )}

      {/* Roguelite relic choice — milestone-wave run-defining pick (over the draft) */}
      {ui.pendingRelics && !ui.gameOver && (
        <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center z-30 p-4">
          <div className="text-osrs-orange font-bold text-[1.4em] mb-1 text-center">Choose a Relic</div>
          <div className="text-[#cdbe91] text-[0.85em] mb-4 text-center">A milestone reached — claim one run-long power</div>
          <div className="flex gap-6 flex-wrap justify-center">
            {ui.pendingRelics.map((relic) => (
              <RelicCardView
                key={relic.id}
                relic={relic}
                onPick={() => engineRef.current?.pickRelic(relic.id)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Roguelite draft — pick one card to keep before the next wave */}
      {ui.pendingDraft && !ui.gameOver && (
        <div className="absolute inset-0 bg-black/75 flex flex-col items-center justify-center z-30 p-4">
          <div className="text-osrs-orange font-bold text-[1.4em] mb-1 text-center">Draft a Reward</div>
          <div className="text-[#cdbe91] text-[0.85em] mb-4 text-center">Wave {ui.wave} cleared — keep one card</div>
          {/* First-time coaching, shown right here while the cards are on the table
              (never after the fact). The overlay is modal, so this can't overlap
              anything happening on the board. Dismiss it or just pick a card. */}
          {!learnSeen.includes('draft') && (
            <div className="rs-panel-inset max-w-[36em] mb-4 px-[1.1em] py-[0.7em] text-center" style={{ fontSize: fs('clamp(12px, 0.8vw, 16px)') }}>
              <div className="text-osrs-orange font-bold text-[0.95em] mb-[0.3em]">✦ How reward cards work</div>
              <p className="text-[0.85em] text-[#d3c3a0] leading-snug mb-[0.55em]">
                Each wave you keep <b>one</b> card to snowball your build — potions, weapons and rule-changing boons.
                Hover a card to preview exactly what it does; duplicates stack, and a <b>Relic</b> is offered every 5th wave.
              </p>
              <button className="rs-btn px-[0.9em] py-[0.2em] text-[0.8em]" onClick={() => markTipSeen('draft')}>Got it ✓</button>
            </div>
          )}
          <div className="flex gap-6 flex-wrap justify-center">
            {ui.pendingDraft.map((card) => (
              <DraftCardView
                key={card.id}
                card={card}
                large
                onPick={() => { markTipSeen('draft'); engineRef.current?.pickDraftCard(card.id); }}
                ctx={{ runMods: ui.runMods, gold: ui.money, essence: ui.essence, lives: ui.lives, maxLives: ui.maxLives }}
              />
            ))}
          </div>
          {/* Trickster relic: re-roll the hand while charges remain. */}
          {ui.draftRerolls > 0 && (
            <button
              className="rs-btn rs-btn-primary mt-4 px-[1.2em] py-[0.4em] text-[0.9em]"
              title="Discard this hand and draw a fresh set of cards"
              onClick={() => engineRef.current?.rerollDraft()}
            >
              ⟳ Re-roll ({ui.draftRerolls} left)
            </button>
          )}
        </div>
      )}

      {/* Game over — end-of-run summary */}
      {ui.gameOver && (
        <div className="absolute inset-0 bg-black/70 flex items-center justify-center z-30 p-4 overflow-auto">
          <div className="rs-panel p-6 text-center w-[26em] max-w-full">
            <div className="rs-panel-title text-base">Game Over</div>
            <p className="text-[0.78em] text-[#d3c3a0] mt-2 uppercase tracking-wider">
              {ui.gameMode === 'roguelite' ? 'Roguelite run' : 'Classic run'}
            </p>
            <p className="text-osrs-yellow mt-1 mb-0 text-[1.7em] font-bold leading-none">Wave {ui.wave}</p>
            <p className="text-[0.8em] text-[#d3c3a0] mb-4 uppercase tracking-wide">reached</p>
            <div className="grid grid-cols-2 gap-2 mb-3 text-[0.95em]">
              <GoStat icon={ASSETS.misc.attack_icon} label="Slain" value={fmt(engineRef.current?.kills ?? 0)} />
              <GoStat icon={ASSETS.misc.coins_icon} label="Earned" value={`${fmt(engineRef.current?.goldEarned ?? 0)} gp`} />
              <GoStat icon={ASSETS.misc.multicombat_icon} label="Towers built" value={fmt(engineRef.current?.towersBuilt ?? 0)} />
              <GoStat label="Survived" value={fmtTime(engineRef.current?.runSeconds ?? 0)} />
            </div>
            {/* Essence is the meta reward — call it out so the player sees the run paid off. */}
            <div className="rs-panel-inset flex items-center justify-center gap-[0.5em] py-[0.5em] mb-4 text-[0.95em]">
              <img src={ASSETS.misc.rune_essence_icon} alt="" className="w-[1.3em] h-[1.3em] object-contain" onError={hideBrokenImg} />
              <span className="text-osrs-yellow font-bold">+{fmt(engineRef.current?.essenceEarnedThisRun ?? 0)}</span>
              <span className="text-[0.82em] text-[#d3c3a0] uppercase tracking-wide">Rune Essence banked</span>
            </div>
            {ui.gameMode === 'roguelite' && ui.ownedRelics.length > 0 && (
              <OwnedRelicTray ids={ui.ownedRelics} summary />
            )}
            {ui.gameMode === 'roguelite' && ui.runCards.length > 0 && (
              <RunBuild cards={ui.runCards} />
            )}
            <button className="rs-btn rs-btn-primary px-6 py-2 w-full" title="Start a fresh run" onClick={() => { engineRef.current?.restart(); setRunStarted(false); }}>
              ▶ Play Again
            </button>
          </div>
        </div>
      )}

      {/* Title / mode-select screen — gates the first wave of each run */}
      {!runStarted && !ui.gameOver && (
        <StartScreen
          mode={ui.gameMode}
          onSelect={(m) => engineRef.current?.setMode(m)}
          onStart={() => { setRunStarted(true); }}
          onHelp={() => setHelpOpen(true)}
        />
      )}

      {/* How-to-play reference guide — top layer so it reads over the start screen too */}
      {helpOpen && <HowToPlay onClose={() => setHelpOpen(false)} onResetTips={resetTips} />}
      {feedbackOpen && <FeedbackModal ui={ui} onClose={() => setFeedbackOpen(false)} />}

      {/* Learn-as-you-go: one contextual tip at a time, keyed to what's happening
          on-screen. Suppressed over the start screen, game-over, the guide and the
          draft overlay so it never fights another modal. */}
      {runStarted && !ui.gameOver && !helpOpen && !ui.pendingDraft && (
        <LearnAsYouGo
          ui={ui}
          towersPlaced={(engineRef.current?.towers.length ?? 0) > 0}
          seen={learnSeen}
          onSeen={markTipSeen}
          onSkipAll={skipAllTips}
        />
      )}
      </div>{/* game area — floating overlays anchor to the map, never the sidebar */}
      {/* Docked main menu: an OSRS-style tabbed sidebar, now a right-hand column
          that never covers the map. Collapses to a thin rail of tab stones (the
          map grows into the reclaimed width — the canvas re-measures on toggle). */}
      <aside
        data-tut="sidebar"
        className="relative shrink-0 h-full rs-panel flex flex-col"
        style={sideCollapsed
          ? { width: '3.4em', fontSize: fs('clamp(14px, 0.9vw, 19px)') }
          : { width: 'clamp(300px, 22vw, 400px)', fontSize: fs('clamp(14px, 0.9vw, 19px)') }}
      >
        <button
          onClick={() => setSideCollapsed((c) => !c)}
          title={sideCollapsed ? 'Expand menu' : 'Collapse menu'}
          className="rs-btn absolute top-1/2 -left-[0.9em] -translate-y-1/2 z-20 px-[0.15em] py-[0.7em] text-[0.8em]"
        >
          {sideCollapsed ? '◀' : '▶'}
        </button>
        {sideCollapsed ? (
          /* Collapsed rail: the same tab stones stacked vertically. A real tab's
             stone expands into that interface; the window-toggle stones (log /
             debug / help / feedback) keep their own active-state — their windows
             can stay open while the sidebar is collapsed. */
          <div className="flex flex-col items-center gap-[0.4em] pt-[0.6em]">
            <button onClick={() => onSideTab('home')} title="Towers &amp; Wave" className="rs-tab">
              <img src={ASSETS.misc.multicombat_icon} alt="Towers &amp; Wave" onError={hideBrokenImg} />
            </button>
            <button data-tut="essence" onClick={() => onSideTab('essence')} title="Essence Shop — permanent upgrades" className="rs-tab">
              <img src={ASSETS.misc.rune_essence_icon} alt="Essence Shop" onError={hideBrokenImg} />
              <span className="rs-tab-badge">{fmt(ui.essence)}</span>
            </button>
            <button data-tut="slayer" onClick={() => onSideTab('slayer')} title="Slayer Rewards" className="rs-tab">
              <img src={ASSETS.misc.slayer_crossbow} alt="Slayer Rewards" onError={hideBrokenImg} />
              <span className="rs-tab-badge">{ui.slayerPoints}</span>
            </button>
            <button onClick={() => setLogOpen((o) => !o)} title="Collection Log" className={`rs-tab ${logOpen ? 'rs-tab-on' : ''}`}>
              <img src={iconUrl('Collection_log')} alt="Collection Log" onError={hideBrokenImg} />
            </button>
            <button onClick={() => onSideTab('dps')} title="DPS meter — damage dealt per tower, by wave" className="rs-tab">
              <img src={ASSETS.misc.stats_icon} alt="DPS meter" onError={hideBrokenImg} />
            </button>
            <button onClick={() => setDebugOpen((o) => !o)} title="Debug &amp; bestiary" className={`rs-tab text-[1.15em] ${debugOpen ? 'rs-tab-on' : ''}`}>
              🛠
            </button>
            <button data-tut="help" onClick={() => setHelpOpen(true)} title="How to Play" className={`rs-tab text-[1.15em] ${helpOpen ? 'rs-tab-on' : ''}`}>
              ❓
            </button>
            {FEEDBACK_ENABLED && (
              <button onClick={() => setFeedbackOpen(true)} title="Send feedback — report a bug or suggest an idea" className={`rs-tab text-[1.15em] ${feedbackOpen ? 'rs-tab-on' : ''}`}>
                💬
              </button>
            )}
          </div>
        ) : (
          <div className="flex flex-col flex-1 min-h-0 p-3">
        {/* OSRS sidebar tab strip: each stone selects an interface (or pops one
            out). Icons + tooltips, with live badges for essence / Slayer points.
            `order-2` pins it BELOW the tab body (order-1) and ABOVE the tower dock
            (order-3): since the panel is bottom-anchored and grows upward, keeping
            the strip low means the buttons hold a constant position no matter how
            tall the open interface above them is. */}
        <div
          className="order-2 shrink-0 flex items-center justify-center gap-[0.4em] pt-[0.55em] mt-[0.6em] border-t border-[var(--rs-keyline)]"
          style={{ boxShadow: 'inset 0 1px 0 0 var(--rs-bevel-light)' }}
        >
          <button onClick={() => onSideTab('home')} title="Towers &amp; Wave" className={`rs-tab ${tab === 'home' ? 'rs-tab-on' : ''}`}>
            <img src={ASSETS.misc.multicombat_icon} alt="Towers &amp; Wave" onError={hideBrokenImg} />
          </button>
          <button data-tut="essence" onClick={() => onSideTab('essence')} title="Essence Shop — permanent upgrades" className={`rs-tab ${tab === 'essence' ? 'rs-tab-on' : ''}`}>
            <img src={ASSETS.misc.rune_essence_icon} alt="Essence Shop" onError={hideBrokenImg} />
            <span className="rs-tab-badge">{fmt(ui.essence)}</span>
          </button>
          <button data-tut="slayer" onClick={() => onSideTab('slayer')} title="Slayer Rewards" className={`rs-tab ${tab === 'slayer' ? 'rs-tab-on' : ''}`}>
            <img src={ASSETS.misc.slayer_crossbow} alt="Slayer Rewards" onError={hideBrokenImg} />
            <span className="rs-tab-badge">{ui.slayerPoints}</span>
          </button>
          <button onClick={() => setLogOpen((o) => !o)} title="Collection Log" className={`rs-tab ${logOpen ? 'rs-tab-on' : ''}`}>
            <img src={iconUrl('Collection_log')} alt="Collection Log" onError={hideBrokenImg} />
          </button>
          <button onClick={() => onSideTab('dps')} title="DPS meter — damage dealt per tower, by wave" className={`rs-tab ${tab === 'dps' ? 'rs-tab-on' : ''}`}>
            <img src={ASSETS.misc.stats_icon} alt="DPS meter" onError={hideBrokenImg} />
          </button>
          <button onClick={() => setDebugOpen((o) => !o)} title="Debug &amp; bestiary" className={`rs-tab text-[1.15em] ${debugOpen ? 'rs-tab-on' : ''}`}>
            🛠
          </button>
          <button data-tut="help" onClick={() => setHelpOpen(true)} title="How to Play" className={`rs-tab text-[1.15em] ${helpOpen ? 'rs-tab-on' : ''}`}>
            ❓
          </button>
          {FEEDBACK_ENABLED && (
            <button onClick={() => setFeedbackOpen(true)} title="Send feedback — report a bug or suggest an idea" className={`rs-tab text-[1.15em] ${feedbackOpen ? 'rs-tab-on' : ''}`}>
              💬
            </button>
          )}
        </div>

        {/* Tab body (top section): keyed by `tab` so switching re-mounts this
            wrapper and retriggers the soft fade/slide-in (rs-tab-body). This is the
            ONLY part the tab stones swap — the tower dock below stays mounted. flex-1
            + overflow lets a long shop list scroll while the dock stays pinned.
            (The dock stays mounted below; the tab stones only swap this body.) */}
        <div key={tab} className="order-1 rs-tab-body flex-1 min-h-0 overflow-y-auto pr-[0.1em]">
        {/* ── HOME: wave control + Slayer task summary ── */}
        {tab === 'home' && (
        <>
        {!ui.gameOver && (
          ui.waveActive ? (
            ui.activeEvent ? <WaveEventBanner event={ui.activeEvent} /> : null
          ) : (
            <>
              {/* Mode is chosen on the StartScreen; here we only show the current
                  mode as a small badge before each wave starts. The Start Wave
                  button itself lives just above the tower dock (always visible). */}
              <div className="text-[0.7em] text-[#cdbe91] uppercase tracking-wide mb-[0.4em] text-center">
                Mode: <span className="text-osrs-orange font-bold">{ui.gameMode === 'roguelite' ? 'Roguelite' : 'Classic'}</span>
              </div>
            </>
          )
        )}

        {/* Roguelite loadout-at-a-glance: the run's claimed relics (milestone
            picks) above the rule-changing draft boons, so neither is forgotten. */}
        {ui.gameMode === 'roguelite' && ui.ownedRelics.length > 0 && (
          <OwnedRelicTray ids={ui.ownedRelics} />
        )}
        {ui.gameMode === 'roguelite' && ui.runCards.length > 0 && (
          <RelicStrip
            cards={ui.runCards}
            highlight={hoverBoonGroup ? boonGroups[hoverBoonGroup].sources.map((s) => s.id) : null}
          />
        )}
        </>
        )}

        {/* ── ESSENCE SHOP (permanent meta-progression upgrades) ── */}
        {tab === 'essence' && (
        <>
          <div className="rs-panel-title flex items-center gap-2">
            <img src={ASSETS.misc.rune_essence_icon} alt="" className="w-[1.3em] h-[1.3em] object-contain" onError={hideBrokenImg} />
            Essence Shop
          </div>
          <div className="flex items-center justify-between mt-[0.5em] px-[0.2em] text-[0.8em]">
            <span className="text-[#cdbe91] uppercase tracking-wide">Rune Essence</span>
            <span className="flex items-center gap-[0.3em] text-[#7ce0ff] font-bold">
              <img src={ASSETS.misc.rune_essence_icon} alt="" className="w-[1.1em] h-[1.1em] object-contain" onError={hideBrokenImg} />
              {fmt(ui.essence)}
            </span>
          </div>
          <div className="space-y-[0.4em] mt-[0.6em] pr-[0.2em]">
            {GLOBAL_UPGRADE_DEFS.map((def) => {
              const value = ui.upgrades[def.id];
              const maxed = isMaxed(def, value);
              const cost = nextCost(def, value);
              const afford = ui.essence >= cost;
              return (
                <button
                  key={def.id}
                  onClick={() => engineRef.current?.buyEssenceUpgrade(def.id)}
                  disabled={maxed || !afford}
                  title={def.desc}
                  className={`rs-ge-row w-full flex items-center gap-[0.6em] p-[0.4em] text-left ${maxed || !afford ? 'rs-slot-unafford' : ''}`}
                >
                  <img src={geIcon(def.icon)} alt="" className="w-[1.8em] h-[1.8em] object-contain shrink-0" onError={(e) => { (e.target as HTMLImageElement).style.visibility = 'hidden'; }} />
                  <span className="flex-1 min-w-0">
                    <span className="flex items-center gap-[0.4em]">
                      <span className="text-[#e7d9b0] truncate">{def.name}</span>
                      <span className="rs-ge-timer">{formatUpgradeValue(def, value)}</span>
                    </span>
                    <span className="block text-[0.7em] text-[#d3c3a0] truncate">{def.desc}</span>
                  </span>
                  {maxed ? (
                    <span className="text-osrs-green font-bold text-[0.7em] uppercase tracking-wide whitespace-nowrap">Max</span>
                  ) : (
                    <span className="flex items-center gap-[0.25em] font-bold whitespace-nowrap" style={{ color: afford ? '#7ce0ff' : 'var(--osrs-red)' }}>
                      {fmt(cost)}
                      <img src={ASSETS.misc.rune_essence_icon} alt="" className="w-[1em] h-[1em] object-contain" onError={hideBrokenImg} />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          {(() => {
            const refund = refundValue(ui.upgrades);
            return (
              <button
                onClick={() => engineRef.current?.refundEssence()}
                disabled={refund <= 0}
                title="Reset every upgrade and reclaim 90% of the essence you've spent"
                className={`rs-btn w-full mt-[0.6em] py-[0.4em] text-[0.78em] flex items-center justify-center gap-[0.35em] ${refund <= 0 ? 'rs-slot-unafford' : ''}`}
              >
                Refund all
                {refund > 0 && (
                  <span className="flex items-center gap-[0.2em] text-[#7ce0ff] font-bold">
                    +{fmt(refund)}
                    <img src={ASSETS.misc.rune_essence_icon} alt="" className="w-[1em] h-[1em] object-contain" onError={hideBrokenImg} />
                  </span>
                )}
              </button>
            );
          })()}
          <p className="text-center text-[0.66em] text-[#b3a585] mt-[0.6em]">
            Permanent upgrades · earn essence by clearing waves
          </p>
        </>
        )}

        {/* ── SLAYER REWARDS (sink for Slayer points) ── */}
        {tab === 'slayer' && (
        <>
          {/* Slayer task interface (tasks are auto-assigned) */}
          {ui.slayerTask && (
            <div className="rs-panel-inset p-[0.5em] mb-[0.6em]">
              <div className="flex items-center justify-between mb-[0.35em]">
                <span className="flex items-center gap-[0.4em] text-[0.82em] text-osrs-orange uppercase tracking-wide">
                  <img src={ASSETS.misc.slayer_crossbow} alt="" className="w-[1.2em] h-[1.2em] object-contain" onError={hideBrokenImg} />
                  Slayer · {ui.slayerMaster}
                </span>
                <span className="flex items-center gap-[0.3em] text-[0.78em] text-[#7ce0ff] font-bold" title="Slayer points">
                  {ui.slayerHelmet && (
                    <img src={geIcon('Slayer_helmet')} alt="Slayer Helmet active" title="Slayer Helmet active (+20% vs task)" className="w-[1.1em] h-[1.1em] object-contain" onError={hideBrokenImg} />
                  )}
                  {ui.slayerPoints} pts
                </span>
              </div>
              <div className="flex items-center justify-between text-[0.85em] mb-[0.25em]">
                <span className="capitalize text-[#e7d9b0]">{ui.slayerTask.name}</span>
                <span className="text-osrs-yellow font-bold">{ui.slayerTask.count}/{ui.slayerTask.total} left</span>
              </div>
              <div className="rs-progress">
                <div
                  className="rs-progress-fill"
                  style={{ width: `${ui.slayerTask.total ? Math.round(((ui.slayerTask.total - ui.slayerTask.count) / ui.slayerTask.total) * 100) : 0}%` }}
                />
              </div>
            </div>
          )}
          <div className="rs-panel-title flex items-center gap-2">
            <img src={ASSETS.misc.slayer_crossbow} alt="" className="w-[1.3em] h-[1.3em] object-contain" onError={hideBrokenImg} />
            Slayer Rewards
          </div>
          <div className="flex items-center justify-between mt-[0.5em] px-[0.2em] text-[0.8em]">
            <span className="text-[#cdbe91] uppercase tracking-wide">Slayer Points</span>
            <span className="text-[#7ce0ff] font-bold">{ui.slayerPoints}</span>
          </div>
          <div className="space-y-[0.4em] mt-[0.6em] pr-[0.2em]">
            {SLAYER_REWARDS.map((r) => {
              const owned = !!r.once && r.id === 'helmet' && ui.slayerHelmet;
              const afford = ui.slayerPoints >= r.cost;
              const disabled = owned || !afford;
              return (
                <button
                  key={r.id}
                  onClick={() => engineRef.current?.buySlayerReward(r.id)}
                  disabled={disabled}
                  title={r.desc}
                  className={`rs-ge-row w-full flex items-center gap-[0.6em] p-[0.4em] text-left ${disabled ? 'rs-slot-unafford' : ''}`}
                >
                  <img src={geIcon(r.icon)} alt="" className="w-[1.8em] h-[1.8em] object-contain shrink-0" onError={(e) => { (e.target as HTMLImageElement).style.visibility = 'hidden'; }} />
                  <span className="flex-1 min-w-0">
                    <span className="text-[#e7d9b0] truncate block">{r.name}</span>
                    <span className="block text-[0.7em] text-[#d3c3a0] truncate">{r.desc}</span>
                  </span>
                  {owned ? (
                    <span className="text-osrs-green font-bold text-[0.7em] uppercase tracking-wide whitespace-nowrap">Owned</span>
                  ) : (
                    <span className="font-bold whitespace-nowrap" style={{ color: afford ? '#7ce0ff' : 'var(--osrs-red)' }}>
                      {r.cost} pts
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <p className="text-center text-[0.66em] text-[#b3a585] mt-[0.6em]">
            Earn points by completing Slayer tasks
          </p>
        </>
        )}

        {/* ── DPS: the damage meter, folded into the main panel as an interface
            tab (was a floating window). The tab body already scrolls, so a long
            tower list just scrolls in place. ── */}
        {tab === 'dps' && <DpsView snap={ui.dpsStats ?? null} onHoverTower={highlightTower} />}
        </div>

        {/* Start Wave — always one click above the tower dock, no matter which
            interface tab is open. Only between waves (during a wave the top-centre
            HUD shows wave progress instead). Can be hidden from the controls bar,
            where the spacebar still sends waves. `order-3` sits it below the tab
            strip and above the dock. */}
        {!ui.gameOver && !ui.waveActive && !hideStartWave && (
          <div
            className="order-3 shrink-0 pt-[0.6em] mt-[0.6em] border-t border-[var(--rs-keyline)]"
            style={{ boxShadow: 'inset 0 1px 0 0 var(--rs-bevel-light)' }}
          >
            <button
              data-tut="startwave"
              className="rs-btn rs-btn-primary w-full py-[0.5em] text-[1.05em] animate-pulse"
              onClick={() => engineRef.current?.startWave()}
            >
              ▶ Start Wave {ui.wave}
            </button>
            <label
              className="mt-[0.35em] flex items-center justify-center gap-[0.35em] text-[0.72em] text-[#cdbe91] cursor-pointer select-none"
              title="Automatically start the next wave once the field is clear (waits on a pending draft)"
            >
              <input
                type="checkbox"
                className="rs-check"
                checked={ui.autoplay}
                onChange={(e) => {
                  engineRef.current?.setAutoplay(e.target.checked);
                  try { localStorage.setItem('ui_autostart', JSON.stringify(e.target.checked)); } catch { /* ignore */ }
                }}
              />
              Auto-start next wave
            </label>
          </div>
        )}

        {/* Tower shop — ALWAYS visible, regardless of the selected tab, so towers
            stay one click away while browsing the Essence / Slayer interfaces.
            The tab stones only swap the top section; this dock never unmounts.
            `order-4` keeps it pinned at the very bottom, below the Start Wave slot. */}
        <div
          className="order-4 shrink-0 relative pt-[0.6em] mt-[0.6em] border-t border-[var(--rs-keyline)]"
          style={{ boxShadow: 'inset 0 1px 0 0 var(--rs-bevel-light)' }}
        >
          {/* Hover tooltip: tier-1 stats before buying (anchored above the dock) */}
          {hoverShop && (() => {
            const t0 = TOWERS[hoverShop].tiers[0];
            const combat = TOWER_COMBAT[hoverShop];
            const dmg = t0.maxDamage != null ? `${t0.minDamage ?? 0}–${t0.maxDamage}` : t0.damage;
            const icon = towerIcon(hoverShop);
            // What the tower *does* (its niche), not just its numbers — so a new
            // player knows what they're buying before placing it. Tier-1 signature.
            const sig = towerSignature(hoverShop, 1);
            // The Wizard's tier-1 name is its spell ("Strike"), not a weapon like
            // the other towers (Shortbow, Dwarf Multicannon…) — show "Staff" so the
            // shop title reads as the tower, not the spell tier.
            const title = hoverShop === 'wizard' ? 'Staff' : t0.name;
            return (
              <div
                className="rs-panel absolute bottom-full right-0 mb-3 p-2 w-[16em] z-20 pointer-events-none"
                style={{ fontSize: fs('clamp(13px, 0.85vw, 17px)') }}
              >
                <div className="rs-panel-title flex items-center gap-2" style={{ fontSize: '1em' }}>
                  {icon && <img src={icon} alt="" className="w-[1.3em] h-[1.3em] object-contain" />}
                  <span className="truncate">{title}</span>
                </div>
                {sig && (
                  <div className="mt-[0.35em] px-[0.1em]">
                    <span className="text-[0.66em] uppercase tracking-wide text-osrs-orange">{sig.label}</span>
                    <p className="text-[0.76em] text-[#cdbe91] leading-snug mt-[0.1em]">{sig.desc}</p>
                  </div>
                )}
                <div className="space-y-[0.3em] mt-[0.45em] pt-[0.4em] px-[0.1em] border-t border-[var(--rs-keyline)]">
                  <Stat icon={combat.icon} label={`Damage (${combat.label})`} value={dmg} />
                  <Stat icon={ASSETS.misc.attack_icon} label="Attack speed" value={attackSpeed(t0.cooldown)} />
                  <Stat label="Range" value={`${Math.round(t0.range / TILE_PX)} tiles`} />
                </div>
              </div>
            );
          })()}
          <div className="rs-panel-title">Towers</div>
          <div data-tut="dock" className="grid grid-cols-6 gap-2">
            {TOWER_ORDER.map((type) => {
              const cost = Math.ceil(TOWERS[type].tiers[0].upgradeCost * ui.upgrades.towerCostReduction);
              const active = ui.selectedTowerType === type;
              const afford = ui.money >= cost;
              const icon = towerIcon(type);
              return (
                <button
                  key={type}
                  onClick={() => engineRef.current?.selectTowerType(active ? null : type)}
                  onMouseEnter={() => setHoverShop(type)}
                  onMouseLeave={() => setHoverShop((h) => (h === type ? null : h))}
                  className={`rs-slot ${active ? 'selected' : ''} ${afford ? '' : 'rs-slot-unafford'}`}
                >
                  {icon ? (
                    <img src={icon} alt={TOWERS[type].baseName} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                  ) : (
                    <span className="text-[10px] capitalize">{TOWERS[type].baseName}</span>
                  )}
                  <span className="rs-slot-cost" style={{ color: afford ? 'var(--osrs-yellow)' : 'var(--osrs-red)' }}>{cost}</span>
                </button>
              );
            })}
          </div>
          <p className="text-center text-[0.7em] text-[#d3c3a0] mt-[0.5em]">
            {ui.selectedTowerType === 'wizard'
              ? 'Click a tile to choose its spellbook there · right‑click to cancel'
              : 'Pick a tower, then click the map to place · right‑click to cancel'}
          </p>
          <p className="text-center text-[0.64em] text-[#b3a585] mt-[0.2em]">
            <kbd>Space</kbd> next wave · <kbd>1</kbd>/<kbd>2</kbd>/<kbd>5</kbd> speed · <kbd>Esc</kbd> pause/cancel · <kbd>M</kbd> mute
          </p>
        </div>
          </div>
        )}
      </aside>
    </div>
  );
}

/** Draft-card rarity palette + labels, lifted from the OSRS TCG plugin's tier
 *  colours (common white, rare blue, epic purple). */
const RARITY_COLOR: Record<DraftRarity, string> = {
  common: '#FFFFFF',
  uncommon: '#2ECC71',
  rare: '#3498DB',
  ultra: '#9B59B6',
};
const RARITY_LABEL: Record<DraftRarity, string> = {
  common: 'Common',
  uncommon: 'Uncommon',
  rare: 'Rare',
  ultra: 'Ultra-rare',
};

/** Relic tier palette + labels — warmer/regal tones to read distinct from the
 *  draft-card rarities (minor bronze, major gold, mythic crimson). */
const TIER_COLOR: Record<RelicTier, string> = {
  minor: '#CD7F32',
  major: '#F2C94C',
  mythic: '#E74C3C',
};
const TIER_LABEL: Record<RelicTier, string> = {
  minor: 'Minor Relic',
  major: 'Major Relic',
  mythic: 'Mythic Relic',
};
const RELIC_BY_ID: Record<string, Relic> = Object.fromEntries(RELICS.map((r) => [r.id, r]));

/** Combat-style → its OSRS combat-triangle icon (sword / bow / staff), used to
 *  replace the words "melee"/"ranged"/"magic" inline in card text. */
const STYLE_ICON: Record<'melee' | 'ranged' | 'magic', string> = {
  melee: ASSETS.misc.attack_icon,
  ranged: ASSETS.misc.ranged_icon,
  magic: ASSETS.misc.magic_icon,
};

/** Inline combat-style icon sized to the text it sits in. */
function StyleIcon({ style }: { style: 'melee' | 'ranged' | 'magic' }) {
  return (
    <img
      src={STYLE_ICON[style]}
      alt={style}
      title={style}
      className="inline-block align-text-bottom"
      style={{ width: '1.15em', height: '1.15em', objectFit: 'contain' }}
      onError={hideBrokenImg}
    />
  );
}

/** Render a string with every "melee"/"ranged"/"magic" word swapped for its
 *  combat-style icon (case-insensitive), so card copy reads in OSRS iconography. */
function renderWithStyleIcons(text: string): React.ReactNode {
  return text.split(/(melee|ranged|magic)/gi).map((part, i) => {
    const low = part.toLowerCase();
    if (low === 'melee' || low === 'ranged' || low === 'magic') return <StyleIcon key={i} style={low} />;
    return <React.Fragment key={i}>{part}</React.Fragment>;
  });
}

/** Format a multiplier's bonus as a percent, keeping a single decimal only when
 *  needed (so 1.075 → "7.5", 1.03 → "3") — buff steps can be fractional now. */
const pctStr = (mult: number) => String(+((mult - 1) * 100).toFixed(1));

/** Short stat tag for a single effect (collection-log / static use, no run). */
function effectTag(e: DraftEffect): string {
  switch (e.kind) {
    case 'gold': return `+${e.amount} gp`;
    case 'essence': return `+${e.amount} ess`;
    case 'life': return `+${e.amount} lives`;
    case 'maxLife': return `+${e.amount} max life`;
    case 'damage': return `+${pctStr(e.mult)}% ${e.style ? e.style + ' ' : ''}dmg`;
    case 'range': return `+${pctStr(e.mult)}% ${e.style ? e.style + ' ' : ''}range`;
    case 'fireRate': return `+${pctStr(e.mult)}% ${e.style ? e.style + ' ' : ''}speed`;
    // behavioural cards — describe the rule, not a number
    case 'ricochet': return `kill arcs ${Math.round(e.frac * 100)}% to nearest`;
    case 'overkill': return 'overkill cleaves on';
    case 'soulSplit': return `heal every ${e.every} kills`;
    case 'killStreak': return `smite all per ${e.every} kills`;
    case 'lastStand': return `×${e.mult} dmg at ≤${e.belowLives} lives`;
    case 'berserker': return `+${Math.round(e.perMissingLife * 100)}% dmg per lost life`;
    case 'bloodPact': return `×${e.mult} dmg · −1 life/wave`;
    case 'greed': return `enemies ×${e.hpMult} HP · ×${e.goldMult} gold`;
    case 'doubleShot': return 'ranged fire a 2nd shot';
    case 'venomTips': return 'hits inject venom';
    case 'chainFreeze': return 'slows spread to nearby';
    case 'pierce': return 'shots pierce through';
    case 'packTactics': return `+${Math.round(e.frac * 100)}% dmg per same-kind ally`;
    case 'trinity': return `×${e.mult} dmg flanked by both styles`;
    case 'vanguard': return `×${e.mult} dmg, frontmost tower`;
    case 'loneWolf': return `×${e.mult} dmg when isolated`;
    case 'mageBuff': {
      const parts: string[] = [];
      if (e.damage) parts.push(`+${pctStr(e.damage)}% dmg`);
      if (e.range) parts.push(`+${pctStr(e.range)}% range`);
      if (e.fireRate) parts.push(`+${pctStr(e.fireRate)}% speed`);
      return `${e.mode}: ${parts.join(' · ')}`;
    }
    case 'multi': return e.effects.map(effectTag).join(' · ');
  }
}

/** Run state a draft card needs to preview "current → new total" on pick. */
interface PreviewCtx {
  runMods: UIState['runMods'];
  gold: number;
  essence: number;
  lives: number;
  maxLives: number;
}

/** One "current → new total" line for the card's stats band. */
interface PreviewRow {
  style?: 'melee' | 'ranged' | 'magic';
  label: string;
  from: string;
  to: string;
}

const STAT_PCT = (v: number) => `+${pctStr(v)}%`;
const styleMods = (m: { melee: number; ranged: number; magic: number }, style?: 'melee' | 'ranged' | 'magic') =>
  style ? m[style] : (m.melee + m.ranged + m.magic) / 3;

/** Flatten a card's effect into "current → after-pick" rows against live run state. */
function previewRows(card: DraftCard, ctx: PreviewCtx): PreviewRow[] {
  const rows: PreviewRow[] = [];
  const pushStat = (
    m: { melee: number; ranged: number; magic: number },
    style: 'melee' | 'ranged' | 'magic' | undefined,
    mult: number,
    label: string,
  ) => {
    const cur = styleMods(m, style);
    rows.push({ style, label: style ? label : `all ${label}`, from: STAT_PCT(cur), to: STAT_PCT(cur * mult) });
  };
  const walk = (e: DraftEffect) => {
    switch (e.kind) {
      case 'multi': e.effects.forEach(walk); break;
      case 'gold': rows.push({ label: 'gp', from: fmt(ctx.gold), to: fmt(ctx.gold + e.amount) }); break;
      case 'essence': rows.push({ label: 'ess', from: fmt(ctx.essence), to: fmt(ctx.essence + e.amount) }); break;
      case 'life': rows.push({ label: 'lives', from: String(ctx.lives), to: String(Math.min(ctx.maxLives, ctx.lives + e.amount)) }); break;
      case 'maxLife': rows.push({ label: 'max life', from: String(ctx.maxLives), to: String(ctx.maxLives + e.amount) }); break;
      case 'damage': pushStat(ctx.runMods.damage, e.style, e.mult, 'dmg'); break;
      case 'range': pushStat(ctx.runMods.range, e.style, e.mult, 'range'); break;
      case 'fireRate': pushStat(ctx.runMods.fireRate, e.style, e.mult, 'speed'); break;
    }
  };
  walk(card.effect);
  return rows;
}

/** A single themed band tile: a vertical gradient (lighter top → base bottom)
 *  with rounded corners and a drop shadow, matching the plugin's `fillSection`.
 *  Bands sit in a padded column with gaps, so the dark body shows as separators. */
function bandStyle(base: string, grow: number): React.CSSProperties {
  return {
    flex: `${grow} 0 0`,
    minHeight: 0,
    borderRadius: 5,
    background: `linear-gradient(to bottom, color-mix(in srgb, ${base} 82%, #ffffff 18%), ${base})`,
    boxShadow: '0 1px 2px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.07)',
  };
}

/**
 * A single roguelite draft card, styled after the OSRS TCG plugin's card face
 * (`SharedCardRenderer`): a BLACK frame over a dark body, with five stacked bands
 * — title / art / tier / examine / stats — each its own rounded, gradient-shaded
 * tile (lighter top → base bottom) separated by dark gaps. Bands are tinted toward
 * the rarity colour; ultra-rare cards get an animated gold foil sheen.
 *
 * `ctx` (draft overlay) turns the stats band into a live "current → new total"
 * preview; without it (collection log) the band shows the card's static buff.
 * `locked`/`count` drive the collection-log silhouette + lifetime pick tally;
 * `fill` makes the card stretch to its grid cell instead of a fixed width.
 */
function DraftCardView({ card, onPick, ctx, locked, count, fill, large }: {
  card: DraftCard;
  onPick?: () => void;
  ctx?: PreviewCtx;
  locked?: boolean;
  count?: number;
  fill?: boolean;
  /** Enlarge the whole card (the draft-selection overlay) so it reads at a glance. */
  large?: boolean;
}) {
  const color = RARITY_COLOR[card.rarity];
  const foil = card.rarity === 'ultra' && !locked;
  const dark = `color-mix(in srgb, #222222 68%, ${color} 32%)`;
  const mid = `color-mix(in srgb, #2F2F2F 80%, ${color} 20%)`;
  const rows = ctx ? previewRows(card, ctx) : null;
  // All band font-sizes go through `fz` so the `large` variant scales text, art
  // and frame together (×1.5) rather than leaving small text in a bigger card.
  const k = large ? 1.5 : 1;
  const fz = (min: number, vw: number, max: number) => fs(`clamp(${min * k}px, ${(vw * k).toFixed(3)}vw, ${max * k}px)`);
  return (
    <button
      onClick={onPick}
      disabled={!onPick}
      title={card.desc}
      className="draft-card group relative flex flex-col overflow-hidden text-center"
      style={{
        width: fill ? '100%' : (large ? 'clamp(198px, 18vw, 252px)' : 'clamp(132px, 12vw, 168px)'),
        aspectRatio: '180 / 260',
        background: '#2A2A2A',
        border: '3px solid #000000',
        borderRadius: 10,
        padding: 3,
        gap: 2,
        cursor: onPick ? 'pointer' : 'default',
        filter: locked ? 'grayscale(1) brightness(0.42)' : undefined,
        opacity: locked ? 0.85 : 1,
        boxShadow: `0 0 0 1px #000, 0 8px 20px rgba(0,0,0,0.6), 0 0 14px ${color}44`,
      }}
    >
      {/* title band (10%) */}
      <div className="flex items-center justify-center px-1" style={bandStyle(dark, 10)}>
        <span className="font-osrs leading-none" style={{ color, fontSize: fz(8, 0.74, 12), textShadow: '0 1px 1px #000' }}>{card.name}</span>
      </div>
      {/* art window (38%) */}
      <div className="flex items-center justify-center" style={bandStyle(mid, 38)}>
        <img src={card.icon} alt="" className="object-contain" style={{ maxWidth: '64%', maxHeight: '78%', filter: 'drop-shadow(0 2px 3px rgba(0,0,0,0.7))' }} onError={hideBrokenImg} />
      </div>
      {/* tier band (9%) */}
      <div className="flex items-center justify-center" style={bandStyle(dark, 9)}>
        <span className="font-osrs uppercase tracking-wide" style={{ color, fontSize: fz(7, 0.56, 10), textShadow: '0 1px 1px #000' }}>{RARITY_LABEL[card.rarity]}</span>
      </div>
      {/* examine band (28%) — style words rendered as combat-triangle icons */}
      <div className="flex items-center justify-center px-2" style={bandStyle(mid, 28)}>
        <span className="font-osrs leading-tight" style={{ color: '#d6cdb6', fontSize: fz(8, 0.7, 11), textShadow: '0 1px 1px #000' }}>{renderWithStyleIcons(card.desc)}</span>
      </div>
      {/* stats band (15%) — live "current → new" preview, or the static buff */}
      <div className="flex flex-col items-center justify-center px-1 overflow-hidden" style={bandStyle(dark, 15)}>
        {rows && rows.length
          ? rows.map((r, i) => (
              <span key={i} className="font-osrs flex items-center gap-[0.22em] leading-none whitespace-nowrap" style={{ fontSize: fz(7, 0.6, 10), textShadow: '0 1px 1px #000' }}>
                {r.style && <StyleIcon style={r.style} />}
                <span className="text-[#cdbe91]">{r.label}</span>
                <span className="text-white/70">{r.from}</span>
                <span className="text-[#9a8f72]">→</span>
                <span className="text-osrs-yellow font-bold">{r.to}</span>
              </span>
            ))
          : (
            <span className="font-osrs text-white truncate max-w-full" style={{ fontSize: fz(7, 0.6, 10), textShadow: '0 1px 1px #000' }}>{renderWithStyleIcons(effectTag(card.effect))}</span>
          )}
      </div>
      {typeof count === 'number' && count > 0 && (
        <span
          className="absolute top-[2px] right-[2px] font-osrs text-osrs-yellow"
          style={{ fontSize: fs('clamp(8px,0.66vw,11px)'), textShadow: '0 1px 2px #000', background: 'rgba(0,0,0,0.55)', borderRadius: 4, padding: '0 0.3em' }}
        >
          × {fmt(count)}
        </span>
      )}
      {foil && <span className="draft-foil" aria-hidden />}
    </button>
  );
}

function Orb({ icon, title, value, valueColor, fill, fillColor }: {
  icon?: string;
  title: string;
  value: React.ReactNode;
  valueColor?: string;
  fill: number;
  fillColor: string;
}) {
  const pct = Math.max(0, Math.min(1, fill)) * 100;
  return (
    <div className="rs-orb" title={title}>
      <span className="rs-orb-value" style={valueColor ? { color: valueColor } : undefined}>{value}</span>
      <div className="rs-orb-sphere">
        <div className="rs-orb-fill" style={{ height: `${pct}%`, background: fillColor }} />
        <div className="rs-orb-gloss" />
        {icon && <img src={icon} alt="" className="rs-orb-icon" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />}
      </div>
    </div>
  );
}

function GoStat({ icon, label, value }: { icon?: string; label: string; value: React.ReactNode }) {
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

function Stat({ icon, label, value }: { icon?: string; label: string; value: React.ReactNode }) {
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

/** Title / mode-select screen shown before the first wave of a run (and again on
 *  restart). Two selectable mode panels — Classic (pure TD) vs Roguelite (per-wave
 *  draft) — plus a Start button that locks the choice and kicks off wave 1. Mode
 *  can only change here, since the engine freezes it once a run begins. */
// ───────────────────────── Learn-as-you-go coaching ───────────────────────
// One contextual tip at a time, surfaced the first time each situation applies
// (place a tower, send the first wave, first affix / event / boss…). Each tip
// anchors to a live UI element (tagged `data-tut="…"`) or floats top-centre,
// never blocks the game underneath, and is remembered once dismissed — teaching
// the game gradually instead of front-loading one long tour.

interface LearnCtx { towersPlaced: boolean }
interface LearnStep {
  id: string;
  target?: string;
  title: string;
  body: string;
  /** Trigger: show this tip the first time it returns true. Kept simple and
   *  mostly keyed to a specific wave/phase so tips never bunch up. */
  when: (ui: UIState, ctx: LearnCtx) => boolean;
}

const LEARN_STEPS: LearnStep[] = [
  { id: 'build', target: 'dock', title: 'Build your first tower',
    body: 'Pick a tower from the dock, then click the grass to place it. It aims and fires on its own — you win by positioning, not aiming.',
    when: (ui, c) => !ui.waveActive && ui.wave === 1 && !c.towersPlaced },
  { id: 'start', target: 'startwave', title: 'Send the wave',
    body: 'Happy with your defences? Press Start Wave — or tap Space. Nothing spawns until you do, so the game waits while you build.',
    when: (ui, c) => !ui.waveActive && ui.wave === 1 && c.towersPlaced },
  { id: 'hud', target: 'hud', title: 'Lives & gold',
    body: 'These orbs are your lives and gold. Every enemy that reaches the base costs a life; every kill pays gold for more towers and upgrades.',
    when: (ui) => ui.waveActive && ui.wave === 1 },
  { id: 'upgrade', target: 'dock', title: 'Spend between waves',
    body: 'Click a tower you built to upgrade or sell it, and buy more from the dock. Build mode is paused, so take your time before the next wave.',
    when: (ui) => !ui.waveActive && ui.wave === 2 },
  { id: 'prayer', target: 'prayers', title: 'Prayer',
    body: 'Toggle a prayer to buff a tower style or shield your base. It drains a pool that refills between waves — flip the strong ones on for boss waves.',
    when: (ui) => !ui.waveActive && ui.wave === 3 },
  { id: 'sidebar', target: 'sidebar', title: 'Shops & guide',
    body: 'These stones open the Essence Shop (permanent upgrades) and Slayer Rewards. The ❓ stone reopens the quick reference anytime.',
    when: (ui) => !ui.waveActive && ui.wave === 4 },
  { id: 'affix', title: 'Elite enemies',
    body: 'Some enemies now arrive glowing with an affix that rewrites the rules — Shielded, Armored, Hasted and more. Read the aura colour and diversify your towers.',
    when: (ui) => ui.wave >= 5 && ui.waveActive },
  { id: 'event', target: 'waveevent', title: 'Wave event',
    body: 'A board-wide twist just rolled for this wave only. Some hurt (less range, tougher enemies), some help (faster or longer-range towers) — adapt until the banner clears.',
    when: (ui) => !!ui.activeEvent },
  { id: 'boss', title: 'Boss wave',
    body: 'A boss has its own health bar and a mechanic to answer — pile your strongest towers and buffs on it, and watch the caption under its bar.',
    when: (ui) => ui.bossWave },
  // The 'draft' tip is taught *inside* the draft overlay itself (see the roguelite
  // draft block) so it explains the cards while you are choosing, not after — it is
  // not a floating coach step.
];

/** Learn-as-you-go coach. Renders the first not-yet-seen tip whose trigger fits
 *  the current game state, anchored beside its `data-tut` target (or floating
 *  top-centre when it has none) with a highlight ring. Non-blocking — the game
 *  plays on underneath. "Got it" retires the tip; "Skip tips" retires them all. */
function LearnAsYouGo({ ui, towersPlaced, seen, onSeen, onSkipAll }: {
  ui: UIState;
  towersPlaced: boolean;
  seen: string[];
  onSeen: (id: string) => void;
  onSkipAll: () => void;
}) {
  const step = LEARN_STEPS.find((s) => !seen.includes(s.id) && s.when(ui, { towersPlaced })) ?? null;
  const [box, setBox] = useState<{ rect: DOMRect | null; vw: number; vh: number }>({ rect: null, vw: 0, vh: 0 });
  const target = step?.target;

  useLayoutEffect(() => {
    const measure = () => {
      const el = target ? document.querySelector(`[data-tut="${target}"]`) : null;
      setBox({ rect: el ? el.getBoundingClientRect() : null, vw: window.innerWidth, vh: window.innerHeight });
    };
    measure();
    window.addEventListener('resize', measure);
    const id = window.setInterval(measure, 300); // panels drift / layout settles
    return () => { window.removeEventListener('resize', measure); window.clearInterval(id); };
  }, [target, step?.id]);

  if (!step) return null;
  const { rect, vw, vh } = box;
  const pad = 6;
  const balloonW = Math.min(340, (vw || 360) - 24);

  // Beside the target on whichever side has room; park on the mid-left when the
  // tip is targetless. The mid-left strip is the one region no live event uses —
  // the top-centre carries the wave/event/boss banners, the top-right the orbs and
  // the bottom the dock/prayers — so a targetless tip never sits over what's
  // happening on the board.
  let bStyle: React.CSSProperties;
  if (rect) {
    const placeBelow = vh - rect.bottom > 200 || vh - rect.bottom >= rect.top;
    const cx = rect.left + rect.width / 2;
    const left = Math.min(Math.max(12, cx - balloonW / 2), vw - balloonW - 12);
    bStyle = placeBelow
      ? { left, top: Math.min(rect.bottom + 14, vh - 170) }
      : { left, bottom: Math.min(vh - rect.top + 14, vh - 60) };
  } else {
    bStyle = { left: 12, top: Math.max(72, ((vh || 600) - 220) / 2) };
  }

  return (
    <>
      {rect && (
        <div
          className="fixed z-[61] pointer-events-none"
          style={{
            left: rect.left - pad, top: rect.top - pad,
            width: rect.width + pad * 2, height: rect.height + pad * 2,
            borderRadius: 8, border: '2px solid var(--osrs-orange)',
            boxShadow: '0 0 12px 2px rgba(255,140,0,0.5)',
            transition: 'left .2s, top .2s, width .2s, height .2s',
          }}
        />
      )}
      <div className="fixed z-[62] rs-panel p-3 flex flex-col" style={{ ...bStyle, width: balloonW, fontSize: fs('clamp(13px,0.85vw,17px)') }}>
        <div className="flex items-center justify-between gap-[0.5em] mb-[0.3em]">
          <span className="text-osrs-orange font-bold text-[0.95em]">{step.title}</span>
          <span className="text-[0.55em] uppercase tracking-wide text-[#cdbe91] border border-[#6f6250] rounded-sm px-[0.45em] py-[0.05em] shrink-0">Tip</span>
        </div>
        <p className="text-[0.82em] text-[#d3c3a0] leading-snug mb-[0.7em]">{step.body}</p>
        <div className="flex items-center justify-between gap-[0.5em]">
          <button className="rs-btn px-[0.7em] py-[0.25em] text-[0.72em]" onClick={onSkipAll}>Skip tips</button>
          <button className="rs-btn rs-btn-primary px-[0.9em] py-[0.25em] text-[0.78em]" onClick={() => onSeen(step.id)}>Got it ✓</button>
        </div>
      </div>
    </>
  );
}

// ───────────────────────── How to Play (tutorial) ─────────────────────────
// A layered, OSRS-styled guide. Sections run Basic → Advanced so a total
// newcomer can read just the first pages and start, while everything (Prayer,
// Slayer, GE, Magic, meta) is one tab away. Content is data so the copy stays
// readable and easy to tweak without touching layout.

// A short TL;DR reference for the How to Play window. The learn-as-you-go tips
// (LEARN_STEPS) teach each system in context the first time it appears; this is
// the terse cheat sheet a returning player skims to remember how something works.
interface TldrGroup { h: string; lines: string[] }

const TLDR: TldrGroup[] = [
  { h: 'Goal', lines: [
    'Enemies walk the path to your base. Every leak costs a life; at zero lives the run ends.',
  ] },
  { h: 'Towers', lines: [
    'Pick one from the dock, then click the grass — it aims and fires on its own.',
    'Click a placed tower to Upgrade or Sell it, and set its target priority (First / Last / Strongest…).',
    'Niches: Archer = volume, Wizard = single-target or AoE by spellbook, Cannon = splash, TzHaar = heavy melee, Slayer = anti-task/boss, Toxic = stacking venom.',
    'Hold Shift to keep placing the same tower; drag a box to multi-select and batch-upgrade.',
  ] },
  { h: 'Waves', lines: [
    'Nothing spawns until you Start Wave (button above the dock, or Space). Between waves is paused build time.',
    'From wave 3 a wave can roll a board-wide event; from wave 5 enemies can turn elite (glowing affixes). Bosses have their own mechanic.',
  ] },
  { h: 'Systems', lines: [
    'Prayer — toggle buffs or base protection; drains a pool that refills between waves.',
    'Slayer — auto-assigned kill tasks pay points for the Slayer Rewards shop.',
    'Essence — earned every wave and kept forever; spend it in the Essence Shop on permanent upgrades.',
    'Roguelite — keep one reward card per wave, with a Relic every 5th wave.',
  ] },
  { h: 'Controls', lines: [
    'Space start wave · Esc pause / cancel · 1 / 2 / 5 speed · M mute · Shift keep placing · drag a box to multi-select · Q/W/E/R swap a wizard’s spell.',
  ] },
];

/** "How to Play" — a short TL;DR reference. The learn-as-you-go tips cover the
 *  detail in context the first time each thing appears; this window is the terse
 *  "I forgot how X works" cheat sheet. "Replay tips" re-arms those tips. */
function HowToPlay({ onClose, onResetTips }: { onClose: () => void; onResetTips: () => void }) {
  return (
    <div className="absolute inset-0 bg-black/82 flex items-center justify-center z-50 p-4">
      <div className="rs-panel p-5 w-[32em] max-w-[96vw] flex flex-col" style={{ maxHeight: '92vh', fontSize: fs('clamp(14px, 0.95vw, 19px)') }}>
        <div className="flex items-center justify-between gap-[0.5em] mb-[0.2em]">
          <span className="text-osrs-orange font-bold text-[1.15em]">How to Play</span>
          <button className="rs-btn px-[0.7em] py-[0.15em] text-[0.85em]" onClick={onClose} title="Close">✕</button>
        </div>
        <p className="text-[0.72em] text-[#cdbe91] mb-[0.6em] leading-snug">The quick version — tips also pop up in-game the first time each thing comes up.</p>

        <div className="rs-panel-inset p-[0.8em] flex-1 min-h-0 overflow-y-auto flex flex-col gap-[0.7em]">
          {TLDR.map((g) => (
            <div key={g.h}>
              <div className="text-osrs-yellow font-bold text-[0.95em] mb-[0.25em]">{g.h}</div>
              <ul className="flex flex-col gap-[0.3em]">
                {g.lines.map((line, i) => (
                  <li key={i} className="flex gap-[0.5em] items-start leading-snug">
                    <span className="text-osrs-orange shrink-0 leading-none mt-[0.15em]">•</span>
                    <span className="text-[0.85em] text-[#d3c3a0]">{line}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between gap-[0.5em] mt-[0.7em] shrink-0">
          <button className="rs-btn px-[0.9em] py-[0.35em] text-[0.8em]" onClick={onResetTips} title="Show the in-game tips again from the start">↻ Replay tips</button>
          <button className="rs-btn rs-btn-primary px-[1.1em] py-[0.35em] text-[0.85em]" onClick={onClose}>Got it ✓</button>
        </div>
      </div>
    </div>
  );
}

/** In-game feedback launcher — opens the configured NocoDB Form Views in a new
 *  tab. No API/token: these are public form pages the player fills externally.
 *  When a context field is configured, some run/device context rides along on the
 *  URL so a report arrives actionable (see lib/game/feedback.ts). */
function FeedbackModal({ ui, onClose }: { ui: UIState; onClose: () => void }) {
  const ctx: FeedbackContext = useMemo(() => ({
    wave: ui.wave,
    mode: ui.gameMode,
    lives: ui.lives,
    gold: ui.money,
    build: process.env.NEXT_PUBLIC_BUILD_SHA || 'live',
    screen: typeof window !== 'undefined' ? `${window.innerWidth}×${window.innerHeight}` : '',
    ua: typeof navigator !== 'undefined' ? navigator.userAgent : '',
    when: new Date().toISOString(),
  }), [ui.wave, ui.gameMode, ui.lives, ui.money]);

  const open = (base: string) => {
    const url = feedbackUrl(base, ctx);
    if (url && typeof window !== 'undefined') window.open(url, '_blank', 'noopener,noreferrer');
    onClose();
  };

  return (
    <div className="absolute inset-0 bg-black/82 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="rs-panel p-5 w-[24em] max-w-[94vw] flex flex-col"
        style={{ fontSize: fs('clamp(14px, 0.95vw, 19px)') }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-[0.5em] mb-[0.3em]">
          <span className="text-osrs-orange font-bold text-[1.1em]">💬 Feedback</span>
          <button className="rs-btn px-[0.7em] py-[0.15em] text-[0.85em]" onClick={onClose} title="Close">✕</button>
        </div>
        <p className="text-[0.72em] text-[#cdbe91] mb-[0.7em] leading-snug">
          Opens a short form in a new tab. Thanks for helping shape the game — every note is read.
        </p>
        <div className="flex flex-col gap-[0.5em]">
          {FEEDBACK.bugFormUrl && (
            <button
              className="rs-btn w-full py-[0.5em] text-[0.95em] flex items-center justify-center gap-[0.4em]"
              title="Open the bug-report form in a new tab"
              onClick={() => open(FEEDBACK.bugFormUrl)}
            >
              🐛 Report a bug
            </button>
          )}
          {FEEDBACK.suggestionFormUrl && (
            <button
              className="rs-btn w-full py-[0.5em] text-[0.95em] flex items-center justify-center gap-[0.4em]"
              title="Open the suggestion form in a new tab"
              onClick={() => open(FEEDBACK.suggestionFormUrl)}
            >
              💡 Suggest an idea
            </button>
          )}
        </div>
        {FEEDBACK.contextField && (
          <p className="text-[0.62em] text-[#9a8d70] mt-[0.7em] leading-snug">
            Context (wave {ctx.wave}, {ctx.mode} mode, your screen size &amp; build) is attached automatically to speed up fixes.
          </p>
        )}
      </div>
    </div>
  );
}

function StartScreen({ mode, onSelect, onStart, onHelp }: {
  mode: GameMode;
  onSelect: (m: GameMode) => void;
  onStart: () => void;
  onHelp: () => void;
}) {
  const MODES: { id: GameMode; name: string; tag: string; desc: string; icon: string }[] = [
    {
      id: 'classic', name: 'Classic', tag: 'Pure Tower Defense',
      desc: 'Build towers and survive the waves. No draft, no run buffs — just your defences against the horde.',
      icon: iconUrl('Dwarf_multicannon'),
    },
    {
      id: 'roguelite', name: 'Roguelite', tag: 'Draft a card each wave',
      desc: 'Clear a wave, then keep one OSRS reward card. Stack potions, weapons and combos into a build that snowballs.',
      icon: iconUrl('Collection_log'),
    },
  ];
  return (
    <div className="absolute inset-0 bg-black/82 flex flex-col items-center justify-center z-40 p-4">
      <div className="rs-panel p-6 w-[34em] max-w-[94vw] flex flex-col">
        <div className="text-center mb-1">
          <div className="text-osrs-orange font-bold leading-none" style={{ fontSize: fs('clamp(20px, 2.4vw, 32px)') }}>OSRS Tower Defense</div>
          <div className="text-[#cdbe91] text-[0.85em] mt-[0.4em]">Choose your mode</div>
        </div>
        <div className="grid grid-cols-2 gap-[0.7em] my-4">
          {MODES.map((m) => {
            const on = mode === m.id;
            return (
              <button
                key={m.id}
                onClick={() => onSelect(m.id)}
                title={`${m.name} — ${m.desc}`}
                className="rs-panel-inset text-left p-[0.8em] flex flex-col gap-[0.35em]"
                style={{ outline: `2px solid ${on ? 'var(--osrs-orange)' : 'transparent'}`, opacity: on ? 1 : 0.78 }}
              >
                <div className="flex items-center gap-[0.5em]">
                  <img src={m.icon} alt="" className="w-[1.6em] h-[1.6em] object-contain" onError={hideBrokenImg} />
                  <span className="text-osrs-yellow font-bold text-[1.05em]">{m.name}</span>
                  {on && <span className="ml-auto text-osrs-orange text-[0.9em]">✓</span>}
                </div>
                <span className="text-[0.66em] uppercase tracking-wide text-osrs-orange">{m.tag}</span>
                <span className="text-[0.78em] text-[#d3c3a0] leading-snug">{m.desc}</span>
              </button>
            );
          })}
        </div>
        <button className="rs-btn rs-btn-primary w-full py-[0.55em] text-[1.1em] animate-pulse" title="Lock in this mode and start the run" onClick={onStart}>
          ▶ Confirm
        </button>
        <button className="rs-btn w-full py-[0.4em] text-[0.85em] mt-[0.5em]" title="Open the how-to-play guide" onClick={onHelp}>
          ❓ How to Play
        </button>
        <div className="text-center text-[0.7em] text-[#cdbe91] mt-[0.5em]">First time? Read <span className="text-osrs-orange">How to Play</span>. Then press <span className="text-osrs-orange">Start Wave</span> when you&apos;re ready.</div>
      </div>
    </div>
  );
}

/** Placeholder shown when a filter empties the current list (e.g. "Missing" with
 *  everything already logged). */
function LogEmpty() {
  return (
    <div className="flex-1 min-h-0 flex items-center justify-center text-[0.8em] text-[#b3a585] py-[2em]">
      Nothing here for this filter.
    </div>
  );
}

// ============================ DPS meter ============================

/** Effect tallies surfaced in a tower's drill-down, with how each is formatted. */
const DPS_EFFECT_META: { key: keyof EffectStat; label: string; kind: 'dmg' | 'int' | 'sec' | 'tiles' }[] = [
  { key: 'burnDmg', label: 'Burn damage', kind: 'dmg' },
  { key: 'poisonDmg', label: 'Poison damage', kind: 'dmg' },
  { key: 'venomDmg', label: 'Venom damage', kind: 'dmg' },
  { key: 'chainDmg', label: 'Chain damage', kind: 'dmg' },
  { key: 'taskBonusDmg', label: 'Slayer bonus dmg', kind: 'dmg' },
  { key: 'stunCount', label: 'Enemies stunned', kind: 'int' },
  { key: 'stunSeconds', label: 'Stun time', kind: 'sec' },
  { key: 'pushCount', label: 'Knockbacks', kind: 'int' },
  { key: 'pushTiles', label: 'Tiles pushed', kind: 'tiles' },
  { key: 'slowCount', label: 'Slows applied', kind: 'int' },
  { key: 'ampCount', label: 'Enemies marked', kind: 'int' },
  { key: 'splashHits', label: 'Splash hits', kind: 'int' },
  { key: 'lifeStealHeals', label: 'Lives stolen', kind: 'int' },
];

const DPS_STYLE_LABEL: Record<CombatStyle | 'run', string> = { melee: 'Melee', ranged: 'Ranged', magic: 'Magic', run: 'Run Effects' };
const DPS_STYLE_COLOR: Record<CombatStyle | 'run', string> = { melee: '#e07a4c', ranged: '#5bbf5b', magic: '#6aa9ff', run: '#c9a24a' };
const DPS_STYLE_ORDER: (CombatStyle | 'run')[] = ['melee', 'ranged', 'magic', 'run'];

/** Compact damage formatting (1.2k / 3.4m). */
function dpsFmt(n: number): string {
  if (!isFinite(n)) return '0';
  const a = Math.abs(n);
  if (a >= 1_000_000) return (n / 1_000_000).toFixed(a >= 10_000_000 ? 0 : 1) + 'm';
  if (a >= 1000) return (n / 1000).toFixed(a >= 10_000 ? 0 : 1) + 'k';
  return Math.round(n).toString();
}

function dpsEffectValue(v: number, kind: 'dmg' | 'int' | 'sec' | 'tiles'): string {
  if (kind === 'dmg') return dpsFmt(v);
  if (kind === 'int') return Math.round(v).toString();
  if (kind === 'sec') return v.toFixed(1) + 's';
  return v.toFixed(1); // tiles
}

/** A tower's stats collapsed to the current view (a single wave, or the run). */
interface DpsRow {
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

function buildDpsRow(t: DpsTowerStat, view: 'wave' | 'total', wave: number, waveCombat: Record<number, number>): DpsRow {
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

/** DPS meter: per-tower damage dealt, by wave or total, groupable by tower type /
 *  damage type, with a per-enemy + per-effect drill-down on each tower. Rendered
 *  as an interface tab inside the main side panel (the tab body owns the scroll). */
function DpsView({ snap, onHoverTower }: { snap: DpsSnapshot | null; onHoverTower: (id: string | null) => void }) {
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
  const buckets = useMemo(() => {
    if (group === 'none') return [{ key: '', label: '', color: '', style: 'run' as CombatStyle | 'run', icon: undefined as string | undefined, rows }];
    const map = new Map<string, { key: string; label: string; color: string; style: CombatStyle | 'run'; icon?: string; rows: DpsRow[] }>();
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
    if (group === 'style') arr.sort((a, b) => DPS_STYLE_ORDER.indexOf(a.key as CombatStyle | 'run') - DPS_STYLE_ORDER.indexOf(b.key as CombatStyle | 'run'));
    else arr.sort((a, b) => b.rows.reduce((s, r) => s + r.damage, 0) - a.rows.reduce((s, r) => s + r.damage, 0));
    return arr;
  }, [rows, group]);

  const toggleCollapse = (k: string) => setCollapsed((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; });

  const renderRow = (r: DpsRow) => {
    const open = expanded === r.id;
    const enemyMax = r.byWave.reduce((m, g) => Math.max(m, ...g.entries.map((e) => e.damage)), 1);
    // Run Effects has no single tower on the board — nothing to ring/range.
    const boardId = r.style === 'run' ? null : r.id;
    return (
      <div
        key={r.id}
        className="rs-panel-inset px-[0.4em] py-[0.3em]"
        style={{ borderRadius: 0 }}
        onMouseEnter={() => onHoverTower(boardId)}
        onMouseLeave={() => onHoverTower(null)}
      >
        <button
          onClick={() => setExpanded(open ? null : r.id)}
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
                {r.isUtility && <span className="text-[0.72em] text-[#9a8d70] ml-[0.3em]">(extra)</span>}
              </span>
              <span className="shrink-0 flex items-baseline gap-[0.5em]">
                <span className="text-[0.82em] font-bold" style={{ color: '#ffd257' }}>{valLabel(r.damage)}</span>
                <span className="text-[0.66em] text-[#8fbf8f] w-[3.4em] text-right">{dpsFmt(r.dps)}/s</span>
              </span>
            </span>
            <span className="block mt-[0.2em] h-[0.42em] bg-[#241d15] overflow-hidden" style={{ boxShadow: 'inset 1px 1px 0 #100d09' }}>
              <span className="block h-full" style={{ width: `${Math.max(2, (r.damage / maxDamage) * 100)}%`, background: r.isUtility ? '#c9a24a' : r.color }} />
            </span>
          </span>
        </button>

        {open && (() => {
          // Run Effects is a board-wide bucket, not a tower shooting specific
          // monsters — so it drops the per-enemy list and shows only the values it
          // generated (damage / CC / heals), by effect. Real towers keep both.
          const isRun = r.style === 'run';
          const shownEffects = DPS_EFFECT_META.filter((m) => (r.effects[m.key] ?? 0) > 0.05);
          return (
          <div className="mt-[0.4em] pl-[1.6em] pr-[0.2em] flex flex-col gap-[0.5em]">
            {/* Per-enemy breakdown (grouped by wave in Total view) — towers only. */}
            {!isRun && (r.byWave.length > 0 ? r.byWave.map((g) => (
              <div key={g.wave}>
                {view === 'total' && <div className="text-[0.62em] text-[#b3a585] uppercase tracking-wide mb-[0.15em]">Wave {g.wave}</div>}
                <div className="flex flex-col gap-[0.15em]">
                  {g.entries.map((e) => (
                    <div key={e.type} className="flex items-center gap-[0.4em]">
                      <span className="text-[0.68em] text-[#cdbe91] w-[7em] truncate shrink-0">{ENEMIES[e.type as keyof typeof ENEMIES]?.name ?? e.type}</span>
                      <span className="flex-1 h-[0.4em] bg-[#241d15] overflow-hidden">
                        <span className="block h-full" style={{ width: `${Math.max(2, (e.damage / enemyMax) * 100)}%`, background: r.color }} />
                      </span>
                      <span className="text-[0.68em] text-[#ffd257] w-[3.2em] text-right shrink-0">{valLabel(e.damage)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )) : <div className="text-[0.66em] text-[#8a7f68] italic">No damage this {view === 'wave' ? 'wave' : 'run'} yet.</div>)}

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
                    <span className="text-[0.66em] text-[#b3a585]">{m.label}</span>
                    <span className="text-[0.7em] text-[#e7d9b6] font-bold">{dpsEffectValue(r.effects[m.key] ?? 0, m.kind)}</span>
                  </div>
                ))}
              </div>
            ) : isRun ? (
              <div className="text-[0.66em] text-[#8a7f68] italic">No run effects this {view === 'wave' ? 'wave' : 'run'} yet.</div>
            ) : null}
          </div>
          );
        })()}
      </div>
    );
  };

  return (
    <div className="flex flex-col">
      {/* One calm toolbar for every control — view, wave nav, grouping, format,
          empty-tower filter — so they read as a single strip, not scattered chips.
          Sticky so it stays put while the tower list scrolls in the tab body. */}
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
            {([['none', 'None'], ['tower', 'Tower'], ['style', 'Damage']] as const).map(([k, label]) => (
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

      <div className="flex flex-col gap-[0.3em]">
        {!snap || rows.length === 0 ? (
          <div className="text-[0.78em] text-[#b3a585] text-center py-[2em] px-[1em] leading-relaxed">
            {snap && snap.waves.length > 0
              ? 'No damage recorded for this view yet.'
              : 'No damage yet — start a wave and your towers will show up here.'}
          </div>
        ) : group === 'none' ? (
          rows.map(renderRow)
        ) : (
          buckets.map((b) => {
            const isCollapsed = collapsed.has(b.key);
            const bTotal = b.rows.reduce((s, r) => s + r.damage, 0);
            return (
              <div key={b.key} className="flex flex-col gap-[0.25em]">
                <button
                  onClick={() => toggleCollapse(b.key)}
                  className="flex items-center justify-between gap-[0.4em] px-[0.4em] py-[0.2em]"
                  style={{ background: '#2b231a', boxShadow: 'inset 1px 1px 0 #6f6250, inset -1px -1px 0 #1b1610' }}
                >
                  <span className="flex items-center gap-[0.4em] min-w-0">
                    <span className="text-[0.7em] text-[#b3a585]">{isCollapsed ? '▸' : '▾'}</span>
                    {group === 'style' && b.style !== 'run'
                      ? <StyleIcon style={b.style} />
                      : b.icon
                        ? <img src={b.icon} alt="" className="w-[1.3em] h-[1.3em] object-contain shrink-0" onError={hideBrokenImg} />
                        : <span className="w-[0.7em] h-[0.7em] shrink-0" style={{ background: b.color }} />}
                    <span className="text-[0.76em] font-bold text-[#f0e6d2] truncate">{b.label}</span>
                    <span className="text-[0.64em] text-[#8a7f68]">×{b.rows.length}</span>
                  </span>
                  <span className="text-[0.76em] font-bold shrink-0" style={{ color: '#ffd257' }}>{valLabel(bTotal)}</span>
                </button>
                {!isCollapsed && <div className="flex flex-col gap-[0.25em] pl-[0.3em]">{b.rows.map(renderRow)}</div>}
              </div>
            );
          })
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

/** Collection Log / Boss Log: a centred OSRS window with Bosses / Monsters / Cards
 *  tabs. Enemies show their baked sprite + lifetime kill count; the Cards tab shows
 *  every draft card with its lifetime pick count. Unobtained entries are darkened
 *  silhouettes (collection-log style). A completion counter per tab. */
function CollectionLog({ killCounts, cardCounts, tab, setTab, onClose, globalLock }: {
  killCounts: Record<string, number>;
  cardCounts: Record<string, number>;
  tab: 'bosses' | 'monsters' | 'cards';
  setTab: (t: 'bosses' | 'monsters' | 'cards') => void;
  onClose: () => void;
  globalLock: boolean;
}) {
  const isCards = tab === 'cards';
  const entries = tab === 'bosses' ? BOSS_ENTRIES : tab === 'monsters' ? MONSTER_ENTRIES : [];
  const total = isCards ? DRAFT_POOL.length : entries.length;
  const obtained = isCards
    ? DRAFT_POOL.filter((c) => (cardCounts[c.id] ?? 0) > 0).length
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
  const sortOptions = isCards ? CARD_SORTS : ENEMY_SORTS;
  const dispEnemies = useMemo(() => sortedEnemies(entries, killCounts, filter, sort, dir), [entries, killCounts, filter, sort, dir]);
  const dispCards = useMemo(() => sortedCards(cardCounts, filter, sort, dir), [cardCounts, filter, sort, dir]);
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
      <div className="flex items-center justify-between mt-[0.4em] mb-[0.5em]">
        <div className="flex gap-[0.3em]">
          {(['bosses', 'monsters', 'cards'] as const).map((t) => (
            <button
              key={t}
              onClick={() => { setTab(t); setSelected(null); setSort('name'); }}
              title={t === 'cards' ? 'Reward cards collected' : `${t === 'bosses' ? 'Bosses' : 'Monsters'} slain`}
              className={`rs-btn px-[0.8em] py-[0.15em] text-[0.78em] capitalize ${tab === t ? 'rs-btn-primary' : ''}`}
            >
              {t}
            </button>
          ))}
        </div>
        <span className="text-[0.78em] font-bold" style={{ color: complete ? 'var(--osrs-green)' : 'var(--osrs-yellow)' }}>
          {obtained}/{total} found
        </span>
      </div>

      {/* List controls (grid view only): filter by collection status, and choose
          the sort key + direction. Hidden in the drill-down detail view. */}
      {!selected && (
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
      {isCards
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
            // Navigate within the current filter+sort order; wrap around so
            // prev/next are always live (continuous bestiary browsing). Fall back
            // to the full tab list if the selected entry was filtered out.
            const nav = dispEnemies.some((e) => e.type === selected) ? dispEnemies : entries;
            const idx = nav.findIndex((e) => e.type === selected);
            const prev = nav[(idx - 1 + nav.length) % nav.length];
            const next = nav[(idx + 1) % nav.length];
            return (
              <LogDetail
                type={selected}
                kc={killCounts[selected] ?? 0}
                onBack={() => setSelected(null)}
                onPrev={() => setSelected(prev.type)}
                onNext={() => setSelected(next.type)}
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
 *  enemy's combat stats and lifetime kill count. Opened by clicking a log card. */
function LogDetail({ type, kc, onBack, onPrev, onNext, position }: {
  type: string; kc: number; onBack: () => void;
  onPrev: () => void; onNext: () => void;
  position: { index: number; total: number };
}) {
  const def = ENEMIES[type as keyof typeof ENEMIES];
  if (!def) return null;
  const wk = def.weakness ? ELEMENTS[def.weakness as keyof typeof ELEMENTS] : null;
  const style = enemySpriteStyle(type, true);
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
    </div>
  );
}

/** Detail view for one draft card: the card face rendered large enough to read,
 *  plus its rarity, full examine text and lifetime pick count. Opened by clicking
 *  a Cards-tab entry; prev/next wrap around the whole pool. Always full-colour
 *  (even un-drafted) so the card can actually be inspected. */
function CardInspect({ card, count, onBack, onPrev, onNext, position }: {
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

/** Resolve a drafted-card id back to its pool definition. */
const CARD_BY_ID: Record<string, DraftCard> = Object.fromEntries(DRAFT_POOL.map((c) => [c.id, c]));

/** The three stats boon cards can buff, as shown grouped in the tower panel. */
type BoonGroupId = 'damage' | 'range' | 'speed';
/** One boon card's contribution to a stat group (breakdown popover rows). */
type BoonSource = { id: string; icon: string; name: string; count: number; frac: number };
/** Chip meta per boon stat group: short label, popover title, accent colour. */
const BOON_GROUP_META: { id: BoonGroupId; label: string; title: string; color: string }[] = [
  { id: 'damage', label: 'DMG', title: 'Damage boons', color: '#ff9040' },
  { id: 'range', label: 'RNG', title: 'Range boons', color: '#5ec8ff' },
  { id: 'speed', label: 'SPD', title: 'Attack-speed boons', color: '#ffd257' },
];

/** Which card each per-tower relic effect comes from, so the tower panel can show
 *  the relic's icon/name as a boost chip. */
const SYNERGY_CARD_ID: Record<'packTactics' | 'trinity' | 'vanguard' | 'loneWolf', string> = {
  packTactics: 'clan_vexillum', trinity: 'combat_triangle', vanguard: 'dinhs_bulwark', loneWolf: 'lone_wolf',
};
const MAGE_CARD_ID: Record<string, string> = {
  elemental: 'tome_of_fire', ancients: 'ancient_sceptre', utility: 'lunar_staff',
};

/** True when a card leaves a lasting mark on the run (a rule-changing relic),
 *  not a one-shot resource (gold/essence/life) that's spent the moment it's taken. */
function isRelicCard(card: DraftCard): boolean {
  const oneShot = new Set(['gold', 'essence', 'life']);
  const walk = (e: DraftEffect): boolean => (e.kind === 'multi' ? e.effects.some(walk) : !oneShot.has(e.kind));
  return walk(card.effect);
}

/** Roguelite build-at-a-glance: the relics drafted this run as a wrapped strip of
 *  rarity-bordered icons (×N badge for stacked stat cards), each with a hover
 *  tooltip naming the relic and its effect. One-shot resource cards are omitted. */
function RelicStrip({ cards, highlight }: { cards: { id: string; count: number }[]; highlight?: string[] | null }) {
  const [collapsed, toggle] = usePersistedCollapse('ui_min_boons');
  const relics = cards
    .map((c) => ({ card: CARD_BY_ID[c.id], count: c.count }))
    .filter((r): r is { card: DraftCard; count: number } => !!r.card && isRelicCard(r.card));
  if (relics.length === 0) return null;
  return (
    <div className="rs-panel-inset p-[0.5em] mb-[0.6em]">
      <button
        onClick={toggle}
        title={collapsed ? 'Expand boons' : 'Minimise boons'}
        className={`flex items-center justify-between w-full ${collapsed ? '' : 'mb-[0.4em]'}`}
      >
        <span className="text-[0.78em] text-osrs-orange uppercase tracking-wide flex items-center gap-[0.3em]">
          <span className="text-[0.85em] text-[#cdbe91]">{collapsed ? '▸' : '▾'}</span>
          Boons
        </span>
        <span className="text-[0.7em] text-[#cdbe91]">{relics.length}</span>
      </button>
      {!collapsed && (
        <div className="flex flex-wrap gap-[0.35em]">
          {relics.map(({ card, count }) => {
            // While a boon stat-group chip is hovered in the tower panel, light
            // up the cards feeding that total and dim everything else.
            const hi = highlight?.includes(card.id) ?? false;
            const dim = !!highlight?.length && !hi;
            return (
              <span
                key={card.id}
                title={`${card.name} — ${effectTag(card.effect)}`}
                className="relative flex items-center justify-center w-[2.1em] h-[2.1em] rs-panel-inset"
                style={{
                  border: `1px solid ${hi ? '#ffd257' : RARITY_COLOR[card.rarity]}`,
                  boxShadow: hi
                    ? '0 0 7px #ffd257, inset 0 0 6px #ffd25766'
                    : `inset 0 0 6px ${RARITY_COLOR[card.rarity]}55`,
                  opacity: dim ? 0.35 : 1,
                  transition: 'opacity 120ms, box-shadow 120ms',
                }}
              >
                <img src={card.icon} alt={card.name} className="w-[1.5em] h-[1.5em] object-contain" onError={hideBrokenImg} />
                {count > 1 && (
                  <span className="absolute -bottom-[0.15em] -right-[0.15em] text-[0.58em] font-bold text-osrs-yellow bg-black/85 px-[0.25em] leading-tight rounded-sm">
                    ×{count}
                  </span>
                )}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** End-of-run summary of every card drafted this run: each card as a
 *  rarity-bordered icon (stack count badge), ordered rarest-first so the run's
 *  highlights read at a glance. `n cards · n picks` header counts uniques vs total. */
function RunBuild({ cards }: { cards: { id: string; count: number }[] }) {
  const built = cards
    .map((c) => ({ card: CARD_BY_ID[c.id], count: c.count }))
    .filter((r): r is { card: DraftCard; count: number } => !!r.card)
    .sort((a, b) => RARITY_WEIGHT[a.card.rarity] - RARITY_WEIGHT[b.card.rarity]);
  if (built.length === 0) return null;
  const picks = built.reduce((n, r) => n + r.count, 0);
  return (
    <div className="rs-panel-inset p-[0.55em] mb-4">
      <div className="text-[0.72em] text-osrs-orange uppercase tracking-wide mb-[0.45em] flex items-center justify-between">
        <span>Your Build</span>
        <span className="text-[#cdbe91]">{built.length} cards · {picks} picks</span>
      </div>
      <div className="flex flex-wrap gap-[0.35em] justify-center">
        {built.map(({ card, count }) => (
          <span
            key={card.id}
            title={`${card.name} — ${effectTag(card.effect)}`}
            className="relative flex items-center justify-center w-[2.1em] h-[2.1em] rs-panel-inset"
            style={{ border: `1px solid ${RARITY_COLOR[card.rarity]}`, boxShadow: `inset 0 0 6px ${RARITY_COLOR[card.rarity]}55` }}
          >
            <img src={card.icon} alt={card.name} className="w-[1.5em] h-[1.5em] object-contain" onError={hideBrokenImg} />
            {count > 1 && (
              <span className="absolute -bottom-[0.15em] -right-[0.15em] text-[0.58em] font-bold text-osrs-yellow bg-black/85 px-[0.25em] leading-tight rounded-sm">
                ×{count}
              </span>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}

/** The cloneable relic shape the engine emits for the choice overlay (`tier` is a
 *  plain string across the boundary; resolved back to a {@link RelicTier} here). */
type RelicView = { id: string; name: string; desc: string; tier: string; icon: string };

/** A relic offered at a milestone wave, framed like a draft card but in the relic
 *  tier palette. Relics carry their own one-line examine, so there's no live stat
 *  preview band — the whole card is the pitch. */
function RelicCardView({ relic, onPick }: { relic: RelicView; onPick?: () => void }) {
  const tier = (relic.tier in TIER_COLOR ? relic.tier : 'minor') as RelicTier;
  const color = TIER_COLOR[tier];
  const dark = `color-mix(in srgb, #222222 64%, ${color} 36%)`;
  const mid = `color-mix(in srgb, #2F2F2F 78%, ${color} 22%)`;
  const k = 1.5;
  const fz = (min: number, vw: number, max: number) => fs(`clamp(${min * k}px, ${(vw * k).toFixed(3)}vw, ${max * k}px)`);
  return (
    <button
      onClick={onPick}
      disabled={!onPick}
      title={relic.desc}
      className="draft-card group relative flex flex-col overflow-hidden text-center"
      style={{
        width: 'clamp(198px, 18vw, 252px)',
        aspectRatio: '180 / 260',
        background: '#2A2A2A',
        border: '3px solid #000000',
        borderRadius: 10,
        padding: 3,
        gap: 2,
        cursor: onPick ? 'pointer' : 'default',
        boxShadow: `0 0 0 1px #000, 0 8px 20px rgba(0,0,0,0.6), 0 0 16px ${color}55`,
      }}
    >
      {/* title band (12%) */}
      <div className="flex items-center justify-center px-1" style={bandStyle(dark, 12)}>
        <span className="font-osrs leading-none" style={{ color, fontSize: fz(8, 0.74, 12), textShadow: '0 1px 1px #000' }}>{relic.name}</span>
      </div>
      {/* art window (42%) */}
      <div className="flex items-center justify-center" style={bandStyle(mid, 42)}>
        <img src={relic.icon} alt="" className="object-contain" style={{ maxWidth: '64%', maxHeight: '78%', filter: 'drop-shadow(0 2px 3px rgba(0,0,0,0.7))' }} onError={hideBrokenImg} />
      </div>
      {/* tier band (10%) */}
      <div className="flex items-center justify-center" style={bandStyle(dark, 10)}>
        <span className="font-osrs uppercase tracking-wide" style={{ color, fontSize: fz(7, 0.56, 10), textShadow: '0 1px 1px #000' }}>{TIER_LABEL[tier]}</span>
      </div>
      {/* examine band (36%) */}
      <div className="flex items-center justify-center px-2" style={bandStyle(mid, 36)}>
        <span className="font-osrs leading-tight" style={{ color: '#e7dcc0', fontSize: fz(8, 0.72, 12), textShadow: '0 1px 1px #000' }}>{relic.desc}</span>
      </div>
    </button>
  );
}

/** Compact, always-on-screen wave-event indicator, docked in the top-centre HUD so
 *  the active twist stays visible even when the main panel is collapsed. Hover for
 *  the full description; the banner in the main panel carries it inline. */
function WaveEventChip({ event }: { event: NonNullable<UIState['activeEvent']> }) {
  const boon = event.tone === 'boon';
  return (
    <div
      className="wave-event-chip rs-panel relative group flex items-center gap-[0.4em] pl-[0.3em] pr-[0.55em] py-[0.25em] pointer-events-auto"
      style={{ border: `1px solid ${event.color}`, boxShadow: `0 0 8px ${event.color}66` }}
      /* The description only exists in the hover tooltip, which is display:none
         until hover — so screen readers get it from the label instead. */
      role="group"
      aria-label={`${event.name} (${boon ? 'Boon' : 'Hazard'}) — ${event.desc}`}
    >
      {/* Icon box mirrors the potion infoboxes sitting to its right, tinted to the event. */}
      <span className="rs-infobox shrink-0" style={{ border: `1px solid ${event.color}`, boxShadow: `inset 0 0 6px ${event.color}55` }}>
        <img src={event.icon} alt={event.name} onError={hideBrokenImg} />
      </span>
      <div className="flex flex-col leading-none">
        <span className="text-[0.6em] uppercase tracking-wide font-bold" style={{ color: event.color }}>
          {boon ? 'Boon' : 'Hazard'}
        </span>
        <span className="font-bold text-[0.82em] text-[#ffe8b0] whitespace-nowrap">{event.name}</span>
      </div>
      <span className="rs-panel absolute top-full left-1/2 -translate-x-1/2 mt-[0.4em] p-[0.5em] w-[17em] hidden group-hover:block z-40 pointer-events-none text-left">
        <span className="flex items-center gap-[0.4em] leading-none">
          <span className="text-[0.85em] font-bold" style={{ color: event.color }}>{event.name}</span>
          <span className="text-[0.58em] uppercase tracking-wide px-[0.35em] py-[0.05em] rounded-sm" style={{ background: `${event.color}22`, color: event.color }}>
            {boon ? 'Boon' : 'Hazard'}
          </span>
        </span>
        <span className="block text-[0.68em] text-[#cdbe91] mt-[0.25em] leading-tight">{event.desc}</span>
      </span>
    </div>
  );
}

/** Announces the wave's active event (#1): a board-wide rule-bender for this wave
 *  only. Tinted by the event's own colour; the tone word tells hazard from boon. */
function WaveEventBanner({ event }: { event: NonNullable<UIState['activeEvent']> }) {
  return (
    <div
      className="rs-panel-inset p-[0.5em] mb-[0.6em] flex items-center gap-[0.55em]"
      style={{ border: `1px solid ${event.color}`, boxShadow: `inset 0 0 8px ${event.color}44` }}
      title={event.desc}
    >
      <span
        className="relative flex items-center justify-center w-[2.1em] h-[2.1em] rs-panel-inset shrink-0"
        style={{ border: `1px solid ${event.color}` }}
      >
        <img src={event.icon} alt={event.name} className="w-[1.5em] h-[1.5em] object-contain" onError={hideBrokenImg} />
      </span>
      <div className="min-w-0">
        <div className="flex items-center gap-[0.4em] leading-none">
          <span className="text-[0.9em] font-bold truncate" style={{ color: event.color }}>{event.name}</span>
          <span
            className="text-[0.6em] uppercase tracking-wide px-[0.35em] py-[0.05em] rounded-sm shrink-0"
            style={{ background: `${event.color}22`, color: event.color }}
          >
            {event.tone === 'boon' ? 'Boon' : 'Hazard'}
          </span>
        </div>
        <div className="text-[0.72em] text-[#cdbe91] mt-[0.2em] leading-tight">{event.desc}</div>
      </div>
    </div>
  );
}

/** Roguelite owned-relics tray: the run's claimed relics as tier-bordered icons
 *  with a hover tooltip. Rendered in the HUD and the end-of-run summary. */
function OwnedRelicTray({ ids, summary }: { ids: string[]; summary?: boolean }) {
  const [collapsed, toggle] = usePersistedCollapse('ui_min_relics');
  const relics = ids.map((id) => RELIC_BY_ID[id]).filter((r): r is Relic => !!r);
  if (relics.length === 0) return null;
  // The end-of-run summary always shows the full tray (not collapsible).
  const isCollapsed = !summary && collapsed;
  return (
    <div className="rs-panel-inset p-[0.5em] mb-[0.6em]">
      {summary ? (
        <div className="text-[0.78em] text-osrs-orange uppercase tracking-wide mb-[0.4em] flex items-center justify-between">
          <span>Relics Claimed</span>
          <span className="text-[0.85em] text-[#cdbe91]">{relics.length}</span>
        </div>
      ) : (
        <button
          onClick={toggle}
          title={isCollapsed ? 'Expand relics' : 'Minimise relics'}
          className={`flex items-center justify-between w-full ${isCollapsed ? '' : 'mb-[0.4em]'}`}
        >
          <span className="text-[0.78em] text-osrs-orange uppercase tracking-wide flex items-center gap-[0.3em]">
            <span className="text-[0.85em] text-[#cdbe91]">{isCollapsed ? '▸' : '▾'}</span>
            Relics
          </span>
          <span className="text-[0.85em] text-[#cdbe91]">{relics.length}</span>
        </button>
      )}
      {!isCollapsed && (
      <div className={`flex flex-wrap gap-[0.35em] ${summary ? 'justify-center' : ''}`}>
        {relics.map((relic) => (
          <span
            key={relic.id}
            title={`${relic.name} — ${relic.desc}`}
            className="relative flex items-center justify-center w-[2.1em] h-[2.1em] rs-panel-inset"
            style={{ border: `1px solid ${TIER_COLOR[relic.tier]}`, boxShadow: `inset 0 0 6px ${TIER_COLOR[relic.tier]}55` }}
          >
            <img src={relic.icon} alt={relic.name} className="w-[1.5em] h-[1.5em] object-contain" onError={hideBrokenImg} />
          </span>
        ))}
      </div>
      )}
    </div>
  );
}
