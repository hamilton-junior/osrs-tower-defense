# Enemy roster — generic backbone, regional sets, and the Slayer contract

The boss ledger is [`boss-design.md`](boss-design.md); this is its counterpart for the
rank and file. Bosses are the *act*; the common roster is the *stage* — and the stage used
to never change: every common monster could roll on every map, so a Morytania nechryael
walked the Trollweiss snowfield and the biome was pure paint.

**The split itself is now built** (phase 3 below, taken first): `EnemyDef.region`,
[`systems/enemy-regions.ts`](../lib/game/systems/enemy-regions.ts), the wave generator and
the Slayer masters all respect it. What is left is content — the regional sets below, which
are what the split is *for*. Phase 1 filled the two regions that had nothing at all, so
every region now has a set of its own. Phase 4 — the per-region top-ups, researched
against the cache and tabulated below — is what is being built now, thinnest region first.

## The rule

**A monster is either _generic_ or _local_. Never both.**

- **Generic** — it can roll on any map. This is the backbone that fills waves at every
  tier, so no biome can ever run out of things to send.
- **Local** — it belongs to exactly one biome and is the only reason that biome looks
  different from the last one.

A biome is a *region of Gielinor*, so the test for local is the OSRS one: would a player
say "that thing lives there"? A kalphite lives in the desert. A goblin lives everywhere.

Two consequences worth stating up front, because both are load-bearing:

1. **The generic backbone must be deep enough on its own.** A wave at any wave number
   must be fillable from generics alone, or a thin biome starves the allocator.
2. **Every biome needs at least one monster per Slayer master tier** (see below), or a
   master has nothing to assign there.

## The generic backbone

Thirteen of the current monsters carry the ladder (fifteen counting the two Superiors that
ride Bloodveld and Abyssal Demon). They are the ones that, in OSRS, turn up in dungeons and
caves across the whole map rather than in one named place.

| Wave band | Generic monsters |
|---|---|
| 1–3 | Goblin · Giant rat · Giant spider · Skeleton · Imp |
| 4–7 | Hill Giant · Lesser Demon · Zombie |
| 8–12 | Black Demon · Bloodveld · Blue Dragon · Abyssal Demon |
| 15+ | Dark Beast |

Zombie stays generic on purpose even though Morytania wants it: undead turn up in every
dungeon in the game, and Morytania gets *distinctive* undead instead (ghoul, banshee,
vampyre) rather than the generic one.

**Bloodveld and Abyssal Demon stay generic for a mechanical reason.** They are two of the
four monsters with a Superior form (`SUPERIOR_OF` in `data/slayer.ts`), so keeping them
everywhere is what stops the **Bigger and Badder** Slayer reward from becoming dead
content on five maps out of seven. Gargoyle and Nechryael — the other two superiors — go
local to Morytania, which is honest (both are Slayer Tower monsters) and still leaves the
reward two carriers on every map.

Three current monsters have no clean home and are decided here rather than left dangling:
**Fire Giant** → TzHaar (lava), **Hellhound** → Wilderness (the wildy hellhounds are
real), **Blue Dragon** → generic (dungeon dragons are everywhere).

## The regional sets

Each set lists what is already there, then the verified candidates. **Every candidate below
was read out of the local OSRS cache** (`osrscachereader`): `id` is its NPC def id and `HP`
is the real OSRS hitpoints (`stats[3]`, validated against Bloodveld 120 and Green dragon
75), so a stat block can be written straight off these tables. 🔎 marks an id whose def
comes back with a blank name in the reader — each of those was confirmed by matching combat
level + hitpoints and then rendering the model and looking at the PNG.

### Held back — humans and harmless animals

Two categories are deliberately **not** on the build list:

- **Purely human monsters — backlog, pending a direction call.** Barbarian (3055), Bandit
  (1026), Chaos druid warrior (532), Chaos dwarf (291), Tribesman (530), and by the same
  reading Dark wizard (510), Menaphite Thug (3549) and Black Knight (516). They stay in the
  tables, marked *human*, so nothing has to be researched twice if the call goes the other
  way.
