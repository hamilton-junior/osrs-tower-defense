import type { Tower, Item, SlayerTask, PrayerType, EnemyType } from '../types';
import type { GameMode, RunModifiers, RunEffects, RelicEffects } from '../core/engine';
import { clampTier, type DifficultyTier } from './difficulty';
import { BIOMES, type BiomeId } from '../data/biomes';
import { HUNTER_TRAP_BY_ID, type HunterTrapId } from '../data/hunter-traps';
import { SEED_BY_ID, type SeedId } from '../data/farming';
import { GEAR } from '../data/gear';
import type { RunStats } from './combat-achievements';

/**
 * The in-progress-run save: a snapshot of everything a player would lose by
 * closing the tab mid-run (towers, gold, lives, the wave they reached, and the
 * roguelite build they drafted).
 *
 * It is a **between-waves checkpoint**, not a frame-accurate freeze. Enemies,
 * projectiles and other transient combat state are never serialized: a snapshot
 * is only taken while the field is idle (see `GameEngine.snapshotRun`), so
 * resuming always drops the player at the start of a wave with the board exactly
 * as they left it. That keeps the format small, and keeps a stale save from
 * resurrecting half a dead wave.
 *
 * Cards and relics are stored **by id** and re-resolved against the live pools on
 * load, so a save survives a content patch that re-words a card. Their accrued
 * effects (`runMods` / `runFx` / `relicFx`) are stored outright rather than
 * replayed, because a draft's effect is applied once at pick time and some cards
 * roll random values.
 */
