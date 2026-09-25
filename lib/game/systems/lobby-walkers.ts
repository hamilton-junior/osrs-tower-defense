import { ENEMIES } from '../data/enemies';
import { NPC_HITPOINTS } from '../data/npc-hitpoints.data';
import { SPOTANIMS, spotAnimDurationS } from '../data/spotanims';
import { TOWERS } from '../data/towers';
import { DEATH_SETTLE_S } from '../data/enemy-anims';
import { HITSPLAT_LIFE, projectileEase } from '../core/engine-state';
import { fusionSpellFx } from './tower-fusion';
import type { EnemyDef, TowerType } from '../types';

/**
 * The start screen's wandering monsters. Every few seconds one of the game's own
 * NPCs walks across the lobby floor, in front of the torches, and off the far
 * side. Each one stands at its real OSRS size against the torches, and passes in
 * front of the menu only where its feet sit below the menu's bottom edge. Once
 * in a long while a shot flies in from off-screen, fells one in a single hit for
 * its full hitpoints, and the body drops where it stood.
 *
 * This module is the whole simulation: who spawns, where, how fast, when the shot
 * fires and lands. It holds no DOM and draws nothing; `components/game/lobby-walkers.tsx`
 * steps it every frame, draws what it holds and plays the sounds its events name.
 * All distances are the lobby's CSS pixels.
 */

/** No more than this many walk the floor at once. */
export const LOBBY_MAX_WALKERS = 5;
/** Seconds between spawns, drawn uniformly. */
export const LOBBY_SPAWN_GAP_S: readonly [number, number] = [5, 15];
/** The first walker comes sooner, so the room is not empty for a quarter minute. */
const FIRST_SPAWN_S: readonly [number, number] = [1, 4];
/** Each walker's odds, decided at spawn, of being shot. At ~6 spawns a minute that
 *  is about one kill every seven and a half minutes. */
export const LOBBY_STRIKE_CHANCE = 1 / 45;
/** Side of a walker's sprite cell at renderScale 1, in em, when the room has no
 *  world scale to size it by. */
export const LOBBY_CELL_EM = 5.5;
/** A human-sized monster's sprite cell, in world units (a skeleton's is 240): the
 *  size the board's shots, splats and GFX are drawn against. */
export const LOBBY_HUMAN_CELL = 240;
/** A crossing at the median enemy speed takes this long; faster monsters cross
 *  sooner, slower ones later, clamped to {@link CROSSING_S}. */
const MEDIAN_CROSSING_S = 22.5;
const MEDIAN_SPEED = 50;
const CROSSING_S: readonly [number, number] = [15, 30];
/** Closest two walkers' feet may sit, in em, so nobody walks inside another. */
const FEET_GAP_EM = 0.8;
/** Feet stay this far (em) inside the floor's top and bottom edges. */
const FLOOR_MARGIN_EM = 0.6;
/** Feet stand at least this far (em) in front of the torches' base, so every
 *  monster crossing a torch passes in front of it, never through it. */
const TORCH_CLEAR_EM = 0.4;
/** Board projectiles fly at 600 board px per second (see core/sim/combat). */
const SHOT_SPEED = 600;
/** A spell's bolt stays in the air at least this long, so its cast clip finishes
 *  before the impact sound starts, as the board's spells do. */
const SPELL_MIN_FLIGHT_S = 1.2;
const SHOT_MIN_FLIGHT_S = 0.45;
/** How far outside the lobby's edge a shot is launched from, in em. */
const SHOT_OFFSCREEN_EM = 2;
const TRAIL_POINTS = 6;
/** Direct-hit splats float up at this many board px per second (core/sim/waves). */
const SPLAT_RISE = 28;

/**
 * How rare each walker is: its weight is 1 / cost. The lobby is a cellar, so its
 * undead and dungeon critters are the common sight; demons and dragons come next;
 * the rest of the roster after them; the open-field animals less; bugs and birds
 * least. A superior costs twice its family.
 */
