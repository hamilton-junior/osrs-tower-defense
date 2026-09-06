import { describe, it, expect } from 'vitest';
import type { Enemy, Tower, EnemyType } from '../../types';
import type { GameEngine } from '../engine';
import { freshRunEffects, freshRelicEffects, freshRunMods } from '../engine-state';
import { DEFAULT_UPGRADES } from '../../systems/meta-progression';
import { emptyRunStats } from '../../systems/combat-achievements';
import { fireTowers, damage, baseHit } from './combat';

/**
 * Characterization tests for the two big combat functions — the shot pipeline
 * (`fireTowers`) and the hit pipeline (`damage`). They pin the behaviour that is
 * easy to break while moving code around: which multipliers stack, who is skipped,
 * what a kill pays out. The engine is stubbed down to the slice these two touch,
 * the same way `slayer-system.test.ts` stubs it.
 */

function stubEngine() {
  const sounds: string[] = [];
  const xp: { id: string; dmg: number; weak: boolean }[] = [];
  const recorded: { towerId?: string; dealt: number }[] = [];
  const effects: { id: string; patch: Record<string, number> }[] = [];
  let gold = 0;
  const e = {
    gameTime: 100,
    runSeconds: 0,
    wave: 10,
    width: 1440,
    height: 640,
    lives: 5,
    maxLives: 10,
    kills: 0,
    gameMode: 'roguelite',
    enemies: [] as Enemy[],
    towers: [] as Tower[],
    projectiles: [] as { targetId?: string; damage: number; special?: string; aoe?: boolean; weaponFrac?: number }[],
    particles: [] as unknown[],
    hitsplats: [] as { value: number; kind: string; minor?: boolean }[],
    deaths: [] as { type: string; life: number }[],
    fx: [] as unknown[],
    path: [{ x: 0, y: 320 }, { x: 1440, y: 320 }],
    portalPoint: { x: 0, y: 320 },
    statsCache: new Map(),
    combatEpoch: 1,
    meta: { upgrades: { ...DEFAULT_UPGRADES } },
    prayer: { active: new Set<string>() },
    ge: { active: [] as unknown[] },
    runMods: freshRunMods(),
    runFx: freshRunEffects(),
    relicFx: freshRelicEffects(),
    caStats: emptyRunStats('roguelite', 0),
    killCounts: {} as Record<string, number>,
    bossesKilledThisRun: {} as Record<string, number>,
    lootBag: [] as unknown[],
    gearDrops: [] as unknown[],
    gearDropsDrained: false,
    gearDropSeq: 0,
    slayer: {
      task: null,
      onTaskBonus: () => 1,
      rollSuperior: () => null,
      recordKill: () => {},
    },
    stats: {
      recordDamage: (src: { towerId?: string }, _w: number, _t: EnemyType, dealt: number) =>
        recorded.push({ towerId: src.towerId, dealt }),
      recordEffect: (id: string, _w: number, patch: Record<string, number>) => effects.push({ id, patch }),
    },
    sound: { play: (k: string) => sounds.push(k), duration: () => 0.2 },
    grantTowerXp: (id: string, dmg: number, weak: boolean) => xp.push({ id, dmg, weak }),
    runDamageMult: () => 1,
    synergyMultFor: () => 1,
    eventTowerMods: () => ({ damage: 1, range: 1, fireRate: 1 }),
    consumableTowerMods: () => ({
      damage: { ranged: 1, magic: 1, melee: 1 },
      range: { ranged: 1, magic: 1, melee: 1 },
      fireRate: { ranged: 1, magic: 1, melee: 1 },
    }),
    killGoldPreReward: () => 10,
    awardGold: (n: number) => { gold += n; },
    checkAchievements: () => {},
    steadyHeld: () => false,
    emit: () => {},
  };
  return { e: e as unknown as GameEngine, raw: e, sounds, xp, recorded, effects, gold: () => gold };
}

function mkEnemy(over: Partial<Enemy> = {}): Enemy {
  return {
    id: 'e1',
    type: 'goblin',
    x: 200, y: 320,
    hp: 100, maxHp: 100,
    color: '#0f0',
    pathIndex: 0,
    slowTimer: 0, stunTimer: 0, tauntTimer: 0, groundTimer: 0,
    speed: 40, baseSpeed: 40, naturalSpeed: 40,
    reward: 10,
    ...over,
  } as unknown as Enemy;
}

