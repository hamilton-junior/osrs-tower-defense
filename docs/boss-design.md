# Boss design — roster, mechanic axes, and the visual-state pattern

Every boss in this game owns **one idea**. Not one *attack* — one question it asks the
player about the board they built. Zulrah asks "do you cover all three styles?", the Mole
asks "did you stack everything in one killzone?", the Hydra asks "can you burst?".

A boss whose idea duplicates another boss's idea is not a new boss; it is a reskin. This
document is the ledger of which ideas are **taken**, which are **open**, and which OSRS
boss best carries each one.

## The visual-state rule

**A mechanic the player cannot see is a bug, not a mechanic.** Every boss state that
changes how the boss should be fought must be legible from the boss itself, in this order
of preference:

1. **A different model.** `Enemy.animType` overrides the baked-animation slug without
   touching `type` (and therefore without touching stats, drops or the Collection Log).
   Set it while the state holds, clear it when the state ends. Brutus → Demonic Brutus is
   the reference implementation: *calm bull → enraged demon → calm bull again.*
2. **Overhead text**, for the moment of the telegraph — the OSRS convention of a boss
   announcing itself one beat before the thing happens.
3. Tint / VFX / a prayer overhead, when there is no distinct model to swap to.

The pattern is deliberately generic: `bossAnimVariant(state)` in `systems/boss-mechanics.ts`
maps a boss's current phase to an optional slug, and the engine assigns it to `animType`
each frame. Any boss can opt in by returning a slug. **New mechanics are expected to.**

## Taken ideas (the eight shipped bosses)

| Boss | The question it asks | Axis |
|---|---|---|
| Giant Mole | Did you stack one killzone? | path — skips a stretch |
| Jad | Can you re-prioritise targets mid-fight? | adds — healers |
| Vorkath | Can you hold your burst? | timed immunity |
| Zulrah | Do you cover all three styles? | style rotation |
| Dusk & Dawn | Can you kill two things at once? | linked pair, kill order |
| Cerberus | What is your damage actually made of? | adds — style locks |
| Alchemical Hydra | Can you burst on demand? | breakpoints |
| Brutus | *(new — see below)* | movement irregularity |

## Open axes, and who should carry them

These are the mechanic families **not yet used**. Each is listed with the OSRS boss whose
real fight maps onto it most honestly.

### A. Movement irregularity — **Brutus** ✅ shipped

Bosses that do not simply walk the road. The Mole already *skips* road; Brutus instead
*leaves* it and comes back, costing himself time but breaking your firing lines.

### B. Attacking the towers, not the base

The boss damages or disables the defence itself. Brutus already does it incidentally —
towers standing in his charge are knocked offline for five seconds — and that is the
model: it is a *consequence of positioning*, and it is legible, because a disabled tower
wears the game's prohibited sign. These bosses make disabling the point rather than a
by-product.

The lesson from the two attempts that were cut (Vorkath freezing the nearest tower,
the Hydra arcing lightning through three): a disable the player cannot see and cannot
attribute to anything reads as a bug, not a mechanic. Both fired correctly and were
indistinguishable from nothing happening. A tower-disable needs a visible cause (you
watched him run through it) and a visible state, or it does not belong in the game.

- **King Black Dragon** — dragonfire scorches a **stretch of road**; towers whose range
  covers the burning stretch lose damage while it burns. Punishes tight clustering,
  rewards a long thin defence. Iconic, early-mid tier, and the model is trivially
  sourceable.
- **Vardorvis** — his **spinning axes** sweep along the path; a tower an axe passes over
  goes offline for a beat. The only boss that makes tower *position* dangerous rather
  than just suboptimal.
- **Abyssal Sire** — leaves **miasma pools** on the road behind it. Pools do nothing to
  the base; they suppress any tower covering them. Turns the road into terrain you have
  to re-plan around mid-wave.

### C. Positional / directional vulnerability

- **TzKal-Zuk** — walks behind his **shield**. All damage from towers *ahead* of him on
  the road is blocked; only towers he has already walked past hurt him. This is the
  hardest possible counter to the single-killbox build, and it is exactly the Inferno's
  real geometry. Endgame capstone material.

### D. Weapon-class check

- **Corporeal Beast** — takes heavily reduced damage from everything except one
  designated tower type (the "spear"), and spawns a **Dark Energy Core** that latches
  onto a tower and drains its output into Corp's healing. Two-part answer: own the right
  tower at all, then kill the core. The most faithful translation on this list.

### E. Splitting / swarm

- **Scurrius** — a **rat generator**: a low-tier boss that continuously spits trash. The
  natural companion to Brutus at the bottom of the ladder, and an early lesson that AoE
  exists.
- **Verzik Vitur** — at a threshold she **breaks into her Nylocas swarm** and becomes
  untargetable until the swarm is cleared. Same family as Scurrius but inverted: the adds
  are not a distraction, they are the boss.

### F. Scales with its own decline

- **Dharok the Wretched** — **faster the lower his health**. A slow chip-damage kill
  hands him a sprint down the final stretch. Turns "am I killing it fast enough?" into a
  real question instead of a feeling. (The other five Barrows brothers are five more
  bosses' worth of ideas if this one lands: Guthan heals, Karil halves, Ahrim drains,
  Verac ignores mitigation, Torag slows.)

### G. Punishing focus fire

- **General Graardor** — his slam **stuns the towers that have hurt him most recently**.
  Punishes the killbox without ever being unfair, because the player chooses who is
  exposed by choosing who shoots.

