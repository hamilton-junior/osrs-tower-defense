'use client';

import React, { useLayoutEffect, useState } from 'react';
import type { UIState } from '@/lib/game/core/engine';
import { fs } from './ui-kit';

/**
 * Everything that teaches the game: the contextual tips (`LEARN_STEPS` +
 * `LearnAsYouGo`) and the How-to-Play cheat sheet (`TLDR` + `HowToPlay`).
 *
 * The two must describe the same interface at different depth — change one,
 * change the other. They live in one file so that rule is visible rather than
 * remembered. Moved out of GameRoot.tsx verbatim.
 */

// ───────────────────────── Learn-as-you-go coaching ───────────────────────
// One contextual tip at a time, surfaced the first time each situation applies
// (place a tower, send the first wave, first affix / event / boss…). Each tip
// anchors to a live UI element (tagged `data-tut="…"`) or floats top-centre,
// never blocks the game underneath, and is remembered once dismissed — teaching
// the game gradually instead of front-loading one long tour.

export interface LearnCtx { towersPlaced: boolean }
export interface LearnStep {
  id: string;
  target?: string;
  title: string;
  body: string;
  /** Trigger: show this tip the first time it returns true. Kept simple and
   *  mostly keyed to a specific wave/phase so tips never bunch up. */
  when: (ui: UIState, ctx: LearnCtx) => boolean;
}

export const LEARN_STEPS: LearnStep[] = [
  { id: 'build', target: 'dock', title: 'Build your first tower',
    body: 'Pick a tower from the dock, then click the grass to place it. It aims and fires on its own — you win by positioning, not aiming.',
    when: (ui, c) => !ui.waveActive && ui.wave === 1 && !c.towersPlaced },
  { id: 'start', target: 'startwave', title: 'Send the wave',
    body: 'Happy with your defences? Press Start Wave, beside the tower dock — or tap Space. Nothing spawns until you do, so the game waits while you build. The panel at the top of the screen shows what the next wave sends — hover any monster in it to scout its HP, weakness, speed and gold — then tracks its progress once it lands; drag it anywhere you like. Every monster answers to exactly one thing: a wizard element, or a combat style (Melee or Ranged). Select a tower and the monsters it hits for +50% get a pulsing ring. Tick Auto to send every wave the moment the field is clear, after the delay in seconds next to it.',
    when: (ui, c) => !ui.waveActive && ui.wave === 1 && c.towersPlaced },
  { id: 'hud', target: 'hud', title: 'Lives & gold',
    body: 'These orbs are your lives and gold. Every enemy that reaches the base costs a life; every kill pays gold for more towers and upgrades.',
    when: (ui) => ui.waveActive && ui.wave === 1 },
  { id: 'upgrade', target: 'dock', title: 'Spend between waves',
    body: 'Click a tower you built to upgrade or sell it, and buy more from the dock. Towers earn XP by fighting — landing hits, and extra when they hit an enemy weak to their style — and level up, which nudges their damage. A tier upgrade needs both gold and a minimum combat level; until the tower is high enough its Upgrade button reads “Needs Lv X”. Tick its Auto‑upgrade box to let it level itself from your gold whenever it can (cheapest tower first, gate permitting); the same box on a multi‑selection arms the whole group. Build mode is paused, so take your time before the next wave.',
    when: (ui) => !ui.waveActive && ui.wave === 2 },
  { id: 'gear', target: 'gear', title: 'Equip dropped gear',
    body: 'Monsters — bosses especially — drop gear into your loot bag, on the first stone in the bar, and each drop announces itself in the corner. A tower\'s first slot takes its own style of ammunition: Ammo for Ranged towers, Runes for the wizard, Kit for Melee — and only accepts a matching piece. The second slot is Jewellery, which fits any tower. Every piece needs the tower\'s combat level to equip. Equip from either end: click a tower slot to pick a piece, or click a piece in the bag to pick the tower — hovering a tower in that list rings it on the board. Signature jewellery (boss drops) adds a special effect on top of its stats.',
    when: (ui) => ui.gameMode === 'classic' && !!ui.selectedTowerId && ui.wave >= 2 },
  { id: 'prayer', target: 'prayers', title: 'Prayer',
    body: 'Toggle a prayer to buff a tower style or shield your base. It drains a pool that refills between waves — flip the strong ones on for boss waves.',
    when: (ui) => !ui.waveActive && ui.wave === 3 },
  { id: 'sidebar', target: 'sidebar', title: 'Shops & guide',
    body: 'The bar along the bottom holds everything: speed, sound and interface size on the left, the towers and Start Wave in the middle, and the menu stones on the right. A stone pops its interface open above the bar and closes it when its stone is clicked again — or a right‑click anywhere on the panel — so nothing lingers over the board. That is where the Essence Shop (permanent upgrades) and Slayer Rewards live, and the ❓ stone reopens this quick reference anytime.',
    when: (ui) => !ui.waveActive && ui.wave === 4 },
  { id: 'affix', title: 'Elite enemies',
    body: 'Some enemies now arrive glowing with an affix that rewrites the rules — Shielded, Armored, Hasted and more. Read the aura colour and diversify your towers. One affix at first; deep runs can stack a second, never a third.',
    when: (ui) => ui.wave >= 5 && ui.waveActive },
  { id: 'event', target: 'waveevent', title: 'Wave event',
    body: 'A board-wide twist just rolled for this wave only. Some hurt (less range, tougher enemies), some help (faster or longer-range towers). It spells itself out for a few seconds when the wave starts — hover the chip any time to read it again.',
    when: (ui) => !!ui.activeEvent },
  { id: 'boss', title: 'Boss wave',
    body: 'A boss has its own health bar and a mechanic to answer — pile your strongest towers and buffs on it, and watch the caption under its bar.',
    when: (ui) => ui.bossWave },
  { id: 'victory', target: 'hud', title: 'A run can be won',
    body: 'Defeat every boss in the roster — around wave 90 — and the run is won. A Victory screen then lets you push on into Endless, where enemies keep pulling ahead and Rune Essence drops to a tenth, or start fresh. Your wins are kept in the Collection Log’s Victories tab. Clearing a difficulty tier unlocks the next harder one for that mode, with the record — not extra power — tracked in the Collection Log’s Difficulty tab. Combat Achievements run alongside all of it: 40 tasks in the Collection Log’s Achievements tab, earned by how you play rather than bought, and clearing a whole tier grants its title — a mark, never a power.',
    when: (ui) => ui.wave >= 60 && !ui.waveActive },
  // The 'draft' tip is taught *inside* the draft overlay itself (see the roguelite
  // draft block) so it explains the cards while you are choosing, not after — it is
  // not a floating coach step.
];