function mkTower(over: Partial<Tower> = {}): Tower {
  return {
    id: 't1',
    x: 200, y: 300,
    type: 'archer',
    level: 1, maxLevel: 5,
    range: 200,
    damage: 10,
    cooldown: 600,
    lastFired: -99999,
    color: '#fff',
    targetId: null,
    targetingPriority: 'first',
    name: 'Archer',
    upgradeCost: 100,
    specCharge: 0, specMax: 100,
    visualRadius: 20,
    disabledTimer: 0,
    skills: { strength: { level: 1, xp: 0 }, ranged: { level: 1, xp: 0 }, magic: { level: 1, xp: 0 } },
    equipment: { ammo: null, jewellery: null },
    ...over,
  } as unknown as Tower;
}

describe('baseHit — the number a shot leaves the barrel with', () => {
  it('rolls the cannon between its min and max', () => {
    const t = mkTower({ type: 'cannon', minDamage: 10, maxDamage: 20 });
    for (let i = 0; i < 50; i++) {
      const h = baseHit(t);
      expect(h).toBeGreaterThanOrEqual(10);
      expect(h).toBeLessThanOrEqual(20);
    }
  });

  it('uses the tier damage for everything else', () => {
    expect(baseHit(mkTower({ damage: 37 }))).toBe(37);
  });
});