export const LOBBY_COST: Record<string, number> = {
  // Undead
  skeleton: 1, zombie: 1, ghost: 1, mummy: 1, ankou: 1, barrow_wight: 1, skeletal_mage: 1,
  // Dungeon critters
  rat: 1, giant_bat: 1, spider: 1, cave_bug: 1, cave_slime: 1, scorpion: 1, cave_horror: 1,
  // Demons
  imp: 2, lesser_demon: 2, black_demon: 2, abyssal_demon: 2, nechryael: 2, hellhound: 2, bloodveld: 2,
  // Dragons
  blue_dragon: 2, green_dragon: 2, bronze_dragon: 2,
  // Everyone else
  goblin: 4, hobgoblin: 4, moss_giant: 4, kalphite_worker: 4, scarab_mage: 4, locust_rider: 4,
  dust_devil: 4, kalphite_guardian: 4, ent: 4, thrower_troll: 4, troll_general: 4, tz_kih: 4,
  tok_xil: 4, yt_mejkot: 4, ket_zek: 4, tz_kek: 4, fire_giant: 4, hill_giant: 4, ice_warrior: 4,
  gargoyle: 4, jogre: 4, dark_beast: 4, ice_troll: 4, chaos_druid: 4,
  // Animals
  cow: 6, big_frog: 6, giant_frog: 6, desert_lizard: 6, jackal: 6, wolf: 6,
  // Bugs and birds
  vulture: 12, giant_mosquito: 12, harpie_bug_swarm: 12,
  // Superiors: twice their family
  superior_bloodveld: 4, superior_abyssal_demon: 4, superior_nechryael: 4, superior_gargoyle: 8,
};

/** Every monster a wave can send on its own: no bosses, no boss adds. */
export function lobbyRoster(): EnemyDef[] {
  return Object.values(ENEMIES).filter((d) => !d.isBoss && !d.summonedBy);
}

/** The baked sprite set a monster draws with. */
export function walkerSlug(def: EnemyDef): string {
  return def.animSlug ?? def.type;
}

/** The monster's real OSRS hitpoints, baked from the cache; the game's own `hp`
 *  stands in only for an enemy the bake has not reached. */
export function walkerHitpoints(def: EnemyDef): number {
  return NPC_HITPOINTS[walkerSlug(def)] ?? def.hp;
}

/** Weighted pick over the roster by {@link LOBBY_COST}. */
export function pickWalkerDef(rand: () => number, roster: EnemyDef[] = lobbyRoster()): EnemyDef {
  const weights = roster.map((d) => 1 / (LOBBY_COST[d.type] ?? 4));
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rand() * total;
  for (let i = 0; i < roster.length; i++) {
    r -= weights[i];
    if (r < 0) return roster[i];
  }
  return roster[roster.length - 1];
}

/** Seconds a monster of this `speed` takes to cross the lobby. The square root
 *  keeps the roster's speed order while squeezing 28..135 into 15..30 s. */
export function crossingSeconds(speed: number): number {
  const s = MEDIAN_CROSSING_S * Math.sqrt(MEDIAN_SPEED / Math.max(1, speed));
  return Math.min(CROSSING_S[1], Math.max(CROSSING_S[0], s));
}

/** The lobby's layout, measured by the component in CSS pixels. */
export interface LobbyStage {
  width: number;
  /** Top and bottom of the floor band, where feet may stand. */
  floorTop: number;
  floorBottom: number;
  /** The menu panel's bottom edge: feet below it walk in front of the menu. */
  menuBottom: number;
  /** Where the standing torches meet the floor; 0 while unknown. */
  torchFoot: number;
  /** Stretches of floor the menu does not cover, as [x0, x1]: where a shot may land. */
  strips: ReadonlyArray<readonly [number, number]>;
  /** CSS pixels per em, so every size tracks --ui-scale. */
  em: number;
  /** CSS pixels per world unit, read off the torches; 0 while unknown. */
  worldPx: number;
}

/** What the component knows about a loaded sprite set. */
export interface WalkerSheet {
  /** Where the feet sit in the walk cell, as a fraction of its height from the top. */
  feetFrac: number;
  /** Length of the death clip in seconds; 0 when the monster has none. */
  deathS: number;
  /** The cell's side in world units, when the bake recorded it. */
  worldCell: number | null;
}