- **Harmless animals — out.** Penguin (2063), Monkey (1038). The roster is meant to read as
  *enemies*, not merely as things that are alive.

**Humanoids that are not purely human are fair game** — hobgoblin, troll, mummy, ankou,
vampyre, banshee, ghoul, locust rider, scarab mage — and are built like anything else.

### Misthalin Plains — the tutorial region

*Already here:* Cow.

| Candidate | id | HP | Why it belongs | Band |
|---|---|---|---|---|
| **Cave bug** | 481 | 5 | Lumbridge Swamp Caves; wave-1 trash, frailer than the cow | early |
| **Big frog** | 478 | 25 | the cheap swarm body of Lumbridge Swamp | early |
| **Cave slime** | 480 | 25 | same caves, poison flavour, slow and squishy | early |
| **Hobgoblin** | 3049 | 29 | the classic rung straight after the goblin | early-mid |
| **Giant bat** | 2834 | 32 | fast flyer, low HP — the region's speed threat | early-mid |
| **Moss giant** | 2090 | 60 | Varrock sewers; Misthalin's own giant, a rung under Hill Giant | mid |
| **Giant frog** | 477 | 100 | closes the region as its non-boss elite | mid-late |
| ~~Barbarian~~ | 3055 | 24 | *human — backlog* | — |
| ~~Dark wizard~~ | 510 | 24 | *human — backlog* (mag 22, would be the first caster) | — |

### Kharidian Desert

*Already here:* Scorpion.

| Candidate | id | HP | Why it belongs | Band |
|---|---|---|---|---|
| **Vulture** | 1267 | 10 | fast, frail, and exactly the desert's colour | early |
| **Jackal** | 4185 | 27 | a low-HP pack body | early |
| **Desert Lizard** | 460 | 25 | Slayer staple, and canonically undone by cold | early |
| **Kalphite Worker** | 955 | 40 | opens the kalphite line; reads instantly as "desert" | early-mid |
| **Scarab Mage** | 794 | 50 | mag 70 — a low-HP caster | mid |
| **Mummy** | 949 | 90 | Pyramid Plunder; slow, heavy undead | mid |
| **Kalphite Soldier** | 138 | 90 | rung two of the kalphite line | mid |
| 🔎 **Dust devil** | 423 | 105 | the desert's iconic Slayer monster | mid-late |
| **Locust rider** | 795 | 90 | size 2, a mounted silhouette nothing else has | late |
| **Kalphite Guardian** | 959 | 170 | size 3; the top of the line | late |
| ~~Bandit~~ | 1026 | 27 | *human — backlog* | — |
| ~~Menaphite Thug~~ | 3549 | 60 | *human — backlog* | — |

### Morytania Swamp — the richest set in the cache

*Already here:* Ghost · Barrow Wight · Skeletal Mage · Gargoyle · Nechryael (+ their
Superiors: Marble Gargoyle, Nechryarch).

| Candidate | id | HP | Why it belongs | Band |
|---|---|---|---|---|
| **Crawling Hand** | 448 | 16 | the Slayer Tower's ground floor and every player's first task | early |
| 🔎 **Banshee** | 414 | 22 | the scream is a debuff theme waiting to be used | early |
| **Rockslug** | 421 | 27 | slow, low HP | early |
| **Loar Shade** | 1277 | 38 | a shade only dies *properly* to fire | early-mid |
| **Ghoul** | 289 | 50 | the far bank of the Salve — Morytania's border monster | mid |
| **Infernal Mage** | 443 | 60 | mag 75 — a pure caster | mid |
| **Screaming banshee** | 7390 | 61 | the upgraded 414 | mid |
| **Feral Vampyre** | 3137 | 60 | Canifis; the region's identity monster | mid |
| **Vyrewatch** | 8252 | 75 | flies; the Darkmeyer elite | mid-late |
| **Werewolf** | 3135 | 92 | a fast tank that transforms | late |
| **Aberrant spectre** | 2 | 90 | mag 105; the weakening aura | late |
| **Terror dog** | 6474 | 82 | comes in pairs, hits hard | late |

