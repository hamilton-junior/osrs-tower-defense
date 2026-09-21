/**
 * The Achievement Diary table. Content only — the types and the evaluation live
 * in `systems/diaries.ts`.
 *
 * The type import below is **type-only** on purpose, exactly as the Combat
 * Achievement table does it: `systems/diaries` imports this file's value
 * (`DIARIES`), so a value import back would close a runtime cycle. `readRegion`
 * comes from `systems/combat-achievements`, which this file does not close a
 * cycle with.
 *
 * Six diaries, one per real OSRS diary that our regions cover. The TzHaar
 * Caverns are not a diary of their own — in OSRS the Mor Ul Rek tasks are the
 * Karamja Elite tier — so they ride with Karamja and its Elite tier is set down
 * in the caverns.
 *
 * Ids are permanent: they are the persisted key. Never rename one in place;
 * retire a task by deleting it (unknown stored ids are ignored on read).
 *
 * Every task is satisfiable by combat alone. Fishing spots and allotments are
 * dealt by the *map*, not by the region, so a task that asked for them would be
 * impossible on a run whose board came up dry — the per-region skilling tallies
 * are recorded for later, but nothing here depends on them.
 */
import { readRegion, type RegionStats } from '../systems/combat-achievements';
import type { Diary } from '../systems/diaries';
import type { EnemyType } from '../types';

/** Kills of any of `types` in this tally. */
const slain = (r: RegionStats, ...types: EnemyType[]) =>
  types.reduce((n, t) => n + (r.killsByType[t] ?? 0), 0);

