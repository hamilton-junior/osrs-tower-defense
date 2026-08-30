/**
 * Bake enemy sprite sheets **from the glTF, rendered by three.js** — the
 * trustworthy path the live bestiary viewer uses (real WebGL z-buffer, real
 * morph-target playback). This replaces the hand-rolled software rasteriser in
 * render-osrs-npc-anims.mjs as the source of the in-game sheets, so the sprites
 * the game draws are literally snapshots of what the 3D viewer shows.
 *
 *   node scripts/bake-enemy-sprites-from-gltf.mjs                 # bake every enemy
 *   node scripts/bake-enemy-sprites-from-gltf.mjs --only hill_giant
 *   node scripts/generate-enemy-anims-data.mjs                    # regenerate the table
 *
 * How it stays 1:1 with the old sheets (drop-in, same facing/framing):
 *  - The model's base+morph vertices are the cache frames in (X,-Y,-Z) space.
 *  - We render with an ORTHOGRAPHIC camera whose basis is derived to reproduce
 *    exactly the old bake's yaw/pitch projection (see deriveBasis below), so the
 *    creature faces RIGHT at the same 3/4 angle and the same shared fit — but now
 *    a true per-pixel depth buffer (no painter's-sort detached parts) and the
 *    viewer's lighting/flat-shading.
 *
 * Needs: a Chromium browser (Edge is auto-detected on Windows) driven by
 * puppeteer-core, and the exported .glb models in public/assets/enemies-gltf/
 * (scripts/export-enemy-gltf.mjs). Build-time/offline only.
 */
import { createServer } from 'node:http';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, extname } from 'node:path';
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import { launchBrowser } from './lib/browser.mjs';
import { trimTail } from './lib/clip-tail.mjs';
import { clipSource, isAltModel, altGltfName } from './lib/anim-source.mjs';
import { pickGroup } from './lib/anim-group.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, '..');
const PUBLIC = join(REPO, 'public');
const THREE_DIR = join(REPO, 'node_modules', 'three');
const GROUP = pickGroup(process.argv);
const CONFIG_PATH = join(__dirname, GROUP.config);
const GLTF_DIR = join(REPO, ...GROUP.gltfDir);
const GLTF_URL = '/' + GROUP.gltfDir.slice(1).join('/');

const SIZE = 128;                 // per-frame cell for an ordinary mob
/**
 * Bosses are baked in a bigger cell.
 *
 * The renderer draws an enemy at a size of its own choosing — `(isBoss ? 60 : 30) *
 * renderScale * 1.32` logic pixels — and the board is then scaled up to the display
 * and again by the device pixel ratio. A boss can therefore land at ~300 device
 * pixels while an ordinary mob stays near 100, so one shared cell is either wasteful
 * for the mob or a 2.4x upscale for the boss. The cell follows the draw instead: each
 * sheet records its own `frameW`, and nothing on screen moves or resizes.
 */
const BOSS_SIZE = 256;
/**
 * Supersample factor: every cell is rendered SS times over and boxed down here in
 * Node. The browser's MSAA (swiftshader) only smooths the outer silhouette; the seams
 * *inside* the model — the ones that read as "the mesh is showing" — need the whole
 * frame integrated.
 */
const SS = 2;
const MARGIN = 0.06;              // same framing margin as computeFit
const TARGET_DEFAULTS = { yaw: 50, pitch: 6, maxFrames: 24, mirror: false, flipY: false, loop: { walk: true }, ...(GROUP.defaults ?? {}) };

// ------------------------------------------------------------- static file map
const MIME = { '.js': 'text/javascript', '.glb': 'model/gltf-binary', '.bin': 'application/octet-stream', '.png': 'image/png', '.html': 'text/html' };
function serveFile(res, absPath) {
  if (!existsSync(absPath)) { res.statusCode = 404; res.end('nf'); return; }
  res.setHeader('content-type', MIME[extname(absPath)] || 'application/octet-stream');
  res.end(readFileSync(absPath));
}

