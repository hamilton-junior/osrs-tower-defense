'use client';

import React from 'react';
import { ASSETS } from '@/lib/game/assets';
import { RELICS, type Relic, type RelicTier } from '@/lib/game/systems/relics';
import type { DraftCard, DraftRarity, DraftEffect } from '@/lib/game/systems/roguelite-draft';
import type { UIState } from '@/lib/game/core/engine';
import { hideBrokenImg, fs, fmt } from './ui-kit';

/**
 * The roguelite draft card as the player sees it: rarity and relic-tier palettes,
 * the one-line effect tag, the "what this would change" preview rows, and the
 * card face itself.
 *
 * `previewRows` is the honest part — it shows the delta against the run's current
 * state, so a +6% damage card reads differently on wave 3 than on wave 30. Moved
 * out of GameRoot.tsx verbatim.
 */

/** Draft-card rarity palette + labels, lifted from the OSRS TCG plugin's tier
 *  colours (common white, rare blue, epic purple). */
export const RARITY_COLOR: Record<DraftRarity, string> = {
  common: '#FFFFFF',
  uncommon: '#2ECC71',
  rare: '#3498DB',
  ultra: '#9B59B6',
};
export const RARITY_LABEL: Record<DraftRarity, string> = {
  common: 'Common',
  uncommon: 'Uncommon',
  rare: 'Rare',
  ultra: 'Ultra-rare',
};

/** Relic tier palette + labels — warmer/regal tones to read distinct from the
 *  draft-card rarities (minor bronze, major gold, mythic crimson). */
export const TIER_COLOR: Record<RelicTier, string> = {
  minor: '#CD7F32',
  major: '#F2C94C',
  mythic: '#E74C3C',
};
export const TIER_LABEL: Record<RelicTier, string> = {
  minor: 'Minor Relic',
  major: 'Major Relic',
  mythic: 'Mythic Relic',
};
export const RELIC_BY_ID: Record<string, Relic> = Object.fromEntries(RELICS.map((r) => [r.id, r]));

/** Combat-style → its OSRS combat-triangle icon (sword / bow / staff), used to
 *  replace the words "melee"/"ranged"/"magic" inline in card text. */
export const STYLE_ICON: Record<'melee' | 'ranged' | 'magic', string> = {
  melee: ASSETS.misc.attack_icon,
  ranged: ASSETS.misc.ranged_icon,
  magic: ASSETS.misc.magic_icon,
};

/** Inline combat-style icon sized to the text it sits in. */
export function StyleIcon({ style }: { style: 'melee' | 'ranged' | 'magic' }) {
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
export function renderWithStyleIcons(text: string): React.ReactNode {
  return text.split(/(melee|ranged|magic)/gi).map((part, i) => {
    const low = part.toLowerCase();
    if (low === 'melee' || low === 'ranged' || low === 'magic') return <StyleIcon key={i} style={low} />;
    return <React.Fragment key={i}>{part}</React.Fragment>;
  });
}

/** Format a multiplier's bonus as a percent, keeping a single decimal only when
 *  needed (so 1.075 → "7.5", 1.03 → "3") — buff steps can be fractional now. */
export const pctStr = (mult: number) => String(+((mult - 1) * 100).toFixed(1));

/** Short stat tag for a single effect (collection-log / static use, no run). */
export function effectTag(e: DraftEffect): string {
  switch (e.kind) {
    case 'slayerPoints': return `+${e.amount} slayer pts`;
    case 'essence': return `+${e.amount} ess`;
    case 'life': return `+${e.amount} lives`;
    case 'maxLife': return `+${e.amount} max life`;
    case 'damage': return `+${pctStr(e.mult)}% ${e.style ? e.style + ' ' : ''}dmg`;
    case 'range': return `+${pctStr(e.mult)}% ${e.style ? e.style + ' ' : ''}range`;
    case 'fireRate': return `+${pctStr(e.mult)}% ${e.style ? e.style + ' ' : ''}speed`;
    // behavioural cards — describe the rule, not a number
    case 'ricochet': return `kill arcs ${Math.round(e.frac * 100)}% to nearest`;
    case 'overkill': return 'overkill cleaves on';
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
export interface PreviewCtx {
  runMods: UIState['runMods'];
  slayerPoints: number;
  essence: number;
  lives: number;
  maxLives: number;
}

/** One "current → new total" line for the card's stats band. */
export interface PreviewRow {
  style?: 'melee' | 'ranged' | 'magic';
  label: string;
  from: string;
  to: string;
}

export const STAT_PCT = (v: number) => `+${pctStr(v)}%`;
export const styleMods = (m: { melee: number; ranged: number; magic: number }, style?: 'melee' | 'ranged' | 'magic') =>
  style ? m[style] : (m.melee + m.ranged + m.magic) / 3;

/** Flatten a card's effect into "current → after-pick" rows against live run state. */
export function previewRows(card: DraftCard, ctx: PreviewCtx): PreviewRow[] {
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
      case 'slayerPoints': rows.push({ label: 'slayer pts', from: fmt(ctx.slayerPoints), to: fmt(ctx.slayerPoints + e.amount) }); break;
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
export function bandStyle(base: string, grow: number): React.CSSProperties {
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
export function DraftCardView({ card, onPick, ctx, locked, count, fill, large, unseen }: {
  card: DraftCard;
  onPick?: () => void;
  ctx?: PreviewCtx;
  locked?: boolean;
  count?: number;
  fill?: boolean;
  /** Enlarge the whole card (the draft-selection overlay) so it reads at a glance. */
  large?: boolean;
  /** This card has never been drafted on this account — badge it, so a collection-log
   *  gap is visible at the one moment the player can actually close it. */
  unseen?: boolean;
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
      {/* Mirrors the ×count badge on the right: that one says "you have this", this one
          says "you don't". Sits opposite it so a card can carry either, never both. */}
      {unseen && (
        <span
          className="absolute top-[2px] left-[2px] font-osrs text-osrs-yellow"
          style={{ fontSize: fs('clamp(8px,0.66vw,11px)'), textShadow: '0 1px 2px #000', background: 'rgba(0,0,0,0.55)', borderRadius: 4, padding: '0 0.3em' }}
        >
          NEW
        </span>
      )}
      {foil && <span className="draft-foil" aria-hidden />}
    </button>
  );
}
