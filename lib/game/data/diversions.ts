import { ASSETS, itemIcon, npcModel } from '../assets';
import { SEED_BY_ID, type SeedId } from './farming';

/** The two extra yaws baked for a walker (`scripts/render-osrs-npcs.mjs`). The side
 *  bake walks right; the renderer mirrors it for the other direction. */
const turned = (slug: string) => ({ back: npcModel(`${slug}_back`), side: npcModel(`${slug}_side`) });

/**
 * **Distractions & Diversions** — the world turning up between waves.
 *
 * One spawner wearing three moods, which is the whole point of the frame: a walkby
 * only ever talks, an event hands something over, and a nest is a thing on the floor.
 * They share a timer, a spawn scan, a click handler and a renderer layer, so a fourth
 * mood costs a table entry rather than a system.
 *
 * The house rule for this whole section: **nothing may demand timing, APM or constant
 * attention, and everything is optional.** Ignoring a diversion costs the run nothing —
 * so they only ever appear between waves, they never block a build spot, and they wait
 * for as long as the prep phase lasts rather than counting down.
 */

/** What a diversion is *for*. Also its spawn budget: each mood rolls its own chance. */
export type DiversionMood = 'walkby' | 'event' | 'nest';

export type DiversionId =
  | 'hans' | 'hunting_expert' | 'lumbridge_guide' | 'party_pete'
  | 'drunken_dwarf' | 'genie' | 'strange_plant' | 'sergeant_damien'
  | 'bird_nest';

/**
 * What clicking one pays out. `none` is the walkbys — they are scenery with dialogue.
 * `surprise` is the bird nest, which rolls one of the nest's payloads when it is
 * opened. `kebab` and `lamp` are items, and land in the inventory. `plant` is the
 * Strange Plant's, decided the moment it grows: an Overload or a herb seed. `drill` is
 * Sergeant Damien's: every tower on the board climbs {@link DRILL_LEVELS} levels.
 */
export type DiversionPayload = 'none' | 'kebab' | 'lamp' | 'gold' | 'essence' | 'potion' | 'surprise' | 'plant' | 'drill';

/**
 * What a click actually lands in the player's hands. The tooltip, the toast, the
 * number that rises off the sprite and the Collection Log's totals all speak in
 * these. `charges` is the one nobody clicks for: the Hunting expert puts them back
 * into a trap on the road. `life` is paid by nobody any more, since the kebab became
 * something to carry; it stays so an account's old kebab totals still show.
 */
export type DiversionRewardKind = 'life' | 'kebab' | 'lamp' | 'gold' | 'essence' | 'overload' | 'seed' | 'levels' | 'charges';

export const DIVERSION_REWARD_KINDS: DiversionRewardKind[] = ['life', 'kebab', 'lamp', 'gold', 'essence', 'overload', 'seed', 'levels', 'charges'];

/** Each reward's own icon, and the name it goes by on hover. */
export const DIVERSION_REWARD_META: Record<DiversionRewardKind, { icon: string; label: string }> = {
  life: { icon: ASSETS.misc.orb_hitpoints, label: 'Lives' },
  kebab: { icon: itemIcon('kebab'), label: 'Kebab' },
  lamp: { icon: itemIcon('genie_lamp'), label: 'Lamp' },
  gold: { icon: ASSETS.misc.coins_icon, label: 'Gold' },
  essence: { icon: ASSETS.misc.rune_essence_icon, label: 'Essence' },
  overload: { icon: itemIcon('overload_4'), label: 'Overload' },
  // Every herb seed is the same speck in OSRS, so one stands for all of them in a
  // total. A single seed names itself through rewardLook.
  seed: { icon: SEED_BY_ID.guam.seedIcon, label: 'Herb seeds' },
  // The amount is per tower: a drill lifts every tower on the board by it.
  levels: { icon: ASSETS.misc.stats_icon, label: 'Levels for every tower' },
  charges: { icon: ASSETS.misc.hunter_icon, label: 'Trap charges' },
};

/** A reward's icon and hover name. A seed is the one kind with several members, so
 *  it answers with the seed it is rather than the kind's own. */
export function rewardLook(reward: { kind: DiversionRewardKind; id?: string }): { icon: string; label: string } {
  const seed = reward.kind === 'seed' && reward.id ? SEED_BY_ID[reward.id as SeedId] : undefined;
  return seed ? { icon: seed.seedIcon, label: seed.seedName } : DIVERSION_REWARD_META[reward.kind];
}

