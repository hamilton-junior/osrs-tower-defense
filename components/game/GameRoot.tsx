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
import { ASSETS } from '@/lib/game/assets';
import { waveClearBonus } from '@/lib/game/systems/rewards';
import { GLOBAL_UPGRADE_DEFS, DEFAULT_UPGRADES, nextCost, isMaxed, formatUpgradeValue, refundValue } from '@/lib/game/systems/meta-progression';
import { SLAYER_REWARDS } from '@/lib/game/data/slayer';
import { ENEMIES } from '@/lib/game/data/enemies';
import { ENEMY_ANIMS, clipDurationS } from '@/lib/game/data/enemy-anims';
import { isPrayerUnlocked, prayerUnlockWave } from '@/lib/game/systems/prayer';
import { ELEMENTS, ELEMENT_ORDER, ANCIENTS, ANCIENT_ORDER, SUPPORT_SPELLS, SUPPORT_ORDER, ELEMENTAL_TIER_NAMES, ANCIENT_TIER_NAMES, elementalSpellName, ancientSpellName, ancientHit, spellSpriteName } from '@/lib/game/systems/magic';
import type { TowerType, PrayerType, MageMode } from '@/lib/game/types';

const TOWER_ORDER: TowerType[] = ['archer', 'wizard', 'cannon', 'tzhaar', 'slayer', 'toxic'];
/** Which interface fills the bottom-right sidebar body (OSRS tabbed-sidebar
 *  model — one stone per interface). 'home' = wave control + tower shop. */
