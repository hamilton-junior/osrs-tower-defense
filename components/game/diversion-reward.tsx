'use client';

import React from 'react';
import { coinsIcon } from '@/lib/game/assets';
import { DIVERSION_REWARD_META } from '@/lib/game/data/diversions';
import type { DiversionReward } from '@/lib/game/systems/diversions';
import { fmt, hideBrokenImg } from './ui-kit';

const ICON = 'w-[1.2em] h-[1.2em] object-contain shrink-0';

/**
 * One Distractions & Diversions payout as an icon and a green `+N`: the chip the
 * hover card, the toast and the Collection Log all read a reward by. Gold reads
 * number first and then the coin stack, like every price in the game; the rest lead
 * with their icon, like the potion and fish cards.
 */
export function RewardChip({ reward, sign = true }: { reward: DiversionReward; sign?: boolean }) {
  const meta = DIVERSION_REWARD_META[reward.kind];
  const value = <span className="tabular-nums text-osrs-green">{sign ? '+' : ''}{fmt(reward.amount)}</span>;
  if (reward.kind === 'gold') {
    return (
      <span className="inline-flex items-center gap-[0.3em] whitespace-nowrap" title={meta.label}>
        {value}
        <img src={coinsIcon(reward.amount)} alt={meta.label} className={ICON} onError={hideBrokenImg} />
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-[0.3em] whitespace-nowrap" title={meta.label}>
      <img src={meta.icon} alt={meta.label} className={ICON} onError={hideBrokenImg} />
      {value}
    </span>
  );
}

/** Every payout a click could land, in one row. More than one means the click rolls
 *  one of them (the bird nest), so they are joined with "or". */
export function RewardOptions({ rewards }: { rewards: DiversionReward[] }) {
  if (rewards.length === 0) return null;
  return (
    <span className="flex flex-wrap items-center gap-x-[0.5em] gap-y-[0.2em] text-[0.8em]">
      {rewards.map((r, n) => (
        <React.Fragment key={r.kind}>
          {n > 0 && <span className="text-[#9d8f6a]">or</span>}
          <RewardChip reward={r} />
        </React.Fragment>
      ))}
    </span>
  );
}