describe('fireTowers — who shoots, at what, for how much', () => {
  it('fires once the cooldown is up and not before', () => {
    const env = stubEngine();
    const t = mkTower({ lastFired: 100 * 1000 }); // fired this very frame
    env.raw.towers.push(t);
    env.raw.enemies.push(mkEnemy());
    fireTowers(env.e, 0.016);
    expect(env.raw.projectiles).toHaveLength(0);
    env.raw.gameTime = 101; // a full second later, past the 600ms cooldown
    fireTowers(env.e, 0.016);
    expect(env.raw.projectiles).toHaveLength(1);
    expect(env.raw.projectiles[0].damage).toBe(10);
  });

  it('holds fire while disabled, and ticks the timer down', () => {
    const env = stubEngine();
    const t = mkTower({ disabledTimer: 1 });
    env.raw.towers.push(t);
    env.raw.enemies.push(mkEnemy());
    fireTowers(env.e, 0.5);
    expect(env.raw.projectiles).toHaveLength(0);
    expect(t.disabledTimer).toBeCloseTo(0.5);
  });

  it('never fires a utility wizard — it projects a field instead', () => {
    const env = stubEngine();
    env.raw.towers.push(mkTower({ type: 'wizard', mageMode: 'utility' }));
    env.raw.enemies.push(mkEnemy());
    fireTowers(env.e, 0.016);
    expect(env.raw.projectiles).toHaveLength(0);
  });

  it('looks past an enemy an in-flight shot will already kill', () => {
    const env = stubEngine();
    env.raw.towers.push(mkTower());
    env.raw.enemies.push(mkEnemy({ hp: 5 }));
    env.raw.projectiles.push({ targetId: 'e1', damage: 20 });
    fireTowers(env.e, 0.016);
    expect(env.raw.projectiles).toHaveLength(1); // only the one already flying
  });

  it('never shoots into a hole in the ground (the Mole while burrowed)', () => {
    const env = stubEngine();
    env.raw.towers.push(mkTower());
    env.raw.enemies.push(mkEnemy({
      type: 'giant_mole',
      bossState: { kind: 'giant_mole', molePhase: 'under' },
    } as Partial<Enemy>));
    fireTowers(env.e, 0.016);
    expect(env.raw.projectiles).toHaveLength(0);
  });

  it('halves a shot fired from road the dragonfire is burning', () => {
    const env = stubEngine();
    env.raw.towers.push(mkTower({ scorchedTimer: 2 }));
    env.raw.enemies.push(mkEnemy());
    fireTowers(env.e, 0.016);
    expect(env.raw.projectiles[0].damage).toBe(5);
  });

  it('gives the Dark Bow archer a second arrow', () => {
    const env = stubEngine();
    env.raw.towers.push(mkTower({ level: 3 }));
    env.raw.enemies.push(mkEnemy(), mkEnemy({ id: 'e2', x: 220 }));
    fireTowers(env.e, 0.016);
    expect(env.raw.projectiles).toHaveLength(2);
  });

  it('Double Shot spreads an extra shot onto a different enemy', () => {
    const env = stubEngine();
    env.raw.runFx.doubleShot = true;
    env.raw.towers.push(mkTower());
    env.raw.enemies.push(mkEnemy(), mkEnemy({ id: 'e2', x: 220 }));
    fireTowers(env.e, 0.016);
    expect(env.raw.projectiles).toHaveLength(2);
    expect(new Set(env.raw.projectiles.map(p => p.targetId)).size).toBe(2);
  });

  it('books every extra arrow with the damage meter, since volume is the whole niche', () => {
    const env = stubEngine();
    env.raw.towers.push(mkTower({ level: 3 }));
    env.raw.enemies.push(mkEnemy(), mkEnemy({ id: 'e2', x: 220 }));
    fireTowers(env.e, 0.016);
    expect(env.effects.filter(f => f.patch.extraShots).length).toBe(1);
  });

  it('stamps a shot with how much of it the weapon itself added', () => {
    const env = stubEngine();
    // A tier-4 bow against a 400 HP target: the anti-tank nudge is at its +20% cap,
    // and is the only bonus riding on this shot.
    env.raw.towers.push(mkTower({ level: 4 }));
    env.raw.enemies.push(mkEnemy({ hp: 400, maxHp: 400 }));
    fireTowers(env.e, 0.016);
    expect(env.raw.projectiles[0].weaponFrac).toBeCloseTo(1 - 1 / 1.2, 3);
  });

  it('leaves a plain shot unstamped, so the meter claims no bonus that was not there', () => {
    const env = stubEngine();
    env.raw.towers.push(mkTower({ level: 1 }));
    env.raw.enemies.push(mkEnemy({ hp: 400, maxHp: 400 }));
    fireTowers(env.e, 0.016);
    expect(env.raw.projectiles[0].weaponFrac).toBeUndefined();
  });

  it('a siphoned tower fires no projectile — the Corporeal Beast drinks the shot', () => {
    const env = stubEngine();
    const beast = mkEnemy({ id: 'corp', type: 'corporeal_beast', hp: 500, maxHp: 1000, isBoss: true } as Partial<Enemy>);
    const core = mkEnemy({ id: 'core', ownerId: 'corp' });
    env.raw.enemies.push(beast, core);
    env.raw.towers.push(mkTower({ siphonedBy: 'core' }));
    fireTowers(env.e, 0.016);
    expect(env.raw.projectiles).toHaveLength(0);
    expect(beast.hp).toBeGreaterThan(500);
    expect(env.raw.hitsplats.some(h => h.kind === 'heal')).toBe(true);
  });

  it('an elemental wizard bakes the weakness bonus into the shot', () => {
    const plain = stubEngine();
    plain.raw.towers.push(mkTower({ type: 'wizard', mageMode: 'elemental', element: 'fire' }));
    plain.raw.enemies.push(mkEnemy({ weakness: 'water' } as Partial<Enemy>));
    fireTowers(plain.e, 0.016);

    const weak = stubEngine();
    weak.raw.towers.push(mkTower({ type: 'wizard', mageMode: 'elemental', element: 'fire' }));
    weak.raw.enemies.push(mkEnemy({ weakness: 'fire' } as Partial<Enemy>));
    fireTowers(weak.e, 0.016);

    expect(weak.raw.projectiles[0].damage).toBeGreaterThan(plain.raw.projectiles[0].damage);
  });

  it('Ice barrage slows on the cast, not on contact', () => {
    const env = stubEngine();
    env.raw.towers.push(mkTower({ type: 'wizard', mageMode: 'ancients', ancientType: 'ice' }));
    const target = mkEnemy();
    env.raw.enemies.push(target);
    fireTowers(env.e, 0.016);
    expect(target.slowTimer).toBeGreaterThan(0);
    expect(env.raw.projectiles[0].special).toBeUndefined();
    expect(env.raw.projectiles[0].aoe).toBe(true);
  });

  it('reuses the cached stat line until the combat epoch moves', () => {
    const env = stubEngine();
    const t = mkTower();
    env.raw.towers.push(t);
    env.raw.enemies.push(mkEnemy());
    fireTowers(env.e, 0.016);
    const cached = env.raw.statsCache.get('t1');
    fireTowers(env.e, 0.016);
    expect(env.raw.statsCache.get('t1')).toBe(cached);
    env.raw.combatEpoch = 2;
    fireTowers(env.e, 0.016);
    expect(env.raw.statsCache.get('t1')).not.toBe(cached);
  });
});

