'use client';

import React, { useLayoutEffect, useRef, useState } from 'react';
import type { GameMode } from '@/lib/game/core/engine';
import type { GlobalUpgrades } from '@/lib/game/types';
import type { RunSave } from '@/lib/game/systems/run-save';
import { DIFFICULTY_TIERS, isTierUnlocked, tierLabel, type DifficultyTier } from '@/lib/game/systems/difficulty';
import { ASSETS, iconUrl } from '@/lib/game/assets';
import { essenceRateLabel } from '@/lib/game/systems/meta-progression';
import { CA_TIERS, CA_TIER_NAMES, type CaTier } from '@/lib/game/systems/combat-achievements';
import { dayLabel, type DayKey } from '@/lib/game/systems/daily-seed';
import { dailyRules } from '@/lib/game/systems/daily-rules';
import { dailyRecords, dailyStreak, type DailyBoard } from '@/lib/game/systems/daily-score';
import { accountStats } from '@/lib/game/systems/account-stats';
import { nextFit } from '@/lib/game/systems/screen-fit';
import { ENEMY_ANIMS } from '@/lib/game/data/enemy-anims';
import type { LogTab } from './collection-log';
import { DailyStrip } from './daily-ui';
import { EssenceShop } from './essence-shop';
import { StartLobby } from './start-lobby';
import { fs, fmt, fmtTime, hideBrokenImg, GoStat, StatText } from './ui-kit';
import { agoLabel, type DifficultyProgress, type Victories } from './save';

/**
 * The title screen, built like an OSRS interface: the window's wood shows at the
 * edges, a stone-framed room sits in the middle, and inside it one small panel
 * carries three tabs — Play, Daily, Account.
 *
 * Only one tab is on screen at a time, so the screen stays the size of a panel
 * however much the account behind it grows. The one thing that never hides is the
 * Continue band: a run left in progress is offered above the tabs, or not at all.
 *
 * Mode and difficulty are still chosen here and nowhere else, because the engine
 * freezes both once a run begins.
 */

/** The two modes, as the screen shows them. Static — the cards differ only in
 *  what they say, so the copy lives here rather than being rebuilt per render. */
const MODES: { id: GameMode; name: string; tag: string; desc: string; icon: string; wip?: string }[] = [
  {
    id: 'classic', name: 'Classic', tag: 'Pure Tower Defense',
    desc: 'Build towers and survive the waves. No cards, no relics.',
    icon: iconUrl('Dwarf_multicannon'),
  },
  {
    id: 'roguelite', name: 'Roguelite', tag: 'Buy reward cards with gold',
    desc: 'Classic, plus reward cards you buy with gold between waves. Bosses pay relics.',
    icon: ASSETS.misc.cards_icon,
    // Said before the run rather than discovered during it: the cards and their
    // numbers are still moving, and a player who knows that reads a swingy run
    // as the mode being unfinished instead of the game being broken.
    wip: 'Mode and Balance still WIP',
  },
];

/** The three tabs, in the order they sit on the strip. Icon-only, like the game's
 *  own tab strips — the name is on the hover title. */
const TABS = [
  { id: 'play', name: 'Play', icon: ASSETS.misc.multicombat_icon },
  { id: 'daily', name: 'Daily Challenge', icon: ASSETS.misc.compass },
  { id: 'account', name: 'Account', icon: ASSETS.misc.rune_essence_icon },
] as const;

type TabId = (typeof TABS)[number]['id'];

/** Both paths out of the start screen destroy the saved run — throwing it away
 *  outright, or starting a fresh one over it. Neither is undoable, so each asks
 *  once, inline (an OSRS-style "are you sure" step rather than a browser dialog). */
type Confirming = 'discard' | 'new' | null;

/** One icon + figure, as the Continue band reads a saved run. */
function SaveStat({ icon, title, value }: { icon: string; title: string; value: React.ReactNode }) {
  return (
    <span className="flex items-center gap-[0.3em]" title={title}>
      <img src={icon} alt="" className="w-[1.15em] h-[1.15em] object-contain shrink-0" onError={hideBrokenImg} />
      <span className="text-[#e7d9b0] font-bold tabular-nums">{value}</span>
    </span>
  );
}

/**
 * The game's name between a Dwarf multicannon and a Giant rat, both facing the
 * wordmark. The rat is the first frame of the walk the lobby's rats play, mirrored
 * the way a rat walking left is, so the title and the floor show one animal.
 * Under it, whatever the account has earned the right to wear.
 */
