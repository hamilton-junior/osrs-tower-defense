'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Live 3D enemy viewer. Loads the build-time glTF (exported via the cache lib's
 * own GLTFExporter — the authoritative, tested model+animation path) and plays it
 * with three.js: real WebGL z-buffer, real morph-target animation, free orbit.
 * This is the trustworthy reference — no hand-rolled rasteriser, no sign/order
 * guessing. three is dynamically imported so it stays out of the main bundle.
 */
const BASE = process.env.NEXT_PUBLIC_BASE_PATH || '';

type Api = {
  renderer: { dispose(): void; domElement: HTMLCanvasElement; render(s: unknown, c: unknown): void; setSize(w: number, h: number): void; setPixelRatio(n: number): void };
  scene: unknown;
  camera: { aspect: number; updateProjectionMatrix(): void };
  controls: { update(): void; dispose(): void; target: { copy(v: unknown): void } };
  mixer: { update(dt: number): void; setTime(t: number): void };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  actions: Record<string, any>;
  clock: { getDelta(): number };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  current: any;
};

export function EnemyModelViewer({ slug, initialClip }: { slug: string; initialClip?: string }) {
  const mountRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<Api | null>(null);
  const playingRef = useRef(true);
  const [clips, setClips] = useState<string[]>([]);
  const [clip, setClip] = useState(initialClip ?? 'walk');
  const [playing, setPlaying] = useState(true);
  const [dur, setDur] = useState(0);
  const [time, setTime] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Build the scene whenever the enemy changes.
  useEffect(() => {
    let disposed = false;
    let raf = 0;
    const mount = mountRef.current;
    if (!mount) return;
    setLoading(true);
    setErr(null);

    (async () => {
      const THREE = await import('three');
      const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
      const { OrbitControls } = await import('three/examples/jsm/controls/OrbitControls.js');
      if (disposed) return;

      const w = mount.clientWidth || 360;
      const h = mount.clientHeight || 360;
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(w, h);
      mount.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      scene.add(new THREE.HemisphereLight(0xffffff, 0x3a3a3a, 1.15));
      const key = new THREE.DirectionalLight(0xffffff, 0.65);
      key.position.set(1, 2, 1.5);
      scene.add(key);

      const camera = new THREE.PerspectiveCamera(45, w / h, 1, 100000);
      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enablePan = false;
      controls.enableDamping = true;

      const url = `${BASE}/assets/enemies-gltf/${slug}.gltf`;
      let gltf;
      try {
        gltf = await new GLTFLoader().loadAsync(url);
      } catch (e) {
        if (!disposed) { setErr('Falha ao carregar modelo'); setLoading(false); }
        renderer.dispose();
        renderer.domElement.remove();
        return;
      }
      if (disposed) { renderer.dispose(); return; }

      const root = gltf.scene;
      root.traverse((o) => {
        const mesh = o as unknown as { isMesh?: boolean; frustumCulled?: boolean; material?: { flatShading: boolean; side: number; needsUpdate: boolean } };
        if (mesh.isMesh && mesh.material) {
          mesh.frustumCulled = false; // morphs can expand bounds
          mesh.material.flatShading = true; // correct shading under morph (screen-space normals)
          mesh.material.side = THREE.DoubleSide;
          mesh.material.needsUpdate = true;
        }
      });
      scene.add(root);

      // Frame the camera to the model's bounds.
      const box = new THREE.Box3().setFromObject(root);
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z) || 100;
      camera.near = maxDim / 100;
      camera.far = maxDim * 100;
      camera.position.set(center.x + maxDim * 0.15, center.y + maxDim * 0.05, center.z + maxDim * 1.9);
      camera.updateProjectionMatrix();
      controls.target.copy(center);
      controls.update();

      const mixer = new THREE.AnimationMixer(root);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const actions: Record<string, any> = {};
      for (const c of gltf.animations) actions[c.name] = mixer.clipAction(c);

      apiRef.current = {
        renderer: renderer as unknown as Api['renderer'],
        scene, camera: camera as unknown as Api['camera'],
        controls: controls as unknown as Api['controls'],
        mixer: mixer as unknown as Api['mixer'],
        actions, clock: new THREE.Clock(), current: null,
      };
      setClips(gltf.animations.map((c) => c.name));
      setLoading(false);

      let acc = 0;
      const loop = () => {
        raf = requestAnimationFrame(loop);
        const api = apiRef.current;
        if (!api) return;
        const dt = api.clock.getDelta();
        if (playingRef.current && api.current) {
          api.mixer.update(dt);
          acc += dt;
          if (acc > 0.06) { // throttle the scrub readout to ~15fps
            acc = 0;
            const c = api.current;
            setTime(c.time % (c.getClip().duration || 1));
          }
        }
        (controls as unknown as { update(): void }).update();
        (renderer as unknown as { render(s: unknown, c: unknown): void }).render(scene, camera);
      };
      loop();
    })();

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      const api = apiRef.current;
      if (api) {
        api.controls.dispose();
        api.renderer.dispose();
        api.renderer.domElement.remove();
      }
      apiRef.current = null;
    };
  }, [slug]);

  // Switch the active clip (also runs once clips finish loading).
  useEffect(() => {
    const api = apiRef.current;
    if (!api) return;
    const act = api.actions[clip] ?? api.actions[clips[0]];
    if (!act) return;
    Object.values(api.actions).forEach((a) => a.stop());
    act.reset();
    act.play();
    act.paused = !playingRef.current;
    api.current = act;
    setDur(act.getClip().duration);
    setTime(0);
  }, [clip, clips]);

  // Play / pause.
  useEffect(() => {
    playingRef.current = playing;
    const api = apiRef.current;
    if (api?.current) api.current.paused = !playing;
  }, [playing]);

  const scrub = (v: number) => {
    const api = apiRef.current;
    if (!api?.current) return;
    setPlaying(false);
    playingRef.current = false;
    api.current.paused = true;
    api.current.time = v;
    api.mixer.update(0);
    setTime(v);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
      <div
        ref={mountRef}
        style={{ width: '100%', aspectRatio: '1 / 1', background: 'rgba(0,0,0,0.35)', borderRadius: 6, position: 'relative', cursor: 'grab' }}
      >
        {loading && !err && (
          <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: '#caa86a', fontFamily: 'var(--font-osrs)' }}>
            Carregando modelo 3D…
          </div>
        )}
        {err && (
          <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: '#d66', fontFamily: 'var(--font-osrs)' }}>
            {err}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
        {clips.map((c) => (
          <button
            key={c}
            onClick={() => setClip(c)}
            className="osrs-button"
            style={{ padding: '2px 8px', fontSize: 12, opacity: c === clip ? 1 : 0.6, textTransform: 'capitalize' }}
          >
            {c}
          </button>
        ))}
        <button onClick={() => setPlaying((p) => !p)} className="osrs-button" style={{ padding: '2px 10px', fontSize: 12 }}>
          {playing ? '⏸' : '▶'}
        </button>
      </div>

      <input
        type="range"
        min={0}
        max={dur || 1}
        step={0.001}
        value={time}
        onChange={(e) => scrub(Number(e.target.value))}
        style={{ width: '100%' }}
      />
      <div style={{ fontSize: 11, color: '#9a8a6a', textAlign: 'center', fontFamily: 'var(--font-osrs)' }}>
        arraste p/ girar · {time.toFixed(2)}s / {dur.toFixed(2)}s
      </div>
    </div>
  );
}
