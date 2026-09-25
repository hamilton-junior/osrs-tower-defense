import { describe, expect, it } from 'vitest';
import {
  LOBBY_CELL_EM, LOBBY_COST, LOBBY_MAX_WALKERS, crossingSeconds, lobbyRoster, lobbySpells, newLobby,
  pickFeetY, pickWalkerDef, planStrike, stepLobby, strikeTowers, walkerHitpoints, walkerOverMenu,
  walkerSize, walkerSlug, LOBBY_SIZE_BOOST, LOBBY_DEATH_DELAY_S, lobbySplatScale, lobbyShotFlight, lobbyUnit,
  type LobbyEnv, type LobbyEvent, type LobbyStage, type LobbyState, type LobbyWalker,
} from './lobby-walkers';
import { NPC_HITPOINTS } from '../data/npc-hitpoints.data';
import { DEATH_SETTLE_S } from '../data/enemy-anims';
import { ENEMIES } from '../data/enemies';

/** Deterministic PRNG (mulberry32) so every run walks the same lobby. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const EM = 22.8;
const STAGE: LobbyStage = {
  width: 1566, floorTop: 496, floorBottom: 688, menuBottom: 640, torchFoot: 540, em: EM, worldPx: 0.9,
  strips: [[0, 379], [1199, 1566]],
};
const SHEET = { feetFrac: 0.8, bodyFrac: 0.6, deathS: 1.2, worldCell: 240 };

function env(rand: () => number, stage: LobbyStage = STAGE): LobbyEnv {
  return { stage, rand, sheet: () => SHEET };
}

/** Run the lobby for `seconds` in 1/60 s frames, collecting every event. */
function run(s: LobbyState, e: LobbyEnv, seconds: number, onFrame?: (s: LobbyState) => void): LobbyEvent[] {
  const out: LobbyEvent[] = [];
  for (let t = 0; t < seconds; t += 1 / 60) {
    out.push(...stepLobby(s, 1 / 60, e));
    onFrame?.(s);
  }
  return out;
}

describe('lobby roster', () => {
  it('prices every monster a wave can send on its own', () => {
    const missing = lobbyRoster().map((d) => d.type).filter((t) => !(t in LOBBY_COST));
    expect(missing).toEqual([]);
  });

  it('prices nothing outside the roster', () => {
    const roster = new Set(lobbyRoster().map((d) => d.type));
    expect(Object.keys(LOBBY_COST).filter((t) => !roster.has(t as never))).toEqual([]);
  });

  it('knows every walker\'s real hitpoints from the cache', () => {
    for (const def of lobbyRoster()) {
      const hp = NPC_HITPOINTS[walkerSlug(def)];
      expect(hp, def.type).toBeGreaterThan(0);
      expect(Number.isInteger(hp), def.type).toBe(true);
      expect(walkerHitpoints(def)).toBe(hp);
    }
  });

  it('shows undead and critters most, demons and dragons next, bugs and birds least', () => {
    const rand = seeded(7);
    const counts: Record<string, number> = {};
    const N = 60000;
    for (let i = 0; i < N; i++) {
      const t = pickWalkerDef(rand).type;
      counts[t] = (counts[t] ?? 0) + 1;
    }
    const share = (t: string) => (counts[t] ?? 0) / N;
    expect(share('skeleton')).toBeGreaterThan(share('black_demon'));
    expect(share('black_demon')).toBeGreaterThan(share('goblin'));
    expect(share('goblin')).toBeGreaterThan(share('cow'));
    expect(share('cow')).toBeGreaterThan(share('vulture'));
    // Weight is 1/cost: a cost-1 monster shows about twelve times as often as a cost-12 one.
    expect(share('skeleton') / share('vulture')).toBeGreaterThan(9);
    expect(share('skeleton') / share('vulture')).toBeLessThan(15);
  });
});

describe('crossingSeconds', () => {
  it('stays between 15 and 30 s, faster monsters crossing sooner', () => {
    for (const def of Object.values(ENEMIES)) {
      const s = crossingSeconds(def.speed);
      expect(s).toBeGreaterThanOrEqual(15);
      expect(s).toBeLessThanOrEqual(30);
    }
    expect(crossingSeconds(50)).toBeCloseTo(22.5);
    expect(crossingSeconds(100)).toBeLessThan(crossingSeconds(40));
  });
});