export interface RunSave {
  version: number;
  /** Epoch ms of the snapshot — shown on the Continue button. */
  savedAt: number;
  /** Seed of the procedural map, so the road comes back identical. It rolls the
   *  *opening* region too, but the run travels away from it — {@link biome} is what
   *  says where the run actually stands. */
  mapSeed: number;
  /** The region the run is standing in, and the one it marched out of. The seed only
   *  names where the journey *started*, so without these a save taken three legs in
   *  would resume back at the opening region with the wrong monsters. Optional —
   *  RUN_SAVE_VERSION stays 4, and a save written before travelling existed resumes
   *  in its seed's region, which is exactly where it was. */
  biome?: BiomeId;
  previousBiome?: BiomeId | null;
  /** A fork in the road the player had not answered yet. Saved so quitting at a turn
   *  does not silently pick for them; absent whenever the run is mid-leg. */
  pendingTravel?: BiomeId[];
  /** The notches the player dug into the road, in purchase order — the half of
   *  the map the seed does not describe. Each names the road tile it pulled, the way it
   *  went and how many tiles out it has been pulled, so the set survives one of them
   *  being filled back in. Replayed onto the freshly seeded road on load. Optional: a
   *  save written before road shaping resumes on the road it was dealt, and one written
   *  before notches had a depth reads every notch as one tile out. */
  roadNotches?: { x: number; y: number; dir: 'up' | 'down' | 'left' | 'right'; depth?: number }[];
  /** The stretches of the dealt road the player slid across, in purchase order. Each
   *  names a leg of the seeded road and how far it has been pushed off its dealt line,
   *  so a slide that squeezed a turn away is rebuilt exactly. Optional: a save written
   *  before sliding shipped resumes on the road the seed drew. */
  roadShifts?: { seg: number; dx: number; dy: number }[];
  gameMode: GameMode;
  /** The New Game+ tier this run is being played at. Absent on saves written
   *  before the ladder shipped → they resume at tier 0 (Normal). */
  difficultyTier: DifficultyTier;
  wave: number;
  money: number;
  lives: number;
  maxLives: number;
  kills: number;
  goldEarned: number;
  towersBuilt: number;
  /** Seeds sown and herbs pulled this run, for the end-of-run summary. Optional:
   *  a save written before farming existed resumes with both at 0. */
  seedsSown?: number;
  herbsHarvested?: number;
  /** Whether this leg has already spent its one tower fusion. Optional: a save
   *  written before fusion existed simply resumes with its forge unspent. */
  fusedThisLeg?: boolean;
  essenceEarnedThisRun: number;
  /** Simulated seconds elapsed — every tower cooldown is stamped against this. */
  gameTime: number;
  /** Real seconds spent playing — the run timer. Travels separately from
   *  `gameTime` because the two diverge the moment the run is sped up, and a
   *  resumed run must not restart its clock. Absent on saves written before the
   *  timer switched to wall-clock; those resume at 0 rather than inheriting a
   *  simulated figure that would read as hours. */
  realTime: number;
  towers: Tower[];
  /** Unequipped Classic gear in the loot bag. Optional: saves written before
   *  gear existed lack it and resume with an empty bag. Equipped gear rides in
   *  `towers`. Cleared on a new run (never survives restart / clearRunSave). */
  lootBag?: Item[];
  runMods: RunModifiers;
  runFx: RunEffects;
  relicFx: RelicEffects;
  runCards: { id: string; count: number }[];
  /** Ids of `unique` cards already drafted (excluded from later hands). */
  draftedUnique: string[];
  /** Card ids of a draft hand still awaiting a pick (it blocks the next wave). */
  pendingDraft: string[] | null;
  /** Relic ids of a relic choice still awaiting a pick. */
  pendingRelics: string[] | null;
  ownedRelics: string[];
  draftRerolls: number;
  /** Card rolls bought this run — restores the escalating roll price. Absent in
   *  saves written before cards were bought rather than handed out. */
  cardRollsBought?: number;
  /** Whether a pending hand is a boss's boosted one (so a re-roll stays boosted). */
  draftBoosted?: boolean;
  /** Combat Achievement facts for the run in progress. Optional on purpose:
   *  RUN_SAVE_VERSION stays 3, so a run saved before this feature still resumes —
   *  it simply restarts its CA counters. Bumping the version would invalidate
   *  every save currently sitting in a player's browser. */
  caStats?: RunStats;
  /** Bosses killed *this run*, keyed by enemy type. The boss schedule marches
   *  through `SCHEDULABLE_BOSSES` gentlest-first by reading this, and victory is
   *  "all of them, this run" — so a resumed run without it restarts the ladder at
   *  the first boss, whatever wave the player is on. Optional like `caStats`: a
   *  save written before this field resumes with an empty record, as it always did. */
  bossesKilled?: Record<string, number>;
  /** The victory latch and what came after it. `won` stays true for the rest of the
   *  run, `runPhase` says whether the player took the Endless victory lap, and
   *  `victoryWave` anchors the Endless HP curve. Without them a resumed Endless run
   *  drops back to the normal curve and pops its victory screen a second time.
   *  Optional — an older save resumes as a run still to be won. */
  won?: boolean;
  runPhase?: 'normal' | 'endless';
  victoryWave?: number;
  /** The run's own Hunter skill: the level it reached and the XP banked toward the
   *  next one. Optional like the fields above — RUN_SAVE_VERSION stays 3, and a save
   *  written before traps existed resumes at Hunter 1, as a fresh run does. */
  hunter?: { level: number; xp: number };
  /** Traps still lying on the road when the run was put down. A between-waves
   *  checkpoint saves them because they were paid for between waves: losing them on
   *  a resume would quietly charge the player for nothing. */
  traps?: { defId: HunterTrapId; x: number; y: number; charges: number }[];
  /** What is growing in the allotments, addressed by the plot's tile-derived id. */
  farmPatches?: { id: string; seedId: SeedId; grown: number }[];
  /** Where every plot stands — one tile-derived id each (`p<col>_<row>`), which is
   *  the whole board, since a plot's id *is* its tile. The map's own seed no longer
   *  answers this: plots can be moved and bought. Absent in saves written before
   *  they could be, and those resume with the ground their seed deals — which is
   *  exactly where their plots were, so nothing needed a version bump. */
  plots?: string[];
  /** How many plots this run has bought, which is what the doubling price reads. */
  plotsBought?: number;
  /** A herb pulled but not yet spent. The checkpoint sits in exactly the gap a
   *  harvest happens in, so dropping it would pocket the player's herb. */
  farmBuff?: SeedId | null;
  slayer: {
    task: SlayerTask | null;
    points: number;
    streak: number;
    /** Shop unlocks. Absent in saves written before the rewards shop grew — they
     *  restore as "not bought" rather than voiding the save. */
    helmet: boolean;
    imbued: boolean;
    biggerBadder: boolean;
    /** Monsters bought out of the rotation / bought as doubled tasks. */
    blocked: EnemyType[];
    extended: EnemyType[];
    lastTaskType: EnemyType | null;
    masterId: string;
  };
  prayer: { points: number; active: PrayerType[] };
}

