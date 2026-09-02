/**
 * Offline **spotanim** (GFX / "graphics" effect) renderer — the animated
 * companion to render-osrs-npcs.mjs. Where that bakes a single static NPC
 * model to a PNG, this bakes a *spot animation* (spell impact, teleport poof,
 * prayer aura, …) to a horizontal **sprite sheet** PNG + a JSON sidecar, which
 * the runtime plays frame-by-frame over the scene (see GameRenderer effects).
 *
 * Pipeline: getSpotAnim(id) → model + sequence → model.loadAnimation() gives
 * the per-frame vertex positions → render each frame with a *shared* fit (so
 * the effect doesn't jitter in scale) → tile frames into one sheet PNG.
 *
 *   node scripts/render-osrs-spotanims.mjs                  # bake every TARGET
 *   node scripts/render-osrs-spotanims.mjs --only fire_hit  # bake one TARGET
 *   node scripts/render-osrs-spotanims.mjs --list           # list spotanims (id/name/model/anim)
 *   node scripts/render-osrs-spotanims.mjs --list barrage   # filter the list by name
 *
 * Build-time/offline only (osrscachereader can't run in a static export).
 */
import { RSCache, IndexType, ConfigType, ModelGroup } from 'osrscachereader';
import { PNG } from 'pngjs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { computeFit, renderModelFrame, loadTextures, modelTextureIds, loadAnimationWithAlpha } from './lib/rs-raster.mjs';
import { parseNpcDef } from './lib/npc-def.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, '..');
const DEFAULT_CACHE = join(homedir(), '.runelite', 'jagexcache', 'oldschool', 'LIVE');
const CACHE_DIR = process.env.OSRS_CACHE_DIR || DEFAULT_CACHE;

const SIZE = 192; // per-frame canvas; see the cell-size note below
/** Supersampling: render each cell this many times over and box it down. A spell
 *  impact is a stack of translucent triangles, and its polygon silhouettes read as
 *  "the mesh is showing" long before its shading does. */
const SS = 2;
/**
 * Cell size, and the per-target `size` override for anything drawn bigger still.
 *
 * The rule is: **a cell must hold at least as many pixels as the effect is ever drawn
 * at on screen.** The renderer draws a spotanim at `meta.size * scale` from a
 * `frameW`-wide cell, and the board is scaled up to the display and then again by the
 * device pixel ratio (capped 2x), so even a modest 72px effect can land as ~190 device
 * pixels. From a 96px bake that is a 2x upscale — exactly the "the magic hits go
 * pixelated on the big monsters" the effects were accused of. The Ancients impacts are
 * worse still: they are sized to the struck model, so a boss (`renderScale` 1.5+)
 * stretches them past 150 logic pixels before the display scale even applies.
 *
 * Baking bigger costs sheet bytes and nothing else: nothing moves or resizes on
 * screen, there is simply resolution behind it now.
 */
const MARGIN = 0.08;
const MS_PER_UNIT = 20; // OSRS frame-length unit ≈ 20ms (one client cycle)

/**
 * Bake targets: slug → spotanim config. `id` is the SpotAnim id (ConfigType
 * SPOTANIM). Optional `yaw`/`pitch` (degrees) frame the effect; impacts read
 * best near front-on. `maxFrames` caps the sheet width for very long anims.
 * Discover ids with `--list`.
 */
const TARGETS = {
  // An NPC target (`{ npc }` instead of `{ id }`) bakes that NPC's *standing*
  // animation — for cache effects that live on an NPC (e.g. the spawn portal)
  // rather than a spotanim. Tuning: `--only portal --yaw N --pitch N`.
  // The Pest Control void portal disc, viewed at a 3/4 side angle (yaw 72 /
  // pitch 28) so the swirling face reads with perspective and the stone frame's
  // bottom rim curves toward the viewer (the "belly") instead of a flat disc.
  // The Pest Control void portal disc, viewed nearly edge-on (yaw 12) — a
  // literal side profile: the stone frame is a thin vertical silhouette and the
  // swirling energy bulges out as the portal's "belly". Nudge yaw up (18-25)
  // for a wider belly, down toward 0 for a thinner profile.
  portal: { npc: 1739, yaw: 12, pitch: 0, maxFrames: 12 },
};

