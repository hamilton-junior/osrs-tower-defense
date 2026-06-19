'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { GameEngine, type UIState, type EnemyHoverInfo } from '@/lib/game/core/engine';
import { TOWERS, TOWER_STYLES } from '@/lib/game/data/towers';
import { utilityAuraBonus, diminishingSum } from '@/lib/game/systems/tower-combat';
import { MovablePanel } from './MovablePanel';
import { PRAYERS, TOWER_PRAYERS } from '@/lib/game/data/prayers';
import { ASSETS } from '@/lib/game/assets';
import { waveClearBonus } from '@/lib/game/systems/rewards';
import { isPrayerUnlocked, prayerUnlockWave } from '@/lib/game/systems/prayer';
import { ELEMENTS, ELEMENT_ORDER, ANCIENTS, ANCIENT_ORDER, SUPPORT_SPELLS, SUPPORT_ORDER, ELEMENTAL_TIER_NAMES, ANCIENT_TIER_NAMES, elementalSpellName, ancientSpellName, ancientHit, spellSpriteName } from '@/lib/game/systems/magic';
import type { TowerType, PrayerType, MageMode } from '@/lib/game/types';

const TOWER_ORDER: TowerType[] = ['archer', 'wizard', 'cannon', 'tzhaar', 'slayer', 'toxic'];
const PRIORITY_LABELS = { first: '1st', last: 'Last', strongest: 'Str', weakest: 'Weak', closest: 'Near' } as const;
const towerIcon = (type: TowerType) => (ASSETS.towers as Record<string, Record<number, string>>)[type]?.[1];
const towerTierIcon = (type: TowerType, tier: number) => (ASSETS.towers as Record<string, Record<number, string>>)[type]?.[tier];
/** Wiki spell-icon URL for a spell-file name (e.g. `Fire_Wave`), if it exists. */
const spellIconUrl = (name: string): string | undefined => ASSETS.spells[name];
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
  movingTowerId: null, pendingPlacement: null, pendingMageMode: 'elemental', gameSpeed: 1, paused: false, muted: false, volume: 0.18,
  notice: null, noticeIcon: null, noticeSeq: 0,
  slayerTask: null, slayerPoints: 0, slayerStreak: 0, slayerMaster: 'Turael',
  prayerPoints: 10, prayerMax: 10, activePrayers: [],
  geOffers: [],
};

