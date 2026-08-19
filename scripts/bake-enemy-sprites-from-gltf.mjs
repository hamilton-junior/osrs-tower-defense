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
 *  - The glTF base+morph vertices are the cache frames in (X,-Y,-Z) space.
 *  - We render with an ORTHOGRAPHIC camera whose basis is derived to reproduce
 *    exactly the old bake's yaw/pitch projection (see deriveBasis below), so the
 *    creature faces RIGHT at the same 3/4 angle and the same shared fit — but now
 *    a true per-pixel depth buffer (no painter's-sort detached parts) and the
 *    viewer's lighting/flat-shading.
 *
 * Needs: a Chromium browser (Edge is auto-detected on Windows) driven by
 * puppeteer-core, and the exported glTFs in public/assets/enemies-gltf/
 * (scripts/export-enemy-gltf.mjs). Build-time/offline only.
 */
import { createServer } from 'node:http';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, extname } from 'node:path';
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import puppeteer from 'puppeteer-core';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, '..');
const PUBLIC = join(REPO, 'public');
const THREE_DIR = join(REPO, 'node_modules', 'three');
const CONFIG_PATH = join(__dirname, 'enemy-anims.config.json');
const GLTF_DIR = join(PUBLIC, 'assets', 'enemies-gltf');

const SIZE = 128;                 // per-frame canvas (matches the old bake)
const MARGIN = 0.06;              // same framing margin as computeFit
const TARGET_DEFAULTS = { yaw: 50, pitch: 6, maxFrames: 24, mirror: false, flipY: false, loop: { walk: true } };

// ---------------------------------------------------------------- browser find
function findBrowser() {
  const candidates = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  ].filter(Boolean);
  for (const c of candidates) if (existsSync(c)) return c;
  throw new Error('No Chromium browser found. Set PUPPETEER_EXECUTABLE_PATH.');
}

// ------------------------------------------------------------- static file map
const MIME = { '.js': 'text/javascript', '.gltf': 'model/gltf+json', '.bin': 'application/octet-stream', '.png': 'image/png', '.html': 'text/html' };
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

const SIZE = ${SIZE};
let renderer, scene, camera, mixer, root, gltf, actions, meshes;

renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(SIZE, SIZE);
renderer.setClearColor(0x000000, 0);
document.body.appendChild(renderer.domElement);