/** Learn-as-you-go coach. Renders the first not-yet-seen tip whose trigger fits
 *  the current game state, anchored beside its `data-tut` target (or floating
 *  top-centre when it has none) with a highlight ring. Non-blocking — the game
 *  plays on underneath. "Got it" retires the tip; "Skip tips" retires them all. */
export function LearnAsYouGo({ ui, towersPlaced, seen, onSeen, onSkipAll }: {
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
  // the top-centre carries the wave strip and boss bar, the top-right the orbs,
  // the bottom the prayers/controls and the right edge the docked menu — so a
  // targetless tip never sits over what's happening on the board.
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
// A short TL;DR reference for the How to Play window. The learn-as-you-go tips
// (LEARN_STEPS) teach each system in context the first time it appears; this is
// the terse cheat sheet a returning player skims to remember how something works.
export interface TldrGroup { h: string; lines: string[] }

export const TLDR: TldrGroup[] = [
  { h: 'Goal', lines: [
    'Enemies walk the path to your base. Every leak costs a life; at zero lives the run ends.',
    'Defeat every boss in the roster — about wave 90 — to win the run. A Victory screen then lets you carry on into Endless, where the threat keeps accelerating and Rune Essence drops to a tenth, or start fresh. Wins are recorded in the Collection Log’s Victories tab, and a ★ Champion mark lights on the title screen after your first. Clearing a difficulty tier unlocks the next harder one for that mode; the Collection Log’s Difficulty tab keeps that record — no extra power, just the mark.',
    'Combat Achievements are a parallel ladder of 40 tasks — reach a wave, fell a boss a certain way, hold a wave clean — tracked account-wide in the Collection Log’s Achievements tab and celebrated as they land. Clear every task in a tier and you earn its title (Easy through Grandmaster), shown on the title and Victory screens. Cosmetic only: no task unlocks a mode, a tier or a tower.',
  ] },
  { h: 'Towers', lines: [
    'Pick one from the dock, then click the grass — it aims and fires on its own.',
    'Click a placed tower to Upgrade or Sell it, and set its target priority — the six glyphs pair a stat with an arrow (⬆ most, ⬇ least): hover any of them for what it picks. Towers earn XP by fighting (bonus vs a style weakness) and level up for more damage; a tier upgrade needs a minimum level as well as gold — the button shows “Needs Lv X” until then. Tick Auto‑upgrade to let it level itself from your gold (cheapest tower first).',
    'Niches: Archer = volume, Wizard = single-target or AoE by spellbook, Cannon = splash, TzHaar = heavy melee, Slayer = anti-task/boss, Toxic = stacking venom.',
    'Classic gear — monsters drop gear into a loot bag (first stone in the bar; each drop toasts in the corner). A tower\'s first slot is its own style (Ammo for Ranged, Runes for the wizard, Kit for Melee) and only takes a match; the second slot is Jewellery, which fits any tower. Every piece needs the tower\'s combat level, and bosses drop signature jewellery with a bonus effect. Equip from either end — a tower slot picks the piece, a piece in the bag picks the tower (hover a tower in that list to ring it on the board).',
    'With a tower picked, hold Shift and drag to paint a line of them. Releasing Shift only prices the line up — a panel then asks you to confirm before a coin is spent, and for a line of wizards it asks which spellbook they should all use. Until you confirm, the stroke can be added to (hold Shift again), redrawn, or thrown away (Esc / right-click). Tiles you can’t afford paint red and are skipped.',
    'Drag a box (no Shift) to multi-select — the panel then upgrades, sells, moves, re-aims, re-elements or arms Auto‑upgrade on the whole box at once. A group Move carries the towers as one rigid formation: they keep the shape you arranged, and every tile must be legal or the drop is refused.',
    'Ctrl+C copies what is selected, Ctrl+V puts that formation on your pointer and a click builds all of it — the shape, each tower’s target priority and each wizard’s spellbook and spell come along. Copies are built at base level and cost full price, so it saves the clicking, not the gold.',
  ] },
  { h: 'Waves', lines: [
    'Nothing spawns until you Start Wave (button beside the tower dock, or Space). Between waves is paused build time.',
    'The panel at the top of the screen previews what the next wave sends, then tracks its progress once it lands — drag it wherever suits you. Hover a monster in that preview to scout its HP, weakness, speed and gold at this wave, before you commit to a build. A weakness is either a wizard element or a combat style — Melee or Ranged, never both — and the right one deals +50%; select a tower and every monster it is paid extra to kill gets a pulsing ring. Tick Auto beside the button to send each wave automatically.',
    'From wave 3 a wave can roll a board-wide event — it announces what it does as the wave starts, and its chip re-reads on hover. From wave 5 enemies can turn elite (glowing affixes), at most two at once. Bosses have their own mechanic.',
  ] },
  { h: 'Systems', lines: [
    'Prayer — toggle buffs or base protection; drains a pool that refills between waves.',
    'Slayer — auto-assigned kill tasks pay points for the Slayer Rewards shop, where you can extend, halve, skip or block the task, or buy the Slayer Helmet (imbue it in the same slot). Superior monsters count toward their base task. It tracks in the Slayer tab.',
    'Essence — earned every wave and kept forever; spend it in the Essence Shop on permanent upgrades. The rate is shown on each mode at the start: Classic pays full, Roguelite half, and Endless a tenth.',
    'Roguelite — between waves, buy card rolls with gold (each roll costs more than the last) and keep one card; beating a boss claims a Relic. A card you have never kept is badged NEW, so you can see a Collection Log gap while you can still close it.',
  ] },
  { h: 'Controls', lines: [
    '1-6 pick a tower from the dock (tap the same number to buy another) · with a tower picked, the Arrow keys move a placement cursor and Enter drops it there · Shift+drag paint a build line, release Shift to price it up and confirm · drag a box to multi-select · Ctrl+C copy the selection, Ctrl+V paste it · U upgrade what is selected · S sell it (asks first) · Space start wave · Esc pause / cancel · , / . slower / faster · Z/X/C jump to 1× / 2× / 5× · Q/W/E/R swap a wizard’s spell · M mute · Ctrl+′ debug console.',
    'You never have to memorise these: every button that answers to a key wears it engraved in a top corner.',
    'One slim bar along the bottom: run controls (left), tower dock and Start Wave (centre), menu stones (right). A stone opens its interface upward over the map and closes on a second click of the stone — or a right‑click on the panel — so no interface stays on-screen.',
    'Auto sends each wave once the field is clear, after the delay in seconds beside it; it always starts off when a run begins.',
    'Browser zoom is disabled so it can’t warp the board — resize the interface with the UI − / + buttons in that bar instead.',
  ] },
];

/** "How to Play" — a short TL;DR reference. The learn-as-you-go tips cover the
 *  detail in context the first time each thing appears; this window is the terse
 *  "I forgot how X works" cheat sheet. "Replay tips" re-arms those tips. */
export function HowToPlay({ onClose, onResetTips }: { onClose: () => void; onResetTips: () => void }) {
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
