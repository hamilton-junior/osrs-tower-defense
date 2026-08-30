# OSRS Tower Defense

An Old School RuneScape–themed tower defense game that runs entirely in the
browser. Place OSRS-flavoured towers along a winding path, survive escalating
waves, and earn gold to upgrade your defenses.

> **Status:** being rebuilt for a clean, public-ready core. The playable MVP
> lives in [`lib/game/core/`](lib/game/core/) + [`components/game/`](components/game/);
> the richer OSRS subsystems (Slayer, Prayer, Farming, Magic, Grand Exchange,
> quests, pets, bosses) are being reintroduced incrementally. See
> [`CLAUDE.md`](CLAUDE.md) for architecture.

## Run locally

```bash
npm install
npm run dev   # http://localhost:3000
```

Other scripts:

- `npm run build` — static export to `out/` (`output: 'export'`).
- `npm run test` — Vitest unit suite (pure game-logic in `lib/game/systems/`).
- `npm run lint` — ESLint (advice only; the build does not gate on it).

## Deploy to GitHub Pages

The game is a fully client-side static site, so it deploys to GitHub Pages with
no server.

1. In the repo: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
2. Push to `main`. The workflow in
   [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) builds the
   static export and publishes it.

The workflow sets `NEXT_PUBLIC_BASE_PATH=/<repo-name>` automatically so assets
resolve under the project subpath. To build a Pages bundle locally:

```bash
NEXT_PUBLIC_BASE_PATH=/osrs-tower-defense npm run build   # serve ./out
```

## Tech

Next.js (App Router) · React · TypeScript · HTML Canvas · Tailwind v4 +
hand-rolled OSRS CSS. No backend.