### The Wilderness

*Already here:* Green Dragon · Chaos Druid · Hellhound.

| Candidate | id | HP | Why it belongs | Band |
|---|---|---|---|---|
| **Earth warrior** | 2840 | 54 | Edgeville dungeon; the earth theme and the low rung | mid |
| 🔎 **Ankou** | 2514 | 60 | the reaper; cb 75 / hp 60 matches exactly | mid |
| **Ent** | 7234 | 75 | a walking tree — a silhouette the roster has nothing like | mid-late |
| **Mammoth** | 6604 | 130 | big, slow and very thick | mid-late |
| **Greater demon** | 2025 | 87 | the standard demon | late |
| **Revenants** | 7881 → 7933 → 7935 → 7939 → 7940 | 10 → 155 | **a whole ladder from one family**: imp → hobgoblin → hellhound → knight → dragon. Scales the region without inventing a tier | early → late |
| 🔎 **Lava dragon** | 6593 | 230 | size 4; a natural mini-boss for the region | endgame |
| ~~Chaos druid warrior~~ | 532 | 40 | *human — backlog* | — |
| ~~Black Knight~~ | 516 | 42 | *human — backlog* | — |
| ~~Chaos dwarf~~ | 291 | 61 | *human — backlog* | — |

### Trollweiss Snow

*Already here:* Ice Warrior · Ice Troll (both shipped in phase 1).

| Candidate | id | HP | Why it belongs | Band |
|---|---|---|---|---|
| **Wolf / White wolf** | 110 / 107 / 108 | 34 / 34 / 44 | the fast frail pack the snow needs; three skins of one base | early |
| **Ice giant** | 2085 | 70 | size 2; the snow's tank, sibling of the generic Hill Giant | mid |
| **Thrower Troll** | 931 | 95 | rng 60 — the *ranged* body the region does not have today | mid |
| **Mountain troll** | 936 | 90 | a thick melee body | mid |
| **Dagannoth** | 973 / 2259 | 120 / 85 | 2259 has rng 100: a melee+ranged pair from one species | mid-late |
| **Wallasalki** | 5938 | 120 | mag 100; a fish-skeleton nothing else looks like | late |
| **Troll general** | 4120 | 140 | the elite that closes the region | late |
| ~~Penguin~~ | 2063 | 4 | *harmless animal — out* | — |

### Karamja Jungle

*Already here:* Jogre · Harpie Bug Swarm (both shipped in phase 1). Zulrah is Karamja's
boss, but a boss belongs to no region.

| Candidate | id | HP | Why it belongs | Band |
|---|---|---|---|---|
| **Giant mosquito** | 1041 | 3 | hp 3 and very fast — the AoE test | early |
| **Snake** | 1037 | 25 | the jungle's poison | early-mid |
| 🔎 **Jungle horror** | 1042–1046 | 45 | confirmed green horror in the render; five ids = five skins | mid |
| **Cave horror** | 1049 | 55 | mag 80; the cave version, the one that demands protection | mid |
| **Big Snake** | 2978 | 120 | large and thick | mid-late |
| **Bronze dragon** | 270 | 122 | opens the **metal dragon** line | late |
| **Iron dragon** | 272 | 165 | rung two | late |
| **Steel dragon** | 139 | 210 | the top — the region's natural mini-boss | endgame |
| ~~Tribesman~~ | 530 | 39 | *human — backlog* | — |
| ~~Monkey~~ | 1038 | 6 | *harmless animal — out* | — |

Karamja's two locals are both early-to-mid, so a late Karamja run still reads as the generic
backbone in jungle paint. The metal dragon line is the missing top.

### TzHaar Caverns — held

*Already here:* Fire Giant (by the decision above).

**On hold at the user's request:** the TzHaar are already *towers* in this game, so putting
them on the board as enemies is a design call to settle before any of it is built. The
research stands in case the call goes the other way — three complete ladders exist in the
cache:

