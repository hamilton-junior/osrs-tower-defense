import {
  DIVERSIONS,
  DIVERSION_BY_ID,
  DIVERSION_CHANCE,
  DIVERSION_REWARD_KINDS,
  DIVERSION_REWARD_META,
  LAMP_LEVELS,
  MAX_DIVERSIONS,
  type DiversionDef,
  type DiversionId,
  type DiversionMood,
  type DiversionPayload,
  type DiversionRewardKind,
} from '../data/diversions';
import { SEEDS, SEED_BY_ID, type SeedId } from '../data/farming';
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
 * Each NPC is baked from three camera yaws rather than turned in 3D, so turning
 * round means swapping sheet: `front` is the default bake, `back` is the same model
 * from behind, and `side` is its profile — baked walking right, mirrored for the
 * other way. Someone standing on their tile always faces `front`, at the player.
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
  /** The Hunting expert only: the trap it came to re-set, picked at spawn. */
  trapId?: string;
  /** Set once its {@link DiversionDef.job} has run, so it only ever runs once. */
  jobDone?: boolean;
  /** The Strange Plant only: what it grew, rolled at spawn so the hover card can
   *  name it. See {@link rollPlantGift}. */
  gift?: DiversionReward;
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

/**
 * Which member of a mood turned up. Uniform: none of them is rarer than the rest.
 *
 * `eligible` drops the ones with nothing to do on this board (the Hunting expert with
 * no worn trap to re-set), so the others share its chance instead of the visit being
 * lost. Null when nobody in the mood is eligible.
 */
export function pickDiversionDef(
  mood: DiversionMood,
  rand: () => number,
  eligible: (def: DiversionDef) => boolean = () => true,
): DiversionDef | null {
  const pool = DIVERSIONS.filter(d => d.mood === mood && eligible(d));
  if (pool.length === 0) return null;
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
 * The nearest free tile to (x, y), within `maxTiles` tiles, or null. Where the
 * Hunting expert stands to work on a trap: beside it, never on it.
 *
 * Same border rule as {@link pickDiversionSpot}, and the same placement test, so a
 * diversion sent to a particular spot still never takes a build spot anyone is using.
 */
export function nearestDiversionSpot(
  x: number,
  y: number,
  isFree: (x: number, y: number) => boolean,
  cols: number,
  rows: number,
  grid: number,
  maxTiles = 4,
): { x: number; y: number } | null {
  const c0 = Math.floor(x / grid);
  const r0 = Math.floor(y / grid);
  let best: { x: number; y: number } | null = null;
  let bestD = Infinity;
  for (let dr = -maxTiles; dr <= maxTiles; dr++) {
    for (let dc = -maxTiles; dc <= maxTiles; dc++) {
      if (dr === 0 && dc === 0) continue;
      const col = c0 + dc;
      const row = r0 + dr;
      if (col < 2 || row < 2 || col > cols - 3 || row > rows - 3) continue;
      const cx = col * grid + grid / 2;
      const cy = row * grid + grid / 2;
      const d = Math.hypot(cx - x, cy - y);
      if (d < bestD && isFree(cx, cy)) {
        best = { x: cx, y: cy };
        bestD = d;
      }
    }
  }
  return best;
}

/** A trap as the Hunting expert sees it: how many firings it has left of how many. */
export interface TrapWear {
  id: string;
  charges: number;
  max: number;
}

/**
 * The trap most in need of a re-set, or null when none is. A trap counts once it has
 * fired at least once and still has a charge left (a spent one has already gone).
 * Most worn is the lowest share of its charges left; a tie goes to the one with
 * fewer firings left.
 */
export function mostWornTrap(traps: ReadonlyArray<TrapWear>): string | null {
  let best: TrapWear | null = null;
  for (const t of traps) {
    if (t.charges <= 0 || t.charges >= t.max) continue;
    if (!best) { best = t; continue; }
    const a = t.charges / t.max;
    const b = best.charges / best.max;
    if (a < b || (a === b && t.charges < best.charges)) best = t;
  }
  return best?.id ?? null;
}

/** What Hans knows about the run, all of it already counted by the engine. */
export interface RunFacts {
  /** Real time played this run, pauses excluded. */
  seconds: number;
  kills: number;
  livesLost: number;
  /** Waves cleared in a row without a leak. */
  cleanStreak: number;
  goldEarned: number;
  /** The standing tower with the most kills, by its tier name. */
  topTower: { name: string; kills: number } | null;
}

/** m:ss, or h:mm:ss once past the hour. */
export function formatPlayTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`;
}

/**
 * Every run fact Hans could mention right now. In Lumbridge he tells you how long you
 * have played, so the time is always on the list; the rest only once there is
 * something to say. One short sentence each.
 */
export function runFactLines(f: RunFacts): string[] {
  const n = (v: number) => Math.round(v).toLocaleString('en-US');
  const out = [`You've been defending this road for ${formatPlayTime(f.seconds)}.`];
  if (f.kills > 0) {
    out.push(f.kills === 1
      ? 'One monster has fallen on this road so far.'
      : `${n(f.kills)} monsters have fallen on this road so far.`);
  }
  if (f.kills > 0 && f.livesLost === 0) out.push('Nothing has got past you yet.');
  if (f.livesLost > 0) {
    out.push(f.livesLost === 1 ? "You've lost one life this run." : `You've lost ${n(f.livesLost)} lives this run.`);
  }
  if (f.cleanStreak >= 3) out.push(`${n(f.cleanStreak)} waves in a row without a leak.`);
  if (f.topTower && f.topTower.kills >= 5) out.push(`Your ${f.topTower.name} has ${n(f.topTower.kills)} kills.`);
  if (f.goldEarned > 0) out.push(`You've earned ${n(f.goldEarned)} gold this run.`);
  return out;
}

