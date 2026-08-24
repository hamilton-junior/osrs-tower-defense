import { itemIcon, npcModel } from '../assets';

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
  | 'hans' | 'bob' | 'lumbridge_guide' | 'party_pete'
  | 'drunken_dwarf' | 'genie' | 'strange_plant' | 'rick_turpentine'
  | 'bird_nest';

/**
 * What clicking one pays out. `none` is the walkbys — they are scenery with dialogue.
 * `surprise` is the bird nest, which rolls one of the other three when it is opened.
 */
export type DiversionPayload = 'none' | 'life' | 'gold' | 'essence' | 'potion' | 'surprise';

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
  /** One short plain sentence: what this is worth. Icon-led, no numbers. */
  tip: string;
  /** What it says. Walkbys pick one at spawn; the rest say theirs on payout. */
  lines: string[];
}

/**
 * The cast. Walkbys first, because they are the mood the player meets most.
 *
 * Every line is deliberately small talk. The one exception is the Lumbridge Guide,
 * whose whole job in OSRS is telling you what you are about to walk into — the
 * spawner swaps his line for a read on the coming wave when it has one.
 */
export const DIVERSIONS: DiversionDef[] = [
  {
    id: 'hans',
    mood: 'walkby',
    name: 'Hans',
    sprite: npcModel('hans'),
    turned: turned('hans'),
    payload: 'none',
    tip: '💬 Just passing through.',
    lines: [
      "I've been here for 20 years and I'm still not sure what this tower does.",
      'Mind the road. Things come down it.',
      'You get used to the noise, eventually.',
      'Twenty years of this. Never once been paid.',
    ],
  },
  {
    id: 'bob',
    mood: 'walkby',
    name: 'Bob',
    sprite: npcModel('bob'),
    turned: turned('bob'),
    payload: 'none',
    tip: '💬 Just passing through.',
    lines: [
      'Axes! Finest axes! ...no? Suit yourself.',
      'I could sharpen that for you. For a price.',
      "Bronze, iron, steel — I've got the lot.",
      'Nobody ever buys the bronze one.',
    ],
  },
  {
    id: 'lumbridge_guide',
    mood: 'walkby',
    name: 'Lumbridge Guide',
    sprite: npcModel('lumbridge_guide'),
    turned: turned('lumbridge_guide'),
    payload: 'none',
    tip: '💬 He has a read on the next wave.',
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
    tip: '💬 Just passing through.',
    lines: [
      'Party! Party! Party!',
      'Someone put a tune on!',
      'You there — dance with me!',
      "Best siege I've ever been to, this.",
    ],
  },
  {
    id: 'drunken_dwarf',
    mood: 'event',
    name: 'Drunken Dwarf',
    sprite: npcModel('drunken_dwarf'),
    turned: turned('drunken_dwarf'),
    payload: 'life',
    tip: '🍢 Click for a kebab.',
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
    payload: 'essence',
    tip: '🪔 Click for a lamp.',
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
    payload: 'potion',
    arrival: 'appear',
    tip: '🌱 Click for a free potion.',
    lines: [
      'The plant bears one fruit, and it is definitely a potion.',
      'You pick the fruit. It tastes like the Grand Exchange.',
    ],
  },
  {
    id: 'rick_turpentine',
    mood: 'event',
    name: 'Rick Turpentine',
    sprite: npcModel('rick_turpentine'),
    turned: turned('rick_turpentine'),
    payload: 'gold',
    tip: '👊 Click to send him packing.',
    lines: [
      'Your towers see him off. He drops his purse on the way out.',
      'Rick picks a fight with a wall of siege weaponry. It goes badly for Rick.',
    ],
  },
  {
    id: 'bird_nest',
    mood: 'nest',
    name: 'Bird nest',
    sprite: itemIcon('bird_nest'),
    payload: 'surprise',
    arrival: 'appear',
    tip: "🪺 Click to see what's inside.",
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

/** How many may stand on the board at once, across every mood. Two, so the board
 *  never turns into a fairground while the player is trying to read their defences. */
export const MAX_DIVERSIONS = 2;