- **Fight Caves** — Tz-Kih `2189` (hp 10) · Tz-Kek `2191` (hp 20), which splits into `3120`
  (hp 10) · Tok-Xil `2193` (hp 40, rng 120) · Yt-MejKot `3123` (hp 80 — the healer, and the
  pair of the Yt-HurKot `3128` already baked) · Ket-Zek `3125` (hp 160).
- **TzHaar city** — Hur `2161` (hp 80) · Mej `2154` (hp 100, mag 120) · Xil `2167` (hp 120,
  rng 120) · Ket `2173` (hp 140). A clean melee / mage / ranged / tank quartet.
- **The Inferno** (endgame) — Jal-Nib `7691` (hp 10) · Jal-MejRah `7692` (hp 25) · Jal-Ak
  `7693` (hp 40) · Jal-ImKot `7697` (hp 75) · Jal-Xil `7698` (hp 125) · Jal-Zek `7699`
  (hp 220).

## The Slayer contract

Slayer is where a regional roster breaks if it is built carelessly, because
`buildWaveConfigs` **force-seeds the current task's target into every wave** (the fail-safe
that stops a task from softlocking). Left alone, a regional split means a Morytania
nechryael gets seeded onto the snowfield — the split would be undone by the very system
meant to protect the player.

Five things have to hold:

1. **Task pools are drawn from `generic ∪ current biome`**, not from a fixed list.
   `SLAYER_MASTERS.taskPool` becomes a filter applied at assign time. This is also the
   authentic reading: a master assigns what is in reach.
2. **Every biome needs a monster in every master's band.** Turael (early), Mazchna (mid),
   Duradel (late). The generic backbone already clears this on its own — worst case, Turael
   has 6 monsters to assign, Mazchna 3 and Duradel 4 — and `enemy-regions.test.ts` asserts
   it for every region × master pair, so a future tag that starves a master fails the suite
   rather than the player. It is still thin at the top: each regional set above deliberately
   carries a late-band entry so Duradel gets more than four names.
3. **Superiors stay reachable everywhere** — the two generic carriers above.
4. **Block Task is worth less when it blocks a local monster** (it only helps while you are
   in that region). Either accept it, or restrict blocking to generics.
5. **When the biome changes mid-run** (the future feature below), a task whose target does
   not exist in the new region is **auto-rerolled for free** — otherwise its remaining count
   is unreachable. Settled and built: `SlayerSystem.rerollForRegion()`, already wired to the
   debug region cycle, so the marching-biome feature inherits it rather than discovering it.

Point 1 has one deliberate exception. The wave generator's Slayer force-seed is **not**
region-filtered: if a task somehow survives into a region that cannot supply its target,
the seed still spawns it. The promise that a task is always completable outranks the split,
and the free reroll above is what makes the exception almost unreachable in practice.

One UI consequence worth taking: the Collection Log's **Monsters** tab should group by
region. It turns the log into a bestiary and makes "why is this entry still dark?"
answerable — you have not been to that region yet.

## Later: the biome marching with progression

The intended follow-up is a run that *travels*: the map re-skins every boss cycle and the
roster travels with it, gentle regions first.

> Misthalin → Karamja → Kharidian → Morytania → Wilderness → Trollweiss → TzHaar

That order doubles as a difficulty read (green field → lava cavern) and puts TzHaar, the
deepest region, next to the deepest waves.

**The conflict, and how it was settled:** `SCHEDULABLE_BOSSES` is ordered gentlest→hardest,
and that order is not geographic — Jad (TzHaar) is the fourth boss, while Dusk (Morytania)
is the seventh. Two honest options existed:

- **Bosses stay region-agnostic** — the boss is the act, the region is the stage, and a boss
  can appear anywhere. Nothing about the ladder changes. **This is the decision.** Bosses
  carry no `region` tag, `enemy-regions.test.ts` asserts they never will, and the boss order
  stays exactly as it is.
- ~~**The region order is re-derived from the boss order**~~ — rejected: it gives up the
  gentle→hard geographic read and needs new biomes for the regions the ladder wants
  (Asgarnia for the Mole, Kourend for the Hydra). Revisit only if the boss order is ever
  reopened.

