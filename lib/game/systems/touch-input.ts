/**
 * The rules that let the game be played with a finger, on a phone or a tablet held
 * sideways. The DOM side (pointer listeners, media queries, the layout itself) lives
 * in `components/game/touch-ui.tsx` and the bar; what is decided here is plain data,
 * so it is tested.
 */

import { LOGIC_HEIGHT, LOGIC_WIDTH } from '../core/engine-state';

/**
 * Which bottom bar the screen gets. `compact` stands the run controls and the
 * interface stones in rails beside the board; `stacked` puts them in a second row
 * of the bar instead.
 */
export type BarLayout = 'full' | 'compact' | 'stacked';

/**
 * Narrowest window the full bar fits at its smallest interface size. Measured: the
 * row needs ~991 px at 70% in a roguelite run, so anything narrower clipped the
 * interface stones off its right end.
 */
export const FULL_BAR_MIN_WIDTH = 1000;

/**
 * Height left under a board drawn the screen's full width, from which the compact
 * bar stacks into two rows rather than taking rails. Two rows need about 104 px at
 * 100%, so from here the board keeps the screen's full width, which beats the
 * rails. A 16:10 tablet with the browser's toolbar showing (1280×720) leaves 151,
 * and it gets two rows too: in rails, its one row was 190 px tall and mostly empty.
 */
export const STACK_MIN_SPARE_PX = 120;

/**
 * The full bar is one long row built for a mouse. A touch screen gets a compact
 * one whatever its size, and so does a window too narrow for the full row, mouse
 * or not: the run controls and interface stones leave the row, which is then short
 * enough to hold buttons a finger can hit. On a wide screen such as a phone held
 * sideways they stand in a rail either side of the board, which takes width the
 * board does not need. On a squarer one such as a tablet the board is held by the
 * width instead and the bar has height to spare, so they take a second row of the
 * bar and the board gets the rails' width.
 */
export function barLayoutFor(screen: { width: number; height: number; coarse: boolean }): BarLayout {
  if (!screen.coarse && screen.width >= FULL_BAR_MIN_WIDTH) return 'full';
  const spare = screen.height - (screen.width * LOGIC_HEIGHT) / LOGIC_WIDTH;
  return spare >= STACK_MIN_SPARE_PX ? 'stacked' : 'compact';
}

/** One board tile, by column and row. */
export interface Tile {
  col: number;
  row: number;
}

/** The tile a logic-space point falls in. */
export function tileAt(x: number, y: number, grid: number): Tile {
  return { col: Math.floor(x / grid), row: Math.floor(y / grid) };
}

/**
 * The tile a finger has aimed at, and what was in hand when it did. A tile is about
 * 16 px across on a phone, narrower than a fingertip, so a touch never builds on the
 * first tap: it aims, the ghost shows where the thing would go, and a second tap on
 * that same tile builds it.
 */
export interface TapAim {
  /** What was in hand (a tower type, a move, a trap…) as one comparable string. */
  hand: string;
  tile: Tile;
}

/**
 * Feed one tap on the board while something is in hand. `act` is true on the tap
 * that should do what a click does; otherwise the tap only aims, and `aim` is what
 * to remember for the next one. An aim taken with something else in hand is stale:
 * picking a different tower must not let the next tap build where the last one aimed.
 */
export function tapInHand(aim: TapAim | null, hand: string, tile: Tile): { act: boolean; aim: TapAim | null } {
  if (aim && aim.hand === hand && aim.tile.col === tile.col && aim.tile.row === tile.row) {
    return { act: true, aim: null };
  }
  return { act: false, aim: { hand, tile } };
}

/**
 * What a board click would act with, read in the order `GameEngine.handleClick`
 * reads it. Both the engine and `UIState` carry these fields.
 */
export interface HandState {
  movingGroupIds: readonly string[];
  pasting: boolean;
  queueArmed: boolean;
  movingTowerId: string | null;
  selectedTowerType: string | null;
  movingPatchId: string | null;
  placingPlot: boolean;
  selectedTrapId: string | null;
}

/**
 * What is in hand, as one string a tap's aim can be compared against, or null
 * when a tap should do what a click does straight away (select a tower, pin an
 * enemy, pick up a trap). A painted line waiting for its yes or no is null too:
 * its own panel answers it, and the board ignores clicks until then.
 */
export function handInUse(s: HandState): string | null {
  if (s.movingGroupIds.length) return `group:${s.movingGroupIds.join(',')}`;
  if (s.pasting) return 'paste';
  if (s.queueArmed) return null;
  if (s.movingTowerId) return `move:${s.movingTowerId}`;
  if (s.selectedTowerType) return `tower:${s.selectedTowerType}`;
  if (s.movingPatchId || s.placingPlot) return `plot:${s.movingPatchId ?? 'new'}`;
  if (s.selectedTrapId) return `trap:${s.selectedTrapId}`;
  return null;
}

/** The line that tells a finger how to put down what it is holding. */
export function touchHint(hand: string): string {
  const [kind, what] = hand.split(':');
  switch (kind) {
    case 'tower': return what === 'wizard'
      ? 'Tap a tile, then tap it again to pick its spellbook'
      : 'Tap a tile, then tap it again to build';
    case 'move': return 'Tap a tile, then tap it again to move the tower there';
    case 'group': return 'Tap a tile, then tap it again to set the towers down';
    case 'paste': return 'Tap a tile, then tap it again to paste';
    case 'trap': return 'Tap the road, then tap it again to lay the trap';
    default: return 'Tap a tile, then tap it again to set the allotment down';
  }
}

/** How long a finger rests before a press becomes a hold that reads an element's tooltip. */
export const LONG_PRESS_MS = 450;
/** How far a finger may drift and still be holding, not dragging, in CSS px. */
export const LONG_PRESS_SLOP_PX = 10;

/** Whether a press that started at `from` and is now at `to` has turned into a drag. */
export function pressDrifted(from: { x: number; y: number }, to: { x: number; y: number }): boolean {
  return Math.hypot(to.x - from.x, to.y - from.y) > LONG_PRESS_SLOP_PX;
}

/**
 * A line written for a mouse, reworded for a finger: a click is a tap, and so is a
 * hover. A touch screen has no hover, and the browser hands a tap to whatever
 * listens for the pointer entering, so a tap is what opens a hover panel. Only
 * whole words change, and a capital stays a capital.
 */
export function touchWords(text: string): string {
  return text
    .replace(/\bClick\b/g, 'Tap')
    .replace(/\bclick\b/g, 'tap')
    .replace(/\bHover\b/g, 'Tap')
    .replace(/\bhover\b/g, 'tap');
}
