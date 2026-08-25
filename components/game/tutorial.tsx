'use client';

import React, { useLayoutEffect, useState } from 'react';
import type { UIState } from '@/lib/game/core/engine';
import { ASSETS, iconUrl, itemIcon } from '@/lib/game/assets';
import { fs, hideBrokenImg } from './ui-kit';

/**
 * Everything that teaches the game: the contextual tips (`LEARN_STEPS` +
 * `LearnAsYouGo`) and the How-to-Play cheat sheet (`TLDR` + `HowToPlay`).
 *
 * The two must describe the same interface at different depth — change one,
 * change the other. They live in one file so that rule is visible rather than
 * remembered.
 *
 * **Both are deliberately short.** Players were reading neither, because both
 * were walls of prose. One line is one idea, an icon carries what a sentence
 * used to explain, and detail that the interface already shows on hover (gear
 * ladders, copy/paste, difficulty tiers, achievements) is not repeated here.
 * When adding a system, add a *line*, not a paragraph — if it needs more than
 * about a dozen words, it belongs in the panel that owns it.
 */

/** Small OSRS sprite used as a bullet. Sized in em so it tracks `--ui-scale`. */
function Ico({ src, size = '1.6em' }: { src: string; size?: string }) {
  return (
    <img
      src={src}
      alt=""
      aria-hidden
      className="object-contain shrink-0"
      style={{ width: size, height: size }}
      onError={hideBrokenImg}
    />
  );
}

// ───────────────────────── Learn-as-you-go coaching ───────────────────────
// One contextual tip at a time, surfaced the first time each situation applies
// (place a tower, send the first wave, first affix / event / boss…). Each tip
// anchors to a live UI element (tagged `data-tut="…"`) or floats top-centre,
// never blocks the game underneath, and is remembered once dismissed — teaching
// the game gradually instead of front-loading one long tour.
//
// One sentence each. The tip points at the thing; the thing explains itself.

export interface LearnCtx { towersPlaced: boolean }
export interface LearnStep {
  id: string;
  target?: string;
  /** OSRS sprite shown beside the title. */
  icon?: string;
  title: string;
  body: string;
  /** Louder treatment: a pulsing ring instead of the plain one. For the one or
   *  two things a player who misses them plays the whole run worse off. */
  spotlight?: boolean;
  /** Show the live interface-size control inside the balloon, so the tip is the
   *  thing itself and not a pointer at it. */
  uiSizeControl?: boolean;
  /** Trigger: show this tip the first time it returns true. Kept simple and
   *  mostly keyed to a specific wave/phase so tips never bunch up. */
  when: (ui: UIState, ctx: LearnCtx) => boolean;
}