/**
 * The real spell GFX: every wizard spell's projectile + impact spotanim, keyed
 * to mirror the engine's `hit_<element>_<level>` sound keys (so `hitSound` doubles
 * as the impact-GFX slug, and `proj_…` as the flight loop). IDs verified
 * visually against the cache (contact-strip bakes, 2026-07-02):
 *  - Elemental levels 1-5 = Strike/Bolt/Blast/Wave/Surge. Each entry [proj, hit].
 *  - Ancients levels 1-4 = Rush/Burst/Blitz/Barrage. Blitz/Barrage fly with no
 *    cache projectile of their own — they reuse their element's rush/blitz orb
 *    (the closest authentic flight visual).
 */
/**
 * Per-impact fit margin. `computeFit` sizes the sheet from a 1%-trimmed
 * percentile of the pooled vertices, so an anim whose last frames flare far
 * wider than the rest overflows the 96px box and comes out cut off at the
 * sides. A wider margin shrinks the model inside the frame until the widest
 * frame fits. Only list the ones that need it.
 */
const HIT_MARGIN = {
  fire_3: 0.3, // Fire Blast: frames 7-10 bloom past the box (chinchompa blast)
};

const SPELL_GFX = {
  air:   [[91, 92], [118, 119], [133, 134], [159, 160], [1456, 1457]],
  water: [[94, 95], [121, 122], [136, 137], [162, 163], [1459, 1460]],
  earth: [[97, 98], [124, 125], [139, 140], [165, 166], [1462, 1463]],
  fire:  [[100, 101], [127, 128], [130, 131], [156, 157], [1465, 1466]],
  ice:    [[360, 361], [362, 363], [360, 367], [360, 369]],
  blood:  [[372, 373], [372, 376], [374, 375], [374, 377]],
  shadow: [[378, 379], [378, 382], [380, 381], [380, 383]],
  smoke:  [[384, 385], [384, 389], [386, 387], [386, 391]],
};
for (const [el, tiers] of Object.entries(SPELL_GFX)) {
  tiers.forEach(([proj, hit], i) => {
    // Projectiles: a 3/4 SIDE view (yaw) + slight downward tilt. Front-on
    // (yaw 0) sees the bolt down its flight axis — a flat 2D disc with no
    // body; yawing shows its length the way the game camera does in flight.
    // +65 puts the ORB head on the right and the tapered comet tail trailing
    // left — the sheet's canonical "flying +x" pose the renderer rotates to
    // the live flight angle. (The taper is the TAIL, not the nose: -65 baked
    // every bolt flying backwards.)
    TARGETS[`proj_${el}_${i + 1}`] = { id: proj, maxFrames: 12, yaw: 65, pitch: 12 };
    TARGETS[`hit_${el}_${i + 1}`] = { id: hit, maxFrames: 16, margin: HIT_MARGIN[`${el}_${i + 1}`] ?? MARGIN };
  });
}

/**
 * The King Black Dragon's breath, as a flying projectile.
 *
 * Spotanims 393-396 are one family: the same model (17550) and sequence (1990),
 * recoloured into the four breaths he actually uses in OSRS. All four are baked — he
 * cycles them breath by breath, which is what keeps his fourth breath from looking
 * like a replay of his first.
 *
 * Yaw is **-65**, the mirror of the spell bolts above: this model's spiked head sits
 * at the opposite end of its axis, so +65 bakes it flying tail-first. Verified by eye
 * — head to the right, the trailing droplets to the left, i.e. flying +x.
 */
TARGETS.proj_dragonfire = { id: 393, maxFrames: 12, yaw: -65, pitch: 12 };
// His other three breaths, baked from the same family — the recolours are what makes
// a second breath read as a *second* breath rather than a repeat of the first. Named
// from the baked pixels, not from guesswork: 394 comes out olive-green (poison), 395
// pale grey-white (ice), 396 blue-violet (shock).
TARGETS.proj_dragonfire_poison = { id: 394, maxFrames: 12, yaw: -65, pitch: 12 };
TARGETS.proj_dragonfire_ice = { id: 395, maxFrames: 12, yaw: -65, pitch: 12 };
TARGETS.proj_dragonfire_shock = { id: 396, maxFrames: 12, yaw: -65, pitch: 12 };