function harnessHtml() {
  return `<!doctype html><html><head><meta charset="utf-8">
<script type="importmap">{ "imports": {
  "three": "/vendor/three.module.js",
  "three/addons/": "/vendor/addons/"
}}</script></head><body><script type="module">
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const SS = ${SS};
// The cell is per-enemy (see BOSS_SIZE) and is set from Node before each bake.
let CELL = ${SIZE};
// A clip is normally posed on the enemy's own mesh, but one whose sequence was
// authored on a FOREIGN skeleton ships as its own file (<slug>__<clip>.glb, see
// scripts/lib/anim-source.mjs). Every one of them is loaded into the SAME scene so
// they share one camera and one fit — that shared fit is what makes a borrowed
// death land where the body was standing — and only the root that owns the clip
// being rendered is visible.
let renderer, scene, camera, meshes, roots, actions;

renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(CELL * SS, CELL * SS);
window.setCell = (px) => { CELL = px; renderer.setSize(px * SS, px * SS); };
renderer.setClearColor(0x000000, 0);
document.body.appendChild(renderer.domElement);

window.loadEnemy = async (files) => {
  scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x3a3a3a, 1.15));
  const key = new THREE.DirectionalLight(0xffffff, 0.65);
  key.position.set(1, 2, 1.5);
  scene.add(key);

  meshes = [];
  roots = [];
  actions = {};
  const infos = [];
  for (const file of files) {
    const gltf = await new GLTFLoader().loadAsync('${GLTF_URL}/' + file + '.glb');
    const root = gltf.scene;
    root.traverse((o) => {
      if (o.isMesh && o.material && o.geometry) {
        o.frustumCulled = false;
        // These glTFs carry no NORMAL attribute, which is why this bake used to lean
        // on flatShading — it derives a normal per fragment from the position
        // derivatives, so it needs none. That is also exactly the faceting: a
        // low-poly cache model shaded per triangle reads as a mesh, not a body. The
        // client shades per vertex, so normals are computed instead — per pose, in
        // bakePose, because the morph tracks carry no MORPH_NORMAL either.
        o.material.flatShading = false;
        o.material.side = THREE.DoubleSide;
        o.material.needsUpdate = true;
        // The rest pose, kept aside: bakePose overwrites the live position attribute.
        o.geometry.userData.basePos = Float32Array.from(o.geometry.attributes.position.array);
        meshes.push(o);
      }
    });
    scene.add(root);
    roots.push(root);

    // The cache's morph tracks export as STEP: a pose is held, then snaps. Sampling
    // exactly on a keyframe gives the same vertices either way, so switching to LINEAR
    // leaves every keyframe bake byte-identical and only adds meaning to the times in
    // between — which is what lets every sheet carry in-betweens (see tweenTimes).
    for (const c of gltf.animations) for (const t of c.tracks) t.setInterpolation(THREE.InterpolateLinear);

    const mixer = new THREE.AnimationMixer(root);
    for (const c of gltf.animations) {
      actions[c.name] = { root, mixer, action: mixer.clipAction(c) };
      infos.push({
        name: c.name,
        duration: c.duration,
        times: Array.from(c.tracks[0] ? c.tracks[0].times : [0]),
      });
    }
  }
  return infos;
};

// Orthographic basis that reproduces the old bake's project(yaw,pitch) exactly
// (mapping cache (X,Yc,Z) -> three (X,-Yc,-Z)). right/up/forward derived so the
// 2D projection is identical: see scripts/bake-enemy-sprites-from-gltf.mjs.
function deriveBasis(yawDeg, pitchDeg, flipY, mirror) {
  const yr = yawDeg * Math.PI / 180, pr = pitchDeg * Math.PI / 180;
  const sy = Math.sin(yr), cy = Math.cos(yr), sp = Math.sin(pr), cp = Math.cos(pr);
  let right = new THREE.Vector3(cy, 0, sy);
  let up = new THREE.Vector3(sp * sy, cp, -sp * cy);
  let f = new THREE.Vector3(cp * sy, -sp, -cp * cy);
  if (flipY) up.multiplyScalar(-1);
  if (mirror) right.multiplyScalar(-1);
  return { right, up, f };
}

// Read every frame's absolute vertex positions (base + morph delta) so the fit
// is shared across all clips, exactly like the old computeFit.
function allFramePositions() {
  const out = [];
  for (const mesh of meshes) {
    const g = mesh.geometry;
    // basePos, not attributes.position: bakePose leaves the attribute holding the
    // last pose it rendered, so only the copy is still the rest pose.
    const base = g.userData.basePos;
    const count = base.length / 3;
    const morphs = g.morphAttributes.position || [];
    const rel = g.morphTargetsRelative !== false;
    const m = mesh.matrixWorld;
    // base (no morph) too
    const frames = morphs.length ? morphs : [null];
    for (const morph of frames) {
      const verts = [];
      for (let i = 0; i < count; i++) {
        let x = base[i * 3], y = base[i * 3 + 1], z = base[i * 3 + 2];
        if (morph) {
          if (rel) { x += morph.getX(i); y += morph.getY(i); z += morph.getZ(i); }
          else { x = morph.getX(i); y = morph.getY(i); z = morph.getZ(i); }
        }
        const v = new THREE.Vector3(x, y, z).applyMatrix4(m);
        verts.push(v);
      }
      out.push(verts);
    }
  }
  return out;
}

function percentile(arr, q) {
  const s = arr.slice().sort((a, b) => a - b);
  const i = Math.min(s.length - 1, Math.max(0, Math.round(q * (s.length - 1))));
  return s[i];
}

// A forceHalf shares one orthographic half-extent across several camera yaws, so a
// model baked from three sides is the same size in all three: without it each view
// fits itself and the sprite grows and shrinks as it turns.
window.setupCamera = (yawDeg, pitchDeg, flipY, mirror, forceHalf) => {
  const { right, up, f } = deriveBasis(yawDeg, pitchDeg, !!flipY, !!mirror);
  const positions = allFramePositions();

  // world bbox center for camera placement + near/far
  const bb = new THREE.Box3();
  for (const verts of positions) for (const v of verts) bb.expandByPoint(v);
  const center = bb.getCenter(new THREE.Vector3());
  const radius = bb.getSize(new THREE.Vector3()).length() / 2 || 100;
  const D = radius * 4;
  const camPos = center.clone().addScaledVector(f, -D);

  // projected extents in camera right/up coords (relative to camPos)
  const rcam = [], ucam = [];
  for (const verts of positions) for (const v of verts) {
    const d = v.clone().sub(camPos);
    rcam.push(right.dot(d)); ucam.push(up.dot(d));
  }
  const TRIM = 0.005;
  const rLo = percentile(rcam, TRIM), rHi = percentile(rcam, 1 - TRIM);
  const uLo = percentile(ucam, TRIM), uHi = percentile(ucam, 1 - TRIM);
  const cR = (rLo + rHi) / 2, cU = (uLo + uHi) / 2;
  const half = forceHalf || Math.max((rHi - rLo) || 1, (uHi - uLo) || 1) / 2 / (1 - 2 * ${MARGIN});

  camera = new THREE.OrthographicCamera(cR - half, cR + half, cU + half, cU - half, 0.01, D * 2);
  camera.position.copy(camPos);
  camera.up.copy(up);
  camera.lookAt(center);
  camera.updateProjectionMatrix();
  return half;
};

// Resolve the pose the mixer just set onto the position attribute, then derive vertex
// normals from it. The morph blend is applied here rather than left to the shader —
// the influences are zeroed afterwards so it is not applied twice — because normals
// can only be computed from real positions, and a smooth normal is the whole point:
// shared vertices average the faces meeting there, so the model rounds off wherever
// the artist meant it to and keeps its hard edges wherever they duplicated a vertex.
function bakePose(mesh) {
  const g = mesh.geometry;
  const base = g.userData.basePos;
  const arr = g.attributes.position.array;
  const morphs = g.morphAttributes.position || [];
  const infl = mesh.morphTargetInfluences || [];
  const rel = g.morphTargetsRelative !== false;
  if (rel) {
    arr.set(base);
  } else {
    let sw = 0;
    for (let m = 0; m < morphs.length; m++) sw += infl[m] || 0;
    for (let i = 0; i < arr.length; i++) arr[i] = base[i] * (1 - sw);
  }
  for (let m = 0; m < morphs.length; m++) {
    const w = infl[m];
    if (!w) continue;
    const ma = morphs[m].array;
    for (let i = 0; i < arr.length; i++) arr[i] += w * ma[i];
    infl[m] = 0;
  }
  g.attributes.position.needsUpdate = true;
  g.computeVertexNormals();
}

// Render one absolute time of a clip's action and return a PNG dataURL.
window.renderAt = (clipName, t) => {
  for (const e of Object.values(actions)) e.action.stop();
  const entry = actions[clipName];
  // Only the mesh this clip was authored on is in the shot — the others are still
  // in the scene (they paid into the shared fit) but must not appear beside it.
  for (const r of roots) r.visible = r === entry.root;
  const act = entry.action;
  act.reset(); act.play(); act.paused = true;
  act.time = Math.max(0, t);
  entry.mixer.update(0);
  for (const mesh of meshes) bakePose(mesh);
  renderer.render(scene, camera);
  return renderer.domElement.toDataURL('image/png');
};

window.__ready = true;
</script></body></html>`;
}