export const LEARN_STEPS: LearnStep[] = [
  // First thing a first-time player sees, before anything about towers: plenty of
  // them never found the size control and played a whole run squinting.
  { id: 'uiscale', target: 'uiscale', spotlight: true, uiSizeControl: true, title: 'Set your interface size',
    body: 'Text too small, or too big? These − and + resize the whole interface. Try it now — the game waits.',
    when: (ui, c) => !ui.waveActive && ui.wave === 1 && !c.towersPlaced },
  { id: 'build', target: 'dock', icon: ASSETS.towers.archer[1], title: 'Build a tower',
    body: 'Pick one below, then click the grass. It aims and fires on its own.',
    when: (ui, c) => !ui.waveActive && ui.wave === 1 && !c.towersPlaced },
  { id: 'start', target: 'startwave', icon: ASSETS.misc.multicombat_icon, title: 'Send the wave',
    body: 'Nothing spawns until you press Start Wave — or Space. Build first, the game waits.',
    when: (ui, c) => !ui.waveActive && ui.wave === 1 && c.towersPlaced },
  { id: 'hud', target: 'hud', icon: ASSETS.misc.orb_hitpoints, title: 'Lives & gold',
    body: 'Lives, wave and prayer sit in the bar. Every enemy that reaches your base costs a life; every kill pays gold.',
    when: (ui) => ui.waveActive && ui.wave === 1 },
  { id: 'upgrade', target: 'dock', icon: ASSETS.misc.xp_icon, title: 'Spend between waves',
    body: 'Click a tower you built to upgrade or sell it. Fighting levels it up, and higher tiers ask for a level as well as gold.',
    when: (ui) => !ui.waveActive && ui.wave === 2 },
  { id: 'gear', target: 'gear', icon: ASSETS.misc.loot_bag, title: 'Equip drops',
    body: 'Monsters drop gear into this bag. Click a tower slot to equip it — ammo matches the tower\'s style, jewellery fits any.',
    when: (ui) => ui.gameMode === 'classic' && !!ui.selectedTowerId && ui.wave >= 2 },
  { id: 'prayer', target: 'prayers', icon: ASSETS.misc.orb_prayer, title: 'Prayer',
    body: 'Toggle one to buff your towers. It drains a pool that refills between waves.',
    when: (ui) => !ui.waveActive && ui.wave === 3 },
  { id: 'sidebar', target: 'stones', icon: iconUrl('Collection_log'), title: 'The stones',
    body: 'The stones on the right open the shops, the log and this guide. Click one again to close it.',
    when: (ui) => !ui.waveActive && ui.wave === 4 },
  { id: 'road', target: 'map', icon: ASSETS.misc.spade, title: 'Bend the road',
    body: 'Between waves, click one square of road and an arrow to pull it a tile aside — click it again to pull it further, or fill it back in.',
    when: (ui) => !ui.waveActive && ui.wave === 6 },
  { id: 'traps', target: 'dock', icon: itemIcon('bird_snare'), title: 'Trap the road',
    body: 'The Traps tab lays snares on the road itself. They never block it — enemies walk over them.',
    when: (ui) => !ui.waveActive && ui.wave === 7 },
  { id: 'affix', icon: ASSETS.misc.defence_icon, title: 'Elite enemies',
    body: 'A glowing enemy breaks one rule — the aura colour says which. Vary your towers.',
    when: (ui) => ui.wave >= 5 && ui.waveActive },
  { id: 'event', target: 'waveevent', icon: ASSETS.spells['Curse'], title: 'Wave event',
    body: 'This wave has a twist, good or bad. Hover the chip to read it again.',
    when: (ui) => !!ui.activeEvent },
  { id: 'boss', icon: ASSETS.enemies.cerberus, title: 'Boss wave',
    body: 'A boss has one mechanic to answer. Watch the caption under its health bar.',
    when: (ui) => ui.bossWave },
  { id: 'victory', target: 'hud', icon: itemIcon('collection_log'), title: 'Runs can be won',
    body: 'Beat every boss — around wave 90 — and you win. Endless carries on from there.',
    when: (ui) => ui.wave >= 60 && !ui.waveActive },
  // The 'draft' tip is taught *inside* the draft overlay itself (see the roguelite
  // draft block) so it explains the cards while you are choosing, not after — it is
  // not a floating coach step.
];

/** Learn-as-you-go coach. Renders the first not-yet-seen tip whose trigger fits
 *  the current game state, anchored beside its `data-tut` target (or floating
 *  top-centre when it has none) with a highlight ring. Non-blocking — the game
 *  plays on underneath. "Got it" retires the tip; "Skip tips" retires them all. */