/** Bump when a field's meaning changes — an older save is then discarded rather
 *  than half-read into a run that would misbehave. */
export const RUN_SAVE_VERSION = 4;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);
/** A region id, or null if it names one this build does not have (a save from a
 *  patch that had a region since removed) — the caller then falls back to the seed. */
const biomeId = (v: unknown): BiomeId | null =>
  (typeof v === 'string' && v in BIOMES ? (v as BiomeId) : null);
const strList = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
/** A `{ key: count }` tally read back from a save — keeps only positive whole
 *  counts, so a corrupted entry costs one boss rather than the whole run. */
const countRecord = (v: unknown): Record<string, number> => {
  if (!isObj(v)) return {};
  const out: Record<string, number> = {};
  for (const [k, n] of Object.entries(v)) {
    if (typeof n === 'number' && Number.isFinite(n) && n >= 1) out[k] = Math.floor(n);
  }
  return out;
};

/**
 * Validate a blob read back from `localStorage` and return it as a `RunSave`, or
 * `null` if it is unusable — wrong version, not an object, or missing the parts a
 * run cannot be rebuilt without (a board of towers, a wave, the roguelite mod
 * buckets). Anything merely *odd* is coerced to a sane value instead: a save is
 * the player's own data, so the bar is "can the engine resume from this", not
 * "is every byte pristine".
 *
 * Returning `null` is always safe — the caller drops the save and the player
 * starts fresh.
 */
