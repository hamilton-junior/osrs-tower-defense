'use client';

import React from 'react';
import type { GameEngine, UIState } from '@/lib/game/core/engine';
import { ASSETS, iconUrl } from '@/lib/game/assets';
import { FEEDBACK_ENABLED } from '@/lib/game/feedback';
import { VolumeControl } from './VolumeControl';
import { fmt, hideBrokenImg, UI_SCALE_MAX, UI_SCALE_MIN } from './ui-kit';

/**
 * The groups of the bottom bar that move when the layout does. On a wide screen
 * with a mouse they sit in the bar's one row; in the compact layout (a touch screen,
 * or a window too narrow for the row) they stand in a rail on either side of the
 * board instead, which is what leaves the row short enough for buttons a finger can
 * hit. Each group renders either way from the same props, so the two layouts never
 * drift apart.
 */

/** The interface stones' panels. */
export type SideTab = 'home' | 'essence' | 'slayer' | 'dps' | 'skills' | 'inventory';

/** The speeds the bar offers, in the order the rail's one speed button steps through. */
const SPEEDS = [[1, 'Z'], [2, 'X'], [5, 'C']] as const;

/** Pause, game speed and sound. */
export function RunControls({ engineRef, ui, musicVolume, onMusicVolume, rail = false, children }: {
  engineRef: React.RefObject<GameEngine | null>;
  ui: UIState;
  musicVolume: number;
  onMusicVolume: (v: number) => void;
  /** Stand in a rail: one column, and one speed button that steps 1× → 2× → 5×. */
  rail?: boolean;
  /** More rail buttons, under the sound control. */
  children?: React.ReactNode;
}) {
  const pause = (
    <button
      onClick={() => engineRef.current?.togglePause()}
      title={ui.paused ? 'Resume' : 'Pause'}
      disabled={ui.gameOver}
      className={`rs-btn ${rail ? 'rs-rail-btn' : 'px-[0.66em] py-[0.33em] text-[0.7em] mr-[0.33em]'} ${ui.paused ? 'rs-btn-primary' : ''}`}
    >
      {ui.paused ? '▶' : '⏸'}
    </button>
  );
  // Mute, with the volume slider parked above it until you reach for it — the
  // slider is portalled onto the body, because the row's control group clips
  // itself and would otherwise cut the whole flyout away.
  const sound = (
    <VolumeControl
      volume={ui.volume}
      muted={ui.muted}
      onVolume={(v) => engineRef.current?.setVolume(v)}
      onToggleMute={() => engineRef.current?.toggleMute()}
      musicVolume={musicVolume}
      onMusicVolume={onMusicVolume}
      className={rail ? 'rs-btn rs-rail-btn relative' : undefined}
    />
  );

  if (rail) {
    // Three speed buttons stacked would be the tallest thing in the rail, so the
    // rail has one, wearing the speed it is at.
    const next = SPEEDS.find(([s]) => s > ui.gameSpeed)?.[0] ?? SPEEDS[0][0];
    return (
      <div data-tut="controls" className="flex flex-col items-center gap-[0.3em]">
        {pause}
        <button
          onClick={() => engineRef.current?.setGameSpeed(next)}
          title={`Game speed: ${ui.gameSpeed}×. Tap for ${next}×`}
          className={`rs-btn rs-rail-btn ${ui.gameSpeed > 1 ? 'rs-btn-primary' : ''}`}
        >
          <span className="text-[0.8em] tabular-nums">{ui.gameSpeed}×</span>
        </button>
        {sound}
        {children}
      </div>
    );
  }

  // `overflow-hidden` is load-bearing, not tidiness. This group is the only one in
  // the bar that may shrink (`min-w-0`), and its children are all fixed-em: past
  // ~120% interface size they used to spill out of it and paint straight over the
  // gold pile. Clipping keeps the bar legible, and the one control you need to undo
  // an over-large interface — the UI − / + — is deliberately a sibling of this group
  // rather than a child, so it is never the thing that gets cut off.
  //
  // It takes the left half's slack (`flex-1`) so its contents stay pinned to the
  // bar's left edge and the gold pile ends up against the dock.
  return (
    <div data-tut="controls" className="flex flex-1 min-w-0 items-center gap-[0.25em] overflow-hidden">
      {pause}
      <span className="text-[0.6em] text-[#d3c3a0] mr-[0.4em] uppercase tracking-wide">Speed</span>
      {SPEEDS.map(([s, key]) => (
        <button
          key={s}
          onClick={() => engineRef.current?.setGameSpeed(s)}
          title={`Run the game at ${s}× speed (${key}, or step with < / >)`}
          className={`rs-btn relative px-[0.66em] py-[0.33em] text-[0.7em] ${ui.gameSpeed === s ? 'rs-btn-primary' : ''}`}
        >
          {s}×
          <span className="rs-key">{key}</span>
        </button>
      ))}
      {sound}
    </div>
  );
}