export const DIARIES: readonly Diary[] = [
  {
    id: 'lumbridge',
    name: 'Lumbridge & Draynor',
    biomes: ['lumbridge'],
    tasks: [
      // --- Easy: the first few waves of a run that started at home ---
      {
        id: 'lumbridge-cow-herder', tier: 'easy', name: 'Cow Herder',
        desc: 'Kill 10 Cows in Misthalin Plains.',
        check: (_s, r) => slain(r, 'cow') >= 10,
      },
      {
        id: 'lumbridge-bug-hunt', tier: 'easy', name: 'Bug Hunt',
        desc: 'Kill 15 Cave bugs in Misthalin Plains.',
        check: (_s, r) => slain(r, 'cave_bug') >= 15,
      },
      {
        id: 'lumbridge-home-ground', tier: 'easy', name: 'Home Ground',
        desc: 'Clear 3 waves in Misthalin Plains.',
        check: (_s, r) => r.wavesCleared >= 3,
      },
      {
        id: 'lumbridge-unscathed', tier: 'easy', name: 'Unscathed',
        desc: 'Clear 2 waves in Misthalin Plains without losing a life.',
        check: (_s, r) => r.cleanWaves >= 2,
      },

      // --- Medium ---
      {
        id: 'lumbridge-hobgoblin-patrol', tier: 'medium', name: 'Hobgoblin Patrol',
        desc: 'Kill 30 Hobgoblins in Misthalin Plains.',
        check: (_s, r) => slain(r, 'hobgoblin') >= 30,
      },
      {
        id: 'lumbridge-swamp-waders', tier: 'medium', name: 'Swamp Waders',
        desc: 'Kill 25 frogs of any size in Misthalin Plains.',
        check: (_s, r) => slain(r, 'big_frog', 'giant_frog') >= 25,
      },
      {
        id: 'lumbridge-moss-clearance', tier: 'medium', name: 'Moss Clearance',
        desc: 'Kill 20 Moss giants in Misthalin Plains.',
        check: (_s, r) => slain(r, 'moss_giant') >= 20,
      },
      {
        id: 'lumbridge-steady-hand', tier: 'medium', name: 'Steady Hand',
        desc: 'Clear 6 waves in Misthalin Plains, losing at most 1 life.',
        check: (_s, r) => r.wavesCleared >= 6 && r.livesLost <= 1,
      },

      // --- Hard ---
      {
        id: 'lumbridge-cull', tier: 'hard', name: 'Misthalin Cull',
        desc: 'Get 400 kills in Misthalin Plains.',
        check: (_s, r) => r.kills >= 400,
      },
      {
        id: 'lumbridge-belfry', tier: 'hard', name: 'Belfry Cleared',
        desc: 'Kill 60 Giant bats in Misthalin Plains.',
        check: (_s, r) => slain(r, 'giant_bat') >= 60,
      },
      {
        id: 'lumbridge-held-the-plains', tier: 'hard', name: 'Held the Plains',
        desc: 'Clear 10 waves in Misthalin Plains without losing a life.',
        check: (_s, r) => r.cleanWaves >= 10,
      },
      {
        id: 'lumbridge-guard', tier: 'hard', name: 'Lumbridge Guard',
        desc: 'Put down a boss in Misthalin Plains.',
        check: (_s, r) => r.bosses.length >= 1,
      },

      // --- Elite ---
      {
        id: 'lumbridge-champion', tier: 'elite', name: 'Champion of Misthalin',
        desc: 'Get 1000 kills in Misthalin Plains.',
        check: (_s, r) => r.kills >= 1000,
      },
      {
        id: 'lumbridge-three-bosses', tier: 'elite', name: 'Thrice Defended',
        desc: 'Put down 3 different bosses in Misthalin Plains.',
        check: (_s, r) => r.bosses.length >= 3,
      },
      {
        id: 'lumbridge-giant-slayer', tier: 'elite', name: 'Giant Slayer',
        desc: 'Kill 100 Moss giants in Misthalin Plains.',
        check: (_s, r) => slain(r, 'moss_giant') >= 100,
      },
      {
        id: 'lumbridge-spotless', tier: 'elite', name: 'Spotless',
        desc: 'Clear 20 waves in Misthalin Plains without losing a life.',
        check: (_s, r) => r.cleanWaves >= 20,
      },
    ],
  },

  {
    id: 'desert',
    name: 'Desert',
    biomes: ['alkharid'],
    tasks: [
      // --- Easy ---
      {
        id: 'desert-carrion-watch', tier: 'easy', name: 'Carrion Watch',
        desc: 'Kill 12 Vultures in the Kharidian Desert.',
        check: (_s, r) => slain(r, 'vulture') >= 12,
      },
      {
        id: 'desert-sand-stingers', tier: 'easy', name: 'Sand Stingers',
        desc: 'Kill 15 Scorpions in the Kharidian Desert.',
        check: (_s, r) => slain(r, 'scorpion') >= 15,
      },
      {
        id: 'desert-crossing', tier: 'easy', name: 'Desert Crossing',
        desc: 'Clear 3 waves in the Kharidian Desert.',
        check: (_s, r) => r.wavesCleared >= 3,
      },
      {
        id: 'desert-lizard-skin', tier: 'easy', name: 'Lizard Skin',
        desc: 'Kill 10 Desert lizards in the Kharidian Desert.',
        check: (_s, r) => slain(r, 'desert_lizard') >= 10,
      },

      // --- Medium ---
      {
        id: 'desert-hive-worker', tier: 'medium', name: 'Hive Worker',
        desc: 'Kill 30 Kalphite Workers in the Kharidian Desert.',
        check: (_s, r) => slain(r, 'kalphite_worker') >= 30,
      },
      {
        id: 'desert-tomb-robber', tier: 'medium', name: 'Tomb Robber',
        desc: 'Kill 25 Mummies in the Kharidian Desert.',
        check: (_s, r) => slain(r, 'mummy') >= 25,
      },
      {
        id: 'desert-locust-swarm', tier: 'medium', name: 'Locust Swarm',
        desc: 'Kill 20 Locust riders in the Kharidian Desert.',
        check: (_s, r) => slain(r, 'locust_rider') >= 20,
      },
      {
        id: 'desert-sun-beaten', tier: 'medium', name: 'Sun Beaten',
        desc: 'Clear 6 waves in the Kharidian Desert.',
        check: (_s, r) => r.wavesCleared >= 6,
      },

      // --- Hard ---
      {
        id: 'desert-dust-to-dust', tier: 'hard', name: 'Dust to Dust',
        desc: 'Kill 50 Dust devils in the Kharidian Desert.',
        check: (_s, r) => slain(r, 'dust_devil') >= 50,
      },
      {
        id: 'desert-hive-guard', tier: 'hard', name: 'Hive Guard',
        desc: 'Kill 15 Kalphite Guardians in the Kharidian Desert.',
        check: (_s, r) => slain(r, 'kalphite_guardian') >= 15,
      },
      {
        id: 'desert-cull', tier: 'hard', name: 'Desert Cull',
        desc: 'Get 400 kills in the Kharidian Desert.',
        check: (_s, r) => r.kills >= 400,
      },
      {
        id: 'desert-sandstorm-veteran', tier: 'hard', name: 'Sandstorm Veteran',
        desc: 'Clear 10 waves in the Kharidian Desert without losing a life.',
        check: (_s, r) => r.cleanWaves >= 10,
      },

      // --- Elite ---
      {
        id: 'desert-ruler-of-sands', tier: 'elite', name: 'Ruler of the Sands',
        desc: 'Get 1000 kills in the Kharidian Desert.',
        check: (_s, r) => r.kills >= 1000,
      },
      {
        id: 'desert-royal-guard', tier: 'elite', name: 'Royal Guard',
        desc: 'Kill 40 Kalphite Guardians in the Kharidian Desert.',
        check: (_s, r) => slain(r, 'kalphite_guardian') >= 40,
      },
      {
        id: 'desert-scarab-scholar', tier: 'elite', name: 'Scarab Scholar',
        desc: 'Kill 80 Scarab mages in the Kharidian Desert.',
        check: (_s, r) => slain(r, 'scarab_mage') >= 80,
      },
      {
        id: 'desert-three-bosses', tier: 'elite', name: 'Buried Three Deep',
        desc: 'Put down 3 different bosses in the Kharidian Desert.',
        check: (_s, r) => r.bosses.length >= 3,
      },
    ],
  },

  {
    id: 'morytania',
    name: 'Morytania',
    biomes: ['morytania'],
    tasks: [
      // --- Easy ---
      {
        id: 'morytania-ghost-town', tier: 'easy', name: 'Ghost Town',
        desc: 'Kill 12 Ghosts in Morytania Swamp.',
        check: (_s, r) => slain(r, 'ghost') >= 12,
      },
      {
        id: 'morytania-bone-dry', tier: 'easy', name: 'Bone Dry',
        desc: 'Kill 15 Skeletal Mages in Morytania Swamp.',
        check: (_s, r) => slain(r, 'skeletal_mage') >= 15,
      },
      {
        id: 'morytania-into-the-swamp', tier: 'easy', name: 'Into the Swamp',
        desc: 'Clear 3 waves in Morytania Swamp.',
        check: (_s, r) => r.wavesCleared >= 3,
      },
      {
        id: 'morytania-blessed', tier: 'easy', name: 'Blessed Ground',
        desc: 'Clear 2 waves in Morytania Swamp without losing a life.',
        check: (_s, r) => r.cleanWaves >= 2,
      },

      // --- Medium ---
      {
        id: 'morytania-stone-skin', tier: 'medium', name: 'Stone Skin',
        desc: 'Kill 25 Gargoyles in Morytania Swamp.',
        check: (_s, r) => slain(r, 'gargoyle') >= 25,
      },
      {
        id: 'morytania-wight-watch', tier: 'medium', name: 'Wight Watch',
        desc: 'Kill 20 Barrow Wights in Morytania Swamp.',
        check: (_s, r) => slain(r, 'barrow_wight') >= 20,
      },
      {
        id: 'morytania-death-spawn', tier: 'medium', name: 'Death Spawn',
        desc: 'Kill 15 Nechryael in Morytania Swamp.',
        check: (_s, r) => slain(r, 'nechryael') >= 15,
      },
      {
        id: 'morytania-swamp-patrol', tier: 'medium', name: 'Swamp Patrol',
        desc: 'Clear 6 waves in Morytania Swamp.',
        check: (_s, r) => r.wavesCleared >= 6,
      },

      // --- Hard ---
      {
        id: 'morytania-rockfall', tier: 'hard', name: 'Rockfall',
        desc: 'Kill 60 Gargoyles in Morytania Swamp.',
        check: (_s, r) => slain(r, 'gargoyle') >= 60,
      },
      {
        id: 'morytania-barrows-run', tier: 'hard', name: 'Barrows Run',
        desc: 'Kill 50 Barrow Wights in Morytania Swamp.',
        check: (_s, r) => slain(r, 'barrow_wight') >= 50,
      },
      {
        id: 'morytania-cull', tier: 'hard', name: 'Morytania Cull',
        desc: 'Get 400 kills in Morytania Swamp.',
        check: (_s, r) => r.kills >= 400,
      },
      {
        id: 'morytania-held-the-marsh', tier: 'hard', name: 'Held the Marsh',
        desc: 'Clear 10 waves in Morytania Swamp without losing a life.',
        check: (_s, r) => r.cleanWaves >= 10,
      },

      // --- Elite ---
      {
        id: 'morytania-lord-of-the-swamp', tier: 'elite', name: 'Lord of the Swamp',
        desc: 'Get 1000 kills in Morytania Swamp.',
        check: (_s, r) => r.kills >= 1000,
      },
      {
        id: 'morytania-superior-hunt', tier: 'elite', name: 'Superior Hunt',
        desc: 'Kill a Marble Gargoyle and a Nechryarch in Morytania Swamp.',
        check: (_s, r) => slain(r, 'superior_gargoyle') >= 1 && slain(r, 'superior_nechryael') >= 1,
      },
      {
        id: 'morytania-grave-digger', tier: 'elite', name: 'Grave Digger',
        desc: 'Kill 120 Nechryael in Morytania Swamp.',
        check: (_s, r) => slain(r, 'nechryael') >= 120,
      },
      {
        id: 'morytania-three-bosses', tier: 'elite', name: 'Three Long Nights',
        desc: 'Put down 3 different bosses in Morytania Swamp.',
        check: (_s, r) => r.bosses.length >= 3,
      },
    ],
  },

  {
    id: 'wilderness',
    name: 'Wilderness',
    biomes: ['wilderness'],
    tasks: [
      // --- Easy ---
      {
        id: 'wilderness-level-one', tier: 'easy', name: 'Level One',
        desc: 'Clear 3 waves in The Wilderness.',
        check: (_s, r) => r.wavesCleared >= 3,
      },
      {
        id: 'wilderness-druid-circle', tier: 'easy', name: 'Druid Circle',
        desc: 'Kill 12 Chaos Druids in The Wilderness.',
        check: (_s, r) => slain(r, 'chaos_druid') >= 12,
      },
      {
        id: 'wilderness-hound-pack', tier: 'easy', name: 'Hound Pack',
        desc: 'Kill 15 Hellhounds in The Wilderness.',
        check: (_s, r) => slain(r, 'hellhound') >= 15,
      },
      {
        id: 'wilderness-no-risk', tier: 'easy', name: 'Nothing Risked',
        desc: 'Clear 2 waves in The Wilderness without losing a life.',
        check: (_s, r) => r.cleanWaves >= 2,
      },

      // --- Medium ---
      {
        id: 'wilderness-green-scales', tier: 'medium', name: 'Green Scales',
        desc: 'Kill 20 Green Dragons in The Wilderness.',
        check: (_s, r) => slain(r, 'green_dragon') >= 20,
      },
      {
        id: 'wilderness-ankou-hunt', tier: 'medium', name: 'Ankou Hunt',
        desc: 'Kill 25 Ankou in The Wilderness.',
        check: (_s, r) => slain(r, 'ankou') >= 25,
      },
      {
        id: 'wilderness-treefeller', tier: 'medium', name: 'Treefeller',
        desc: 'Kill 15 Ents in The Wilderness.',
        check: (_s, r) => slain(r, 'ent') >= 15,
      },
      {
        id: 'wilderness-deep', tier: 'medium', name: 'Deep Wilderness',
        desc: 'Clear 6 waves in The Wilderness.',
        check: (_s, r) => r.wavesCleared >= 6,
      },

      // --- Hard ---
      {
        id: 'wilderness-dragon-hoard', tier: 'hard', name: 'Dragon Hoard',
        desc: 'Kill 60 Green Dragons in The Wilderness.',
        check: (_s, r) => slain(r, 'green_dragon') >= 60,
      },
      {
        id: 'wilderness-skull-collector', tier: 'hard', name: 'Skull Collector',
        desc: 'Kill 80 Ankou in The Wilderness.',
        check: (_s, r) => slain(r, 'ankou') >= 80,
      },
      {
        id: 'wilderness-cull', tier: 'hard', name: 'Wilderness Cull',
        desc: 'Get 400 kills in The Wilderness.',
        check: (_s, r) => r.kills >= 400,
      },
      {
        id: 'wilderness-unpked', tier: 'hard', name: 'Never Skulled',
        desc: 'Clear 10 waves in The Wilderness without losing a life.',
        check: (_s, r) => r.cleanWaves >= 10,
      },

      // --- Elite ---
      {
        id: 'wilderness-king', tier: 'elite', name: 'King of the Wilderness',
        desc: 'Get 1000 kills in The Wilderness.',
        check: (_s, r) => r.kills >= 1000,
      },
      {
        id: 'wilderness-forest-fire', tier: 'elite', name: 'Forest Fire',
        desc: 'Kill 60 Ents in The Wilderness.',
        check: (_s, r) => slain(r, 'ent') >= 60,
      },
      {
        id: 'wilderness-three-bosses', tier: 'elite', name: 'Deep Cut',
        desc: 'Put down 3 different bosses in The Wilderness.',
        check: (_s, r) => r.bosses.length >= 3,
      },
      {
        id: 'wilderness-nothing-to-lose', tier: 'elite', name: 'Nothing to Lose',
        desc: 'Clear 20 waves in The Wilderness without losing a life.',
        check: (_s, r) => r.cleanWaves >= 20,
      },
    ],
  },

  {
    id: 'fremennik',
    name: 'Fremennik',
    biomes: ['trollweiss'],
    tasks: [
      // --- Easy ---
      {
        id: 'fremennik-wolf-whistle', tier: 'easy', name: 'Wolf Whistle',
        desc: 'Kill 12 Wolves in Trollweiss Snow.',
        check: (_s, r) => slain(r, 'wolf') >= 12,
      },
      {
        id: 'fremennik-ice-breaker', tier: 'easy', name: 'Ice Breaker',
        desc: 'Kill 15 Ice Warriors in Trollweiss Snow.',
        check: (_s, r) => slain(r, 'ice_warrior') >= 15,
      },
      {
        id: 'fremennik-frozen-ground', tier: 'easy', name: 'Frozen Ground',
        desc: 'Clear 3 waves in Trollweiss Snow.',
        check: (_s, r) => r.wavesCleared >= 3,
      },
      {
        id: 'fremennik-snowblind', tier: 'easy', name: 'Snowblind',
        desc: 'Clear 2 waves in Trollweiss Snow without losing a life.',
        check: (_s, r) => r.cleanWaves >= 2,
      },

      // --- Medium ---
      {
        id: 'fremennik-rock-throwers', tier: 'medium', name: 'Rock Throwers',
        desc: 'Kill 25 Thrower trolls in Trollweiss Snow.',
        check: (_s, r) => slain(r, 'thrower_troll') >= 25,
      },
      {
        id: 'fremennik-ice-troll-cull', tier: 'medium', name: 'Ice Troll Cull',
        desc: 'Kill 20 Ice Trolls in Trollweiss Snow.',
        check: (_s, r) => slain(r, 'ice_troll') >= 20,
      },
      {
        id: 'fremennik-pack-leader', tier: 'medium', name: 'Pack Leader',
        desc: 'Kill 40 Wolves in Trollweiss Snow.',
        check: (_s, r) => slain(r, 'wolf') >= 40,
      },
      {
        id: 'fremennik-mountain-pass', tier: 'medium', name: 'Mountain Pass',
        desc: 'Clear 6 waves in Trollweiss Snow.',
        check: (_s, r) => r.wavesCleared >= 6,
      },

      // --- Hard ---
      {
        id: 'fremennik-general-discharge', tier: 'hard', name: 'General Discharge',
        desc: 'Kill 15 Troll generals in Trollweiss Snow.',
        check: (_s, r) => slain(r, 'troll_general') >= 15,
      },
      {
        id: 'fremennik-deep-freeze', tier: 'hard', name: 'Deep Freeze',
        desc: 'Kill 60 Ice Trolls in Trollweiss Snow.',
        check: (_s, r) => slain(r, 'ice_troll') >= 60,
      },
      {
        id: 'fremennik-cull', tier: 'hard', name: 'Trollweiss Cull',
        desc: 'Get 400 kills in Trollweiss Snow.',
        check: (_s, r) => r.kills >= 400,
      },
      {
        id: 'fremennik-held-the-pass', tier: 'hard', name: 'Held the Pass',
        desc: 'Clear 10 waves in Trollweiss Snow without losing a life.',
        check: (_s, r) => r.cleanWaves >= 10,
      },

      // --- Elite ---
      {
        id: 'fremennik-champion', tier: 'elite', name: 'Fremennik Champion',
        desc: 'Get 1000 kills in Trollweiss Snow.',
        check: (_s, r) => r.kills >= 1000,
      },
      {
        id: 'fremennik-stronghold', tier: 'elite', name: 'Troll Stronghold',
        desc: 'Kill 40 Troll generals in Trollweiss Snow.',
        check: (_s, r) => slain(r, 'troll_general') >= 40,
      },
      {
        id: 'fremennik-three-bosses', tier: 'elite', name: 'Avalanche',
        desc: 'Put down 3 different bosses in Trollweiss Snow.',
        check: (_s, r) => r.bosses.length >= 3,
      },
      {
        id: 'fremennik-not-a-flake', tier: 'elite', name: 'Not a Flake',
        desc: 'Clear 20 waves in Trollweiss Snow without losing a life.',
        check: (_s, r) => r.cleanWaves >= 20,
      },
    ],
  },

  {
    id: 'karamja',
    name: 'Karamja',
    // The jungle above and Mor Ul Rek below it. One diary, as OSRS has it: the
    // TzHaar tasks are Karamja's Elite tier, not a diary of their own.
    biomes: ['karamja', 'tzhaar'],
    tasks: [
      // --- Easy ---
      {
        id: 'karamja-mosquito-net', tier: 'easy', name: 'Mosquito Net',
        desc: 'Kill 12 Giant mosquitoes in Karamja Jungle.',
        check: (_s, r) => slain(r, 'giant_mosquito') >= 12,
      },
      {
        id: 'karamja-swarm-repellent', tier: 'easy', name: 'Swarm Repellent',
        desc: 'Kill 15 Harpie Bug Swarms in Karamja Jungle.',
        check: (_s, r) => slain(r, 'harpie_bug_swarm') >= 15,
      },
      {
        id: 'karamja-jungle-trek', tier: 'easy', name: 'Jungle Trek',
        desc: 'Clear 3 waves on Karamja.',
        check: (_s, r) => r.wavesCleared >= 3,
      },
      {
        id: 'karamja-into-the-caverns', tier: 'easy', name: 'Into the Caverns',
        desc: 'Clear a wave in the TzHaar Caverns.',
        check: (s) => readRegion(s, 'tzhaar').wavesCleared >= 1,
      },

      // --- Medium ---
      {
        id: 'karamja-jogre-jungle', tier: 'medium', name: 'Jogre Jungle',
        desc: 'Kill 25 Jogres in Karamja Jungle.',
        check: (_s, r) => slain(r, 'jogre') >= 25,
      },
      {
        id: 'karamja-face-the-horrors', tier: 'medium', name: 'Face the Horrors',
        desc: 'Kill 20 Cave horrors in Karamja Jungle.',
        check: (_s, r) => slain(r, 'cave_horror') >= 20,
      },
      {
        id: 'karamja-kih-exterminator', tier: 'medium', name: 'Kih Exterminator',
        desc: 'Kill 20 Tz-Kih in the TzHaar Caverns.',
        check: (_s, r) => slain(r, 'tz_kih') >= 20,
      },
      {
        id: 'karamja-patrol', tier: 'medium', name: 'Karamja Patrol',
        desc: 'Clear 6 waves on Karamja.',
        check: (_s, r) => r.wavesCleared >= 6,
      },

      // --- Hard ---
      {
        id: 'karamja-bronze-hoard', tier: 'hard', name: 'Bronze Hoard',
        desc: 'Kill 30 Bronze dragons in Karamja Jungle.',
        check: (_s, r) => slain(r, 'bronze_dragon') >= 30,
      },
      {
        id: 'karamja-xil-slayer', tier: 'hard', name: 'Xil Slayer',
        desc: 'Kill 40 Tok-Xil in the TzHaar Caverns.',
        check: (_s, r) => slain(r, 'tok_xil') >= 40,
      },
      {
        id: 'karamja-cull', tier: 'hard', name: 'Karamja Cull',
        desc: 'Get 400 kills on Karamja.',
        check: (_s, r) => r.kills >= 400,
      },
      {
        id: 'karamja-held-the-jungle', tier: 'hard', name: 'Held the Jungle',
        desc: 'Clear 10 waves on Karamja without losing a life.',
        check: (_s, r) => r.cleanWaves >= 10,
      },

      // --- Elite: down in Mor Ul Rek, exactly where OSRS puts this tier ---
      {
        id: 'karamja-fight-caves', tier: 'elite', name: 'Fight Caves Regular',
        desc: 'Kill 60 Yt-MejKot in the TzHaar Caverns.',
        check: (_s, r) => slain(r, 'yt_mejkot') >= 60,
      },
      {
        id: 'karamja-ket-zek-down', tier: 'elite', name: 'Ket-Zek Down',
        desc: 'Kill 25 Ket-Zek in the TzHaar Caverns.',
        check: (_s, r) => slain(r, 'ket_zek') >= 25,
      },
      {
        id: 'karamja-champion', tier: 'elite', name: 'Champion of Karamja',
        desc: 'Get 1000 kills on Karamja.',
        check: (_s, r) => r.kills >= 1000,
      },
      {
        id: 'karamja-inferno', tier: 'elite', name: 'Inferno',
        desc: 'Put down 3 different bosses in the TzHaar Caverns.',
        check: (s) => readRegion(s, 'tzhaar').bosses.length >= 3,
      },
    ],
  },
];