export interface LobbyShot {
  tower: TowerType;
  /** The `<tier>_<level>` spell a wizard or fused staff casts; null for everything else. */
  spell: string | null;
  color: string;
  ox: number;
  oy: number;
  x: number;
  y: number;
  /** Seconds in the air, counted from launch. */
  age: number;
  flight: number;
  launched: boolean;
  trail: Array<{ x: number; y: number }>;
}

export interface LobbyWalker {
  id: number;
  def: EnemyDef;
  slug: string;
  dir: 1 | -1;
  x: number;
  feetY: number;
  /** Side of the drawn sprite cell. */
  size: number;
  speed: number;
  sheet: WalkerSheet;
  /** Seconds of walk loop played; starts at a random phase. */
  walkAge: number;
  strike: { atX: number; launchX: number; shot: LobbyShot } | null;
  /** Seconds since the shot landed; null while it still walks. */
  deadAge: number | null;
}

export interface LobbySplat { x: number; y: number; value: number; life: number }
export interface LobbyGfx { slug: string; x: number; y: number; size: number; age: number }

export interface LobbyState {
  walkers: LobbyWalker[];
  splats: LobbySplat[];
  gfx: LobbyGfx[];
  nextSpawn: number;
  nextId: number;
}

export type LobbyEvent =
  | { kind: 'fire'; sound: string }
  | { kind: 'impact'; sounds: string[] };

export interface LobbyEnv {
  stage: LobbyStage;
  rand: () => number;
  /** The sprite set for `slug`, or null while it is still loading (asking starts the load). */
  sheet: (slug: string) => WalkerSheet | null;
}

export function newLobby(rand: () => number): LobbyState {
  return { walkers: [], splats: [], gfx: [], nextSpawn: between(rand, FIRST_SPAWN_S), nextId: 1 };
}

/** Side of a human-sized monster's cell in the lobby. */
function humanCell(stage: LobbyStage): number {
  return stage.worldPx > 0 ? LOBBY_HUMAN_CELL * stage.worldPx : LOBBY_CELL_EM * stage.em;
}

/** Board pixels to lobby pixels: a human-sized cell is {@link humanCell} where the
 *  board draws the same cell 30 × 1.32 px (render/enemies), so shots, splats and
 *  GFX keep their size against the monster. */
export function lobbyUnit(stage: LobbyStage): number {
  return humanCell(stage) / (30 * 1.32);
}

/** Lobby-only growth for monsters whose real size reads as a speck beside the
 *  others. The jackal's own model (26260) walks 95 units long; 1.7× matches the
 *  Giant rat's 162. The board keeps every monster at its real size. */
export const LOBBY_SIZE_BOOST: Readonly<Record<string, number>> = { jackal: 1.7 };

/** Side of a walker's sprite cell: its baked world size at the room's scale, or
 *  the board's relative size when either is unknown. */
export function walkerSize(def: EnemyDef, sheet: WalkerSheet, stage: LobbyStage): number {
  const boost = LOBBY_SIZE_BOOST[walkerSlug(def)] ?? 1;
  if (sheet.worldCell && stage.worldPx > 0) return sheet.worldCell * stage.worldPx * boost;
  return LOBBY_CELL_EM * stage.em * (def.renderScale ?? 1) * boost;
}

/** A walker's body centre: the middle of its sprite cell. */
export function walkerBodyY(w: LobbyWalker): number {
  return w.feetY - w.size * w.sheet.feetFrac + w.size / 2;
}

/** Whether a walker draws over the menu: its feet sit below the panel's bottom. */
export function walkerOverMenu(w: LobbyWalker, stage: LobbyStage): boolean {
  return w.feetY > stage.menuBottom;
}

/** A feet line in front of the torches and at least {@link FEET_GAP_EM} from every
 *  walker's, or null when the floor has no room left after a few tries. */
