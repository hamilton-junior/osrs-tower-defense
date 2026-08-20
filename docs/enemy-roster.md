# Enemy roster — generic backbone, regional sets, and the Slayer contract

The boss ledger is [`boss-design.md`](boss-design.md); this is its counterpart for the
rank and file. Bosses are the *act*; the common roster is the *stage* — and the stage used
to never change: every common monster could roll on every map, so a Morytania nechryael
walked the Trollweiss snowfield and the biome was pure paint.

**The split itself is now built** (phase 3 below, taken first): `EnemyDef.region`,
[`systems/enemy-regions.ts`](../lib/game/systems/enemy-regions.ts), the wave generator and
the Slayer masters all respect it. What is left is content — the regional sets below, which
are what the split is *for*. Phase 1 filled the two regions that had nothing at all, so
every region now has a set of its own — TzHaar's is a set of one (Fire Giant), which is
what phase 2 is for.

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

Each set lists what moves there from the existing roster, then the new candidates. New
candidates are OSRS monsters that exist in the cache; **their NPC ids and animation ids
are not yet verified** — that is the first step of building any of them
(`render-osrs-npc-anims.mjs --find <name>`, then the `npc-anim-auditor` agent).

### Misthalin Plains — the tutorial region

*Already here:* Cow.

| Candidate | Why it belongs | Band |
|---|---|---|
| **Giant frog** | Lumbridge Swamp; the first thing past the cow field | early |
| **Moss giant** | Varrock sewers — Misthalin's own giant, a rung under Hill Giant | early-mid |
| **Cave slime** | Lumbridge Swamp Caves; carries the poison-on-contact idea if we want one | early |

### Kharidian Desert

*Already here:* Scorpion.

| Candidate | Why it belongs | Band |
|---|---|---|
| **Kalphite Worker** | the desert's signature swarm; reads instantly as "desert" | early-mid |
| **Desert Lizard** | Slayer staple, and a small fast body the region otherwise lacks | mid |
| **Dust Devil** | Smoke Dungeon; the region's high-tier Slayer answer | late |
| **Mummy** | Pyramid Plunder; slow, heavy undead with a desert skin | mid |

### Morytania Swamp — the deepest set today

*Already here:* Ghost · Barrow Wight · Skeletal Mage · Gargoyle · Nechryael (+ their
Superiors: Marble Gargoyle, Nechryarch).

| Candidate | Why it belongs | Band |
|---|---|---|
| **Crawling Hand** | the Slayer Tower's ground floor and every player's first task | early |
| **Banshee** | Slayer Tower; the "bring the right answer" flavour | mid |
| **Ghoul** | the far bank of the Salve — Morytania's border monster | early-mid |
| **Feral Vampyre** | Canifis; the region's identity monster | mid-late |

### The Wilderness

*Already here:* Green Dragon · Chaos Druid · Hellhound.

| Candidate | Why it belongs | Band |
|---|---|---|
| **Revenant** (imp / knight) | Revenant Caves; nothing says "wilderness" harder | mid-late |
| **Chaos Dwarf** | wildy staple, and a ranged-shaped body | mid |
| **Earth Warrior** | Edgeville dungeon; the low rung the region needs | early-mid |

### Trollweiss Snow

*Already here:* Ice Warrior · Ice Troll (both shipped in phase 1).

| Candidate | Why it belongs | Band |
|---|---|---|
| **Ice Giant** | its giant, and a direct sibling of the generic Hill Giant | mid |
| **Wolf** | the fast, frail body the snow needs | early |

### Karamja Jungle

*Already here:* Jogre · Harpie Bug Swarm (both shipped in phase 1). Zulrah is Karamja's
boss, but a boss belongs to no region.

| Candidate | Why it belongs | Band |
|---|---|---|
| **Jungle Horror** | the region's late-tier Slayer monster | late |

Karamja's two locals are both early-to-mid, so a late Karamja run reads as the generic
backbone in jungle paint. Jungle Horror is the missing rung, and worth taking before the
phase 4 top-ups.

### TzHaar Caverns — the one set that writes itself

*Already here:* Fire Giant (by the decision above).

| Candidate | Why it belongs | Band |
|---|---|---|
| **Tz-Kih** | the Fight Cave's first wave | early |
| **Tz-Kek** | second rung; splits in OSRS, a mechanic we already own | mid |
| **Yt-MejKot** | the healer; Jad already brings Yt-HurKot, so the family is established | late |
| **Ket-Zek** | the last thing before Jad | late |

The Fight Cave ladder *is* a wave ladder. This is the cheapest coherent set in the
document, and Jad is already the region's boss.

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
   rendered by `render-osrs-npc-anims.mjs`; the `npc-anim-auditor` agent picks and verifies
   the ids. Some monsters legitimately have no hurt clip — that is a valid outcome.
5. A model icon in `lib/game/assets.ts` (`render-osrs-npcs.mjs`), or `assets.test.ts` fails
   the build.
6. A death cry. Sequence `frameSounds` is empty for every death clip in the cache, so the
   id cannot be read out of the animation — either curate one in `extract-osrs-sounds.mjs`
   by ear, or alias a voice already baked (`DEATH_SOUNDS.jogre = DEATH_SOUNDS.hill_giant`)
   and say in a comment why that one. Never a silent invention.
7. Slayer band placement, if it should ever be a task.

## Suggested build order

**Phase 1 — fill the two empty biomes. ✅ Done.** Trollweiss (Ice Warrior 59hp, Ice Troll
80hp) and Karamja (Harpie Bug Swarm 25hp, Jogre 70hp) — the four are tagged local, baked
from the cache (walk/hurt/death + bestiary portrait), answered on one axis each (Trollweiss
= fire + melee, Karamja = fire + ranged) and placed in the Slayer pools Mazchna and Duradel
draw from. Neither region plays on the backbone alone any more.

**Phase 2 — TzHaar.** Tz-Kih, Tz-Kek, Ket-Zek. One coherent set, one art style, and the
Fight Cave ladder maps onto wave bands for free.

**Phase 3 — the split itself. ✅ Done, and taken first.** The existing roster is tagged (17
local after phase 1, 15 generic), wave generation builds from `generic ∪ region`, the scripted opening
waves are rewritten into local equivalents rather than importing foreign monsters, and the
Slayer masters filter their pools. No new art — this was the systems change, and it is what
makes phases 1 and 2 mean anything.

**Phase 4 — Misthalin, Kharidian, Morytania, Wilderness top-ups**, one or two each.

Phases 1, 2 and 4 are pure content and ship without touching a system.
