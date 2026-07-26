// Pure combat-hot-path micro-benchmark. No engine, no browser.
//   npx tsx scripts/dev/bench-combat.mjs
//
// Measures the per-tower stat term the engine's `combatEpoch` cache removes:
// recomputing `calculateTowerStats` for every tower every sub-step vs a Map.get
// when nothing stat-affecting changed. The recompute cost is quadratic in tower
// count (each tower scans every other for utility auras), so it dominates the
// tower-spam / 5×-speed lag — which is exactly what the cache flattens.
//
// (A spatial grid for the range query was tried and REJECTED: on this fixed
// 1728×768 board a tower's range covers a ~constant fraction of a uniformly
// denser board, so the candidate count scales with the enemy count just like
// brute force, and the per-frame rebuild + per-tower sort made it 1.2–4.3×
// SLOWER at every board size and cell size. The brute `enemies.filter` stays.)
import { calculateTowerStats } from '../../lib/game/systems/tower-combat.ts';
import { DEFAULT_UPGRADES } from '../../lib/game/systems/meta-progression.ts';

const W = 1728, H = 768;
function mulberry32(seed) {
  let s = seed;
  return () => {
    s |= 0; s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ~30% Utility wizards, so the O(towers²) utility-aura scan inside
// calculateTowerStats is exercised for real (the term the cache saves).
function makeTowers(rng, n) {
  return Array.from({ length: n }, (_, i) => {
    const utility = rng() < 0.3;
    return {
      id: `t${i}`, type: utility ? 'wizard' : (rng() < 0.5 ? 'archer' : 'wizard'),
      mageMode: utility ? 'utility' : 'elemental',
      level: 1 + ((rng() * 4) | 0), x: rng() * W, y: rng() * H,
      range: 150 + rng() * 150, cooldown: 1800, damage: 10, equipment: {},
    };
  });
}

const ctx = (allTowers) => ({
  upgrades: DEFAULT_UPGRADES, activePrayers: new Set(), activePotions: [],
  allTowers, synergyMult: 1,
});

function timeIt(fn, iters) {
  fn(); // warm
  const t0 = performance.now();
  for (let i = 0; i < iters; i++) fn();
  return (performance.now() - t0) / iters;
}

for (const nT of [40, 80, 120, 160]) {
  const rng = mulberry32(42);
  const towers = makeTowers(rng, nT);
  const c = ctx(towers);

  // Old per-tick cost: every tower recomputes its stats this sub-step.
  const recompute = () => { for (const t of towers) calculateTowerStats(t, c); };
  // Cached: a Map.get per tower (what the epoch cache does when nothing changed).
  const cache = new Map(towers.map(t => [t.id, { epoch: 0, stats: calculateTowerStats(t, c) }]));
  const cached = () => { for (const t of towers) { const e = cache.get(t.id); void e.stats; } };

  const r = timeIt(recompute, 2000);
  const g = timeIt(cached, 2000);
  console.log(`${String(nT).padStart(3)} towers   recompute ${r.toFixed(4)} ms   cache ${g.toFixed(4)} ms   speedup ${(r / g).toFixed(1)}×`);
}