/**
 * The interface size, on top of the viewport-adaptive base size. This is the only
 * zoom the game offers — browser zoom is blocked. In the row it sits outside the
 * clipping control group and never shrinks, because it is the way back from an
 * interface scaled too large to fit: clipping the escape hatch would strand the
 * player at 160%.
 */
export function UiSizeControl({ uiScale, maxUiScale, onStep, rail = false }: {
  uiScale: number;
  maxUiScale: number;
  onStep: (direction: 1 | -1) => void;
  /** Stand in a rail: "+" on top, "−" under the size. */
  rail?: boolean;
}) {
  const btn = rail ? 'rs-btn rs-rail-btn disabled:opacity-40' : 'rs-btn px-[0.66em] py-[0.33em] text-[0.7em] disabled:opacity-40';
  const smaller = (
    <button onClick={() => onStep(-1)} disabled={uiScale <= UI_SCALE_MIN} title="Smaller interface" className={btn}>
      −
    </button>
  );
  const larger = (
    <button
      onClick={() => onStep(1)}
      disabled={uiScale >= maxUiScale}
      title={uiScale >= maxUiScale && maxUiScale < UI_SCALE_MAX
        ? 'This screen has no room for a larger interface. Widen the window for more'
        : 'Larger interface'}
      className={btn}
    >
      +
    </button>
  );
  const size = (
    <span className={`text-[0.7em] text-osrs-orange tabular-nums text-center select-none ${rail ? '' : 'w-[3em]'}`} title="Interface size">
      {Math.round(uiScale * 100)}%
    </span>
  );
  return (
    <div
      data-tut="uiscale"
      data-idle-keep=""
      className={rail ? 'flex flex-col items-center gap-[0.3em]' : 'shrink-0 flex items-center gap-[0.25em]'}
    >
      <span className={`text-[0.6em] text-[#d3c3a0] uppercase tracking-wide select-none ${rail ? '' : 'ml-[0.4em] mr-[0.4em]'}`}>UI</span>
      {rail ? <>{larger}{size}{smaller}</> : <>{smaller}{size}{larger}</>}
    </div>
  );
}

/**
 * The interface stones, ordered by how often a run reaches for them: loadout and
 * DPS (read mid-run), then the two shops, then the log and the two links out.
 * Debug has no stone — it is Ctrl+' only.
 */