window.loadEnemy = async (slug) => {
  if (root) { scene.remove(root); }
  scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x3a3a3a, 1.15));
  const key = new THREE.DirectionalLight(0xffffff, 0.65);
  key.position.set(1, 2, 1.5);
  scene.add(key);

  gltf = await new GLTFLoader().loadAsync('/assets/enemies-gltf/' + slug + '.gltf');
  root = gltf.scene;
  meshes = [];
  root.traverse((o) => {
    if (o.isMesh && o.material && o.geometry) {
      o.frustumCulled = false;
      o.material.flatShading = true;
      o.material.side = THREE.DoubleSide;
      o.material.needsUpdate = true;
      meshes.push(o);
    }
  });
  scene.add(root);

  mixer = new THREE.AnimationMixer(root);
  actions = {};
  for (const c of gltf.animations) actions[c.name] = mixer.clipAction(c);

  return gltf.animations.map((c) => ({
    name: c.name,
    duration: c.duration,
    times: Array.from(c.tracks[0] ? c.tracks[0].times : [0]),
  }));
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
    const base = g.attributes.position;
    const morphs = g.morphAttributes.position || [];
    const rel = g.morphTargetsRelative !== false;
    const m = mesh.matrixWorld;
    // base (no morph) too
    const frames = morphs.length ? morphs : [null];
    for (const morph of frames) {
      const verts = [];
      for (let i = 0; i < base.count; i++) {
        let x = base.getX(i), y = base.getY(i), z = base.getZ(i);
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

window.setupCamera = (yawDeg, pitchDeg, flipY, mirror) => {
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
  const half = Math.max((rHi - rLo) || 1, (uHi - uLo) || 1) / 2 / (1 - 2 * ${MARGIN});

  camera = new THREE.OrthographicCamera(cR - half, cR + half, cU + half, cU - half, 0.01, D * 2);
  camera.position.copy(camPos);
  camera.up.copy(up);
  camera.lookAt(center);
  camera.updateProjectionMatrix();
};

// Render one absolute time of a clip's action and return a PNG dataURL.
window.renderAt = (clipName, t) => {
  for (const a of Object.values(actions)) { a.stop(); }
  const act = actions[clipName];
  act.reset(); act.play(); act.paused = true;
  act.time = Math.max(0, t);
  mixer.update(0);
  renderer.render(scene, camera);
  return renderer.domElement.toDataURL('image/png');
};

window.__ready = true;
</script></body></html>`;
}

// ----------------------------------------------------------- frame sampling
function sampleIndices(len, maxFrames) {
  if (len <= maxFrames) return Array.from({ length: len }, (_, i) => i);
  const out = [];
  for (let i = 0; i < maxFrames; i++) out.push(Math.round((i * (len - 1)) / (maxFrames - 1)));
  return out;
}

function dataUrlToRgba(dataUrl) {
  const b64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  return PNG.sync.read(Buffer.from(b64, 'base64'));
}

async function main() {
  if (!existsSync(GLTF_DIR)) { console.error(`No glTFs at ${GLTF_DIR}. Run export-enemy-gltf.mjs first.`); process.exit(1); }
  const onlyIdx = process.argv.indexOf('--only');
  const only = onlyIdx !== -1 ? process.argv[onlyIdx + 1] : null;
  const config = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));

  // static server: harness + three + glTF assets
  const server = createServer((req, res) => {
    const url = decodeURIComponent(req.url.split('?')[0]);
    if (url === '/' || url === '/index.html') { res.setHeader('content-type', 'text/html'); res.end(harnessHtml()); return; }
    if (url.startsWith('/vendor/addons/')) return serveFile(res, join(THREE_DIR, 'examples', 'jsm', url.slice('/vendor/addons/'.length)));
    if (url.startsWith('/vendor/')) return serveFile(res, join(THREE_DIR, 'build', url.slice('/vendor/'.length)));
    if (url.startsWith('/assets/')) return serveFile(res, join(PUBLIC, url));
    res.statusCode = 404; res.end('nf');
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const origin = `http://127.0.0.1:${port}`;

  const browser = await puppeteer.launch({
    executablePath: findBrowser(),
    headless: true,
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'],
  });
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

  const entries = Object.entries(config).filter(([slug]) => !only || slug === only);
  for (const [slug, cfgIn] of entries) {
    const cfg = { ...TARGET_DEFAULTS, ...cfgIn, loop: { ...TARGET_DEFAULTS.loop, ...(cfgIn.loop ?? {}) } };
    if (!existsSync(join(GLTF_DIR, `${slug}.gltf`))) { console.warn(`! ${slug}: no glTF`); continue; }

    let clipInfo;
    try {
      clipInfo = await page.evaluate((s) => window.loadEnemy(s), slug);
    } catch (e) { console.warn(`! ${slug}: load failed — ${e.message}`); continue; }
    await page.evaluate((y, p, fy, mi) => window.setupCamera(y, p, fy, mi), cfg.yaw, cfg.pitch, !!cfg.flipY, !!cfg.mirror);

    const outDir = join(PUBLIC, 'assets', 'enemies', slug);
    mkdirSync(outDir, { recursive: true });
    const manifest = { npc: cfg.npc, frameW: SIZE, frameH: SIZE, clips: {} };
    const wantClips = Object.keys(cfg.anims).filter((name) => clipInfo.some((c) => c.name === name));

    for (const name of wantClips) {
      const info = clipInfo.find((c) => c.name === name);
      const times = info.times;
      const idxs = sampleIndices(times.length, cfg.maxFrames);
      const frames = idxs.length;
      const sheet = new PNG({ width: SIZE * frames, height: SIZE });
      const frameMs = [];
      for (let fi = 0; fi < frames; fi++) {
        const k = idxs[fi];
        const t = times[k];
        const dataUrl = await page.evaluate((n, tt) => window.renderAt(n, tt), name, t);
        const img = dataUrlToRgba(dataUrl);
        for (let y = 0; y < SIZE; y++) {
          for (let x = 0; x < SIZE; x++) {
            const src = (y * SIZE + x) * 4;
            const dst = (y * (SIZE * frames) + fi * SIZE + x) * 4;
            sheet.data[dst] = img.data[src];
            sheet.data[dst + 1] = img.data[src + 1];
            sheet.data[dst + 2] = img.data[src + 2];
            sheet.data[dst + 3] = img.data[src + 3];
          }
        }
        const next = fi + 1 < frames ? times[idxs[fi + 1]] : info.duration;
        frameMs.push(Math.max(20, Math.round((next - t) * 1000)) || 60);
      }
      writeFileSync(join(outDir, `${name}.png`), PNG.sync.write(sheet));
      manifest.clips[name] = { anim: cfg.anims[name], frames, frameMs, loop: !!cfg.loop[name] };
      console.log(`  ✓ ${slug}/${name}.png  (${frames} frames)`);
    }

    writeFileSync(join(outDir, `${slug}.json`), JSON.stringify(manifest, null, 2));
    console.log(`✓ ${slug}: ${Object.keys(manifest.clips).length} clips`);
  }

  if (pageErrors.length) console.warn(`(page warnings: ${pageErrors.slice(0, 4).join(' | ')})`);
  await browser.close();
  server.close();
  process.exit(0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