// ----------------------------------------------------------- frame sampling
// The cache's frame timing is wildly uneven: a hill giant changes pose every 60ms, a
// jogre only every 185ms. Held much past 60ms a sprite visibly snaps from pose to pose
// instead of moving, so **every** clip is smoothed the same way — subdivide each
// interval into steps of at most HOLD_MS and let the morph tween fill them. Same cache
// poses, same total duration, just in-betweens between them, and every original
// keyframe time survives in the list. A new enemy gets this for free.
//
// The exception is a rest. OSRS says "and now lie there dead" by holding the
// second-to-last pose for four hundred *seconds*; nothing is moving across a gap like
// that. So a span longer than REST_MS stays one frame — which is both correct and what
// stops a death clip from exploding into thousands of identical frames.
const HOLD_MS = 60;
const REST_MS = 300;
// Room for the smoothed count so sampleIndices never has to thin a clip back down:
// evenly-spaced index sampling over unevenly-spaced times would distort the timing. The
// longest clip in the roster is vorkath/death at 99 smoothed frames, so this is headroom,
// not a budget — raise it rather than let a new enemy get resampled.
const SMOOTH_MAX_FRAMES = 120;

function tweenTimes(times, duration, capMs = HOLD_MS, restMs = REST_MS) {
  const out = [];
  for (let i = 0; i < times.length; i++) {
    const t = times[i];
    const span = (i + 1 < times.length ? times[i + 1] : duration) - t;
    // the 1e-6 keeps a span of exactly capMs at one step (0.06 * 1000 / 60 > 1 in floats)
    const steps = span * 1000 > restMs ? 1 : Math.max(1, Math.ceil((span * 1000) / capMs - 1e-6));
    for (let s = 0; s < steps; s++) out.push(t + (span * s) / steps);
  }
  return out;
}