/** One of {@link runFactLines}, picked uniformly. */
export function hansLine(f: RunFacts, rand: () => number): string {
  const lines = runFactLines(f);
  return lines[Math.min(lines.length - 1, Math.floor(rand() * lines.length))];
}

/**
 * What it says. A briefing NPC (see {@link DiversionDef.briefing}) says the caller's
 * `hint` when there is one: the Lumbridge Guide's read on the wave, Hans's fact about
 * the run. Everyone else, and a briefing NPC with nothing to report, picks a line.
 */
export function diversionLine(def: DiversionDef, rand: () => number, hint?: string): string {
  if (def.briefing && hint) return hint;
  return def.lines[Math.min(def.lines.length - 1, Math.floor(rand() * def.lines.length))];
}

// --- Party Pete's balloons -------------------------------------------------

/** One balloon Party Pete left on the board. `variant` picks the colour bake;
 *  `born` is `performance.now()` ms, for the drop-in. */
export interface PartyBalloon {
  id: string;
  x: number;
  y: number;
  variant: number;
  born: number;
}

/** How many balloon colours are baked (`party_balloon_0..5`). */
export const PARTY_BALLOON_VARIANTS = 6;

/** How many balloons one visit leaves: 3 to 7. */
export function balloonCount(rand: () => number): number {
  return 3 + Math.min(4, Math.floor(rand() * 5));
}

function shuffled<T>(list: T[], rand: () => number): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.min(i, Math.floor(rand() * (i + 1)));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Up to `count` free tiles around (cx, cy) for balloons, one balloon a tile. The
 * tiles within two of the centre come first, in a random order; the ring at three
 * only fills in when the near ones are taken. The centre is Pete's own tile.
 */
export function pickBalloonSpots(
  rand: () => number,
  cx: number,
  cy: number,
  isFree: (x: number, y: number) => boolean,
  cols: number,
  rows: number,
  grid: number,
  count: number,
): { x: number; y: number }[] {
  const c0 = Math.floor(cx / grid);
  const r0 = Math.floor(cy / grid);
  const near: { x: number; y: number }[] = [];
  const far: { x: number; y: number }[] = [];
  for (let dr = -3; dr <= 3; dr++) {
    for (let dc = -3; dc <= 3; dc++) {
      const ring = Math.max(Math.abs(dr), Math.abs(dc));
      if (ring === 0) continue;
      const col = c0 + dc;
      const row = r0 + dr;
      if (col < 2 || row < 2 || col > cols - 3 || row > rows - 3) continue;
      const x = col * grid + grid / 2;
      const y = row * grid + grid / 2;
      if (!isFree(x, y)) continue;
      (ring <= 2 ? near : far).push({ x, y });
    }
  }
  return [...shuffled(near, rand), ...shuffled(far, rand)].slice(0, Math.max(0, count));
}