function Wordmark({ champion, wins, caTitle }: { champion: boolean; wins: number; caTitle: CaTier | null }) {
  const ratWalk = ENEMY_ANIMS.rat?.clips.walk;
  return (
    <div className="text-center">
      {/* Centring the boxes leaves the eye off-centre: the cannon's head rides above
          its thin legs and the rat's body hangs under its raised tail. The nudges
          put the head and the body level with the lettering. */}
      <div className="flex items-center justify-center gap-[0.7em]">
        <img src={ASSETS.towers.cannon[3]} alt="" className="w-[2.2em] h-[2.2em] translate-y-[0.1em] object-contain shrink-0" onError={hideBrokenImg} />
        <div className="text-osrs-orange font-bold leading-none" style={{ fontSize: fs('clamp(18px, 2.1vw, 28px)') }}>
          OSRS Tower Defense
        </div>
        {ratWalk && (
          <div
            // The rat is long and low, so a bigger box gives it the cannon's weight;
            // the negative margin keeps the row's height.
            className="w-[3.6em] h-[3.6em] -my-[0.7em] shrink-0 bg-no-repeat"
            style={{
              backgroundImage: `url(${ratWalk.url})`,
              backgroundSize: `${ratWalk.frames * 100}% 100%`,
              backgroundPosition: '0 0',
              transform: 'translateY(-0.5em) scaleX(-1)',
            }}
          />
        )}
      </div>
      {(champion || caTitle) && (
        <div className="flex items-center justify-center gap-[0.8em] mt-[0.45em] text-[0.78em] font-bold uppercase tracking-wider text-osrs-yellow">
          {champion && (
            <span className="flex items-center gap-[0.3em]" title={`Champion: ${wins} run${wins === 1 ? '' : 's'} won`}>
              <img src={ASSETS.misc.trophy} alt="" className="w-[1.1em] h-[1.1em] object-contain" onError={hideBrokenImg} />
              Champion
            </span>
          )}
          {caTitle && (
            <span className="flex items-center gap-[0.3em]" title={`Combat Achievements: the ${CA_TIER_NAMES[caTitle]} tier cleared in full`}>
              <img src={ASSETS.achievements[caTitle]} alt="" className="w-[1em] h-[1em] object-contain" onError={hideBrokenImg} />
              {CA_TIER_NAMES[caTitle]}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * The saved run, offered back above the tabs.
 *
 * It sits outside the tab strip on purpose: a player who left mid-run wants one
 * button, and hunting for it behind a tab is the one thing this screen must not
 * make them do. With no save on disk the band is absent entirely.
 */
function ContinueBand({ saved, confirm, setConfirm, onContinue, onDiscard }: {
  saved: RunSave;
  confirm: Confirming;
  setConfirm: (c: Confirming) => void;
  onContinue: () => void;
  onDiscard: () => void;
}) {
  return (
    <div className="rs-panel-inset p-[0.55em] flex flex-col gap-[0.45em]">
      <div className="flex items-center gap-[0.6em]">
        {/* The saved run's own mode icon — the same one its mode card wears. */}
        <img
          src={MODES.find((m) => m.id === saved.gameMode)?.icon}
          alt=""
          className="w-[1.7em] h-[1.7em] object-contain shrink-0"
          onError={hideBrokenImg}
        />
        <div className="flex flex-col min-w-0">
          <span className="text-osrs-yellow font-bold text-[0.95em] leading-tight">Run in progress</span>
          <span className="text-[0.68em] text-[#cdbe91] uppercase tracking-wide truncate">
            {saved.gameMode === 'roguelite' ? 'Roguelite' : 'Classic'} · {agoLabel(saved.savedAt)}
          </span>
        </div>
        <button
          className="rs-btn rs-btn-primary ml-auto px-[1.1em] py-[0.4em] text-[1em] animate-pulse shrink-0"
          title={`Resume the run at wave ${saved.wave}`}
          onClick={onContinue}
        >
          ▶ Continue
        </button>
      </div>

      {/* The run's state at a glance: each figure wears the icon it wears in-game
          (the wave's crossed swords, the hitpoints heart, the coin stack), so the
          band reads without a legend. */}
      <div className="flex flex-wrap items-center gap-x-[0.9em] gap-y-[0.25em] text-[0.78em]">
        <SaveStat icon={ASSETS.misc.attack_icon} title="Wave reached" value={`Wave ${saved.wave}`} />
        <SaveStat icon={ASSETS.misc.multicombat_icon} title="Towers on the board" value={saved.towers.length} />
        <SaveStat icon={ASSETS.misc.orb_hitpoints} title="Lives left" value={saved.lives} />
        <SaveStat icon={ASSETS.misc.coins_icon} title="Gold" value={fmt(saved.money)} />
        {confirm !== 'discard' && (
          <button
            className="ml-auto text-[0.85em] text-[#a89870] hover:text-osrs-warn"
            title="Throw the saved run away"
            onClick={() => setConfirm('discard')}
          >
            Discard
          </button>
        )}
      </div>

      {confirm === 'discard' && (
        <div className="flex items-center gap-[0.4em]">
          <span className="text-[0.72em] text-osrs-warn flex-1">Discard the run at wave {saved.wave}? This cannot be undone.</span>
          <button
            className="rs-btn px-[0.6em] py-[0.25em] text-[0.72em] text-osrs-warn"
            title="Delete the saved run for good"
            onClick={() => { setConfirm(null); onDiscard(); }}
          >
            Discard it
          </button>
          <button className="rs-btn px-[0.6em] py-[0.25em] text-[0.72em]" title="Keep the saved run" onClick={() => setConfirm(null)}>
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}

/** The two mode cards. Classic (pure TD) vs Roguelite (bought card rolls + boss
 *  relics) — the choice the whole screen exists for. */
function ModePicker({ mode, onSelect }: { mode: GameMode; onSelect: (m: GameMode) => void }) {
  return (
    <div className="grid grid-cols-2 gap-[0.6em]">
      {MODES.map((m) => {
        const on = mode === m.id;
        return (
          <button
            key={m.id}
            onClick={() => onSelect(m.id)}
            title={`${m.name}: ${m.desc}`}
            className="rs-panel-inset text-left flex flex-col gap-[0.3em] p-[0.6em]"
            style={{ outline: `2px solid ${on ? 'var(--osrs-orange)' : 'transparent'}`, opacity: on ? 1 : 0.78 }}
          >
            <div className="flex items-center gap-[0.5em]">
              <img src={m.icon} alt="" className="w-[1.6em] h-[1.6em] object-contain" onError={hideBrokenImg} />
              <span className="text-osrs-yellow font-bold text-[1.05em]">{m.name}</span>
              {on && <span className="ml-auto text-osrs-orange text-[0.9em]">✓</span>}
            </div>
            <span className="text-[0.64em] uppercase tracking-wide text-osrs-orange">{m.tag}</span>
            {/* Rune Essence rate for this mode — roguelite's in-run power is paid
                for with half the meta-currency (see essenceMultiplier). */}
            <span
              className="flex items-center gap-[0.3em] text-[0.72em] text-[#d3c3a0]"
              title="Rune Essence earned per wave cleared, relative to Classic"
            >
              <img src={ASSETS.misc.rune_essence_icon} alt="" className="w-[1em] h-[1em] object-contain" onError={hideBrokenImg} />
              Essence <span className="text-osrs-yellow font-bold">{essenceRateLabel(m.id, 'normal')}</span>
            </span>
            <span className="text-[0.74em] text-[#d3c3a0] leading-snug">{m.desc}</span>
            {/* The OSRS prohibited sign, the same glyph the board puts over a
                tower that is out of action — the game's own "careful with this"
                mark, so the notice needs no new asset. */}
            {m.wip && (
              <span className="flex items-center gap-[0.3em] text-[0.7em] leading-snug" style={{ color: 'var(--osrs-red)' }}>
                <img src={ASSETS.misc.blocked} alt="" className="w-[0.95em] h-[0.95em] object-contain shrink-0" onError={hideBrokenImg} />
                {m.wip}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/**
 * The New Game+ ladder, read as a ladder: a tier already cleared is ticked, the
 * armed one is lit, and anything past the top of your progress wears the game's
 * own blocked sign and cannot be pressed.
 */
function DifficultyLadder({ mode, difficulty, selectedTier, onSelectTier }: {
  mode: GameMode;
  difficulty: DifficultyProgress;
  selectedTier: DifficultyTier;
  onSelectTier: (t: DifficultyTier) => void;
}) {
  const cleared = difficulty.highestCleared[mode];
  return (
    <div className="rs-panel-inset p-[0.55em]">
      <div className="text-[0.7em] text-[#cdbe91] uppercase tracking-wide mb-[0.45em]">Difficulty</div>
      <div className="flex flex-wrap gap-[0.3em]">
        {DIFFICULTY_TIERS.map((t) => {
          const unlocked = isTierUnlocked(t.id, cleared);
          const beaten = t.id <= cleared;
          const on = t.id === selectedTier;
          return (
            <button
              key={t.id}
              disabled={!unlocked}
              className={`rs-btn flex items-center gap-[0.25em] px-[0.6em] py-[0.25em] text-[0.76em] ${on ? 'rs-btn-primary' : ''}`}
              style={{ opacity: unlocked ? 1 : 0.5 }}
              title={unlocked
                ? beaten ? `${tierLabel(t.id)} — cleared` : `Play at ${tierLabel(t.id)}`
                : `Locked. Win the tier below to unlock ${tierLabel(t.id)}`}
              onClick={() => unlocked && onSelectTier(t.id)}
            >
              {!unlocked && <img src={ASSETS.misc.blocked} alt="" className="w-[0.9em] h-[0.9em] object-contain" onError={hideBrokenImg} />}
              {beaten && <span className="text-osrs-green">✓</span>}
              {tierLabel(t.id)}
            </button>
          );
        })}
      </div>
      <div className="text-[0.66em] text-[#a89870] mt-[0.45em] leading-snug">
        Win a tier to unlock the next. Higher tiers give tougher enemies and a
        tighter economy. You play them for the record, not for power.
      </div>
    </div>
  );
}

/** The Play tab: pick a mode, pick a tier, go. */
function PlayTab({ mode, saved, difficulty, selectedTier, confirm, setConfirm, onSelect, onSelectTier, onStart, onSound }: {
  mode: GameMode;
  saved: RunSave | null;
  difficulty: DifficultyProgress;
  selectedTier: DifficultyTier;
  confirm: Confirming;
  setConfirm: (c: Confirming) => void;
  onSelect: (m: GameMode) => void;
  onSelectTier: (t: DifficultyTier) => void;
  onStart: () => void;
  onSound: (key: string) => void;
}) {
  return (
    <div className="flex flex-col gap-[0.6em]">
      <ModePicker mode={mode} onSelect={(m) => { onSound('click'); onSelect(m); }} />
      <DifficultyLadder
        mode={mode}
        difficulty={difficulty}
        selectedTier={selectedTier}
        onSelectTier={(t) => { onSound('click'); onSelectTier(t); }}
      />

      {/* The action stays pinned to the foot of the tab: on a short window the mode
          cards and the ladder scroll, and the button must not scroll away with them.
          A new run overwrites the saved one, so with a save on disk it asks first. */}
      <div className="rs-tab-foot">
      {saved && confirm === 'new' ? (
        <div className="flex flex-col gap-[0.35em]">
          <span className="text-[0.75em] text-osrs-warn text-center">
            Starting a new run discards the saved run at wave {saved.wave}.
          </span>
          <div className="flex gap-[0.4em]">
            <button
              className="rs-btn rs-btn-primary flex-1 py-[0.45em] text-[0.9em]"
              title="Discard the saved run and start fresh in this mode"
              onClick={() => { setConfirm(null); onSound('select'); onStart(); }}
            >
              ▶ Start a new run
            </button>
            <button className="rs-btn flex-1 py-[0.45em] text-[0.9em]" title="Keep the saved run" onClick={() => setConfirm(null)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          className={`rs-btn rs-btn-primary w-full py-[0.5em] text-[1.1em] ${saved ? '' : 'animate-pulse'}`}
          title={saved ? 'Discard the saved run and start fresh in this mode' : 'Lock in this mode and start the run'}
          onClick={() => { if (saved) { setConfirm('new'); } else { onSound('select'); onStart(); } }}
        >
          ▶ {saved ? 'New Run' : 'Confirm'}
        </button>
      )}
      </div>
    </div>
  );
}

/**
 * The Daily tab: today's challenge, the week behind it, and what the account has
 * ever managed on one.
 */
function DailyTab({ today, board, onStart, onSound }: {
  today: DayKey;
  board: DailyBoard;
  onStart: () => void;
  onSound: (key: string) => void;
}) {
  const best = board.days[today] ?? null;
  const streak = dailyStreak(board, today);
  const records = dailyRecords(board);
  const rules = dailyRules(today);
  return (
    <div className="flex flex-col gap-[0.6em]">
      <div className="rs-panel-inset p-[0.6em] flex flex-col gap-[0.35em]">
        <div className="flex items-center gap-[0.55em]">
          {/* The signpost: today everyone walks the same road. */}
          <img src={ASSETS.misc.signpost} alt="" className="w-[1.6em] h-[1.6em] object-contain shrink-0" onError={hideBrokenImg} />
          <div className="flex flex-col min-w-0">
            <span className="text-osrs-yellow font-bold text-[0.95em] leading-tight">{dayLabel(today)}</span>
            <span className="text-[0.68em] text-[#cdbe91] uppercase tracking-wide truncate">
              {best ? `best wave ${best.wave}` : 'not played yet'}
            </span>
          </div>
          {streak > 0 && (
            <span className="ml-auto text-[0.72em] text-osrs-orange font-bold shrink-0" title={`Played ${streak} day${streak === 1 ? '' : 's'} in a row`}>
              {streak}-day streak
            </span>
          )}
        </div>
        <p className="text-[0.72em] text-[#d3c3a0] leading-snug">
          Everyone gets the same map and the same waves today.
        </p>
        <button
          className="rs-btn rs-btn-primary w-full py-[0.45em] text-[0.95em]"
          title={best ? "Play today's challenge again — only your best run counts" : "Play today's challenge"}
          onClick={() => { onSound('select'); onStart(); }}
        >
          ▶ {best ? 'Play again' : 'Play'}
        </button>
      </div>

      <div className="rs-panel-inset p-[0.6em]">
        <div className="text-[0.7em] text-[#cdbe91] uppercase tracking-wide">Today&apos;s rules</div>
        <div className="flex flex-col gap-[0.2em] mt-[0.35em] text-[0.8em]">
          {[rules.boon, rules.curse].map((r) => (
            <span key={r.id} className={`flex items-center gap-[0.4em] ${r.kind === 'boon' ? 'text-osrs-green' : 'text-osrs-red'}`}>
              <img src={ASSETS.misc[r.icon]} alt="" className="w-[1.1em] h-[1.1em] object-contain" onError={hideBrokenImg} />
              {r.text}
            </span>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-x-[0.8em] gap-y-[0.2em] mt-[0.35em] text-[0.76em] text-[#d3c3a0]">
          <span className="flex items-center gap-[0.3em]">
            <img src={ASSETS.misc.multicombat_icon} alt="" className="w-[1em] h-[1em] object-contain" onError={hideBrokenImg} />
            Classic
          </span>
          <span className="flex items-center gap-[0.3em]">
            <img src={ASSETS.misc.stats_icon} alt="" className="w-[1em] h-[1em] object-contain" onError={hideBrokenImg} />
            Normal
          </span>
          <span className="flex items-center gap-[0.3em]">
            <img src={ASSETS.misc.orb_run} alt="" className="w-[1em] h-[1em] object-contain" onError={hideBrokenImg} />
            As many tries as you like
          </span>
        </div>
      </div>

      <div className="rs-panel-inset p-[0.6em]">
        <div className="text-[0.7em] text-[#cdbe91] uppercase tracking-wide">This week</div>
        <DailyStrip day={today} board={board} />
      </div>

      <div className="rs-panel-inset p-[0.6em]">
        <div className="text-[0.7em] text-[#cdbe91] uppercase tracking-wide mb-[0.45em]">Records</div>
        <div className="grid grid-cols-2 gap-[0.4em]">
          <GoStat icon={ASSETS.misc.hourglass} label="Days played" value={fmt(records.daysPlayed)} />
          <GoStat
            icon={ASSETS.misc.arrow_up}
            label="Best wave"
            value={records.bestWave > 0 ? `Wave ${fmt(records.bestWave)}` : '—'}
          />
          <GoStat icon={ASSETS.misc.gold_star} label="Best day" value={records.bestDay ? dayLabel(records.bestDay) : '—'} />
          <GoStat
            icon={ASSETS.misc.orb_run_on}
            label="Longest streak"
            value={records.longestStreak > 0 ? `${records.longestStreak} days` : '—'}
          />
        </div>
      </div>
    </div>
  );
}

/**
 * The Account tab: everything the account carries between runs — essence and what
 * it buys, the collection, and the numbers behind both.
 */
/**
 * The New Game+ tiers carry the Combat Achievement tier names, so the hardest one
 * cleared shows that tier's sword. Normal has no sword of its own and takes the first.
 */
function tierIcon(tier: number): string {
  return ASSETS.achievements[CA_TIERS[Math.max(0, tier - 1)] ?? 'grandmaster'];
}

function AccountTab({ essence, victories, killCounts, diversionsMet, achievements, diaries, difficulty, onOpenShop, onOpenLog, onSaveCode, onSound }: {
  essence: number;
  victories: Victories;
  killCounts: Record<string, number>;
  diversionsMet: Record<string, number>;
  achievements: string[];
  diaries: string[];
  difficulty: DifficultyProgress;
  onOpenShop: () => void;
  onOpenLog: (tab: LogTab) => void;
  onSaveCode: () => void;
  onSound: (key: string) => void;
}) {
  const stats = accountStats({ victories, killCounts, diversionsMet, achievements, diaries, difficulty });
  const openLog = (tab: LogTab) => { onSound('click'); onOpenLog(tab); };
  return (
    <div className="flex flex-col gap-[0.6em]">
      <div className="rs-panel-inset p-[0.6em] flex items-center gap-[0.55em]">
        <img src={ASSETS.misc.rune_essence_icon} alt="" className="w-[1.6em] h-[1.6em] object-contain shrink-0" onError={hideBrokenImg} />
        <div className="flex flex-col min-w-0">
          <span className="text-[#7ce0ff] font-bold text-[1.05em] leading-tight tabular-nums">{fmt(essence)}</span>
          <span className="text-[0.66em] text-[#cdbe91] uppercase tracking-wide">Rune Essence</span>
        </div>
        <button
          className="rs-btn ml-auto px-[0.9em] py-[0.35em] text-[0.85em] shrink-0"
          title="Spend essence on permanent upgrades"
          onClick={() => { onSound('interface_open'); onOpenShop(); }}
        >
          Essence Shop
        </button>
      </div>

      <div className="rs-panel-inset p-[0.6em]">
        <div className="text-[0.7em] text-[#cdbe91] uppercase tracking-wide mb-[0.45em]">Collection</div>
        <div className="grid grid-cols-2 gap-[0.35em]">
          <button className="rs-btn flex items-center gap-[0.35em] px-[0.5em] py-[0.3em] text-[0.78em]" title="Every monster you have killed" onClick={() => openLog('monsters')}>
            <img src={ASSETS.misc.multicombat_icon} alt="" className="w-[1.1em] h-[1.1em] object-contain" onError={hideBrokenImg} />
            Monsters
          </button>
          <button className="rs-btn flex items-center gap-[0.35em] px-[0.5em] py-[0.3em] text-[0.78em]" title="Every boss you have met" onClick={() => openLog('bosses')}>
            <img src={ASSETS.misc.slayer_crossbow} alt="" className="w-[1.1em] h-[1.1em] object-contain" onError={hideBrokenImg} />
            Bosses
          </button>
          <button className="rs-btn flex items-center gap-[0.35em] px-[0.5em] py-[0.3em] text-[0.78em]" title="Combat Achievements" onClick={() => openLog('achievements')}>
            <img src={ASSETS.misc.stats_icon} alt="" className="w-[1.1em] h-[1.1em] object-contain" onError={hideBrokenImg} />
            Achievements
          </button>
          <button className="rs-btn flex items-center gap-[0.35em] px-[0.5em] py-[0.3em] text-[0.78em]" title="Achievement Diaries" onClick={() => openLog('diaries')}>
            <img src={ASSETS.misc.diaries_icon} alt="" className="w-[1.1em] h-[1.1em] object-contain" onError={hideBrokenImg} />
            Diaries
          </button>
        </div>
      </div>

      <div className="rs-panel-inset p-[0.6em]">
        <div className="text-[0.7em] text-[#cdbe91] uppercase tracking-wide mb-[0.45em]">Statistics</div>
        <div className="grid grid-cols-2 gap-[0.4em]">
          <GoStat icon={ASSETS.misc.trophy} label="Runs won" value={fmt(stats.wins)} />
          <GoStat
            icon={ASSETS.misc.orb_run}
            label="Fastest win"
            value={stats.fastestSeconds == null ? '—' : fmtTime(stats.fastestSeconds)}
          />
          <GoStat
            icon={ASSETS.misc.arrow_up}
            label="Highest Endless"
            value={stats.bestEndlessWave > 0 ? `Wave ${fmt(stats.bestEndlessWave)}` : '—'}
          />
          <GoStat
            icon={tierIcon(stats.bestTier)}
            label="Hardest tier"
            value={stats.bestTier >= 0 ? tierLabel(stats.bestTier as DifficultyTier) : '—'}
          />
          <GoStat icon={ASSETS.misc.pk_skull} label="Enemies killed" value={fmt(stats.kills)} />
          <GoStat icon={ASSETS.misc.pk_skull_forinthry} label="Bosses killed" value={fmt(stats.bossKills)} />
          <GoStat icon={ASSETS.misc.random_event} label="Random events met" value={fmt(stats.eventKinds)} />
          <GoStat icon={ASSETS.misc.diaries_icon} label="Diary tasks" value={fmt(stats.diaries)} />
        </div>
        {/* The headline win figure counts both modes, so the split goes under it. */}
        <div className="text-[0.66em] text-[#a89870] mt-[0.45em]">
          <StatText text={fmt(stats.winsClassic)} /> Classic · <StatText text={fmt(stats.winsRoguelite)} /> Roguelite ·{' '}
          <StatText text={fmt(stats.achievements)} /> Combat Achievements
        </div>
      </div>

      <div className="flex gap-[0.4em]">
        {/* Progress lives in this browser's localStorage and nowhere else, so the
            way off this machine is a save code. */}
        <button className="rs-btn flex-1 py-[0.35em] text-[0.8em]" title="Export or import your progress as a save code" onClick={() => { onSound('interface_open'); onSaveCode(); }}>
          💾 Save/Load
        </button>
      </div>
    </div>
  );
}

/** Title / mode-select screen shown before the first wave of a run (and again on
 *  restart). This function is the room and its running order; each block is its
 *  own component above. */
export function StartScreen({ mode, saved, victories, caTitle, difficulty, selectedTier, today, dailyBoard, essence, upgrades, killCounts, diversionsMet, achievements, diaries, onSelect, onSelectTier, onStart, onStartDaily, onContinue, onDiscard, onSaveCode, onBuyUpgrade, onRefundEssence, onOpenLog, onSound, onAmbient }: {
  mode: GameMode;
  /** A run left in progress on this browser, offered back above the tabs. */
  saved: RunSave | null;
  /** The account's victory record — champion mark, wins, fastest clear. */
  victories: Victories;
  /** Highest Combat Achievement tier cleared in full, or null. Cosmetic only. */
  caTitle: CaTier | null;
  /** New Game+ progress — which tier is unlocked per mode. */
  difficulty: DifficultyProgress;
  /** The tier currently armed for the next run. */
  selectedTier: DifficultyTier;
  /** Today's UTC day key — the daily challenge the tab offers. */
  today: DayKey;
  /** This browser's daily scoreboard (best run per day). */
  dailyBoard: DailyBoard;
  /** Rune Essence in the bank, and what it has already bought. */
  essence: number;
  upgrades: GlobalUpgrades;
  /** The account's tallies, for the statistics block. */
  killCounts: Record<string, number>;
  diversionsMet: Record<string, number>;
  achievements: string[];
  diaries: string[];
  onSelect: (m: GameMode) => void;
  onSelectTier: (t: DifficultyTier) => void;
  onStart: () => void;
  onStartDaily: () => void;
  onContinue: () => void;
  onDiscard: () => void;
  onSaveCode: () => void;
  onBuyUpgrade: (id: keyof GlobalUpgrades) => void;
  onRefundEssence: () => void;
  /** Open the Collection Log on one of its tabs. */
  onOpenLog: (tab: LogTab) => void;
  /** Play one of the game's own sounds; a `level` plays it as ambience, under the menu. */
  onSound: (key: string, level?: number) => void;
  /** Starts a looping sound and returns what stops it; undefined while the
   *  engine is not up yet. */
  onAmbient: (key: string, level: number) => (() => void) | undefined;
}) {
  const [confirm, setConfirm] = useState<Confirming>(null);
  const [tab, setTab] = useState<TabId>('play');
  const [shopOpen, setShopOpen] = useState(false);
  // The whole screen scales through this font size so the Play tab never
  // scrolls on a short window (systems/screen-fit.ts). Other tabs keep the
  // scale the Play tab set, and scroll when they run long.
  const [fit, setFit] = useState(1);
  const woodRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (tab !== 'play') return;
    const wood = woodRef.current;
    const room = wood?.querySelector<HTMLElement>('.rs-start-room');
    const body = room?.querySelector<HTMLElement>('.rs-tab-body');
    if (!wood || !room || !body) return;
    const measure = () => {
      const pad = getComputedStyle(wood);
      const avail = wood.clientHeight - parseFloat(pad.paddingTop) - parseFloat(pad.paddingBottom);
      // The room's height with the tab body grown to its whole content.
      const needed = room.offsetHeight - body.clientHeight + body.scrollHeight;
      setFit((prev) => nextFit(prev, avail, needed));
    };
    const ro = new ResizeObserver(measure);
    for (const el of [wood, room, body, ...Array.from(body.children)]) ro.observe(el);
    return () => ro.disconnect();
  }, [tab]);
  return (
    <div
      ref={woodRef}
      className="rs-start-wood absolute inset-0 flex items-center justify-center z-40 p-4"
      style={{ fontSize: `${fit}em` }}
    >
      <StartLobby onAmbient={onAmbient} onSound={onSound} />
      <div className="rs-start-room relative z-[1] w-[36em] max-w-[95vw] max-h-full flex flex-col gap-[0.7em]">
        <Wordmark champion={victories.total > 0} wins={victories.total} caTitle={caTitle} />

        {saved && (
          <ContinueBand
            saved={saved}
            confirm={confirm}
            setConfirm={setConfirm}
            onContinue={onContinue}
            onDiscard={onDiscard}
          />
        )}

        {/* The tab strip, icon-only like the game's own: the name is on hover. */}
        <div className="flex items-center justify-center gap-[0.35em]">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={`rs-tab ${tab === t.id ? 'rs-tab-on' : ''}`}
              title={t.name}
              aria-label={t.name}
              onClick={() => { if (t.id !== tab) { onSound('click'); setTab(t.id); } }}
            >
              <img src={t.icon} alt="" onError={hideBrokenImg} />
            </button>
          ))}
        </div>

        {/* Keyed by tab so the fade replays on every switch. */}
        <div key={tab} className="rs-tab-body rs-panel p-[0.7em] overflow-y-auto flex-1 min-h-0">
          {tab === 'play' && (
            <PlayTab
              mode={mode}
              saved={saved}
              difficulty={difficulty}
              selectedTier={selectedTier}
              confirm={confirm}
              setConfirm={setConfirm}
              onSelect={onSelect}
              onSelectTier={onSelectTier}
              onStart={onStart}
              onSound={onSound}
            />
          )}
          {tab === 'daily' && <DailyTab today={today} board={dailyBoard} onStart={onStartDaily} onSound={onSound} />}
          {tab === 'account' && (
            <AccountTab
              essence={essence}
              victories={victories}
              killCounts={killCounts}
              diversionsMet={diversionsMet}
              achievements={achievements}
              diaries={diaries}
              difficulty={difficulty}
              onOpenShop={() => setShopOpen(true)}
              onOpenLog={onOpenLog}
              onSaveCode={onSaveCode}
              onSound={onSound}
            />
          )}
        </div>

        {/* Says out loud what the game is, on the wood rather than in a panel: a
            hobby project that is still moving. It is not a first-run tip and never
            gets dismissed. The updates live behind the 💬 stone, which the bottom
            bar keeps up on this screen in the same corner it holds in game. */}
        <div className="text-center text-[0.68em] text-[#b3a585]">
          <img
            src={ASSETS.misc.redemption_heart}
            alt=""
            className="w-[1.2em] h-[1.2em] object-contain inline-block align-middle mr-[0.35em]"
            onError={hideBrokenImg}
          />
          <span className="text-osrs-orange font-bold">Work in progress</span> · nothing here is final
        </div>
      </div>

      {/* The essence shop, over the room: the same panel the bottom bar opens
          during a run, so the two copies can never drift apart. */}
      {shopOpen && (
        <div className="absolute inset-0 z-[3] bg-black/70 flex items-center justify-center p-4" onClick={() => setShopOpen(false)}>
          <div className="rs-panel w-[26em] max-w-[92vw] max-h-[88vh] overflow-y-auto p-[0.8em]" onClick={(e) => e.stopPropagation()}>
            <EssenceShop essence={essence} upgrades={upgrades} onBuy={onBuyUpgrade} onRefund={onRefundEssence} />
            <button
              className="rs-btn w-full mt-[0.6em] py-[0.35em] text-[0.8em]"
              title="Close the essence shop"
              onClick={() => { onSound('interface_close'); setShopOpen(false); }}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
