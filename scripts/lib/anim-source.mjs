import { readFileSync } from 'node:fs';

/**
 * Where a clip in `scripts/enemy-anims.config.json` gets its **model** from.
 *
 * Normally a clip is just a sequence id, posed on the enemy's own NPC model:
 *
 *   "death": 1520
 *
 * But some OSRS deaths swap the model. The classic Gargoyle does not fall over —
 * she crumbles into a pile of rubble — so her death is authored on a skeleton of
 * its own (framemap 806, which no NPC idles on) belonging to the rubble, not to
 * her. Posing HER mesh with those bones renders garbage: that is the whole reason
 * the first bake of it came out "todo bugado". The clip has to be baked from the
 * model the animation was written for, and composited into her sheet.
 *
 * So a clip may instead name its source model:
 *
 *   "death": { "anim": 1520, "obj": 21125 }    // a scenery object's model
 *   "death": { "anim": 1520, "npc": 1543 }     // another NPC's model
 *   "death": { "anim": 1520, "model": 5034 }   // a bare model id, when the mesh
 *                                              // belongs to no def at all
 *
 * Such a clip is exported to its own file, `<slug>__<clip>.glb`, and the baker
 * loads it alongside the main one: same scene, same camera, one shared fit, and
 * only the root that owns the clip being rendered is visible. The sheet the game
 * loads is unchanged — one PNG per clip, one entry in `<slug>.json`.
 *
 * Everything that reads the config goes through here, so a clip is always
 * `{ anim, npc?, obj? }` and the plain-number form keeps working untouched.
 */

/** @typedef {{ anim: number, npc?: number, obj?: number, model?: number }} ClipSource */

/** The keys that name a foreign model, in the order they are documented. */
export const SOURCE_KEYS = ['npc', 'obj', 'model'];

/** Normalise one config value (number or object) into a {@link ClipSource}. */
export function clipSource(value) {
  if (typeof value === 'number') return { anim: value };
  if (value && typeof value === 'object' && typeof value.anim === 'number') {
    const out = { anim: value.anim };
    for (const k of SOURCE_KEYS) if (typeof value[k] === 'number') out[k] = value[k];
    const named = SOURCE_KEYS.filter((k) => out[k] != null);
    if (named.length > 1) {
      throw new Error(`clip source names ${named.join(' and ')} — pick one`);
    }
    return out;
  }
  throw new Error(`bad clip source ${JSON.stringify(value)} — expected a sequence id or { anim, npc|obj }`);
}

/** The sequence id alone — what every id-picking script wants. */
export function animId(value) {
  return clipSource(value).anim;
}

/** `{ clip: value }` → `{ clip: sequenceId }`, for scripts that only care about ids. */
export function animIds(anims) {
  return Object.fromEntries(Object.entries(anims ?? {}).map(([clip, v]) => [clip, animId(v)]));
}

/** True when the clip is posed on a model other than the enemy's own NPC. */
export function isAltModel(value) {
  const s = clipSource(value);
  return SOURCE_KEYS.some((k) => s[k] != null);
}

/** Human-readable "npc 1543" / "model 5034" for logs. */
export function sourceLabel(value) {
  const s = clipSource(value);
  const k = SOURCE_KEYS.find((key) => s[key] != null);
  return k ? `${k} ${s[k]}` : 'own model';
}

/** The glTF basename for a clip that carries its own model. */
export function altGltfName(slug, clip) {
  return `${slug}__${clip}`;
}

/**
 * `enemy-anims.config.json` with every clip flattened to its bare sequence id.
 *
 * The id-picking tools (triage, observed cross-reference, validate, the legacy
 * software rasteriser) only ever ask "which sequence is this clip?" — flattening
 * here is what keeps them from having to learn the object form at all. Anything
 * that must actually BUILD the clip (the glTF exporter, the sprite baker) reads the
 * raw JSON and goes through {@link clipSource} instead.
 */
export function readAnimConfig(path, { skipAlt = false } = {}) {
  const raw = JSON.parse(readFileSync(path, 'utf8'));
  return Object.fromEntries(
    Object.entries(raw).map(([slug, cfg]) => {
      let anims = cfg.anims ?? {};
      if (skipAlt) {
        // A renderer that only ever poses the enemy's own mesh cannot draw a borrowed
        // clip — it would pose a foreign skeleton on this body and produce the exact
        // garbage the borrowed-model form exists to avoid. Drop it, out loud.
        const alt = Object.keys(anims).filter((c) => isAltModel(anims[c]));
        for (const c of alt) console.warn(`  ~ ${slug}.${c}: posed on ${sourceLabel(anims[c])} — skipped (this renderer only draws the NPC's own model)`);
        anims = Object.fromEntries(Object.entries(anims).filter(([c]) => !alt.includes(c)));
      }
      return [slug, { ...cfg, anims: animIds(anims) }];
    }),
  );
}
