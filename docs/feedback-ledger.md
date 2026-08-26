# Feedback ledger (NocoDB triage watermark)

Player feedback arrives in two NocoDB tables (base `pft2l1xhudqg51r`):
**Suggestions** `mdi2rpgxmct2kdo` · **Bug Reports** `mh9wuvpkvda79ml`.

**This file exists so nobody re-reads a resolved entry.** Every record ever triaged is
listed below with a verdict. To check for new feedback, query only what is past the
watermark — do **not** dump the whole table:

```
Suggestions:  where=(Id,gt,<last id below>)
Bug Reports:  where=(Id,gt,<last id below>)
```

An already-listed record only needs re-reading if its `UpdatedAt` moved *after* the
audit date, or its row here says `recheck`. Append a row when you triage something new
and bump the watermark. The `Status` column in NocoDB is **not** authoritative — it lags
behind what actually shipped; this file is the truth.

**Two fields that read as the opposite of what they are:** `Name or Link` is *where the
player found the game* (a channel, a video), **not** who wrote the report — pairing it with
`Found On` makes that obvious. The reporter, when known at all, is in `Player Contact`.

**Watermark (2026-08-21):** Suggestions ≤ **38**, Bug Reports ≤ **23**.
Re-queried 2026-08-25: nothing past the watermark, so it stands. That pass also synced
NocoDB's `Status` to this file for the rows that are *finished* — Suggestions 24, 27, 28,
31, 37, 38 → Implemented; Bug Reports 18, 22, 23 → Fixed. Partials (34, 35, 36), the
deliberately-Planned 18, the queued rows and the `Not a Bug` 19 were left as they were.

## Verdict vocabulary

`shipped` — in the game today · `wontfix` — deliberately rejected · `queued` — accepted,
not built · `recheck` — needs verification against current code before acting.

A queued row may carry the user's own priority, set in his 2026-08-21 pass over #24–#35:
**[high]** build it soon · **[later]** wanted, but not near · **[low]** parked, revisit only
if players push · no tag = ordinary backlog.

## Bug Reports