const prayerIcon = (id: PrayerType) => (ASSETS.prayers as Record<string, string>)[id];
/** Wiki sprite URL for a GE offer (its `wiki` filename + .png). */
const geIcon = (wiki: string) => `${ASSETS.misc.wiki_base}${wiki}.png`;

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
  const [hoverShop, setHoverShop] = useState<TowerType | null>(null);
  const [geOpen, setGeOpen] = useState(false);
  // Drives the on-map picker's per-tick animation (cycling staves/spells).
  const [pickerHover, setPickerHover] = useState<TowerType | null>(null);
  const [spellbookHover, setSpellbookHover] = useState<MageMode | null>(null);
  const [animTick, setAnimTick] = useState(0);
  const [hoverEnemy, setHoverEnemy] = useState<EnemyHoverInfo | null>(null);
  // Whether the upgrade button is hovered, to preview the next tier's stats.
  const [upgradeHover, setUpgradeHover] = useState(false);
  // Global UI-move lock (persisted): when on, no panel can be dragged.
  const [uiLocked, setUiLocked] = useState(false);
  useEffect(() => { try { setUiLocked(JSON.parse(localStorage.getItem('ui_global_lock') ?? 'false')); } catch { /* ignore */ } }, []);
  const toggleUiLock = useCallback(() => {
    setUiLocked((v) => { const n = !v; try { localStorage.setItem('ui_global_lock', JSON.stringify(n)); } catch { /* ignore */ } return n; });
  }, []);
  const prevWaveActive = useRef(false);

  // Poll the enemy under the cursor so its HP/effects read live while hovering.
  useEffect(() => {
    const id = setInterval(() => setHoverEnemy(engineRef.current?.hoveredEnemySummary() ?? null), 80);
    return () => clearInterval(id);
  }, []);

  // Tick the picker animations on the OSRS cadence, only while it's open.
  useEffect(() => {
    if (!ui.pendingPlacement) { setPickerHover(null); setSpellbookHover(null); return; }
    const id = setInterval(() => setAnimTick((t) => t + 1), 600);
    return () => clearInterval(id);
  }, [ui.pendingPlacement]);

  useEffect(() => {
    if (!canvasRef.current) return;
    const engine = new GameEngine(canvasRef.current, (patch) => setUi((prev) => ({ ...prev, ...patch })));
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
      const completed = ui.wave - 1;
      setBanner({ text: `Wave ${completed} Complete   +${waveClearBonus(completed)} gp`, tone: 'done' });
    }
    prevWaveActive.current = ui.waveActive;
  }, [ui.waveActive, ui.wave, ui.gameOver, ui.bossWave]);

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

  // Keyboard shortcuts: space = pause, 1/2/5 = speed, Esc = cancel, M = mute.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const eng = engineRef.current;
      if (!eng) return;
      switch (e.key) {
        case ' ': e.preventDefault(); eng.togglePause(); break;
        case '1': eng.setGameSpeed(1); break;
        case '2': eng.setGameSpeed(2); break;
        case '3': case '5': eng.setGameSpeed(5); break;
        case 'Escape': eng.cancelAction(); break;
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

      {/* Enemy hover info — anchored above the hovered enemy, updating live. */}
      {hoverEnemy && (() => {
        const ratio = Math.max(0, hoverEnemy.hp / hoverEnemy.maxHp);
        const wk = hoverEnemy.weakness ? ELEMENTS[hoverEnemy.weakness as keyof typeof ELEMENTS] : null;
        return (
          <div
            className="absolute z-20 pointer-events-none"
            style={{
              left: `${(hoverEnemy.x / engW) * 100}%`,
              top: `${(hoverEnemy.y / engH) * 100}%`,
              transform: 'translate(-50%, -135%)',
            }}
          >
            <div className="rs-panel px-[0.7em] py-[0.5em] w-[12em]" style={{ fontSize: 'clamp(13px, 0.9vw, 18px)' }}>
              <div className="flex items-center justify-between gap-2 mb-[0.3em]">
                <span className="text-osrs-orange font-bold truncate">{hoverEnemy.name}</span>
                {hoverEnemy.isBoss && <span className="text-[0.6em] text-osrs-red uppercase tracking-wide">Boss</span>}
              </div>
              <div className="rs-progress mb-[0.35em]">
                <div className="rs-progress-fill" style={{ width: `${Math.round(ratio * 100)}%`, background: ratio > 0.5 ? '#3c3' : ratio > 0.25 ? '#e0c020' : '#e23a3a' }} />
              </div>
              <div className="grid grid-cols-2 gap-x-[0.6em] gap-y-[0.15em] text-[0.74em]">
                <span className="text-[#d3c3a0]">HP</span>
                <span className="text-right text-white">{hoverEnemy.hp}/{hoverEnemy.maxHp}</span>
                <span className="text-[#d3c3a0]">Weakness</span>
                <span className="text-right capitalize" style={{ color: wk?.color ?? '#9a9a9a' }}>{wk ? wk.label : 'None'}</span>
                <span className="text-[#d3c3a0]">Move speed</span>
                <span className="text-right text-white">{hoverEnemy.speed}{hoverEnemy.speed !== hoverEnemy.baseSpeed ? ` (${hoverEnemy.baseSpeed})` : ''}</span>
                <span className="text-[#d3c3a0]">Gold</span>
                <span className="text-right text-osrs-yellow">{hoverEnemy.reward}</span>
              </div>
              {hoverEnemy.effects.length > 0 && (
                <div className="mt-[0.35em] pt-[0.3em] border-t border-[#3a2f1d] flex flex-wrap gap-[0.3em]">
                  {hoverEnemy.effects.map((e) => (
                    <span key={e} className="text-[0.64em] px-[0.4em] py-[0.05em] rounded bg-[#2b231a] text-osrs-cyan">{e}</span>
                  ))}
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
                const cost = TOWERS[type].tiers[0].upgradeCost;
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

      {/* Bottom-right interface panel: start wave + tower shop */}
      <MovablePanel
        id="shop"
        globalLock={uiLocked}
        className="rs-panel absolute bottom-4 right-4 p-3 z-10 w-[24em]"
        style={{ fontSize: 'clamp(13px, 0.9vw, 18px)' }}
      >
        {/* Hover tooltip: tier-1 stats before buying */}
        {hoverShop && (() => {
          const t0 = TOWERS[hoverShop].tiers[0];
          const combat = TOWER_COMBAT[hoverShop];
          const dmg = t0.maxDamage != null ? `${t0.minDamage ?? 0}–${t0.maxDamage}` : t0.damage;
          const icon = towerIcon(hoverShop);
          return (
            <div
              className="rs-panel absolute bottom-full right-0 mb-2 p-2 w-[15em] z-20 pointer-events-none"
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
        {/* Slayer task interface (tasks are auto-assigned) */}
        {ui.slayerTask && (
          <div className="rs-panel-inset p-[0.5em] mb-[0.6em]">
            <div className="flex items-center gap-[0.4em] text-[0.82em] text-osrs-orange uppercase tracking-wide mb-[0.35em]">
              <img src={ASSETS.misc.slayer_crossbow} alt="" className="w-[1.2em] h-[1.2em] object-contain" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
              Slayer · {ui.slayerMaster}
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
            <button
              className="rs-btn rs-btn-primary w-full py-[0.5em] mb-[0.6em] text-[1.05em] animate-pulse"
              onClick={() => engineRef.current?.startWave()}
            >
              ▶ Start Wave {ui.wave}
            </button>
          )
        )}
        <div className="rs-panel-title">Towers</div>
        <div className="grid grid-cols-6 gap-2">
          {TOWER_ORDER.map((type) => {
            const cost = TOWERS[type].tiers[0].upgradeCost;
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
        <button
          onClick={() => setGeOpen((o) => !o)}
          title="Grand Exchange"
          className={`rs-btn px-2 py-1 text-xs ml-1 flex items-center gap-1 ${geOpen ? 'rs-btn-primary' : ''}`}
        >
          <img src={ASSETS.misc.ge_logo} alt="" className="w-4 h-4 object-contain" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
          GE
        </button>
        <button
          data-no-drag
          onClick={toggleUiLock}
          title={uiLocked ? 'Unlock UI (allow moving panels)' : 'Lock UI (prevent moving panels)'}
          className={`rs-btn px-2 py-1 text-xs ml-1 ${uiLocked ? 'rs-btn-primary' : ''}`}
        >
          {uiLocked ? '🔒' : '🔓'}
        </button>
      </MovablePanel>

      {/* Grand Exchange shop (toggled from the bottom-left controls) */}
      {geOpen && (
        <MovablePanel
          id="ge"
          globalLock={uiLocked}
          className="rs-panel absolute bottom-16 left-4 p-3 z-20 w-[21em]"
          style={{ fontSize: 'clamp(13px, 0.9vw, 18px)' }}
        >
          <div className="rs-panel-title flex items-center justify-between">
            <span className="flex items-center gap-2">
              <img src={ASSETS.misc.ge_logo} alt="" className="w-[1.3em] h-[1.3em] object-contain" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
              Grand Exchange
            </span>
            <button onClick={() => setGeOpen(false)} title="Close" className="rs-btn px-[0.5em] py-0 text-[0.8em]">✕</button>
          </div>
          <div className="space-y-[0.4em] mt-[0.6em]">
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
        </MovablePanel>
      )}

      {/* Quick-prayers bar (bottom-center): all tower prayers shown; locked ones
          are previewed greyed-out with the wave they unlock (OSRS prayer-book style). */}
      <div className="rs-panel absolute bottom-4 left-1/2 -translate-x-1/2 z-10 p-2 flex items-center gap-[0.3em]">
        <img src={ASSETS.misc.prayer_icon} alt="" className="w-[1.1em] h-[1.1em] mr-[0.2em] opacity-80" />
        {TOWER_PRAYERS.map((p) => {
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
              {icon && (
                <img src={icon} alt={def.name} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
              )}
              {locked && <span className="rs-prayer-lock">{prayerUnlockWave(def.level)}</span>}
            </button>
          );
        })}
      </div>

      {/* Paused overlay */}
      {ui.paused && !ui.gameOver && (
        <div
          className="absolute inset-0 bg-black/45 flex flex-col items-center justify-center z-20 cursor-pointer"
          onClick={() => engineRef.current?.togglePause()}
        >
          <div className="rs-wave-banner" style={{ animation: 'none', position: 'static', transform: 'none' }}>
            ❚❚ PAUSED
          </div>
          <div className="text-[#cdbe91] text-sm mt-2">click anywhere or press ⏸ to resume</div>
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