describe('walkerSize', () => {
  it('draws every monster at its own world size, at the room scale', () => {
    const goblin = walkerSize(ENEMIES.goblin, { ...SHEET, worldCell: 163 }, STAGE);
    const dragon = walkerSize(ENEMIES.green_dragon, { ...SHEET, worldCell: 547 }, STAGE);
    expect(goblin).toBeCloseTo(163 * 0.9);
    expect(dragon / goblin).toBeCloseTo(547 / 163);
    expect(walkerSize(ENEMIES.goblin, { ...SHEET, worldCell: 163 }, { ...STAGE, worldPx: 1.8 })).toBeCloseTo(2 * goblin);
  });

  it('falls back to the board relative size while the scale is unknown', () => {
    const def = ENEMIES.skeleton;
    const board = LOBBY_CELL_EM * EM * (def.renderScale ?? 1);
    expect(walkerSize(def, { ...SHEET, worldCell: null }, STAGE)).toBeCloseTo(board);
    expect(walkerSize(def, SHEET, { ...STAGE, worldPx: 0 })).toBeCloseTo(board);
  });

  it('spawns walkers at that size', () => {
    const s = newLobby(seeded(8));
    run(s, env(seeded(9)), 20);
    expect(s.walkers.length).toBeGreaterThan(0);
    for (const w of s.walkers) expect(w.size).toBeCloseTo(240 * 0.9 * (LOBBY_SIZE_BOOST[walkerSlug(w.def)] ?? 1));
  });

  it('grows the jackal in the lobby to the Giant rat length', () => {
    const jackal = walkerSize(ENEMIES.jackal, { ...SHEET, worldCell: 119 }, STAGE);
    expect(jackal).toBeCloseTo(119 * 0.9 * 1.7);
    expect(walkerSize(ENEMIES.jackal, SHEET, { ...STAGE, worldPx: 0 }))
      .toBeCloseTo(1.7 * walkerSize(ENEMIES.goblin, SHEET, { ...STAGE, worldPx: 0 }) * (ENEMIES.jackal.renderScale ?? 1) / (ENEMIES.goblin.renderScale ?? 1));
  });
});

describe('walkerOverMenu', () => {
  it('puts only the walkers whose feet sit below the menu in front of it', () => {
    expect(walkerOverMenu(walker(seeded(1), { feetY: 660 }), STAGE)).toBe(true);
    expect(walkerOverMenu(walker(seeded(1), { feetY: 620 }), STAGE)).toBe(false);
  });
});

describe('pickFeetY', () => {
  it('keeps feet inside the floor and clear of every other walker', () => {
    const rand = seeded(3);
    const taken: number[] = [];
    for (let i = 0; i < 5; i++) {
      const y = pickFeetY(rand, STAGE, taken);
      expect(y).not.toBeNull();
      expect(y!).toBeGreaterThan(STAGE.floorTop);
      expect(y!).toBeLessThan(STAGE.floorBottom);
      for (const t of taken) expect(Math.abs(t - y!)).toBeGreaterThanOrEqual(0.8 * EM);
      taken.push(y!);
    }
  });

  it('gives up on a floor too thin to hold anyone', () => {
    expect(pickFeetY(seeded(1), { ...STAGE, floorBottom: STAGE.floorTop + EM }, [])).toBeNull();
  });

  it('stands every walker in front of the torches, never level with their base', () => {
    const rand = seeded(9);
    for (let i = 0; i < 200; i++) {
      const y = pickFeetY(rand, STAGE, []);
      expect(y!).toBeGreaterThan(STAGE.torchFoot);
    }
    expect(pickFeetY(seeded(1), { ...STAGE, torchFoot: STAGE.floorBottom }, [])).toBeNull();
  });
});

