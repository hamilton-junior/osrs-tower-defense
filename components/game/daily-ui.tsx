'use client';

import React from 'react';
import { ASSETS } from '@/lib/game/assets';
import { dayLabel, type DayKey } from '@/lib/game/systems/daily-seed';
import { dailyStreak, dayStrip, type DailyBoard } from '@/lib/game/systems/daily-score';
import { hideBrokenImg } from './ui-kit';

/**
 * The daily challenge's two shared pieces: the week strip and the end-of-run line.
 *
 * Both the start screen's Journal tab and the end-of-run screen show the week, so
 * it lives here rather than in either of them.
 */

/** How many days the strip shows. A week is the stretch a streak is read in, and
 *  seven cells fit the panel at its narrowest. */
export const STRIP_DAYS = 7;

/**
 * The last week, one cell per day: the wave that day's best run reached, a dash
 * for a day nobody played. The day in question is marked, so a run reads against
 * the week it belongs to.
 */
export function DailyStrip({ day, board }: { day: DayKey; board: DailyBoard }) {
  return (
    <div className="flex items-end justify-center gap-[0.25em] mt-[0.55em]">
      {dayStrip(board, day, STRIP_DAYS).map(({ key, score }) => {
        const isDay = key === day;
        return (
          <div key={key} className="flex flex-col items-center gap-[0.15em] w-[2.3em]">
            <div
              className={`w-full py-[0.2em] text-center text-[0.8em] font-bold bg-[#1c1812] border ${
                isDay ? 'border-[var(--osrs-orange)] text-osrs-orange'
                  : score ? 'border-[var(--rs-keyline)] text-osrs-yellow'
                  : 'border-[var(--rs-keyline)] text-[#6f6656]'
              }`}
              title={score ? `${dayLabel(key)} — wave ${score.wave}` : `${dayLabel(key)} — not played`}
            >
              {score ? score.wave : '–'}
            </div>
            {/* The day of the month alone: the month is already in the line above. */}
            <span className="text-[0.6em] uppercase tracking-wide text-[#8f8574]">{dayLabel(key).split(' ')[0]}</span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * The daily's line on an end-of-run screen: what today's board holds now that this
 * run has been filed, and whether this run is the one holding it.
 */
export function DailyEndLine({ day, board, isBest }: { day: DayKey; board: DailyBoard; isBest: boolean }) {
  const best = board.days[day] ?? null;
  const streak = dailyStreak(board, day);
  return (
    <div className="rs-panel-inset px-[0.6em] py-[0.5em] mb-4 text-[0.95em]">
      <div className="flex items-center justify-center gap-[0.5em]">
        <img src={ASSETS.misc.signpost} alt="" className="w-[1.3em] h-[1.3em] object-contain" onError={hideBrokenImg} />
        <span className="text-[0.82em] text-[#d3c3a0] uppercase tracking-wide">{dayLabel(day)} best</span>
        <span className="text-osrs-yellow font-bold">Wave {best ? best.wave : '–'}</span>
        {isBest && <span className="text-[0.78em] text-osrs-orange uppercase tracking-wide">new</span>}
      </div>
      <DailyStrip day={day} board={board} />
      {streak > 1 && (
        <div className="text-center text-[0.72em] text-osrs-orange font-bold mt-[0.4em]" title="Days played in a row">
          {streak}-day streak
        </div>
      )}
    </div>
  );
}
