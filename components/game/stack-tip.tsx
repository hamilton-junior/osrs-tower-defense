'use client';

import React from 'react';
import { ASSETS, coinsIcon } from '@/lib/game/assets';
import type { UiStack } from '@/lib/game/core/engine';
import { FOOD_BY_ID, isCracked, type FoodId } from '@/lib/game/data/food';
import { POTION_BY_ID, type PotionId } from '@/lib/game/data/herblore';
import { potionTooltip } from './potion-tip';
import { fmt, hideBrokenImg } from './ui-kit';

export interface StackTipContext {
  lives: number;
  maxLives: number;
  waveActive: boolean;
  /** `UIState.sellMult` — what the sale is really worth right now. */
  sellMult: number;
  /** A red line under the card, for the one thing blocking the click right now. */
  warn?: string;
}

/**
 * The hover card for a carried or bagged stack of herbs, potions or fish.
 *
 * A fish previews what eating it now would do, the way RuneLite's item stats overlay
 * previews food: the lives it heals, always green, then where eating it leaves the
 * orb against its maximum. That second half is green when every life lands, yellow
 * when part of it spills past the maximum, red when there is nothing to heal. At
 * full lives the engine sells the fish instead of wasting it, so the card also
 * prints what the sale pays.
 *
 * A potion gets the potion card (`potion-tip`), the same one the Herblore bench
 * shows. A herb has no number to preview and shows its own line.
 */
export function stackTip(s: UiStack, ctx: StackTipContext): React.ReactNode {
  const food = s.kind === 'food' ? FOOD_BY_ID[s.id as FoodId] : undefined;
  // A cracked catch has no heal to preview: its own tip line already prints the
  // essence the crack pays, so it takes the plain card.
  const fish = food && !isCracked(food) ? food : undefined;
  const potion = s.kind === 'potion' ? POTION_BY_ID[s.id as PotionId] : undefined;
  if (potion) {
    return potionTooltip(potion, {
      vitals: { lives: ctx.lives, maxLives: ctx.maxLives },
      note: ctx.waveActive ? 'Only between waves' : undefined,
      warn: ctx.warn,
    });
  }
  return (
    <div className="flex flex-col gap-[0.25em]">
      <span className="text-white">{s.name}</span>
      {fish ? <FoodPreview heal={fish.lives} gold={Math.round(fish.gold * ctx.sellMult)} lives={ctx.lives} maxLives={ctx.maxLives} waveActive={ctx.waveActive} /> : (
        <span className="text-[0.8em] text-[#c9b78c] leading-snug">{s.tip}</span>
      )}
      {ctx.warn && <span className="text-[0.8em] text-osrs-red">{ctx.warn}</span>}
    </div>
  );
}

function FoodPreview({ heal, gold, lives, maxLives, waveActive }: Omit<StackTipContext, 'warn' | 'sellMult'> & { heal: number; gold: number }) {
  const full = lives >= maxLives;
  const gain = full ? 0 : Math.min(heal, maxLives - lives);
  const after = full ? 'text-osrs-red' : gain < heal ? 'text-osrs-yellow' : 'text-osrs-green';
  return (
    <>
      <span className="flex items-center gap-[0.35em] text-[0.85em]">
        <img src={ASSETS.misc.orb_hitpoints} alt="Lives" className="w-[1.2em] h-[1.2em] object-contain" onError={hideBrokenImg} />
        <span className="text-osrs-green">+{heal}</span>
        <span className={after}>({lives + gain}/{maxLives})</span>
      </span>
      {full && (
        <span className="flex items-center gap-[0.3em] text-[0.8em] text-[#c9b78c]">
          Sells for {fmt(gold)}
          <img src={coinsIcon(gold)} alt="gp" className="w-[1.2em] h-[1.2em] object-contain" onError={hideBrokenImg} />
        </span>
      )}
      {waveActive && <span className="text-[0.8em] text-[#8a7c5c]">Only between waves</span>}
    </>
  );
}
