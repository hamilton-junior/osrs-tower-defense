'use client';

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { GameEngine, LOGIC_WIDTH, LOGIC_HEIGHT, type UIState, type EnemyHoverInfo, type DebuffId, type UnlockItem } from '@/lib/game/core/engine';
import { CARD_ROLL_BASE_COST } from '@/lib/game/systems/roguelite-draft';
import { unlockDwellMs } from '@/lib/game/systems/unlock-queue';
import { CA_TIER_NAMES, highestTitle } from '@/lib/game/systems/combat-achievements';
import { AFFIX_DEFS } from '@/lib/game/systems/affixes';
import { bossTip } from '@/lib/game/systems/boss-tips';
import { capWavePreview } from '@/lib/game/systems/wave-preview';
import { TOWERS, TOWER_STYLES } from '@/lib/game/data/towers';
import { utilityAuraBonus, diminishingSum, synergyDamageMult } from '@/lib/game/systems/tower-combat';
import { styleSkillKey, tierGateFor } from '@/lib/game/systems/tower-xp';
import { towerXpForLevel } from '@/lib/game/systems/leveling';
import { MovablePanel } from './MovablePanel';
import { DebugPanel } from './DebugPanel';
import { HoverTip } from './HoverTip';
import { tipHeader, WavePreviewCard, DRAFT_FLY_MS, WaveEventChip } from './wave-ui';
import type { BiomeId } from '@/lib/game/data/biomes';
import { TravelCardView } from './travel-ui';
import { CARD_BY_ID, BOON_GROUP_META, SYNERGY_CARD_ID, MAGE_CARD_ID, RelicStrip, RunBuild, BuyCardRoll, RelicCardView, OwnedRelicTray, type BoonGroupId, type BoonSource } from './relics-ui';
import { CollectionLog, type LogTab } from './collection-log';
import { weaknessTag, enemySpriteStyle } from './enemy-ui';
import { StartScreen } from './start-screen';
import { DpsView } from './dps-view';
import { FeedbackModal } from './feedback-modal';
import { SaveCodeModal } from './save-code';
import { LEARN_STEPS, LearnAsYouGo, HowToPlay } from './tutorial';
import { effectTag, DraftCardView } from './draft-cards';
import { HUNTER_TRAPS, HUNTER_TRAP_BY_ID, type HunterTrapId } from '@/lib/game/data/hunter-traps';
import { SEEDS, SEED_BY_ID } from '@/lib/game/data/farming';
import { trapCost, blastProfile } from '@/lib/game/systems/hunter-traps';
import { TOWER_ORDER, PRIORITY_ICONS, MULTI_SELL, MultiSpellRow, MultiSpellButton, PRIORITY_ORDER, PRIORITY_TIPS, PriorityGlyph, towerIcon, towerTierIcon, spellIconUrl, WIZARD_STAVES, WIZARD_SCEPTRES, WIZARD_UTILITY_STAFF, WIZARD_SLOT_KEYS, wizardStaffUrl, spellbookIcon, SHOW_TOWER_PICKER, towerListName, TOWER_COMBAT, towerSignature } from './tower-ui';
import { GearHeader, GearStats, GearCompare, gearTooltip, AMMO_CLASS_LABEL } from './gear-ui';
import { SAVE_KEYS, EMPTY_VICTORIES, EMPTY_DIFFICULTY, loadVictories, loadDifficulty, loadAchievements, loadRunSave, clearRunSave, loadSave, type Victories, type DifficultyProgress } from './save';
import { hideBrokenImg, TILE_PX, pct, attackSpeed, loadBool, loadNum, fs, UI_SCALE_MIN, UI_SCALE_MAX, UI_SCALE_STEP, buffedDisplay, fmt, stackClass, fmtTime, Vital, GoStat, StatLabel, Stat } from './ui-kit';
import { PRAYERS, TOWER_PRAYERS } from '@/lib/game/data/prayers';
import { ASSETS, iconUrl, coinsIcon, GEAR_ICONS } from '@/lib/game/assets';
import { waveClearBonus } from '@/lib/game/systems/rewards';
import { GLOBAL_UPGRADE_DEFS, DEFAULT_UPGRADES, nextCost, isMaxed, formatUpgradeValue, previewUpgradeValue, refundValue, essenceRateLabel } from '@/lib/game/systems/meta-progression';
import { SLAYER_REWARDS, SLAYER_HELMET_BONUS, SLAYER_HELMET_IMBUED_BONUS } from '@/lib/game/data/slayer';
import { ENEMIES } from '@/lib/game/data/enemies';
import { isPrayerUnlocked, prayerUnlockWave } from '@/lib/game/systems/prayer';
import { ELEMENTS, ELEMENT_ORDER, ANCIENTS, ANCIENT_ORDER, SUPPORT_SPELLS, SUPPORT_ORDER, ELEMENTAL_TIER_NAMES, ANCIENT_TIER_NAMES, elementalSpellName, ancientSpellName, ancientHit, spellSpriteName } from '@/lib/game/systems/magic';
import { MAX_PRAYER_WARDS } from '@/lib/game/systems/prayer-system';
import { type RunSave } from '@/lib/game/systems/run-save';
import { canEquip, towerAmmoClassFor, isUpgradeFor, isUpgradeForAny } from '@/lib/game/systems/tower-gear';
import { FUSION_BLOCK_TEXT, FUSION_UNLOCK_CA, fusionRecipesFor, isFusionReady } from '@/lib/game/systems/tower-fusion';
import type { TowerType, PrayerType, MageMode, Item, Tower } from '@/lib/game/types';
import { FEEDBACK_ENABLED } from '@/lib/game/feedback';
import { highestUnlockedTier, type DifficultyTier } from '@/lib/game/systems/difficulty';

/** Which interface a bottom-bar stone pops open above the bar (OSRS tabbed-panel
 *  model — one stone per interface), or `null` for none. 'home' = the run's mode
 *  + roguelite loadout. */
type SideTab = 'home' | 'essence' | 'slayer' | 'dps' | 'lootbag';
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
  // The one badge that is good news for the enemy — Bandos's sigil, the same mark the
  // board draws under a body his General's slam has shaken free.
  cleansed: { label: 'Cleansed', icon: ASSETS.misc.bandos_symbol, color: '#d9b24a', desc: 'Shrugs off slows and stuns' },
};

const INITIAL: UIState = {
  money: 200, lives: 20, maxLives: 20, wave: 1, waveActive: false,
  remaining: 0, waveTotal: 0, bossWave: false, wavePreview: [], activeEvent: null, bossOnField: false, gameOver: false, won: false, runPhase: 'normal', victory: null, selectedTowerType: null, selectedTowerId: null,
  // Base prices, until the engine's first emit replaces them with the live ones.
  towerPrices: Object.fromEntries(
    Object.entries(TOWERS).map(([type, def]) => [type, def.tiers[0].upgradeCost]),
  ) as UIState['towerPrices'],
  towersOnBoard: 0,
  multiSelectedIds: [], movingGroupIds: [], placeQueue: [], queueArmed: false, clipboard: [], pasting: false,
  movingTowerId: null, pendingPlacement: null, pendingMageMode: 'elemental', gameSpeed: 1, paused: false, muted: false, volume: 0.75,
  notice: null, noticeIcon: null, noticeSeq: 0,
  slayerTask: null, slayerPoints: 0, slayerStreak: 0, slayerMaster: 'Turael', slayerHelmet: false, slayerUnlocks: [], slayerBlocked: [],
  prayerPoints: 10, prayerMax: 10, prayerFrac: 1, activePrayers: [], prayerLock: 0,
  geOffers: [],
  essence: 0, upgrades: { ...DEFAULT_UPGRADES },
  unlocks: [], unlockSeq: 0,
  killCounts: {},
  achievements: [],
  fusedThisLeg: false,
  cardCounts: {},
  bossesSeen: {},
  diversionsMet: {},
  fusionsMade: {},
  dpsStats: null,
  lastWaveSandbox: false,
  gameMode: 'roguelite', difficultyTier: 0, pendingDraft: null, draftBoosted: false,
  cardRollCost: CARD_ROLL_BASE_COST,
  runMods: {
    damage: { melee: 1, ranged: 1, magic: 1 },
    range: { melee: 1, ranged: 1, magic: 1 },
    fireRate: { melee: 1, ranged: 1, magic: 1 },
  },
  runCards: [],
  pendingRelics: null, ownedRelics: [], draftRerolls: 0,
  autoplay: false, autoplaySecs: 3,
  biomeName: 'Misthalin Plains',
  pendingTravel: null,
  lifestealSeq: 0,
  towerConfigSeq: 0,
  lootBag: [],
  gearDrops: [], gearDropSeq: 0,
  diversions: [],
  traps: [], selectedTrapId: null, hunterLevel: 1, hunterXp: 0, hunterXpNeeded: 10, maxTraps: 1,
  farmPatches: [], pendingSow: null, farmBuff: null,
};

/** How long a loot-drop toast stays in the corner. Matches the CSS animation in
 *  `.rs-loot-toast` — change both together or a toast pops out mid-fade. */
const LOOT_TOAST_MS = 2600;

/** Title shown above an unlock's name in the collection-log popup, per kind. */
const UNLOCK_LABEL: Record<UnlockItem['kind'], string> = {
  prayer: 'Prayer Unlocked',
  achievement: 'Combat Achievement',
};

/** One press of the interface-size − / +.
 *
 *  Steps land on the multiples of `UI_SCALE_STEP` — except the last one up, which is
 *  allowed to be short so a screen whose ceiling sits between two steps (1920 wide
 *  holds 107%) can still spend the room it has instead of stopping at the step below.
 *  "−" from such a value snaps back onto the grid rather than carrying the remainder
 *  down through every size after it. */
const stepScale = (v: number, dir: 1 | -1, max: number) => {
  const steps = v / UI_SCALE_STEP;
  // Nudge off the grid before rounding so a value already ON it moves a whole step.
  const next = (dir > 0 ? Math.floor(steps + 1e-6) + 1 : Math.ceil(steps - 1e-6) - 1) * UI_SCALE_STEP;
  return Math.min(max, Math.max(UI_SCALE_MIN, +next.toFixed(2)));
};

const prayerIcon = (id: PrayerType) => (ASSETS.prayers as Record<string, string>)[id];
/** Icon for a GE offer / slayer reward / meta upgrade: resolves the data table's
 *  wiki filename to the cache-baked local asset (wiki hot-link as fallback). */
const geIcon = (wiki: string) => iconUrl(wiki);

