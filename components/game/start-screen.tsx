'use client';

import React, { useState } from 'react';
import type { GameMode } from '@/lib/game/core/engine';
import type { RunSave } from '@/lib/game/systems/run-save';
import { DIFFICULTY_TIERS, isTierUnlocked, tierLabel, type DifficultyTier } from '@/lib/game/systems/difficulty';
import { ASSETS, iconUrl } from '@/lib/game/assets';
import { FEEDBACK_ENABLED } from '@/lib/game/feedback';
import { essenceRateLabel } from '@/lib/game/systems/meta-progression';
import { CA_TIER_NAMES, type CaTier } from '@/lib/game/systems/combat-achievements';
import { fs, fmt, hideBrokenImg } from './ui-kit';
import { agoLabel, type DifficultyProgress } from './save';

/**
 * The title screen: pick a mode, pick a New Game+ tier, and either start a fresh
 * run or resume the saved one.
 *
 * The mode choice lives only here because the engine freezes it once a run
 * begins. Moved out of GameRoot.tsx verbatim.
 */

/** The two modes, as the screen shows them. Static — the panels differ only in
 *  what they say, so the copy lives here rather than being rebuilt per render. */
const MODES: { id: GameMode; name: string; tag: string; desc: string; icon: string; wip?: string }[] = [
  {
    id: 'classic', name: 'Classic', tag: 'Pure Tower Defense',
    desc: 'Build towers and survive the waves. Nothing else.',
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

/** Both paths out of the start screen destroy the saved run — throwing it away
 *  outright, or starting a fresh one over it. Neither is undoable, so each asks
 *  once, inline (an OSRS-style "are you sure" step rather than a browser dialog). */
type Confirming = 'discard' | 'new' | null;

/** One icon + figure from the saved run's state, on the Continue card. */
export function SaveStat({ icon, title, value }: { icon: string; title: string; value: React.ReactNode }) {
  return (
    <span className="flex items-center gap-[0.3em]" title={title}>
      <img src={icon} alt="" className="w-[1.15em] h-[1.15em] object-contain shrink-0" onError={hideBrokenImg} />
      <span className="text-[#e7d9b0] font-bold tabular-nums">{value}</span>
    </span>
  );
}

/** The game's name, plus whatever the account has to show for itself. */
function ScreenHeader({ compact, saved, champion, wins, caTitle }: {
  compact: boolean;
  saved: boolean;
  champion: boolean;
  wins: number;
  caTitle: CaTier | null;
}) {
  return (
    <div className="text-center mb-1">
      <div
        className="text-osrs-orange font-bold leading-none"
        style={{ fontSize: fs(compact ? 'clamp(17px, 1.9vw, 25px)' : 'clamp(20px, 2.4vw, 32px)') }}
      >
        OSRS Tower Defense
      </div>
      <div className="text-[#cdbe91] text-[0.85em] mt-[0.4em]">{saved ? 'Continue where you left off' : 'Choose your mode'}</div>
      {champion && (
        <div
          className="flex items-center justify-center gap-[0.3em] text-osrs-yellow text-[0.8em] font-bold mt-[0.3em] uppercase tracking-wider"
          title={`Champion — ${wins} run${wins === 1 ? '' : 's'} won`}
        >
          <img src={ASSETS.misc.trophy} alt="" className="w-[1.1em] h-[1.1em] object-contain" onError={hideBrokenImg} />
          Champion
        </div>
      )}
      {caTitle && (
        <div
          className="flex items-center justify-center gap-[0.3em] text-osrs-yellow text-[0.8em] font-bold mt-[0.3em] uppercase tracking-wider"
          title={`Combat Achievements — the ${CA_TIER_NAMES[caTitle]} tier cleared in full`}
        >
          <img src={ASSETS.achievements[caTitle]} alt="" className="w-[1em] h-[1em] object-contain" onError={hideBrokenImg} />
          {CA_TIER_NAMES[caTitle]}
        </div>
      )}
    </div>
  );
}

/** Says out loud what the game is: a hobby project that is still moving. It is not
 *  a first-run tip and never gets dismissed — a returning player is exactly who the
 *  "check the updates" half is for, and the disclaimer has to hold for as long as
 *  the game is unfinished. Kept to one line under `compact` for the same height
 *  reason the mode blurbs are dropped there. */
function WipNotice({ compact }: { compact: boolean }) {
  return (
    <div className="rs-panel-inset p-[0.55em] mt-[0.8em] text-[0.72em] text-[#d3c3a0] leading-snug text-center">
      <img
        src={ASSETS.misc.redemption_heart}
        alt=""
        className="w-[1.8em] h-[1.8em] object-contain inline-block align-middle mr-[0.4em]"
        onError={hideBrokenImg}
      />
      <span className="text-osrs-orange font-bold">Work in progress</span> — a passion project, still being
      built. Nothing here is final.
      {!compact && (
        <> Towers, bosses and balance change between visits, so keep an eye on{' '}
          {FEEDBACK_ENABLED ? <span className="text-osrs-yellow">💬 Recent updates</span> : <span className="text-osrs-yellow">the updates list</span>}.
        </>
      )}
    </div>
  );
}

/** A run left in progress: resume it at the wave it was saved on, board intact. */
function SavedRunCard({ saved, confirm, setConfirm, onContinue, onDiscard }: {
  saved: RunSave;
  confirm: Confirming;
  setConfirm: (c: Confirming) => void;
  onContinue: () => void;
  onDiscard: () => void;
}) {
  return (
    <div className="rs-panel-inset p-[0.7em] mt-[0.8em] flex flex-col gap-[0.5em]">
      <div className="flex items-center gap-[0.6em]">
        {/* The saved run's own mode icon — the same one its mode panel wears. */}
        <img
          src={MODES.find((m) => m.id === saved.gameMode)?.icon}
          alt=""
          className="w-[1.7em] h-[1.7em] object-contain shrink-0"
          onError={hideBrokenImg}
        />
        <div className="flex flex-col min-w-0">
          <span className="text-osrs-yellow font-bold text-[1.05em]">Run in progress</span>
          <span className="text-[0.72em] text-[#cdbe91] uppercase tracking-wide">
            {saved.gameMode === 'roguelite' ? 'Roguelite' : 'Classic'}
          </span>
        </div>
      </div>

      {/* The run's state, read at a glance: each figure wears the same icon it
          wears in-game (the wave's crossed swords, the hitpoints heart, the
          coin stack), so the card reads without a legend. */}
      <div className="flex flex-wrap items-center gap-x-[0.9em] gap-y-[0.3em] text-[0.8em]">
        <SaveStat icon={ASSETS.misc.attack_icon} title="Wave reached" value={`Wave ${saved.wave}`} />
        <SaveStat icon={ASSETS.misc.multicombat_icon} title="Towers on the board" value={saved.towers.length} />
        <SaveStat icon={ASSETS.misc.orb_hitpoints} title="Lives left" value={saved.lives} />
        <SaveStat icon={ASSETS.misc.coins_icon} title="Gold" value={fmt(saved.money)} />
        <SaveStat icon={ASSETS.misc.compass} title="When this run was saved" value={agoLabel(saved.savedAt)} />
      </div>
      <button className="rs-btn rs-btn-primary w-full py-[0.5em] text-[1.05em] animate-pulse" title={`Resume the run at wave ${saved.wave}`} onClick={onContinue}>
        ▶ Continue
      </button>
      {confirm === 'discard' ? (
        <div className="flex flex-col gap-[0.35em]">
          <span className="text-[0.75em] text-osrs-warn text-center">
            Discard the run at wave {saved.wave}? This cannot be undone.
          </span>
          <div className="flex gap-[0.4em]">
            <button
              className="rs-btn flex-1 py-[0.3em] text-[0.75em] text-osrs-warn"
              title="Delete the saved run for good"
              onClick={() => { setConfirm(null); onDiscard(); }}
            >
              Yes, discard it
            </button>
            <button className="rs-btn flex-1 py-[0.3em] text-[0.75em]" title="Keep the saved run" onClick={() => setConfirm(null)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          className="rs-btn w-full py-[0.3em] text-[0.75em]"
          title="Throw the saved run away"
          onClick={() => setConfirm('discard')}
        >
          Discard saved run
        </button>
      )}
    </div>
  );
}

/** The two mode panels. Classic (pure TD) vs Roguelite (bought card rolls + boss
 *  relics) — the choice the whole screen exists for. */
function ModePicker({ mode, onSelect, compact }: {
  mode: GameMode;
  onSelect: (m: GameMode) => void;
  compact: boolean;
}) {
  return (
    <div className={`grid grid-cols-2 gap-[0.7em] ${compact ? 'mb-[0.8em]' : 'my-4'}`}>
      {MODES.map((m) => {
        const on = mode === m.id;
        return (
          <button
            key={m.id}
            onClick={() => onSelect(m.id)}
            title={`${m.name} — ${m.desc}`}
            className={`rs-panel-inset text-left flex flex-col gap-[0.35em] ${compact ? 'p-[0.55em]' : 'p-[0.8em]'}`}
            style={{ outline: `2px solid ${on ? 'var(--osrs-orange)' : 'transparent'}`, opacity: on ? 1 : 0.78 }}
          >
            <div className="flex items-center gap-[0.5em]">
              <img src={m.icon} alt="" className="w-[1.6em] h-[1.6em] object-contain" onError={hideBrokenImg} />
              <span className="text-osrs-yellow font-bold text-[1.05em]">{m.name}</span>
              {on && <span className="ml-auto text-osrs-orange text-[0.9em]">✓</span>}
            </div>
            <span className="text-[0.66em] uppercase tracking-wide text-osrs-orange">{m.tag}</span>
            {/* Rune Essence rate for this mode — roguelite's in-run power is paid
                for with half the meta-currency (see essenceMultiplier). */}
            <span
              className="flex items-center gap-[0.3em] text-[0.72em] text-[#d3c3a0]"
              title="Rune Essence earned per wave cleared, relative to Classic"
            >
              <img src={ASSETS.misc.rune_essence_icon} alt="" className="w-[1em] h-[1em] object-contain" onError={hideBrokenImg} />
              Essence <span className="text-osrs-yellow font-bold">{essenceRateLabel(m.id, 'normal')}</span>
            </span>
            {!compact && <span className="text-[0.78em] text-[#d3c3a0] leading-snug">{m.desc}</span>}
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

/** New Game+ difficulty ladder. Unlocked tiers are selectable; locked ones show a
 *  🔒 and stay disabled. */
function DifficultyPicker({ mode, difficulty, selectedTier, onSelectTier }: {
  mode: GameMode;
  difficulty: DifficultyProgress;
  selectedTier: DifficultyTier;
  onSelectTier: (t: DifficultyTier) => void;
}) {
  return (
    <div className="rs-panel-inset p-[0.6em] mt-[0.8em]">
      <div className="text-[0.72em] text-[#cdbe91] uppercase tracking-wide mb-[0.5em]">Difficulty</div>
      <div className="flex flex-wrap gap-[0.35em]">
        {DIFFICULTY_TIERS.map((t) => {
          const cleared = difficulty.highestCleared[mode];
          const unlocked = isTierUnlocked(t.id, cleared);
          const on = t.id === selectedTier;
          return (
            <button
              key={t.id}
              disabled={!unlocked}
              className={`rs-btn px-[0.7em] py-[0.3em] text-[0.8em] ${on ? 'rs-btn-primary' : ''}`}
              title={unlocked ? `Play at ${tierLabel(t.id)}` : `Locked — win the tier below to unlock ${tierLabel(t.id)}`}
              onClick={() => unlocked && onSelectTier(t.id)}
            >
              {!unlocked && '🔒 '}{tierLabel(t.id)}
            </button>
          );
        })}
      </div>
      <div className="text-[0.68em] text-[#a89870] mt-[0.5em] leading-snug">
        Win a tier to unlock the next. Higher tiers give tougher enemies and a
        tighter economy — the reward is the record, not power.
      </div>
    </div>
  );
}

/** The way in, and the two chores under it. */
function StartActions({ saved, confirm, setConfirm, onStart, onHelp, onSaveCode }: {
  saved: RunSave | null;
  confirm: Confirming;
  setConfirm: (c: Confirming) => void;
  onStart: () => void;
  onHelp: () => void;
  onSaveCode: () => void;
}) {
  return (
    <>
      {/* A new run overwrites the saved one, so with a save on disk it asks first. */}
      {saved && confirm === 'new' ? (
        <div className="flex flex-col gap-[0.35em]">
          <span className="text-[0.75em] text-osrs-warn text-center">
            Starting a new run discards the saved run at wave {saved.wave}.
          </span>
          <div className="flex gap-[0.4em]">
            <button
              className="rs-btn rs-btn-primary flex-1 py-[0.5em] text-[0.9em]"
              title="Discard the saved run and start fresh in this mode"
              onClick={() => { setConfirm(null); onStart(); }}
            >
              ▶ Start a new run
            </button>
            <button className="rs-btn flex-1 py-[0.5em] text-[0.9em]" title="Keep the saved run" onClick={() => setConfirm(null)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          className={`rs-btn rs-btn-primary w-full py-[0.55em] text-[1.1em] ${saved ? '' : 'animate-pulse'}`}
          title={saved ? 'Discard the saved run and start fresh in this mode' : 'Lock in this mode and start the run'}
          onClick={() => (saved ? setConfirm('new') : onStart())}
        >
          ▶ {saved ? 'New Run' : 'Confirm'}
        </button>
      )}
      <button className="rs-btn w-full py-[0.4em] text-[0.85em] mt-[0.5em]" title="Open the how-to-play guide" onClick={onHelp}>
        ❓ How to Play
      </button>
      {/* Progress lives in this browser's localStorage and nowhere else, so the way
          off this machine is a save code. Kept small and last: it is a chore, not a
          step on the way into a run. */}
      <button className="rs-btn w-full py-[0.3em] text-[0.72em] mt-[0.3em]" title="Export or import your progress as a save code" onClick={onSaveCode}>
        💾 Save/Load Game
      </button>
    </>
  );
}

/** Title / mode-select screen shown before the first wave of a run (and again on
 *  restart). Two selectable mode panels — Classic (pure TD) vs Roguelite (bought
 *  card rolls + boss relics) — plus a Start button that locks the choice and kicks
 *  off wave 1. Mode can only change here, since the engine freezes it once a run
 *  begins.
 *
 *  This function is the panel and its running order; each block is its own
 *  component above. */
export function StartScreen({ mode, saved, champion, wins, caTitle, difficulty, selectedTier, onSelect, onSelectTier, onStart, onContinue, onDiscard, onHelp, onSaveCode }: {
  mode: GameMode;
  /** A run left in progress on this browser, offered back before mode select. */
  saved: RunSave | null;
  /** True once the player has won at least one run — lights the champion mark. */
  champion: boolean;
  /** Total victories, for the champion mark's hover title. */
  wins: number;
  /** Highest Combat Achievement tier cleared in full, or null. Cosmetic only. */
  caTitle: CaTier | null;
  /** New Game+ progress — which tier is unlocked per mode. */
  difficulty: DifficultyProgress;
  /** The tier currently armed for the next run. */
  selectedTier: DifficultyTier;
  onSelect: (m: GameMode) => void;
  onSelectTier: (t: DifficultyTier) => void;
  onStart: () => void;
  onContinue: () => void;
  onDiscard: () => void;
  onHelp: () => void;
  onSaveCode: () => void;
}) {
  const [confirm, setConfirm] = useState<Confirming>(null);
  // With a saved run the screen carries a whole extra card plus its separator, and
  // the panel grew tall enough to run off the bottom of a laptop screen. So the
  // resume path tightens everything it can afford to: less padding, a shorter title,
  // no mode blurbs (the tag line still says what each mode is, and the hover title
  // keeps the full text), no difficulty ladder (a returning player picked their tier
  // when they saved), no first-timer footnote — a returning player has read it.
  // `max-h`/`overflow-y-auto` is the backstop for a very short viewport.
  const compact = !!saved;
  return (
    <div className="absolute inset-0 bg-black/82 flex flex-col items-center justify-center z-40 p-4">
      <div className={`rs-panel w-[34em] max-w-[94vw] max-h-[94vh] overflow-y-auto flex flex-col ${compact ? 'p-4' : 'p-6'}`}>
        <ScreenHeader compact={compact} saved={!!saved} champion={champion} wins={wins} caTitle={caTitle} />

        <WipNotice compact={compact} />

        {saved && (
          <SavedRunCard
            saved={saved}
            confirm={confirm}
            setConfirm={setConfirm}
            onContinue={onContinue}
            onDiscard={onDiscard}
          />
        )}

        {saved && <div className="text-center text-[0.75em] text-[#cdbe91] mt-[0.8em] mb-[0.3em]">— or start a new run —</div>}

        <ModePicker mode={mode} onSelect={onSelect} compact={compact} />

        {!compact && (
          <DifficultyPicker mode={mode} difficulty={difficulty} selectedTier={selectedTier} onSelectTier={onSelectTier} />
        )}

        <StartActions
          saved={saved}
          confirm={confirm}
          setConfirm={setConfirm}
          onStart={onStart}
          onHelp={onHelp}
          onSaveCode={onSaveCode}
        />

        {!compact && (
          <div className="text-center text-[0.7em] text-[#cdbe91] mt-[0.5em]">First time? Read <span className="text-osrs-orange">How to Play</span>. Then press <span className="text-osrs-orange">Start Wave</span> when you&apos;re ready.</div>
        )}
      </div>
    </div>
  );
}