export function LearnAsYouGo({ ui, towersPlaced, seen, onSeen, onSkipAll, uiScale = 1, onNudgeUiScale }: {
  ui: UIState;
  towersPlaced: boolean;
  seen: string[];
  onSeen: (id: string) => void;
  onSkipAll: () => void;
  /** Current interface size, for the tip that teaches it. */
  uiScale?: number;
  /** Step the interface size by ±1 notch (clamped by the caller). */
  onNudgeUiScale?: (direction: 1 | -1) => void;
}) {
  const step = LEARN_STEPS.find((s) => !seen.includes(s.id) && s.when(ui, { towersPlaced })) ?? null;
  const [box, setBox] = useState<{ rect: DOMRect | null; vw: number; vh: number; scale: number }>(
    { rect: null, vw: 0, vh: 0, scale: 1 });
  const target = step?.target;

  useLayoutEffect(() => {
    const measure = () => {
      const el = target ? document.querySelector(`[data-tut="${target}"]`) : null;
      // The balloon's own font-size tracks `--ui-scale` (see `fs` below), so its
      // width has to as well — a px cap would squeeze the text at 160%.
      const scale = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ui-scale')) || 1;
      setBox({ rect: el ? el.getBoundingClientRect() : null, vw: window.innerWidth, vh: window.innerHeight, scale });
    };
    measure();
    window.addEventListener('resize', measure);
    const id = window.setInterval(measure, 300); // panels drift / layout settles
    return () => { window.removeEventListener('resize', measure); window.clearInterval(id); };
  }, [target, step?.id]);

  if (!step) return null;
  const { rect, vw, vh, scale } = box;
  const pad = 6;
  const balloonW = Math.min(330 * scale, (vw || 360) - 24);

  // Beside the target on whichever side has room; park on the mid-left when the
  // tip is targetless. The mid-left strip is the one region no live event uses —
  // the top-centre carries the wave strip and boss bar, the bottom the vitals,
  // prayers and controls, and the right edge the docked menu — so a targetless
  // tip never sits over what's happening on the board.
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
          className={`fixed z-[61] pointer-events-none${step.spotlight ? ' rs-spotlight' : ''}`}
          style={{
            left: rect.left - pad, top: rect.top - pad,
            width: rect.width + pad * 2, height: rect.height + pad * 2,
            borderRadius: 8,
            border: step.spotlight ? '2px solid var(--osrs-yellow)' : '2px solid var(--osrs-orange)',
            boxShadow: step.spotlight ? undefined : '0 0 12px 2px rgba(255,140,0,0.5)',
            transition: 'left .2s, top .2s, width .2s, height .2s',
          }}
        />
      )}
      <div className="fixed z-[62] rs-panel p-3 flex flex-col" style={{ ...bStyle, width: balloonW, fontSize: fs('clamp(13px,0.85vw,17px)') }}>
        <div className="flex items-center justify-between gap-[0.5em] mb-[0.35em]">
          <span className="flex items-center gap-[0.4em] min-w-0">
            {step.icon && <Ico src={step.icon} size="1.25em" />}
            <span className="text-osrs-orange font-bold text-[0.95em] truncate">{step.title}</span>
          </span>
          <span className="text-[0.55em] uppercase tracking-wide text-[#cdbe91] border border-[#6f6250] rounded-sm px-[0.45em] py-[0.05em] shrink-0">Tip</span>
        </div>
        <p className="text-[0.85em] text-[#d3c3a0] leading-snug mb-[0.7em]">{step.body}</p>
        {step.uiSizeControl && onNudgeUiScale && (
          // The control itself, repeated inside the tip: reading about a button is
          // what players skip — pressing one is not.
          <div className="flex items-center justify-center gap-[0.5em] mb-[0.7em]">
            <button className="rs-btn px-[0.9em] py-[0.2em] text-[0.9em]" onClick={() => onNudgeUiScale(-1)} title="Smaller interface">−</button>
            <span className="text-osrs-orange tabular-nums text-[0.85em] w-[3.2em] text-center select-none">{Math.round(uiScale * 100)}%</span>
            <button className="rs-btn px-[0.9em] py-[0.2em] text-[0.9em]" onClick={() => onNudgeUiScale(1)} title="Larger interface">+</button>
          </div>
        )}
        <div className="flex items-center justify-between gap-[0.5em]">
          <button className="rs-btn px-[0.7em] py-[0.25em] text-[0.72em]" onClick={onSkipAll}>Skip tips</button>
          <button className="rs-btn rs-btn-primary px-[0.9em] py-[0.25em] text-[0.78em]" onClick={() => onSeen(step.id)}>Got it ✓</button>
        </div>
      </div>
    </>
  );
}

// ───────────────────────── How to Play (tutorial) ─────────────────────────
// Five short tabs, each one screen with no scrolling: a player who opens this
// mid-run reads four or five lines and closes it again. The learn-as-you-go
// tips above teach the same systems in context; this is the "I forgot how X
// works" reminder, not a manual.
export interface TldrLine { icon?: string; keys?: string[]; text: string }
export interface TldrTab { id: string; label: string; icon: string; lines: TldrLine[] }

