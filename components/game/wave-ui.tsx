'use client';

import React, { useEffect, useState } from 'react';
import { ASSETS } from '@/lib/game/assets';
import type { UIState } from '@/lib/game/core/engine';
import { HoverTip } from './HoverTip';
import { fmt, hideBrokenImg, StatLabel } from './ui-kit';
import { weaknessTag } from './enemy-ui';

/**
 * What the next wave is bringing: the per-monster preview card and the chip that
 * keeps the active wave event on screen.
 *
 * Both read straight off `UIState` — the engine decides the roster and the twist,
 * this only draws them. Moved out of GameRoot.tsx verbatim.
 */

/** Composes a `HoverTip` body for the potion infoboxes + the wave-event chip: a
 *  title + optional badge header row over a description line, in the shared
 *  `HoverTip` component's own text styling. */
export function tipHeader(title: React.ReactNode, desc: string, badge?: React.ReactNode): React.ReactNode {
  return (
    <>
      <span className="flex items-center gap-[0.4em] leading-none">
        {title}
        {badge}
      </span>
      <span className="block text-[0.68em] text-[#cdbe91] mt-[0.25em] leading-tight">{desc}</span>
    </>
  );
}

/**
 * The stat card behind each monster in the next-wave strip. Scouting the wave meant
 * either remembering the bestiary or letting one through and reading the hover panel
 * mid-fight — this shows what you're about to face while you can still build for it.
 *
 * The numbers are already wave-scaled by the engine, and it deliberately mirrors the
 * live enemy panel's icons and ordering (HP / Weakness / Move speed / Gold), so the
 * two read as the same card: what you scout is what you'll hover.
 */
export function WavePreviewCard({ m }: { m: UIState['wavePreview'][number] }) {
  const wk = weaknessTag(m.weakness, m.styleWeakness);
  return (
    // Anchored BELOW the strip, not above it: the strip lives at the top of the
    // screen, so a card hanging off its top edge would be cut by the viewport.
    <span
      className="hidden group-hover:block absolute top-full left-1/2 -translate-x-1/2 mt-[0.5em] z-40 pointer-events-none rs-panel p-[0.5em] w-[11em]"
      role="tooltip"
    >
      <span className="flex items-center gap-[0.35em] mb-[0.3em]">
        <span className={`font-bold truncate ${m.isBoss ? 'text-osrs-red' : 'text-osrs-orange'}`}>{m.name}</span>
        {m.isBoss && <span className="text-[0.55em] text-osrs-red uppercase tracking-wide shrink-0">Boss</span>}
      </span>
      <span className="grid grid-cols-2 gap-x-[0.5em] gap-y-[0.1em] text-[0.7em]">
        <StatLabel icon={ASSETS.misc.orb_hitpoints}>HP</StatLabel>
        <span className="text-right text-white tabular-nums">{fmt(m.hp)}</span>
        <StatLabel icon={ASSETS.debuffs.vuln}>Weakness</StatLabel>
        <span className="text-right capitalize" style={{ color: wk?.color ?? '#9a9a9a' }}>{wk ? wk.label : 'None'}</span>
        <StatLabel icon={ASSETS.misc.orb_run}>Move speed</StatLabel>
        <span className="text-right text-white tabular-nums">{m.speed}</span>
        <StatLabel icon={ASSETS.misc.coins_icon}>Gold</StatLabel>
        <span className="text-right text-osrs-yellow tabular-nums">{m.reward}</span>
        <StatLabel icon={ASSETS.misc.hp_icon} title="Lives lost if one of these reaches the end">Leak cost</StatLabel>
        <span className="text-right text-osrs-red tabular-nums">−{m.leakCost}</span>
      </span>
      {/* The count is the reason to care about the numbers above. */}
      <span className="block mt-[0.35em] pt-[0.3em] border-t border-[var(--rs-keyline)] text-[0.65em] text-[#b3a585] text-center">
        {m.count} incoming · {fmt(m.hp * m.count)} HP total
      </span>
    </span>
  );
}

/** Flight time of a picked draft card, from the table to the Boons/Relics tab.
 *  Must match the `draft-card-fly` animation in globals.css — the engine's pick is
 *  committed when it lands. */
export const DRAFT_FLY_MS = 620;

/** How long the event's description announces itself unprompted at the start of a
 *  wave. Real seconds — an event you only discover by hovering is an event you play
 *  the whole wave without knowing about. */
export const EVENT_ANNOUNCE_MS = 8000;

/** Compact, always-on-screen wave-event indicator, docked in the top-centre HUD so
 *  the active twist stays visible even when the main panel is collapsed. Hover for
 *  the full description; the banner in the main panel carries it inline. */
export function WaveEventChip({ event }: { event: NonNullable<UIState['activeEvent']> }) {
  const boon = event.tone === 'boon';
  // The chip mounts when the wave goes live, so mount *is* the wave start.
  const [announcing, setAnnouncing] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setAnnouncing(false), EVENT_ANNOUNCE_MS);
    return () => clearTimeout(t);
  }, []);
  // Touching the chip ends the announcement and hands the bubble to the pointer,
  // so it then closes on mouse-out like every other tooltip in the game. Without
  // this the two owners fight: the bubble is forced open by the timer, so leaving
  // the chip doesn't dismiss it, and the player is left with a tooltip that
  // ignores them until the countdown happens to end.
  const takeOver = () => setAnnouncing(false);
  return (
    <HoverTip
      side="bottom"
      show={announcing}
      content={tipHeader(
        <span className="text-[0.85em] font-bold" style={{ color: event.color }}>{event.name}</span>,
        event.desc,
        <span className="text-[0.58em] uppercase tracking-wide px-[0.35em] py-[0.05em] rounded-sm" style={{ background: `${event.color}22`, color: event.color }}>
          {boon ? 'Boon' : 'Hazard'}
        </span>,
      )}
    >
      <div
        className="wave-event-chip rs-panel flex items-center gap-[0.4em] pl-[0.3em] pr-[0.55em] py-[0.25em] pointer-events-auto"
        style={{ border: `1px solid ${event.color}`, boxShadow: `0 0 8px ${event.color}66` }}
        onMouseEnter={takeOver}
        // Also on move: the chip can mount right under a pointer that never
        // moved, so no mouseenter is coming (HoverTip has the same guard).
        onMouseMove={takeOver}
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
    </HoverTip>
  );
}