### H. Multi-phase elemental with field effects

- **Nex** — four sequential phases, each immune to a different style *and* laying down a
  different field: smoke poisons the road, shadow cuts tower range, blood heals her off
  your damage, ice freezes. Plus the teleport ("There is... **NO ESCAPE!**") between
  phases. This is a genuine capstone — it is Zulrah, Vorkath and the Sire stacked, and it
  should be the last boss the ladder introduces.
- **Great Olm** — cycling elemental heads, each punishing one tower behaviour (crystal
  bursts under the road, lightning arcing between adjacent towers, flame walling off a
  segment).

### Deliberately rejected

- **Dagannoth Kings** — a trio each immune to all but one style is Zulrah and Cerberus at
  the same time. No new question.
- **Skotizo** — four altars that must fall before he is vulnerable is the Hydra's vent
  with more steps.
- **Kalphite Queen** — two forms with different weaknesses is Zulrah with fewer forms.
- **Tempoross / Wintertodt** — skilling bosses; there is nothing here to translate.

## Suggested build order

1. **Brutus** — tier 0, gentlest rung, teaches that bosses do things. ✅
2. **Scurrius** — tier 0 companion, teaches AoE.
3. **King Black Dragon** — mid, opens axis B (the board itself is attackable).
4. **Corporeal Beast** — late, opens axis D.
5. **TzKal-Zuk** — endgame, opens axis C.
6. **Nex** — endgame capstone, axis H.

Each needs: a stat block (`data/enemies.ts`), an `EnemyType`, a drop table
(`data/drops.ts`), baked clips (`scripts/enemy-anims.config.json` → the
`npc-anim-auditor` agent picks the sequence ids), a death sound, wave presence, a
mechanic in `systems/boss-mechanics.ts`, and a line in `systems/boss-tips.ts`.

---

## Brutus — the reference implementation

**What he is (per the wiki, not per vibes):** the Lumbridge cow-field **bull** from *The
Ides of Milk* (released 25 Feb 2026) — F2P, combat 30, size 3, examine *"Doesn't skip leg
day."* He is explicitly designed as the game's teaching boss: the one a brand-new account
can fight, whose job is to teach **dodging telegraphed attacks**. That is precisely the
right brief for the first rung of our ladder.

**Elemental weakness: Earth, 25%** — taken from the wiki infobox, not chosen.

**NPC ids (verified against the local cache):** `15626`/`15627` Brutus (model 60113) ·
`15628`/`15629` Demonic Brutus (model 60115/60116). All share `standAnim 13781` /
`walkAnim 13782`.

**His real specials.** After four or five basic attacks he alternates between two, each
announced by an overhead emote:

- **Charge** — `*growls*`, a **3-tick (1.8s)** window, then he runs *through* where the
  player stood. This is the one we built, window and overhead verbatim.
- **Slam** — `*snorts*`, a 4-tick window, ground-slams three times in a 3×1 or L shape.
  Left unbuilt: it is an attack on *tiles*, and the honest translation is an attack on
  *towers*, which is axis B's idea and belongs to a different boss.
- (`*huff*` is neither — it is him pathing around an obstacle.)

**The question:** *can your damage survive the target walking out of it?*

**The cycle** — five states, each visible:

| State | Duration | What the player sees | What happens |
|---|---|---|---|
| `calm` | until provoked | Brutus, walking | normal path movement |
| `brace` | **3 ticks** | **Demonic Brutus**, stopped, `*growls*` overhead | the real OSRS tell and the real window |
| `dash` | 1 tick | Demonic Brutus, moving fast | charges *off* the path, straight at a tower |
| `settle` | 1 tick | **Brutus** again, stopped | the rage drops |
| `return` | until home | Brutus, walking back | walks to the exact point he left from, then resumes |

He is provoked by **taking damage**, on a cooldown — so the cycle is something the player
causes, not something on a metronome. (In OSRS the trigger is an attack counter; a tower
defence has no player to count attacks against, so damage taken is the faithful analogue.)

**What is ours, not OSRS's:** the Demonic Brutus *skin*. In game that model is the
post-DT2 hard-mode variant fought by feeding him an abyssal potato — not a rage form. We
borrow it because a mechanic has to be visible and Brutus happens to ship with a perfect
angry version of himself.

**Still on the table, straight from the wiki:** he is **immune to the dwarf cannon**
(*"It's far too muddy for you to set up a cannon here."*), he drops the **Mooleta** and
**Cow slippers**, and his pet is **Beef**. The cannon immunity is authentic but would read
as a broken tower rather than as a mechanic, so it is not implemented.

**Why it is fair:** he never skips road. The dash is lateral and he must walk back to the
last valid path point he stood on, so he *loses* time on every rampage. What he gains is
evasion: the towers that were hitting him lose him for a few seconds. He costs you your
damage window, not your defensive line — which is what makes him the right first boss,
and what distinguishes him from the Mole.

**Dash direction:** straight at the nearest tower — preferring one that isn't already
knocked offline, so he spreads the damage around instead of hammering the same unlucky
tower at every bend.

He originally flinched *away* from whatever hurt him, which read well as an animal
recoiling but aimed the charge at empty ground. The trample it exists to deliver almost
never landed, so the mechanic was invisible for a second time — not because it was
undrawn, but because it never fired. Charging the tower makes the threat concrete
without letting him bypass anything: he still loses the time, and the player still
chooses their exposure by choosing how tightly to build against the road.
