'use client';

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { GameEngine, type UIState, type EnemyHoverInfo, type DebuffId, type UnlockItem, type GameMode } from '@/lib/game/core/engine';
import type { DraftCard, DraftRarity } from '@/lib/game/systems/roguelite-draft';
import { TOWERS, TOWER_STYLES } from '@/lib/game/data/towers';
import { utilityAuraBonus, diminishingSum } from '@/lib/game/systems/tower-combat';
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
  venom: { label: 'Envenomed', icon: ASSETS.debuffs.poison, color: '#0b5c0b', desc: 'Taking venom damage that ramps the longer it stacks' },
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
  remaining: 0, waveTotal: 0, bossWave: false, bossOnField: false, gameOver: false, selectedTowerType: null, selectedTowerId: null,
  movingTowerId: null, pendingPlacement: null, pendingMageMode: 'elemental', gameSpeed: 1, paused: false, muted: false, volume: 0.135,
  notice: null, noticeIcon: null, noticeSeq: 0,
  slayerTask: null, slayerPoints: 0, slayerStreak: 0, slayerMaster: 'Turael', slayerHelmet: false,
  prayerPoints: 10, prayerMax: 10, activePrayers: [],
  geOffers: [],
  essence: 0, upgrades: { ...DEFAULT_UPGRADES },
  unlocks: [], unlockSeq: 0,
  killCounts: {},
  lastWaveSandbox: false,
  gameMode: 'classic', pendingDraft: null, runMods: { damage: 1, range: 1, fireRate: 1 },
};

/** Title shown above an unlock's name in the collection-log popup, per kind. */
const UNLOCK_LABEL: Record<UnlockItem['kind'], string> = { prayer: 'Prayer Unlocked' };

const SAVE_KEYS = { essence: 'osrs_td_essence', upgrades: 'osrs_td_upgrades', killCounts: 'osrs_td_killcounts' } as const;

/** Read the persisted account save (meta-progression + Collection Log) from
 *  localStorage, tolerating absent/corrupt data — the engine re-clamps it. */
function loadSave(): { essence: number; upgrades: unknown; killCounts: unknown } {
  if (typeof window === 'undefined') return { essence: 0, upgrades: undefined, killCounts: undefined };
  let essence = 0;
  let upgrades: unknown;
  let killCounts: unknown;
  try { essence = parseInt(localStorage.getItem(SAVE_KEYS.essence) ?? '0', 10) || 0; } catch { /* ignore */ }
  try { upgrades = JSON.parse(localStorage.getItem(SAVE_KEYS.upgrades) ?? 'null'); } catch { /* ignore */ }
  try { killCounts = JSON.parse(localStorage.getItem(SAVE_KEYS.killCounts) ?? 'null'); } catch { /* ignore */ }
  return { essence, upgrades, killCounts };
}

const prayerIcon = (id: PrayerType) => (ASSETS.prayers as Record<string, string>)[id];
/** Wiki sprite URL for a GE offer (its `wiki` filename + .png). */
const geIcon = (wiki: string) => `${ASSETS.misc.wiki_base}${wiki}.png`;