| # | Title | Verdict |
|---|---|---|
| 1 | Resizing browser changes field size, stacks towers | shipped — fixed board 1728×768 |
| 2 | Expanding/shrinking map increases buildable tiles | shipped — same fix |
| 3 | Tile changes with different screen sizes | shipped — same fix |
| 4 | Resizing displaces towers | shipped — same fix |
| 5 | Alchemical Hydra impossible to kill | shipped |
| 6 | Unable to break hydra vent | shipped |
| 7 | Hydra too hard in classic mode | shipped |
| 8 | Typo "loose" → "lose" (dragon knife card) | shipped |
| 9 | Cannot place towers at top of map | shipped — panel-ghost fix (`5b744bc`) + the wave strip capped so it stops growing into a wall over the board (`d815c10`, closes B1) |
| 10 | Dawn/Dusk revive into three bosses | shipped — revive loop closed (`29382f0`, an escaped Guardian stays gone); the pair's kill order is now spelled out on the boss itself (`a0aff14`) |
| 11 | Vorkath tick-eating with Regenerating affix | shipped — `2c73dd2` (stalled regen heal dries up) |
| 12 | Infinite slayer points via task extend | shipped — `a1a9f1b` |
| 13 | Collection-log scrollbar drag moves the panel | shipped — `bad53ff` (all movable panels) |
| 14 | Delayed wave end — dead enemy keeps walking, HP spasms at a value | shipped — `3b775b8` (stall-breaker now runs on every enemy, not just bosses; same fix as #17) |
| 15 | UI scale >120% breaks layout (gold pile overlap) | shipped — `a3e3a58` + `1c41c4e` (scale capped to what the screen can actually hold) |
| 16 | FPS plummets at 5× with any panel open (wave 100+, many towers) | shipped — `0739532` (DPS meter refreshes on the wall-clock not the sim-clock, so 5× no longer forces ~5× the renders; `DpsView` memoised off gold/lives churn). The general single-`ui` full re-render for *other* panels is not speed-amplified and was left as-is |
| 17 | Regen fire giant targeting / softlock (dmg = regen, rooted by stuns) | shipped — `3b775b8` (same stall-breaker; the "only 5 towers can target it" was a symptom, not a cap) |
| 18 | Wizard staff-type picker draws *above* the tile, off-screen on the top 2 rows | shipped — `4b36706` (the picker measures itself and is clamped inside the board like the enemy panel, flipping below the tile near the top edge) |
| 19 | "Pricing bug" — tower cost rising above base | wontfix — intended: each same-type tower costs +15% than the last (`5d24d7d`, `economy.ts`) |
| 20 | Endless button does nothing after clearing the boss roster | shipped — `c0a328f` (`continueEndless()` flips `runPhase` to endless and closes the victory screen, resuming play) |
| 21 | *(no record — id skipped in NocoDB)* | — |
| 22 | "Perfect Hydra" impossible — a 3s kill still counts as a vent heal | shipped — `ba98f08` (2026-08-21). `hydraVentHealed` used to trip on the first frame of any open vent, so even a board fast enough to shatter it on sight lost the task. Now only HP that actually went back on the bar is banked (`bossState.ventHealed`), and the flag breaks only past `HYDRA_PERFECT_HEAL_ALLOWANCE` (2% of max HP, ≈⅔s of an open vent) — the task is escapable by speed, like Jad's twin |
| 23 | Boss progression resets on page reload | shipped — `42aab7e` (2026-08-20) persists `bossesKilled` in the run save, so the ladder resumes instead of restarting at Brutus. The report predates the fix by hours |

## Suggestions

| # | Title | Verdict |
|---|---|---|
| 1 | DPS Menu | shipped |
| 2 | "My ideas so far" (B0aty stream, long list) | shipped — incl. sound `fadeCombat`, boon/hazard tooltips, wave preview |
| 3 | Too easy | shipped — scaling pass |
| 4 | Space bar + copy/paste towers | shipped — Ctrl+C/V, Space starts wave |
| 5 | Roguelike feels like an idler | queued → **M4** roguelite reset-loop rework (design first) |
| 6 | Damage numbers for towers | shipped |
| 7 | Auto-run waves | shipped — Auto in the bottom bar |
| 8 | Overall feedback (wave 219) | shipped |
| 9 | Bosses beyond wave 60 | shipped |
| 10 | Hotkeys | shipped — U/S + rebuy 1-6 |
| 12 | TD-novice thoughts | shipped |
| 13 | Power scaling | shipped |
| 14 | Wave 300+ clear feedback | shipped |
| 16 | Accidentally selling towers | shipped — confirm step |
| 17 | Alongar mapa (Bruno) | queued → **M7** map selection / bigger map |
| 18 | Big TD fan, long list | complaints shipped (movable panels, tower niches, placement `d815c10`); **stays Planned** in NocoDB — two of its asks are still backlog: tower fusion (**M6**) and a gold sink (**M5**) |
| 19 | Improvements to balancing | shipped |
| 20 | Hotkeys | shipped |
| 21 | Upgrade All Towers | shipped — group auto-upgrade, cheapest-first |
| 22 | Boss Balance | shipped — Regen decay `db42ad0`, Mole `52fb016`, per-boss "how to kill" text `a0aff14`, multi-boss floor moved to wave 20 `6fdebeb` |
| 23 | Bosses again | shipped — `29382f0` (leak cost quoted on the enemy panel / wave preview / on leak; an escaped Guardian is never revived) |
| 24 | Too Easy not enough content | **shipped** (user's call, 2026-08-21) — the difficulty half is solved (scaling, Scurrius, weaknesses, the New Game+ ladder). The content half is not verified against the report, but it is tracked on its own as M1/M5, so this row is closed rather than re-litigated |
| 25 | See collection log when in card select | shipped — the offered alternative ("mark the cards I have not collected yet") is the NEW badge on never-kept draft cards (`08f9d6a`); the full in-draft log is not built, but the suggestion was an OR and the alt satisfies it |
| 26 | Game ideas (11-item list) | queued — one point landed (road no longer reads as a car lane, `8fd8f66`); the rest (tower-spam curb, branching upgrades, tower XP, hand-drawn maps, win condition, campaign, monster drops, resources, traps, melee-spawning towers) is a long design backlog spanning M4/M6/M7 |
| 27 | Ease of Late Game | **shipped** — the late-game break is closed as far as the report goes: the damage soft-cap, the draft re-weighting and the A1/A4 curve landed, and the user signed it off 2026-08-21 |
| 28 | Card Balance, and Suggestions | **shipped** — rarity-by-strength (`d3ccf3c`) plus Soul Eater as a mythic appetite (`bf84a88`) settled it; signed off 2026-08-21. The equipment/foil-card layer was not part of the sign-off and lives on as its own idea, not as an open complaint |
| 29 | Monster, Tower, and Prayer Balance | queued **[low]** — headline ask shipped (mobs weak to melee/ranged, `5f2014c`). The extras (slash/crush/stab & bolt/arrow tower types, a player special-energy bar) are **not interesting for now** (user, 2026-08-21) — parked |
| 30 | Clue Scrolls | queued **[later]** — accepted as a real direction, but for a "not very near future" (user, 2026-08-21). Net-new content: draggable clue map, dig spots, golden-tower rewards, 3rd-age gear. Now has a designed sibling — **F4** below — so treat them as one piece of work |
| 31 | Local Login/Save | **shipped** — P1 portable save (2026-08-23, item 13 below): the 💾 Save/Load Game code exports and re-imports the whole account. The user called it important (2026-08-21). Only localStorage persists today; there is still no backend and none planned, so the save code is the answer here rather than an account/login |
| 32 | Zoom In/Out | queued **[low]** — stays in the backlog (user, 2026-08-21). Map zoom was explicitly deferred during the map-uniqueness work; overlaps **M7** |
| 33 | Card Categories | queued **[later]** — worth thinking about and eventually adjusting, but **the roguelite is not the focus for now** (user, 2026-08-21), and cards are roguelite-side. The tension stands: `d3ccf3c` ranks rarity by *power*, this asks to rank it by the OSRS item hierarchy |
| 34 | Mega rares (scythe/shadow/tbow) + pick your own map + periodic level-swap w/ full refund | **partially shipped** — the top-tier item half is in (mega-rare gear exists). Map picking is **not** simply granted: the intended direction is the run *changing biome as the waves go*, so the pick-a-map ask has to be explored against that first (user, 2026-08-21) → feeds **M7** |
| 35 | Construction (Mazing) mode | queued **[high-interest]** — the user likes the two parts that matter (2026-08-21): letting the player **alter the pathing**, and putting **towers/traps on the road itself**. The full separate mode is still design-first; those two mechanics are the piece worth designing |
| 36 | Unique items feel unreachable / underpowered | **half shipped** — `4302a5e` (2026-08-23). Will, 2026-08-20 (found the game via the B0aty channel). The reachability half is fixed and was measured first: level 40 cost 844k XP, which a tower on a sixth of a normal board's damage only banked by wave 83 against a wave-90 run, so the last rung of every ladder was decoration. Curve is `level^1.6` now (level 40 by wave 55, tier 4 at wave 26 instead of 37). The measurement also caught what he was seeing: the support wizard earned 20% of *each* covered tower's damage, so an aura over five attackers paid it all five — that share is split across the covered attackers now. **Still open (item design, not reachability):** Blood Fury restoring a life, the Salve amulet as flat + % (base 20 + 20%), and a Tenacity-shredding unique (Holy Water-style −5% defence on demons; Amulet of the Damned another candidate) |
| 37 | Fang tower (rapid-fire range) is weak | shipped — `3a992ab` (2026-08-23). Will, 2026-08-20. A **niche failure**, not just numbers, and the cause was in the ramp: venom is the toxic tower's whole compensation for hitting soft, and its step was 15% of the *hit* — the tower's weakest stat — so on wave 90 it climbed 8 dps at a time toward a 153 dps ceiling, nineteen reapplies and about twenty-one seconds of unbroken fire on one enemy. Nothing lives that long inside one tower's range, so the niche existed only in the source. The step is a fraction of the CAP now (`VENOM_RAMP_HITS = 5`), saturating over roughly one enemy's pass through the range square at any wave; Magic Fang also fired at 3 ticks between two tiers firing at 2, so upgrading into it made the tower slower *and* the ramp slower. Damage untouched on purpose — with the ramp working the tower passes Emberlight on a single target from wave ~50 (497 vs 475 over 5s; 681 vs 475 at wave 90), which is the scaling-tower shape it was written for. The dart-gear and essence-upgrade asks are folded into #36's open half |
| 38 | Towers should re-target on every attack | shipped — `5059de2` (2026-08-21). Will, 2026-08-20. Aggro stuck to the first target until it died or left range, so towers kept chewing on Vorkath while an abyssal demon walked to the exit, and the workaround was marquee-selecting every tower and re-applying the priority. The pick is now redone on every firing opportunity — the extra scan runs at most once per `TICK` per tower, since it is gated on the cooldown being ready |

**Rejected outright (roster is CLOSED):** splitting magic/melee/ranged into several
towers · a chinchompa AoE tower · M10 utility/buff-support tower.

## Open work, in the user's priority order

1. **M3** protection-prayer boss/elite affix — *shipped* `3b03906`.
2. **M8** arrow-key grid placement — *shipped* `3b03906`.
3. **B1** — *shipped* `d815c10`: the next-wave strip grew one entry per enemy type, so a
   deep run turned it into a panel spanning the top of the board that ate the clicks
   meant for the ground under it. Capped at twelve entries + "+N more".
4. **Boss clarity & balance** (suggestions #22, #23, bug #10) — *shipped in full*:
   Dusk/Dawn revive loop, Mole dig frequency, visible HP-loss-on-leak, the per-boss
   "how to kill" text and the multi-boss floor (now wave 20).
5. **M1** new bosses (KBD/Graardor/Corp/Nex/Zuk/Verzik/Olm) — later.
6. **M2** combat achievements — *shipped in full* (`2c65334`..`2da53b4`): 40 tasks across the six
   real OSRS tiers (Easy…Grandmaster) as pure predicates over facts the engine records per run,
   evaluated at wave end and boss death, celebrated with the collection-log unlock popup and
   listed in a Collection Log **Achievements** tab. Clearing a tier grants its title — cosmetic
   only, it unlocks nothing. The new table is `lib/game/data/combat-achievements.ts`; the legacy
   `data/achievements.ts` (8 entries, legacy engine only) was deliberately left untouched.
7. **M4** roguelite reset-loop / meta rework — next to *plan*, not build.
8. **M6** tower fusion (must respect the closed roster) — think about soon.
9. **M7** maps — queued, and its shape moved (2026-08-21): the run is meant to **change biome
    as the waves advance**, so "pick your own map" (#34, #17) has to be designed against that
    rather than bolted on as a start-screen menu.
10. **M5** a gold sink for **normal** mode — idea still wanted.
11. **A1** late-game victory + Endless + a curve that overtakes — *shipped*: the run is
    won by clearing the boss roster, Endless carries on past it (`c0a328f`), and the
    Victories tab keeps the record. Covers #27/#24/#29/#26.6. Siblings also shipped:
    **A2** cards & economy meaning — the draft re-weights toward cards that escape the
    damage soft-cap, and fireRate/range are capped alongside it (`systems/roguelite-draft.ts`,
    `systems/run-modifiers.ts`); **A3** tower spam / 5×-lag — the per-tower stat cache
    landed, the spatial grid was rejected (a fixed board makes it a regression).
12. **A4** New Game+ / harder difficulty tier — *shipped* (`eca2936`..`04e1a1b`): winning a
    tier unlocks the next, with tougher enemies and a tighter economy. The reward is the
    record, not power.

13. **P1** portable save (#31) — *shipped* (2026-08-23). A 💾 Save Code button on the start
    screen exports the whole account — the eight meta keys **plus the run in progress** — as
    one checksummed line (`OSRSTD1.<base64url>.<fnv1a>`), copyable or downloadable as a file;
    import takes it back by paste or file. The maths is pure and tested
    (`systems/account-save.ts`, versioned like `run-save.ts`); `components/game/save.ts` owns
    the localStorage half. Import **replaces** rather than merges — merging lets one code be
    redeemed twice — so it shows both accounts side by side and asks first. Still no backend
    and none planned.

14. **P2** pathing as a mechanic (#35) — **shipped** (2026-08-24). Not the full
    Construction mode: the two parts the user wants are the player being able to **alter the
    enemy path**, and **towers/traps placed on the road itself**.
    - **P2a road shaping — shipped.** Between waves every interior *leg* of the road (one
      straight stretch) wears a grip; clicking it shows an arrow on each side it could move
      to, with the price and what the move is worth. Buying one moves that leg's two
      endpoints together, one tile: the road stays orthogonal, `path.length` never changes,
      and no pathfinder was introduced. The shape decides the value — a U pushed outward is
      **+2 tiles** of walking under fire, a staircase step is **±0** but re-cuts the board,
      the same U pushed inward is **−2** and is the undo. Price climbs 1.55× per bend
      (120 gp first), so a road cannot be stretched forever — free-form mazing stays out.
      Pure and tested in `systems/road-shaping.ts` (+27 tests); the run save carries the
      bends as a replayable `{seg, dir}` list (`RUN_SAVE_VERSION` unchanged at 3).
    - **P2b Hunter traps — shipped.** A new entity class, not a tower: laid *on* the road
      between waves, drawn under the enemies so it is visibly walked over, and it never
      blocks passage. Five traps, the real OSRS ladder at the real levels and catch XP —
      bird snare (1, snare), box trap (27, takes a wounded enemy and pays extra for it),
      chinchompa (53, blast) and red chinchompa (63, wider blast), magic box (71, three
      catches). Deadfall and net trap are out: they are not items in OSRS, so there is no
      cache icon and no bake behind them. Each holds a fixed number of charges and then it
      is gone; the trap is picked back up with a click for a partial refund.
      What limits the board is a **per-run Hunter level**, not gold: it levels every time a
      trap of yours goes off (real per-catch XP against a run-length curve, ~23k for 71),
      and OSRS's own table decides how many may be out at once — one, plus one at 20, 40,
      60 and 80. Prices carry a +3%/wave surcharge so a wave-sixty board cannot be paved
      with free chinchompas.
      Pure and tested in `systems/hunter-traps.ts` (+38 tests); the table is
      `data/hunter-traps.ts`, the per-frame half `core/sim/traps.ts`, the layer
      `core/render/hunter-traps.ts`. The dock gained a **Towers | Traps** tab rather than a
      seventh stone — the bottom bar's height is fixed — and its sixth trap slot is the
      Hunter skill itself (level, XP bar, traps out). Keys 1–6 follow whichever tab is
      showing. The run save carries the level and the laid traps
      (`RUN_SAVE_VERSION` unchanged at 3).

15. **V1** a victory-only currency + a permanent-unlock shop — *queued, design-first*
    (user's own idea, 2026-08-21). Winning a run should pay a currency that exists
    **only** for winning, spendable on *unique permanent* bonuses — one-off unlocks,
    not another rank of the essence upgrades. It has to stay distinct from **rune
    essence**, which is earned every wave, spent on repeatable upgrade ranks, and
    refundable at 90%; this one is rare, per-victory, and its purchases do not respec.
    OSRS-plausible names, in order of fit:
    **Zeal Tokens** (Soul Wars — paid for *winning* a wave-survival game, and Nomad's
    shop sells permanent things: imbues, XP, not gold) is the recommendation;
    **Castle Wars tickets** (also strictly win-to-earn, but its shop is cosmetic
    decorative armour, which suits a cosmetic-only ladder); **Pest Control points**
    (win-to-earn, buys Void — permanent gear, but reads as a grind currency).
    Unbuilt: the shop's contents are the actual design work, and the
    rewards must not inflate gold.

---

## Idle-friendly content, to explore (user's own ideas, 2026-08-21)

Three features to *explore*, not yet designed. They share one house rule the user set for
them: **nothing may demand timing, APM or constant attention, and everything is optional** —
ignoring a random NPC or never planting a seed must cost the run nothing. Assets come from
the OSRS cache as always ([[assets-from-osrs-only]] / `lib/game/assets.ts`).

16. **F1 random events** — **shipped** (2026-08-23) as the `event` mood of the D&D frame
    (item **21**). Built: Drunken Dwarf (+1 life, or its kebab sold for gold when the player is
    already full), Genie (an essence lamp), Strange Plant (a free overload from the GE), Rick
    Turpentine (gold scaled off the wave and the tower count). Deviations from the sketch below,
    all deliberate: no 10–15s despawn (they wait out the whole prep phase — a countdown would
    demand exactly the timing the house rule forbids), the Genie hands over a lamp instead of a
    three-option pick (a modal that must be answered is attention, not a diversion), the Strange
    Plant pays a potion rather than a seed (**F2** does not exist yet), and Collection-Log
    recording of NPCs met is **not** built — it needs a new log category, still open. The
    original sketch, kept for the record:
    The OSRS random-event NPCs turn up on the board. They spawn on
    empty (non-road) tiles, stay 10–15s, and the player clicks them if he feels like it.
    Low chance per wave (≈5%), **never on a boss wave**, at most one alive at a time.
    - *Drunken Dwarf* — a kebab: restore 1 life, or +10% gold next wave (50/50).
    - *Genie* — offers three, player picks one: gold, essence, or +1 draft reroll.
    - *Strange Plant* — drops a farming seed (feeds **F2**) or a one-wave random buff.
    - *Rick Turpentine* — "fight back": auto-wins off the tower count, pays a loot bag.
    Shape: a `randomNpcs` array in engine state, rolled in `startWave`; each entry carries
    `type, x, y, sprite, timer, reward`; the renderer draws the sprite plus its name; a
    click calls `handleNpcClick(type)`, applies the reward at once, despawns and toasts.
    NPCs met are recorded in the Collection Log (new tab or an existing one widened).

17. **F2 farming patches** — 1–2 allotment tiles placed procedurally with the terrain.
    Between waves the player clicks a patch and sows a cheap seed (10–30gp); it ripens
    over ~5 waves through visible stages (dry → sprout → small plant → mature), glows green
    when ready, and harvesting grants a buff lasting one full wave.
    Guam +15% tower damage · Marrentill +20% prayer efficiency (drains slower) ·
    Ranarr +1 life restored on the next wave clear · Snapdragon +20% tower range ·
    Torstol +30% gold next wave.
    Shape: `farmingPatches` in engine state as `{ x, y, seedType, plantedAtWave, state }`,
    the tiles marked `'farming'` by `generateMap()`/`generateTerrain()`; per-state sprites
    from the cache; harvest applies a temporary `runMods` entry cleared on the following
    `startWave`; seeds sown/harvested counted in the run stats.

18. **F3 boss heads / Trophy Hall** — every boss can drop its severed head at **1/30**,
    rolled per boss (not per run), purely cosmetic and persisted account-wide. A Trophy
    Hall panel (its own, or a Collection Log tab) shows a wall of slots: a dark silhouette
    until the head is won, then the head itself, each with an OSRS-style examine line
    ("The head of TzTok-Jad. It looks disappointed.", "The head of the Giant Mole. Still
    twitching.", "The head of Zulrah. You can't tell if it's angry or just a snake.").
    Shape: `bossHeads: Record<string, boolean>` in localStorage beside killCounts and
    achievements; roll on boss death when the head is still missing; celebrate with the
    existing Collection Log unlock popup; sprites from the real slayer/boss heads.

19. **F4 treasure trails** — enemies drop a clue scroll very rarely (≈1/200); reading it from
    the inventory or the loot bag poses an OSRS-style riddle the player solves between waves
    ("Dig where the Wizard first stood", "Search under the bridge at wave 15") by clicking the
    right tile. **Puzzles only — no emote clues** (user, 2026-08-21): the game has no emote
    system and an emote step would be a pure UI chore, not a riddle. Solve it for gold +
    essence + a shot at a rare cosmetic; get it wrong and the scroll is simply gone — **no
    punishment**. The hook the user wants: the clue reads the *current run* — where the first
    tower went down, which boss fell first — so it feels like the scroll knows what happened.
    This is the player's own ask **#30** arriving as a designed feature, so build the two
    together rather than as rival backlog items.

20. **F5 NPC walkbys** — **shipped** (2026-08-23) as the `walkby` mood of the D&D frame
    (item **21**). Hans, Bob, Party Pete and the Lumbridge Guide all landed, four lines each,
    no reward; the Guide's line is swapped for a real hint read off the coming wave (the boss's
    name, else whatever the player is about to see most of). They do not actually walk — a
    walkby stands on its tile and says its line overhead, because a moving click target is a
    click target that demands timing. The original sketch:
    Pure flavour, **between waves only, never during one**: OSRS regulars
    stroll along the road or across empty tiles and say something when clicked. Hans ("I've
    been here for 20 years and I'm still not sure what this tower does."), Bob the axe seller,
    the Lumbridge Guide — the one exception, who gives a contextual hint about the coming wave
    or boss — and Party Pete, good for a short tune and a burst of confetti. Three or four
    lines each, picked at random. No rewards otherwise; the point is a world that looks
    inhabited. It shares its whole spine with **F1** (spawn on free tiles, a timer, a click
    handler, a sprite from the cache), so the two should be one system with two moods:
    F1 gives something, F5 just talks.

21. **D&D — Distractions & Diversions** — **the frame is shipped** (2026-08-23). One spawner,
    three moods: `event` (**F1**), `walkby` (**F5**), `nest` (**F6**). It rolls once per wave in
    `checkWaveEnd`, so a diversion lands the moment the fighting stops and has the whole prep
    phase to be noticed or ignored; nothing ever spawns during a fight, and `startWave` sweeps the
    board clean. Each mood rolls its **own independent chance** (walkby 30%, nest 15%, event 7% —
    the user's call over a single shared cooldown), every mood consumes its roll whether or not it
    is eligible so blocking one never shifts another's luck, at most **2** stand at once, and the
    rarer mood wins the cap. An event never rolls before a boss wave; walkbys and nests still do,
    which is exactly when the Guide's hint is worth most. A diversion only lands where a tower
    could legally have been built, and steps aside if one is later built on it. The player sees it
    twice — the sprite on the board with a breathing ring and OSRS overhead text, and a clickable
    `rs-infobox` in the top-centre HUD, with no timer digit because nothing is counting down.
    Not persisted in the run save (`RUN_SAVE_VERSION` unchanged): a pending diversion is lost on
    resume, which costs nothing by design. Code: `data/diversions.ts` (the nine entries and the
    per-mood chances), `systems/diversions.ts` + its 32 tests (every roll is a pure function),
    `core/render/diversions.ts`, and `rollDiversions`/`claimDiversion` on the engine.
    **F2** and **F7** hang off this spawner when they are built; **F4** is deliberately not
    wired in yet (user, 2026-08-23: "não faça a parte de clues ainda").
    The design brief that produced it: In OSRS a D&D is a recurring, opt-in, low-commitment activity that
    finds *you* rather than the other way round — Shooting Stars, Tears of Guthix, Penguin Hide
    and Seek, Champions' Challenge, Wilderness Flash Events. That description is already the
    house rule this whole section runs on (no timing, no APM, fully optional), which is why
    **F5 is explicitly a D&D and not a one-off**, and why **F1**, **F2** and **F4** are its
    natural siblings: something turns up on its own schedule, the player engages if he feels
    like it, and skipping it costs nothing. What is still to design is the frame itself — how
    often a D&D shows up, whether they share one cooldown, where the player sees that one is
    waiting, and which OSRS D&Ds map onto a tower-defense board at all.

22. **F6 bird nests** — **shipped** (2026-08-23) as the `nest` mood of the D&D frame (item
    **21**), and it did get the shared spawner, click handler and scan the note below asked for.
    The payload is rolled on opening rather than on landing, which is the whole appeal of a nest:
    gold 55% · essence 30% · a potion 15%. Deviations: between waves only (never during one, like
    every other mood), no 10–15s timer, and no clue-scroll outcome — **F4** is not built. The
    original sketch:
    An OSRS woodcutting habit as a board pickup (user, 2026-08-21). A nest
    drops onto a free tile at random, mostly **between** waves and rarely during one, sits there
    for 10–15s as a small sprite with a soft "pop" to catch the eye without demanding attention,
    and pays out on click: a farming seed (**F2**), 5–20gp, or a clue scroll (**F4**). It is the
    same spawner as **F1**/**F5** wearing a third mood — one system, three payload kinds — so it
    should not get its own timer, its own click handler or its own spawn scan.

23. **F7 fishing spots** — water terrain finally does something (user, 2026-08-21). A water tile
    grows an animated bubble spot; clicking it **between waves** fishes for ~3s on a simple
    progress bar and yields food that restores lives when eaten between waves: shrimp +1, trout
    +2, lobster +3, shark +5, manta ray +8 (very rare). A spot is exhausted after one or two
    catches and respawns about five waves later. This is the section's first idea that touches
    the *loss* economy rather than the damage one, so its ceiling wants care: lives are the run's
    only real currency of failure, and a board that fishes every gap must not out-earn the leaks
    it takes. Needs water tiles to be reachable-but-unbuildable in `terrain-generation`, and the
    fishing-spot GFX + the raw-food inventory icons from the cache.

24. **F8 the main menu becomes a POH** — *far* later, and explicitly so (user, 2026-08-21). The
    start screen turns into a Player Owned House that grows with the account: an empty room with
    a rug at first, then rooms that furnish themselves as things are unlocked — a **Trophy Hall**
    hanging the boss heads of **F3**, a **Skill Hall** with achievement capes on mannequins for
    cleared Combat Achievement tiers, a **Quest Hall** shelving quest rewards, a **Throne Room**
    whose throne tracks prestige, a **Garden** growing whichever **F2** seeds the player plants
    most. Purely a view — nothing is clickable, the player just looks at it. Its value is that
    it makes every *other* item on this list visible in one place, which is also why it can only
    be built after them: with F2/F3 unbuilt the house is a rug and nothing else.