export function sanitizeRunSave(raw: unknown): RunSave | null {
  if (!isObj(raw)) return null;
  if (raw.version !== RUN_SAVE_VERSION) return null;

  // The board is the point of the save. No towers array => nothing to restore.
  const towers = Array.isArray(raw.towers)
    ? raw.towers.filter((t): t is Tower => isObj(t) && typeof t.id === 'string' && typeof t.type === 'string'
      && Number.isFinite(t.x) && Number.isFinite(t.y))
      .map((t) => (isObj(t.equipment)
        ? { ...t, equipment: {
            ammo: t.equipment.ammo ? refreshGear(t.equipment.ammo) : null,
            jewellery: t.equipment.jewellery ? refreshGear(t.equipment.jewellery) : null,
          } }
        : t))
    : null;
  if (!towers) return null;

  // The mod buckets are read every frame by the combat pipe; a missing one would
  // crash the run rather than degrade it, so a save without them is unusable.
  if (!isObj(raw.runMods) || !isObj(raw.runFx) || !isObj(raw.relicFx)) return null;

  const wave = Math.max(1, Math.floor(num(raw.wave, 1)));
  const maxLives = Math.max(1, Math.floor(num(raw.maxLives, 1)));
  const slayerRaw = isObj(raw.slayer) ? raw.slayer : {};
  const prayerRaw = isObj(raw.prayer) ? raw.prayer : {};
  const taskRaw = isObj(slayerRaw.task) ? slayerRaw.task : null;

  return {
    version: RUN_SAVE_VERSION,
    savedAt: num(raw.savedAt, 0),
    mapSeed: num(raw.mapSeed, 0) >>> 0,
    // Each notch is four small facts; anything malformed is dropped rather than
    // replayed, which costs the player a notch but never a broken road. A missing or
    // nonsensical depth reads as one tile out — the shape every notch had before depth
    // existed, and the shallowest a notch is ever allowed to be.
    roadNotches: Array.isArray(raw.roadNotches)
      ? raw.roadNotches
          .filter(isObj)
          .filter((n) => n.dir === 'up' || n.dir === 'down' || n.dir === 'left' || n.dir === 'right')
          .map((n) => ({
            x: Math.round(num(n.x, 0)),
            y: Math.round(num(n.y, 0)),
            dir: n.dir as 'up' | 'down' | 'left' | 'right',
            depth: Math.max(1, Math.round(num(n.depth, 1))),
          }))
      : [],
    // Same bargain as the notches: a malformed slide is dropped, never replayed.
    roadShifts: Array.isArray(raw.roadShifts)
      ? raw.roadShifts
          .filter(isObj)
          .map((s) => ({
            seg: Math.round(num(s.seg, -1)),
            dx: Math.round(num(s.dx, 0)),
            dy: Math.round(num(s.dy, 0)),
          }))
          .filter((s) => s.seg >= 0 && (s.dx !== 0 || s.dy !== 0))
      : [],
    ...(biomeId(raw.biome) ? { biome: biomeId(raw.biome)! } : {}),
    ...(biomeId(raw.previousBiome) ? { previousBiome: biomeId(raw.previousBiome)! } : {}),
    ...(Array.isArray(raw.pendingTravel)
      ? { pendingTravel: raw.pendingTravel.map(biomeId).filter((b): b is BiomeId => b !== null) }
      : {}),
    gameMode: raw.gameMode === 'classic' ? 'classic' : 'roguelite',
    // difficultyTier is itself back-compatible (missing => 0). The v2->v3 bump
    // above discards old saves by the repo's every-shape-change convention, not
    // out of necessity — this default would have migrated a v2 save cleanly.
    difficultyTier: clampTier(num(raw.difficultyTier, 0)),
    wave,
    money: Math.max(0, Math.floor(num(raw.money, 0))),
    // A save with 0 lives would resume straight into a game over.
    lives: Math.min(maxLives, Math.max(1, Math.floor(num(raw.lives, maxLives)))),
    maxLives,
    kills: Math.max(0, Math.floor(num(raw.kills, 0))),
    goldEarned: Math.max(0, Math.floor(num(raw.goldEarned, 0))),
    towersBuilt: Math.max(0, Math.floor(num(raw.towersBuilt, 0))),
    fusedThisLeg: raw.fusedThisLeg === true,
    essenceEarnedThisRun: Math.max(0, Math.floor(num(raw.essenceEarnedThisRun, 0))),
    gameTime: Math.max(0, num(raw.gameTime, 0)),
    realTime: Math.max(0, num(raw.realTime, 0)),
    towers,
    lootBag: Array.isArray(raw.lootBag)
      // The slot must be one this build still knows how to wear: a save from an
      // older gear model can carry a piece typed 'weapon'/'seed', and nothing
      // downstream would catch it — it would just land in the jewellery slot.
      ? raw.lootBag
          .filter((g): g is Item => isObj(g) && typeof g.id === 'string' && (g.type === 'ammo' || g.type === 'jewellery'))
          .map(refreshGear)
      : [],
    runMods: raw.runMods as unknown as RunModifiers,
    runFx: raw.runFx as unknown as RunEffects,
    relicFx: raw.relicFx as unknown as RelicEffects,
    runCards: Array.isArray(raw.runCards)
      ? raw.runCards
        .filter((c): c is { id: string; count: number } => isObj(c) && typeof c.id === 'string')
        .map((c) => ({ id: c.id, count: Math.max(1, Math.floor(num(c.count, 1))) }))
      : [],
    draftedUnique: strList(raw.draftedUnique),
    pendingDraft: Array.isArray(raw.pendingDraft) ? strList(raw.pendingDraft) : null,
    pendingRelics: Array.isArray(raw.pendingRelics) ? strList(raw.pendingRelics) : null,
    ownedRelics: strList(raw.ownedRelics),
    draftRerolls: Math.max(0, Math.floor(num(raw.draftRerolls, 0))),
    cardRollsBought: Math.max(0, Math.floor(num(raw.cardRollsBought, 0))),
    draftBoosted: raw.draftBoosted === true,
    // Cast, not rebuilt, like the mod buckets above: every CA predicate reads it
    // defensively and a missing field only ever costs the player a task.
    caStats: isObj(raw.caStats) ? (raw.caStats as unknown as RunStats) : undefined,
    bossesKilled: countRecord(raw.bossesKilled),
    won: raw.won === true,
    // Endless only exists past a win, so an unwon save is always 'normal' — that
    // pairing is what `continueEndless` and the Endless HP curve both assume.
    runPhase: raw.won === true && raw.runPhase === 'endless' ? 'endless' : 'normal',
    victoryWave: Math.max(0, Math.floor(num(raw.victoryWave, 0))),
    hunter: isObj(raw.hunter)
      ? {
        level: Math.min(99, Math.max(1, Math.floor(num(raw.hunter.level, 1)))),
        xp: Math.max(0, num(raw.hunter.xp, 0)),
      }
      : undefined,
    // An unknown trap id is one this build no longer has — drop that trap rather
    // than the save, exactly as a malformed road bend is dropped.
    traps: Array.isArray(raw.traps)
      ? raw.traps
        .filter(isObj)
        .filter((t) => typeof t.defId === 'string' && t.defId in HUNTER_TRAP_BY_ID)
        .map((t) => ({
          defId: t.defId as HunterTrapId,
          x: num(t.x, 0),
          y: num(t.y, 0),
          charges: Math.max(1, Math.floor(num(t.charges, 1))),
        }))
      : [],
    // A seed id this build no longer grows takes its patch out of the save rather
    // than the save out of the run — the same bargain the trap list strikes above.
    farmPatches: Array.isArray(raw.farmPatches)
      ? raw.farmPatches
        .filter(isObj)
        .filter((p) => typeof p.id === 'string' && typeof p.seedId === 'string' && p.seedId in SEED_BY_ID)
        .map((p) => ({
          id: p.id as string,
          seedId: p.seedId as SeedId,
          // Saves written while farming still read the wave counter stored the wave
          // the seed went in; the same number of waves have gone by either way, so
          // they resume where they were rather than costing the version a bump.
          grown: 'grown' in p
            ? Math.max(0, Math.floor(num(p.grown, 0)))
            : Math.max(0, Math.floor(num(raw.wave, 1)) - Math.floor(num(p.sownAtWave, 0))),
        }))
      : [],
    // A plot id is a tile, and a tile is two numbers — anything else in this list is
    // not a plot, and a duplicate would stand two allotments on one square.
    plots: Array.isArray(raw.plots)
      ? [...new Set(raw.plots.filter((id): id is string => typeof id === 'string' && /^p\d+_\d+$/.test(id)))]
        .slice(0, 400)
      : [],
    plotsBought: Math.max(0, Math.floor(num(raw.plotsBought, 0))),
    // Same story: it used to be `{ seedId, wave }`, live only on the wave it was
    // stamped with. A resumed checkpoint sits between waves, so an older buff comes
    // back only if it was still the live one when the game was put down.
    farmBuff: typeof raw.farmBuff === 'string' && raw.farmBuff in SEED_BY_ID
      ? raw.farmBuff as SeedId
      : isObj(raw.farmBuff) && typeof raw.farmBuff.seedId === 'string'
        && raw.farmBuff.seedId in SEED_BY_ID
        && num(raw.farmBuff.wave, -1) === num(raw.wave, 1)
        ? raw.farmBuff.seedId as SeedId
        : null,
    seedsSown: Math.max(0, Math.floor(num(raw.seedsSown, 0))),
    herbsHarvested: Math.max(0, Math.floor(num(raw.herbsHarvested, 0))),
    slayer: {
      task: taskRaw && typeof taskRaw.type === 'string'
        ? {
          type: taskRaw.type as EnemyType,
          count: Math.max(0, Math.floor(num(taskRaw.count, 0))),
          total: Math.max(1, Math.floor(num(taskRaw.total, 1))),
          reward: Math.max(0, Math.floor(num(taskRaw.reward, 0))),
        }
        : null,
      points: Math.max(0, Math.floor(num(slayerRaw.points, 0))),
      streak: Math.max(0, Math.floor(num(slayerRaw.streak, 0))),
      helmet: slayerRaw.helmet === true,
      imbued: slayerRaw.imbued === true,
      biggerBadder: slayerRaw.biggerBadder === true,
      blocked: strList(slayerRaw.blocked) as EnemyType[],
      extended: strList(slayerRaw.extended) as EnemyType[],
      lastTaskType: (str(slayerRaw.lastTaskType) as EnemyType | null) ?? null,
      masterId: str(slayerRaw.masterId) ?? '',
    },
    prayer: {
      points: Math.max(0, num(prayerRaw.points, 0)),
      active: strList(prayerRaw.active) as PrayerType[],
    },
  };
}

/** Whether a run is worth offering back to the player: an untouched wave-1 board
 *  with nothing built on it is not progress, it is the title screen. */
export function isResumable(save: RunSave): boolean {
  return save.wave > 1 || save.towers.length > 0;
}

/** A save stores gear as the item object that was written, so a piece whose stats or
 *  signature effect changed in a later patch would come back frozen in the shape it
 *  had — an amulet quietly doing nothing. Re-read anything the current pool still
 *  knows by id; a piece it doesn't know (one retired since) is handed back untouched,
 *  so the slot is never silently emptied. */
function refreshGear(worn: Item): Item {
  return GEAR[worn.id] ?? worn;
}
