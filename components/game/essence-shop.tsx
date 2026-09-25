'use client';

import React from 'react';
import { ASSETS, iconUrl } from '@/lib/game/assets';
import {
  GLOBAL_UPGRADE_DEFS,
  formatUpgradeValue,
  isMaxed,
  nextCost,
  previewUpgradeValue,
  refundValue,
} from '@/lib/game/systems/meta-progression';
import type { GlobalUpgrades } from '@/lib/game/types';
import { HoverTip } from './HoverTip';
import { fmt, hideBrokenImg } from './ui-kit';

/**
 * The Essence Shop: the permanent upgrades essence buys, and the button that
 * takes them all back.
 *
 * It lives here rather than inside GameRoot because two places open it — the
 * bottom bar's essence stone during a run, and the start screen's Account tab
 * between runs — and a second copy of the rows would drift from the first.
 * It owns no state: essence and upgrade levels come in as props, the two
 * actions go out as callbacks.
 */
export function EssenceShop({ essence, upgrades, onBuy, onRefund }: {
  essence: number;
  upgrades: GlobalUpgrades;
  onBuy: (id: keyof GlobalUpgrades) => void;
  onRefund: () => void;
}) {
  const refund = refundValue(upgrades);
  return (
    <>
      <div className="rs-panel-title flex items-center gap-2">
        <img src={ASSETS.misc.rune_essence_icon} alt="" className="w-[1.3em] h-[1.3em] object-contain" onError={hideBrokenImg} />
        Essence Shop
      </div>
      <div className="flex items-center justify-between mt-[0.5em] px-[0.2em] text-[0.8em]">
        <span className="text-[#cdbe91] uppercase tracking-wide">Rune Essence</span>
        <span className="flex items-center gap-[0.3em] text-[#7ce0ff] font-bold">
          <img src={ASSETS.misc.rune_essence_icon} alt="" className="w-[1.1em] h-[1.1em] object-contain" onError={hideBrokenImg} />
          {fmt(essence)}
        </span>
      </div>
      <div className="space-y-[0.4em] mt-[0.6em] pr-[0.2em]">
        {GLOBAL_UPGRADE_DEFS.map((def) => {
          const value = upgrades[def.id];
          const maxed = isMaxed(def, value);
          const cost = nextCost(def, value);
          const afford = essence >= cost;
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
                onClick={() => onBuy(def.id)}
                disabled={maxed || !afford}
                className={`rs-ge-row w-full flex items-center gap-[0.6em] p-[0.4em] text-left ${maxed || !afford ? 'rs-slot-unafford' : ''}`}
              >
                <img src={iconUrl(def.icon)} alt="" className="w-[1.8em] h-[1.8em] object-contain shrink-0" onError={(e) => { (e.target as HTMLImageElement).style.visibility = 'hidden'; }} />
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
      <button
        onClick={onRefund}
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
      <p className="text-center text-[0.66em] text-[#b3a585] mt-[0.6em]">
        Permanent upgrades · earn essence by clearing waves
      </p>
    </>
  );
}