/**
 * The God Wars graphics block — spotanims 314-318, one contiguous family of models
 * (11058-11061) sitting right beside K'ril Tsutsaroth's claw at 11069.
 *
 * `proj_graardor` (314) is the boulder General Graardor hurls: a pale, tapered rock
 * with chunks breaking off it, and the reason he gets his own flight GFX at all — his
 * slam now throws one at everything the slam catches, so the buff has a *sender*. What
 * happens where it lands is not the rock shattering (316, tried and dropped — a body
 * being *freed* must not be shown taking a hit) but the Death Charge below.
 *
 * Yaw follows the spell-bolt convention: +65 puts the rock's mass on the right and its
 * taper trailing left — the sheet's canonical "flying +x" pose.
 *
 * The family's fourth member, the ground ring at 318, is deliberately NOT baked: it is
 * two usable frames of a near-white outline, and the slam's radius is a *rule* the player
 * has to read at a glance — a crisp drawn ring says where the immunity ends far better
 * than a faint sprite does.
 */
TARGETS.proj_graardor = { id: 314, maxFrames: 12, yaw: 65, pitch: 12 };

/**
 * A single blue ice crystal (spotanim 1200 — the middle of a three-way recolour with
 * 1198 teal and 1199 white). Vorkath's immunity used to be drawn as six straight lines
 * rotating in a gradient; it is these instead, so the shell around him is made of real
 * OSRS ice rather than strokes. Baked upright and front-on: the renderer places and
 * rotates each shard itself.
 */
TARGETS.ice_shard = { id: 1200, maxFrames: 12, yaw: 0, pitch: 0, margin: 0.1 };

/**
 * The cast of **Death Charge**, the Arceuus spell (spotanim 1852 — the growing half of a
 * pair with 1853, which is the same model 41551 fading back out). A violet crystal rising
 * out of a purple pool with dark tendrils curling up around it.
 *
 * It marks a body General Graardor's slam has just shaken free of every stun and slow.
 * The shattering rock that used to sit there said "this was hit", which is the opposite of
 * what happened — the point is that something was *lifted off* them, and a charge going up
 * reads that way where an impact going down never could.
 *
 * Baked front-on and upright: it plays on the mark, standing still, not flying anywhere.
 */
TARGETS.cast_death_charge = { id: 1852, maxFrames: 14, yaw: 0, pitch: 0, margin: 0.12 };

/**
 * Parse a spotanim config's model id + animation id (+ recolour) ourselves.
 *
 * Why not osrscachereader's SpotAnimLoader: in the current LIVE cache the model
 * id moved to **opcode 3 (u32)** (model ids outgrew u16), which the 1.1.3 loader
 * doesn't know — it only reads the legacy opcode 1 (u16) — so it desyncs and
 * yields modelId=undefined / animationId=-1 for every spotanim. We walk the
 * byte stream and read opcode 3 (u32 model) + opcode 2 (u16 anim) directly.
 */
function parseSpotAnimDef(content) {
  const b = new Uint8Array(content.buffer ?? content);
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let p = 0;
  const u8 = () => b[p++];
  const u16 = () => { const v = dv.getUint16(p); p += 2; return v; };
  const u32 = () => { const v = dv.getUint32(p); p += 4; return v; };
  const skipStr = () => { while (b[p] !== 0) p++; p++; };
  const out = { modelId: undefined, animationId: -1, recolorToFind: [], recolorToReplace: [], retexToFind: [], retexToReplace: [] };
  for (let guard = 0; guard < 256; guard++) {
    const op = u8();
    if (op === 0) break;
    else if (op === 1) out.modelId = u16();        // legacy u16 model
    else if (op === 3) out.modelId = u32();        // 32-bit model
    else if (op === 2) out.animationId = u16();
    else if (op === 4 || op === 5 || op === 6) u16(); // resizeX / resizeY / rotation
    else if (op === 7 || op === 8) u8();             // ambient / contrast
    else if (op === 9) skipStr();                    // name
    else if (op === 40) { const n = u8(); for (let i = 0; i < n; i++) { out.recolorToFind.push(u16()); out.recolorToReplace.push(u16()); } }
    else if (op === 41) { const n = u8(); for (let i = 0; i < n; i++) { out.retexToFind.push(u16()); out.retexToReplace.push(u16()); } }
    else break; // unknown → stop (avoid desync garbage)
  }
  return out;
}