/** What is inside one balloon. Half are empty, which is the joke. */
export type BalloonGift = 'none' | 'gold' | 'essence';

export function rollBalloonGift(rand: () => number): BalloonGift {
  const r = rand();
  if (r < 0.5) return 'none';
  if (r < 0.9) return 'gold';
  return 'essence';
}

/** A balloon's gold, as a share of a purse ({@link DiversionRewardContext.gold}). */
export const BALLOON_GOLD_SHARE = 0.25;
/** A balloon's essence, as a share of a nest's ({@link DiversionRewardContext.essence}). */
export const BALLOON_ESSENCE_SHARE = 0.2;

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

/** A nest's essence is worth about two and a half wave clears'. `multiplier` is the
 *  mode/phase faucet the wave award already goes through, so a nest can't be a way
 *  round Endless's tenth-rate essence. */
export function diversionEssence(wave: number, multiplier = 1): number {
  return Math.max(3, Math.round(essenceForWave(wave) * 2.5 * multiplier));
}

/** Everything a nest can hold, in the order its roll checks them. */
export const NEST_PAYLOADS = ['gold', 'essence', 'potion'] as const;

/** What a nest actually held. Gold most of the time, because gold is the payout that
 *  is never useless; the other two are the moments worth telling someone about. */
export function rollNestPayload(rand: () => number): (typeof NEST_PAYLOADS)[number] {
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

/** What one click paid, or will pay: a kind and how much of it. */
export interface DiversionReward {
  kind: DiversionRewardKind;
  amount: number;
  /** Which one, for the kind that has several: a seed's {@link SeedId}. */
  id?: string;
}

/**
 * The live numbers a payout is sized by, which only the engine knows. `gold` and
 * `essence` have already been through every multiplier the wave's own award goes
 * through, so the number a tooltip promises is the number that lands.
 */
export interface DiversionRewardContext {
  gold: number;
  essence: number;
}

/**
 * The XP one rub of the genie's lamp puts into a skill: exactly what the next
 * {@link LAMP_LEVELS} levels cost, so the skill climbs that many levels whatever it
 * has already banked towards the next one (the bank is below one level's cost, and
 * the costs never shrink as the level rises). Fewer near the cap, nothing at it.
 */
export function lampXp(level: number, maxLevel: number, xpForLevel: (level: number) => number): number {
  const from = Math.max(1, Math.floor(level));
  const to = Math.min(maxLevel, from + LAMP_LEVELS);
  let xp = 0;
  for (let l = from; l < to; l++) xp += xpForLevel(l);
  return xp;
}

/** The level a rub lifts a skill to, for the menu that offers it. */
export function lampLevelTo(level: number, maxLevel: number): number {
  return Math.min(maxLevel, Math.max(1, Math.floor(level)) + LAMP_LEVELS);
}

/** What one popped balloon pays on this board, or null for an empty one. */
export function balloonReward(gift: BalloonGift, ctx: DiversionRewardContext): DiversionReward | null {
  if (gift === 'gold') return { kind: 'gold', amount: Math.max(1, Math.round(ctx.gold * BALLOON_GOLD_SHARE)) };
  if (gift === 'essence') return { kind: 'essence', amount: Math.max(1, Math.round(ctx.essence * BALLOON_ESSENCE_SHARE)) };
  return null;
}

/** What one payload is worth on this board. A walkby pays nothing, and an unopened
 *  nest has no single answer yet, so both come back null. */
export function payloadReward(payload: DiversionPayload, ctx: DiversionRewardContext): DiversionReward | null {
  switch (payload) {
    case 'kebab':
      return { kind: 'kebab', amount: 1 };
    case 'lamp':
      return { kind: 'lamp', amount: 1 };
    case 'gold':
      return { kind: 'gold', amount: ctx.gold };
    case 'essence':
      return { kind: 'essence', amount: ctx.essence };
    case 'potion':
      return { kind: 'overload', amount: 1 };
    default:
      return null;
  }
}

/**
 * Everything a click on one of `defId` might pay, for the tooltip. One entry for
 * everyone but the nest, which lists each thing it could turn out to hold, and none
 * for a walkby. None for the plant either: its gift lives on the plant itself.
 */
export function diversionRewardOptions(defId: DiversionId, ctx: DiversionRewardContext): DiversionReward[] {
  const payload = DIVERSION_BY_ID[defId].payload;
  const payloads: readonly DiversionPayload[] = payload === 'surprise' ? NEST_PAYLOADS : [payload];
  return payloads.map(p => payloadReward(p, ctx)).filter((r): r is DiversionReward => r !== null);
}

/**
 * A payout rising off the spot it was paid at: the icon and the amount, floating up
 * and fading. `born` is `performance.now()` ms, because it runs on the real-world
 * clock like the walk cycles do.
 */
export interface DiversionPop {
  x: number;
  y: number;
  reward: DiversionReward;
  born: number;
}

/** The image a payout rises off the board as: its kind's own, or for a seed, that
 *  seed's. The engine registers one of each under these keys. */
export function rewardImageKey(reward: DiversionReward): string {
  return reward.kind === 'seed' && reward.id ? `reward_seed_${reward.id}` : `reward_${reward.kind}`;
}

// --- The Strange Plant -------------------------------------------------------

/** The chance a Strange Plant grows an Overload rather than a herb seed. */
export const PLANT_OVERLOAD_CHANCE = 0.5;

/** The lowest Farming level a plant's seed comes from. A free Guam saves ten gold,
 *  which is no event at all; from Avantoe up, a seed is a herb worth sowing. */
export const PLANT_SEED_MIN_LEVEL = 50;

/**
 * What a Strange Plant grew: an Overload, or one herb seed off the top of the ladder
 * to sow for free. Rolled when the plant appears rather than when it is picked, so
 * the hover card names exactly what is on it.
 */
export function rollPlantGift(rand: () => number): DiversionReward {
  if (rand() < PLANT_OVERLOAD_CHANCE) return { kind: 'overload', amount: 1 };
  const pool = SEEDS.filter(s => s.level >= PLANT_SEED_MIN_LEVEL);
  const seed = pool[Math.min(pool.length - 1, Math.floor(rand() * pool.length))];
  return { kind: 'seed', amount: 1, id: seed.id };
}

/** The plant's tip and its payout line, both naming the gift. */
export function plantGiftText(gift: DiversionReward): { tip: string; line: string } {
  const seed = gift.kind === 'seed' && gift.id ? SEED_BY_ID[gift.id as SeedId] : undefined;
  const name = seed ? seed.seedName : DIVERSION_REWARD_META[gift.kind].label;
  const named = `${/^[aeiou]/i.test(name) ? 'an' : 'a'} ${name}`;
  return { tip: `Click to pick ${named}.`, line: `The plant bears ${named}.` };
}

/** How long a payout floats before it is gone. */
export const DIVERSION_POP_MS = 1400;

/** The Collection Log's key for what one diversion has paid out in one kind. */
export function diversionGainKey(defId: DiversionId, kind: DiversionRewardKind): string {
  return `${defId}:${kind}`;
}

/**
 * Clean a persisted "diversion gains" blob: the lifetime total each diversion has
 * paid, per kind of reward, keyed by {@link diversionGainKey}.
 *
 * Same trust model as {@link sanitizeDiversionsMet}. A key survives only when both
 * halves still name something real, so retiring a diversion or a reward kind costs
 * its own totals and nothing else.
 */
export function sanitizeDiversionGains(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [key, v] of Object.entries(raw as Record<string, unknown>)) {
    const parts = key.split(':');
    if (parts.length !== 2) continue;
    const [defId, kind] = parts;
    if (!Object.prototype.hasOwnProperty.call(DIVERSION_BY_ID, defId)) continue;
    if (!DIVERSION_REWARD_KINDS.includes(kind as DiversionRewardKind)) continue;
    if (typeof v === 'number' && Number.isFinite(v) && v >= 1) out[key] = Math.floor(v);
  }
  return out;
}

/**
 * Clean a persisted "diversions met" blob — the Collection Log's record of which of
 * the cast has turned up on this account's board at least once.
 *
 * Same trust model as the other lifetime tallies: only ids that still exist in the
 * table survive, and only as positive whole counts, so a diversion retired by a
 * patch costs its own line rather than the whole log.
 */
export function sanitizeDiversionsMet(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (raw && typeof raw === 'object') {
    for (const id of Object.keys(DIVERSION_BY_ID)) {
      const v = (raw as Record<string, unknown>)[id];
      if (typeof v === 'number' && Number.isFinite(v) && v >= 1) out[id] = Math.floor(v);
    }
  }
  return out;
}