/** The genie's lamp, as the inventory carries it. OSRS calls it just "Lamp". */
export const GENIE_LAMP = { id: 'genie_lamp', name: 'Lamp', icon: itemIcon('genie_lamp') } as const;

/** The skills a lamp can be rubbed for: the three this game levels during a run. */
export type LampSkill = 'hunter' | 'herblore' | 'fishing';

export const LAMP_SKILLS: readonly LampSkill[] = ['hunter', 'herblore', 'fishing'];

export const LAMP_SKILL_META: Record<LampSkill, { name: string; icon: string }> = {
  hunter: { name: 'Hunter', icon: ASSETS.misc.hunter_icon },
  herblore: { name: 'Herblore', icon: ASSETS.misc.skill_herblore },
  fishing: { name: 'Fishing', icon: ASSETS.misc.skill_fishing },
};

/** How many levels one rub is worth. Levels rather than XP, so a lamp means the same
 *  on wave 3 as on wave 60 whichever skill it goes into. */
export const LAMP_LEVELS = 3;

/** How many levels Sergeant Damien's drill lifts each tower. Levels, for the lamp's
 *  reason, and fewer than a lamp because every tower on the board gets them. */
export const DRILL_LEVELS = 2;

/**
 * Something one does on the board by itself, the moment it reaches its tile, with
 * no click asked for. `mend_trap` re-sets the most worn hunter trap; `drop_balloons`
 * leaves a handful of balloons around the tile to pop.
 */
export type DiversionJob = 'mend_trap' | 'drop_balloons';

export interface DiversionDef {
  id: DiversionId;
  mood: DiversionMood;
  /** Shown on the board and in the corner infobox. */
  name: string;
  /** Local bake — every asset in this game comes out of the OSRS cache. This one
   *  is the front view: what the infobox shows, and what it looks like standing
   *  on its tile facing the player. */
  sprite: string;
  /** The same model from behind and in profile, so it can face the way it walks.
   *  Absent on anything that never walks anywhere. */
  turned?: { back: string; side: string };
  payload: DiversionPayload;
  /** How it turns up, and how it goes away. Everyone walks on from the nearest edge
   *  and walks back off it — the default — except the things that were never
   *  walking anywhere: a nest falls out of a tree, a plant grows where it stands. */
  arrival?: 'walk' | 'appear';
  /** One short plain sentence: what this is worth. No numbers: what a click pays
   *  is worked out live and shown beside it as icon chips. */
  tip: string;
  /** What it says. Walkbys pick one at spawn; the rest say theirs on payout. */
  lines: string[];
  /** Says something about the game instead of a line from {@link lines}: `wave` is
   *  a read on the coming wave, `run` a fact about the run so far. The lines stay
   *  as the fallback for when there is nothing to report. */
  briefing?: 'wave' | 'run';
  /** What it gets on with once it arrives. See {@link DiversionJob}. */
  job?: DiversionJob;
}

/**
 * The cast. Walkbys first, because they are the mood the player meets most.
 *
 * Every line is deliberately small talk, with two exceptions that do in this game
 * what they do in OSRS. The Lumbridge Guide tells you what you are about to walk
 * into, and Hans, who in Lumbridge tells you how long you have played, tells you
 * something about the run.
 */