export default function GameRoot() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const gameAreaRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<GameEngine | null>(null);
  // The board is a fixed 1440×640 picture; the *UI* adapts to it, never the
  // reverse. This holds the board box's size in client pixels — the largest
  // LOGIC-aspect rectangle that fits the available game area — so the picture is
  // never distorted and the bottom bar always keeps its room. It measures the
  // container only to lay out the UI; the game's own resolution never changes.
  const [boardSize, setBoardSize] = useState<{ w: number; h: number } | null>(null);
  const [ui, setUi] = useState<UIState>(INITIAL);
  const [banner, setBanner] = useState<{ text: string; tone: 'start' | 'done' | 'boss' } | null>(null);
  const [toast, setToast] = useState<{ text: string; icon: string | null } | null>(null);
  // Collection-log unlock popups, shown one at a time from a queue.
  const [unlockQueue, setUnlockQueue] = useState<{ id: number; item: UnlockItem }[]>([]);
  // Whether the next-wave strip is showing its full roster. Collapsed by default
  // (and re-collapsed each wave) so the panel's footprint over the board stays
  // the same in wave 500 as in wave 5 — see `capWavePreview`.
  const [previewExpanded, setPreviewExpanded] = useState(false);
  useEffect(() => { setPreviewExpanded(false); }, [ui.wave]);
  const unlockIdRef = useRef(0);
  const lastUnlockSeq = useRef(0);
  // Loot-bag drop toasts: a small stack in the corner over the bag's own stone,
  // each fading itself out. Separate from the unlock popup on purpose — a piece of
  // gear is a "you picked something up", not a celebration that owns the screen.
  const [lootToasts, setLootToasts] = useState<{ id: number; item: Item }[]>([]);
  const lootToastIdRef = useRef(0);
  const lastGearSeq = useRef(0);
  // Which loot-bag piece has its tower picker open, by bag index.
  const [bagPick, setBagPick] = useState<number | null>(null);
  // Both loot-bag filters default ON: the bag and the tower list are only worth
  // reading when they are down to what would actually change something.
  const [hideJunkGear, setHideJunkGear] = useState(() => loadBool('ui_bag_hide_junk', true));
  const [hideDowngrades, setHideDowngrades] = useState(() => loadBool('ui_bag_hide_downgrades', true));
  useEffect(() => { try { localStorage.setItem('ui_bag_hide_junk', JSON.stringify(hideJunkGear)); } catch { /* ignore */ } }, [hideJunkGear]);
  useEffect(() => { try { localStorage.setItem('ui_bag_hide_downgrades', JSON.stringify(hideDowngrades)); } catch { /* ignore */ } }, [hideDowngrades]);
  // The tower row the pointer is on, so the picker's stat card can show what the
  // swap would actually change.
  const [hoverTowerId, setHoverTowerId] = useState<string | null>(null);
  // True while the hovered tower sits *behind* the open panel — the panel fades so
  // the highlight it would otherwise hide is actually visible.
  const [duckPanel, setDuckPanel] = useState(false);
  const tabBodyRef = useRef<HTMLDivElement | null>(null);
  const [hoverShop, setHoverShop] = useState<TowerType | null>(null);
  /** Which half of the build dock is showing. Towers are placed beside the road,
   *  traps on it — two different jobs, so they get two tabs rather than one grid
   *  the player has to scroll. */
  const [buildTab, setBuildTab] = useState<'towers' | 'traps'>('towers');
  const buildTabRef = useRef(buildTab);
  buildTabRef.current = buildTab;
  const [hoverTrap, setHoverTrap] = useState<HunterTrapId | null>(null);
  // Marquee drag-box multi-select (for batch tower upgrades). Start is kept in
  // client coords; the rendered box is in container pixels. `dragged` suppresses
  // the click that fires on mouse-up after a real drag.
  const marqueeStart = useRef<{ cx: number; cy: number } | null>(null);
  const marqueeDragged = useRef(false);
  const [marqueeBox, setMarqueeBox] = useState<{ l: number; t: number; w: number; h: number } | null>(null);
  // Bottom bar: which interface a stone has popped open *above* the bar, or null
  // for none — the default, so the map starts unobstructed. The shop-style
  // interfaces (Home, Essence, Slayer Rewards, DPS) share that one popup;
  // Collection Log and Debug still open their own larger windows.
  const [tab, setTab] = useState<SideTab | null>(null);
  const [logOpen, setLogOpen] = useState(false);
  // Highest Combat Achievement tier cleared in full — a cosmetic title and nothing
  // more: it gates no control, mode or difficulty tier.
  const caTitle = useMemo(() => highestTitle(new Set(ui.achievements)), [ui.achievements]);
  const [logTab, setLogTab] = useState<LogTab>('monsters');
  // The champion's win record (non-monetary meta reward). Read once on mount.
  const [victories, setVictories] = useState<Victories>(EMPTY_VICTORIES);
  useEffect(() => { setVictories(loadVictories()); }, []);
  // New Game+ progress (separate store from Victories — see DifficultyProgress).
  const [difficulty, setDifficulty] = useState<DifficultyProgress>(EMPTY_DIFFICULTY);
  useEffect(() => { setDifficulty(loadDifficulty()); }, []);
  // The tier the player has selected on the start screen for the current mode.
  const [selectedTier, setSelectedTier] = useState<DifficultyTier>(0);
  // The title / mode-select screen gates the very first wave; it returns on
  // restart so each run picks its mode afresh.
  const [runStarted, setRunStarted] = useState(false);
  // Returning players resume at the tier they've earned (freely lowerable); a
  // fresh mode switch re-seeds to that mode's own highest unlocked tier. Only
  // applies pre-run — the selector is start-screen-only.
  useEffect(() => {
    if (runStarted) return;
    const cleared = difficulty.highestCleared[ui.gameMode];
    setSelectedTier(highestUnlockedTier(cleared));
  }, [ui.gameMode, difficulty, runStarted]);
  // The start-screen tier selector calls this; wave-1-only, guarded/clamped by
  // the engine itself (see setDifficultyTier).
  const chooseTier = (t: DifficultyTier) => {
    setSelectedTier(t);
    engineRef.current?.setDifficultyTier(t, difficulty.highestCleared[ui.gameMode]);
  };
  // A run left in progress on this browser, offered back on the start screen.
  // Read once on mount (localStorage is not available during SSR).
  const [savedRun, setSavedRun] = useState<RunSave | null>(null);
  useEffect(() => { setSavedRun(loadRunSave()); }, []);
  const [debugOpen, setDebugOpen] = useState(false);
  // The tower whose sale is awaiting an "are you sure" — a refund is not undoable,
  // and players kept selling by fat-fingering a fast upgrade. The keyboard handler
  // is mounted once with no deps, so it reads the pending id off a ref.
  const [sellConfirm, setSellConfirm] = useState<string | null>(null);
  /** Partner id of the fusion the panel is asking about. Fusing eats two finished
   *  towers and can't be undone, so it confirms in place like Sell does. */
  const [fuseConfirm, setFuseConfirm] = useState<string | null>(null);
  const sellConfirmRef = useRef<string | null>(null);
  useEffect(() => { sellConfirmRef.current = sellConfirm; }, [sellConfirm]);
  // Clicking away drops the pending sell with the panel that asked for it — for a
  // marquee that means *any* change to the box, so a re-drag can never inherit a
  // confirmation armed for a different set of towers.
  const multiKey = ui.multiSelectedIds.join(',');
  useEffect(() => { setSellConfirm(null); }, [ui.selectedTowerId, multiKey]);
  useEffect(() => { setFuseConfirm(null); }, [ui.selectedTowerId, multiKey]);
  // Classic-mode gear picker: which slot's popup (if any) is open on the selected
  // tower's Equipment section. Closes with the same triggers as the sell-confirm
  // above, so it never lingers on a tower that's no longer selected.
  const [gearPicker, setGearPicker] = useState<'ammo' | 'jewellery' | null>(null);
  useEffect(() => { setGearPicker(null); }, [ui.selectedTowerId, multiKey]);
  // "How to Play" reference guide — reachable any time from the start screen or
  // the ❓ stone. (The FIRST-visit onboarding is the guided tour below, not this.)
  const [helpOpen, setHelpOpen] = useState(false);
  // In-game feedback launcher (opens NocoDB form links in a new tab). Only shown
  // when at least one form URL is configured in lib/game/feedback.ts.
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  // Export/import the whole account as a save code. Start screen only: it is how a
  // player leaves this browser, not something to reach for mid-run.
  const [saveCodeOpen, setSaveCodeOpen] = useState(false);
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
  // Start/stop the engine's per-run damage-stats streaming — only while the DPS
  // tab is the visible interface (the engine snapshots its stats just then).
  const dpsVisible = tab === 'dps';
  useEffect(() => { engineRef.current?.setDpsPanelOpen(dpsVisible); }, [dpsVisible]);
  // Stable so DpsView's unmount-cleanup effect doesn't re-fire every stats tick.
  const highlightTower = useCallback((id: string | null) => engineRef.current?.setHighlightTower(id), []);
  // Global UI text scale — a manual multiplier on top of the viewport-adaptive
  // base font-size (globals.css), applied as the `--ui-scale` CSS var the body
  // reads. Lets the player dial the whole em-based interface up/down for their
  // display without touching the browser zoom. Persisted; default 1.0 (100%).
  // Clamped on read as well as on click: a value saved before these bounds existed
  // (or hand-edited in localStorage) would otherwise restore a layout the bar cannot
  // hold, with no way to see the control that fixes it.
  const [uiScale, setUiScale] = useState(() =>
    Math.min(UI_SCALE_MAX, Math.max(UI_SCALE_MIN, loadNum('ui_scale', 1))));
  useEffect(() => {
    try { localStorage.setItem('ui_scale', String(uiScale)); } catch { /* ignore */ }
    document.documentElement.style.setProperty('--ui-scale', String(uiScale));
    // The board's canvas draws interface too (the tower level/XP strip), and it has
    // to grow with the control like every panel does — the engine mirrors the scale
    // for the renderer.
    engineRef.current?.setUiScale(uiScale);
  }, [uiScale]);
  // How far the interface can actually grow is a property of the SCREEN, not a
  // constant: measured, the bar's run-controls start clipping at 93% on a 1366px
  // display, 107% at 1920 and 130% at 2560. A single hard-coded ceiling is therefore
  // wrong for somebody no matter which one is picked — which is exactly the bug that
  // got reported.
  //
  // So measure instead: `maxUiScale` is the largest scale this window can hold, solved
  // from the bar's own natural width. "+" stops there, and a scale inherited from a
  // bigger window is pulled down to it. It re-measures on resize, so widening the
  // window re-opens the larger sizes.
  const barRef = useRef<HTMLElement | null>(null);
  const [maxUiScale, setMaxUiScale] = useState(UI_SCALE_MAX);
  useLayoutEffect(() => {
    const bar = barRef.current;
    if (!bar) return;
    const measure = () => {
      const cs = getComputedStyle(bar);
      const s = parseFloat(cs.getPropertyValue('--ui-scale')) || 1;
      // Natural width of the row: what the bar *needs*, not what it was handed. A box
      // that can grow (`flex-1`) is as wide as the slack the row gave it and says
      // nothing about its content — measuring that is what capped every screen at
      // 100% — so look through it and add up what it holds instead: its children, its
      // gaps and its padding. Only a box that cannot grow, or has no element children,
      // is measured by its own box. That rule applies at any depth, which is what lets
      // a group hand its slack to a child without lying about it.
      //
      // `data-fit="min"` is the exception the rule needs: the vitals' gauges have no
      // opinion about their own width — they take whatever the section gives them — so
      // neither reading works on them. Such a box is measured by its CSS `min-width`,
      // the width it was designed to still be readable at.
      //
      // Widths are *outer* widths, taken from the fractional rect: the controls carry
      // ~17px of `ml-`/`mr-` margins between the speed buttons and the volume slider,
      // and offsetWidth — which excludes margins and rounds to whole pixels — hid
      // enough of that to sell one step more than the row could hold, so the far-left
      // group came out clipped at the ceiling on a 1366-wide screen.
      const margins = (es: CSSStyleDeclaration) =>
        (parseFloat(es.marginLeft) || 0) + (parseFloat(es.marginRight) || 0);
      const natural = (el: HTMLElement, isBar = false): number => {
        const es = getComputedStyle(el);
        if (el.dataset.fit === 'min') return (parseFloat(es.minWidth) || 0) + margins(es);
        const inner = [...el.children] as HTMLElement[];
        const grows = isBar || (parseFloat(es.flexGrow) || 0) > 0;
        if (!inner.length || !grows) return el.getBoundingClientRect().width + margins(es);
        const innerGap = parseFloat(es.columnGap) || 0;
        const innerPad = (parseFloat(es.paddingLeft) || 0) + (parseFloat(es.paddingRight) || 0);
        return inner.reduce((a, c) => a + natural(c), 0)
          + innerGap * (inner.length - 1) + innerPad + (isBar ? 0 : margins(es));
      };
      // Everything above is em-based, so it all scales linearly with s: the row needs
      // `natural/s` per unit of scale, and has `bar.offsetWidth` to spend. Solve
      // once for the largest scale that still fits, instead of stepping down until it
      // does — a step-down loop only ever shrinks, so a single reading taken mid-relayout
      // costs a size permanently, and that is what pinned the bar at its minimum.
      //
      // The two halves flanking the dock are `flex-1 basis-0`, so the row gives them
      // the *same* width — it needs twice the fatter one, not the sum of the two. The
      // difference is exactly what the sum is missing (a + b + |a − b| = 2·max(a, b)),
      // and dropping it is what would let the dock drift off centre at the ceiling.
      const halves = ([...bar.children] as HTMLElement[]).filter((el) => el.dataset.half !== undefined);
      const skew = halves.length === 2 ? Math.abs(natural(halves[0]) - natural(halves[1])) : 0;
      const perUnit = (natural(bar, true) + skew) / Math.max(0.01, s);
      const fits = perUnit > 0 ? bar.offsetWidth / perUnit : UI_SCALE_MAX;
      // Keep the ceiling at its measured value instead of rounding it down onto the
      // step grid. A 1920-wide row holds 107%, and flooring that to the nearest step
      // handed the player 100% with the "+" greyed out — indistinguishable from a
      // hard 100% cap, and reported as one. The last press is allowed to be a short
      // step so the leftover room is actually reachable; 1e-3 off keeps a rounding
      // sliver between the ceiling and the width it was solved from.
      const room = Math.floor((fits - 1e-3) * 100) / 100;
      setMaxUiScale(Math.min(UI_SCALE_MAX, Math.max(UI_SCALE_MIN, room)));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(bar);
    return () => ro.disconnect();
  }, [uiScale]);
  // Pull an inherited-too-large scale (a smaller window, or a value saved on another
  // machine) down to what this screen can actually hold.
  useEffect(() => {
    if (uiScale > maxUiScale) setUiScale(maxUiScale);
  }, [uiScale, maxUiScale]);
  // A stone toggles its interface: clicking the lit one closes it, so no panel is
  // ever stuck on-screen. The popup floats above the bar (absolutely positioned),
  // so opening it never resizes the canvas — which would rebuild the path and
  // re-anchor every tower mid-run.
  const onSideTab = useCallback((t: SideTab) => setTab((cur) => (cur === t ? null : t)), []);
  // Classic has no loadout stone (nothing is drafted), so a 'home' tab left open
  // from a roguelite run must not survive into a classic one.
  // 'home' (roguelite loadout) and 'lootbag' (classic gear) share the first stone,
  // one per mode — so a mode change must close whichever no longer has a stone.
  useEffect(() => {
    const gone: SideTab = ui.gameMode === 'classic' ? 'home' : 'lootbag';
    setTab((cur) => (cur === gone ? null : cur));
  }, [ui.gameMode]);
  // Drives the on-map picker's per-tick animation (cycling staves/spells).
  const [pickerHover, setPickerHover] = useState<TowerType | null>(null);
  const [spellbookHover, setSpellbookHover] = useState<MageMode | null>(null);
  const [animTick, setAnimTick] = useState(0);
  // Measured size of the on-tile wizard picker, so it can be clamped fully inside
  // the board the same way the enemy panel is (it used to sit at a fixed -118%,
  // which put it off the top edge for tiles on the first rows).
  const wizardPickerRef = useRef<HTMLDivElement>(null);
  const [wizardPickerSize, setWizardPickerSize] = useState({ w: 0, h: 0 });
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
  // Deliberately dependency-less: it must re-measure after EVERY render, and the
  // size guard below is what stops the set-state from looping.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    const el = enemyPanelRef.current;
    if (!el) return;
    const w = el.offsetWidth, h = el.offsetHeight;
    if (w !== enemyPanelSize.w || h !== enemyPanelSize.h) setEnemyPanelSize({ w, h });
  });

  // Same measurement for the wizard picker — its height varies with the UI scale
  // and the hover preview, so only the real one can tell whether it fits above.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    const el = wizardPickerRef.current;
    if (!el) return;
    const w = el.offsetWidth, h = el.offsetHeight;
    if (w !== wizardPickerSize.w || h !== wizardPickerSize.h) setWizardPickerSize({ w, h });
  });

  // Tick the picker animations on the OSRS cadence, only while a picker is open —
  // the on-tile one for a single wizard, or the armed line's confirm panel, which
  // offers the same cycling staves.
  const wizardPickerOpen = !!ui.pendingPlacement || (ui.queueArmed && ui.selectedTowerType === 'wizard');
  useEffect(() => {
    if (!wizardPickerOpen) { setPickerHover(null); setSpellbookHover(null); return; }
    const id = setInterval(() => setAnimTick((t) => t + 1), 600);
    return () => clearInterval(id);
  }, [wizardPickerOpen]);

  // ctx.font never triggers an @font-face download, so kick the OSRS faces off
  // now; the canvas redraws every frame and picks them up once loaded.
  useEffect(() => {
    document.fonts?.load('16px RuneScape');
    document.fonts?.load('bold 16px RuneScape');
    document.fonts?.load('12px "RuneScape Small"');
  }, []);

  // Browser zoom shrinks the viewport, which re-fits the canvas and re-anchors
  // every tower/enemy onto a freshly-built path — the board visibly warps. The
  // viewport meta (app/layout.tsx) stops touch pinch; these stop the desktop
  // routes. `wheel` must be non-passive or preventDefault is ignored.
  useEffect(() => {
    const stop = (e: Event) => e.preventDefault();
    const onWheel = (e: WheelEvent) => { if (e.ctrlKey || e.metaKey) e.preventDefault(); };
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && ['+', '-', '=', '_', '0'].includes(e.key)) e.preventDefault();
    };
    window.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('keydown', onKey);
    // Safari's pinch-zoom arrives as gesture events, not ctrl+wheel.
    window.addEventListener('gesturestart', stop);
    window.addEventListener('gesturechange', stop);
    window.addEventListener('gestureend', stop);
    return () => {
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('gesturestart', stop);
      window.removeEventListener('gesturechange', stop);
      window.removeEventListener('gestureend', stop);
    };
  }, []);

  useEffect(() => {
    if (!canvasRef.current) return;
    const engine = new GameEngine(canvasRef.current, (patch) => setUi((prev) => ({ ...prev, ...patch })), loadSave());
    engineRef.current = engine;
    engine.start();
    // Auto-start lives beside Start Wave in the bottom bar. Its *delay* persists
    // across sessions, but the toggle itself deliberately does not: a page that
    // loaded with auto-wave already on starts sending waves at a board the player
    // has not looked at yet, and they lose lives before the run is theirs. Every
    // load begins hands-on — the same rule the engine already applies to a
    // restored run and to a new one.
    // Account-wide Combat Achievements: seeded here rather than through the
    // constructor blob, because the store is read after mount like the rest of
    // the UI-owned saves.
    engine.seedAchievements(loadAchievements());
    // Seed the UI scale too: the effect that mirrors it runs before this one on
    // mount, when there is no engine yet to tell.
    engine.setUiScale(uiScale);
    engine.setAutoplaySecs(loadNum('ui_autostart_secs', 3));
    return () => {
      engine.stop();
      engineRef.current = null;
    };
    // Mount-only on purpose — the engine outlives every re-render. `uiScale` is read
    // for its initial value alone; later changes reach the engine through the effect
    // that mirrors `--ui-scale`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // Persist completed Combat Achievements. Account-wide like the logs above, and
  // append-only in practice: the engine never removes an id, so an empty list is
  // "nothing earned yet" and must not overwrite a store that has entries.
  useEffect(() => {
    if (ui.achievements.length === 0) return;
    try { localStorage.setItem(SAVE_KEYS.achievements, JSON.stringify({ completed: ui.achievements })); }
    catch { /* ignore */ }
  }, [ui.achievements]);

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

  // Persist which Distractions & Diversions have turned up (the Collection Log's
  // Diversions tab). Account-wide like the logs above, and never read back by the
  // game itself — it is a record of who the player has met, nothing more.
  const dvLoaded = useRef(false);
  useEffect(() => {
    if (!dvLoaded.current) { dvLoaded.current = true; return; }
    try { localStorage.setItem(SAVE_KEYS.diversionsMet, JSON.stringify(ui.diversionsMet)); } catch { /* ignore */ }
  }, [ui.diversionsMet]);

  // Persist what the account has forged (the Collection Log's Forge tab). Same
  // shape as the logs above, and read back only to fill in that page.
  const fuLoaded = useRef(false);
  useEffect(() => {
    if (!fuLoaded.current) { fuLoaded.current = true; return; }
    try { localStorage.setItem(SAVE_KEYS.fusionsMade, JSON.stringify(ui.fusionsMade)); } catch { /* ignore */ }
  }, [ui.fusionsMade]);

  // Record a victory exactly once per win. `won` latches true for the whole victory
  // screen (and stays true through Endless), so a ref guards against re-counting; it
  // re-arms when `won` clears on the next run.
  const recordedWin = useRef(false);
  useEffect(() => {
    if (!ui.won || !ui.victory) { recordedWin.current = false; return; }
    if (recordedWin.current) return;
    recordedWin.current = true;
    const { seconds, mode, tier } = ui.victory;
    setVictories((v) => {
      const next: Victories = {
        total: v.total + 1,
        fastestSeconds: v.fastestSeconds == null ? seconds : Math.min(v.fastestSeconds, seconds),
        highestEndlessWave: v.highestEndlessWave,
        byMode: { ...v.byMode, [mode]: v.byMode[mode] + 1 },
      };
      try { localStorage.setItem(SAVE_KEYS.victories, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
    setDifficulty((d) => {
      const key = `${mode}:${tier}`;
      const prev = d.records[key] ?? { fastestSeconds: null, highestEndlessWave: 0 };
      const next: DifficultyProgress = {
        highestCleared: { ...d.highestCleared, [mode]: Math.max(d.highestCleared[mode], tier) },
        records: {
          ...d.records,
          [key]: {
            fastestSeconds: prev.fastestSeconds == null ? seconds : Math.min(prev.fastestSeconds, seconds),
            highestEndlessWave: prev.highestEndlessWave,
          },
        },
      };
      try { localStorage.setItem(SAVE_KEYS.difficulty, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, [ui.won, ui.victory]);

  // Endless is the only place a *loss* still writes the record: fold the furthest
  // wave reached into the champion's log when an Endless run finally ends.
  useEffect(() => {
    if (!ui.gameOver || ui.runPhase !== 'endless') return;
    setVictories((v) => {
      if (ui.wave <= v.highestEndlessWave) return v;
      const next = { ...v, highestEndlessWave: ui.wave };
      try { localStorage.setItem(SAVE_KEYS.victories, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, [ui.gameOver, ui.runPhase, ui.wave]);

  // Same Endless fold, but keyed by (mode, tier) into the New Game+ store — kept
  // as its own store/effect (see DifficultyProgress) rather than merged into
  // Victories, which stays untouched.
  useEffect(() => {
    if (!ui.gameOver || ui.runPhase !== 'endless') return;
    const key = `${ui.gameMode}:${ui.difficultyTier}`;
    setDifficulty((d) => {
      const prev = d.records[key] ?? { fastestSeconds: null, highestEndlessWave: 0 };
      if (ui.wave <= prev.highestEndlessWave) return d;
      const next = { ...d, records: { ...d.records, [key]: { ...prev, highestEndlessWave: ui.wave } } };
      try { localStorage.setItem(SAVE_KEYS.difficulty, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, [ui.gameOver, ui.runPhase, ui.wave, ui.gameMode, ui.difficultyTier]);

  // Autosave the run in progress, so closing the tab (or a crash) doesn't cost the
  // run. The engine only hands back a snapshot while the field is idle, so this
  // writes a checkpoint whenever the board changes between waves and never mid-wave
  // — quit mid-fight and you resume at the start of that wave with the board as it
  // was. A game over clears the save: there is nothing left to come back to.
  const lastSaved = useRef<string | null>(null);
  useEffect(() => {
    const write = () => {
      const engine = engineRef.current;
      if (!engine) return;
      if (engine.gameOver) { clearRunSave(); lastSaved.current = null; return; }
      const snap = engine.snapshotRun();
      if (!snap) return; // mid-wave, or an untouched board — keep the last checkpoint
      // `savedAt` moves every tick; diff the run itself so an idle board doesn't
      // rewrite localStorage on every pass.
      const body = JSON.stringify({ ...snap, savedAt: 0 });
      if (body === lastSaved.current) return;
      lastSaved.current = body;
      try { localStorage.setItem(SAVE_KEYS.run, JSON.stringify(snap)); } catch { /* quota / private mode */ }
    };
    const id = window.setInterval(write, 2000);
    window.addEventListener('pagehide', write); // last chance on a tab close
    return () => { window.clearInterval(id); window.removeEventListener('pagehide', write); };
  }, []);

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
    // The reward multiplier is read, not depended on: the banner is raised
    // by a wave transition, and buying an upgrade mid-run must not re-raise it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // Loot toasts: one per piece, keyed off the engine's drop counter so a run
  // *loaded* from a save (which fills the bag in a single patch) stays silent.
  useEffect(() => {
    if (!ui.gearDropSeq || ui.gearDropSeq === lastGearSeq.current) return;
    lastGearSeq.current = ui.gearDropSeq;
    if (ui.gearDrops.length === 0) return;
    const added = ui.gearDrops.map((item) => ({ id: ++lootToastIdRef.current, item }));
    // Cap the stack: a boss can drop several at once, and a column that grows past
    // the bar would cover the board it is reporting on.
    setLootToasts((q) => [...q, ...added].slice(-4));
    const ids = new Set(added.map((a) => a.id));
    const t = setTimeout(() => setLootToasts((q) => q.filter((x) => !ids.has(x.id))), LOOT_TOAST_MS);
    return () => clearTimeout(t);
  }, [ui.gearDropSeq, ui.gearDrops]);

  // Advance the popup queue. A lone popup holds the full ~4.2s (the CSS animation);
  // a longer queue holds each one for less, so a batch of unlocks stays one
  // celebration instead of a minute of popups. See systems/unlock-queue.
  useEffect(() => {
    if (unlockQueue.length === 0) return;
    const t = setTimeout(() => setUnlockQueue((q) => q.slice(1)), unlockDwellMs(unlockQueue.length));
    return () => clearTimeout(t);
  }, [unlockQueue]);

  /**
   * Keyboard shortcuts.
   *
   * The number row picks a tower from the dock — the tower-defence idiom, and the
   * answer to "let me re-buy the last tower without going back to the UI": tap its
   * number again (or Shift-drag a whole line of them). That cost the number
   * row its old job, so game speed has two homes: , and . (the `<` / `>` keys, which
   * read as slower/faster) step through the speeds, and Z/X/C jump straight to
   * 1x/2x/5x — one key per speed, for when you know which one you want.
   *
   *   1-6 dock tower · Shift+drag paint a line (release Shift prices it; confirm to buy)
   *   Esc cancel / pause · Space wave
   *   Arrows move a placement cursor · Enter place at cursor
   *   U upgrade selection · S sell (asks first) · , / . step speed · Z/X/C 1x/2x/5x
   *   Ctrl+C copy selection · Ctrl+V paste it
   *   Q/W/E/R wizard spell · M mute · Ctrl+' debug console
   *
   * The selection is read off the engine (not React state) so this effect can stay
   * mounted once, with no deps.
   */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const eng = engineRef.current;
      if (!eng) return;
      // Typing a number into the auto-start field must not send a wave (Space) or
      // pick a tower (1-6). `code` is layout-independent; `key` is not.
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      // The debug console has no button: it opens on the ~ / console chord games
      // conventionally use. `code` so it works on layouts where ' is elsewhere.
      if ((e.ctrlKey || e.metaKey) && e.code === 'Quote') {
        e.preventDefault();
        setDebugOpen((o) => !o);
        return;
      }
      // Copy/paste a tower layout on the keys every player already knows. Safe to
      // claim: the board has no text to copy, and the guard above has already let
      // anything typed into a field through untouched.
      if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.code === 'KeyC' || e.code === 'KeyV')) {
        e.preventDefault();
        if (e.code === 'KeyC') eng.copySelection();
        else eng.beginPaste();
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return; // leave browser chords alone

      // 1-6: the dock, left to right — whichever tab the dock is showing, because
      // the keys are the slots the player is looking at. Unaffordable or locked is
      // the engine's call — it refuses exactly as a click on the slot would.
      const n = Number(e.key) - 1;
      if (buildTabRef.current === 'traps') {
        const trap = HUNTER_TRAPS[n];
        if (trap) { eng.selectTrapType(trap.id); setSellConfirm(null); return; }
      } else {
        const slot = TOWER_ORDER[n];
        if (slot) { eng.selectTowerType(slot); setSellConfirm(null); return; }
      }

      switch (e.key) {
        case 'Escape':
          e.preventDefault();
          // A pending sell is the innermost thing Esc can back out of.
          if (sellConfirmRef.current) setSellConfirm(null);
          else eng.escape();
          break;
        case ' ': e.preventDefault(); eng.startWave(); break;
        // , / . step through the speeds; Z/X/C jump straight to one.
        case ',': eng.setGameSpeed(eng.gameSpeed >= 5 ? 2 : 1); break;
        case '.': eng.setGameSpeed(eng.gameSpeed <= 1 ? 2 : 5); break;
        case 'z': case 'Z': eng.setGameSpeed(1); break;
        case 'x': case 'X': eng.setGameSpeed(2); break;
        case 'c': case 'C': eng.setGameSpeed(5); break;
        // Upgrade whatever is selected — a marquee batch, or the one open tower.
        // A move in flight owns the selection: its panel hides these actions, so
        // the keys that trigger them go quiet too.
        case 'u': case 'U':
          if (eng.movingGroupIds.length > 0) break;
          if (eng.multiSelectedIds.length > 0) eng.upgradeMultiSelected();
          else if (eng.selectedTowerId) eng.upgradeTower(eng.selectedTowerId);
          break;
        // Sell never fires straight off a keypress: it arms the same confirmation
        // the Sell button uses (players were selling by fat-fingering a fast upgrade).
        case 's': case 'S':
          if (eng.movingGroupIds.length > 0) break;
          if (eng.multiSelectedIds.length > 0) setSellConfirm(MULTI_SELL);
          else if (eng.selectedTowerId) setSellConfirm(eng.selectedTowerId);
          break;
        // Arrow keys steer a keyboard placement cursor — but only while a tower is
        // armed or being moved, so they stay free otherwise. The cursor mirrors onto
        // the pointer, so the normal placement ghost shows where it will land.
        case 'ArrowUp': case 'ArrowDown': case 'ArrowLeft': case 'ArrowRight': {
          if (!eng.selectedTowerType && !eng.movingTowerId) break;
          e.preventDefault();
          const dx = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0;
          const dy = e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0;
          eng.nudgeCursor(dx, dy);
          break;
        }
        case 'Enter':
          // A pending sell owns Enter; otherwise Enter drops a tower at the keyboard
          // cursor (the click-equivalent for arrow-key placement).
          if (sellConfirmRef.current === MULTI_SELL) { eng.sellMultiSelected(); setSellConfirm(null); }
          else if (sellConfirmRef.current) { eng.sellTower(sellConfirmRef.current); setSellConfirm(null); }
          else if (eng.placeCursor) { e.preventDefault(); eng.placeAtCursor(); }
          break;
        case 'q': case 'Q': eng.selectWizardSlot(0); break;
        case 'w': case 'W': eng.selectWizardSlot(1); break;
        case 'e': case 'E': eng.selectWizardSlot(2); break;
        case 'r': case 'R': eng.selectWizardSlot(3); break;
        case 'm': case 'M': eng.toggleMute(); break;
        default: break;
      }
    };
    // Shift coming up ends the stroke — it does not buy it. The line freezes and
    // the confirm panel asks. Letting go of a key is a gesture a hand makes without
    // deciding anything, so it must not be the thing that spends the gold.
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift') engineRef.current?.armPlaceQueue();
    };
    // A keyup never arrives if focus leaves mid-stroke (alt-tab with Shift down),
    // which would strand the ghosts with no way to finish. Throw the line away
    // rather than build it: unpainting costs nothing, spending gold off-screen does.
    const onBlur = () => engineRef.current?.clearPlaceQueue();
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, []);

  /**
   * Where the board is actually painted, in client pixels. Its container is sized
   * to the board's aspect (see the fit effect), so `contain` leaves at most a
   * rounding sliver — but the board is a fixed 1440×640 whatever size that
   * container ends up, so a client pixel is never a logic pixel and every
   * screen↔logic conversion starts here.
   *
   * `dx`/`dy` are the painted origin relative to the container, for the overlays
   * positioned inside it.
   */
  const paintedBox = useCallback(() => {
    const el = canvasRef.current;
    const engine = engineRef.current;
    if (!el || !engine) return null;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return null;
    const scale = Math.min(r.width / engine.width, r.height / engine.height);
    const width = engine.width * scale;
    const height = engine.height * scale;
    const dx = (r.width - width) / 2;
    const dy = (r.height - height) / 2;
    return { left: r.left + dx, top: r.top + dy, width, height, dx, dy };
  }, []);

  /**
   * Hovering a tower row in the loot bag's picker rings that tower on the board.
   * The docked panel sits *over* the board's bottom-right, so a tower under it
   * would be highlighted where nobody can see it — when the ring would land
   * inside the panel's own rect, the panel fades out of the way until the pointer
   * leaves the row. Cheap enough to do per hover: two getBoundingClientRects.
   */
  const hoverTowerRow = useCallback((t: Tower | null) => {
    highlightTower(t ? t.id : null);
    setHoverTowerId(t ? t.id : null);
    const box = paintedBox();
    const panel = tabBodyRef.current?.getBoundingClientRect();
    const eng = engineRef.current;
    if (!t || !box || !panel || !eng) { setDuckPanel(false); return; }
    const scale = box.width / eng.width;
    const cx = box.left + t.x * scale;
    const cy = box.top + t.y * (box.height / eng.height);
    const r = (t.visualRadius + 10) * scale;
    setDuckPanel(cx + r > panel.left && cx - r < panel.right && cy + r > panel.top && cy - r < panel.bottom);
  }, [highlightTower, paintedBox]);
  // Closing the interface (or switching stones) must not leave a tower ringed or
  // the panel faded — the pointer never gets a chance to leave the row.
  useEffect(() => {
    if (tab === 'lootbag') return;
    setBagPick(null);
    setDuckPanel(false);
    setHoverTowerId(null);
    highlightTower(null);
  }, [tab, highlightTower]);
  // The bag re-indexes when a piece is equipped (and grows on a drop), so an open
  // picker would end up pointing at a different item. Close it instead.
  useEffect(() => { setBagPick(null); }, [ui.lootBag.length]);

  // Fit the board box to its container: the largest LOGIC-aspect rectangle that
  // fits, recomputed whenever the window (and thus the game area) changes. This is
  // the *only* place the layout reacts to size — and it sizes the presentation box,
  // never the engine. The 1440×640 logic space and the road are untouched.
  useLayoutEffect(() => {
    const area = gameAreaRef.current;
    if (!area) return;
    const fit = () => {
      const w = area.clientWidth;
      const h = area.clientHeight;
      if (w === 0 || h === 0) return;
      const scale = Math.min(w / LOGIC_WIDTH, h / LOGIC_HEIGHT);
      setBoardSize({ w: Math.round(LOGIC_WIDTH * scale), h: Math.round(LOGIC_HEIGHT * scale) });
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(area);
    return () => ro.disconnect();
  }, []);

  // Report the board's on-screen size to the engine so it can back the canvas at
  // the display's native resolution (see engine `setDisplaySize`/`deviceScale`) —
  // the board renders at exactly the pixels it occupies, sharp on any screen, with
  // no CSS upscale from 1440. Render-only: the fixed 1440×640 logic space (and thus
  // gameplay and pointer mapping) is untouched. Fires on mount and every resize.
  useEffect(() => {
    if (boardSize) engineRef.current?.setDisplaySize(boardSize.w, boardSize.h);
  }, [boardSize]);

  const toLogic = useCallback((clientX: number, clientY: number) => {
    const box = paintedBox();
    const engine = engineRef.current;
    if (!box || !engine) return { x: 0, y: 0 };
    return {
      x: ((clientX - box.left) / box.width) * engine.width,
      y: ((clientY - box.top) / box.height) * engine.height,
    };
  }, [paintedBox]);

  const onMove = useCallback((e: React.MouseEvent) => {
    const { x, y } = toLogic(e.clientX, e.clientY);
    engineRef.current?.setPointer(x, y);
    // Shift-drag paints a line of towers to build. Held button only, so hovering
    // with Shift down (e.g. on the way to a button) doesn't smear a queue.
    if (e.shiftKey && (e.buttons & 1) && engineRef.current?.selectedTowerType) {
      engineRef.current.queuePlacement(x, y);
      return;
    }
  }, [toLogic]);

  // Grow the box to the pointer, wherever it is. Once past a small threshold the
  // drag is real and the click that follows it gets swallowed.
  const dragMarquee = useCallback((cx: number, cy: number) => {
    const start = marqueeStart.current;
    // The container: the marquee is positioned inside it, in its pixels.
    const rect = boardRef.current?.getBoundingClientRect();
    if (!start || !rect) return;
    if (Math.hypot(cx - start.cx, cy - start.cy) > 6) marqueeDragged.current = true;
    if (!marqueeDragged.current) return;
    const x0 = start.cx - rect.left, y0 = start.cy - rect.top;
    const x1 = cx - rect.left, y1 = cy - rect.top;
    setMarqueeBox({ l: Math.min(x0, x1), t: Math.min(y0, y1), w: Math.abs(x1 - x0), h: Math.abs(y1 - y0) });
  }, []);

  // Close the box and select what it covered. `inside` says whether the release
  // landed on the board: when it didn't, no click event follows it, so the flag
  // that swallows that click has to be cleared here or it would eat the *next*
  // real click instead.
  const endMarquee = useCallback((cx: number, cy: number, inside: boolean) => {
    const start = marqueeStart.current;
    marqueeStart.current = null;
    setMarqueeBox(null);
    if (start && marqueeDragged.current) {
      const a = toLogic(start.cx, start.cy);
      const b = toLogic(cx, cy);
      engineRef.current?.selectTowersInBox(a.x, a.y, b.x, b.y);
    }
    if (!inside) marqueeDragged.current = false;
  }, [toLogic]);

  // Start a marquee only when not placing/moving a tower (so click-to-place is
  // untouched). Left button only.
  //
  // The drag is followed on `window`, not on the board: a box dragged from near an
  // edge leaves the board constantly, and a React handler on the board never sees
  // the mouse-up that happens outside it — the selection simply never completed and
  // the box hung on screen. Both listeners come off again the moment the drag ends.
  const onMouseDown = useCallback((e: React.MouseEvent) => {
    const eng = engineRef.current;
    if (e.button !== 0 || !eng || eng.selectedTowerType || eng.movingTowerId
        || eng.movingGroupIds.length || eng.pasting) return;
    marqueeStart.current = { cx: e.clientX, cy: e.clientY };
    marqueeDragged.current = false;
    const move = (ev: MouseEvent) => dragMarquee(ev.clientX, ev.clientY);
    const up = (ev: MouseEvent) => {
      if (ev.button !== 0) return;
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      endMarquee(ev.clientX, ev.clientY, !!boardRef.current?.contains(ev.target as Node));
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  }, [dragMarquee, endMarquee]);

  const onClick = useCallback((e: React.MouseEvent) => {
    // A real marquee drag already handled selection on mouse-up; swallow the click.
    if (marqueeDragged.current) { marqueeDragged.current = false; return; }
    const { x, y } = toLogic(e.clientX, e.clientY);
    // With a tower armed, Shift means "queue, don't build" — a plain Shift-click
    // paints one tile, the same as the shortest possible drag. Releasing Shift
    // builds the line.
    if (e.shiftKey && engineRef.current?.selectedTowerType) {
      engineRef.current.queuePlacement(x, y);
      return;
    }
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

  // ── Draft pick animation ──
  // Picking a card used to be instant: the overlay blinked out and the card was
  // simply *gone*, with nothing saying where it went or that the run had gained
  // anything. Now the losing cards fade and the kept one flies to the Boons/Relics
  // tab, which is where its effect lives from then on. The engine pick is deferred
  // to the end of the flight, so the overlay stays mounted for the whole animation.
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const boonsTabRef = useRef<HTMLButtonElement>(null);
  const [picking, setPicking] = useState<{ id: string; dx: number; dy: number; scale: number } | null>(null);
  const pickTimer = useRef<number | null>(null);

  const commitPick = useCallback((id: string) => {
    engineRef.current?.pickDraftCard(id);
    setPicking(null);
    pickTimer.current = null;
  }, []);

  const pickCard = useCallback((id: string) => {
    if (picking) return; // one flight at a time; ignore double-clicks
    markTipSeen('draft');
    const card = cardRefs.current.get(id);
    const tab = boonsTabRef.current;
    // No card/target on screen to fly between (or the user asked for no motion) —
    // take the pick immediately rather than stalling behind an animation that
    // isn't running.
    if (!card || !tab || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      commitPick(id);
      return;
    }
    const c = card.getBoundingClientRect();
    const t = tab.getBoundingClientRect();
    // Both rects are viewport-space, so their centre delta is a valid translate.
    setPicking({
      id,
      dx: (t.left + t.width / 2) - (c.left + c.width / 2),
      dy: (t.top + t.height / 2) - (c.top + c.height / 2),
      scale: Math.min(1, t.width / Math.max(1, c.width)),
    });
    pickTimer.current = window.setTimeout(() => commitPick(id), DRAFT_FLY_MS);
  }, [picking, commitPick, markTipSeen]);

  // A run ending (or restarting) mid-flight must not fire a pick into the new run.
  useEffect(() => () => { if (pickTimer.current !== null) clearTimeout(pickTimer.current); }, []);

  const selectedTower = ui.selectedTowerId
    ? engineRef.current?.towers.find((t) => t.id === ui.selectedTowerId) ?? null
    : null;
  const towerGate = selectedTower ? tierGateFor(selectedTower) : null;
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
  // Ripe allotments, for that same cluster. The patch glows on the board, but a
  // player reading their build panel would never look at it — so the herb is a box
  // up top as well, and the box pulls it. Only between waves, which is the only
  // time a patch can be harvested at all.
  const readyPatches = ui.waveActive ? [] : ui.farmPatches.filter((p) => p.stage === 'ready');

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
    // Each row carries the same icon its live counterpart wears in the stats block
    // above, so the preview reads as "this line, one tier up".
    const rows: { label: string; icon: string; from: string; to: string; buffed?: string }[] = [];
    const dmgIcon = TOWER_COMBAT[selectedTower.type].icon;

    // Utility wizard never attacks → no damage / attack-speed rows; only its aura range.
    if (!isUtility) {
      if (selectedTower.type === 'cannon' && selectedTower.maxDamage != null && next.maxDamage != null) {
        const fromLo = selectedTower.minDamage ?? 0, fromHi = selectedTower.maxDamage;
        const toLo = next.minDamage ?? 0, toHi = next.maxDamage;
        rows.push({ label: 'Damage', icon: dmgIcon, from: `${fromLo}–${fromHi}`, to: `${toLo}–${toHi}`, buffed: dmgBuffed ? `${buffDmg(toLo)}–${buffDmg(toHi)}` : undefined });
      } else {
        const isAnc = selectedTower.type === 'wizard' && (selectedTower.mageMode ?? 'elemental') === 'ancients';
        const fromD = isAnc ? ancientHit(selectedTower.level) : selectedTower.damage;
        const toD = isAnc ? ancientHit(selectedTower.level + 1) : next.damage;
        rows.push({ label: 'Damage', icon: dmgIcon, from: String(fromD), to: String(toD), buffed: dmgBuffed ? String(buffDmg(toD)) : undefined });
      }
    }
    rows.push({
      label: isUtility ? 'Aura range' : 'Range',
      icon: ASSETS.misc.multicombat_icon,
      from: `${Math.round(selectedTower.range / TILE_PX)}`,
      to: `${Math.round(next.range / TILE_PX)} tiles`,
      buffed: rangeMul !== 1 ? `${Math.round((next.range * rangeMul) / TILE_PX)} tiles` : undefined,
    });
    if (!isUtility) {
      rows.push({
        label: 'Attack speed',
        icon: ASSETS.misc.attack_icon,
        from: attackSpeed(selectedTower.cooldown),
        to: attackSpeed(next.cooldown),
        buffed: cdMul !== 1 ? attackSpeed(next.cooldown * cdMul) : undefined,
      });
    }
    return { name: next.name, cost: selectedTower.upgradeCost, rows, anyBuffed: rows.some((r) => r.buffed) };
  })();

  const moving = !!ui.movingTowerId;
  // Every fusion this tower could join, ready ones first (see systems/tower-fusion).
  // Read live off the engine like moveCost/sellValue below it — the panel already
  // re-renders on every state patch that could change the answer.
  const fusionOffers = selectedTower ? engineRef.current?.fusionOffers(selectedTower.id) ?? [] : [];
  const readyFusions = fusionOffers.filter((o) => o.ok);
  // What a *finished* tower could still become, read from the fusion table rather
  // than the board. An offer only exists once both halves are standing, so a maxed
  // tower whose partner was never built has nothing to show — and that is exactly
  // the moment the player asks "what now?". Below max the answer is always "upgrade
  // it first", which the Upgrade button already says, so it stays quiet until then.
  const fusionRecipes = selectedTower && isFusionReady(selectedTower)
    ? fusionRecipesFor(selectedTower.type)
      .filter((r) => !readyFusions.some((o) => o.def.type === r.def.type))
      .map((r) => {
        // Prefer what the board actually says over the generic recipe: with the
        // partner already built, the real blocker is a better sentence than
        // "build one".
        const blocked = fusionOffers.find((o) => !o.ok && o.def.type === r.def.type);
        return {
          def: r.def,
          note: blocked
            ? FUSION_BLOCK_TEXT[blocked.reason!]
            : `Needs a ${TOWERS[r.partner]?.baseName ?? r.partner} tower beside it.`,
        };
      })
    : [];
  // With nothing ready, the panel still shows the nearest miss — a fusion the
  // player never hears about is a fusion that doesn't exist. The recipe list above
  // says the same thing in more detail, so the two never stack.
  const fusionHint = readyFusions.length === 0 && fusionRecipes.length === 0 ? fusionOffers[0] ?? null : null;
  const moveCost = selectedTower ? engineRef.current?.moveTowerCost(selectedTower) ?? 0 : 0;
  const sellValue = selectedTower ? engineRef.current?.sellValue(selectedTower) ?? 0 : 0;
  // The wizard's current cast (e.g. "Fire Wave" / "Ice Barrage") drives the
  // panel title icon/name; utility casts nothing offensive (null).
  const wizSpell = selectedTower?.type === 'wizard' ? spellSpriteName(selectedTower) : null;
  const wizSpellIcon = wizSpell ? spellIconUrl(wizSpell) : undefined;
  const wizSpellLabel = wizSpell ? wizSpell.replace('_', ' ') : null;
  // Logic-space dims, so the on-map picker can be placed by percentage.
  const engW = engineRef.current?.width || LOGIC_WIDTH;
  const engH = engineRef.current?.height || LOGIC_HEIGHT;

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
  // A shattered bar (General Graardor's slam) reuses exactly that greyed look, with
  // the seconds left where the unlock wave normally sits — one lockout vocabulary,
  // so a player who has seen a locked prayer already knows what a dark one means.
  const prayerButton = (p: (typeof TOWER_PRAYERS)[number]) => {
    const def = PRAYERS.find((d) => d.id === p.id)!;
    const locked = !isPrayerUnlocked(def.level, ui.wave);
    const shattered = !locked && ui.prayerLock > 0;
    const on = ui.activePrayers.includes(p.id);
    const icon = prayerIcon(p.id);
    const title = locked
      ? `🔒 Unlocks at Wave ${prayerUnlockWave(def.level)} — ${def.name}: ${def.description}`
      : shattered
        ? `Your prayers are shattered — ${ui.prayerLock}s`
        : `${def.name} — ${def.description}`;
    return (
      <button
        key={p.id}
        title={title}
        disabled={locked || shattered}
        onClick={() => engineRef.current?.togglePrayer(p.id)}
        className={`rs-prayer ${on ? 'rs-prayer-on' : ''} ${locked || shattered ? 'rs-prayer-locked' : ''}`}
      >
        {icon && <img src={icon} alt={def.name} onError={hideBrokenImg} />}
        {locked && <span className="rs-prayer-lock">{prayerUnlockWave(def.level)}</span>}
        {shattered && <span className="rs-prayer-lock">{ui.prayerLock}s</span>}
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
    <div className="w-full h-full flex flex-col overflow-hidden bg-black select-none font-osrs">
      {/* Whatever space the board's aspect leaves over is dressed as OSRS chrome,
          so it reads as the client's frame rather than as a black bar. */}
      <div
        ref={gameAreaRef}
        className="flex-1 min-h-0 w-full flex items-center justify-center overflow-hidden"
        style={{ backgroundColor: 'var(--osrs-brown-dark)', backgroundImage: 'var(--rs-wood)' }}
      >
      {/* Sized (in JS) to the largest LOGIC-aspect rectangle that fits the area:
          the largest the board can be drawn without distortion, and the same fixed
          board on every machine. Nothing is letterboxed *inside* it — the leftover
          space is beside it, dressed as wood chrome, and belongs to the page. */}
      <div
        ref={boardRef}
        data-tut="map"
        className="relative bg-black shrink-0"
        style={boardSize ? { width: boardSize.w, height: boardSize.h } : { visibility: 'hidden' }}
      >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full block cursor-crosshair touch-none"
        // A fixed 1440×640 logic space, backed at the display's device-pixel ratio
        // (see engine `dpr`), scaled as a whole to fill its aspect-locked container:
        // identical shape on every screen, never stretched. `contain` guards the
        // rounding sliver.
        style={{ objectFit: 'contain' }}
        onMouseMove={onMove}
        onMouseDown={onMouseDown}
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

      {/* Batch panel for a marquee multi-selection: everything the single-tower
          panel offers, applied to the whole box at once. Draggable like every
          other panel — the outer div holds the centred anchor so MovablePanel's
          own transform only carries the drag offset. */}
      {ui.multiSelectedIds.length > 0 && (() => {
        const eng = engineRef.current;
        const info = eng?.multiUpgradeInfo ?? { count: 0, cost: 0 };
        const sell = eng?.multiSellInfo ?? { count: 0, refund: 0 };
        const mage = eng?.multiMageInfo
          ?? { elemental: 0, ancients: 0, utility: 0, element: null, ancientType: null, supportSpell: null };
        const afford = ui.money >= info.cost;
        const confirming = sellConfirm === MULTI_SELL;
        const move = eng?.multiMoveInfo ?? { count: 0, cost: 0 };
        const autoUp = eng?.multiAutoUpgradeInfo ?? { total: 0, on: 0 };
        // A group move keeps its selection alive, so this panel stays mounted for
        // the whole flight — it swaps its actions for the "drop it" hint.
        const groupMoving = ui.movingGroupIds.length > 0;
        return (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 pointer-events-none">
            <MovablePanel
              id="multiselect"
              globalLock={uiLocked}
              className="rs-panel relative p-2 w-[15em] flex flex-col gap-[0.45em]"
              style={{ fontSize: fs('clamp(13px, 0.85vw, 17px)') }}
            >
              <div className="flex items-center justify-between gap-[0.6em]">
                <span className="text-osrs-orange font-bold whitespace-nowrap">{ui.multiSelectedIds.length} towers</span>
                <button className="rs-btn px-[0.6em] py-[0.15em] text-[0.8em]" title="Deselect all towers" onClick={() => eng?.clearMultiSelect()}>Clear</button>
              </div>

              {groupMoving ? (
                <div className="text-center text-[0.8em] text-osrs-orange leading-snug py-[0.15em]">
                  ▸ Click a tile to drop all {ui.movingGroupIds.length} here ({fmt(move.cost)} gp)<br />
                  <span className="text-[#d3c3a0]">they keep their shape · right‑click to cancel</span>
                </div>
              ) : (<>
              <button
                className="rs-btn rs-btn-primary relative px-[0.7em] py-[0.3em] flex items-center justify-center gap-[0.3em] disabled:opacity-50"
                disabled={info.count === 0}
                title={info.count === 0 ? 'All selected towers are max level' : `Upgrade ${info.count} tower(s) one tier (U)`}
                onClick={() => eng?.upgradeMultiSelected()}
              >
                <span className="text-[#5bd75b] font-bold">⬆</span>
                Upgrade {info.count > 0 ? `(${info.count})` : ''}
                {info.count > 0 && <span style={{ color: afford ? 'var(--osrs-yellow)' : 'var(--osrs-red)' }}>{fmt(info.cost)} gp</span>}
                <span className="rs-key">U</span>
              </button>

              {/* Batch auto-upgrade: flip the whole selection's opt-in flag at once.
                  Mixed selections show the indeterminate tick; clicking then turns
                  them all on. */}
              <label
                className="flex items-center gap-[0.4em] -mt-[0.05em] px-[0.1em] text-[0.72em] text-[#d3c3a0] cursor-pointer select-none"
                title="Auto-upgrade: the game spends gold to level these towers on its own, cheapest auto-upgrade tower first"
              >
                <input
                  type="checkbox"
                  className="rs-check"
                  ref={(el) => { if (el) el.indeterminate = autoUp.on > 0 && autoUp.on < autoUp.total; }}
                  checked={autoUp.total > 0 && autoUp.on === autoUp.total}
                  onChange={(e) => eng?.setMultiAutoUpgrade(e.target.checked)}
                />
                Auto‑upgrade {autoUp.on > 0 && autoUp.on < autoUp.total ? `(${autoUp.on}/${autoUp.total})` : 'all'}
              </label>

              {/* Moves the whole box as one rigid formation — the layout the player
                  arranged is the point, so it travels with them. */}
              <button
                className="rs-btn px-[0.7em] py-[0.3em] flex items-center justify-center gap-[0.3em] disabled:opacity-50"
                disabled={ui.money < move.cost}
                title={`Move all ${move.count} selected towers for ${fmt(move.cost)} gp — they keep their formation`}
                onClick={() => eng?.beginMoveGroup()}
              >
                <span className="text-[#cdbe91]">✥</span>
                Move ({fmt(move.cost)} gp)
              </button>

              {/* Selling a whole box is the most destructive thing this panel can
                  do, so it asks in place — the same rule as one tower's Sell. */}
              {confirming ? (
                <div className="flex flex-col gap-[0.3em]">
                  <span className="text-[0.72em] text-osrs-warn text-center leading-snug">
                    Sell all {sell.count} towers for {fmt(sell.refund)} gp? You lose their levels.
                  </span>
                  <div className="flex gap-[0.4em]">
                    <button
                      className="rs-btn relative flex-1 px-[0.4em] py-[0.3em] text-osrs-warn"
                      title="Sell every selected tower — gone, with their levels (Enter)"
                      onClick={() => { eng?.sellMultiSelected(); setSellConfirm(null); }}
                    >
                      Yes, sell all
                      <span className="rs-key">ENTER</span>
                    </button>
                    <button
                      className="rs-btn relative flex-1 px-[0.4em] py-[0.3em]"
                      title="Keep them (Esc)"
                      onClick={() => setSellConfirm(null)}
                    >
                      Cancel
                      <span className="rs-key">ESC</span>
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  className="rs-btn relative px-[0.7em] py-[0.3em] flex items-center justify-center gap-[0.3em]"
                  title={`Sell all ${sell.count} selected towers for ${fmt(sell.refund)} gp (75% refund) — asks to confirm (S)`}
                  onClick={() => setSellConfirm(MULTI_SELL)}
                >
                  Sell ({fmt(sell.refund)} gp)
                  <span className="rs-key">S</span>
                </button>
              )}
              </>)}

              <div>
                <div className="text-[0.68em] text-[#d3c3a0] mb-[0.25em] px-[0.2em] uppercase tracking-wide">Target priority</div>
                <div className="grid grid-cols-3 gap-[0.25em]">
                  {PRIORITY_ORDER.map((p) => (
                    <button
                      key={p}
                      title={`${PRIORITY_TIPS[p]} — for every selected tower`}
                      aria-label={PRIORITY_TIPS[p]}
                      onClick={() => eng?.setMultiTargetingPriority(p)}
                      className="rs-btn px-0 py-[0.3em] flex items-center justify-center"
                    >
                      <PriorityGlyph spec={PRIORITY_ICONS[p]} />
                    </button>
                  ))}
                </div>
              </div>

              {/* One row per spellbook actually present in the box — a marquee that
                  catches Elemental and Ancients wizards can re-aim both, and one
                  that catches none shows nothing. */}
              {mage.elemental > 0 && (
                <MultiSpellRow label={`Elemental (${mage.elemental})`}>
                  {ELEMENT_ORDER.map((el) => (
                    <MultiSpellButton
                      key={el}
                      icon={spellIconUrl(elementalSpellName(el, 1))}
                      label={ELEMENTS[el].label}
                      color={ELEMENTS[el].color}
                      active={mage.element === el}
                      title={`${ELEMENTS[el].label} — every selected Elemental wizard`}
                      onClick={() => eng?.setMultiWizardElement(el)}
                    />
                  ))}
                </MultiSpellRow>
              )}
              {mage.ancients > 0 && (
                <MultiSpellRow label={`Ancients (${mage.ancients})`}>
                  {ANCIENT_ORDER.map((a) => (
                    <MultiSpellButton
                      key={a}
                      icon={spellIconUrl(ancientSpellName(a, 1))}
                      label={ANCIENTS[a].label}
                      color={ANCIENTS[a].color}
                      active={mage.ancientType === a}
                      title={`${ANCIENTS[a].label} — every selected Ancients wizard`}
                      onClick={() => eng?.setMultiAncientType(a)}
                    />
                  ))}
                </MultiSpellRow>
              )}
              {mage.utility > 0 && (
                <MultiSpellRow label={`Utility (${mage.utility})`}>
                  {SUPPORT_ORDER.map((s) => (
                    <MultiSpellButton
                      key={s}
                      icon={spellIconUrl(SUPPORT_SPELLS[s].spell)}
                      label={SUPPORT_SPELLS[s].label}
                      color={SUPPORT_SPELLS[s].color}
                      active={mage.supportSpell === s}
                      title={`${SUPPORT_SPELLS[s].label} — every selected Utility wizard (the Prayer Ward cap still applies)`}
                      onClick={() => eng?.setMultiSupportSpell(s)}
                    />
                  ))}
                </MultiSpellRow>
              )}
            </MovablePanel>
          </div>
        );
      })()}

      {/* Enemy info — pinned by a click (stays until you click elsewhere) or else
          following the hovered enemy. Positioned in pixels and clamped by the
          panel's measured size so it is never clipped, on any edge. */}
      {enemyPanel && (() => {
        const { info, pinned } = enemyPanel;
        const ratio = Math.max(0, info.hp / info.maxHp);
        const wk = weaknessTag(info.weakness, info.styleWeakness);
        // A wave event (Frenzy/Blood Moon) or a speed affix bakes into baseSpeed but
        // not naturalSpeed — flag the difference so a hastened/slowed enemy reads at
        // a glance (▲ red = faster than normal, ▼ cyan = slower).
        const natSpeed = info.naturalSpeed ?? info.baseSpeed;
        const speedShift = info.baseSpeed > natSpeed ? 'up' : info.baseSpeed < natSpeed ? 'down' : null;
        // Enemy position in container pixels: logic → painted, offset by the
        // painted origin (zero unless a rounding sliver is left over).
        const box = paintedBox();
        const rect = boardRef.current?.getBoundingClientRect();
        const cw = rect?.width ?? window.innerWidth;
        const ch = rect?.height ?? window.innerHeight;
        const ex = box ? box.dx + (info.x / engW) * box.width : (info.x / engW) * cw;
        const ey = box ? box.dy + (info.y / engH) * box.height : (info.y / engH) * ch;
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
                        const desc =
                          a === 'armored' && info.armoredStyle ? `${def.desc} (${info.armoredStyle})`
                          : a === 'protected' && info.protectedStyle ? `${def.desc} (${info.protectedStyle})`
                          : def.desc;
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
                <StatLabel icon={ASSETS.misc.orb_hitpoints}>HP</StatLabel>
                <span className="text-right text-white">{info.hp}/{info.maxHp}</span>
                {/* The Weaken spell's own sprite — OSRS's symbol for "takes more,
                    resists less". A plain Magic icon read as "this enemy IS magic". */}
                <StatLabel icon={ASSETS.debuffs.vuln}>Weakness</StatLabel>
                <span className="text-right capitalize" style={{ color: wk?.color ?? '#9a9a9a' }}>{wk ? wk.label : 'None'}</span>
                <StatLabel icon={ASSETS.misc.orb_run}>Move speed</StatLabel>
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
                <StatLabel icon={ASSETS.misc.coins_icon}>Gold</StatLabel>
                <span className="text-right text-osrs-yellow">{info.reward}</span>
                {/* What it costs to let this one through. A boss quietly took five
                    lives and players had no way to see why — so the price is quoted
                    on the enemy, before it is charged. */}
                <StatLabel icon={ASSETS.misc.hp_icon} title="Lives lost if this enemy reaches the end">Leak cost</StatLabel>
                <span className="text-right text-osrs-red">−{info.leakCost} {info.leakCost === 1 ? 'life' : 'lives'}</span>
                {info.tenacity > 0 && (
                  <>
                    <StatLabel icon={ASSETS.misc.defence_icon} title="Resistance to non-damaging debuffs (slow, stun, etc.)">Tenacity</StatLabel>
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
              {/* How to kill it. A boss mechanic the player can't name reads as an
                  unfair one, so the counterplay is stated on the boss itself rather
                  than left to be inferred from a wipe. */}
              {bossTip(info.type) && (
                <p className="mt-[0.4em] pt-[0.35em] border-t border-[#3a2f1d] text-[0.68em] leading-snug text-[#cdbb91]">
                  <span className="text-osrs-orange font-bold">How to kill: </span>
                  {bossTip(info.type)}
                </p>
              )}
            </div>
          </div>
        );
      })()}

      {/* Wizard spellbook picker: opens on the tapped tile when placing a wizard.
          Each option's icon cycles its staves (Elemental → 4 elemental staves,
          Ancients → 4 sceptres, Utility → Lunar staff); hovering one previews its
          spells cycling. Picking a spellbook builds the wizard there. */}
      {ui.pendingPlacement && ui.selectedTowerType === 'wizard' && (() => {
        // Tile position in container pixels, then the same clamp the enemy panel
        // uses: above the tile by default, below it when the measured picker would
        // clip the top edge, and never outside the board either way.
        const place = ui.pendingPlacement;
        const box = paintedBox();
        const rect = boardRef.current?.getBoundingClientRect();
        const cw = rect?.width ?? window.innerWidth;
        const ch = rect?.height ?? window.innerHeight;
        const tx = box ? box.dx + (place.x / engW) * box.width : (place.x / engW) * cw;
        const ty = box ? box.dy + (place.y / engH) * box.height : (place.y / engH) * ch;
        const m = 8;                                          // board margin
        const gap = (box ? box.height / engH : 1) * 24 + 6;   // clears the tile itself
        const pw = wizardPickerSize.w, ph = wizardPickerSize.h;
        const left = Math.max(m, Math.min(cw - pw - m, tx - pw / 2));
        let top = ty - gap - ph;
        if (top < m) top = ty + gap;
        top = Math.max(m, Math.min(ch - ph - m, top));
        return (
        <div
          ref={wizardPickerRef}
          className="absolute z-30"
          style={{ left: `${left}px`, top: `${top}px`, visibility: pw === 0 ? 'hidden' : 'visible' }}
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
        );
      })()}

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
                const cost = ui.towerPrices[type];
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

      {/* Shift-drag build line: what it costs and how to commit it, while the
          stroke is still free to redraw. Sits above the toast lane so a refusal
          can still speak over it. */}
      {ui.placeQueue.length > 0 && !ui.queueArmed && (() => {
        const eng = engineRef.current;
        const cost = eng?.placeQueueCost ?? 0;
        const afford = eng?.placeQueueAffordable ?? 0;
        const short = afford < ui.placeQueue.length;
        return (
          <div className="rs-hint absolute left-1/2 bottom-[23%] -translate-x-1/2 z-30 pointer-events-none whitespace-nowrap flex items-center gap-[0.4em] justify-center">
            <span className="text-osrs-orange">▸</span>
            {ui.placeQueue.length} queued
            <span style={{ color: short ? 'var(--osrs-red)' : 'var(--osrs-yellow)' }}>{fmt(cost)} gp</span>
            {short && <span className="text-osrs-warn">(only {afford} affordable)</span>}
            <span className="text-[#d3c3a0]">· release Shift to price it up</span>
          </div>
        );
      })()}

      {/* The painted line, finished and waiting to be bought. Nothing has been
          charged yet — this panel is the purchase.
          It captures pointer events (it has buttons), so it sits in the toast lane
          rather than over the board, clear of the tiles the line is standing on.
          A line of wizards confirms *through* its spellbook choice: the question
          has to be asked anyway, and answering it is the yes. */}
      {ui.queueArmed && ui.placeQueue.length > 0 && ui.selectedTowerType && (() => {
        const eng = engineRef.current;
        const type = ui.selectedTowerType;
        const n = ui.placeQueue.length;
        const cost = eng?.placeQueueCost ?? 0;
        const afford = eng?.placeQueueAffordable ?? 0;
        const short = afford < n;
        // `baseName` is what the dock calls the tower ("Ranged", "Magic"), so the
        // panel names the thing being bought the same way the player picked it. Not
        // the tier-1 name: that is the *weapon* ("Shortbow", "Strike"), which reads
        // as nonsense pluralised and would go stale the moment a tier is renamed.
        const name = TOWERS[type]?.baseName ?? type;
        return (
          <div
            className="absolute left-1/2 bottom-[19%] -translate-x-1/2 z-30 pointer-events-none"
            style={{ fontSize: fs('clamp(14px, 0.95vw, 20px)') }}
          >
            <MovablePanel id="build-confirm" globalLock={uiLocked} className="rs-panel relative p-[0.6em] whitespace-nowrap">
              <div className="flex items-center justify-center gap-[0.4em] text-[0.78em] mb-[0.45em]">
                <img src={towerIcon(type)} alt="" className="w-[1.3em] h-[1.3em] object-contain" onError={hideBrokenImg} />
                <span className="text-[#e7d9b0]">Build {n} {name} tower{n > 1 ? 's' : ''}</span>
                <span className={short ? 'text-osrs-warn' : 'text-osrs-yellow'}>{fmt(cost)} gp</span>
              </div>
              {short && (
                <div className="text-center text-[0.62em] text-osrs-warn mb-[0.4em]">
                  {afford > 0 ? `Only ${afford} affordable — the rest won't be built` : 'Not enough gold'}
                </div>
              )}

              {type === 'wizard' ? (
                <>
                  <div className="text-center text-[0.62em] text-[#d3c3a0] uppercase tracking-wide mb-[0.35em]">
                    Choose spellbook for the line
                  </div>
                  <div className="flex gap-[0.4em] justify-center">
                    {([
                      { mode: 'elemental', label: 'Elemental', icon: WIZARD_STAVES[animTick % WIZARD_STAVES.length] },
                      { mode: 'ancients', label: 'Ancients', icon: WIZARD_SCEPTRES[animTick % WIZARD_SCEPTRES.length] },
                      { mode: 'utility', label: 'Utility', icon: WIZARD_UTILITY_STAFF },
                    ] as { mode: MageMode; label: string; icon?: string }[]).map(({ mode, label, icon }) => (
                      <button
                        key={mode}
                        title={`Build the line as ${label} wizards`}
                        disabled={afford < 1}
                        onClick={() => engineRef.current?.confirmPlaceQueue(mode)}
                        className="rs-slot flex flex-col items-center w-[3.6em] disabled:opacity-50"
                      >
                        {icon
                          ? <img src={icon} alt={label} onError={hideBrokenImg} />
                          : <span className="text-[0.6em]">{label}</span>}
                        <span className="text-[0.58em] text-[#cdbb91] mt-[0.15em]">{label}</span>
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <button
                  className="rs-btn rs-btn-primary w-full py-[0.35em] text-[0.78em] disabled:opacity-50"
                  disabled={afford < 1}
                  title={`Build the painted line for ${fmt(cost)} gp`}
                  onClick={() => engineRef.current?.confirmPlaceQueue()}
                >
                  Build ({fmt(cost)} gp)
                </button>
              )}

              <div className="text-center text-[0.6em] text-[#b3a585] mt-[0.35em]">
                Esc or right-click the map cancels · hold Shift to keep painting
              </div>
            </MovablePanel>
          </div>
        );
      })()}

      {/* Paste in flight: what the copied formation costs and how to land it.
          Shares the queue caption's lane — the two modes are exclusive. */}
      {ui.pasting && ui.clipboard.length > 0 && (() => {
        const cost = engineRef.current?.clipboardCost ?? 0;
        const short = ui.money < cost;
        return (
          <div className="rs-hint absolute left-1/2 bottom-[23%] -translate-x-1/2 z-30 pointer-events-none whitespace-nowrap flex items-center gap-[0.4em] justify-center">
            <span className="text-osrs-orange">▸</span>
            Pasting {ui.clipboard.length} tower{ui.clipboard.length > 1 ? 's' : ''}
            <span style={{ color: short ? 'var(--osrs-red)' : 'var(--osrs-yellow)' }}>{fmt(cost)} gp</span>
            <span className="text-[#d3c3a0]">· click to build · Esc cancels</span>
          </div>
        );
      })()}

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

      {/* Loot-drop toasts (bottom-right, over the bag's own stone): each piece that
          falls slides in, holds, and leaves. It points at where the gear went, so
          the stone's badge and the toast tell one story. Click-through. */}
      {lootToasts.length > 0 && (
        <div className="absolute right-3 bottom-3 z-40 pointer-events-none flex flex-col items-end gap-[0.3em]"
             style={{ fontSize: fs('clamp(13px, 0.85vw, 18px)') }}>
          {lootToasts.map((t) => (
            <div key={t.id} className="rs-loot-toast">
              <img
                src={GEAR_ICONS[t.item.id]}
                alt=""
                className="rs-loot-toast-icon"
                onError={hideBrokenImg}
              />
              <span className="flex flex-col leading-tight">
                <span className="rs-loot-toast-label">
                  {t.item.rarity === 'signature' ? 'Signature drop' : 'Gear drop'}
                </span>
                <span className={t.item.rarity === 'signature' ? 'text-osrs-yellow' : 'text-[#e6dcc0]'}>
                  {t.item.name}
                </span>
              </span>
            </div>
          ))}
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
          className="absolute left-1/2 -translate-x-1/2 z-10 flex flex-col items-center gap-[0.35em] transition-[top] duration-300 pointer-events-none"
          style={{ top: ui.bossOnField ? '4.5rem' : '0.5rem', fontSize: fs('clamp(13px, 0.85vw, 18px)') }}
        >
          {/* Wave strip: progress while fighting, next-wave preview while prepping.
              Draggable like the other interfaces — so it captures pointer events,
              and a player who wants the ground under it just moves it aside
              (right-click snaps it back). Reads a size up from the chips below it:
              it is the one panel you check before every wave. */}
          {(ui.waveActive || ui.wavePreview.length > 0) && (
            <MovablePanel
              id="wavestrip"
              globalLock={uiLocked}
              className="rs-panel relative px-[0.7em] py-[0.35em] min-w-[16em] max-w-[46em]"
              style={{ fontSize: fs('clamp(16px, 1.05vw, 23px)') }}
            >
              {ui.waveActive ? (
                <>
                  <div className="flex items-center justify-between gap-[1em] text-[0.8em] text-osrs-orange mb-[0.2em]">
                    <span>
                      ⚔ Wave {ui.wave}{ui.bossWave ? ' — BOSS' : ''}
                      {ui.runPhase === 'endless' && <span className="ml-[0.4em] text-[0.85em] uppercase tracking-wider">· Endless</span>}
                    </span>
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
                    {ui.runPhase === 'endless' && <span className="text-osrs-orange">Endless · </span>}
                    Next: Wave {ui.wave} · {ui.wavePreview.reduce((s, m) => s + m.count, 0)} incoming
                  </div>
                  <div className="flex items-center justify-center gap-[0.7em] flex-wrap">
                    {(previewExpanded ? ui.wavePreview : capWavePreview(ui.wavePreview)).map((m) => {
                      const style = enemySpriteStyle(m.type);
                      return (
                        // `group` + `relative` anchor the stat card; the strip itself
                        // does not scroll, so an absolute child is safe here.
                        <span key={m.type} className="group relative flex items-center gap-[0.3em] pointer-events-auto">
                          <span className="inline-block w-[2.2em] h-[2.2em] shrink-0" style={style ? { ...style, imageRendering: 'pixelated' } : undefined} />
                          <span className={`text-[0.8em] ${m.isBoss ? 'text-osrs-red font-bold uppercase tracking-wide' : 'text-[#e8dcc0]'}`}>
                            {/* A wave can now carry more than one of the same boss (the
                                extra-boss roll), so a boss shows its count too once it stacks. */}
                            {m.isBoss ? `⚠ ${m.name}${m.count > 1 ? ` ×${m.count}` : ''}` : `×${m.count}`}
                          </span>
                          <WavePreviewCard m={m} />
                        </span>
                      );
                    })}
                    {/* The overflow toggle. Collapsed, the strip is a fixed two rows
                        whatever the wave holds — a deep run used to grow it into a
                        wall across the top of the board that swallowed every click
                        aimed at the ground beneath it, so towers could not be placed
                        up there at all. Expanding is a deliberate act, and the next
                        wave collapses it again. */}
                    {(() => {
                      const hidden = ui.wavePreview.length - capWavePreview(ui.wavePreview).length;
                      if (hidden <= 0) return null;
                      return (
                        <button
                          type="button"
                          data-no-drag
                          className="rs-btn pointer-events-auto text-[0.7em] px-[0.5em] py-[0.1em]"
                          onClick={() => setPreviewExpanded((v) => !v)}
                          title={previewExpanded ? 'Collapse the wave preview' : 'Show every monster in this wave'}
                        >
                          {previewExpanded ? 'Show less' : `+${hidden} more`}
                        </button>
                      );
                    })()}
                  </div>
                </>
              )}
            </MovablePanel>
          )}
          {/* Event chip + potion infoboxes (existing row, now BELOW the strip). */}
          {((ui.waveActive && ui.activeEvent) || activeInfoboxes.length > 0 || ui.diversions.length > 0 || readyPatches.length > 0 || ui.farmBuff) && (
            <div className="flex items-start gap-[0.4em]">
              {/* Keyed by wave so each wave's event re-announces itself on mount. */}
              {ui.waveActive && ui.activeEvent && <WaveEventChip key={ui.wave} event={ui.activeEvent} />}
              {activeInfoboxes.map((o) => (
                <HoverTip
                  key={o.id}
                  side="bottom"
                  content={tipHeader(
                    <span className="text-[0.85em] font-bold text-osrs-orange">{o.name}</span>,
                    o.desc,
                    <span className="text-[0.58em] uppercase tracking-wide px-[0.35em] py-[0.05em] rounded-sm text-osrs-orange">{o.activeSecs}s left</span>,
                  )}
                >
                  <div className="rs-infobox pointer-events-auto">
                    <img src={geIcon(o.wiki)} alt={o.name} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                    <span className="rs-infobox-time">{o.activeSecs}</span>
                  </div>
                </HoverTip>
              ))}
              {/* Distractions & Diversions. The sprite is already on the board, but a
                  player reading their build panel would never see it — so whatever
                  turned up is also a box up here, and the box is clickable, so it can
                  be taken without hunting for it on the map. Deliberately no timer
                  digit: these wait out the whole prep phase rather than counting down. */}
              {ui.diversions.map((d) => (
                <HoverTip
                  key={d.id}
                  side="bottom"
                  content={tipHeader(
                    <span className="text-[0.85em] font-bold text-osrs-orange">{d.name}</span>,
                    d.tip,
                    <span className="text-[0.58em] uppercase tracking-wide px-[0.35em] py-[0.05em] rounded-sm text-osrs-orange">Click</span>,
                  )}
                >
                  <button
                    type="button"
                    className="rs-infobox pointer-events-auto"
                    onClick={() => engineRef.current?.claimDiversion(d.id)}
                  >
                    <img src={d.icon} alt={d.name} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                  </button>
                </HoverTip>
              ))}
              {/* A ripe allotment. Same deal as a diversion: it is already on the
                  board, and the box is the second place to reach it. No timer digit
                  — a herb waits as long as it has to. */}
              {readyPatches.map((p) => (
                <HoverTip
                  key={p.id}
                  side="bottom"
                  content={tipHeader(
                    <span className="text-[0.85em] font-bold text-osrs-orange">{p.name}</span>,
                    'Ripe. Pull it and it rides the next wave.',
                    <span className="text-[0.58em] uppercase tracking-wide px-[0.35em] py-[0.05em] rounded-sm text-osrs-orange">Click</span>,
                  )}
                >
                  <button
                    type="button"
                    className="rs-infobox pointer-events-auto"
                    onClick={() => engineRef.current?.harvestPatch(p.id)}
                  >
                    <img src={p.icon} alt={p.name} onError={hideBrokenImg} />
                  </button>
                </HoverTip>
              ))}
              {/* The herb riding this wave. It expires on its own when the wave
                  counter moves, so there is nothing to count down here either. */}
              {ui.farmBuff && (
                <HoverTip
                  side="bottom"
                  content={tipHeader(
                    <span className="text-[0.85em] font-bold text-osrs-orange">{ui.farmBuff.herbName}</span>,
                    ui.farmBuff.tip,
                    <span className="text-[0.58em] uppercase tracking-wide px-[0.35em] py-[0.05em] rounded-sm text-osrs-orange">{ui.farmBuff.label}</span>,
                  )}
                >
                  <div className="rs-infobox pointer-events-auto">
                    <img src={ui.farmBuff.icon} alt={ui.farmBuff.herbName} onError={hideBrokenImg} />
                  </div>
                </HoverTip>
              )}
            </div>
          )}
        </div>
      )}

      {/* Patch menu — an allotment was clicked. Bare ground gets the seed list;
          ground with something in it gets what is growing, how much longer, and the
          spade. It floats over the board rather than living in the bar because the
          patch it is filling is on the board, and it is a between-waves interface:
          pressing Start Wave closes it. Movable like every other floating panel, so
          it never has to sit on top of the patch. */}
      {ui.pendingSow !== null && (() => {
        const plot = ui.farmPatches.find((p) => p.id === ui.pendingSow) ?? null;
        const growing = plot?.seedId ? SEED_BY_ID[plot.seedId] : null;
        return (
        <div
          className="absolute left-1/2 bottom-[19%] -translate-x-1/2 z-30"
          style={{ fontSize: fs('clamp(14px, 0.95vw, 20px)') }}
        >
          <MovablePanel id="sow" globalLock={uiLocked} className="rs-panel relative p-[0.6em] w-[20em]">
            <div className="rs-panel-title flex items-center gap-2" style={{ fontSize: '1em' }}>
              <img
                src={growing ? growing.herbIcon : ASSETS.misc.farming_icon}
                alt=""
                className="w-[1.3em] h-[1.3em] object-contain"
                onError={hideBrokenImg}
              />
              <span>{growing ? growing.herbName : 'Sow a seed'}</span>
            </div>
            {growing && plot ? (
              <>
                <p className="text-[0.68em] text-[#b3a585] leading-snug mt-[0.3em] px-[0.1em]">
                  It grows while you fight. Dig it up if you want the plot back.
                </p>
                <div className="rs-panel-inset mt-[0.45em] px-[0.45em] py-[0.35em] flex flex-col gap-[0.25em]">
                  <div className="flex items-center justify-between text-[0.72em]">
                    <span className="text-[#b3a585]">Ready in</span>
                    <span className="text-osrs-yellow tabular-nums">
                      {plot.wavesLeft} wave{plot.wavesLeft === 1 ? '' : 's'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[0.72em]">
                    <span className="text-[#b3a585]">Buffs</span>
                    <span className="flex items-center gap-[0.25em] text-osrs-orange">
                      <img src={growing.signature.icon} alt="" className="w-[1em] h-[1em] object-contain" onError={hideBrokenImg} />
                      <span>{growing.signature.label}</span>
                    </span>
                  </div>
                </div>
                <button
                  className="rs-btn w-full py-[0.3em] text-[0.72em] mt-[0.5em] flex items-center justify-center gap-[0.4em]"
                  title={`Dig up the ${growing.seedName} — the ${growing.cost} gp it cost is not refunded`}
                  onClick={() => { if (ui.pendingSow) engineRef.current?.clearPatch(ui.pendingSow); }}
                >
                  <img src={growing.seedIcon} alt="" className="w-[1.1em] h-[1.1em] object-contain" onError={hideBrokenImg} />
                  <span>Dig it up</span>
                </button>
              </>
            ) : (
              <>
                <p className="text-[0.68em] text-[#b3a585] leading-snug mt-[0.3em] px-[0.1em]">
                  It grows while you fight. The herb buffs one whole wave.
                </p>
                <div className="flex flex-col gap-[0.25em] mt-[0.45em]">
                  {SEEDS.map((s) => {
                    const broke = ui.money < s.cost;
                    return (
                      <HoverTip
                        key={s.id}
                        side="top"
                        content={tipHeader(
                          <span className="text-[0.85em] font-bold text-osrs-orange">{s.herbName}</span>,
                          s.tip,
                          <span className="text-[0.58em] uppercase tracking-wide px-[0.35em] py-[0.05em] rounded-sm text-osrs-orange">Farming {s.level}</span>,
                        )}
                      >
                        <button
                          type="button"
                          disabled={broke}
                          title={broke ? `${s.seedName} costs ${s.cost} gp` : `Sow a ${s.seedName} — ready in ${s.waves} waves`}
                          onClick={() => { if (ui.pendingSow) engineRef.current?.sowSeed(ui.pendingSow, s.id); }}
                          className="rs-panel-inset w-full flex items-center gap-[0.5em] px-[0.45em] py-[0.3em] text-left hover:border-[var(--osrs-orange)] disabled:opacity-50 disabled:hover:border-[var(--rs-keyline)]"
                        >
                          <img src={s.seedIcon} alt="" className="w-[1.6em] h-[1.6em] object-contain shrink-0" onError={hideBrokenImg} />
                          <span className="flex-1 min-w-0">
                            <span className="block text-[0.76em] text-[#e7d9b0] truncate">{s.herbName}</span>
                            <span className="flex items-center gap-[0.25em] text-[0.6em] uppercase tracking-wide text-osrs-orange">
                              <img src={s.signature.icon} alt="" className="w-[1em] h-[1em] object-contain" onError={hideBrokenImg} />
                              <span className="truncate">{s.signature.label}</span>
                            </span>
                          </span>
                          <span className="shrink-0 text-right">
                            <span className={`block text-[0.72em] tabular-nums ${broke ? 'text-osrs-warn' : 'text-osrs-yellow'}`}>{s.cost} gp</span>
                            <span className="block text-[0.6em] text-[#b3a585] tabular-nums">{s.waves} waves</span>
                          </span>
                        </button>
                      </HoverTip>
                    );
                  })}
                </div>
              </>
            )}
            <button
              className="rs-btn w-full py-[0.3em] text-[0.72em] mt-[0.5em]"
              title={growing ? 'Leave it growing' : 'Leave the patch empty'}
              onClick={() => engineRef.current?.closeSow()}
            >
              Close (Esc)
            </button>
          </MovablePanel>
        </div>
        );
      })()}

      {/* Selected tower panel (top-left) */}
      {selectedTower && (
        <MovablePanel
          id="tower"
          globalLock={uiLocked}
          className="rs-panel absolute top-4 left-4 p-2 z-10 w-[17em]"
          style={{ fontSize: fs('clamp(14px, 0.92vw, 20px)') }}
        >
          <div className="rs-panel-title flex items-center gap-2" style={{ fontSize: '1em' }}>
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

          <div className="space-y-[0.2em] px-[0.2em] mt-[0.3em]">
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
            {/* The multi-combat glyph stands in for the attack radius: a bow would
                collide with the Damage row's own Ranged icon on archer towers. */}
            <Stat icon={ASSETS.misc.multicombat_icon} label={isUtility ? 'Aura range' : 'Range'} value={rangeNode} />
            <Stat icon={ASSETS.misc.stats_icon} label="Level" value={`${selectedTower.level}/${selectedTower.maxLevel}`} />
          </div>

          {/* Signature niche — what this tower does that the wizard can't, made
              explicit so players grasp each tower's identity. */}
          {(() => {
            const sig = towerSignature(selectedTower.type, selectedTower.level);
            if (!sig) return null;
            return (
              <div className="mt-[0.4em] px-[0.2em]">
                <div className="flex items-center gap-[0.35em] mb-[0.15em]">
                  {/* The effect's own icon carries the "what kind of trick is this"
                      job the word "Signature" used to do, in less room. */}
                  <img src={sig.icon} alt="" className="w-[1.1em] h-[1.1em] object-contain" onError={hideBrokenImg} />
                  <span className="text-[0.74em] text-osrs-yellow font-semibold">{sig.label}</span>
                </div>
                <p className="text-[0.72em] text-[#b3a585] leading-snug">{sig.desc}</p>
                {sig.notes.length > 0 && (
                  <ul className="mt-[0.2em] space-y-[0.1em]">
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
            <div className="mt-[0.4em] px-[0.2em]">
              <div className="text-[0.68em] text-[#5bd75b] uppercase tracking-wide mb-[0.2em]">Active boosts</div>
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
            <div className="mt-[0.4em]">
              <div className="text-[0.72em] text-[#d3c3a0] mb-[0.15em] px-[0.2em] uppercase tracking-wide">Target priority</div>
              {/* Three across, two rows — six in a single row squeezed each button to
                  ~35px, which is what made the strip look wrong and left no room to
                  read a glyph. Two rows give each button the width to be legible. */}
              <div className="grid grid-cols-3 gap-[0.2em]">
                {PRIORITY_ORDER.map((p) => (
                  <button
                    key={p}
                    title={PRIORITY_TIPS[p]}
                    aria-label={PRIORITY_TIPS[p]}
                    onClick={() => engineRef.current?.setTargetingPriority(selectedTower.id, p)}
                    className={`rs-btn px-0 py-[0.3em] flex items-center justify-center ${selectedTower.targetingPriority === p ? 'rs-btn-primary' : ''}`}
                  >
                    <PriorityGlyph spec={PRIORITY_ICONS[p]} />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Wizard spellbook is locked at purchase; only the element/barrage
              (its variant) can be retuned here. */}
          {selectedTower.type === 'wizard' && (
            <div className="mt-[0.45em]">
              <div className="flex items-center justify-between mb-[0.2em] px-[0.2em]">
                <span className="text-[0.72em] text-[#d3c3a0] uppercase tracking-wide">Spellbook</span>
                <span className="flex items-center gap-[0.3em] text-[0.72em] text-osrs-yellow capitalize">
                  <img src={spellbookIcon(selectedTower.mageMode)} alt="" className="w-[1.2em] h-[1.2em]" onError={hideBrokenImg} />
                  {selectedTower.mageMode ?? 'elemental'}
                </span>
              </div>

              {(selectedTower.mageMode ?? 'elemental') === 'elemental' && (
                <div className="grid grid-cols-4 gap-[0.3em]">
                  {ELEMENT_ORDER.map((el, i) => {
                    const spell = elementalSpellName(el, selectedTower.level);
                    const icon = spellIconUrl(spell);
                    const active = (selectedTower.element ?? 'air') === el;
                    return (
                      <button
                        key={el}
                        title={`${spell.replace('_', ' ')} — ${ELEMENTS[el].desc}; +50% vs weakness (${WIZARD_SLOT_KEYS[i]})`}
                        onClick={() => engineRef.current?.setWizardElement(selectedTower.id, el)}
                        className={`rs-btn relative flex items-center justify-center px-0 py-[0.3em] ${active ? 'rs-btn-primary' : ''}`}
                        style={{ borderBottom: `2px solid ${ELEMENTS[el].color}` }}
                      >
                        {icon
                          ? <img src={icon} alt={ELEMENTS[el].label} className="w-[1.6em] h-[1.6em] object-contain"
                              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                          : <span className="text-[0.66em]" style={{ color: ELEMENTS[el].color }}>{ELEMENTS[el].label}</span>}
                        <span className="rs-slot-key">{WIZARD_SLOT_KEYS[i]}</span>
                      </button>
                    );
                  })}
                </div>
              )}

              {selectedTower.mageMode === 'ancients' && (
                <div className="grid grid-cols-4 gap-[0.3em]">
                  {ANCIENT_ORDER.map((a, i) => {
                    const spell = ancientSpellName(a, selectedTower.level);
                    const icon = spellIconUrl(spell);
                    const active = (selectedTower.ancientType ?? 'ice') === a;
                    return (
                      <button
                        key={a}
                        title={`${spell.replace('_', ' ')} — ${ANCIENTS[a].desc} (${WIZARD_SLOT_KEYS[i]})`}
                        onClick={() => engineRef.current?.setAncientType(selectedTower.id, a)}
                        className={`rs-btn relative flex items-center justify-center px-0 py-[0.3em] ${active ? 'rs-btn-primary' : ''}`}
                        style={{ borderBottom: `2px solid ${ANCIENTS[a].color}` }}
                      >
                        {icon
                          ? <img src={icon} alt={ANCIENTS[a].label} className="w-[1.6em] h-[1.6em] object-contain"
                              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                          : <span className="text-[0.66em]" style={{ color: ANCIENTS[a].color }}>{ANCIENTS[a].label}</span>}
                        <span className="rs-slot-key">{WIZARD_SLOT_KEYS[i]}</span>
                      </button>
                    );
                  })}
                </div>
              )}

              {selectedTower.mageMode === 'utility' && (
                <>
                  <div className="grid grid-cols-3 gap-[0.3em]">
                    {SUPPORT_ORDER.map((s, i) => {
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
                            : `${SUPPORT_SPELLS[s].label} — ${SUPPORT_SPELLS[s].desc} (${WIZARD_SLOT_KEYS[i]})`}
                          onClick={() => engineRef.current?.setSupportSpell(selectedTower.id, s)}
                          className={`rs-btn relative flex items-center justify-center px-0 py-[0.3em] ${active ? 'rs-btn-primary' : ''} ${wardCapped ? 'opacity-40 cursor-not-allowed' : ''}`}
                          style={{ borderBottom: `2px solid ${SUPPORT_SPELLS[s].color}` }}
                        >
                          {icon
                            ? <img src={icon} alt={SUPPORT_SPELLS[s].label} className="w-[1.6em] h-[1.6em] object-contain" onError={hideBrokenImg} />
                            : <span className="text-[0.62em]" style={{ color: SUPPORT_SPELLS[s].color }}>{SUPPORT_SPELLS[s].label}</span>}
                          <span className="rs-slot-key">{WIZARD_SLOT_KEYS[i]}</span>
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-[0.72em] text-[#b3a585] mt-[0.25em] px-[0.2em] leading-snug">
                    {SUPPORT_SPELLS[selectedTower.supportSpell ?? 'curse'].desc}.
                    Its aura also lifts nearby towers, less with each extra wizard.
                  </p>
                </>
              )}

              {(selectedTower.mageMode ?? 'elemental') === 'elemental' && (
                <p className="text-[0.72em] text-[#b3a585] mt-[0.25em] px-[0.2em] leading-snug">
                  {ELEMENTS[(selectedTower.element ?? 'air') as keyof typeof ELEMENTS].desc}
                </p>
              )}

              {selectedTower.mageMode === 'ancients' && (
                <p className="text-[0.72em] text-[#b3a585] mt-[0.25em] px-[0.2em] leading-snug">
                  {ANCIENTS[selectedTower.ancientType ?? 'ice'].desc}
                </p>
              )}
            </div>
          )}

          {(() => {
            const sk = selectedTower.skills[styleSkillKey(TOWER_STYLES[selectedTower.type].style)];
            const need = towerXpForLevel(sk.level);
            const pct = Math.min(100, Math.round((sk.xp / need) * 100));
            return (
              <div className="mt-[0.35em] px-[0.1em]">
                <div className="flex items-center justify-between text-[0.72em] text-[#d3c3a0] mb-[0.15em]">
                  <span>Combat level {sk.level}</span>
                  <span className="text-[#9a8d70]">{Math.floor(sk.xp)} / {need} XP</span>
                </div>
                <div className="rs-progress"><div className="rs-progress-fill" style={{ width: `${pct}%` }} /></div>
              </div>
            );
          })()}

          {/* Classic-mode gear: two equippable slots, level-gated by this tower's
              combat level (hence sitting right under the XP bar above). Roguelite
              towers carry no equipment, so the whole section is hidden there. */}
          {ui.gameMode === 'classic' && (
            <div className="mt-[0.45em]" data-tut="gear">
              <div className="text-[0.72em] text-[#d3c3a0] mb-[0.2em] px-[0.2em] uppercase tracking-wide">Equipment</div>
              <div className="flex gap-[0.5em] px-[0.2em]">
                {/* Utility wizards take jewellery only — they never attack, so a
                    rune slot would sell them damage they cannot deal (canEquip
                    enforces it; this keeps the dead slot off the panel too). */}
                {(isUtility ? (['jewellery'] as const) : (['ammo', 'jewellery'] as const)).map((slotType) => {
                  const equipped = selectedTower.equipment[slotType];
                  const icon = equipped ? GEAR_ICONS[equipped.id] : undefined;
                  // Slot-1 label follows the tower's ammo class (Ammo/Runes/Kit);
                  // slot-2 (jewellery) is always "Jewellery" — universal, no class gate.
                  const slotLabel = slotType === 'ammo' ? AMMO_CLASS_LABEL[towerAmmoClassFor(selectedTower.type)] : 'Jewellery';
                  const options = ui.lootBag.filter((g) => g.type === slotType);
                  const listed = options.filter((g) => {
                    const check = canEquip(selectedTower, g);
                    return check.ok || check.reason === 'level';
                  });
                  return (
                    <div key={slotType} className="relative flex flex-col items-center" style={{ width: '3em' }}>
                      <HoverTip content={equipped ? gearTooltip(equipped) : `Empty ${slotLabel} slot — click to equip from your loot bag`}>
                        <button
                          type="button"
                          className="rs-slot w-[3em] relative"
                          style={equipped?.rarity === 'signature' ? { borderColor: 'var(--osrs-yellow)' } : undefined}
                          onClick={() => setGearPicker((p) => (p === slotType ? null : slotType))}
                          onContextMenu={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            if (equipped) engineRef.current?.unequipGear(selectedTower.id, slotType);
                          }}
                        >
                          {icon
                            ? <img src={icon} alt={equipped?.name ?? ''} onError={hideBrokenImg} />
                            : <span className="text-[0.5em] text-[#5a5138] uppercase tracking-wide">{slotLabel}</span>}
                          {equipped && (
                            <span
                              role="button"
                              aria-label={`Unequip ${equipped.name}`}
                              title="Unequip"
                              className="absolute -top-[0.35em] -right-[0.35em] w-[1.15em] h-[1.15em] flex items-center justify-center rounded-full bg-[#241c12] border border-[var(--rs-keyline)] text-[0.6em] text-osrs-red leading-none hover:text-white hover:bg-[#3a3122]"
                              onClick={(e) => {
                                e.stopPropagation();
                                engineRef.current?.unequipGear(selectedTower.id, slotType);
                              }}
                            >
                              ✕
                            </span>
                          )}
                        </button>
                      </HoverTip>
                      <HoverTip content={equipped ? gearTooltip(equipped) : undefined}>
                        <span
                          className={`text-[0.6em] leading-tight text-center truncate w-full mt-[0.2em] ${equipped?.rarity === 'signature' ? 'text-osrs-yellow font-semibold' : 'text-[#b3a585]'}`}
                        >
                          {equipped ? equipped.name : slotLabel}
                        </span>
                      </HoverTip>

                      {gearPicker === slotType && (
                        <div className="absolute top-full left-0 mt-[0.3em] z-30 rs-panel-inset p-[0.35em] w-[13em] max-h-[14em] overflow-y-auto shadow-[0_2px_8px_rgba(0,0,0,0.8)]">
                          {listed.length === 0 ? (
                            <div className="text-[0.68em] text-[#8a7c5c] p-[0.2em] leading-snug">
                              No compatible {slotLabel.toLowerCase()} in bag
                            </div>
                          ) : (
                            listed.map((g, i) => {
                              const check = canEquip(selectedTower, g);
                              const disabled = !check.ok;
                              return (
                                <HoverTip key={i} content={gearTooltip(g)}>
                                  <button
                                    type="button"
                                    disabled={disabled}
                                    onClick={() => {
                                      engineRef.current?.equipGear(selectedTower.id, g.id);
                                      setGearPicker(null);
                                    }}
                                    className={`w-full flex items-center gap-[0.4em] px-[0.3em] py-[0.25em] text-left text-[0.7em] ${
                                      disabled ? 'opacity-45 cursor-not-allowed' : 'hover:bg-[#3a3122]'
                                    } ${g.rarity === 'signature' ? 'text-osrs-yellow' : 'text-[#d3c3a0]'}`}
                                  >
                                    <img
                                      src={GEAR_ICONS[g.id]}
                                      alt=""
                                      className="w-[1.3em] h-[1.3em] object-contain shrink-0"
                                      onError={hideBrokenImg}
                                    />
                                    <span className="flex-1 truncate">{g.name}</span>
                                    {disabled && (
                                      <span className="text-[0.85em] text-osrs-red whitespace-nowrap">
                                        Requires Lvl {g.levelReq}
                                      </span>
                                    )}
                                  </button>
                                </HoverTip>
                              );
                            })
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {moving ? (
            <div className="mt-[0.45em] text-center text-[0.8em] text-osrs-orange leading-snug">
              ▸ Click a tile to move here ({moveCost} gp)<br />
              <span className="text-[#d3c3a0]">right‑click to cancel</span>
            </div>
          ) : (
            <div className="mt-[0.45em] space-y-[0.3em] text-[0.95em]">
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
                            <span className="text-[#d3c3a0] whitespace-nowrap flex items-center gap-[0.35em]">
                              <img src={r.icon} alt="" className="w-[1.1em] h-[1.1em] object-contain shrink-0" onError={hideBrokenImg} />
                              {r.label}
                            </span>
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
                    className="rs-btn relative w-full flex items-center justify-center gap-[0.3em] px-[0.4em] py-[0.45em]"
                    title={towerGate?.ok
                      ? `Upgrade to next tier for ${selectedTower.upgradeCost} gp (U)`
                      : `Reach combat level ${towerGate?.neededLevel} to upgrade this tier`}
                    disabled={!towerGate?.ok || ui.money < selectedTower.upgradeCost}
                    onClick={() => engineRef.current?.upgradeTower(selectedTower.id)}
                  >
                    <span className="text-[#5bd75b] font-bold">⬆</span>
                    {towerGate?.ok
                      ? <>Upgrade — {selectedTower.upgradeCost} gp</>
                      : <>Needs Lv {towerGate?.neededLevel}</>}
                    <span className="rs-key">U</span>
                  </button>
                  <div className="flex items-center gap-[0.6em] mt-[0.3em] px-[0.1em]">
                    <label
                      className="flex items-center gap-[0.4em] text-[0.78em] text-[#d3c3a0] cursor-pointer select-none"
                      title="Auto-upgrade: the game spends gold to level this tower on its own, cheapest auto-upgrade tower first"
                    >
                      <input
                        type="checkbox"
                        className="rs-check"
                        checked={!!selectedTower.autoUpgrade}
                        onChange={(e) => engineRef.current?.setAutoUpgrade(selectedTower.id, e.target.checked)}
                      />
                      Auto‑upgrade
                    </label>
                    {selectedTower.autoUpgrade && selectedTower.maxLevel > 2 && (
                      <label
                        className="flex items-center gap-[0.3em] text-[0.72em] text-[#b9a97f] select-none"
                        title="Auto-upgrade stops once the tower reaches this tier"
                      >
                        up to
                        <select
                          className="rs-select text-[0.9em] px-[0.3em] py-[0.05em]"
                          value={selectedTower.autoUpgradeCap ?? selectedTower.maxLevel}
                          onChange={(e) => engineRef.current?.setAutoUpgradeCap(selectedTower.id, Number(e.target.value))}
                        >
                          {Array.from({ length: selectedTower.maxLevel - 1 }, (_, i) => i + 2).map((tier) => (
                            <option key={tier} value={tier}>
                              {tier === selectedTower.maxLevel ? `T${tier} (max)` : `T${tier}`}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                  </div>
                </div>
              )}
              {/* Fusion: two finished towers become one weapon that does something
                  neither could. It eats a tower and a plot and can't be taken back,
                  so it asks in place — the same rule as Sell. */}
              {readyFusions.map((o) => (
                fuseConfirm === o.partnerId ? (
                  <div key={o.partnerId} className="flex flex-col gap-[0.35em]">
                    <span className="text-[0.75em] text-osrs-warn text-center">
                      Forge {o.def.name}? Both towers become one, for good.
                    </span>
                    <div className="flex gap-[0.4em]">
                      <button
                        className="rs-btn relative flex-1 px-[0.4em] py-[0.45em] text-osrs-warn"
                        title={`Forge ${o.def.name} for ${fmt(o.cost)} gp`}
                        onClick={() => { engineRef.current?.fuseTowers(selectedTower.id, o.partnerId); setFuseConfirm(null); }}
                      >
                        Yes, forge it
                      </button>
                      <button
                        className="rs-btn relative flex-1 px-[0.4em] py-[0.45em]"
                        title="Keep both towers"
                        onClick={() => setFuseConfirm(null)}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    key={o.partnerId}
                    className="rs-btn w-full flex items-center justify-center gap-[0.35em] px-[0.4em] py-[0.45em]"
                    title={`${o.def.blurb} Costs ${fmt(o.cost)} gp and both towers.`}
                    onClick={() => setFuseConfirm(o.partnerId)}
                  >
                    <img src={towerIcon(o.def.type)} alt="" className="w-[1.2em] h-[1.2em] object-contain" onError={hideBrokenImg} />
                    Forge {o.def.name} — {fmt(o.cost)} gp
                  </button>
                )
              ))}
              {/* A finished tower's recipes, whether or not the other half exists.
                  The weapon is named and pictured, and under it the one thing still
                  in the way — usually a tower that was never built, which nothing
                  else in the game would ever have told the player about. */}
              {fusionRecipes.map((r) => (
                <div key={r.def.type} className="flex items-start gap-[0.4em] text-[0.72em] text-[#b9a97f] px-[0.1em]">
                  <img src={towerIcon(r.def.type)} alt="" className="w-[1.1em] h-[1.1em] mt-[0.1em] object-contain opacity-60" onError={hideBrokenImg} />
                  <span className="min-w-0">
                    <span className="text-[#cdbe91]">{r.def.name}</span>
                    <span className="block leading-snug">{r.note}</span>
                  </span>
                </div>
              ))}
              {fusionHint && (
                <div className="flex items-center gap-[0.4em] text-[0.72em] text-[#b9a97f] px-[0.1em]">
                  <img src={towerIcon(fusionHint.def.type)} alt="" className="w-[1.1em] h-[1.1em] object-contain opacity-60" onError={hideBrokenImg} />
                  <span className="truncate">{fusionHint.def.name}: {FUSION_BLOCK_TEXT[fusionHint.reason!]}</span>
                </div>
              )}
              {/* Selling refunds a fraction and cannot be undone, and the button sits
                  right under Upgrade — a fast upgrade click that overshoots used to
                  sell the tower outright. So it asks once, in place. */}
              {sellConfirm === selectedTower.id ? (
                <div className="flex flex-col gap-[0.35em]">
                  <span className="text-[0.75em] text-osrs-warn text-center">
                    Sell this tower for {sellValue} gp? You lose its levels.
                  </span>
                  <div className="flex gap-[0.4em]">
                    <button
                      className="rs-btn relative flex-1 px-[0.4em] py-[0.45em] text-osrs-warn"
                      title="Sell it — the tower and its levels are gone (Enter)"
                      onClick={() => { engineRef.current?.sellTower(selectedTower.id); setSellConfirm(null); }}
                    >
                      Yes, sell it
                      <span className="rs-key">ENTER</span>
                    </button>
                    <button
                      className="rs-btn relative flex-1 px-[0.4em] py-[0.45em]"
                      title="Keep the tower (Esc)"
                      onClick={() => setSellConfirm(null)}
                    >
                      Cancel
                      <span className="rs-key">ESC</span>
                    </button>
                  </div>
                </div>
              ) : (
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
                    className="rs-btn relative flex-1 px-[0.4em] py-[0.45em]"
                    title={`Sell this tower for ${sellValue} gp (75% refund) — asks to confirm (S)`}
                    onClick={() => setSellConfirm(selectedTower.id)}
                  >
                    Sell ({sellValue} gp)
                    <span className="rs-key">S</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </MovablePanel>
      )}

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
          diversionsMet={ui.diversionsMet}
          fusionsMade={ui.fusionsMade}
          achievements={ui.achievements}
          victories={victories}
          difficulty={difficulty}
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
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 pointer-events-none">
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
      {ui.paused && !ui.gameOver && !ui.won && (
        <div className="absolute inset-x-0 top-0 mt-2 flex justify-center z-20 pointer-events-none">
          <div className="rs-panel px-[1.1em] py-[0.4em] text-center" style={{ fontSize: fs('clamp(13px, 0.85vw, 17px)') }}>
            <div className="text-osrs-orange font-bold">❚❚ COMBAT PAUSED</div>
            <div className="text-[#cdbe91] text-[0.8em]">build freely · press Esc or ⏸ to resume</div>
          </div>
        </div>
      )}

      {/* The road forks — pick the region the run marches into next. Waits behind a
          relic or draft choice so two modals never stack; all three block Start Wave. */}
      {ui.pendingTravel && !ui.gameOver && !ui.pendingRelics && !ui.pendingDraft && (
        <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center z-30 p-4">
          <div className="flex items-center gap-[0.4em] mb-1">
            <img src={ASSETS.misc.signpost} alt="" className="w-[1.4em] h-[1.4em] object-contain" />
            <div className="text-osrs-orange font-bold text-[1.4em] text-center">The Road Forks</div>
          </div>
          <div className="text-[#cdbe91] text-[0.85em] mb-4 text-center max-w-[34em]">
            The boss is down — pick where to travel. Your road and towers stay; the land and its monsters change.
          </div>
          <div className="flex gap-6 flex-wrap justify-center">
            {ui.pendingTravel.map((option) => (
              <TravelCardView
                key={option.id}
                option={option}
                onPick={() => engineRef.current?.travelTo(option.id as BiomeId)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Roguelite relic choice — a defeated boss's run-defining pick */}
      {ui.pendingRelics && !ui.gameOver && (
        <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center z-30 p-4">
          <div className="text-osrs-orange font-bold text-[1.4em] mb-1 text-center">Choose a Relic</div>
          <div className="text-[#cdbe91] text-[0.85em] mb-4 text-center">The boss falls — claim one run-long power</div>
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
          <div className="text-osrs-orange font-bold text-[1.4em] mb-1 text-center">
            {ui.draftBoosted ? 'Boss Spoils' : 'Draft a Reward'}
          </div>
          <div className="text-[#cdbe91] text-[0.85em] mb-4 text-center">
            {ui.draftBoosted
              ? 'Every relic is yours — the boss pays in rare cards instead. Keep one.'
              : 'Keep one card'}
          </div>
          {/* First-time coaching, shown right here while the cards are on the table
              (never after the fact). The overlay is modal, so this can't overlap
              anything happening on the board. Dismiss it or just pick a card. */}
          {!learnSeen.includes('draft') && (
            <div className="rs-panel-inset max-w-[36em] mb-4 px-[1.1em] py-[0.7em] text-center" style={{ fontSize: fs('clamp(12px, 0.8vw, 16px)') }}>
              <div className="text-osrs-orange font-bold text-[0.95em] mb-[0.3em] flex items-center justify-center gap-[0.35em]">
                <img src={ASSETS.misc.cards_icon} alt="" className="w-[1.2em] h-[1.2em] object-contain" onError={hideBrokenImg} />
                How reward cards work
              </div>
              <p className="text-[0.85em] text-[#d3c3a0] leading-snug mb-[0.55em]">
                Keep <b>one</b> card to snowball your build — potions, weapons and rule-changing boons.
                Hover a card to preview exactly what it does; duplicates stack. A card badged <b>NEW</b> is one
                you have never kept — it is missing from your Collection Log. Rolls are bought with gold
                and each one costs more, so spend against your towers. Beating a <b>boss</b> pays a <b>Relic</b>.
              </p>
              <button className="rs-btn px-[0.9em] py-[0.2em] text-[0.8em]" onClick={() => markTipSeen('draft')}>Got it ✓</button>
            </div>
          )}
          <div className="flex gap-6 flex-wrap justify-center">
            {ui.pendingDraft.map((card) => {
              const chosen = picking?.id === card.id;
              return (
                <div
                  key={card.id}
                  ref={(el) => { if (el) cardRefs.current.set(card.id, el); else cardRefs.current.delete(card.id); }}
                  className={picking ? (chosen ? 'draft-card-fly' : 'draft-card-vanish') : undefined}
                  style={chosen && picking
                    ? ({ '--fly-x': `${picking.dx}px`, '--fly-y': `${picking.dy}px`, '--fly-s': picking.scale } as React.CSSProperties)
                    : undefined}
                >
                  <DraftCardView
                    card={card}
                    large
                    unseen={!(ui.cardCounts[card.id] > 0)}
                    onPick={() => pickCard(card.id)}
                    ctx={{ runMods: ui.runMods, slayerPoints: ui.slayerPoints, essence: ui.essence, lives: ui.lives, maxLives: ui.maxLives }}
                  />
                </div>
              );
            })}
          </div>
          {/* Trickster relic: re-roll the hand while charges remain. Hidden once a
              pick is in flight — the hand is already on its way out. */}
          {ui.draftRerolls > 0 && !picking && (
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
              <GoStat icon={ASSETS.misc.compass} label="Survived" value={fmtTime(engineRef.current?.runSeconds ?? 0)} />
              {(engineRef.current?.seedsSown ?? 0) > 0 && (
                <>
                  <GoStat icon={ASSETS.misc.farming_icon} label="Seeds sown" value={fmt(engineRef.current?.seedsSown ?? 0)} />
                  <GoStat icon={SEED_BY_ID.guam.herbIcon} label="Herbs pulled" value={fmt(engineRef.current?.herbsHarvested ?? 0)} />
                </>
              )}
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
            <button className="rs-btn rs-btn-primary px-6 py-2 w-full" title="Start a fresh run" onClick={() => { clearRunSave(); setSavedRun(null); engineRef.current?.restart(); setRunStarted(false); }}>
              ▶ Play Again
            </button>
          </div>
        </div>
      )}

      {/* Victory — every scheduled boss felled. A full-stop screen (like game-over),
          not a MovablePanel: Continue pushes into Endless, New Run starts fresh.
          `won` latches true for the champion record and the Endless HP curve, so the
          screen is gated on `runPhase === 'normal'` too — Continue flips the phase to
          'endless', which dismisses this overlay and reveals the board playing on. */}
      {ui.won && ui.runPhase === 'normal' && ui.victory && (
        <div className="absolute inset-0 bg-black/70 flex items-center justify-center z-30 p-4 overflow-auto">
          <div className="rs-panel p-6 text-center w-[26em] max-w-full">
            <div className="rs-panel-title text-base">Victory</div>
            <p className="text-[0.78em] text-[#d3c3a0] mt-2 uppercase tracking-wider">
              {ui.victory.mode === 'roguelite' ? 'Roguelite run' : 'Classic run'}
            </p>
            <p className="text-osrs-yellow mt-1 mb-0 text-[1.7em] font-bold leading-none">
              Every boss felled
            </p>
            <p className="text-[0.8em] text-[#d3c3a0] mb-4 uppercase tracking-wide">
              cleared on wave {ui.victory.wave}
            </p>
            {caTitle && (
              <div
                className="flex items-center justify-center gap-[0.35em] text-[0.8em] text-osrs-yellow font-bold uppercase tracking-wide mb-3"
                title={`Combat Achievements — the ${CA_TIER_NAMES[caTitle]} tier cleared in full`}
              >
                <img src={ASSETS.achievements[caTitle]} alt="" className="w-[1.1em] h-[1.1em] object-contain" onError={hideBrokenImg} />
                {CA_TIER_NAMES[caTitle]}
              </div>
            )}
            <div className="grid grid-cols-2 gap-2 mb-4 text-[0.95em]">
              <GoStat icon={ASSETS.misc.multicombat_icon} label="Bosses" value={fmt(ui.victory.bosses)} />
              <GoStat icon={ASSETS.misc.compass} label="Cleared in" value={fmtTime(ui.victory.seconds)} />
              <GoStat icon={ASSETS.misc.attack_icon} label="Slain" value={fmt(engineRef.current?.kills ?? 0)} />
              <GoStat icon={ASSETS.misc.coins_icon} label="Earned" value={`${fmt(engineRef.current?.goldEarned ?? 0)} gp`} />
              {(engineRef.current?.seedsSown ?? 0) > 0 && (
                <>
                  <GoStat icon={ASSETS.misc.farming_icon} label="Seeds sown" value={fmt(engineRef.current?.seedsSown ?? 0)} />
                  <GoStat icon={SEED_BY_ID.guam.herbIcon} label="Herbs pulled" value={fmt(engineRef.current?.herbsHarvested ?? 0)} />
                </>
              )}
            </div>
            {/* Endless is a victory lap: the threat accelerates and the essence
                faucet drops to a tenth (see essenceMultiplier). Say so before the
                player commits, so the smaller reward isn't a surprise. */}
            <div className="flex items-center justify-center gap-[0.35em] text-[0.75em] text-[#d3c3a0] mb-2">
              <img src={ASSETS.misc.rune_essence_icon} alt="" className="w-[1em] h-[1em] object-contain" onError={hideBrokenImg} />
              Endless earns <span className="text-osrs-yellow font-bold">{essenceRateLabel(ui.victory.mode, 'endless')}</span> Rune Essence per wave
            </div>
            <button
              className="rs-btn rs-btn-primary px-6 py-2 w-full mb-2"
              title="Play on — the threat now accelerates, and essence drops to 10%"
              onClick={() => engineRef.current?.continueEndless()}
            >
              ▶ Continue (Endless)
            </button>
            <button
              className="rs-btn px-6 py-2 w-full"
              title="Start a fresh run"
              onClick={() => { clearRunSave(); setSavedRun(null); engineRef.current?.restart(); setRunStarted(false); }}
            >
              New Run
            </button>
          </div>
        </div>
      )}

      {/* Title / mode-select screen — gates the first wave of each run */}
      {!runStarted && !ui.gameOver && (
        <StartScreen
          mode={ui.gameMode}
          saved={savedRun}
          champion={victories.total > 0}
          wins={victories.total}
          caTitle={caTitle}
          difficulty={difficulty}
          selectedTier={selectedTier}
          onSelect={(m) => engineRef.current?.setMode(m)}
          onSelectTier={chooseTier}
          onStart={() => { clearRunSave(); setSavedRun(null); setRunStarted(true); }}
          onContinue={() => {
            if (!savedRun) return;
            // A run that was already won banked its win when it was won. The guard
            // ref is per-page-load, so seed it from the save — otherwise resuming an
            // Endless run would count the same victory again on every refresh.
            recordedWin.current = savedRun.won === true;
            engineRef.current?.loadRun(savedRun);
            setRunStarted(true);
          }}
          onDiscard={() => { clearRunSave(); setSavedRun(null); }}
          onHelp={() => setHelpOpen(true)}
          onSaveCode={() => setSaveCodeOpen(true)}
        />
      )}

      {/* How-to-play reference guide — top layer so it reads over the start screen too */}
      {helpOpen && <HowToPlay onClose={() => setHelpOpen(false)} onResetTips={resetTips} />}
      {feedbackOpen && <FeedbackModal ui={ui} onClose={() => setFeedbackOpen(false)} />}
      {saveCodeOpen && <SaveCodeModal onClose={() => setSaveCodeOpen(false)} />}

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
          uiScale={uiScale}
          onNudgeUiScale={(d) => setUiScale((v) => stepScale(v, d, maxUiScale))}
        />
      )}
      </div>{/* board — floating overlays anchor to the map, never the dock bar */}
      </div>{/* game area — the board, centred in whatever room it has */}

      {/* The docked main menu, along the very bottom of the screen. It is `relative`
          so its two pop-ups — the selected interface and the dock's hover tooltip —
          rise *out of* it and over the map, and only while they're wanted. Nothing
          but the bar itself is permanently on-screen.

          The bar's own height is constant (`em`, so it tracks the UI-scale control
          rather than its contents): a bar that grew or shrank mid-run would shrink
          the play area and letterbox the board. */}
      <div className="relative shrink-0 w-full" style={{ fontSize: fs('clamp(14px, 0.9vw, 19px)') }}>

        {/* The interface a stone has popped open: expands upward over the map, and
            closes when its stone is clicked again — or on a right-click anywhere on
            the panel (there is no ✕; the stone is the toggle). `key` re-mounts it on
            a switch so the fade/slide-in replays. Right-aligned beneath the stones
            that open it; scrolls internally when taller than the space allowed. */}
        {tab && (
        <div
          key={tab}
          ref={tabBodyRef}
          onContextMenu={(e) => { e.preventDefault(); setTab(null); }}
          className={`rs-panel rs-tab-body absolute bottom-full right-0 mb-[0.4em] z-20 w-[clamp(20em,34vw,30em)] max-h-[min(62vh,34em)] overflow-y-auto p-[0.6em] pr-[0.5em]${duckPanel ? ' rs-duck' : ''}`}
        >
        {/* ── HOME: wave control + Slayer task summary ── */}
        {tab === 'home' && (
        <>
        {/* The live wave's event is *not* repeated here: it already has a permanent
            home on the map (`WaveEventChip`, by the wave-event anchor), where it is
            visible without opening anything. This panel is the run's loadout — the
            things you chose and keep — so a wave-long twist was only ever a visitor. */}
        {!ui.gameOver && !ui.waveActive && (
          /* Mode is chosen on the StartScreen; here we only show the current
             mode as a small badge before each wave starts. The Start Wave
             button itself lives in the bar, beside the dock. */
          <div className="text-[0.7em] text-[#cdbe91] uppercase tracking-wide mb-[0.4em] text-center">
            Mode: <span className="text-osrs-orange font-bold">{ui.gameMode === 'roguelite' ? 'Roguelite' : 'Classic'}</span>
          </div>
        )}
        {/* Roguelite: cards are bought, not handed out — but only between waves. It
            stays visible during a wave, disabled with the reason, rather than
            vanishing (so its absence never reads as a bug). */}
        {!ui.gameOver && ui.gameMode === 'roguelite' && (
          <BuyCardRoll
            ui={ui}
            onBuy={() => engineRef.current?.buyCardRoll()}
            disabledReason={ui.waveActive ? 'Only between waves' : null}
          />
        )}

        {/* Roguelite loadout-at-a-glance: the run's claimed relics (one per boss
            beaten) above the rule-changing draft boons, so neither is forgotten. */}
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
              const preview = previewUpgradeValue(def, value);
              return (
                <HoverTip
                  key={def.id}
                  content={
                    <>
                      <span className="block">{def.desc}</span>
                      {preview && (
                        <span className="block text-[0.85em] text-[#7ce0ff] mt-[0.2em]">
                          {formatUpgradeValue(def, value)} → {preview}
                        </span>
                      )}
                    </>
                  }
                >
                  <button
                    onClick={() => engineRef.current?.buyEssenceUpgrade(def.id)}
                    disabled={maxed || !afford}
                    className={`rs-ge-row w-full flex items-center gap-[0.6em] p-[0.4em] text-left ${maxed || !afford ? 'rs-slot-unafford' : ''}`}
                  >
                    <img src={geIcon(def.icon)} alt="" className="w-[1.8em] h-[1.8em] object-contain shrink-0" onError={(e) => { (e.target as HTMLImageElement).style.visibility = 'hidden'; }} />
                    <span className="flex-1 min-w-0">
                      <span className="flex items-center gap-[0.4em]">
                        <span className="text-[#e7d9b0] truncate">{def.name}</span>
                        <span className="rs-ge-timer">{formatUpgradeValue(def, value)}</span>
                        {/* What the essence actually buys. Without it the row states a
                            price and a present tense, and the player only learns the
                            offer by accepting it. */}
                        {preview && (
                          <span className="flex items-center gap-[0.25em] whitespace-nowrap shrink-0">
                            <span className="text-[#9d8f70]">→</span>
                            <span className="rs-ge-timer">{preview}</span>
                          </span>
                        )}
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
                </HoverTip>
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
                <span className="flex items-center gap-[0.4em] min-w-0">
                  {/* The target's own baked sprite — the task reads as the monster
                      you are hunting, not just its name. */}
                  <span
                    className="w-[1.6em] h-[1.6em] shrink-0"
                    style={enemySpriteStyle(ui.slayerTask.type)}
                    aria-hidden
                  />
                  <span className="capitalize text-[#e7d9b0] truncate">{ui.slayerTask.name}</span>
                </span>
                <span className="text-osrs-yellow font-bold whitespace-nowrap">{ui.slayerTask.count}/{ui.slayerTask.total} left</span>
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
            <span className="flex items-center gap-[0.3em] text-[#7ce0ff] font-bold">
              <img src={ASSETS.misc.slayer_crossbow} alt="" className="w-[1.1em] h-[1.1em] object-contain" onError={hideBrokenImg} />
              {ui.slayerPoints}
            </span>
          </div>
          <div className="space-y-[0.4em] mt-[0.6em] pr-[0.2em]">
            {SLAYER_REWARDS.map((r) => {
              // The Slayer Helmet + its imbue are one two-stage row: buy the helm,
              // then the imbue opens in its place. So the (i) never renders on its own.
              if (r.id === 'helmet_i') return null;
              const isHelmet = r.id === 'helmet';
              const hasHelmet = ui.slayerUnlocks.includes('helmet');
              const hasImbue = ui.slayerUnlocks.includes('helmet_i');
              // Once the helm is owned (but not imbued), this row becomes the imbue.
              const imbueStage = isHelmet && hasHelmet && !hasImbue;
              const eff = imbueStage ? SLAYER_REWARDS.find((x) => x.id === 'helmet_i')! : r;
              // The helmet row is "owned" only when fully imbued (the final stage).
              const owned = isHelmet ? hasImbue : (!!r.once && ui.slayerUnlocks.includes(r.id));
              // The three task unlocks are dead with no task to act on. Say which,
              // rather than greying out mutely. (The helm row is never task-gated.)
              const locked = (eff.id === 'skip' || eff.id === 'block' || eff.id === 'extend' || eff.id === 'halve') && !ui.slayerTask
                ? 'No task yet'
                : null;
              const afford = ui.slayerPoints >= eff.cost;
              const disabled = owned || !!locked || !afford;
              return (
                <HoverTip key={r.id} content={locked ?? eff.desc}>
                  <button
                    onClick={() => engineRef.current?.buySlayerReward(eff.id)}
                    disabled={disabled}
                    className={`rs-ge-row w-full flex items-center gap-[0.6em] p-[0.4em] text-left ${disabled ? 'rs-slot-unafford' : ''}`}
                  >
                    <img src={geIcon(eff.icon)} alt="" className="w-[1.8em] h-[1.8em] object-contain shrink-0" onError={(e) => { (e.target as HTMLImageElement).style.visibility = 'hidden'; }} />
                    <span className="flex-1 min-w-0">
                      <span className="flex items-center gap-[0.4em]">
                        <span className="text-[#e7d9b0] truncate">{eff.name}</span>
                        {/* Buying the helm opens the imbue in the same row, with a green
                            before→after on the on-task bonus (the essence-shop pattern). */}
                        {imbueStage && (
                          <span className="flex items-center gap-[0.25em] whitespace-nowrap shrink-0 text-[0.82em]">
                            <span className="text-[#cdbe91]">+{Math.round(SLAYER_HELMET_BONUS * 100)}%</span>
                            <span className="text-[#9d8f70]">→</span>
                            <span className="text-osrs-green font-bold">+{Math.round(SLAYER_HELMET_IMBUED_BONUS * 100)}%</span>
                          </span>
                        )}
                      </span>
                      <span className="block text-[0.7em] text-[#d3c3a0] truncate">{locked ?? eff.desc}</span>
                    </span>
                    {owned ? (
                      <span className="text-osrs-green font-bold text-[0.7em] uppercase tracking-wide whitespace-nowrap">Owned</span>
                    ) : (
                      <span className="font-bold whitespace-nowrap" style={{ color: afford ? '#7ce0ff' : 'var(--osrs-red)' }}>
                        {eff.cost} pts
                      </span>
                    )}
                  </button>
                </HoverTip>
              );
            })}
          </div>
          {/* Blocked monsters are invisible otherwise — the player paid to retire them
              and would have no way to see, or remember, which. */}
          {ui.slayerBlocked.length > 0 && (
            <div className="mt-[0.6em] pt-[0.5em] border-t border-[var(--rs-keyline)] flex items-center gap-[0.4em] flex-wrap px-[0.2em]">
              <span className="text-[0.66em] uppercase tracking-wide text-[#b3a585]">Blocked</span>
              {ui.slayerBlocked.map((t) => (
                <span key={t} className="text-[0.7em] text-[#d3c3a0]" title={`${ENEMIES[t]?.name ?? t} is never assigned again this run`}>
                  {ENEMIES[t]?.name ?? t}
                </span>
              ))}
            </div>
          )}
          <p className="text-center text-[0.66em] text-[#b3a585] mt-[0.6em]">
            Earn points by completing Slayer tasks
          </p>
        </>
        )}

        {/* ── LOOT BAG (classic): every gear piece dropped this run, and the other
            half of the equip flow. The tower's own slot asks "which piece?"; a
            piece here asks "which tower?" — same picker, read from the other end,
            so neither question forces you to walk to the other panel. It lives on
            the first stone, the slot the roguelite gives its loadout. ── */}
        {tab === 'lootbag' && (() => {
          const towersOnBoard = engineRef.current?.towers ?? [];
          // Both filters default on: a deep run's bag fills with pieces nothing
          // wants, and every tower is listed for every piece. The useful answer is
          // the short list — the long one stays a click away.
          const shown = ui.lootBag
            .map((g, i) => ({ g, i }))
            .filter(({ g }) => !hideJunkGear || isUpgradeForAny(towersOnBoard, g));
          const hiddenCount = ui.lootBag.length - shown.length;
          return (
        <>
          <div className="rs-panel-title flex items-center gap-2">
            <img src={ASSETS.misc.loot_bag} alt="" className="w-[1.3em] h-[1.3em] object-contain" onError={hideBrokenImg} />
            Loot bag
          </div>
          {ui.lootBag.length === 0 ? (
            <div className="mt-[0.6em] px-[0.2em] text-[0.75em] text-[#8f8158] leading-relaxed">
              Empty. Monsters drop gear as they die — bosses drop the signature
              jewellery. Click a piece here, or a tower&apos;s own slot, to equip it.
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between gap-2 mt-[0.5em] px-[0.2em] text-[0.8em]">
                <span className="text-[#cdbe91] uppercase tracking-wide">Unequipped gear</span>
                <span className="text-osrs-yellow font-bold">
                  {hiddenCount > 0 ? `${shown.length}/${ui.lootBag.length}` : ui.lootBag.length}
                </span>
              </div>
              <label
                className="flex items-center gap-[0.4em] mt-[0.3em] px-[0.2em] text-[0.72em] text-[#d3c3a0] cursor-pointer select-none"
                title="Hide pieces that would not improve any tower on the board — either nothing can wear them, or what those towers already wear is better"
              >
                <input
                  type="checkbox"
                  className="rs-check"
                  checked={hideJunkGear}
                  onChange={(e) => setHideJunkGear(e.target.checked)}
                />
                Hide non-upgrades
                {hiddenCount > 0 && <span className="text-[#8a7c5c]">({hiddenCount} hidden)</span>}
              </label>
              {shown.length === 0 ? (
                <div className="mt-[0.5em] px-[0.2em] text-[0.72em] text-[#8f8158] leading-snug">
                  Nothing here would improve a tower on the board — wrong style, too
                  high a level, or beaten by what is already worn. Untick to see it all.
                </div>
              ) : (
                <div className="mt-[0.5em] flex flex-wrap gap-[0.3em]">
                  {/* `.rs-slot` is `width: 100%; aspect-ratio: 1`, so the size has to
                      come from a wrapper — same as the tower panel's gear slots. */}
                  {shown.map(({ g, i }) => (
                    <div key={i} className="w-[3em]">
                      <HoverTip content={gearTooltip(g)}>
                        <button
                          type="button"
                          aria-label={`Equip ${g.name}`}
                          onClick={() => setBagPick((cur) => (cur === i ? null : i))}
                          className={`rs-slot ${bagPick === i ? 'selected' : ''}`}
                          style={g.rarity === 'signature' && bagPick !== i
                            ? { borderColor: 'var(--osrs-yellow)' } : undefined}
                        >
                          <img src={GEAR_ICONS[g.id]} alt={g.name} onError={hideBrokenImg} />
                        </button>
                      </HoverTip>
                    </div>
                  ))}
                </div>
              )}

              {/* Which tower takes this piece. A tower whose level is too low is
                  listed but disabled, and one whose slot is full says what it
                  would replace (equipping swaps — the old piece falls back into
                  this bag). Hovering a row rings that tower on the board. Inline
                  rather than a floating dropdown: this panel scrolls, and
                  `overflow-y-auto` would clip one. */}
              {bagPick !== null && ui.lootBag[bagPick] && (() => {
                const g = ui.lootBag[bagPick]!;
                const slot: 'ammo' | 'jewellery' = g.type === 'ammo' ? 'ammo' : 'jewellery';
                const all = towersOnBoard
                  .map((t) => ({ t, check: canEquip(t, g), upgrade: isUpgradeFor(t, g) }))
                  .filter(({ check }) => check.ok || check.reason === 'level');
                // Best first: a free slot, then a real gain, then the ones listed
                // only so you can see why they are not worth it.
                const ordered = [...all].sort((a, b) => {
                  const rank = (x: typeof a) => (x.upgrade ? (x.t.equipment[slot] ? 1 : 0) : 2);
                  return rank(a) - rank(b) || towerListName(a.t).localeCompare(towerListName(b.t));
                });
                const towers = hideDowngrades ? ordered.filter((x) => x.upgrade) : ordered;
                const buried = ordered.length - towers.length;
                const hovered = towers.find(({ t }) => t.id === hoverTowerId)?.t;
                const worn = hovered?.equipment[slot];
                return (
                  <div className="mt-[0.5em] rs-panel-inset p-[0.5em]">
                    {/* The picked piece's stats stay on screen for as long as the
                        picker is open — the decision is "is this worth a slot?",
                        and you cannot answer it from a tooltip you have to keep
                        summoning. Hovering a tower that already wears something
                        turns the same block into the before/after of that swap. */}
                    <GearHeader item={g} note={worn ? `Replacing ${worn.name}` : undefined} />
                    {g.rarity === 'signature' && g.description && (
                      <p className="mt-[0.3em] text-[0.72em] text-[#c9b78c] leading-snug">{g.description}</p>
                    )}
                    <div className="mt-[0.35em]">
                      {worn ? <GearCompare from={worn} to={g} /> : <GearStats item={g} />}
                    </div>
                    <div className="flex items-center justify-between gap-2 mt-[0.45em] pt-[0.35em] border-t border-[var(--rs-keyline)]">
                      <span className="text-[0.68em] uppercase tracking-wide text-[#9d8f6a]">Equip on</span>
                      <label
                        className="flex items-center gap-[0.35em] text-[0.7em] text-[#d3c3a0] cursor-pointer select-none"
                        title="Hide towers this piece would not improve — a full slot with something better in it, or a level you have not reached"
                      >
                        <input
                          type="checkbox"
                          className="rs-check"
                          checked={hideDowngrades}
                          onChange={(e) => setHideDowngrades(e.target.checked)}
                        />
                        Hide downgrades
                        {buried > 0 && <span className="text-[#8a7c5c]">({buried})</span>}
                      </label>
                    </div>
                    {towers.length === 0 ? (
                      <div className="text-[0.7em] text-[#8a7c5c] px-[0.2em] py-[0.15em] leading-snug">
                        {ordered.length === 0
                          ? 'No tower on the board can take this piece.'
                          : 'No tower would gain from it. Untick the filter to equip it anyway.'}
                      </div>
                    ) : (
                      <div className="max-h-[12em] overflow-y-auto space-y-[0.1em] pr-[0.1em] mt-[0.25em]">
                        {towers.map(({ t, check, upgrade }) => {
                          const wornHere = t.equipment[slot];
                          const icon = t.type === 'wizard' ? wizardStaffUrl(t) : towerIcon(t.type);
                          return (
                            <button
                              key={t.id}
                              type="button"
                              disabled={!check.ok}
                              onMouseEnter={() => hoverTowerRow(t)}
                              onMouseLeave={() => hoverTowerRow(null)}
                              onFocus={() => hoverTowerRow(t)}
                              onBlur={() => hoverTowerRow(null)}
                              onClick={() => {
                                engineRef.current?.equipGear(t.id, g.id);
                                hoverTowerRow(null);
                                setBagPick(null);
                              }}
                              className={`w-full flex items-center gap-[0.4em] px-[0.3em] py-[0.25em] text-left text-[0.72em] ${
                                check.ok ? 'hover:bg-[#3a3122] text-[#d3c3a0]' : 'opacity-45 cursor-not-allowed text-[#d3c3a0]'
                              }`}
                            >
                              {icon && <img src={icon} alt="" className="w-[1.3em] h-[1.3em] object-contain shrink-0" onError={hideBrokenImg} />}
                              <span className="flex-1 truncate">{towerListName(t)}</span>
                              {!check.ok ? (
                                <span className="text-[0.9em] text-osrs-red whitespace-nowrap">Requires Lv {g.levelReq}</span>
                              ) : wornHere ? (
                                <span className={`flex items-center gap-[0.25em] text-[0.9em] whitespace-nowrap ${upgrade ? 'text-[#9d8f6a]' : 'text-[#6f6449]'}`}>
                                  {upgrade ? 'swaps' : 'worse'}
                                  <img src={GEAR_ICONS[wornHere.id]} alt={wornHere.name} title={wornHere.name} className="w-[1.1em] h-[1.1em] object-contain" onError={hideBrokenImg} />
                                </span>
                              ) : (
                                <span className="text-[0.9em] text-osrs-green whitespace-nowrap">empty</span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })()}
            </>
          )}
        </>
          );
        })()}

        {/* ── DPS: the damage meter, folded into the main panel as an interface
            tab (was a floating window). The tab body already scrolls, so a long
            tower list just scrolls in place. ── */}
        {tab === 'dps' && <DpsView snap={ui.dpsStats ?? null} onHoverTower={highlightTower} />}
        </div>
        )}

        {/* Placement hint, only while a tower is picked: it answers a question you
            just asked, then leaves. Suppressed while the dock tooltip is up —
            they'd stack in the same spot. */}
        {ui.selectedTowerType && !hoverShop && (
          <div className="rs-panel absolute bottom-full left-1/2 -translate-x-1/2 mb-[0.4em] px-[0.8em] py-[0.25em] z-10 pointer-events-none">
            <p className="text-[0.72em] text-[#d3c3a0] whitespace-nowrap">
              {ui.selectedTowerType === 'wizard'
                ? 'Click a tile to choose its spellbook there · right‑click to cancel'
                : 'Click the map to place · right‑click to cancel'}
            </p>
          </div>
        )}

        <footer
          ref={barRef}
          data-tut="sidebar"
          className="w-full rs-panel flex items-center gap-[0.45em] px-[0.6em]"
          style={{ height: '4.3em' }}
        >
          {/* One row built around the tower dock, which is centred on the bar itself
              - its middle is the bar's middle, on every screen. That is what the two
              halves are for: both are `flex-1 basis-0`, so the row hands them the same
              width whatever they hold, and the dock between them lands dead centre.
              Everything else arranges itself inside its own half: the run controls
              hold the far left, the gold pile ends the left half against the dock's
              prices, and the right half runs Start Wave -> vitals -> interface
              stones. */}
          <div data-half="" className="flex flex-1 min-w-0 items-center gap-[0.6em]">
            {/* Everything here is sized in `em` (no text-xs / px-2 rem classes) so
                the whole cluster tracks the bar's fs() font — i.e. the UI − / +
                control below actually resizes these buttons too. */}
            {/* `overflow-hidden` is load-bearing, not tidiness. This group is the only
                one in the bar that may shrink (`min-w-0`), and its children are all
                fixed-em: past ~120% interface size they used to spill out of it and
                paint straight over the gold pile. Clipping keeps the bar legible, and
                the one control you need to undo an over-large interface — the UI − / +
                below — is deliberately a sibling of this group rather than a child, so
                it is never the thing that gets cut off.

                It takes the left half's slack (`flex-1`) so its contents stay pinned to
                the bar's left edge and the gold pile ends up against the dock. */}
            <div data-tut="controls" className="flex flex-1 min-w-0 items-center gap-[0.25em] overflow-hidden">
              <button
                onClick={() => engineRef.current?.togglePause()}
                title={ui.paused ? 'Resume' : 'Pause'}
                disabled={ui.gameOver}
                className={`rs-btn px-[0.66em] py-[0.33em] text-[0.7em] mr-[0.33em] ${ui.paused ? 'rs-btn-primary' : ''}`}
              >
                {ui.paused ? '▶' : '⏸'}
              </button>
              <span className="text-[0.6em] text-[#d3c3a0] mr-[0.4em] uppercase tracking-wide">Speed</span>
              {([[1, 'Z'], [2, 'X'], [5, 'C']] as const).map(([s, key]) => (
                <button
                  key={s}
                  onClick={() => engineRef.current?.setGameSpeed(s)}
                  title={`Run the game at ${s}× speed (${key}, or step with < / >)`}
                  className={`rs-btn relative px-[0.66em] py-[0.33em] text-[0.7em] ${ui.gameSpeed === s ? 'rs-btn-primary' : ''}`}
                >
                  {s}×
                  <span className="rs-key">{key}</span>
                </button>
              ))}
              <button
                onClick={() => engineRef.current?.toggleMute()}
                title={ui.muted ? 'Unmute (M)' : 'Mute (M)'}
                className="rs-btn relative px-[0.66em] py-[0.33em] text-[0.7em] ml-[0.33em]"
              >
                {ui.muted ? '🔇' : '🔊'}
                <span className="rs-key">M</span>
              </button>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={ui.muted ? 0 : ui.volume}
                onChange={(e) => engineRef.current?.setVolume(Number(e.target.value))}
                title={`Volume ${Math.round(ui.volume * 100)}%`}
                className="rs-volume ml-[0.25em] w-[4.6em]"
                aria-label="Volume"
              />
              <span
                className="ml-[0.33em] text-[0.7em] text-osrs-orange tabular-nums w-[2.7em] text-right select-none"
                title="Current volume"
              >
                {ui.muted ? 'off' : `${Math.round(ui.volume * 100)}%`}
              </span>
            </div>

            {/* Global UI text-size nudge, on top of the viewport-adaptive base size.
                This is the only zoom the game offers — browser zoom is blocked. It sits
                OUTSIDE the clipping group above and never shrinks, because it is the way
                back from an interface scaled too large to fit: clipping the escape hatch
                would strand the player at 160%. */}
            <div data-tut="uiscale" className="shrink-0 flex items-center gap-[0.25em]">
              <span className="text-[0.6em] text-[#d3c3a0] ml-[0.4em] mr-[0.4em] uppercase tracking-wide select-none">UI</span>
              <button
                onClick={() => setUiScale((v) => stepScale(v, -1, maxUiScale))}
                disabled={uiScale <= UI_SCALE_MIN}
                title="Smaller interface"
                className="rs-btn px-[0.66em] py-[0.33em] text-[0.7em] disabled:opacity-40"
              >
                −
              </button>
              <span className="text-[0.7em] text-osrs-orange tabular-nums w-[3em] text-center select-none" title="Interface size">
                {Math.round(uiScale * 100)}%
              </span>
              <button
                onClick={() => setUiScale((v) => stepScale(v, 1, maxUiScale))}
                disabled={uiScale >= maxUiScale}
                title={uiScale >= maxUiScale && maxUiScale < UI_SCALE_MAX
                  ? 'This screen has no room for a larger interface — widen the window for more'
                  : 'Larger interface'}
                className="rs-btn px-[0.66em] py-[0.33em] text-[0.7em] disabled:opacity-40"
              >
                +
              </button>
            </div>

            <div className="rs-bar-sep" />

            {/* Tower shop — the one interface that is never a pop-up: it is wanted
                on nearly every click, so it lives in the bar itself. `relative`
                anchors its hover tooltip, which rises out of the bar over the map. */}
            {/* Gold, right where it is spent: against the dock's tier-1 prices.
                The pile grows with the purse the way it does in an OSRS inventory,
                so the amount reads at a glance — the same job `stackClass` does
                for the number's colour. */}
            <div
              className="shrink-0 flex items-center gap-[0.35em] pr-[0.5em]"
              title="Gold — spent on towers and upgrades"
            >
              <img src={coinsIcon(ui.money)} alt="" className="w-[1.5em] h-[1.5em] object-contain" onError={hideBrokenImg} />
              <span className={`${stackClass(ui.money)} font-bold tabular-nums text-[0.9em]`}>{fmt(ui.money)}</span>
            </div>

            {/* Two jobs, two tabs. A tower is built *beside* the road; a trap is
                laid *on* it. They share the dock rather than the bar, because the
                bar's height is fixed and a seventh stone would have to come out of
                the board. Each tab wears its skill's own OSRS icon — the
                Construction saw for the things you build, the Hunter paw for the
                things you lay — so the two halves read at a glance. One switch,
                not two stones: a pair of stacked `.rs-tab`s is 5em tall against a
                bar whose height is a fixed 4.3em, and they spilled over both its
                edges. The switch is shorter and carries the bigger icon.

                It ends the left half rather than riding inside the dock: the dock
                is centred on the bar, and anything sharing that box would push the
                slots off-centre by half its own width. Here it still sits against
                them — the row's gap is all that separates the two. */}
            <div className="shrink-0 rs-switch">
              <button
                onClick={() => { setBuildTab('towers'); engineRef.current?.selectTrapType(null); }}
                title="Towers — built beside the road"
                className={`rs-switch-seg ${buildTab === 'towers' ? 'rs-switch-on' : ''}`}
              >
                <img src={ASSETS.misc.construction_icon} alt="Towers" onError={hideBrokenImg} />
                {ui.towersOnBoard > 0 && <span className="rs-tab-badge">{ui.towersOnBoard}</span>}
              </button>
              <button
                onClick={() => { setBuildTab('traps'); engineRef.current?.selectTowerType(null); }}
                title="Hunter traps — laid on the road itself, between waves"
                className={`rs-switch-seg ${buildTab === 'traps' ? 'rs-switch-on' : ''}`}
              >
                <img src={ASSETS.misc.hunter_icon} alt="Traps" onError={hideBrokenImg} />
                {ui.traps.length > 0 && <span className="rs-tab-badge">{ui.traps.length}</span>}
              </button>
            </div>
          </div>

          {/* The bar's centrepiece, and the only child of the row that is neither
              half: the slots themselves, and nothing else. Whatever the two halves
              hold, this box sits in the middle — which is why the switch beside it
              lives in the left half instead. The slots
              hold the same spot on the bar in either tab, and the row's gap is all
              that separates them from either. */}
          <div className="relative shrink-0">
              {hoverTrap && (() => {
                const def = HUNTER_TRAP_BY_ID[hoverTrap];
                const locked = ui.hunterLevel < def.level;
                // A trap that hurts says how hard, the way a tower does: the flat
                // part plus the share of the target's own health, and the max hit
                // that caps them both.
                const blast = blastProfile(def, ui.wave);
                return (
                  <div
                    className="rs-panel absolute bottom-full left-1/2 -translate-x-1/2 mb-3 p-2 w-[16em] z-30 pointer-events-none"
                    style={{ fontSize: fs('clamp(13px, 0.85vw, 17px)') }}
                  >
                    <div className="rs-panel-title flex items-center gap-2" style={{ fontSize: '1em' }}>
                      <img src={def.sprite} alt="" className="w-[1.3em] h-[1.3em] object-contain" onError={hideBrokenImg} />
                      <span className="truncate">{def.name}</span>
                    </div>
                    {/* The trap's signature, read exactly like a tower's: what it is
                        good at, named, with the OSRS icon for that thing. */}
                    <div className="mt-[0.35em] px-[0.1em]">
                      <span className="flex items-center gap-[0.3em]">
                        <img src={def.signature.icon} alt="" className="w-[1em] h-[1em] object-contain" onError={hideBrokenImg} />
                        <span className="text-[0.66em] uppercase tracking-wide text-osrs-orange">{def.signature.label}</span>
                      </span>
                      <p className="text-[0.76em] text-[#cdbe91] leading-snug mt-[0.1em]">{def.tip}</p>
                    </div>
                    <div className="space-y-[0.3em] mt-[0.45em] pt-[0.4em] px-[0.1em] border-t border-[var(--rs-keyline)]">
                      <Stat icon={ASSETS.misc.hunter_icon} label="Hunter level" value={String(def.level)} />
                      <Stat icon={ASSETS.misc.attack_icon} label="Charges" value={String(def.charges)} />
                      {def.kind === 'snare' && <Stat icon={ASSETS.debuffs.stun} label="Holds for" value={`${def.hold}s`} />}
                      {def.kind === 'catch' && <Stat icon={ASSETS.misc.hp_icon} label="Takes under" value={`${Math.round(def.catchAt * 100)}% HP`} />}
                      {def.kind === 'blast' && <Stat icon={ASSETS.misc.multicombat_icon} label="Blast" value={`${Math.round(def.radius / TILE_PX)} tiles`} />}
                      {blast && <Stat icon={ASSETS.misc.strength_icon} label="Damage" value={`${blast.flat} + ${Math.round(blast.share * 100)}% HP`} />}
                      {blast && <Stat icon={ASSETS.misc.hp_icon} label="Max hit" value={String(blast.cap)} />}
                      <Stat icon={ASSETS.misc.coins_icon} label="Cost" value={`${fmt(trapCost(def, ui.wave))} gp`} />
                      {/* How many the current level allows. It used to sit under the
                          dock as a standing counter, where it shifted the bar every
                          time the player switched tabs; it belongs with the trap it
                          is limiting, and it is only a question while laying one.
                          It counts EVERY trap on the road, not this kind of trap — so
                          it wears the Hunter paw, never the hovered trap's own sprite,
                          which read as "how many box traps are out". */}
                      <Stat icon={ASSETS.misc.hunter_icon} label="Traps on road" value={`${ui.traps.length}/${ui.maxTraps}`} />
                    </div>
                    {/* The skill, read the way every other level in the game is: the
                        number above the bar it fills. It rode the dock's sixth slot
                        before, which cost the trap row the symmetry it shares with
                        the tower shop \u2014 here it is on screen exactly when a trap is
                        under the pointer, which is when the level matters. */}
                    <div className="mt-[0.45em] pt-[0.4em] px-[0.1em] border-t border-[var(--rs-keyline)]">
                      <div className="flex items-center justify-between text-[0.72em] mb-[0.2em]">
                        <span className="flex items-center gap-[0.3em] text-[#cdbe91] uppercase tracking-wide">
                          <img src={ASSETS.misc.hunter_icon} alt="" className="w-[1.1em] h-[1.1em] object-contain" onError={hideBrokenImg} />
                          Hunter
                        </span>
                        <span className="text-osrs-orange font-bold tabular-nums">{ui.hunterLevel}</span>
                      </div>
                      <div className="rs-progress">
                        <div
                          className="rs-progress-fill"
                          style={{ width: `${Math.min(100, (ui.hunterXp / Math.max(1, ui.hunterXpNeeded)) * 100)}%` }}
                        />
                      </div>
                      <div className="flex items-center justify-end text-[0.6em] text-[#b3a585] tabular-nums mt-[0.15em]">
                        {ui.hunterLevel >= 99 ? 'MAX' : `${ui.hunterXp}/${ui.hunterXpNeeded} XP`}
                      </div>
                    </div>
                    <p className="text-[0.7em] text-[#b3a585] leading-snug mt-[0.4em] pt-[0.35em] px-[0.1em] border-t border-[var(--rs-keyline)]">
                      {locked
                        ? `Hunter ${def.level} unlocks this. The skill levels every time a trap of yours goes off.`
                        : 'Laid on the road between waves, and picked back up with a click. Enemies walk over it \u2014 it never blocks the way.'}
                    </p>
                  </div>
                );
              })()}
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
                    className="rs-panel absolute bottom-full left-1/2 -translate-x-1/2 mb-3 p-2 w-[16em] z-30 pointer-events-none"
                    style={{ fontSize: fs('clamp(13px, 0.85vw, 17px)') }}
                  >
                    <div className="rs-panel-title flex items-center gap-2" style={{ fontSize: '1em' }}>
                      {icon && <img src={icon} alt="" className="w-[1.3em] h-[1.3em] object-contain" />}
                      <span className="truncate">{title}</span>
                    </div>
                    {sig && (
                      <div className="mt-[0.35em] px-[0.1em]">
                        <span className="flex items-center gap-[0.3em]">
                          <img src={sig.icon} alt="" className="w-[1em] h-[1em] object-contain" onError={hideBrokenImg} />
                          <span className="text-[0.66em] uppercase tracking-wide text-osrs-orange">{sig.label}</span>
                        </span>
                        <p className="text-[0.76em] text-[#cdbe91] leading-snug mt-[0.1em]">{sig.desc}</p>
                      </div>
                    )}
                    <div className="space-y-[0.3em] mt-[0.45em] pt-[0.4em] px-[0.1em] border-t border-[var(--rs-keyline)]">
                      <Stat icon={combat.icon} label={`Damage (${combat.label})`} value={dmg} />
                      <Stat icon={ASSETS.misc.attack_icon} label="Attack speed" value={attackSpeed(t0.cooldown)} />
                      <Stat icon={ASSETS.misc.multicombat_icon} label="Range" value={`${Math.round(t0.range / TILE_PX)} tiles`} />
                      <Stat icon={ASSETS.misc.coins_icon} label="Cost" value={`${fmt(ui.towerPrices[hoverShop])} gp`} />
                    </div>
                    {/* What this tower can be forged into, before either half is on
                        the board. It belongs here because this is where the plot is
                        bought: "is a Toxic worth a slot?" is answered by what it makes
                        later, and until now the recipe was invisible unless the player
                        happened to stand the right two towers next to each other. */}
                    {fusionRecipesFor(hoverShop).length > 0 && (
                      <div className="mt-[0.45em] pt-[0.4em] px-[0.1em] border-t border-[var(--rs-keyline)]">
                        <span className="flex items-center gap-[0.3em]">
                          <img src={ASSETS.misc.skill_smithing} alt="" className="w-[1em] h-[1em] object-contain" onError={hideBrokenImg} />
                          <span className="text-[0.66em] uppercase tracking-wide text-osrs-orange">Forge</span>
                        </span>
                        {fusionRecipesFor(hoverShop).map((r) => (
                          <div key={r.def.type} className="flex items-center gap-[0.3em] mt-[0.2em]" title={r.def.blurb}>
                            <img src={towerIcon(r.partner)} alt="" className="w-[1.1em] h-[1.1em] object-contain" onError={hideBrokenImg} />
                            <span className="text-[0.72em] text-[#cdbe91]">{TOWERS[r.partner]?.baseName ?? r.partner}</span>
                            <span className="text-[0.72em] text-[#b3a585]">&rarr;</span>
                            <img src={towerIcon(r.def.type)} alt="" className="w-[1.1em] h-[1.1em] object-contain" onError={hideBrokenImg} />
                            <span className="text-[0.72em] text-[#cdbe91] truncate">{r.def.name}</span>
                          </div>
                        ))}
                        <p className="text-[0.7em] text-[#b3a585] leading-snug mt-[0.3em]">
                          {ui.achievements.includes(FUSION_UNLOCK_CA)
                            ? 'Both fully upgraded and side by side.'
                            : FUSION_BLOCK_TEXT.locked}
                        </p>
                      </div>
                    )}
                    {/* The price is only worth explaining once it has moved: a dock that
                        quotes a number the player has watched climb, without saying why,
                        reads as a bug. Shown only when this type is dearer than its base. */}
                    {ui.towerPrices[hoverShop] > TOWERS[hoverShop].tiers[0].upgradeCost * ui.upgrades.towerCostReduction && (
                      <p className="text-[0.7em] text-[#b3a585] leading-snug mt-[0.4em] pt-[0.35em] px-[0.1em] border-t border-[var(--rs-keyline)]">
                        Each one of a type costs 15% more than the last. Another kind of
                        tower starts back at its base price — and selling one brings this
                        one down again.
                      </p>
                    )}
                  </div>
                );
              })()}
                <div data-tut="dock" className="grid grid-cols-6 gap-[0.3em] w-[17.5em]">
                {buildTab === 'towers' ? TOWER_ORDER.map((type, i) => {
                  const cost = ui.towerPrices[type];
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
                        <span className="text-[0.6em] capitalize">{TOWERS[type].baseName}</span>
                      )}
                      {/* The slot's hotkey, so the number row is discoverable without the guide. */}
                      <span className="rs-slot-key">{i + 1}</span>
                      <span className="rs-slot-cost" style={{ color: afford ? 'var(--osrs-yellow)' : 'var(--osrs-red)' }}>{cost}</span>
                    </button>
                  );
                }) : (
                  /* Five traps in a six-wide dock: the row lines up slot-for-slot
                     with the tower shop above it, and the spare cell stays empty
                     rather than being filled with something that isn't a purchase.
                     The Hunter level and the trap allowance both moved into a
                     trap's hover panel — see it there. */
                  HUNTER_TRAPS.map((def, i) => {
                      const locked = ui.hunterLevel < def.level;
                      const cost = trapCost(def, ui.wave);
                      const afford = ui.money >= cost;
                      const active = ui.selectedTrapId === def.id;
                      const full = ui.traps.length >= ui.maxTraps;
                      return (
                        <button
                          key={def.id}
                          onClick={() => engineRef.current?.selectTrapType(active ? null : def.id)}
                          onMouseEnter={() => setHoverTrap(def.id)}
                          onMouseLeave={() => setHoverTrap((h) => (h === def.id ? null : h))}
                          disabled={ui.waveActive}
                          className={`rs-slot ${active ? 'selected' : ''} ${locked || !afford || full ? 'rs-slot-unafford' : ''} disabled:opacity-40`}
                        >
                          <img src={def.sprite} alt={def.name} onError={hideBrokenImg} />
                          <span className="rs-slot-key">{i + 1}</span>
                          {/* A locked trap shows the level it wants rather than its price:
                              the price is not what is stopping the player. */}
                          <span
                            className="rs-slot-cost"
                            style={{ color: !locked && afford ? 'var(--osrs-yellow)' : 'var(--osrs-red)' }}
                          >
                            {locked ? `L${def.level}` : cost}
                          </span>
                        </button>
                      );
                  })
                )}
                </div>{/* build dock */}
          </div>

          <div data-half="" className="flex flex-1 min-w-0 items-center gap-[0.6em]">
            <div className="rs-bar-sep" />

            {/* Sending the wave sits next to the towers you spend the gap building.
                Everything here keeps a fixed footprint — the button stays mounted
                (disabled) mid-wave and the seconds field never wraps, because a
                bar that changed height would shrink the board, whose resolution is
                fixed at birth. */}
            <div className="shrink-0 flex items-center gap-[0.45em]">
              <button
                data-tut="startwave"
                onClick={() => engineRef.current?.startWave()}
                disabled={ui.waveActive || ui.gameOver}
                title={ui.waveActive ? 'A wave is already on the field' : 'Send the next wave (Space)'}
                className={`rs-btn relative px-[0.66em] pr-[2.4em] py-[0.33em] text-[0.7em] whitespace-nowrap disabled:opacity-40 ${ui.waveActive || ui.gameOver ? '' : 'rs-btn-primary animate-pulse'}`}
              >
                ▶ Start Wave <span className="tabular-nums">{ui.wave}</span>
                {/* The only multi-character key, so it needs the reserved right
                    padding above — everything else fits in the default padding. */}
                <span className="rs-key">SPACE</span>
              </button>
              <label
                className="flex items-center gap-[0.3em] text-[0.6em] text-[#d3c3a0] uppercase tracking-wide cursor-pointer select-none"
                title="Automatically start the next wave once the field is clear (waits on a pending draft or fork in the road)"
              >
                <input
                  type="checkbox"
                  className="rs-check text-[1.15em]"
                  checked={ui.autoplay}
                  onChange={(e) => {
                    engineRef.current?.setAutoplay(e.target.checked);
                  }}
                />
                Auto
              </label>
              <span
                className={`flex items-center gap-[0.25em] text-[0.6em] ${ui.autoplay ? 'text-[#d3c3a0]' : 'text-[#8b8069]'}`}
                title="Seconds to wait, once the field is clear, before the next wave starts"
              >
                <input
                  type="number"
                  min={1}
                  max={60}
                  step={1}
                  value={ui.autoplaySecs}
                  disabled={!ui.autoplay}
                  onChange={(e) => {
                    const v = Math.min(60, Math.max(1, Math.floor(Number(e.target.value))));
                    if (!Number.isFinite(v)) return; // mid-edit empty field
                    engineRef.current?.setAutoplaySecs(v);
                    try { localStorage.setItem('ui_autostart_secs', String(v)); } catch { /* ignore */ }
                  }}
                  className="rs-num w-[2.6em] text-[1.15em]"
                  aria-label="Auto-start delay in seconds"
                />
                s
              </span>
            </div>

            <div className="rs-bar-sep" />

            {/* Interface stones, ordered by how often a run reaches for them:
                loadout and DPS (read mid-run), then the two shops, then the log
                and the two links out. Debug has no stone — it is Ctrl+' only. */}
            {/* The outer group takes what the right half has left over; the inner one
                hugs the stones themselves, so the tutorial's ring lands on the buttons
                instead of on the empty stretch beside them. */}
            <div className="flex flex-1 items-center justify-end gap-[0.5em]">
            {/* The run's vitals. They used to be minimap orbs pinned to the board's
                top-right corner, where they floated over whatever the map put under
                them; here they sit in the one interface that never covers the board,
                and in `em` like the rest of the bar so the UI - / + control resizes
                them. Only the two that are a share of something are here: lives and
                prayer, each with its hairline gauge. The wave number is not — the
                Start Wave button a few steps to the left already carries it, and it
                stays mounted (only disabled) while a wave is on the field, so the
                count never goes away. Gold is not here either: it is read while
                shopping, so it stays beside the dock, against the prices.

                The stretch between Start Wave and the interface stones is theirs, and
                they fill it: the two gauges divide it in half and grow into their
                share, so a fraction is read off a bar the width of a thumb rather than
                a hairline. Nothing else wants that room - every other group in the bar
                has a fixed footprint.

                That stretching is invisible to `maxUiScale` in the worst way: a gauge
                reports whatever width it was handed, so measuring it would let the
                interface grow forever. The wrapper is marked `data-fit="min"` instead
                - what this section actually needs is its `min-w-`, the width at which
                the two numbers still read - and that is what the estimator counts. */}
            <div data-fit="min" className="flex flex-1 items-center min-w-[7em]">
              <div data-tut="hud" className="flex flex-1 items-center gap-[0.6em]">
              <div className="relative flex-1 min-w-0">
                <div key={ui.lifestealSeq} className={ui.lifestealSeq > 0 ? 'rs-vital-blip' : undefined}>
                  <Vital
                    icon={ASSETS.misc.orb_hitpoints}
                    orb={ASSETS.misc.orb_background}
                    title="Lives"
                    value={ui.lives}
                    valueColor={ui.lives <= 5 ? '#ff4b4b' : undefined}
                    fill={ui.lives / ui.maxLives}
                    fillColor="linear-gradient(90deg, #8a0000, #e23a3a)"
                    orbColor="linear-gradient(180deg, #e23a3a, #8a0000)"
                    wide
                  />
                </div>
                {ui.lifestealSeq > 0 && (
                  <span key={`h${ui.lifestealSeq}`} className="rs-lifesteal-pop" aria-hidden>
                    ❤ +1
                  </span>
                )}
              </div>
              <Vital
                icon={ASSETS.misc.orb_prayer}
                orb={ASSETS.misc.orb_background}
                title="Prayer"
                value={ui.prayerPoints}
                fill={ui.prayerFrac}
                fillColor="linear-gradient(90deg, #1f5fa8, #6db3f2)"
                orbColor="linear-gradient(180deg, #6db3f2, #1f5fa8)"
                wide
              />
              </div>
            </div>

            <div className="rs-bar-sep" />

            <div data-tut="stones" className="flex items-center gap-[0.4em]">
              {/* First stone, one per mode: the roguelite's loadout (relics + boons)
                  or classic's loot bag. Classic drafts nothing and the roguelite
                  drops no gear, so neither stone is ever shown over an empty panel. */}
              {ui.gameMode === 'roguelite' ? (
                <button ref={boonsTabRef} onClick={() => onSideTab('home')} title="Run loadout — relics and boons" className={`rs-tab ${tab === 'home' ? 'rs-tab-on' : ''}`}>
                  <img src={ASSETS.misc.cards_icon} alt="Run loadout" onError={hideBrokenImg} />
                </button>
              ) : (
                <button onClick={() => onSideTab('lootbag')} title="Loot bag — gear dropped this run" className={`rs-tab ${tab === 'lootbag' ? 'rs-tab-on' : ''}`}>
                  <img src={ASSETS.misc.loot_bag} alt="Loot bag" onError={hideBrokenImg} />
                  {ui.lootBag.length > 0 && <span className="rs-tab-badge">{ui.lootBag.length}</span>}
                </button>
              )}
              <button onClick={() => onSideTab('dps')} title="DPS meter — damage dealt per tower, by wave" className={`rs-tab ${tab === 'dps' ? 'rs-tab-on' : ''}`}>
                <img src={ASSETS.misc.stats_icon} alt="DPS meter" onError={hideBrokenImg} />
              </button>
              <button data-tut="slayer" onClick={() => onSideTab('slayer')} title="Slayer Rewards" className={`rs-tab ${tab === 'slayer' ? 'rs-tab-on' : ''}`}>
                <img src={ASSETS.misc.slayer_crossbow} alt="Slayer Rewards" onError={hideBrokenImg} />
                <span className="rs-tab-badge">{ui.slayerPoints}</span>
              </button>
              <button data-tut="essence" onClick={() => onSideTab('essence')} title="Essence Shop — permanent upgrades" className={`rs-tab ${tab === 'essence' ? 'rs-tab-on' : ''}`}>
                <img src={ASSETS.misc.rune_essence_icon} alt="Essence Shop" onError={hideBrokenImg} />
                <span className="rs-tab-badge">{fmt(ui.essence)}</span>
              </button>
              <button onClick={() => setLogOpen((o) => !o)} title="Collection Log" className={`rs-tab ${logOpen ? 'rs-tab-on' : ''}`}>
                <img src={iconUrl('Collection_log')} alt="Collection Log" onError={hideBrokenImg} />
              </button>
              {FEEDBACK_ENABLED && (
                <button onClick={() => setFeedbackOpen(true)} title="Send feedback, or join the Discord" className={`rs-tab text-[1.15em] ${feedbackOpen ? 'rs-tab-on' : ''}`}>
                  💬
                </button>
              )}
              <button data-tut="help" onClick={() => setHelpOpen(true)} title="How to Play" className={`rs-tab text-[1.15em] ${helpOpen ? 'rs-tab-on' : ''}`}>
                ❓
              </button>
            </div>
            </div>
          </div>
        </footer>
      </div>{/* bottom bar */}
    </div>
  );
}