describe('damage — the multipliers that stack on one hit', () => {
  it('the water amp raises every source by a quarter', () => {
    const env = stubEngine();
    const e = mkEnemy({ vulnTimer: 2 });
    env.raw.enemies.push(e);
    damage(env.e, e, 100);
    expect(e.hp).toBe(100 - 125);
  });

  it('the Armored affix halves its rolled style and leaves a styleless DoT alone', () => {
    const env = stubEngine();
    const armored = mkEnemy({ armoredStyle: 'ranged' });
    env.raw.enemies.push(armored);
    damage(env.e, armored, 100, 'hit', false, true, 0, 'ranged');
    expect(100 - armored.hp).toBe(50);
    armored.hp = 100;
    damage(env.e, armored, 100, 'burn', true, true);
    expect(100 - armored.hp).toBe(100);
  });

  it('drains the shield pool before touching HP', () => {
    const env = stubEngine();
    const e = mkEnemy({ shieldHp: 30 });
    env.raw.enemies.push(e);
    damage(env.e, e, 50);
    expect(e.shieldHp).toBe(0);
    expect(e.hp).toBe(80);
  });

  it('shows the shield splat, carrying what the pool ate, when nothing gets through', () => {
    const env = stubEngine();
    const e = mkEnemy({ shieldHp: 30 });
    env.raw.enemies.push(e);
    damage(env.e, e, 20);
    const splat = env.raw.hitsplats.at(-1)!;
    expect(splat.kind).toBe('shield');
    expect(splat.value).toBe(20);
  });

  it('shows the normal splat when a hit breaks through the shield', () => {
    const env = stubEngine();
    const e = mkEnemy({ shieldHp: 30 });
    env.raw.enemies.push(e);
    damage(env.e, e, 50);
    const splat = env.raw.hitsplats.at(-1)!;
    expect(splat.kind).toBe('hit');
    expect(splat.value).toBe(20);
  });

  it('reports a hit turned away by a defence as an armour splat', () => {
    const env = stubEngine();
    const e = mkEnemy({ protectedStyle: 'melee' });
    env.raw.enemies.push(e);
    damage(env.e, e, 1, 'hit', false, true, 0, 'melee');
    expect(env.raw.hitsplats.at(-1)!.kind).toBe('armour');
  });

  it('keeps the blue 0 for a hit that genuinely landed for nothing', () => {
    const env = stubEngine();
    const e = mkEnemy();
    env.raw.enemies.push(e);
    damage(env.e, e, 0);
    expect(env.raw.hitsplats.at(-1)!.kind).toBe('miss');
  });

  it('credits the source tower with damage and XP', () => {
    const env = stubEngine();
    const e = mkEnemy();
    env.raw.enemies.push(e);
    damage(env.e, e, 40, 'hit', false, true, 0, 'ranged', { towerId: 't1', tag: 'direct' });
    expect(env.recorded).toEqual([{ towerId: 't1', dealt: 40 }]);
    expect(env.xp).toEqual([{ id: 't1', dmg: 40, weak: false }]);
  });

  it('a DoT tick never claims the weakness XP bonus', () => {
    const env = stubEngine();
    const e = mkEnemy({ styleWeakness: 'ranged' } as Partial<Enemy>);
    env.raw.enemies.push(e);
    damage(env.e, e, 10, 'hit', false, true, 0, 'ranged', { towerId: 't1', tag: 'direct' });
    damage(env.e, e, 10, 'burn', true, true, 0, 'ranged', { towerId: 't1', tag: 'burn' });
    expect(env.xp[0].weak).toBe(true);
    expect(env.xp[1].weak).toBe(false);
  });

  it('tallies a DoT tick under its own effect bucket', () => {
    const env = stubEngine();
    const e = mkEnemy();
    env.raw.enemies.push(e);
    damage(env.e, e, 10, 'venom', true, true, 0, undefined, { towerId: 't1', tag: 'venom' });
    expect(env.effects).toEqual([{ id: 't1', patch: { venomDmg: 10 } }]);
  });

  it('a landed hit resets the stall clock', () => {
    const env = stubEngine();
    const e = mkEnemy({ stall: { hpFloor: 1, stallTimer: 0, stallStacks: 0, sinceHit: 9 } } as Partial<Enemy>);
    env.raw.enemies.push(e);
    damage(env.e, e, 5);
    expect(e.stall!.sinceHit).toBe(0);
  });

  it('Brutus banks the damage he took, not the health he has left', () => {
    const env = stubEngine();
    const e = mkEnemy({ isBoss: true, bossState: { kind: 'brutus' } } as Partial<Enemy>);
    env.raw.enemies.push(e);
    damage(env.e, e, 30);
    e.hp = e.maxHp; // healed back up
    damage(env.e, e, 20);
    expect(e.bossState!.rageDamage).toBe(50);
  });

  it('the Executioner relic finishes a sliver of a non-boss but never a boss', () => {
    const env = stubEngine();
    env.raw.relicFx.executeFrac = 0.2;
    const mob = mkEnemy({ hp: 15 });
    const boss = mkEnemy({ id: 'b', hp: 15, isBoss: true } as Partial<Enemy>);
    env.raw.enemies.push(mob, boss);
    damage(env.e, mob, 1);
    damage(env.e, boss, 1);
    expect(mob.hp).toBe(0);
    expect(boss.hp).toBe(14);
  });

  it('does not restart a hurt flinch that is still playing', () => {
    const env = stubEngine();
    const e = mkEnemy({ type: 'goblin' });
    env.raw.enemies.push(e);
    damage(env.e, e, 5);
    const first = e.hurtAnim;
    if (first) {
      e.hurtAnim = first / 2;
      damage(env.e, e, 5);
      expect(e.hurtAnim).toBe(first / 2);
    }
  });

  it('a DoT splat is minor and a direct hit is not', () => {
    const env = stubEngine();
    const e = mkEnemy();
    env.raw.enemies.push(e);
    damage(env.e, e, 5, 'hit');
    damage(env.e, e, 5, 'poison', true);
    expect(env.raw.hitsplats[0].minor).toBeUndefined();
    expect(env.raw.hitsplats[1].minor).toBe(true);
  });
});