/** Build an NPC's (merged + recoloured) model and its standing-animation id. */
async function buildNpcModel(cache, npcId) {
  const file = await cache.getFile(IndexType.CONFIGS, ConfigType.NPC, npcId);
  if (!file?.content) return null;
  const def = parseNpcDef(file.content);
  const models = [];
  for (const mid of def.models) {
    const m = await cache.getDef(IndexType.MODELS, mid).catch(() => null);
    if (m) models.push(m);
  }
  if (!models.length) return null;
  const model = models.length === 1 ? models[0] : new ModelGroup(models).getMergedModel();
  if (def.recolorToFind?.length) {
    const map = new Map();
    def.recolorToFind.forEach((f, i) => map.set(f & 0xffff, def.recolorToReplace[i] & 0xffff));
    for (let i = 0; i < model.faceColors.length; i++) {
      const r = map.get(model.faceColors[i] & 0xffff);
      if (r !== undefined) model.faceColors[i] = r;
    }
  }
  return { model, animationId: def.standAnim };
}

// Rasterisation (projection, fit, per-face fill, textures, the unsigned-alpha
// fix that cures the old "white box" bakes) lives in ./lib/rs-raster.mjs and is
// shared with the other bakers.

// ----------------------------------------------------------------------- main
async function main() {
  if (!existsSync(join(CACHE_DIR, 'main_file_cache.dat2'))) {
    console.error(`No cache at ${CACHE_DIR}\nSet OSRS_CACHE_DIR.`);
    process.exit(1);
  }
  console.log(`Loading cache: ${CACHE_DIR}`);
  const cache = new RSCache(CACHE_DIR);
  await cache.onload;

  const argv = process.argv;

  // --- discovery: list spotanims (optionally filtered by name substring) ----
  const listIdx = argv.indexOf('--list');
  if (listIdx !== -1) {
    const needle = argv[listIdx + 1];
    const wantId = needle != null && /^\d+$/.test(needle) ? Number(needle) : null;
    const files = await cache.getAllFiles(IndexType.CONFIGS, ConfigType.SPOTANIM);
    let shown = 0;
    for (const f of files) {
      if (!f?.content) continue;
      const id = f.id ?? f.fileId;
      if (wantId != null && id !== wantId) continue;
      const d = parseSpotAnimDef(f.content);
      if (d.modelId == null || d.animationId === -1) continue;
      console.log(`${String(id).padStart(5)}  model=${String(d.modelId).padStart(6)}  anim=${String(d.animationId).padStart(6)}`);
      if (++shown >= 4000) break;
    }
    console.log(`(${shown} spotanims with a model+animation)`);
    process.exit(0);
  }

  const onlyIdx = argv.indexOf('--only');
  const only = onlyIdx !== -1 ? argv[onlyIdx + 1] : null;
  const yawIdx = argv.indexOf('--yaw');
  const pitchIdx = argv.indexOf('--pitch');
  const camOverride = {};
  if (yawIdx !== -1) camOverride.yaw = Number(argv[yawIdx + 1]);
  if (pitchIdx !== -1) camOverride.pitch = Number(argv[pitchIdx + 1]);
  const marginIdx = argv.indexOf('--margin');
  if (marginIdx !== -1) camOverride.margin = Number(argv[marginIdx + 1]);

  const entries = Object.entries(TARGETS).filter(([slug]) => !only || slug === only);
  if (!entries.length) { console.warn('No TARGETS to bake (fill ids via --list).'); process.exit(0); }

  for (const [slug, cfgIn] of entries) {
    const cfg = { yaw: 0, pitch: 0, maxFrames: 24, margin: MARGIN, ...cfgIn, ...camOverride };
    // Two sources: a spotanim (`cfg.id`) or an NPC's standing anim (`cfg.npc`).
    let model, animationId;
    if (cfg.npc != null) {
      const built = await buildNpcModel(cache, cfg.npc);
      if (!built) { console.warn(`! ${slug}: NPC ${cfg.npc} has no model`); continue; }
      model = built.model; animationId = built.animationId;
    } else {
      const file = await cache.getFile(IndexType.CONFIGS, ConfigType.SPOTANIM, cfg.id);
      const sa = parseSpotAnimDef(file.content);
      if (sa.modelId == null) { console.warn(`! ${slug}: spotanim ${cfg.id} has no model`); continue; }
      model = await cache.getDef(IndexType.MODELS, sa.modelId);
      if (!model) { console.warn(`! ${slug}: model ${sa.modelId} not found`); continue; }
      if (sa.recolorToFind?.length) {
        const map = new Map();
        sa.recolorToFind.forEach((f, i) => map.set(f & 0xffff, sa.recolorToReplace[i] & 0xffff));
        for (let i = 0; i < model.faceColors.length; i++) {
          const r = map.get(model.faceColors[i] & 0xffff);
          if (r !== undefined) model.faceColors[i] = r;
        }
      }
      // Opcode 41: texture find/replace — swap face texture ids before baking.
      if (sa.retexToFind?.length && model.faceTextures?.length) {
        const map = new Map();
        sa.retexToFind.forEach((f, i) => map.set(f, sa.retexToReplace[i]));
        for (let i = 0; i < model.faceTextures.length; i++) {
          const r = map.get(model.faceTextures[i]);
          if (r !== undefined) model.faceTextures[i] = r;
        }
      }
      animationId = sa.animationId;
    }

    if (animationId === -1) { console.warn(`! ${slug}: no animation`); continue; }
    // Real cache textures for any textured faces (rare on GFX, common on NPCs).
    const textures = await loadTextures(cache, modelTextureIds(model));
    // Alpha-aware load: applies the sequence's type-5 transparency transforms
    // (fades) that plain loadAnimation drops — see lib/rs-raster.mjs.
    const anim = await loadAnimationWithAlpha(cache, model, animationId);
    let frames = anim.vertexData; // [frame][vertex] = [x,y,z]
    let lengths = anim.lengths;
    let alphas = anim.alphaData; // [frame] → per-face alpha (or null)
    if (!frames?.length) { console.warn(`! ${slug}: animation produced no frames`); continue; }

    // Cap frame count (sample evenly) to keep the sheet small.
    if (frames.length > cfg.maxFrames) {
      const picked = [], pickedLen = [], pickedA = [];
      for (let i = 0; i < cfg.maxFrames; i++) {
        const idx = Math.round((i * (frames.length - 1)) / (cfg.maxFrames - 1));
        picked.push(frames[idx]); pickedLen.push(lengths[idx] ?? 3); pickedA.push(alphas?.[idx] ?? null);
      }
      frames = picked; lengths = pickedLen; alphas = pickedA;
    }

    // `loadAnimation` returns vertices as (X, -Y, Z) — Y up-positive — while the
    // canvas is down-positive. Negate Y back (same as render-osrs-npc-anims.mjs)
    // or every bake comes out vertically flipped; the symmetric GFX hid it, the
    // asymmetric ones (shadow tendrils, flames) gave it away.
    frames = frames.map((fr) => fr.map(([x, y, z]) => [x, -y, z]));

    const yawR = (cfg.yaw * Math.PI) / 180, pitchR = (cfg.pitch * Math.PI) / 180;
    const sy = Math.sin(yawR), cy = Math.cos(yawR), sp = Math.sin(pitchR), cp = Math.cos(pitchR);
    const px = cfg.size ?? SIZE;
    const fit = computeFit(frames, sy, cy, sp, cp, px, cfg.margin);

    // Tile frames left→right into one sheet.
    const sheet = new PNG({ width: px * frames.length, height: px });
    for (let fi = 0; fi < frames.length; fi++) {
      const img = renderModelFrame(model, frames[fi], fit, sy, cy, sp, cp, px, textures, alphas?.[fi] ?? undefined, true, SS);
      // blit into the sheet at column fi
      for (let y = 0; y < px; y++) {
        for (let x = 0; x < px; x++) {
          const src = (y * px + x) * 4;
          const dst = (y * (px * frames.length) + fi * px + x) * 4;
          sheet.data[dst] = img.data[src];
          sheet.data[dst + 1] = img.data[src + 1];
          sheet.data[dst + 2] = img.data[src + 2];
          sheet.data[dst + 3] = img.data[src + 3];
        }
      }
    }

    const outDir = join(REPO, 'public', 'assets', 'spotanims');
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, `${slug}.png`), PNG.sync.write(sheet));
    const meta = {
      frames: frames.length,
      frameW: px,
      frameH: px,
      frameMs: lengths.map((l) => Math.max(20, (l ?? 3) * MS_PER_UNIT)),
      spotanim: cfg.id,
    };
    writeFileSync(join(outDir, `${slug}.json`), JSON.stringify(meta));
    const srcLabel = cfg.npc != null ? `NPC ${cfg.npc}` : `spotanim ${cfg.id}`;
    console.log(`✓ ${slug}: ${srcLabel} → ${frames.length} frames → public/assets/spotanims/${slug}.png`);
  }
  process.exit(0);
}

main();