export const TLDR: TldrTab[] = [
  { id: 'basics', label: 'Basics', icon: ASSETS.misc.orb_hitpoints, lines: [
    { keys: ['−', '+'], text: 'Resize the whole interface, this window included, with − and + on the bottom bar.' },
    { icon: ASSETS.misc.orb_hitpoints, text: 'Enemies walk the path. Each one that reaches your base costs a life.' },
    { icon: ASSETS.misc.coins_icon, text: 'Every kill pays gold. Gold buys and upgrades towers.' },
    { icon: ASSETS.misc.multicombat_icon, text: 'Nothing spawns until you press Start Wave. Between waves is free build time.' },
    { icon: itemIcon('collection_log'), text: 'Beat every boss — around wave 90 — to win the run, then carry on in Endless.' },
    { icon: ASSETS.misc.spade, text: 'Pay to pull a square of road aside, again and again; the other arrow fills it back in.' },
    { icon: ASSETS.misc.hunter_icon, text: 'The dock has a Traps tab: Hunter traps go on the road, and springing them levels Hunter.' },
    { icon: ASSETS.misc.compass, text: 'Tips appear in-game the first time each new thing shows up.' },
  ] },
  { id: 'towers', label: 'Towers', icon: ASSETS.towers.archer[1], lines: [
    { icon: ASSETS.towers.archer[1], text: 'Pick one from the dock, click the grass. It aims and fires on its own.' },
    { icon: ASSETS.misc.arrow_up, text: 'Click a placed tower to upgrade, sell, or change what it shoots first.' },
    { icon: ASSETS.misc.xp_icon, text: 'Towers level up by fighting. A tier upgrade needs that level as well as gold.' },
    { icon: ASSETS.misc.magic_icon, text: 'Each monster is weak to one element or style — the right tower hits +50%.' },
    { icon: ASSETS.misc.loot_bag, text: 'Drops land in the loot bag on the bar. Ammo matches the style, jewellery fits any tower.' },
  ] },
  { id: 'waves', label: 'Waves', icon: ASSETS.misc.multicombat_icon, lines: [
    { icon: ASSETS.misc.multicombat_icon, text: 'The strip at the top shows what is coming. Hover a monster to scout it.' },
    { icon: ASSETS.misc.reticle, text: 'Select a tower and every monster it hits for +50% gets a ring.' },
    { icon: ASSETS.spells['Curse'], text: 'A wave event changes the rules for that wave only. Hover its chip to re-read it.' },
    { icon: ASSETS.misc.defence_icon, text: 'Glowing enemies are elite: the aura says which rule they break.' },
    { icon: ASSETS.enemies.cerberus, text: 'Bosses get a health bar and one mechanic — the caption under it tells you.' },
  ] },
  { id: 'systems', label: 'Systems', icon: ASSETS.misc.orb_prayer, lines: [
    { icon: ASSETS.misc.orb_prayer, text: 'Prayer buffs a combat style while it drains. The pool refills between waves.' },
    { icon: ASSETS.misc.slayer_crossbow, text: 'Slayer tasks arrive on their own and pay points for the Slayer shop.' },
    { icon: ASSETS.misc.rune_essence_icon, text: 'Essence is kept forever — spend it in the Essence Shop on permanent upgrades.' },
    { icon: iconUrl('Collection_log'), text: 'The Collection Log holds your kills, cards, wins and Combat Achievements.' },
    { icon: ASSETS.misc.cards_icon, text: 'Roguelite: buy card rolls between waves and keep one. Bosses drop relics.' },
  ] },
  { id: 'keys', label: 'Keys', icon: ASSETS.misc.stats_icon, lines: [
    { keys: ['1', '–', '6'], text: 'pick from the dock — tower or trap' },
    { keys: ['Space'], text: 'start the wave' },
    { keys: ['U'], text: 'upgrade selection' },
    { keys: ['S'], text: 'sell selection' },
    { keys: ['Shift'], text: '+ drag paints a line' },
    { keys: ['Ctrl', 'C', '/', 'V'], text: 'copy & paste towers' },
    { keys: ['Q', 'W', 'E', 'R'], text: 'select spell element' },
    { keys: [',', '/', '.'], text: 'slower / faster' },
    { keys: ['Z', 'X', 'C'], text: '1× / 2× / 5×' },
    { keys: ['Esc'], text: 'pause or cancel' },
    { keys: ['M'], text: 'mute' },
    { keys: ['Ctrl', '\''], text: 'debug console' },
  ] },
];