export function pickFeetY(rand: () => number, stage: LobbyStage, taken: number[]): number | null {
  const lo = Math.max(stage.floorTop + FLOOR_MARGIN_EM * stage.em, stage.torchFoot + TORCH_CLEAR_EM * stage.em);
  const hi = stage.floorBottom - FLOOR_MARGIN_EM * stage.em;
  if (hi <= lo) return null;
  const gap = FEET_GAP_EM * stage.em;
  for (let i = 0; i < 12; i++) {
    const y = lo + rand() * (hi - lo);
    if (taken.every((t) => Math.abs(t - y) >= gap)) return y;
  }
  return null;
}

/** Tower types that throw something: every one but the halberd, whose blade has no flight. */
export function strikeTowers(): TowerType[] {
  return (Object.keys(TOWERS) as TowerType[]).filter((t) => t !== 'noxious_halberd');
}

/** Every spell with a baked flight and impact, as its `<tier>_<level>` key. */
export function lobbySpells(): string[] {
  return Object.keys(SPOTANIMS)
    .filter((k) => /^proj_(air|water|earth|fire|ice|blood|shadow|smoke)_\d$/.test(k))
    .map((k) => k.slice('proj_'.length))
    .filter((spell) => !!SPOTANIMS[`hit_${spell}`]);
}

/** Plan the shot that fells `w`, or null when no visible floor lies on its path. */
export function planStrike(
  rand: () => number, stage: LobbyStage, w: LobbyWalker,
): LobbyWalker['strike'] {
  const strips = stage.strips.filter(([x0, x1]) => x1 - x0 >= w.size);
  if (!strips.length) return null;
  const [x0, x1] = strips[Math.floor(rand() * strips.length)];
  const atX = x0 + w.size / 2 + rand() * (x1 - x0 - w.size);

  const towers = strikeTowers();
  const tower = towers[Math.floor(rand() * towers.length)];
  const spells = lobbySpells();
  const spell = tower === 'wizard'
    ? spells[Math.floor(rand() * spells.length)] ?? null
    : fusionSpellFx(tower);
  const tiers = TOWERS[tower]?.tiers ?? [];
  const color = tiers[Math.floor(rand() * tiers.length)]?.color ?? '#ffffff';

  // Launched from just past the nearer side of the lobby, somewhere up the wall.
  const off = SHOT_OFFSCREEN_EM * stage.em;
  const ox = atX < stage.width / 2 ? -off : stage.width + off;
  const oy = stage.floorTop * (0.3 + 0.5 * rand());
  const dist = Math.hypot(atX - ox, walkerBodyY(w) - oy);
  const flight = Math.max(spell ? SPELL_MIN_FLIGHT_S : SHOT_MIN_FLIGHT_S, dist / (SHOT_SPEED * lobbyUnit(stage)));
  // Fire early enough that the walker reaches atX as the shot lands.
  const launchX = atX - w.dir * w.speed * flight;
  return {
    atX,
    launchX,
    shot: { tower, spell, color, ox, oy, x: ox, y: oy, age: 0, flight, launched: false, trail: [] },
  };
}

function between(rand: () => number, [lo, hi]: readonly [number, number]): number {
  return lo + rand() * (hi - lo);
}

function spawn(s: LobbyState, env: LobbyEnv): void {
  const { stage, rand } = env;
  const def = pickWalkerDef(rand);
  const slug = walkerSlug(def);
  const sheet = env.sheet(slug);
  // Not loaded yet: asking started the load, so roll again shortly.
  if (!sheet) { s.nextSpawn = 0.5; return; }
  const feetY = pickFeetY(rand, stage, s.walkers.map((w) => w.feetY));
  if (feetY === null) { s.nextSpawn = 1; return; }
  const size = walkerSize(def, sheet, stage);
  const dir: 1 | -1 = rand() < 0.5 ? 1 : -1;
  const w: LobbyWalker = {
    id: s.nextId++,
    def,
    slug,
    dir,
    x: dir === 1 ? -size / 2 : stage.width + size / 2,
    feetY,
    size,
    speed: (stage.width + size) / crossingSeconds(def.speed),
    sheet,
    walkAge: rand() * 10,
    strike: null,
    deadAge: null,
  };
  if (rand() < LOBBY_STRIKE_CHANCE) w.strike = planStrike(rand, stage, w);
  s.walkers.push(w);
  s.nextSpawn = between(rand, LOBBY_SPAWN_GAP_S);
}