describe('stepLobby', () => {
  it('never has more than five walkers on the floor', () => {
    const s = newLobby(seeded(11));
    let most = 0;
    run(s, env(seeded(12)), 600, (st) => { most = Math.max(most, st.walkers.length); });
    expect(most).toBeLessThanOrEqual(LOBBY_MAX_WALKERS);
    expect(most).toBeGreaterThan(1);
  });

  it('waits for a sprite set before anyone walks', () => {
    const s = newLobby(seeded(2));
    run(s, { stage: STAGE, rand: seeded(3), sheet: () => null }, 30);
    expect(s.walkers).toEqual([]);
  });

  it('walks every survivor off the far side instead of vanishing', () => {
    const s = newLobby(seeded(5));
    const e = env(seeded(6));
    const last = new Map<number, LobbyWalker>();
    let vanished = 0;
    for (let t = 0; t < 600; t += 1 / 60) {
      stepLobby(s, 1 / 60, e);
      const now = new Set(s.walkers.map((w) => w.id));
      for (const [id, w] of last) {
        if (now.has(id) || w.deadAge !== null || w.strike) continue;
        const offFar = w.dir === 1 ? w.x + w.size / 2 >= STAGE.width : w.x - w.size / 2 <= 0;
        if (!offFar) vanished++;
      }
      last.clear();
      for (const w of s.walkers) last.set(w.id, { ...w });
    }
    expect(vanished).toBe(0);
  });
});

function walker(rand: () => number, over: Partial<LobbyWalker> = {}): LobbyWalker {
  const def = ENEMIES.skeleton;
  return {
    id: 1, def, slug: walkerSlug(def), dir: 1, x: -60, feetY: 600, size: 5.5 * EM,
    speed: (STAGE.width + 5.5 * EM) / 30, sheet: SHEET, walkAge: 0, strike: null, struckAge: null, deadAge: null,
    ...over,
  };
}

describe('planStrike', () => {
  it('lands only on floor the menu does not cover', () => {
    const rand = seeded(21);
    for (let i = 0; i < 500; i++) {
      const w = walker(rand, { dir: rand() < 0.5 ? 1 : -1 });
      const st = planStrike(rand, STAGE, w)!;
      const inStrip = STAGE.strips.some(([a, b]) => st.atX - w.size / 2 >= a && st.atX + w.size / 2 <= b);
      expect(inStrip).toBe(true);
    }
  });

  it('holds fire when no strip is wide enough', () => {
    expect(planStrike(seeded(1), { ...STAGE, strips: [[0, 40]] }, walker(seeded(2)))).toBeNull();
  });

  it('never picks the halberd, whose blade has no flight', () => {
    expect(strikeTowers()).not.toContain('noxious_halberd');
    const rand = seeded(31);
    for (let i = 0; i < 500; i++) expect(planStrike(rand, STAGE, walker(rand))!.shot.tower).not.toBe('noxious_halberd');
  });

  it('casts a real spell for the wizard and none for a plain tower', () => {
    expect(lobbySpells().length).toBeGreaterThanOrEqual(36);
    const rand = seeded(41);
    for (let i = 0; i < 800; i++) {
      const shot = planStrike(rand, STAGE, walker(rand))!.shot;
      if (shot.tower === 'wizard') expect(lobbySpells()).toContain(shot.spell);
      if (shot.tower === 'archer' || shot.tower === 'cannon') expect(shot.spell).toBeNull();
    }
  });
});

