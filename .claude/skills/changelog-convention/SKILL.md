---
name: changelog-convention
description: Follow this repo's commit-message convention so the in-game changelog bakes the right entries and badges. Use whenever writing a commit message for the osrs-tower-defense repo, deciding a commit's conventional-commit type, or when a player-facing change should (or should not) appear in the game's "Recent updates" list with a specific New/Fixed/Updated/Balanced/Faster badge.
---

# Changelog convention

The in-game "Recent updates" list (💬 Feedback panel) is baked from git history by
`scripts/build-changelog.mjs` at `prebuild`, into `public/data/changelog.json`. There
is no backend and no hand-edited changelog — **the commit message _is_ the changelog
entry.** So the conventional-commit type you choose decides the badge a player sees,
and whether the change shows up at all.

Only the commit **subject** is published (sentence-cased, prefix stripped). Bodies are
read only for the two trailers below. Every line shown was written by us; nothing a
player typed is ever surfaced.

## Type → badge

| Commit type            | Badge      | Shown to players? |
|------------------------|------------|-------------------|
| `feat`                 | **New**    | yes               |
| `fix`                  | **Fixed**  | yes               |
| `refactor`, `style`    | **Updated**| yes               |
| `balance`, `tune`      | **Balanced** | yes             |
| `perf`                 | **Faster** | yes               |
| `docs`, `chore`, `test`, anything else | — | **dropped** (plumbing) |

`style` maps to **Updated** on purpose: in this repo an icon/sprite swap or a visible
presentation change is usually committed as `style` or `feat`, and reads to a player as
"this was updated", not "brand new". Pick the type by **what the player perceives**, not
by how much code moved:

- A visible new capability → `feat` (New).
- A bug the player hit is gone → `fix` (Fixed).
- Same feature, different look / reworked internals they'll notice → `refactor`/`style` (Updated).
- Numbers changed (damage, cost, timing, drop rates) → `balance`/`tune` (Balanced).
- It runs faster / smoother → `perf` (Faster).
- Invisible to players (tests, deps, docs, tooling) → `docs`/`chore`/`test` → dropped.

The badge kinds are the contract between the script (`TYPE_KIND` / `KINDS` in
`scripts/build-changelog.mjs`) and the UI (`CHANGELOG_KINDS` in `lib/game/changelog.ts`).
Change one, change the other — `lib/game/changelog-classify.test.ts` guards the mapping.

## Trailers (in the commit body)

Two optional trailers, added by hand, refine an entry. Put them on their own line in the
body:

- **`Changelog: <label>`** — override the badge when the type doesn't reflect the player
  impact. `<label>` must be one of `new`, `fixed`, `updated`, `balanced`, `faster`; an
  unknown label is ignored and the type's default badge stands. Use this for the
  `feat(ui): swap the priority icons` case — it's a `feat` by habit but really an Updated:

  ```
  feat(ui): swap the priority icons

  Changelog: updated
  ```

- **`Feedback: <ref>`** — mark a change as driven by a player report. Its *presence*
  (not the ref) puts a 💬 next to the entry — a "you asked for this". The ref itself is
  never shipped, so it can be anything (`Feedback: suggestion #12`, `Feedback: bug #4`).

## Reminders

- Keep the subject a real sentence-worth of change — it's read verbatim by players.
- `MAX_ENTRIES = 40`: only the recent stretch is published; old history falls off.
- The JSON is committed as well as regenerated, because `npm run dev` and shallow CI
  checkouts don't run `prebuild`. After a commit that should appear, regenerating is
  automatic on the next build; run `node scripts/build-changelog.mjs` by hand if you
  want to preview it.