type SideTab = 'home' | 'ge' | 'essence' | 'slayer';
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
        notes: [{ text: 'Lv3 maul: the blow also briefly stuns (crush)', active: level >= 3 }],
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
  remaining: 0, waveTotal: 0, bossWave: false, activeEvent: null, bossOnField: false, gameOver: false, selectedTowerType: null, selectedTowerId: null,
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
/** Wiki sprite URL for a GE offer (its `wiki` filename + .png). */
const geIcon = (wiki: string) => `${ASSETS.misc.wiki_base}${wiki}.png`;

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
const LOG_FILTERS: { key: LogFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'obtained', label: 'Logged' },
  { key: 'missing', label: 'Missing' },
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
  // Guided tour: a step-by-step spotlight of the live UI, shown once on a
  // player's first ever run. `tourPending` waits for the run to actually start
  // (so the game UI is on-screen to point at); it's only marked "seen" when the
  // tour is finished or skipped, so a reload before then doesn't lose it.
  const [tourPending, setTourPending] = useState(() => !loadBool('osrs_td_seen_tutorial', false));
  const [tourOpen, setTourOpen] = useState(false);
  useEffect(() => {
    if (tourPending && runStarted) setTourOpen(true);
  }, [tourPending, runStarted]);
  const closeTour = useCallback(() => {
    setTourOpen(false);
    setTourPending(false);
    try { localStorage.setItem('osrs_td_seen_tutorial', JSON.stringify(true)); } catch { /* ignore */ }
  }, []);
  // Replay the guided tour from the ❓ guide. Close the guide and reveal the live
  // game UI (the tour points at it), then start the tour from step one.
  const replayTour = useCallback(() => {
    setHelpOpen(false);
    setRunStarted(true);
    setTourOpen(true);
  }, []);
  // Minimize state for the prayer bar (collapses to the best prayer per style).
  const [prayersMin, setPrayersMin] = useState(() => loadBool('ui_min_prayers', false));
  useEffect(() => { try { localStorage.setItem('ui_min_prayers', JSON.stringify(prayersMin)); } catch { /* ignore */ } }, [prayersMin]);
  // Sidebar interface body collapse: clicking the already-selected tab stone
  // minimises the body (OSRS-style), leaving only the tab strip + tower dock.
  const [sideBodyMin, setSideBodyMin] = useState(() => loadBool('ui_min_sidebody', false));
  useEffect(() => { try { localStorage.setItem('ui_min_sidebody', JSON.stringify(sideBodyMin)); } catch { /* ignore */ } }, [sideBodyMin]);
  // Click a tab stone: switch to it (and expand) if it's another tab; toggle the
  // body minimised if it's already the active one.
  const onSideTab = useCallback((t: SideTab) => {
    setSideBodyMin((m) => (tab === t ? !m : false));
    setTab(t);
  }, [tab]);
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

  useEffect(() => {
    if (!canvasRef.current) return;
    const engine = new GameEngine(canvasRef.current, (patch) => setUi((prev) => ({ ...prev, ...patch })), loadSave());
    engineRef.current = engine;
    engine.resize();
    engine.start();
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
    if (netD) parts.push(`+${pct(netD)} damage`);
    if (netR) parts.push(`+${pct(netR)} range`);
    if (netS) parts.push(`+${pct(netS)} attack speed`);
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
      // speed) that pile up in the Boons panel also lift THIS tower — surface one
      // chip per contributing card so the green stats trace back to their source.
      // (mageBuff / synergy cards are handled above; here we only fold the flat
      // damage/range/fireRate cards that hit this tower's style or all towers.)
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
          const bits: string[] = [];
          if (dmg > 1) bits.push(`${pct(dmg - 1)} damage`);
          if (rng > 1) bits.push(`${pct(rng - 1)} range`);
          if (spd > 1) bits.push(`${pct(spd - 1)} attack speed`);
          const headline = dmg > 1 ? dmg - 1 : rng > 1 ? rng - 1 : spd - 1;
          towerBoosts.push({
            key: `boon-${rc.id}`,
            icon: card.icon,
            amount: pct(headline),
            title: `${card.name}${n > 1 ? ` ×${n}` : ''} — ${bits.join(', ')}`,
          });
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
    <div className="relative w-full h-full overflow-hidden bg-black select-none font-osrs">
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
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 rs-panel p-2 flex items-center gap-[0.6em]" style={{ fontSize: 'clamp(13px, 0.85vw, 17px)' }}>
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
            <button className="rs-btn px-[0.6em] py-[0.3em]" onClick={() => engineRef.current?.clearMultiSelect()}>Clear</button>
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
              style={{ fontSize: 'clamp(14px, 0.9vw, 19px)' }}
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
          <div className="rs-panel p-[0.7em]" style={{ fontSize: 'clamp(15px, 1vw, 21px)' }}>
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
          <div className="rs-panel p-2" style={{ fontSize: 'clamp(13px, 0.85vw, 18px)' }}>
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
                      : <span className="text-[10px] capitalize">{TOWERS[type].baseName}</span>}
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

      {/* Always-on top-center cluster: the active wave-event twist + buff infoboxes
          (RuneLite-style icon + remaining seconds). Timers pause between waves, so the
          infoboxes double as a "ready to pull" cue. The whole row drops below the boss
          HP bar while a boss is alive, so the bar stays topmost. */}
      {((ui.waveActive && ui.activeEvent) || activeInfoboxes.length > 0) && (
        <div
          className="absolute left-1/2 -translate-x-1/2 z-10 flex items-start gap-[0.4em] transition-[top] duration-300"
          style={{ top: ui.bossOnField ? '4.5rem' : '0.5rem' }}
        >
          {ui.waveActive && ui.activeEvent && <WaveEventChip event={ui.activeEvent} />}
          {activeInfoboxes.map((o) => (
            <div key={o.id} className="rs-infobox pointer-events-none" title={`${o.name} — ${o.desc} · ${o.activeSecs}s left`}>
              <img src={geIcon(o.wiki)} alt={o.name} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
              <span className="rs-infobox-time">{o.activeSecs}</span>
            </div>
          ))}
        </div>
      )}

      {/* Top-right data-orb cluster (OSRS minimap-orb style) */}
      <div data-tut="hud" className="absolute top-4 right-4 flex flex-col gap-2 z-10 items-end">
        <Orb
          icon={ASSETS.misc.hp_icon}
          title="Lives"
          value={ui.lives}
          valueColor={ui.lives <= 5 ? '#ff4b4b' : undefined}
          fill={ui.lives / ui.maxLives}
          fillColor="linear-gradient(180deg, #e23a3a, #8a0000)"
        />
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
          icon={ASSETS.misc.prayer_icon}
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
          style={{ fontSize: 'clamp(14px, 0.92vw, 20px)' }}
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
                <p className="text-[0.62em] text-[#b3a585] leading-snug">{sig.desc}</p>
                {sig.notes.length > 0 && (
                  <ul className="mt-[0.3em] space-y-[0.15em]">
                    {sig.notes.map((n, i) => (
                      <li
                        key={i}
                        className={`text-[0.6em] leading-snug flex gap-[0.35em] ${n.active ? 'text-[#9ccf9c]' : 'text-[#7a6f57]'}`}
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
              the source icon + its damage bonus — potion timers live up top. */}
          {towerBoosts.length > 0 && (
            <div className="mt-[0.6em] px-[0.2em]">
              <div className="text-[0.68em] text-[#5bd75b] uppercase tracking-wide mb-[0.3em]">Active boosts</div>
              <div className="flex flex-wrap gap-[0.3em]">
                {towerBoosts.map((b) => (
                  <span key={b.key} className="rs-buff-chip" title={b.title}>
                    <img src={b.icon} alt="" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                    <span className="rs-buff-secs">{b.amount}</span>
                  </span>
                ))}
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
                      return (
                        <button
                          key={s}
                          title={`${SUPPORT_SPELLS[s].label} — ${SUPPORT_SPELLS[s].desc}`}
                          onClick={() => engineRef.current?.setSupportSpell(selectedTower.id, s)}
                          className={`rs-btn flex items-center justify-center px-0 py-[0.3em] ${active ? 'rs-btn-primary' : ''}`}
                          style={{ borderBottom: `2px solid ${SUPPORT_SPELLS[s].color}` }}
                        >
                          {icon
                            ? <img src={icon} alt={SUPPORT_SPELLS[s].label} className="w-[1.6em] h-[1.6em] object-contain" onError={hideBrokenImg} />
                            : <span className="text-[0.62em]" style={{ color: SUPPORT_SPELLS[s].color }}>{SUPPORT_SPELLS[s].label}</span>}
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-[0.62em] text-[#b3a585] mt-[0.35em] px-[0.2em] leading-snug">
                    {SUPPORT_SPELLS[selectedTower.supportSpell ?? 'curse'].desc}.
                    Always-on aura boosts nearby towers' range, speed &amp; damage too.
                  </p>
                </>
              )}

              {(selectedTower.mageMode ?? 'elemental') === 'elemental' && (
                <p className="text-[0.62em] text-[#b3a585] mt-[0.35em] px-[0.2em] leading-snug">
                  {ELEMENTS[(selectedTower.element ?? 'air') as keyof typeof ELEMENTS].desc}
                </p>
              )}

              {selectedTower.mageMode === 'ancients' && (
                <p className="text-[0.62em] text-[#b3a585] mt-[0.35em] px-[0.2em] leading-snug">
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

      {/* Bottom-right interface: an OSRS-style tabbed sidebar. The stone strip
          selects which interface fills the body — Home (wave + tower shop), Grand
          Exchange, Essence Shop, Slayer Rewards — while the Collection Log and
          Debug stones pop out their own larger windows (as they do in-game). */}
      <MovablePanel
        id="shop"
        globalLock={uiLocked}
        className="rs-panel absolute bottom-4 right-4 p-3 z-10 w-[24em] flex flex-col"
        style={{ fontSize: 'clamp(14px, 0.9vw, 19px)', maxHeight: '92vh' }}
      >
        {/* OSRS sidebar tab strip: each stone selects an interface (or pops one
            out). Icons + tooltips, with live badges for essence / Slayer points.
            `order-2` pins it BELOW the tab body (order-1) and ABOVE the tower dock
            (order-3): since the panel is bottom-anchored and grows upward, keeping
            the strip low means the buttons hold a constant position no matter how
            tall the open interface above them is. */}
        <div
          data-tut="sidebar"
          className="order-2 shrink-0 flex items-center justify-center gap-[0.4em] pt-[0.55em] mt-[0.6em] border-t border-[var(--rs-keyline)]"
          style={{ boxShadow: 'inset 0 1px 0 0 var(--rs-bevel-light)' }}
        >
          <button onClick={() => onSideTab('home')} title="Towers &amp; Wave" className={`rs-tab ${tab === 'home' && !sideBodyMin ? 'rs-tab-on' : ''}`}>
            <img src={ASSETS.misc.multicombat_icon} alt="Towers &amp; Wave" onError={hideBrokenImg} />
          </button>
          <button data-tut="ge" onClick={() => onSideTab('ge')} title="Grand Exchange" className={`rs-tab ${tab === 'ge' && !sideBodyMin ? 'rs-tab-on' : ''}`}>
            <img src={ASSETS.misc.ge_logo} alt="Grand Exchange" onError={hideBrokenImg} />
          </button>
          <button data-tut="essence" onClick={() => onSideTab('essence')} title="Essence Shop — permanent upgrades" className={`rs-tab ${tab === 'essence' && !sideBodyMin ? 'rs-tab-on' : ''}`}>
            <img src={ASSETS.misc.rune_essence_icon} alt="Essence Shop" onError={hideBrokenImg} />
            <span className="rs-tab-badge">{fmt(ui.essence)}</span>
          </button>
          <button data-tut="slayer" onClick={() => onSideTab('slayer')} title="Slayer Rewards" className={`rs-tab ${tab === 'slayer' && !sideBodyMin ? 'rs-tab-on' : ''}`}>
            <img src={ASSETS.misc.slayer_crossbow} alt="Slayer Rewards" onError={hideBrokenImg} />
            <span className="rs-tab-badge">{ui.slayerPoints}</span>
          </button>
          <button onClick={() => setLogOpen((o) => !o)} title="Collection Log" className={`rs-tab ${logOpen ? 'rs-tab-on' : ''}`}>
            <img src={`${ASSETS.misc.wiki_base}Collection_log.png`} alt="Collection Log" onError={hideBrokenImg} />
          </button>
          <button onClick={() => setDebugOpen((o) => !o)} title="Debug &amp; bestiary" className={`rs-tab text-[1.15em] ${debugOpen ? 'rs-tab-on' : ''}`}>
            🛠
          </button>
          <button data-tut="help" onClick={() => setHelpOpen(true)} title="How to Play" className={`rs-tab text-[1.15em] ${helpOpen ? 'rs-tab-on' : ''}`}>
            ❓
          </button>
        </div>

        {/* Tab body (top section): keyed by `tab` so switching re-mounts this
            wrapper and retriggers the soft fade/slide-in (rs-tab-body). This is the
            ONLY part the tab stones swap — the tower dock below stays mounted. flex-1
            + overflow lets a long shop list scroll while the dock stays pinned.
            Hidden when the active tab is clicked again (sideBodyMin), collapsing
            the panel to just the tab strip + tower dock. */}
        {!sideBodyMin && (
        <div key={tab} className="order-1 rs-tab-body flex-1 min-h-0 overflow-y-auto pr-[0.1em]">
        {/* ── HOME: wave control + Slayer task summary ── */}
        {tab === 'home' && (
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

        {!ui.gameOver && (
          ui.waveActive ? (
            <div className="mb-[0.6em]">
              <div className="flex items-center justify-between text-[0.9em] text-osrs-orange mb-[0.25em]">
                <span>⚔ Wave {ui.wave}{ui.bossWave ? ' — BOSS' : ''}</span>
                <span className="text-[#cdbe91]">{ui.remaining} left</span>
              </div>
              <div className="rs-progress">
                <div
                  className={`rs-progress-fill ${ui.bossWave ? 'rs-progress-fill-boss' : ''}`}
                  style={{ width: `${ui.waveTotal ? Math.round(((ui.waveTotal - ui.remaining) / ui.waveTotal) * 100) : 0}%` }}
                />
              </div>
              {ui.activeEvent && <WaveEventBanner event={ui.activeEvent} />}
            </div>
          ) : (
            <>
              {/* Mode is chosen on the StartScreen; here we only show the current
                  mode as a small badge before each wave starts. */}
              <div className="text-[0.7em] text-[#cdbe91] uppercase tracking-wide mb-[0.4em] text-center">
                Mode: <span className="text-osrs-orange font-bold">{ui.gameMode === 'roguelite' ? 'Roguelite' : 'Classic'}</span>
              </div>
              <button
                data-tut="startwave"
                className="rs-btn rs-btn-primary w-full py-[0.5em] mb-[0.6em] text-[1.05em] animate-pulse"
                onClick={() => engineRef.current?.startWave()}
              >
                ▶ Start Wave {ui.wave}
              </button>
            </>
          )
        )}

        {/* Roguelite loadout-at-a-glance: the run's claimed relics (milestone
            picks) above the rule-changing draft boons, so neither is forgotten. */}
        {ui.gameMode === 'roguelite' && ui.ownedRelics.length > 0 && (
          <OwnedRelicTray ids={ui.ownedRelics} />
        )}
        {ui.gameMode === 'roguelite' && ui.runCards.length > 0 && (
          <RelicStrip cards={ui.runCards} />
        )}
        </>
        )}

        {/* ── GRAND EXCHANGE ── */}
        {tab === 'ge' && (
        <>
          <div className="rs-panel-title flex items-center gap-2">
            <img src={ASSETS.misc.ge_logo} alt="" className="w-[1.3em] h-[1.3em] object-contain" onError={hideBrokenImg} />
            Grand Exchange
          </div>
          <div className="space-y-[0.4em] mt-[0.6em] pr-[0.2em]">
            {ui.geOffers.map((o) => {
              const afford = ui.money >= o.price;
              return (
                <button
                  key={o.id}
                  onClick={() => engineRef.current?.buyGeOffer(o.id)}
                  disabled={!afford}
                  title={o.desc}
                  className={`rs-ge-row w-full flex items-center gap-[0.6em] p-[0.4em] text-left ${afford ? '' : 'rs-slot-unafford'}`}
                >
                  <img src={geIcon(o.wiki)} alt="" className="w-[1.8em] h-[1.8em] object-contain shrink-0" onError={(e) => { (e.target as HTMLImageElement).style.visibility = 'hidden'; }} />
                  <span className="flex-1 min-w-0">
                    <span className="flex items-center gap-[0.4em]">
                      <span className="text-[#e7d9b0] truncate">{o.name}</span>
                      {o.activeSecs > 0 && <span className="rs-ge-timer">{o.activeSecs}s</span>}
                    </span>
                    <span className="block text-[0.7em] text-[#d3c3a0] truncate">{o.desc}</span>
                  </span>
                  <span className="font-bold whitespace-nowrap" style={{ color: afford ? 'var(--osrs-yellow)' : 'var(--osrs-red)' }}>
                    {fmt(o.price)}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="text-center text-[0.66em] text-[#b3a585] mt-[0.6em]">
            Buffs last 45s · prices drift with demand each wave
          </p>
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
        </div>
        )}

        {/* Tower shop — ALWAYS visible, regardless of the selected tab, so towers
            stay one click away while browsing the GE / Essence / Slayer interfaces.
            The tab stones only swap the top section; this dock never unmounts.
            `order-3` keeps it pinned at the very bottom, below the tab strip. */}
        <div
          className="order-3 shrink-0 relative pt-[0.6em] mt-[0.6em] border-t border-[var(--rs-keyline)]"
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
                style={{ fontSize: 'clamp(13px, 0.85vw, 17px)' }}
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
      </MovablePanel>

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
          <div className="rs-panel px-[1.1em] py-[0.4em] text-center" style={{ fontSize: 'clamp(13px, 0.85vw, 17px)' }}>
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
          <div className="flex gap-6 flex-wrap justify-center">
            {ui.pendingDraft.map((card) => (
              <DraftCardView
                key={card.id}
                card={card}
                large
                onPick={() => engineRef.current?.pickDraftCard(card.id)}
                ctx={{ runMods: ui.runMods, gold: ui.money, essence: ui.essence, lives: ui.lives, maxLives: ui.maxLives }}
              />
            ))}
          </div>
          {/* Trickster relic: re-roll the hand while charges remain. */}
          {ui.draftRerolls > 0 && (
            <button
              className="rs-btn rs-btn-primary mt-4 px-[1.2em] py-[0.4em] text-[0.9em]"
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
            <button className="rs-btn rs-btn-primary px-6 py-2 w-full" onClick={() => { engineRef.current?.restart(); setRunStarted(false); }}>
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
      {helpOpen && <HowToPlay onClose={() => setHelpOpen(false)} onReplay={replayTour} />}

      {/* First-run guided tour — spotlights each part of the live UI in turn */}
      {tourOpen && <GuidedTour onClose={closeTour} />}
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
  const fz = (min: number, vw: number, max: number) => `clamp(${min * k}px, ${(vw * k).toFixed(3)}vw, ${max * k}px)`;
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
          style={{ fontSize: 'clamp(8px,0.66vw,11px)', textShadow: '0 1px 2px #000', background: 'rgba(0,0,0,0.55)', borderRadius: 4, padding: '0 0.3em' }}
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
// ─────────────────────────── Guided first-run tour ────────────────────────
// A step-by-step spotlight over the live UI: each step optionally points at a
// real element (tagged `data-tut="…"`) by measuring its on-screen rect, dimming
// everything else, and floating a caption beside it. Steps without a target are
// centred (intro / whole-screen context). Shown once on a player's first run.

interface TourStep { target?: string; title: string; body: string }

const TOUR_STEPS: TourStep[] = [
  { title: 'Welcome to OSRS Tower Defense', body: 'A quick tour of the screen and its systems. Hit Skip anytime — and you can reopen the full guide from the ❓ stone later.' },
  { title: 'The battlefield', body: 'Enemies march along the path toward your base. You stop them by building towers on the grass — they aim and fire on their own.' },
  { target: 'dock', title: 'Tower shop', body: 'Pick a tower here, then click the grass to place it. Hover any tower first to see what it does and its cost.' },
  { target: 'startwave', title: 'Start the wave', body: 'Set up your defences, then press this to send the next wave. Between waves the game waits — no rush.' },
  { target: 'hud', title: 'Lives & gold', body: 'Up here: your lives (you lose one each time an enemy reaches the base) and your gold (earned from kills, spent on towers).' },
  { title: 'Enemy affixes', body: 'From wave 5, some enemies glow with an affix that changes the rules: Shielded soaks a burst, Armored halves one style, Warded ignores slows/stuns, Volatile disables a tower on death, Swarm packs in, Colossal costs two lives. Just one affix when they first unlock — but deep into a run a single elite can stack several at once. Read the aura colours and diversify your defences.' },
  { title: 'Wave events', body: 'From wave 3, a wave can roll an event — a board-wide twist shown by a banner under the wave bar that lasts just that wave. Hazards make you adapt: Dense Fog shrinks tower range, Iron Tide toughens every enemy, Frenzy speeds the horde, Curse of Darkness saps your damage, Infestation swells the wave with frail stragglers. Blood Moon is a gamble — harder, but pays far more gold. And boons help: Overcharge (faster towers), Clear Skies (more range), War Banner (more damage). Events never roll on a boss wave.' },
  { title: 'Boss mechanics', body: 'The signature bosses fight back. Zulrah cycles three forms (green / blue / red) — each weak to one style and resistant to the others, so switch towers to match its colour. Vorkath periodically raises an ice shield: it turns immune and freezes your nearest tower for a few seconds — weather it. Jad summons Yt-HurKot healers below half health that claw back the damage you dealt him — divert fire to kill the healers. And once you have beaten a boss, future encounters can also roll affixes on top.' },
  { title: 'Relics (Roguelite)', body: 'In Roguelite mode, every 5th wave swaps the card draft for a choice of Relics: powerful run-long passives, one of each, themed on the OSRS Leagues relics. Executioner slays low-health enemies outright, Banker\'s Note pays gold interest each wave, Trickster re-rolls a draft hand, Production Prodigy adds a card to every hand, and Last Recall cheats one lethal leak. They live in your Relics panel, above the rule-changing Boons.' },
  { target: 'prayers', title: 'Prayer', body: 'Toggle prayers to buff a tower style (ranged / magic / melee) or protect your base. They drain a Prayer pool while on and refill between waves — flip the big ones on for boss waves.' },
  { target: 'sidebar', title: 'More interfaces', body: 'These stones open the Grand Exchange, Essence Shop, Slayer Rewards and the Collection Log. The next few steps walk through each.' },
  { target: 'ge', title: 'Grand Exchange', body: 'Spend gold on potions and consumables for a timed buff. Prices drift with demand each wave, so stock up on the buffs you rely on when they are cheap.' },
  { target: 'essence', title: 'Essence Shop', body: 'Rune Essence is earned every wave and kept forever — even through a game over. Spend it here on permanent global upgrades that seed every future run.' },
  { target: 'slayer', title: 'Slayer', body: 'A master assigns a kill-X-of-a-monster task for Slayer points and a streak. Spend points on a Helmet (+damage vs your task), Skip Task, or convert them into permanent essence.' },
  { title: 'Magic spellbooks', body: 'Before placing a Wizard you pick its spellbook: Elemental (single-target burst), Ancients (AoE barrage) or Utility (support). It locks once placed — match the book to the threat, and hit enemies with the element they are weak to.' },
  { target: 'controls', title: 'Speed & sound', body: 'Fast-forward the action at 1× / 2× / 5×, pause, and set the volume — all down here.' },
  { target: 'help', title: 'Need a refresher?', body: 'Click the ❓ stone anytime to reopen the full How to Play guide — every system above has a detailed page there. Good luck out there!' },
];

/** First-run guided tour overlay. Measures each step's target rect, draws a
 *  spotlight (the rest dimmed via a giant box-shadow), and anchors a caption
 *  beside it with Back / Next / Skip. */
function GuidedTour({ onClose }: { onClose: () => void }) {
  const [i, setI] = useState(0);
  const [box, setBox] = useState<{ rect: DOMRect | null; vw: number; vh: number }>({ rect: null, vw: 0, vh: 0 });
  const step = TOUR_STEPS[i];
  const last = i === TOUR_STEPS.length - 1;

  useLayoutEffect(() => {
    const measure = () => {
      const el = step.target ? document.querySelector(`[data-tut="${step.target}"]`) : null;
      setBox({ rect: el ? el.getBoundingClientRect() : null, vw: window.innerWidth, vh: window.innerHeight });
    };
    measure();
    window.addEventListener('resize', measure);
    const id = window.setInterval(measure, 250); // re-measure: panels may move / layout settles
    return () => { window.removeEventListener('resize', measure); window.clearInterval(id); };
  }, [step.target]);

  const { rect, vw, vh } = box;
  const pad = 6;
  const balloonW = Math.min(340, (vw || 360) - 24);

  // Place the caption beside the spotlight on whichever side has room; centre it
  // when the step has no target. Clamp so it never spills off-screen.
  let bStyle: React.CSSProperties;
  if (rect) {
    const placeBelow = vh - rect.bottom > 200 || vh - rect.bottom >= rect.top;
    const cx = rect.left + rect.width / 2;
    const left = Math.min(Math.max(12, cx - balloonW / 2), vw - balloonW - 12);
    bStyle = placeBelow
      ? { left, top: Math.min(rect.bottom + 14, vh - 170) }
      : { left, bottom: Math.min(vh - rect.top + 14, vh - 60) };
  } else {
    bStyle = { left: (vw || 360) / 2 - balloonW / 2, top: (vh || 640) / 2 - 90 };
  }

  const next = () => (last ? onClose() : setI((n) => Math.min(TOUR_STEPS.length - 1, n + 1)));

  return (
    <>
      {/* Click-blocker. With a target, the spotlight's box-shadow does the dimming;
          without one, this sheet dims the whole screen. */}
      <div
        className="fixed inset-0 z-[60]"
        style={{ background: rect ? 'transparent' : 'rgba(0,0,0,0.8)' }}
        onClick={(e) => e.stopPropagation()}
      />
      {rect && (
        <div
          className="fixed z-[61] pointer-events-none"
          style={{
            left: rect.left - pad, top: rect.top - pad,
            width: rect.width + pad * 2, height: rect.height + pad * 2,
            borderRadius: 8, border: '2px solid var(--osrs-orange)',
            boxShadow: '0 0 0 9999px rgba(0,0,0,0.74), 0 0 12px 2px rgba(255,140,0,0.5)',
            transition: 'left .2s, top .2s, width .2s, height .2s',
          }}
        />
      )}
      <div className="fixed z-[62] rs-panel p-3 flex flex-col" style={{ ...bStyle, width: balloonW, fontSize: 'clamp(13px,0.85vw,17px)' }}>
        <div className="flex items-center justify-between mb-[0.3em]">
          <span className="text-osrs-orange font-bold text-[0.95em]">{step.title}</span>
          <span className="text-[0.68em] text-[#cdbe91]">{i + 1}/{TOUR_STEPS.length}</span>
        </div>
        <p className="text-[0.82em] text-[#d3c3a0] leading-snug mb-[0.7em]">{step.body}</p>
        <div className="flex items-center justify-between gap-[0.5em]">
          <button className="rs-btn px-[0.7em] py-[0.25em] text-[0.72em]" onClick={onClose}>Skip</button>
          <div className="flex items-center gap-[0.4em]">
            {i > 0 && (
              <button className="rs-btn px-[0.8em] py-[0.25em] text-[0.78em]" onClick={() => setI((n) => Math.max(0, n - 1))}>‹ Back</button>
            )}
            <button className="rs-btn rs-btn-primary px-[0.9em] py-[0.25em] text-[0.78em]" onClick={next}>
              {last ? 'Finish ✓' : 'Next ›'}
            </button>
          </div>
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

type HelpTier = 'basic' | 'advanced';
interface HelpBlock { icon?: string; title?: string; body: string; }
interface HelpSection { id: string; label: string; tier: HelpTier; intro?: string; blocks: HelpBlock[] }

const COLLECTION_LOG_ICON = `${ASSETS.misc.wiki_base}Collection_log.png`;

const HELP_SECTIONS: HelpSection[] = [
  {
    id: 'basics', label: 'Basics', tier: 'basic',
    intro: "Never played a tower defense? Here's the whole idea in four steps.",
    blocks: [
      { title: 'Enemies follow the path', body: 'Each wave, monsters march along the marked path toward your base. They never attack your towers — they just try to get through.' },
      { title: 'You build towers', body: 'Place towers on the grass beside the path. They shoot anything in range on their own — you win by positioning, not aiming.' },
      { title: 'Kills pay for more', body: 'Every kill drops gold. Spend it on new towers and upgrades. Stronger defences let you survive deeper, tougher waves.' },
      { title: "Don't let them through", body: 'An enemy that reaches your base costs a life. Lose all your lives and the run ends. That is the whole game: outbuild the horde.' },
    ],
  },
  {
    id: 'towers', label: 'Towers', tier: 'basic',
    blocks: [
      { title: 'Placing', body: 'Pick a tower from the dock, then click an empty patch of grass. Its price is on the button; the ring that appears is its attack range.' },
      { title: 'Upgrade & sell', body: "Click a tower you've built to open it. Upgrade raises its tier — more damage, range and fire rate. Sell refunds it and frees the spot." },
      { title: 'Target priority', body: 'Each tower can focus the First, Last, Strongest, Weakest or Closest enemy in range. Strongest hunts tanks; First stops leaks at the front.' },
      { title: 'Build in bulk', body: 'Hold Shift to keep placing the same tower without re-picking it. Drag a box over several towers to select them and upgrade the whole batch at once.' },
      { title: 'Every tower has a niche', body: 'Archer = fast volume DPS (twin-shot when upgraded). Wizard = the all-rounder, its spellbook does single-target or AoE. Cannon = splash crowd-clear. TzHaar = heavy melee. Slayer = bonus vs your task, superiors and bosses. Toxic = venom that climbs the longer it burns.' },
    ],
  },
  {
    id: 'waves', label: 'Waves & Lives', tier: 'basic',
    blocks: [
      { title: 'Start a wave', body: 'Nothing spawns until you press Start Wave. Between waves the game sits in build mode (paused) so you can place and upgrade freely — take your time.' },
      { title: 'Boss waves', body: 'Some waves bring a boss with its own health bar. They hit harder and soak far more damage — line up your strongest towers and buffs first.' },
      { title: 'Lives & game over', body: 'The hearts up top are your lives; every leak takes one. At zero the run ends with a summary screen, and you can jump straight into another.' },
      { title: 'Speed & pause', body: 'Run the action at 1× / 2× / 5× to fast-forward the quiet stretches, and press Esc (or ⏸) to pause whenever you need to think. Space sends the next wave.' },
    ],
  },
  {
    id: 'affixes', label: 'Enemy Affixes', tier: 'basic',
    intro: 'From wave 5 on, some enemies arrive "elite" — glowing with an affix that forces you to adapt instead of stacking one tower.',
    blocks: [
      { title: 'How to read them', body: 'An elite enemy is wrapped in a coloured aura — one ring per affix. On the wave they first unlock an elite always carries exactly one; the deeper you push, the more a single enemy can stack (with no hard ceiling), so read every ring. Bosses come clean the first time, then can roll affixes on top of their mechanics on later encounters.' },
      { title: 'Defensive affixes', body: 'Shielded — a cyan pip soaks a burst of damage before its health is touched (punishes chip DPS). Armored — takes half damage from one combat style, so bring another. Regenerating — heals over time unless you finish it fast.' },
      { title: 'Disruptive affixes', body: 'Warded — immune to slows, stuns and freezes. Volatile — detonates on death, briefly disabling your nearest tower (so don’t cram towers in one spot). Hasted — moves much faster and exposes coverage gaps.' },
      { title: 'Mass affixes', body: 'Swarm — arrives as a pack of frail copies, so spread/area damage shines. Colossal — one hulking, slow straggler with extra health that costs two lives if it leaks. Diversify your defences and elites stop being scary.' },
    ],
  },
  {
    id: 'events', label: 'Wave Events', tier: 'basic',
    intro: 'From wave 3 on, a wave can roll an event — a board-wide twist announced by a banner under the wave bar that lasts that one wave, then clears. It hits every enemy and every tower, in both Classic and Roguelite.',
    blocks: [
      { title: 'Hazards', body: 'Most events make you work: Dense Fog cuts your towers’ range, Iron Tide makes every enemy far tougher, Frenzy sends the horde charging in much faster, Curse of Darkness saps your towers’ damage, and Infestation swells the wave with frail, numberless stragglers. Read the banner and play around it — reposition, switch styles, lean on area damage.' },
      { title: 'Risk & reward', body: 'Blood Moon is the gamble: enemies are stronger and swifter, but drop far more gold. It never inflates the economy for free — you earn the payout by beating a genuinely harder wave.' },
      { title: 'Boons', body: 'Some events help instead: Overcharge speeds up every tower, Clear Skies extends their range, and War Banner boosts their damage. When one lands, press the advantage. Events never roll on a boss wave — the boss is the headline act.' },
    ],
  },
  {
    id: 'bosses', label: 'Boss Mechanics', tier: 'basic',
    intro: 'The signature bosses are not just big health bars — each fights with its own mechanic you have to answer.',
    blocks: [
      { title: 'Zulrah — rotating forms', body: 'Zulrah cycles three forms shown by its colour: green is weak to magic, blue to ranged, red to melee — and it strongly resists the other two styles. Watch the tint and the caption under its health bar, and switch which towers are firing to match the current form.' },
      { title: 'Vorkath — ice shield', body: 'Every so often Vorkath raises an ice shield: it turns fully immune to damage and freezes your nearest tower for a few seconds. You cannot out-DPS the shield — keep the rest of your line firing and wait it out, then resume.' },
      { title: 'Jad — Yt-HurKot healers', body: 'Below half health Jad summons healer orbs that regenerate a slice of the damage you just dealt him, undoing your progress. Divert fire to cut the healers down (they award nothing — their death is the reward); kill them all and pile back onto Jad before he summons another batch.' },
      { title: 'Boss modifiers', body: 'Once you have survived a boss at least once, future encounters can also roll one or two of the normal affixes on top of its mechanic — a Shielded or Hasted Zulrah, say. The very first time you meet a boss is always the clean, mechanic-only fight.' },
    ],
  },
  {
    id: 'roguelite', label: 'Roguelite', tier: 'basic',
    intro: 'The Roguelite mode layers a card draft on top of everything above.',
    blocks: [
      { icon: COLLECTION_LOG_ICON, title: 'Pick one card per wave', body: 'Clear a wave and you are offered three reward cards — keep one. They stack all run long, so your defences snowball into a build that is uniquely yours.' },
      { title: 'Rarities', body: 'Cards range Common → Uncommon → Rare → Ultra-rare. Rarer cards are stronger or wilder, and turn up far less often.' },
      { title: 'What cards do', body: 'Some give flat boosts — damage, range, gold, lives, essence. Others rewrite how towers behave: ricochet kills, venom tips, chain-freeze, pierce, last-stand. The rule-changing ones gather in your Boons panel.' },
      { title: 'Relics — milestone picks', body: 'Every 5th wave the draft is replaced by a choice of Relics: powerful, run-long passives you only ever hold one of, themed on the OSRS Leagues relics. Executioner slays low-health enemies outright, Banker\'s Note pays interest each wave, Trickster lets you re-roll a draft hand, Production Prodigy adds a card to every hand, and Last Recall saves you from one lethal leak. They sit in your Relics panel, above your Boons.' },
      { title: 'Run summary', body: 'When a run ends you get a recap — wave reached, kills, gold, essence banked, the relics you claimed and the full build of cards you drafted.' },
    ],
  },
  {
    id: 'prayer', label: 'Prayer', tier: 'advanced',
    intro: 'Prayer is a toggled boost layer for your towers — strong, but it burns a limited pool.',
    blocks: [
      { icon: ASSETS.misc.prayer_icon, title: 'What it does', body: 'Each prayer is a buff you switch on: some raise a combat style (ranged, magic or melee tower damage and accuracy), others protect your base from a damage type. Several can run at once.' },
      { title: 'How to use it', body: 'Open the Prayer panel and click a prayer to toggle it. Active prayers drain your Prayer points; when the pool hits zero they all switch off. Points refill between waves, so flip the big buffs on for boss waves and tough pushes, then off to coast.' },
      { title: 'How to improve it', body: 'Stronger prayers unlock automatically as you reach deeper waves. Between runs, the Essence Shop sells Prayer regen / max-point upgrades so you can hold the good prayers on for longer every run.' },
    ],
  },
  {
    id: 'slayer', label: 'Slayer', tier: 'advanced',
    intro: 'Slayer turns "which monster do I kill" into a reward loop with its own currency.',
    blocks: [
      { icon: ASSETS.misc.slayer_crossbow, title: 'What it does', body: 'A Slayer master assigns a task — kill X of a specific monster type. Finishing it pays Slayer points and builds a streak; the more tasks you complete in a row, the bigger the point payouts.' },
      { title: 'How to use it', body: 'Just keep killing — the task counts down on its own as the right monsters die. The Slayer tower also deals bonus damage to your current task, to superior monsters and to bosses, so it shines while a task is up.' },
      { title: 'How to improve it', body: 'Spend points in the Slayer Rewards shop: the Helmet (+damage vs your task this run), Skip Task to dodge a bad assignment, or an Essence Pouch to convert leftover points into permanent Rune Essence. Protect your streak — it scales every future payout.' },
    ],
  },
  {
    id: 'magic', label: 'Magic', tier: 'advanced',
    intro: 'The Wizard is the only tower whose role you pick — its spellbook decides what it is good at.',
    blocks: [
      { icon: ASSETS.misc.magic_icon, title: 'What it does', body: 'Before you place a Wizard you choose its spellbook: Elemental (single-target burst), Ancients (AoE barrage that splashes nearby enemies) or Utility (support effects). The choice locks once the tower is down.' },
      { title: 'How to use it', body: 'Match the book to the threat: Elemental to delete a single tank or boss, Ancients to melt clustered packs. Elemental spells also have elemental weaknesses — hitting an enemy with the type it is weak to deals extra damage.' },
      { title: 'How to improve it', body: 'Upgrade the Wizard to climb its spell tier (Strike → Bolt → Blast → Wave → Surge) for more damage and range. Draft cards and prayers that buff magic stack on top, and a couple of well-chosen elements cover most enemy weaknesses.' },
    ],
  },
  {
    id: 'ge', label: 'Grand Exchange', tier: 'advanced',
    intro: 'The GE is your gold sink for temporary, on-demand power spikes.',
    blocks: [
      { icon: ASSETS.misc.ge_logo, title: 'What it does', body: 'Spend gold on consumables and potions that grant a timed buff — extra damage, range or a combat-style boost — for a stretch of the fight.' },
      { title: 'How to use it', body: 'Buy from the GE panel; the effect runs on a timer shown with your active potions. A styled potion (e.g. a Strength brew) only buffs that tower style, so line the potion up with the towers it helps before a hard wave.' },
      { title: 'How to improve it', body: 'Prices drift with demand every wave, so the same item gets cheaper or pricier over time — stock up when a buff you rely on is cheap, and cash in on bigger gold income from kills and draft cards.' },
    ],
  },
  {
    id: 'meta', label: 'Essence & Progress', tier: 'advanced',
    intro: 'Losing is never wasted — every run feeds permanent progress through Rune Essence.',
    blocks: [
      { icon: ASSETS.misc.rune_essence_icon, title: 'What Rune Essence is', body: 'Essence is the meta-currency that makes you permanently stronger. You earn it every wave you clear (and from essence draft cards), and unlike gold it is kept forever — even through a game over.' },
      { icon: ASSETS.misc.rune_essence_icon, title: 'How to spend it (Essence Shop)', body: 'Between runs, spend essence in the Essence Shop on global upgrades — starting gold, tower range, tower damage, prayer regen and more. These seed every future run, so a fresh game starts stronger than the last.' },
      { title: 'How to improve your gains', body: 'Reach deeper waves (later clears pay more essence), pick essence cards in Roguelite, and turn spare Slayer points into essence via the Slayer Essence Pouch. It all banks into the same permanent pool.' },
      { icon: COLLECTION_LOG_ICON, title: 'Collection Log', body: 'Tracks your lifetime kills per monster and every draft card you have picked. Filter and sort each tab to chase 100% completion.' },
    ],
  },
  {
    id: 'controls', label: 'Controls', tier: 'basic',
    intro: 'Handy shortcuts once you find your rhythm.',
    blocks: [
      { body: 'Space — start the next wave' },
      { body: 'Esc — pause / resume (or cancel a pending placement or selection)' },
      { body: '1 / 2 / 5 — game speed' },
      { body: 'Q / W / E / R — swap the selected wizard’s element / barrage / field' },
      { body: 'M — mute' },
      { body: 'Shift — keep placing the same tower' },
      { body: 'Drag a box — multi-select towers to batch-upgrade' },
      { body: 'Panels are draggable — use the lock to pin your layout' },
      { body: 'Reopen this guide anytime from the ❓ stone.' },
    ],
  },
];

const HELP_TIER_BADGE: Record<HelpTier, { label: string; color: string }> = {
  basic: { label: 'Basic', color: '#2ECC71' },
  advanced: { label: 'Advanced', color: '#E0A030' },
};

/** "How to Play" overlay: a tabbed OSRS window. Section tabs run Basic →
 *  Advanced; the body scrolls and Back/Next walk through them in order. */
function HowToPlay({ onClose, onReplay }: { onClose: () => void; onReplay: () => void }) {
  const [page, setPage] = useState(0);
  const section = HELP_SECTIONS[page];
  const badge = HELP_TIER_BADGE[section.tier];
  return (
    <div className="absolute inset-0 bg-black/82 flex items-center justify-center z-50 p-4">
      <div className="rs-panel p-5 w-[40em] max-w-[96vw] flex flex-col" style={{ maxHeight: '92vh', fontSize: 'clamp(14px, 0.95vw, 19px)' }}>
        <div className="flex items-center justify-between gap-[0.5em] mb-[0.5em]">
          <span className="text-osrs-orange font-bold text-[1.15em]">How to Play</span>
          <div className="flex items-center gap-[0.4em]">
            <button className="rs-btn px-[0.7em] py-[0.15em] text-[0.72em]" onClick={onReplay} title="Replay the guided tour">↻ Replay tour</button>
            <button className="rs-btn px-[0.7em] py-[0.15em] text-[0.85em]" onClick={onClose} title="Close">✕</button>
          </div>
        </div>

        {/* Section tabs */}
        <div className="flex flex-wrap gap-[0.3em] mb-[0.7em] shrink-0">
          {HELP_SECTIONS.map((s, i) => (
            <button
              key={s.id}
              onClick={() => setPage(i)}
              className={`rs-btn px-[0.6em] py-[0.25em] text-[0.78em] ${i === page ? 'rs-btn-primary' : ''}`}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="rs-panel-inset p-[0.8em] flex-1 min-h-0 overflow-y-auto">
          <div className="flex items-center gap-[0.5em] mb-[0.6em]">
            <span className="text-osrs-yellow font-bold text-[1.05em]">{section.label}</span>
            <span
              className="text-[0.6em] uppercase tracking-wide px-[0.5em] py-[0.1em] rounded-sm"
              style={{ color: badge.color, border: `1px solid ${badge.color}`, opacity: 0.9 }}
            >
              {badge.label}
            </span>
          </div>
          {section.intro && <p className="text-[0.85em] text-[#cdbe91] mb-[0.7em] leading-snug">{section.intro}</p>}
          <div className="flex flex-col gap-[0.6em]">
            {section.blocks.map((b, i) => (
              <div key={i} className="flex gap-[0.55em] items-start">
                {b.icon
                  ? <img src={b.icon} alt="" className="w-[1.5em] h-[1.5em] object-contain shrink-0 mt-[0.1em]" onError={hideBrokenImg} />
                  : <span className="text-osrs-orange shrink-0 leading-none mt-[0.15em]">•</span>}
                <div className="leading-snug">
                  {b.title && <span className="text-osrs-yellow font-bold text-[0.92em]">{b.title}. </span>}
                  <span className="text-[0.88em] text-[#d3c3a0]">{b.body}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer nav */}
        <div className="flex items-center justify-between gap-[0.5em] mt-[0.7em] shrink-0">
          <button
            className="rs-btn px-[1em] py-[0.35em] text-[0.85em]"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            style={{ opacity: page === 0 ? 0.5 : 1 }}
          >
            ‹ Back
          </button>
          <span className="text-[0.72em] text-[#cdbe91]">{page + 1} / {HELP_SECTIONS.length}</span>
          {page < HELP_SECTIONS.length - 1 ? (
            <button className="rs-btn rs-btn-primary px-[1em] py-[0.35em] text-[0.85em]" onClick={() => setPage((p) => Math.min(HELP_SECTIONS.length - 1, p + 1))}>
              Next ›
            </button>
          ) : (
            <button className="rs-btn rs-btn-primary px-[1em] py-[0.35em] text-[0.85em]" onClick={onClose}>
              Got it ✓
            </button>
          )}
        </div>
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
      icon: `${ASSETS.misc.wiki_base}Dwarf_multicannon.png`,
    },
    {
      id: 'roguelite', name: 'Roguelite', tag: 'Draft a card each wave',
      desc: 'Clear a wave, then keep one OSRS reward card. Stack potions, weapons and combos into a build that snowballs.',
      icon: `${ASSETS.misc.wiki_base}Collection_log.png`,
    },
  ];
  return (
    <div className="absolute inset-0 bg-black/82 flex flex-col items-center justify-center z-40 p-4">
      <div className="rs-panel p-6 w-[34em] max-w-[94vw] flex flex-col">
        <div className="text-center mb-1">
          <div className="text-osrs-orange font-bold leading-none" style={{ fontSize: 'clamp(20px, 2.4vw, 32px)' }}>OSRS Tower Defense</div>
          <div className="text-[#cdbe91] text-[0.85em] mt-[0.4em]">Choose your mode</div>
        </div>
        <div className="grid grid-cols-2 gap-[0.7em] my-4">
          {MODES.map((m) => {
            const on = mode === m.id;
            return (
              <button
                key={m.id}
                onClick={() => onSelect(m.id)}
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
        <button className="rs-btn rs-btn-primary w-full py-[0.55em] text-[1.1em] animate-pulse" onClick={onStart}>
          ▶ Confirm
        </button>
        <button className="rs-btn w-full py-[0.4em] text-[0.85em] mt-[0.5em]" onClick={onHelp}>
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
      style={{ marginLeft: '-15em', maxHeight: '82vh', fontSize: 'clamp(14px, 0.9vw, 19px)' }}
    >
      <div className="rs-panel-title flex items-center justify-between">
        <span className="flex items-center gap-2">
          <img src={`${ASSETS.misc.wiki_base}Collection_log.png`} alt="" className="w-[1.3em] h-[1.3em] object-contain" onError={hideBrokenImg} />
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
        <button onClick={onBack} className="rs-btn px-[0.7em] py-[0.2em] text-[0.75em]">◂ Back</button>
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
        <button onClick={onBack} className="rs-btn px-[0.7em] py-[0.2em] text-[0.75em]">◂ Back</button>
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
function RelicStrip({ cards }: { cards: { id: string; count: number }[] }) {
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
          {relics.map(({ card, count }) => (
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
  const fz = (min: number, vw: number, max: number) => `clamp(${min * k}px, ${(vw * k).toFixed(3)}vw, ${max * k}px)`;
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

/** Roguelite owned-relics tray: the run's claimed relics as tier-bordered icons
 *  with a hover tooltip. Rendered in the HUD and the end-of-run summary. */
/** Compact, always-on-screen wave-event indicator, docked in the top-right HUD so
 *  the active twist stays visible even when the main panel is collapsed. Hover for
 *  the full description; the banner in the main panel carries it inline. */
function WaveEventChip({ event }: { event: NonNullable<UIState['activeEvent']> }) {
  const boon = event.tone === 'boon';
  return (
    <div
      className="wave-event-chip rs-panel flex items-center gap-[0.4em] pl-[0.3em] pr-[0.55em] py-[0.25em] pointer-events-auto"
      style={{ border: `1px solid ${event.color}`, boxShadow: `0 0 8px ${event.color}66` }}
      title={`${event.name} — ${event.desc}`}
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