describe('a strike', () => {
  function struck(tower: string, spell: string | null) {
    const rand = seeded(51);
    const s = newLobby(rand);
    s.nextSpawn = 1e9;
    const w = walker(rand);
    const plan = planStrike(rand, STAGE, w)!;
    plan.shot.tower = tower as never;
    plan.shot.spell = spell;
    w.strike = plan;
    s.walkers.push(w);
    const events = run(s, env(rand), 60);
    return { s, w, events };
  }

  it('fires, lands on the walker for its full hitpoints, and plays its death', () => {
    const { w, events } = struck('wizard', 'fire_5');
    expect(events[0]).toEqual({ kind: 'fire', sound: 'cast_fire_5' });
    expect(events[1]).toEqual({ kind: 'impact', sounds: ['hit_fire_5'] });
    expect(events[2]).toEqual({ kind: 'death', sound: 'death_skeleton' });
    expect(w.deadAge).not.toBeNull();
  });

  it('stops the walker on the hit and drops it one tick later', () => {
    const rand = seeded(81);
    const s = newLobby(rand);
    s.nextSpawn = 1e9;
    const w = walker(rand);
    w.strike = planStrike(rand, STAGE, w)!;
    s.walkers.push(w);
    for (let i = 0; i < 3600 && w.struckAge === null; i++) stepLobby(s, 1 / 60, env(rand));
    const hitX = w.x;
    const walked = w.walkAge;
    const before = stepLobby(s, LOBBY_DEATH_DELAY_S - 0.05, env(rand));
    expect(before).toEqual([]);
    expect(w.deadAge).toBeNull();
    expect(w.x).toBe(hitX);
    expect(w.walkAge).toBe(walked);
    expect(stepLobby(s, 0.1, env(rand))).toEqual([{ kind: 'death', sound: 'death_skeleton' }]);
    expect(w.deadAge).toBeCloseTo(0.05);
    expect(w.x).toBe(hitX);
  });

  it('shows the spell\'s impact and a hitsplat for the monster\'s hitpoints', () => {
    const rand = seeded(61);
    const s = newLobby(rand);
    s.nextSpawn = 1e9;
    const w = walker(rand);
    w.strike = planStrike(rand, STAGE, w)!;
    w.strike.shot.tower = 'wizard';
    w.strike.shot.spell = 'ice_4';
    s.walkers.push(w);
    for (let i = 0; i < 3600 && w.struckAge === null; i++) stepLobby(s, 1 / 60, env(rand));
    expect(s.splats[0].value).toBe(NPC_HITPOINTS.skeleton);
    expect(s.splats[0].scale).toBe(lobbySplatScale(w, STAGE));
    expect(s.gfx[0].slug).toBe('hit_ice_4');
  });

  it('lands arrows silent and thuds everything else', () => {
    expect(struck('archer', null).events[1]).toEqual({ kind: 'impact', sounds: [] });
    expect(struck('cannon', null).events[0]).toEqual({ kind: 'fire', sound: 'fire_cannon' });
    expect(struck('cannon', null).events[1]).toEqual({ kind: 'impact', sounds: ['hit'] });
  });

  it('clears the body once its death clip and settle have played', () => {
    const rand = seeded(71);
    const s = newLobby(rand);
    s.nextSpawn = 1e9;
    const w = walker(rand);
    w.strike = planStrike(rand, STAGE, w)!;
    s.walkers.push(w);
    for (let i = 0; i < 3600 && w.deadAge === null; i++) stepLobby(s, 1 / 60, env(rand));
    const deadX = w.x;
    stepLobby(s, SHEET.deathS + DEATH_SETTLE_S - 0.05, env(rand));
    expect(s.walkers).toContain(w);
    expect(w.x).toBe(deadX);
    stepLobby(s, 0.1, env(rand));
    expect(s.walkers).not.toContain(w);
  });
});

describe('lobbySplatScale', () => {
  const SPLAT_PX = 30;
  const sized = (size: number, bodyFrac = 0.6) => walker(seeded(1), { size, sheet: { ...SHEET, bodyFrac } });

  it('keeps a splat to under a third of the body it lands on', () => {
    for (const size of [220, 300, 500]) {
      const w = sized(size);
      expect(lobbySplatScale(w, STAGE) * SPLAT_PX).toBeLessThanOrEqual(size * 0.6 * 0.3 + 1e-9);
    }
  });

  it('grows with the body, up to the board splat against the same body', () => {
    expect(lobbySplatScale(sized(500), STAGE)).toBeGreaterThan(lobbySplatScale(sized(300), STAGE));
    expect(lobbySplatScale(sized(5000), STAGE)).toBe(lobbyUnit(STAGE));
  });

  it('stays readable on the smallest monster', () => {
    expect(lobbySplatScale(sized(20), STAGE) * SPLAT_PX).toBeCloseTo(1.6 * EM);
  });
});

describe('lobbyShotFlight', () => {
  it('flies a thrown shot slower than a spell over the same long distance', () => {
    const far = 4000;
    expect(lobbyShotFlight(far, false, STAGE)).toBeGreaterThan(lobbyShotFlight(far, true, STAGE));
  });

  it('keeps each kind above its own floor on a short hop', () => {
    expect(lobbyShotFlight(1, true, STAGE)).toBe(1.2);
    expect(lobbyShotFlight(1, false, STAGE)).toBe(0.6);
  });
});
