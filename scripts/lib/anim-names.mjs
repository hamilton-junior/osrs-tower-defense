/**
 * What a sequence's **GameVal name** says it is.
 *
 * The cache's GameVal index (24) carries Jagex's own internal name for every
 * sequence — `mole_defend`, `cow_boss_death`, `human_unarmedblock` — and those names
 * describe the motion. That is the label the rest of the anim tooling lacked: the
 * framemap says *whose* a clip can be, the metrics guess *what shape* it has, and the
 * observed dump stops at NPC 9297. A name answers "is this his block?" for any NPC,
 * old or new, maya-rigged or not, straight from the local cache.
 *
 * `anim-rig-index.mjs` stores the names in the index; this module only reads them.
 *
 * A name is **evidence, not proof**. Rigs are shared (the hellhound defends with
 * `dog_update_jackal_defend`, the Barrows brothers with `human_unarmedblock`), so the
 * NPC prefix of a clip's name is never checked on a classic rig — only its role word.
 * And many names carry no role word at all (`flip`, `snakeboss_sinkfast`); those say
 * nothing and are never flagged.
 */

/**
 * Role → the words that name it. A word of five letters or more (plus `walk` and
 * `idle`) also matches at either end of a token, which is how `human_unarmedblock`,
 * `human_halberdwalk_f` and `cave_slime_walks` read; shorter words match only a whole
 * token, so `hit` never fires inside `white` nor `stab` inside `stable`.
 */
const ROLE_WORDS = {
  death: ['death', 'dying', 'die'],
  block: ['defend', 'block', 'parry', 'flinch', 'hit'],
  attack: [
    'attack', 'atk', 'bite', 'claw', 'slash', 'stab', 'swipe', 'punch', 'kick', 'stomp',
    'spit', 'breath', 'spell', 'cast', 'shoot', 'throw', 'lunge', 'smash', 'slam', 'strike', 'headbutt',
  ],
  spawn: ['despawn', 'spawn', 'emerge', 'burrow', 'appear', 'disappear', 'teleport'],
  walk: ['walk', 'flying', 'fly', 'run', 'crawl', 'slither', 'hover'],
  stand: ['ready', 'idle', 'stand'],
};
const SHORT_AFFIXES = new Set(['walk', 'idle']);
const WORDS = Object.entries(ROLE_WORDS).flatMap(([role, words]) =>
  words.map((w) => ({ w, role, affix: w.length >= 5 || SHORT_AFFIXES.has(w) })));

/** The role one token names, or null. */
function tokenRole(token) {
  for (const { w, role, affix } of WORDS) {
    if (token === w || (affix && (token.startsWith(w) || token.endsWith(w)))) return role;
  }
  return null;
}

/**
 * The role a name reads as: death | block | attack | spawn | walk | stand, or null.
 * Tokens are read from the END, because OSRS names put the motion last and trail it
 * only with qualifiers that name no role (`spider_update_defend_large`,
 * `gg_dusk_idle_defensive`).
 */
export function nameRole(name) {
  if (!name) return null;
  const tokens = name.toLowerCase().split('_');
  for (let i = tokens.length - 1; i >= 0; i--) {
    const role = tokenRole(tokens[i]);
    if (role) return role;
  }
  return null;
}

/** The role each game clip should play. Clips not listed (rage, charge, breath…) have
 *  no expectation, so their names are never checked. */
export const CLIP_ROLE = { walk: 'walk', hurt: 'block', death: 'death', burrow: 'spawn', emerge: 'spawn' };

/**
 * `{ expected, actual }` when a clip's name positively reads as another role — a hurt
 * named `mole_attack` — else null. A name with no role word is not a contradiction.
 */
export function nameClash(clip, name) {
  const expected = CLIP_ROLE[clip];
  const actual = nameRole(name);
  if (!expected || !actual || actual === expected) return null;
  return { expected, actual };
}

/**
 * The NPC's own naming prefix: the tokens its stand and walk names share, cut before
 * the first role word. `cow_boss_idle` + `cow_boss_walk` → `cow_boss`. Used only where
 * there is no framemap to scope by (maya rigs), to pick his clips out of an id run
 * that may hold another NPC's too.
 */
export function nameFamily(standName, walkName) {
  const a = standName?.toLowerCase().split('_');
  const b = walkName?.toLowerCase().split('_');
  if (!a && !b) return null;
  const base = a && b ? a.slice(0, nameAffinity(standName, walkName)) : (a ?? b);
  const cut = base.findIndex((t) => tokenRole(t));
  const family = (cut === -1 ? base : base.slice(0, cut)).join('_');
  return family || null;
}

/**
 * How many leading tokens two names share — `dog_update_wolf_attack` and
 * `dog_update_wolf_defend` share 3, `dog_update_godwars_defend` only 2. Ranks the
 * siblings of a shared rig, where every tenant's block sits beside his.
 */
export function nameAffinity(a, b) {
  if (!a || !b) return 0;
  const x = a.toLowerCase().split('_');
  const y = b.toLowerCase().split('_');
  let n = 0;
  while (n < x.length && n < y.length && x[n] === y[n]) n++;
  return n;
}

/** True when `name` carries the family prefix as whole tokens. */
export function inFamily(name, family) {
  if (!name || !family) return false;
  const n = name.toLowerCase();
  return n === family || n.startsWith(`${family}_`);
}