/** Collection Log roster, split into the Bosses / Monsters tabs (computed once). */
const LOG_ENTRIES = Object.entries(ENEMIES).map(([type, def]) => ({ type, name: def.name, isBoss: !!def.isBoss }));
const BOSS_ENTRIES = LOG_ENTRIES.filter((e) => e.isBoss);
const MONSTER_ENTRIES = LOG_ENTRIES.filter((e) => !e.isBoss);

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
  // Bottom-right sidebar: which interface tab fills the panel body. The compact
  // shop-style interfaces (Home/towers, GE, Essence, Slayer Rewards) swap inline;
  // Collection Log and Debug still pop out their own larger windows.
  const [tab, setTab] = useState<SideTab>('home');
  const [logOpen, setLogOpen] = useState(false);
  const [logTab, setLogTab] = useState<'bosses' | 'monsters'>('monsters');
  const [debugOpen, setDebugOpen] = useState(false);
  // Minimize state for the prayer bar (collapses to the best prayer per style).
  const [prayersMin, setPrayersMin] = useState(() => loadBool('ui_min_prayers', false));
  useEffect(() => { try { localStorage.setItem('ui_min_prayers', JSON.stringify(prayersMin)); } catch { /* ignore */ } }, [prayersMin]);
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
  }, [toLogic]);

  const onClick = useCallback((e: React.MouseEvent) => {
    const { x, y } = toLogic(e.clientX, e.clientY);
    engineRef.current?.handleClick(x, y);
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
    rows.push({
      label: 'Range',
      from: `${Math.round(selectedTower.range / TILE_PX)}`,
      to: `${Math.round(next.range / TILE_PX)} tiles`,
      buffed: rangeMul !== 1 ? `${Math.round((next.range * rangeMul) / TILE_PX)} tiles` : undefined,
    });
    rows.push({
      label: 'Attack speed',
      from: attackSpeed(selectedTower.cooldown),
      to: attackSpeed(next.cooldown),
      buffed: cdMul !== 1 ? attackSpeed(next.cooldown * cdMul) : undefined,
    });
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
        className="absolute inset-0 w-full h-full block cursor-crosshair touch-none"
        style={{ imageRendering: 'pixelated' }}
        onMouseMove={onMove}
        onClick={onClick}
        onContextMenu={onContextMenu}
      />

      {/* Enemy info — pinned by a click (stays until you click elsewhere) or else
          following the hovered enemy. Positioned in pixels and clamped by the
          panel's measured size so it is never clipped, on any edge. */}
      {enemyPanel && (() => {
        const { info, pinned } = enemyPanel;
        const ratio = Math.max(0, info.hp / info.maxHp);
        const wk = info.weakness ? ELEMENTS[info.weakness as keyof typeof ELEMENTS] : null;
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
              style={{ fontSize: 'clamp(13px, 0.9vw, 18px)' }}
            >
              <div className="flex items-center justify-between gap-2 mb-[0.3em]">
                <span className="text-osrs-orange font-bold truncate">{info.name}</span>
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
                <span className="text-right text-white">{info.speed}{info.speed !== info.baseSpeed ? ` (${info.baseSpeed})` : ''}</span>
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
          <div className="rs-panel p-[0.7em]" style={{ fontSize: 'clamp(14px, 1vw, 20px)' }}>
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
          <div className="rs-panel p-2" style={{ fontSize: 'clamp(12px, 0.85vw, 17px)' }}>
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

      {/* Always-on buff infoboxes (RuneLite-style): icon + remaining seconds.
          Timers pause between waves, so this doubles as a "ready to pull" cue. */}
      {activeInfoboxes.length > 0 && (
        <div
          className="absolute left-1/2 -translate-x-1/2 z-10 flex gap-[0.4em] pointer-events-none transition-[top] duration-300"
          // Drop below the boss HP bar while a boss is alive, so the bar stays topmost.
          style={{ top: ui.bossOnField ? '4.5rem' : '0.5rem' }}
        >
          {activeInfoboxes.map((o) => (
            <div key={o.id} className="rs-infobox" title={`${o.name} — ${o.desc} · ${o.activeSecs}s left`}>
              <img src={geIcon(o.wiki)} alt={o.name} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
              <span className="rs-infobox-time">{o.activeSecs}</span>
            </div>
          ))}
        </div>
      )}

      {/* Top-right data-orb cluster (OSRS minimap-orb style) */}
      <div className="absolute top-4 right-4 flex flex-col gap-2 z-10 items-end">
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
          style={{ fontSize: 'clamp(13px, 0.92vw, 19px)' }}
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
            <Stat
              icon={TOWER_COMBAT[selectedTower.type].icon}
              label={`Damage (${TOWER_COMBAT[selectedTower.type].label})`}
              value={dmgNode}
            />
            <Stat icon={ASSETS.misc.attack_icon} label="Attack speed" value={speedNode} />
            <Stat label="Range" value={rangeNode} />
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
                <div className="relative">
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
                    </div>
                  )}
                  <button
                    className="rs-btn w-full flex items-center justify-center gap-[0.3em] px-[0.4em] py-[0.45em]"
                    title={`Upgrade to next tier for ${selectedTower.upgradeCost} gp`}
                    disabled={ui.money < selectedTower.upgradeCost}
                    onMouseEnter={() => setUpgradeHover(true)}
                    onMouseLeave={() => setUpgradeHover(false)}
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
        style={{ fontSize: 'clamp(13px, 0.9vw, 18px)', maxHeight: '92vh' }}
      >
        {/* OSRS sidebar tab strip: each stone selects an interface (or pops one
            out). Icons + tooltips, with live badges for essence / Slayer points. */}
        <div
          className="shrink-0 flex items-center justify-center gap-[0.4em] pb-[0.55em] mb-[0.6em] border-b border-[var(--rs-keyline)]"
          style={{ boxShadow: '0 1px 0 0 var(--rs-bevel-light)' }}
        >
          <button onClick={() => setTab('home')} title="Towers &amp; Wave" className={`rs-tab ${tab === 'home' ? 'rs-tab-on' : ''}`}>
            <img src={ASSETS.misc.multicombat_icon} alt="Towers &amp; Wave" onError={hideBrokenImg} />
          </button>
          <button onClick={() => setTab('ge')} title="Grand Exchange" className={`rs-tab ${tab === 'ge' ? 'rs-tab-on' : ''}`}>
            <img src={ASSETS.misc.ge_logo} alt="Grand Exchange" onError={hideBrokenImg} />
          </button>
          <button onClick={() => setTab('essence')} title="Essence Shop — permanent upgrades" className={`rs-tab ${tab === 'essence' ? 'rs-tab-on' : ''}`}>
            <img src={ASSETS.misc.rune_essence_icon} alt="Essence Shop" onError={hideBrokenImg} />
            <span className="rs-tab-badge">{fmt(ui.essence)}</span>
          </button>
          <button onClick={() => setTab('slayer')} title="Slayer Rewards" className={`rs-tab ${tab === 'slayer' ? 'rs-tab-on' : ''}`}>
            <img src={ASSETS.misc.slayer_crossbow} alt="Slayer Rewards" onError={hideBrokenImg} />
            <span className="rs-tab-badge">{ui.slayerPoints}</span>
          </button>
          <button onClick={() => setLogOpen((o) => !o)} title="Collection Log" className={`rs-tab ${logOpen ? 'rs-tab-on' : ''}`}>
            <img src={`${ASSETS.misc.wiki_base}Collection_log.png`} alt="Collection Log" onError={hideBrokenImg} />
          </button>
          <button onClick={() => setDebugOpen((o) => !o)} title="Debug &amp; bestiary" className={`rs-tab text-[1.15em] ${debugOpen ? 'rs-tab-on' : ''}`}>
            🛠
          </button>
        </div>

        {/* Tab body (top section): keyed by `tab` so switching re-mounts this
            wrapper and retriggers the soft fade/slide-in (rs-tab-body). This is the
            ONLY part the tab stones swap — the tower dock below stays mounted. flex-1
            + overflow lets a long shop list scroll while the dock stays pinned. */}
        <div key={tab} className="rs-tab-body flex-1 min-h-0 overflow-y-auto pr-[0.1em]">
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
            </div>
          ) : (
            <>
              {ui.wave === 1 && (
                <div className="mb-[0.6em]">
                  <div className="text-[0.7em] text-[#cdbe91] uppercase tracking-wide mb-[0.3em] text-center">Game Mode</div>
                  <div className="grid grid-cols-2 gap-[0.4em]">
                    {(['classic', 'roguelite'] as GameMode[]).map((m) => (
                      <button
                        key={m}
                        className={`rs-btn py-[0.35em] text-[0.85em] ${ui.gameMode === m ? 'rs-btn-primary' : ''}`}
                        onClick={() => engineRef.current?.setMode(m)}
                        title={m === 'classic' ? 'Pure tower defense' : 'Draft a reward card after every wave'}
                      >
                        {m === 'classic' ? 'Classic' : 'Roguelite'}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <button
                className="rs-btn rs-btn-primary w-full py-[0.5em] mb-[0.6em] text-[1.05em] animate-pulse"
                onClick={() => engineRef.current?.startWave()}
              >
                ▶ Start Wave {ui.wave}
              </button>
            </>
          )
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

        {/* Tower shop — ALWAYS visible, regardless of the selected tab, so towers
            stay one click away while browsing the GE / Essence / Slayer interfaces.
            The tab stones above only swap the top section; this dock never unmounts. */}
        <div
          className="shrink-0 relative pt-[0.6em] mt-[0.6em] border-t border-[var(--rs-keyline)]"
          style={{ boxShadow: 'inset 0 1px 0 0 var(--rs-bevel-light)' }}
        >
          {/* Hover tooltip: tier-1 stats before buying (anchored above the dock) */}
          {hoverShop && (() => {
            const t0 = TOWERS[hoverShop].tiers[0];
            const combat = TOWER_COMBAT[hoverShop];
            const dmg = t0.maxDamage != null ? `${t0.minDamage ?? 0}–${t0.maxDamage}` : t0.damage;
            const icon = towerIcon(hoverShop);
            return (
              <div
                className="rs-panel absolute bottom-full right-0 mb-3 p-2 w-[15em] z-20 pointer-events-none"
                style={{ fontSize: 'clamp(12px, 0.85vw, 16px)' }}
              >
                <div className="rs-panel-title flex items-center gap-2" style={{ fontSize: '1em' }}>
                  {icon && <img src={icon} alt="" className="w-[1.3em] h-[1.3em] object-contain" />}
                  <span className="truncate">{t0.name}</span>
                </div>
                <div className="space-y-[0.3em] mt-[0.4em] px-[0.1em]">
                  <Stat icon={combat.icon} label={`Damage (${combat.label})`} value={dmg} />
                  <Stat icon={ASSETS.misc.attack_icon} label="Attack speed" value={attackSpeed(t0.cooldown)} />
                  <Stat label="Range" value={`${Math.round(t0.range / TILE_PX)} tiles`} />
                </div>
              </div>
            );
          })()}
          <div className="rs-panel-title">Towers</div>
          <div className="grid grid-cols-6 gap-2">
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
            <kbd>Space</kbd> pause · <kbd>1</kbd>/<kbd>2</kbd>/<kbd>5</kbd> speed · <kbd>Esc</kbd> cancel · <kbd>M</kbd> mute
          </p>
        </div>
      </MovablePanel>

      {/* Speed + sound control (bottom-left) */}
      <MovablePanel id="controls" globalLock={uiLocked} className="rs-panel absolute bottom-4 left-4 p-2 z-10 flex items-center gap-1">
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
        <MovablePanel id="prayers" globalLock={uiLocked} className="rs-panel p-2 flex items-center gap-[0.3em]">
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
          <div className="rs-panel px-[1.1em] py-[0.4em] text-center" style={{ fontSize: 'clamp(12px, 0.85vw, 16px)' }}>
            <div className="text-osrs-orange font-bold">❚❚ COMBAT PAUSED</div>
            <div className="text-[#cdbe91] text-[0.8em]">build freely · press Esc or ⏸ to resume</div>
          </div>
        </div>
      )}

      {/* Roguelite draft — pick one card to keep before the next wave */}
      {ui.pendingDraft && !ui.gameOver && (
        <div className="absolute inset-0 bg-black/75 flex flex-col items-center justify-center z-30 p-4">
          <div className="text-osrs-orange font-bold text-[1.4em] mb-1 text-center">Draft a Reward</div>
          <div className="text-[#cdbe91] text-[0.85em] mb-4 text-center">Wave {ui.wave} cleared — keep one card</div>
          <div className="flex gap-4 flex-wrap justify-center">
            {ui.pendingDraft.map((card) => (
              <DraftCardView key={card.id} card={card} onPick={() => engineRef.current?.pickDraftCard(card.id)} />
            ))}
          </div>
        </div>
      )}

      {/* Game over */}
      {ui.gameOver && (
        <div className="absolute inset-0 bg-black/70 flex items-center justify-center z-30">
          <div className="rs-panel p-6 text-center w-[22em]">
            <div className="rs-panel-title text-base">Game Over</div>
            <p className="text-osrs-yellow mt-3 mb-1 text-[1.6em] font-bold leading-none">Wave {ui.wave}</p>
            <p className="text-[0.85em] text-[#d3c3a0] mb-4 uppercase tracking-wide">reached</p>
            <div className="grid grid-cols-2 gap-2 mb-5 text-[0.95em]">
              <GoStat icon={ASSETS.misc.attack_icon} label="Slain" value={fmt(engineRef.current?.kills ?? 0)} />
              <GoStat icon={ASSETS.misc.coins_icon} label="Earned" value={`${fmt(engineRef.current?.goldEarned ?? 0)} gp`} />
            </div>
            <button className="rs-btn rs-btn-primary px-6 py-2 w-full" onClick={() => engineRef.current?.restart()}>
              ▶ Play Again
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Draft-card rarity palette + labels, lifted from the OSRS TCG plugin's tier
 *  colours (common white, rare blue, epic purple). */
const RARITY_COLOR: Record<DraftRarity, string> = {
  common: '#FFFFFF',
  rare: '#3498DB',
  epic: '#9B59B6',
};
const RARITY_LABEL: Record<DraftRarity, string> = { common: 'Common', rare: 'Rare', epic: 'Epic' };

/** Short stat tag for a card's bottom band (mirrors the TCG "Score" line). */
function draftEffectTag(card: DraftCard): string {
  const e = card.effect;
  switch (e.kind) {
    case 'gold': return `+${e.amount} gp`;
    case 'essence': return `+${e.amount} essence`;
    case 'life': return `+${e.amount} lives`;
    case 'maxLife': return `+${e.amount} max life`;
    case 'damage': return `×${e.mult.toFixed(2)} dmg`;
    case 'range': return `×${e.mult.toFixed(2)} range`;
    case 'fireRate': return `×${e.mult.toFixed(2)} speed`;
  }
}

/**
 * A single roguelite draft card, styled after the OSRS TCG plugin's card face:
 * a rounded rarity-coloured frame over a dark body, with five stacked bands —
 * title / art window / tier / examine / stats — each tinted toward the rarity
 * colour. Epic cards get an animated foil sheen.
 */
function DraftCardView({ card, onPick }: { card: DraftCard; onPick: () => void }) {
  const color = RARITY_COLOR[card.rarity];
  const foil = card.rarity === 'epic';
  const dark = `color-mix(in srgb, #222222 68%, ${color} 32%)`;
  const mid = `color-mix(in srgb, #2F2F2F 80%, ${color} 20%)`;
  return (
    <button
      onClick={onPick}
      title={card.desc}
      className="draft-card group relative flex flex-col overflow-hidden text-center"
      style={{
        width: 'clamp(132px, 12vw, 168px)',
        aspectRatio: '180 / 260',
        background: '#2A2A2A',
        border: `4px solid ${color}`,
        borderRadius: 10,
        boxShadow: `0 0 0 1px #100d09, 0 8px 20px rgba(0,0,0,0.6), 0 0 16px ${color}55`,
      }}
    >
      {/* title band (10%) */}
      <div className="flex items-center justify-center px-1" style={{ height: '10%', background: dark }}>
        <span className="font-osrs leading-none" style={{ color, fontSize: 'clamp(9px,0.78vw,12px)', textShadow: '0 1px 0 #000' }}>{card.name}</span>
      </div>
      {/* art window (40%) */}
      <div className="flex items-center justify-center" style={{ height: '40%', background: mid }}>
        <img src={card.icon} alt="" className="object-contain" style={{ maxWidth: '64%', maxHeight: '78%', filter: 'drop-shadow(0 2px 3px rgba(0,0,0,0.6))' }} onError={hideBrokenImg} />
      </div>
      {/* tier band (10%) */}
      <div className="flex items-center justify-center" style={{ height: '10%', background: dark }}>
        <span className="font-osrs uppercase tracking-wide" style={{ color, fontSize: 'clamp(8px,0.6vw,10px)' }}>{RARITY_LABEL[card.rarity]}</span>
      </div>
      {/* examine band (30%) */}
      <div className="flex items-center justify-center px-2" style={{ height: '30%', background: mid }}>
        <span className="font-osrs leading-tight" style={{ color: '#c9c1ad', fontSize: 'clamp(9px,0.72vw,11px)' }}>{card.desc}</span>
      </div>
      {/* stats band (10%) */}
      <div className="flex items-center justify-center" style={{ height: '10%', background: dark }}>
        <span className="font-osrs text-white" style={{ fontSize: 'clamp(9px,0.7vw,11px)' }}>{draftEffectTag(card)}</span>
      </div>
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

/** Collection Log / Boss Log: a centred OSRS window with Bosses / Monsters tabs.
 *  Every enemy shows its baked sprite + lifetime kill count; unobtained ones are
 *  darkened silhouettes (collection-log style). A completion counter per tab. */
function CollectionLog({ killCounts, tab, setTab, onClose, globalLock }: {
  killCounts: Record<string, number>;
  tab: 'bosses' | 'monsters';
  setTab: (t: 'bosses' | 'monsters') => void;
  onClose: () => void;
  globalLock: boolean;
}) {
  const entries = tab === 'bosses' ? BOSS_ENTRIES : MONSTER_ENTRIES;
  const obtained = entries.filter((e) => (killCounts[e.type] ?? 0) > 0).length;
  const complete = entries.length > 0 && obtained === entries.length;
  // The clicked entry, shown as a detail card (stats + animated sprite).
  const [selected, setSelected] = useState<string | null>(null);
  return (
    <MovablePanel
      id="collection-log"
      globalLock={globalLock}
      className="rs-panel absolute top-10 left-1/2 z-30 w-[30em] flex flex-col p-3"
      style={{ marginLeft: '-15em', maxHeight: '82vh', fontSize: 'clamp(13px, 0.9vw, 18px)' }}
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
          {(['bosses', 'monsters'] as const).map((t) => (
            <button
              key={t}
              onClick={() => { setTab(t); setSelected(null); }}
              className={`rs-btn px-[0.8em] py-[0.15em] text-[0.78em] capitalize ${tab === t ? 'rs-btn-primary' : ''}`}
            >
              {t}
            </button>
          ))}
        </div>
        <span className="text-[0.78em] font-bold" style={{ color: complete ? 'var(--osrs-green)' : 'var(--osrs-yellow)' }}>
          {obtained}/{entries.length} found
        </span>
      </div>
      {selected
        ? (() => {
            // Navigate within the current tab's list; wrap around so prev/next
            // are always live (continuous bestiary browsing).
            const idx = entries.findIndex((e) => e.type === selected);
            const prev = entries[(idx - 1 + entries.length) % entries.length];
            const next = entries[(idx + 1) % entries.length];
            return (
              <LogDetail
                type={selected}
                kc={killCounts[selected] ?? 0}
                onBack={() => setSelected(null)}
                onPrev={() => setSelected(prev.type)}
                onNext={() => setSelected(next.type)}
                position={{ index: idx + 1, total: entries.length }}
              />
            );
          })()
        : (
          <div className="grid grid-cols-3 gap-[0.4em] overflow-y-auto custom-scrollbar pr-[0.2em] flex-1 min-h-0">
            {entries.map((e) => {
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
