'use client';

import React from 'react';
import { ASSETS } from '@/lib/game/assets';
import type { UIState } from '@/lib/game/core/engine';
import { DRAFT_POOL, RARITY_WEIGHT, type DraftCard, type DraftEffect } from '@/lib/game/systems/roguelite-draft';
import type { Relic, RelicTier } from '@/lib/game/systems/relics';
import { fs, fmt, hideBrokenImg, usePersistedCollapse } from './ui-kit';
import { RARITY_COLOR, TIER_COLOR, TIER_LABEL, RELIC_BY_ID, effectTag, bandStyle } from './draft-cards';

/**
 * The roguelite run seen as a build: the relics claimed so far, the boons they
 * stack into, and the shop row that buys another card roll.
 *
 * These are the panels that answer "what am I actually playing this run?", so
 * they read from the drafted-card list rather than from live combat state. Moved
 * out of GameRoot.tsx verbatim.
 */

/** Resolve a drafted-card id back to its pool definition. */
export const CARD_BY_ID: Record<string, DraftCard> = Object.fromEntries(DRAFT_POOL.map((c) => [c.id, c]));

/** The three stats boon cards can buff, as shown grouped in the tower panel. */
export type BoonGroupId = 'damage' | 'range' | 'speed';
/** One boon card's contribution to a stat group (breakdown popover rows). */
export type BoonSource = { id: string; icon: string; name: string; count: number; frac: number };
/** Chip meta per boon stat group: short label, popover title, accent colour. */
export const BOON_GROUP_META: { id: BoonGroupId; label: string; title: string; color: string }[] = [
  { id: 'damage', label: 'DMG', title: 'Damage boons', color: '#ff9040' },
  { id: 'range', label: 'RNG', title: 'Range boons', color: '#5ec8ff' },
  { id: 'speed', label: 'SPD', title: 'Attack-speed boons', color: '#ffd257' },
];

/** Which card each per-tower relic effect comes from, so the tower panel can show
 *  the relic's icon/name as a boost chip. */
export const SYNERGY_CARD_ID: Record<'packTactics' | 'trinity' | 'vanguard' | 'loneWolf', string> = {
  packTactics: 'clan_vexillum', trinity: 'combat_triangle', vanguard: 'dinhs_bulwark', loneWolf: 'lone_wolf',
};
export const MAGE_CARD_ID: Record<string, string> = {
  elemental: 'tome_of_fire', ancients: 'ancient_sceptre', utility: 'lunar_staff',
};

/** True when a card leaves a lasting mark on the run (a rule-changing relic),
 *  not a one-shot resource (gold/essence/life) that's spent the moment it's taken. */
export function isRelicCard(card: DraftCard): boolean {
  const oneShot = new Set(['gold', 'essence', 'life']);
  const walk = (e: DraftEffect): boolean => (e.kind === 'multi' ? e.effects.some(walk) : !oneShot.has(e.kind));
  return walk(card.effect);
}

/** Roguelite build-at-a-glance: the relics drafted this run as a wrapped strip of
 *  rarity-bordered icons (×N badge for stacked stat cards), each with a hover
 *  tooltip naming the relic and its effect. One-shot resource cards are omitted. */
export function RelicStrip({ cards, highlight }: { cards: { id: string; count: number }[]; highlight?: string[] | null }) {
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
                title={`${card.name}: ${effectTag(card.effect)}`}
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
export function RunBuild({ cards }: { cards: { id: string; count: number }[] }) {
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
            title={`${card.name}: ${effectTag(card.effect)}`}
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
export type RelicView = { id: string; name: string; desc: string; tier: string; icon: string };

/**
 * The roguelite's card shop: one button that buys a draft hand with gold.
 *
 * Cards used to be a free per-wave handout, which meant the mode's build was on
 * rails — you got one every wave whatever you did. Buying them puts the run's
 * cards in tension with its towers over the same purse, and the price climbing per
 * roll (see `cardRollCost`) stops a rich late run from simply buying the whole pool.
 */
export function BuyCardRoll({ ui, onBuy, disabledReason = null }: { ui: UIState; onBuy: () => void; disabledReason?: string | null }) {
  const cost = ui.cardRollCost;
  const afford = ui.money >= cost;
  // A rule (e.g. a wave in progress) blocks the buy regardless of gold. Rather than
  // vanish, the button stays put and disabled, saying why — so the player learns the
  // rule instead of wondering where it went.
  const blocked = !!disabledReason;
  const disabled = blocked || !afford;
  const title = blocked
    ? disabledReason!
    : afford
      ? `Buy a hand of reward cards for ${cost} gp and keep one. Each roll makes the next dearer.`
      : `A card roll costs ${cost} gp. You need ${cost - ui.money} more.`;
  return (
    <button
      onClick={onBuy}
      disabled={disabled}
      title={title}
      className={`rs-btn w-full flex items-center justify-center gap-[0.4em] px-[0.6em] py-[0.3em] mb-[0.5em] ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      <img src={ASSETS.misc.cards_icon} alt="" className="w-[1.1em] h-[1.1em] object-contain" onError={hideBrokenImg} />
      <span className="text-[0.8em] font-bold">Buy Card Roll</span>
      {blocked
        ? <span className="text-[0.7em] text-[#cdbe91] italic">{disabledReason}</span>
        : <span className={`text-[0.75em] tabular-nums ${afford ? 'text-osrs-yellow' : 'text-[#ff6b6b]'}`}>{fmt(cost)} gp</span>}
    </button>
  );
}

/** A relic offered by a defeated boss, framed like a draft card but in the relic
 *  tier palette. Relics carry their own one-line examine, so there's no live stat
 *  preview band — the whole card is the pitch. */
export function RelicCardView({ relic, onPick }: { relic: RelicView; onPick?: () => void }) {
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

/** Roguelite owned-relics tray: the run's claimed relics as tier-bordered icons
 *  with a hover tooltip. Rendered in the HUD and the end-of-run summary. */
export function OwnedRelicTray({ ids, summary }: { ids: string[]; summary?: boolean }) {
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
            title={`${relic.name}: ${relic.desc}`}
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