export function InterfaceStones({
  ui, runStarted, tab, onSideTab, logOpen, onToggleLog, feedbackOpen, onFeedback, helpOpen, onHelp,
  boonsTabRef, invTabRef, rail = false,
}: {
  ui: UIState;
  runStarted: boolean;
  tab: SideTab | null;
  onSideTab: (t: SideTab) => void;
  logOpen: boolean;
  onToggleLog: () => void;
  feedbackOpen: boolean;
  onFeedback: () => void;
  helpOpen: boolean;
  onHelp: () => void;
  boonsTabRef: React.Ref<HTMLButtonElement>;
  invTabRef: React.Ref<HTMLButtonElement>;
  /** Stand in a rail, one stone under the next. */
  rail?: boolean;
}) {
  return (
    <div data-tut="stones" className={rail ? 'flex flex-col items-center gap-[0.3em]' : 'flex items-center gap-[0.4em]'}>
      {/* The roguelite's loadout: relics and boons. Classic drafts nothing, so it
          has no loadout stone at all; classic's gear lives in the looting bag,
          inside the Inventory. The start screen always stands it up: the bar is
          hidden there, and the stone lowers the UI-scale ceiling, so leaving it to
          the mode made the menu resize on every mode switch. */}
      {(ui.gameMode === 'roguelite' || !runStarted) && (
        <button ref={boonsTabRef} onClick={() => onSideTab('home')} title="Run loadout: relics and boons" className={`rs-tab ${tab === 'home' ? 'rs-tab-on' : ''}`}>
          <img src={ASSETS.misc.cards_icon} alt="Run loadout" onError={hideBrokenImg} />
        </button>
      )}
      {/* One stone for everything the run carries: the backpack, and the looting
          bag riding in its last square. The badge counts the bag, since the slots
          themselves are on the panel. Clicking it while the bag is open walks back
          to the backpack instead of closing. */}
      <button ref={invTabRef} onClick={() => onSideTab('inventory')} title="Inventory: what this run carries, and the looting bag in its last slot" className={`rs-tab ${tab === 'inventory' ? 'rs-tab-on' : ''}`}>
        <img src={ASSETS.misc.inventory_icon} alt="Inventory" onError={hideBrokenImg} />
        {ui.lootBag.length + ui.bagStacks.length > 0 && (
          <span className="rs-tab-badge">{ui.lootBag.length + ui.bagStacks.length}</span>
        )}
      </button>
      {/* The Stats tab icon is OSRS's own symbol for "your skills", so it heads the
          Skills interface, and the DPS meter — which is damage, not progression —
          takes the red hitsplat instead. */}
      <button onClick={() => onSideTab('dps')} title="DPS meter: damage dealt per tower, by wave" className={`rs-tab ${tab === 'dps' ? 'rs-tab-on' : ''}`}>
        <img src={ASSETS.misc.hit_splat} alt="DPS meter" onError={hideBrokenImg} />
      </button>
      <button onClick={() => onSideTab('skills')} title="Skills: Hunter, Farming, Herblore, Fishing" className={`rs-tab ${tab === 'skills' ? 'rs-tab-on' : ''}`}>
        <img src={ASSETS.misc.stats_icon} alt="Skills" onError={hideBrokenImg} />
      </button>
      <button data-tut="slayer" onClick={() => onSideTab('slayer')} title="Slayer Rewards" className={`rs-tab ${tab === 'slayer' ? 'rs-tab-on' : ''}`}>
        <img src={ASSETS.misc.slayer_crossbow} alt="Slayer Rewards" onError={hideBrokenImg} />
        <span className="rs-tab-badge">{ui.slayerPoints}</span>
      </button>
      <button data-tut="essence" onClick={() => onSideTab('essence')} title="Essence Shop: permanent upgrades" className={`rs-tab ${tab === 'essence' ? 'rs-tab-on' : ''}`}>
        <img src={ASSETS.misc.rune_essence_icon} alt="Essence Shop" onError={hideBrokenImg} />
        <span className="rs-tab-badge">{fmt(ui.essence)}</span>
      </button>
      <button onClick={onToggleLog} title="Collection Log" className={`rs-tab ${logOpen ? 'rs-tab-on' : ''}`}>
        <img src={iconUrl('Collection_log')} alt="Collection Log" onError={hideBrokenImg} />
      </button>
      {FEEDBACK_ENABLED && (
        <button data-idle-keep="" onClick={onFeedback} title="Send feedback, or join the Discord" className={`rs-tab text-[1.15em] ${feedbackOpen ? 'rs-tab-on' : ''}`}>
          💬
        </button>
      )}
      <button data-tut="help" data-idle-keep="" onClick={onHelp} title="How to Play" className={`rs-tab text-[1.15em] ${helpOpen ? 'rs-tab-on' : ''}`}>
        ❓
      </button>
    </div>
  );
}

/**
 * One side rail of the compact layout. Its font is the bar's, so everything in it is
 * sized like the bar and tracks the UI − / +. On the start screen it idles like the
 * bar does: only what is marked `data-idle-keep` stays up.
 *
 * The rail is as tall as the screen and its column is centred in it. The column is
 * a box of its own, not the rail, because `maxUiScale` measures it against the rail
 * to know how far the interface can grow before the column runs off the screen.
 */
export function BarRail({ railRef, fontSize, idle, children }: {
  railRef: React.Ref<HTMLElement>;
  fontSize: string;
  idle: boolean;
  children: React.ReactNode;
}) {
  return (
    <aside ref={railRef} className={`rs-panel rs-rail${idle ? ' rs-bar-idle' : ''}`} style={{ fontSize }}>
      <div className="rs-rail-col">{children}</div>
    </aside>
  );
}