describe('damage — what a kill pays out', () => {
  it('removes the enemy, banks the kill and pays the gold', () => {
    const env = stubEngine();
    const e = mkEnemy({ hp: 5 });
    env.raw.enemies.push(e);
    expect(damage(env.e, e, 50)).toBe(true);
    expect(env.raw.enemies).toHaveLength(0);
    expect(env.raw.kills).toBe(1);
    expect(env.gold()).toBe(10);
    expect(env.raw.killCounts.goblin).toBe(1);
    expect(env.raw.deaths).toHaveLength(1);
  });

  it('returns false while the enemy is still standing', () => {
    const env = stubEngine();
    const e = mkEnemy();
    env.raw.enemies.push(e);
    expect(damage(env.e, e, 5)).toBe(false);
  });

  it('a debug enemy pays nothing', () => {
    const env = stubEngine();
    const e = mkEnemy({ hp: 5, debug: true } as Partial<Enemy>);
    env.raw.enemies.push(e);
    damage(env.e, e, 50);
    expect(env.raw.kills).toBe(0);
    expect(env.gold()).toBe(0);
    expect(env.raw.killCounts.goblin).toBeUndefined();
  });

  it('an escort pays no gold — killing it is its own reward', () => {
    const env = stubEngine();
    const e = mkEnemy({ hp: 5, escort: true });
    env.raw.enemies.push(e);
    damage(env.e, e, 50);
    expect(env.raw.kills).toBe(0);
    expect(env.gold()).toBe(0);
  });

  it('counts every kill toward the streak meter, chained ones included', () => {
    const env = stubEngine();
    const a = mkEnemy({ hp: 5 });
    const b = mkEnemy({ id: 'e2', hp: 5 });
    env.raw.enemies.push(a, b);
    damage(env.e, a, 50);
    damage(env.e, b, 50, 'hit', false, true, 1);
    expect(env.raw.runFx.killTally).toBe(2);
  });

  it('a chain follow-up never recurses into another chain', () => {
    const env = stubEngine();
    env.raw.runFx.ricochet = { frac: 1, radius: 500 };
    const a = mkEnemy({ hp: 5 });
    const b = mkEnemy({ id: 'e2', hp: 5, x: 210 });
    const c = mkEnemy({ id: 'e3', hp: 5, x: 220 });
    env.raw.enemies.push(a, b, c);
    damage(env.e, a, 50);
    // a's ricochet kills one neighbour; that kill must not arc again.
    expect(env.raw.enemies).toHaveLength(1);
  });

  it('Soul Eater restores a life on a boss kill', () => {
    const env = stubEngine();
    env.raw.runFx.soulSteal = { bossHeal: 1, addKills: 0 };
    const boss = mkEnemy({ hp: 5, isBoss: true } as Partial<Enemy>);
    env.raw.enemies.push(boss);
    damage(env.e, boss, 50);
    expect(env.raw.lives).toBe(6);
  });
});