function land(s: LobbyState, w: LobbyWalker, shot: LobbyShot, stage: LobbyStage): LobbyEvent {
  const bodyY = walkerBodyY(w);
  w.deadAge = 0;
  w.strike = null;
  s.splats.push({ x: w.x, y: bodyY, value: walkerHitpoints(w.def), life: HITSPLAT_LIFE });
  const sounds: string[] = [];
  if (shot.spell) {
    const slug = `hit_${shot.spell}`;
    const meta = SPOTANIMS[slug];
    if (meta) {
      // The board sizes an impact to the struck model the same way (impactScale).
      const modelScale = Math.min(2.2, Math.max(0.7, w.size / humanCell(stage)));
      s.gfx.push({ slug, x: w.x, y: bodyY, size: meta.size * 0.5 * modelScale * lobbyUnit(stage), age: 0 });
    }
    sounds.push(slug);
  } else if (shot.tower !== 'archer' && shot.tower !== 'toxic') {
    // Arrows and darts land silent on the board too; everything else thuds.
    sounds.push('hit');
  }
  sounds.push(`death_${w.def.type}`);
  return { kind: 'impact', sounds };
}

/** Advance the lobby by `dt` seconds. Returns the sounds to play this frame. */
export function stepLobby(s: LobbyState, dt: number, env: LobbyEnv): LobbyEvent[] {
  const events: LobbyEvent[] = [];
  const { stage } = env;

  s.nextSpawn -= dt;
  if (s.nextSpawn <= 0) {
    if (s.walkers.length < LOBBY_MAX_WALKERS) spawn(s, env);
    else s.nextSpawn = between(env.rand, LOBBY_SPAWN_GAP_S);
  }

  for (let i = s.walkers.length - 1; i >= 0; i--) {
    const w = s.walkers[i];
    if (w.deadAge !== null) {
      w.deadAge += dt;
      if (w.deadAge >= w.sheet.deathS + DEATH_SETTLE_S) s.walkers.splice(i, 1);
      continue;
    }
    w.x += w.dir * w.speed * dt;
    w.walkAge += dt;
    const strike = w.strike;
    if (strike) {
      const shot = strike.shot;
      if (!shot.launched && w.dir * (w.x - strike.launchX) >= 0) {
        shot.launched = true;
        events.push({ kind: 'fire', sound: shot.spell ? `cast_${shot.spell}` : `fire_${shot.tower}` });
      } else if (shot.launched) {
        shot.age += dt;
        const f = projectileEase(Math.min(1, shot.age / shot.flight));
        shot.x = shot.ox + (w.x - shot.ox) * f;
        shot.y = shot.oy + (walkerBodyY(w) - shot.oy) * f;
        shot.trail.push({ x: shot.x, y: shot.y });
        if (shot.trail.length > TRAIL_POINTS) shot.trail.shift();
        if (shot.age >= shot.flight) {
          events.push(land(s, w, shot, stage));
          continue;
        }
      }
    }
    const gone = w.dir === 1 ? w.x - w.size / 2 > stage.width : w.x + w.size / 2 < 0;
    if (gone) s.walkers.splice(i, 1);
  }

  const rise = SPLAT_RISE * lobbyUnit(stage);
  for (let i = s.splats.length - 1; i >= 0; i--) {
    const h = s.splats[i];
    h.life -= dt;
    h.y -= rise * dt;
    if (h.life <= 0) s.splats.splice(i, 1);
  }
  for (let i = s.gfx.length - 1; i >= 0; i--) {
    const g = s.gfx[i];
    g.age += dt;
    const meta = SPOTANIMS[g.slug];
    if (!meta || g.age >= spotAnimDurationS(meta)) s.gfx.splice(i, 1);
  }
  return events;
}

/** Walkers in draw order: farther back (higher on the floor) first. */
export function drawOrder(walkers: readonly LobbyWalker[]): LobbyWalker[] {
  return [...walkers].sort((a, b) => a.feetY - b.feetY);
}