function sampleIndices(len, maxFrames) {
  if (len <= maxFrames) return Array.from({ length: len }, (_, i) => i);
  const out = [];
  for (let i = 0; i < maxFrames; i++) out.push(Math.round((i * (len - 1)) / (maxFrames - 1)));
  return out;
}

/** Box-filter one supersampled frame down to its final cell, averaging in
 *  premultiplied alpha so a translucent edge does not pull black in with it. */
function boxDown(src, cell, ss) {
  if (ss === 1) return src;
  const out = new Uint8Array(cell * cell * 4);
  const n = ss * ss, w = cell * ss;
  for (let y = 0; y < cell; y++) {
    for (let x = 0; x < cell; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let dy = 0; dy < ss; dy++) {
        for (let dx = 0; dx < ss; dx++) {
          const i = ((y * ss + dy) * w + x * ss + dx) * 4;
          const al = src[i + 3];
          r += src[i] * al; g += src[i + 1] * al; b += src[i + 2] * al; a += al;
        }
      }
      const d = (y * cell + x) * 4;
      out[d] = a ? Math.round(r / a) : 0;
      out[d + 1] = a ? Math.round(g / a) : 0;
      out[d + 2] = a ? Math.round(b / a) : 0;
      out[d + 3] = Math.round(a / n);
    }
  }
  return out;
}

function dataUrlToRgba(dataUrl) {
  const b64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  return PNG.sync.read(Buffer.from(b64, 'base64'));
}

/**
 * Bake every clip of one camera setup into `outDir`, named `<prefix><clip>.png`.
 * A single-view group passes no prefix; a multi-view one (the diversions, which turn
 * to face the way they walk) calls this once per yaw with `front-`/`side-`/`back-`.
 */
