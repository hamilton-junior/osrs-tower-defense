'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { GameEngine } from '@/lib/game/core/engine';
import { ENEMY_ANIMS, clipFrame, clipDurationS, type EnemyAnimSet } from '@/lib/game/data/enemy-anims';
import { ENEMIES } from '@/lib/game/data/enemies';
import { MovablePanel } from './MovablePanel';
import { EnemyModelViewer } from './EnemyModelViewer';
import type { EnemyType } from '@/lib/game/types';

const CLIP_NAMES = ['walk', 'hurt', 'death'] as const;
type ClipName = (typeof CLIP_NAMES)[number];

/** Plays a single baked clip on a loop in a small canvas. One-shot clips
 *  (hurt/death) replay after a short pause so the preview never freezes. */
function AnimPreview({ set, clipName, size = 112 }: { set: EnemyAnimSet; clipName: ClipName; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const clip = set.clips[clipName];

  useEffect(() => {
    if (!clip) return;
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const img = new Image();
    img.src = clip.url;
    const dur = clipDurationS(clip);
    const cycle = clip.loop ? dur : dur + 0.5; // one-shots: hold-then-restart
    let start = performance.now();
    let raf = 0;
    let stopped = false;
    const draw = () => {
      if (stopped) return;
      const elapsed = (performance.now() - start) / 1000;
      const t = clip.loop ? elapsed : Math.min(elapsed % cycle, dur);
      const fi = clipFrame(clip, t);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.imageSmoothingEnabled = false;
      if (img.complete && img.naturalWidth) {
        ctx.drawImage(img, fi * set.frameW, 0, set.frameW, set.frameH, 0, 0, canvas.width, canvas.height);
      }
      raf = requestAnimationFrame(draw);
    };
    img.onload = () => { start = performance.now(); };
    raf = requestAnimationFrame(draw);
    return () => { stopped = true; cancelAnimationFrame(raf); };
  }, [clip, set.frameW, set.frameH]);

  if (!clip) return null;
  return (
    <canvas
      ref={ref}
      width={size}
      height={size}
      className="bg-[#1a1712] rounded-[3px] border border-[#3a2f1d]"
      // Baked clips face RIGHT (canonical space) — same as the map default
      // (enemies travel rightward), so no mirror here.
      style={{ imageRendering: 'pixelated' }}
    />
  );
}

/** Enlarged single-clip viewer with play/pause + a frame scrubber. Used by the
 *  bestiary's lightbox so a clip can be stepped frame-by-frame. */
function AnimViewer({ set, clipName, size = 320 }: { set: EnemyAnimSet; clipName: ClipName; size?: number }) {
  const clip = set.clips[clipName]!;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [playing, setPlaying] = useState(true);
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    const img = new Image();
    img.onload = () => { imgRef.current = img; setLoaded(true); };
    img.src = clip.url;
    imgRef.current = img;
    setLoaded(img.complete && img.naturalWidth > 0);
    return () => { imgRef.current = null; };
  }, [clip.url]);

  // Playback: advance the frame index on each clip's own per-frame timing.
  useEffect(() => {
    if (!playing || !loaded) return;
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    const loop = () => {
      const now = performance.now();
      acc += now - last;
      last = now;
      setFrame((f) => {
        let nf = f;
        let guard = 0;
        while (acc >= (clip.frameMs[nf] || 60) && guard++ < clip.frames) { acc -= clip.frameMs[nf] || 60; nf = (nf + 1) % clip.frames; }
        return nf;
      });
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playing, loaded, clip]);

  // Draw the current frame whenever it (or the image) changes.
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    const img = imgRef.current;
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = false;
    if (img && img.complete && img.naturalWidth) {
      ctx.drawImage(img, frame * set.frameW, 0, set.frameW, set.frameH, 0, 0, canvas.width, canvas.height);
    }
  }, [frame, loaded, set.frameW, set.frameH]);

  const step = (d: number) => { setPlaying(false); setFrame((f) => (f + d + clip.frames) % clip.frames); };

  return (
    <div className="flex flex-col items-center gap-[0.5em]">
      <canvas
        ref={canvasRef}
        width={size}
        height={size}
        className="bg-[#15120d] rounded-[3px] border border-[#3a2f1d]"
        style={{ imageRendering: 'pixelated' }}
      />
      <div className="flex items-center gap-[0.5em] w-full">
        <button onClick={() => setPlaying((p) => !p)} className="rs-btn px-[0.6em] py-[0.2em] text-[0.8em]" title={playing ? 'Pause' : 'Play'}>
          {playing ? '❚❚' : '▶'}
        </button>
        <button onClick={() => step(-1)} className="rs-btn px-[0.5em] py-[0.2em] text-[0.8em]" title="Previous frame">◀</button>
        <input
          type="range"
          min={0}
          max={clip.frames - 1}
          value={frame}
          onChange={(e) => { setPlaying(false); setFrame(Number(e.target.value)); }}
          className="rs-volume flex-1"
          aria-label="Frame"
        />
        <button onClick={() => step(1)} className="rs-btn px-[0.5em] py-[0.2em] text-[0.8em]" title="Next frame">▶</button>
        <span className="text-[0.72em] text-osrs-yellow tabular-nums w-[3.2em] text-right">{frame + 1}/{clip.frames}</span>
      </div>
    </div>
  );
}