export const DIVERSIONS: DiversionDef[] = [
  {
    id: 'hans',
    mood: 'walkby',
    name: 'Hans',
    sprite: npcModel('hans'),
    turned: turned('hans'),
    payload: 'none',
    briefing: 'run',
    tip: 'Keeps count of your run.',
    lines: [
      "I've been here for 20 years and I'm still not sure what this tower does.",
      'Mind the road. Things come down it.',
      'You get used to the noise, eventually.',
      'Twenty years of this. Never once been paid.',
    ],
  },
  {
    // Only turns up when a trap on the road has fired some of its charges and there
    // is free ground beside it: the spawner picks the tile, not the dice.
    id: 'hunting_expert',
    mood: 'walkby',
    name: 'Hunting expert',
    sprite: npcModel('hunting_expert'),
    turned: turned('hunting_expert'),
    payload: 'none',
    job: 'mend_trap',
    tip: 'Re-sets your most worn trap.',
    lines: [
      'Whoever set this snare pulled the noose too tight.',
      'A trap is only as good as its last re-set.',
      "Tracks everywhere. You've got a busy road.",
      'Leave it with me. Two minutes.',
    ],
  },
  {
    id: 'lumbridge_guide',
    mood: 'walkby',
    name: 'Lumbridge Guide',
    sprite: npcModel('lumbridge_guide'),
    turned: turned('lumbridge_guide'),
    payload: 'none',
    briefing: 'wave',
    tip: 'He has a read on the next wave.',
    lines: [
      'Keep your towers spread. Crowds punish a corner.',
      'A tower with nothing in range is gold sat idle.',
      'If it survives the road, it costs you a life. Simple as that.',
      'Upgrades beat numbers, most days.',
    ],
  },
  {
    id: 'party_pete',
    mood: 'walkby',
    name: 'Party Pete',
    sprite: npcModel('party_pete'),
    turned: turned('party_pete'),
    payload: 'none',
    job: 'drop_balloons',
    tip: 'Leaves balloons to pop.',
    lines: [
      'Party! Party! Party!',
      'Someone put a tune on!',
      'Balloons! Pop them, go on!',
      "Best siege I've ever been to, this.",
    ],
  },
  {
    id: 'drunken_dwarf',
    mood: 'event',
    name: 'Drunken Dwarf',
    sprite: npcModel('drunken_dwarf'),
    turned: turned('drunken_dwarf'),
    payload: 'kebab',
    tip: 'Click for a kebab to eat later.',
    lines: [
      'The dwarf presses a kebab into your hands and wanders off.',
      "'Ere, you look like you need this more than I do.",
    ],
  },
  {
    id: 'genie',
    mood: 'event',
    name: 'Genie',
    sprite: npcModel('genie'),
    turned: turned('genie'),
    payload: 'lamp',
    tip: 'Click for a lamp to rub for skill levels.',
    lines: [
      'The genie hands you a lamp and vanishes.',
      'Your wish is granted. Do try to spend it well.',
    ],
  },
  {
    id: 'strange_plant',
    mood: 'event',
    name: 'Strange Plant',
    sprite: npcModel('strange_plant'),
    payload: 'plant',
    arrival: 'appear',
    // The live tip and line name what it grew (plantGiftText); these are what the
    // Collection Log reads, and the fallback.
    tip: 'Click to pick what it grew.',
    lines: [
      'You pick what the plant grew.',
    ],
  },
  {
    // Only turns up when some tower on the board still has a level to gain.
    id: 'sergeant_damien',
    mood: 'event',
    name: 'Sergeant Damien',
    sprite: npcModel('sergeant_damien'),
    turned: turned('sergeant_damien'),
    payload: 'drill',
    tip: 'Click for a drill that levels up your towers.',
    lines: [
      'Sergeant Damien runs your towers through drills until they hit harder.',
      'Call that a defence, maggot? Again! And again! Better.',
    ],
  },
  {
    id: 'bird_nest',
    mood: 'nest',
    name: 'Bird nest',
    sprite: itemIcon('bird_nest'),
    payload: 'surprise',
    arrival: 'appear',
    tip: "Click to see what's inside.",
    lines: ['Something falls out of the tree with a soft pop.'],
  },
];

export const DIVERSION_BY_ID: Record<DiversionId, DiversionDef> =
  Object.fromEntries(DIVERSIONS.map(d => [d.id, d])) as Record<DiversionId, DiversionDef>;

/**
 * Per-wave spawn chance, rolled **independently per mood** — a quiet run of waves and
 * a wave where two things turn up at once are both meant to happen. Events are the
 * rare one (the ledger's ≈5%) because they are the mood that pays.
 */
export const DIVERSION_CHANCE: Record<DiversionMood, number> = {
  walkby: 0.30,
  event: 0.07,
  nest: 0.15,
};

/** Bad-luck protection for events: each wave that ends without one adds this much to
 *  the next wave's event chance, and an event turning up starts the count again. */
export const EVENT_CHANCE_STEP = 0.01;

/** The most an event's chance can climb to, however long the dry spell. */
export const EVENT_CHANCE_CAP = 0.2;

/** How many may stand on the board at once, across every mood. Two, so the board
 *  never turns into a fairground while the player is trying to read their defences. */
export const MAX_DIVERSIONS = 2;