/** Tokens in a `keys` row that are punctuation between caps, not caps of their own. */
const KEY_SEPARATORS = new Set(['–', '/']);

/** The keycaps of one line, used as its bullet when the line has no sprite. */
function Keycaps({ keys }: { keys: string[] }) {
  return (
    <span className="flex items-baseline gap-[0.2em] shrink-0 text-[0.75em]">
      {keys.map((k, j) => (
        KEY_SEPARATORS.has(k) ? <span key={j} className="text-[#a89a7c]">{k}</span> : <kbd key={j}>{k}</kbd>
      ))}
    </span>
  );
}

/** "How to Play" — five short tabs, no scrolling. The learn-as-you-go tips
 *  cover the same ground in context the first time each thing appears; this
 *  window is the terse "I forgot how X works" reminder. "Replay tips" re-arms
 *  those tips. */
export function HowToPlay({ onClose, onResetTips }: { onClose: () => void; onResetTips: () => void }) {
  const [tab, setTab] = useState(TLDR[0].id);
  const active = TLDR.find((t) => t.id === tab) ?? TLDR[0];
  const isKeys = active.id === 'keys';

  return (
    <div className="absolute inset-0 bg-black/82 flex items-center justify-center z-50 p-4">
      <div className="rs-panel p-4 w-[30em] max-w-[96vw] flex flex-col" style={{ maxHeight: '92vh', fontSize: fs('clamp(14px, 0.95vw, 19px)') }}>
        <div className="flex items-center justify-between gap-[0.5em] mb-[0.55em]">
          <span className="text-osrs-orange font-bold text-[1.15em]">How to Play</span>
          <button className="rs-btn px-[0.7em] py-[0.15em] text-[0.85em]" onClick={onClose} title="Close">✕</button>
        </div>

        <div className="flex flex-wrap gap-[0.3em] mb-[0.55em] shrink-0">
          {TLDR.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`rs-btn flex items-center gap-[0.35em] px-[0.7em] py-[0.15em] text-[0.78em] ${t.id === tab ? 'rs-btn-primary' : ''}`}
            >
              <Ico src={t.icon} size="1.1em" />
              {t.label}
            </button>
          ))}
        </div>

        {/* Sized to the tallest tab so switching tabs doesn't resize the window
            under the pointer; overflow is a safety net (a very small UI scale),
            not the intended reading mode — every tab fits without scrolling. */}
        <div className="rs-panel-inset p-[0.9em] min-h-[15.3em] max-h-[26em] overflow-y-auto">
          {isKeys ? (
            <>
              <div className="grid grid-cols-2 gap-x-[0.9em] gap-y-[0.5em]">
                {active.lines.map((l, i) => (
                  <div key={i} className="flex items-baseline gap-[0.4em]">
                    <Keycaps keys={l.keys ?? []} />
                    <span className="text-[0.78em] text-[#d3c3a0] leading-snug">{l.text}</span>
                  </div>
                ))}
              </div>
              <p className="text-[0.72em] text-[#a89a7c] mt-[0.8em] leading-snug">
                Drag a box over the board to select several towers at once. Every button wears its own key in a corner.
              </p>
            </>
          ) : (
            <ul className="flex flex-col gap-[0.6em]">
              {active.lines.map((l, i) => (
                <li key={i} className="flex gap-[0.6em] items-center">
                  {l.icon
                    ? <Ico src={l.icon} />
                    // No OSRS sprite means "interface size" — the control's own
                    // − / + caps say it better than a borrowed icon would.
                    : l.keys && <span className="w-[1.6em] flex justify-center shrink-0"><Keycaps keys={l.keys} /></span>}
                  <span className="text-[0.85em] text-[#d3c3a0] leading-snug">{l.text}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex items-center justify-between gap-[0.5em] mt-[0.7em] shrink-0">
          <button className="rs-btn px-[0.9em] py-[0.35em] text-[0.8em]" onClick={onResetTips} title="Show the in-game tips again from the start">↻ Replay tips</button>
          <button className="rs-btn rs-btn-primary px-[1.1em] py-[0.35em] text-[0.85em]" onClick={onClose}>Got it ✓</button>
        </div>
      </div>
    </div>
  );
}