function NumberRow({ label, value, onCommit, min = 0 }: {
  label: string; value: number; onCommit: (n: number) => void; min?: number;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => { setDraft(String(value)); }, [value]);
  const commit = () => { const n = Number(draft); if (Number.isFinite(n)) onCommit(Math.max(min, Math.floor(n))); };
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[#cdbe91] text-[0.85em]">{label}</span>
      <span className="flex items-center gap-1">
        <input
          type="number"
          value={draft}
          min={min}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') commit(); }}
          className="w-[5.5em] bg-[#1a1712] border border-[#3a2f1d] rounded-[3px] px-[0.4em] py-[0.15em] text-osrs-yellow text-right text-[0.85em] outline-none focus:border-osrs-orange"
        />
        <button onClick={commit} className="rs-btn px-[0.5em] py-[0.2em] text-[0.75em]">Set</button>
      </span>
    </div>
  );
}

/** In-game debug + bestiary panel. Two tabs: "Cheats" (set wave/gold/lives,
 *  spawn a custom wave, clear the field) and "Bestiary" (a model viewer that
 *  plays each enemy's baked walk/hurt/death clips off-wave, with its stats). */
export function DebugPanel({ engineRef, ui, onClose, globalLock }: {
  engineRef: React.RefObject<GameEngine | null>;
  ui: { wave: number; money: number; lives: number; maxLives: number; waveActive: boolean };
  onClose: () => void;
  globalLock: boolean;
}) {
  const [tab, setTab] = useState<'cheats' | 'bestiary'>('cheats');

  // --- custom-wave builder state ---
  const allEnemies = useMemo(() => Object.keys(ENEMIES) as EnemyType[], []);
  const [picked, setPicked] = useState<Set<EnemyType>>(new Set());
  const [countEach, setCountEach] = useState(5);
  const togglePick = (t: EnemyType) =>
    setPicked((prev) => { const n = new Set(prev); n.has(t) ? n.delete(t) : n.add(t); return n; });

  // --- bestiary state ---
  const animated = useMemo(() => Object.keys(ENEMY_ANIMS) as EnemyType[], []);
  const [viewing, setViewing] = useState<EnemyType>(animated[0]);
  const [expanded, setExpanded] = useState<ClipName | null>(null);
  const [lightboxMode, setLightboxMode] = useState<'3d' | 'sprite'>('3d');
  const set = ENEMY_ANIMS[viewing];
  const def = ENEMIES[viewing];

  return (
    <>
    <MovablePanel
      id="debug"
      globalLock={globalLock}
      className="rs-panel absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 p-3 z-30 w-[26em] max-h-[86vh] overflow-y-auto"
      style={{ fontSize: 'clamp(13px, 0.9vw, 18px)' }}
    >
      <div className="rs-panel-title flex items-center justify-between">
        <span className="flex items-center gap-2">🛠 Debug</span>
        <button onClick={onClose} title="Close" className="rs-btn px-[0.5em] py-0 text-[0.8em]">✕</button>
      </div>

      <div className="grid grid-cols-2 gap-[0.3em] my-[0.6em]">
        {(['cheats', 'bestiary'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rs-btn py-[0.3em] text-[0.8em] capitalize ${tab === t ? 'rs-btn-primary' : ''}`}
          >
            {t === 'cheats' ? 'Cheats' : 'Bestiary'}
          </button>
        ))}
      </div>

      {tab === 'cheats' && (
        <div className="space-y-[0.5em]">
          <div className="rs-panel-inset p-[0.5em] space-y-[0.4em]">
            <NumberRow label="Wave" value={ui.wave} min={1} onCommit={(n) => engineRef.current?.debugSetWave(n)} />
            <NumberRow label="Gold" value={ui.money} onCommit={(n) => engineRef.current?.debugSetGold(n)} />
            <NumberRow label="Lives" value={ui.lives} onCommit={(n) => engineRef.current?.debugSetLives(n)} />
            {ui.waveActive && <p className="text-[0.66em] text-[#b3a585]">Wave editing is locked mid-wave.</p>}
          </div>

          <div className="rs-panel-inset p-[0.5em]">
            <div className="text-[0.72em] text-osrs-orange uppercase tracking-wide mb-[0.4em]">Custom wave</div>
            <div className="flex flex-wrap gap-[0.25em] max-h-[9em] overflow-y-auto mb-[0.5em]">
              {allEnemies.map((t) => {
                const on = picked.has(t);
                return (
                  <button
                    key={t}
                    onClick={() => togglePick(t)}
                    title={ENEMIES[t].name}
                    className={`px-[0.4em] py-[0.15em] rounded-[3px] border text-[0.66em] capitalize ${on ? 'border-osrs-orange bg-osrs-orange/20 text-osrs-yellow' : 'border-[#3a2f1d] text-[#cdbe91] hover:border-[#6b5836]'}`}
                  >
                    {ENEMIES[t].name}
                  </button>
                );
              })}
            </div>
            <div className="flex items-center justify-between gap-2 mb-[0.5em]">
              <NumberRow label="Count each" value={countEach} min={1} onCommit={setCountEach} />
            </div>
            <div className="flex gap-[0.4em]">
              <button
                disabled={ui.waveActive || picked.size === 0}
                onClick={() => engineRef.current?.debugStartCustomWave([...picked], countEach)}
                className="rs-btn rs-btn-primary flex-1 py-[0.35em] text-[0.78em] disabled:opacity-50"
              >
                ▶ Spawn ({picked.size > 0 ? picked.size * countEach : 0})
              </button>
              <button onClick={() => setPicked(new Set())} className="rs-btn px-[0.6em] py-[0.35em] text-[0.78em]">Clear</button>
            </div>
            {ui.waveActive && <p className="text-[0.66em] text-[#b3a585] mt-[0.4em]">Finish or clear the field first.</p>}
          </div>

          <button
            onClick={() => engineRef.current?.debugClearEnemies()}
            className="rs-btn w-full py-[0.35em] text-[0.8em]"
          >
            ☠ Clear field (kill all enemies)
          </button>
        </div>
      )}

      {tab === 'bestiary' && (
        <div className="space-y-[0.6em]">
          <div className="flex flex-wrap gap-[0.25em] max-h-[8em] overflow-y-auto">
            {animated.map((t) => (
              <button
                key={t}
                onClick={() => setViewing(t)}
                className={`px-[0.4em] py-[0.15em] rounded-[3px] border text-[0.66em] capitalize ${viewing === t ? 'border-osrs-orange bg-osrs-orange/20 text-osrs-yellow' : 'border-[#3a2f1d] text-[#cdbe91] hover:border-[#6b5836]'}`}
              >
                {ENEMIES[t]?.name ?? t}
              </button>
            ))}
          </div>

          {set && def && (
            <div className="rs-panel-inset p-[0.6em]">
              <div className="text-osrs-orange font-bold text-[0.95em] mb-[0.4em]">{def.name}</div>
              <div className="flex gap-[0.6em] items-start">
                <div className="flex flex-col gap-[0.4em]">
                  {CLIP_NAMES.filter((c) => set.clips[c]).map((c) => (
                    <button
                      key={c}
                      onClick={() => setExpanded(c)}
                      title={`Click to enlarge ${c}`}
                      className="flex flex-col items-center group"
                    >
                      <span className="relative">
                        <AnimPreview set={set} clipName={c} />
                        <span className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 bg-black/40 rounded-[3px] text-osrs-yellow text-[1.2em]">⛶</span>
                      </span>
                      <span className="text-[0.6em] text-[#cdbb91] capitalize mt-[0.1em]">{c}</span>
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-x-[0.6em] gap-y-[0.2em] text-[0.74em] flex-1">
                  <span className="text-[#d3c3a0]">HP</span>
                  <span className="text-right text-white">{def.hp}</span>
                  <span className="text-[#d3c3a0]">Speed</span>
                  <span className="text-right text-white">{def.speed}</span>
                  <span className="text-[#d3c3a0]">Weakness</span>
                  <span className="text-right capitalize text-white">{def.weakness ?? 'None'}</span>
                  <span className="text-[#d3c3a0]">Reward</span>
                  <span className="text-right text-osrs-yellow">{def.reward}</span>
                  {def.isBoss && (
                    <>
                      <span className="text-[#d3c3a0]">Type</span>
                      <span className="text-right text-osrs-red uppercase">Boss</span>
                    </>
                  )}
                  <span className="text-[#d3c3a0]">Clips</span>
                  <span className="text-right text-white">{CLIP_NAMES.filter((c) => set.clips[c]).join(', ')}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </MovablePanel>

    {/* Enlarged clip lightbox: bigger canvas + frame scrubber. */}
    {expanded && set?.clips[expanded] && (
      <div
        className="absolute inset-0 z-40 flex items-center justify-center bg-black/70"
        onClick={() => setExpanded(null)}
      >
        <div className="rs-panel p-4 w-[24em]" onClick={(e) => e.stopPropagation()} style={{ fontSize: 'clamp(13px, 0.9vw, 18px)' }}>
          <div className="rs-panel-title flex items-center justify-between mb-[0.6em]">
            <span className="capitalize">{def?.name} — {expanded}</span>
            <span className="flex items-center gap-[0.3em]">
              <button
                onClick={() => setLightboxMode((m) => (m === '3d' ? 'sprite' : '3d'))}
                title="Toggle 3D model / baked sprite"
                className="rs-btn px-[0.5em] py-0 text-[0.7em]"
              >
                {lightboxMode === '3d' ? '3D' : 'Sprite'}
              </button>
              <button onClick={() => setExpanded(null)} title="Close" className="rs-btn px-[0.5em] py-0 text-[0.8em]">✕</button>
            </span>
          </div>
          {lightboxMode === '3d'
            ? <EnemyModelViewer slug={viewing} initialClip={expanded} />
            : <AnimViewer set={set} clipName={expanded} />}
        </div>
      </div>
    )}
    </>
  );
}