async function bakeClips(page, { slug, cfg, clipInfo, src, wantClips, outDir, cell, prefix = '' }) {
  const out = {};
  for (const name of wantClips) {
    const info = clipInfo.find((c) => c.name === name);
    const times = tweenTimes(info.times, info.duration);
    const idxs = sampleIndices(times.length, Math.max(cfg.maxFrames, SMOOTH_MAX_FRAMES));
    const rendered = [];
    const rawMs = [];
    for (let fi = 0; fi < idxs.length; fi++) {
      const t = times[idxs[fi]];
      const dataUrl = await page.evaluate((n, tt) => window.renderAt(n, tt), name, t);
      rendered.push(boxDown(Uint8Array.from(dataUrlToRgba(dataUrl).data), cell, SS));
      // A pose is *reached* at its keyframe time and belongs to the span that ENDS
      // there: the exporter stacks the cache frame lengths, so times[i] is frame i's
      // end, not its start. Pairing a pose with the span that follows it dates every
      // duration one frame late — invisible at 60ms, ruinous at the end of a death,
      // where OSRS says "now lie there" by holding the settled corpse for four
      // hundred seconds: that hold landed on the mid-fall pose before it, which froze
      // in the air while the corpse flashed past in 20ms.
      const prev = fi > 0 ? times[idxs[fi - 1]] : 0;
      rawMs.push(Math.max(20, Math.round((t - prev) * 1000)) || 60);
    }
    // The cache's keyframes run on past the motion, so a one-shot ends holding a
    // pose nobody needs to watch (see scripts/lib/clip-tail.mjs).
    const cut = trimTail(rendered, rawMs, !!cfg.loop[name]);
    const frames = cut.frames.length;
    const frameMs = cut.frameMs;
    const sheet = new PNG({ width: cell * frames, height: cell });
    cut.frames.forEach((buf, fi) => {
      for (let y = 0; y < cell; y++) {
        sheet.data.set(buf.subarray(y * cell * 4, (y + 1) * cell * 4), (y * sheet.width + fi * cell) * 4);
      }
    });
    writeFileSync(join(outDir, `${prefix}${name}.png`), PNG.sync.write(sheet));
    out[name] = { anim: src[name].anim, frames, frameMs, loop: !!cfg.loop[name] };
    console.log(`  ✓ ${slug}/${prefix}${name}.png  (${frames} frames${cut.dropped ? `, tail -${cut.dropped}` : ''})`);
  }
  return out;
}

/**
 * Which slugs are bosses, read straight out of `data/enemies.ts`.
 *
 * The stat table is the one place that decides it (`isBoss`), and it is also what
 * makes the renderer draw them at twice the size — so re-deriving the list here beats
 * a second copy in the bake config that can quietly drift out of step. A group with no
 * matching entry (the diversions) simply gets none.
 */
function readBossSlugs() {
  const src = readFileSync(join(REPO, 'lib', 'game', 'data', 'enemies.ts'), 'utf8');
  const out = new Set();
  const re = /^ {2}([a-z_0-9]+):\s*\{([\s\S]*?)^ {2}\},/gm;
  let m;
  while ((m = re.exec(src))) if (/isBoss:\s*true/.test(m[2])) out.add(m[1]);
  return out;
}

