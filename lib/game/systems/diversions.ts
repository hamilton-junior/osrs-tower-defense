import {
  DIVERSIONS,
  DIVERSION_BY_ID,
  DIVERSION_CHANCE,
  MAX_DIVERSIONS,
  type DiversionDef,
  type DiversionId,
  type DiversionMood,
  type DiversionPayload,
} from '../data/diversions';
import { essenceForWave } from './meta-progression';
import { waveClearBonus } from './rewards';

/**
 * The maths and the dice behind Distractions & Diversions — everything about the
 * frame that can be decided without touching the engine.
 *
 * The engine keeps the list, draws it and pays the rewards out; this module answers
 * *whether* something turns up, *what* it is, *where* it can stand and *how much* it
 * is worth. That split is what makes the frame testable: the spawner is three pure
 * functions and a payout table.
 */

/**
 * Where one is in its visit.
 *
 * `arriving` is the walk in from off the board, `here` is standing on the tile it
 * picked, `leaving` is the walk back off after it has been dealt with. A leaver has
 * already paid out and is no longer clickable — it is scenery finishing its exit.
 */
export type DiversionPhase = 'arriving' | 'here' | 'leaving';

/**
 * Which of the three baked views to draw.
 *
 * These NPCs are single portraits, not rigs, so turning round means swapping
 * sprite: `front` is the default bake, `back` is the same model from behind, and
 * `side` is its profile — baked walking right, mirrored for the other way. Someone
 * standing on their tile always faces `front`, at the player.
 */
export type DiversionFacing = 'front' | 'back' | 'side';

/** One diversion on the board, waiting for a click or for the next wave. */
export interface Diversion {
  /** Unique per instance — the click handler and the infobox both address it. */
  id: string;
  defId: DiversionId;
  mood: DiversionMood;
  /** Live board position, logic px. Off the board entirely while it walks in. */
  x: number;
  y: number;
  /** The free tile it walks to and stands on — its position for the whole of `here`. */
  homeX: number;
  homeY: number;
  phase: DiversionPhase;
  /** Where it walks off to, set the moment it starts leaving. Null until then. */
  exit: { x: number; y: number } | null;
  /** Which baked view it is showing — the way it is travelling, or `front` once
   *  it has arrived. */
  facing: DiversionFacing;
  /** Mirrors the side view. Only read while `facing` is `side`. */
  facingLeft: boolean;
  /** What it says while it stands there. Chosen once, at spawn. */
  line: string;
}

/** Walking speed, logic px per second — a stroll, a touch slower than the things
 *  that come down the road, because nobody here is in a hurry. */
export const DIVERSION_WALK_SPEED = 95;

/**
 * The point just off the board nearest to (x, y): where someone walking on walks in
 * from, and where someone walking off heads for.
 *
 * Nearest edge, not nearest corner — a straight line to the closest way out is both
 * the shortest walk and the one a player reads as "they went that way" rather than
 * "they took a detour". `margin` puts it far enough out that the sprite is fully
 * gone before it is deleted.
 */
export function offBoardPoint(
  x: number, y: number, w: number, h: number, margin = 40,
): { x: number; y: number } {
  const d = [
    { d: x, p: { x: -margin, y } },          // left
    { d: w - x, p: { x: w + margin, y } },   // right
    { d: y, p: { x, y: -margin } },          // top
    { d: h - y, p: { x, y: h + margin } },   // bottom
  ];
  return d.reduce((best, c) => (c.d < best.d ? c : best)).p;
}

/**
 * Walk one a frame's worth toward wherever it is going. Returns false once a leaver
 * has walked off the board and should be dropped from the list; true otherwise.
 *
 * Standing still is the common case and costs nothing — for most of a prep phase
 * this is one comparison per diversion.
 */
/**
 * Point one along the way it is travelling.
 *
 * Whichever axis it is covering more of wins, so a diagonal reads as the walk it
 * mostly is rather than flickering between two views. The dead zone is there for
 * the last step of a walk, where the remaining offset is floating-point noise and
 * would otherwise spin the sprite on the spot.
 */
export function turnDiversion(d: Diversion, dx: number, dy: number) {
  if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;
  if (Math.abs(dx) > Math.abs(dy)) {
    d.facing = 'side';
    d.facingLeft = dx < 0;
    return;
  }
  // Down the screen is towards the player, so that is the front of them.
  d.facing = dy > 0 ? 'front' : 'back';
}

export function stepDiversion(d: Diversion, dt: number, speed = DIVERSION_WALK_SPEED): boolean {
  if (d.phase === 'here') return true;
  const target = d.phase === 'arriving' ? { x: d.homeX, y: d.homeY } : d.exit;
  if (!target) return d.phase !== 'leaving';
  const dx = target.x - d.x;
  const dy = target.y - d.y;
  const dist = Math.hypot(dx, dy);
  turnDiversion(d, dx, dy);
  const step = speed * dt;
  if (dist <= step || dist === 0) {
    d.x = target.x;
    d.y = target.y;
    if (d.phase === 'arriving') {
      // Arrived: turn out of the walk and look at the player, whichever way the
      // last step happened to be pointing.
      d.phase = 'here';
      d.facing = 'front';
      return true;
    }
    return false; // a leaver that has got where it was going is gone
  }
  d.x += (dx / dist) * step;
  d.y += (dy / dist) * step;
  return true;
}