Note also that some current bosses have no biome at all today (Giant Mole → Falador,
Cerberus → Taverley, Hydra → Kourend). Marching biomes makes that visible; region-agnostic
bosses keep it invisible.

## What one new monster costs

Per monster, mirroring the boss checklist:

1. An `EnemyType` in `lib/game/types.ts`.
2. A stat block in `lib/game/data/enemies.ts` (real OSRS hitpoints) **plus exactly one
   weakness** — an `Element` *or* a `StyleWeakness`, never both, never `magic`.
3. A region tag: `region: '<biome id>'` in the stat block, or the field left off for a
   generic. Never both, and never a boss.
4. Baked clips: NPC id + walk/hurt/death sequence ids in `scripts/enemy-anims.config.json`,
   rendered by `render-osrs-npc-anims.mjs`. Pick the ids with `npm run anims:triage <slug>`
   (one-off `npm run anims:index` first) — it scopes candidates to the NPC's own framemap,
   flags the ones that belong to a neighbour on the same rig, and ranks them; the
   `npc-anim-auditor` agent runs it and verifies
   the ids. Some monsters legitimately have no hurt clip — that is a valid outcome.
5. A model icon in `lib/game/assets.ts` (`render-osrs-npcs.mjs`), or `assets.test.ts` fails
   the build.
6. **Its own death cry** — the monster's real clip from the cache, never a neighbour's.
   The id cannot be read out of the cache: the sound index carries no name hashes (12104
   archives, none named), and a death sequence's `frameSounds` names the cry only for
   post-2018 content (probed across the whole roster: 4 of 68). So look the name up in
   `scripts/data/osrs-sound-names.tsv` — `node scripts/extract-osrs-sounds.mjs --find
   <needle>` — add the id to `TARGETS`, extract, and put the slug in `DEATH_TYPES` in
   `lib/game/assets.ts`. Watch Jagex's own spellings: kalphites are filed `kalthite`,
   frogs are filed `toad`. `assets.test.ts` fails the build if any `EnemyType` has no
   clip or the wav is missing. If a monster's clip genuinely does not exist, **ask** —
   never invent one, and never quietly alias.

   Three shared clips are not aliases but the truth, because OSRS itself shares them:
   hobgoblin→goblin, moss_giant→hill_giant, giant_rat→rat.

   **The one accepted exception is the Jogre**, and it is a closed decision (2026-08-28),
   not an open item: the named sound map holds no `jogre` and no plain ogre death at all —
   only the undead Zogre's (916), which is a different creature — so the Jogre keeps the
   hill giant's bellow. Do not "fix" it, and do not cite it as a precedent for aliasing
   anything else.
7. Slayer band placement, if it should ever be a task.

## Suggested build order

**Phase 1 — fill the two empty biomes. ✅ Done.** Trollweiss (Ice Warrior 59hp, Ice Troll
80hp) and Karamja (Harpie Bug Swarm 25hp, Jogre 70hp) — the four are tagged local, baked
from the cache (walk/hurt/death + bestiary portrait), answered on one axis each (Trollweiss
= fire + melee, Karamja = fire + ranged) and placed in the Slayer pools Mazchna and Duradel
draw from. Neither region plays on the backbone alone any more.

**Phase 2 — TzHaar. ⏸ Held.** The set writes itself, but the TzHaar are already towers here
and being both is a design decision, not a content one. Nothing is built until that call is
made.

**Phase 3 — the split itself. ✅ Done, and taken first.** The existing roster is tagged (17
local after phase 1, 15 generic), wave generation builds from `generic ∪ region`, the scripted opening
waves are rewritten into local equivalents rather than importing foreign monsters, and the
Slayer masters filter their pools. No new art — this was the systems change, and it is what
makes phases 1 and 2 mean anything.

**Phase 4 — the thin regions, one region per commit.** Misthalin first, then Kharidian —
today they play on one local monster each, which is to say on the backbone in paint. Then
Morytania and Wilderness top-ups, which are already deep enough to wait. Humans are skipped
throughout (see the held-back note above).

Phases 1, 2 and 4 are pure content and ship without touching a system.
