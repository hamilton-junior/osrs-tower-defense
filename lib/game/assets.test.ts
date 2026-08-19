/**
 * Icon assets.
 *
 * `coinsIcon` picks the client's own coin pile for a stack size; the coverage
 * block below guards the rule that assets come from the game cache and never
 * from an external host.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { coinsIcon, localIconNames } from './assets';
import { GE_OFFERS } from './data/ge';
import { SLAYER_REWARDS } from './data/slayer';
import { GLOBAL_UPGRADE_DEFS } from './systems/meta-progression';

/** `…/items/coins_25.png` → `coins_25`. */
const slug = (n: number) => coinsIcon(n).split('/').pop()!.replace('.png', '');

describe('coinsIcon', () => {
  it('uses the client\'s own thresholds', () => {
    expect(slug(1)).toBe('coins_1');
    expect(slug(2)).toBe('coins_2');
    expect(slug(3)).toBe('coins_3');
    expect(slug(4)).toBe('coins_4');
    expect(slug(5)).toBe('coins_5');
    expect(slug(25)).toBe('coins_25');
    expect(slug(100)).toBe('coins_100');
    expect(slug(250)).toBe('coins_250');
    expect(slug(1_000)).toBe('coins_1000');
    expect(slug(10_000)).toBe('coins_10000');
  });

  // The ladder is inclusive at the bottom: a threshold shows its own pile, and
  // one coin short still shows the pile below. This is the off-by-one that a
  // `>` instead of `>=` would introduce, and nothing else would catch it.
  it('switches at the threshold, not one past it', () => {
    expect(slug(24)).toBe('coins_5');
    expect(slug(99)).toBe('coins_25');
    expect(slug(249)).toBe('coins_100');
    expect(slug(999)).toBe('coins_250');
    expect(slug(9_999)).toBe('coins_1000');
  });

  it('never runs out of pile above the top threshold', () => {
    expect(slug(50_000)).toBe('coins_10000');
    expect(slug(9_999_999)).toBe('coins_10000');
  });

  // An empty purse is a real HUD state even though it is not a real inventory
  // state; it must still resolve to an icon rather than a broken image.
  it('falls back to the single coin at zero', () => {
    expect(slug(0)).toBe('coins_1');
  });
});

const baked = new Set(localIconNames());

/** Names the UI passes as literals, rather than reading off a data table. Read
 *  once — both checks below share the same scan. It walks the whole interface
 *  directory rather than one file: the panels were split out of `GameRoot.tsx`,
 *  so a literal now lives wherever its panel does, and a scan of one file would
 *  quietly stop covering most of them. */
const literalIconNames: string[] = (() => {
  const dir = join(__dirname, '../../components/game');
  const names: string[] = [];
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.tsx') && !f.endsWith('.ts')) continue;
    const src = readFileSync(join(dir, f), 'utf8');
    for (const m of src.matchAll(/(?:iconUrl|geIcon)\('([^']+)'\)/g)) names.push(m[1]);
  }
  return names;
})();

describe('icon coverage', () => {
  it.each([
    ['GE offers', GE_OFFERS.map((o) => o.wiki)],
    ['slayer rewards', SLAYER_REWARDS.map((r) => r.icon)],
    ['meta upgrades', GLOBAL_UPGRADE_DEFS.map((d) => d.icon)],
    ['interface literals', literalIconNames],
  ])('%s all resolve to a local bake', (_label, names) => {
    expect(names.filter((n) => !baked.has(n))).toEqual([]);
  });

  it('finds the literals it means to check', () => {
    expect(literalIconNames.length).toBeGreaterThan(0);
  });

  it('bakes nothing no table asks for', () => {
    const asked = new Set([
      ...GE_OFFERS.map((o) => o.wiki),
      ...SLAYER_REWARDS.map((r) => r.icon),
      ...GLOBAL_UPGRADE_DEFS.map((d) => d.icon),
      ...literalIconNames,
    ]);
    expect([...baked].filter((n) => !asked.has(n))).toEqual([]);
  });
});