async function main() {
  if (!existsSync(GLTF_DIR)) { console.error(`No models at ${GLTF_DIR}. Run export-enemy-gltf.mjs first.`); process.exit(1); }
  const onlyIdx = process.argv.indexOf('--only');
  // --only takes one slug or a comma-separated list.
  const only = onlyIdx !== -1 ? process.argv[onlyIdx + 1].split(',').map((x) => x.trim()) : null;
  const config = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
  const bosses = readBossSlugs();

  // static server: harness + three + model assets
  const server = createServer((req, res) => {
    const url = decodeURIComponent(req.url.split('?')[0]);
    if (url === '/' || url === '/index.html') { res.setHeader('content-type', 'text/html'); res.end(harnessHtml()); return; }
    // Chrome asks for this unprompted; without an answer it lands in pageErrors and
    // every bake ends with a bogus "404 (Not Found)" warning.
    if (url === '/favicon.ico') { res.statusCode = 204; res.end(); return; }
    if (url.startsWith('/vendor/addons/')) return serveFile(res, join(THREE_DIR, 'examples', 'jsm', url.slice('/vendor/addons/'.length)));
    if (url.startsWith('/vendor/')) return serveFile(res, join(THREE_DIR, 'build', url.slice('/vendor/'.length)));
    if (url.startsWith('/assets/')) return serveFile(res, join(PUBLIC, url));
    res.statusCode = 404; res.end('nf');
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const origin = `http://127.0.0.1:${port}`;

  const browser = await launchBrowser({ args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') pageErrors.push(m.text()); });
  page.on('requestfailed', (r) => pageErrors.push(`reqfail ${r.url()} ${r.failure()?.errorText}`));
  await page.goto(origin, { waitUntil: 'load' });
  try {
    await page.waitForFunction('window.__ready === true', { timeout: 30000 });
  } catch {
    console.error('Harness never became ready. Page errors:\n' + (pageErrors.join('\n') || '(none captured)'));
    await browser.close(); server.close(); process.exit(1);
  }

  const entries = Object.entries(config).filter(([slug]) => !only || only.includes(slug));
  for (const [slug, cfgIn] of entries) {
    const cfg = { ...TARGET_DEFAULTS, ...cfgIn, loop: { ...TARGET_DEFAULTS.loop, ...(cfgIn.loop ?? {}) } };
    // The enemy's own mesh carries every ordinary clip; a clip posed on a borrowed
    // model has a file to itself, and the harness loads them all into one scene.
    const src = Object.fromEntries(Object.entries(cfg.anims).map(([n, v]) => [n, clipSource(v)]));
    const files = [];
    if (Object.entries(cfg.anims).some(([, v]) => !isAltModel(v))) files.push(slug);
    for (const [n, v] of Object.entries(cfg.anims)) if (isAltModel(v)) files.push(altGltfName(slug, n));
    const have = files.filter((f) => existsSync(join(GLTF_DIR, `${f}.glb`)));
    if (!have.length) { console.warn(`! ${slug}: no model`); continue; }
    for (const f of files) if (!have.includes(f)) console.warn(`! ${slug}: missing ${f}.glb — re-run export:enemy-gltf`);

    let clipInfo;
    try {
      clipInfo = await page.evaluate((fs) => window.loadEnemy(fs), have);
    } catch (e) { console.warn(`! ${slug}: load failed — ${e.message}`); continue; }

    const outDir = join(REPO, ...GROUP.spriteDir, slug);
    mkdirSync(outDir, { recursive: true });
    const cell = cfg.cell ?? (bosses.has(slug) ? BOSS_SIZE : SIZE);
    await page.evaluate((px) => window.setCell(px), cell);
    const manifest = { npc: cfg.npc, frameW: cell, frameH: cell };
    const wantClips = Object.keys(cfg.anims).filter((name) => clipInfo.some((c) => c.name === name));
    const job = { slug, cfg, clipInfo, src, wantClips, outDir, cell };
    const aim = (yaw, half) =>
      page.evaluate((y, pt, fy, mi, h) => window.setupCamera(y, pt, fy, mi, h), yaw, cfg.pitch, !!cfg.flipY, !!cfg.mirror, half);

    if (!GROUP.views) {
      await aim(cfg.yaw, 0);
      manifest.clips = await bakeClips(page, job);
      writeFileSync(join(outDir, `${slug}.json`), JSON.stringify(manifest, null, 2));
      console.log(`✓ ${slug}: ${Object.keys(manifest.clips).length} clips`);
      continue;
    }

    // Multi-view: measure every yaw first and bake them all at the widest fit, so
    // turning round never changes the model's size on the board.
    let half = 0;
    for (const yaw of Object.values(GROUP.views)) half = Math.max(half, await aim(yaw, 0));
    manifest.views = {};
    for (const [view, yaw] of Object.entries(GROUP.views)) {
      await aim(yaw, half);
      manifest.views[view] = await bakeClips(page, { ...job, prefix: `${view}-` });
    }
    writeFileSync(join(outDir, `${slug}.json`), JSON.stringify(manifest, null, 2));
    console.log(`✓ ${slug}: ${Object.keys(manifest.views).length} views × ${wantClips.length} clips`);
  }

  if (pageErrors.length) console.warn(`(page warnings: ${pageErrors.slice(0, 4).join(' | ')})`);
  await browser.close();
  server.close();
  process.exit(0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