/** Send one on its way: it keeps walking, from wherever it is, off the nearest edge. */
export function sendDiversionOff(d: Diversion, w: number, h: number) {
  if (d.phase === 'leaving') return;
  d.phase = 'leaving';
  d.exit = offBoardPoint(d.x, d.y, w, h);
}

/**
 * Rarest first. Each mood still rolls its own independent chance, but the board has
 * a hard cap ({@link MAX_DIVERSIONS}), and when the cap bites it should be the common
 * mood that loses its place — a walkby crowding out a genie would be the wrong trade.
 */
export const DIVERSION_MOOD_PRIORITY: DiversionMood[] = ['event', 'nest', 'walkby'];

/**
 * Which moods turn up in this gap between waves.
 *
 * Every mood consumes a roll whether or not it is eligible, so blocking one (a boss
 * next, or one of its kind already standing there) never shifts the others' luck —
 * which is what makes a seeded test mean anything.
 *
 * Events are the only mood barred before a boss: a boss wave is the headline act and
 * shouldn't share the stage with a genie. A passing townsperson still may — that is
 * exactly when the Lumbridge Guide has something worth saying.
 */
export function rollDiversionMoods(
  rand: () => number,
  present: ReadonlyArray<DiversionMood>,
  bossNext: boolean,
): DiversionMood[] {
  const won: DiversionMood[] = [];
  for (const mood of DIVERSION_MOOD_PRIORITY) {
    const roll = rand();
    if (present.includes(mood)) continue;
    if (bossNext && mood === 'event') continue;
    if (roll < DIVERSION_CHANCE[mood]) won.push(mood);
  }
  return won.slice(0, Math.max(0, MAX_DIVERSIONS - present.length));
}

/** Which member of a mood turned up. Uniform — none of them is rarer than the rest. */
export function pickDiversionDef(mood: DiversionMood, rand: () => number): DiversionDef {
  const pool = DIVERSIONS.filter(d => d.mood === mood);
  return pool[Math.min(pool.length - 1, Math.floor(rand() * pool.length))];
}

/**
 * A free tile to stand on, or null when the board has no room left.
 *
 * `isFree` is the engine's own placement test, so a diversion lands exactly where a
 * tower could have — off the road, off the obstacles, clear of what is already built.
 * That is the rule that keeps them from ever costing the player a build spot: they
 * only occupy ground nothing is using, and they are gone by the time the wave starts.
 * The border tiles are skipped so nothing ends up half off the edge of the board.
 */
export function pickDiversionSpot(
  rand: () => number,
  isFree: (x: number, y: number) => boolean,
  cols: number,
  rows: number,
  grid: number,
  tries = 60,
): { x: number; y: number } | null {
  if (cols < 5 || rows < 5) return null;
  for (let i = 0; i < tries; i++) {
    const col = 2 + Math.floor(rand() * (cols - 4));
    const row = 2 + Math.floor(rand() * (rows - 4));
    const x = col * grid + grid / 2;
    const y = row * grid + grid / 2;
    if (isFree(x, y)) return { x, y };
  }
  return null;
}

/**
 * What it says. The Lumbridge Guide gets the caller's read on the coming wave when
 * there is one — he is the one NPC in this frame whose job is to know.
 */
export function diversionLine(def: DiversionDef, rand: () => number, hint?: string): string {
  if (def.id === 'lumbridge_guide' && hint) return hint;
  return def.lines[Math.min(def.lines.length - 1, Math.floor(rand() * def.lines.length))];
}

// --- Payouts ---------------------------------------------------------------
// Sized against the wave's own rewards rather than picked out of the air, so a
// diversion stays a pleasant extra at every point in a run and never becomes the
// reason to play one. Gold in particular is deliberately a fraction of a wave clear:
// this game does not inflate gold.

/** A purse is worth a bit over half a wave clear, nudged up by how many towers were
 *  there to help — Rick picks the fight, the towers finish it. */
export function diversionGold(wave: number, towers = 0): number {
  const crowd = 1 + Math.min(10, Math.max(0, towers)) * 0.05;
  return Math.max(20, Math.round(waveClearBonus(wave) * 0.6 * crowd));
}

/** A lamp is worth about two and a half wave clears' essence. `multiplier` is the
 *  mode/phase faucet the wave award already goes through, so a lamp can't be a way
 *  round Endless's tenth-rate essence. */
export function diversionEssence(wave: number, multiplier = 1): number {
  return Math.max(3, Math.round(essenceForWave(wave) * 2.5 * multiplier));
}

/** What a nest actually held. Gold most of the time, because gold is the payout that
 *  is never useless; the other two are the moments worth telling someone about. */
export function rollNestPayload(rand: () => number): Exclude<DiversionPayload, 'none' | 'surprise'> {
  const r = rand();
  if (r < 0.55) return 'gold';
  if (r < 0.85) return 'essence';
  return 'potion';
}

/** The payout a click resolves to — the nest's `surprise` rolled into a real one. */
export function resolvePayload(defId: DiversionId, rand: () => number): DiversionPayload {
  const payload = DIVERSION_BY_ID[defId].payload;
  return payload === 'surprise' ? rollNestPayload(rand) : payload;
}
