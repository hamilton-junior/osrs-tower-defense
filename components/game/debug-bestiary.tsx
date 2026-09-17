'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ENEMY_ANIMS, clipFrame, clipDurationS, type EnemyAnimSet } from '@/lib/game/data/enemy-anims';
import { ENEMIES } from '@/lib/game/data/enemies';
import { LOOK_BY_SLUG, LOOKS_BY_TYPE, defaultLookSlug, type EnemyLookDef } from '@/lib/game/data/enemy-variants';
import { BIOMES } from '@/lib/game/data/biomes';
import { GRID } from '@/lib/game/core/engine-state';
import { ASSETS } from '@/lib/game/assets';
import { EnemyModelViewer } from './EnemyModelViewer';
import { fs, hideBrokenImg } from './ui-kit';
import { enemySlugSpriteStyle } from './enemy-ui';
import { Caption, DebugCard, PickTile, TileGrid } from './debug-cheats';
import type { EnemyType } from '@/lib/game/types';

export const CLIP_NAMES = ['walk', 'hurt', 'death', 'burrow', 'emerge'] as const;
export type ClipName = (typeof CLIP_NAMES)[number];

/** The Bestiary lists monsters the way a run meets them: the backbone that can
 *  roll anywhere, then each region's own set, then the bosses and the bodies they
 *  put on the field. The keys mirror `systems/enemy-regions` — an untagged monster
 *  is generic — so the panel never invents a second notion of where a thing lives. */
const BESTIARY_SECTIONS: { key: string; label: string }[] = [
  { key: 'generic', label: 'Anywhere' },
  ...Object.values(BIOMES).map((b) => ({ key: b.id as string, label: b.name })),
  { key: 'boss', label: 'Bosses' },
  { key: 'escort', label: 'Boss adds' },
];

type EnemyDef = (typeof ENEMIES)[EnemyType];

function bestiarySection(def: EnemyDef): string {
  if (def.isBoss) return 'boss';
  if (def.summonedBy) return 'escort';
  return def.region ?? 'generic';
}

/** How big this monster is drawn on the board, in logic pixels — the same sum
 *  `core/render/enemies` does, so the number here is the one a player sees. */
function boardSize(def: EnemyDef): number {
  return Math.round((def.isBoss ? 60 : 30) * (def.renderScale ?? 1));
}

/** Plays a single baked clip on a loop in a small canvas. One-shot clips
 *  (hurt/death) replay after a short pause so the preview never freezes. The
 *  backing store is fixed; CSS sizes it in `em`, so it follows the UI size. */
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
      className="w-full aspect-square"
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
    <div className="flex flex-col gap-[0.45em]">
      <div className="rs-panel-inset">
        <canvas
          ref={canvasRef}
          width={size}
          height={size}
          className="block w-full aspect-square"
          style={{ imageRendering: 'pixelated' }}
        />
      </div>
      <div className="flex items-center gap-[0.4em] w-full">
        <button onClick={() => setPlaying((p) => !p)} className="rs-btn px-[0.6em] py-[0.15em] text-[0.8em]" title={playing ? 'Pause' : 'Play'}>
          {playing ? '❚❚' : '▶'}
        </button>
        <button onClick={() => step(-1)} className="rs-btn px-[0.5em] py-[0.15em] text-[0.8em]" title="Previous frame">◀</button>
        <input
          type="range"
          min={0}
          max={clip.frames - 1}
          value={frame}
          onChange={(e) => { setPlaying(false); setFrame(Number(e.target.value)); }}
          className="rs-volume flex-1 min-w-0"
          aria-label="Frame"
        />
        <button onClick={() => step(1)} className="rs-btn px-[0.5em] py-[0.15em] text-[0.8em]" title="Next frame">▶</button>
        <span className="text-[0.7em] text-osrs-yellow tabular-nums w-[3.4em] text-right">{frame + 1}/{clip.frames}</span>
      </div>
    </div>
  );
}

/** One row of the list: a region's (or the bosses') monsters. */
type BestiarySection = { key: string; label: string; types: EnemyType[] };

/**
 * Everything the bestiary is looking at, as one object.
 *
 * It lives in a hook rather than inside the tab because the tab and its lightbox
 * are rendered on opposite sides of the panel's own frame — the lightbox covers
 * the whole board, so it cannot sit inside a `MovablePanel` — and both halves have
 * to agree on which clip is open. Keeping it in the shell also means the selection
 * survives a trip to another tab and back.
 */
export interface BestiaryState {
  sections: BestiarySection[];
  viewingType: EnemyType;
  viewingSlug: string;
  setViewingSlug: (slug: string) => void;
  showMonster: (t: EnemyType) => void;
  expanded: ClipName | null;
  setExpanded: (c: ClipName | null) => void;
  lightboxMode: '3d' | 'sprite';
  setLightboxMode: (m: '3d' | 'sprite') => void;
  /** The baked clip set for the look on screen — undefined if nothing is baked. */
  set: EnemyAnimSet | undefined;
  def: EnemyDef | undefined;
  look: EnemyLookDef | undefined;
  looks: readonly EnemyLookDef[] | undefined;
  viewingName: string;
  /** What the stat block calls this thing, or null for ordinary trash. */
  kind: string | null;
}

export function useBestiary(): BestiaryState {
  // The list is one tile per *monster*, grouped by where it lives; the several
  // bodies one monster can wear (the Barrows brothers, Cerberus's souls) hang off
  // its own card instead of crowding the list with lookalikes.
  const sections = useMemo<BestiarySection[]>(() => {
    const groups = new Map<string, EnemyType[]>();
    for (const def of Object.values(ENEMIES)) {
      if (!ENEMY_ANIMS[defaultLookSlug(def.type)]) continue; // nothing baked, nothing to show
      const key = bestiarySection(def);
      const bucket = groups.get(key);
      if (bucket) bucket.push(def.type); else groups.set(key, [def.type]);
    }
    return BESTIARY_SECTIONS
      .map((sec) => ({ ...sec, types: groups.get(sec.key) ?? [] }))
      .filter((sec) => sec.types.length > 0);
  }, []);

  const [viewingType, setViewingType] = useState<EnemyType>(() => sections[0]?.types[0] ?? 'goblin');
  const [viewingSlug, setViewingSlug] = useState<string>(() => defaultLookSlug(sections[0]?.types[0] ?? 'goblin'));
  const [expanded, setExpanded] = useState<ClipName | null>(null);
  const [lightboxMode, setLightboxMode] = useState<'3d' | 'sprite'>('3d');

  const def = ENEMIES[viewingType];
  // A named look (Verac, a summoned soul) speaks for itself; anything else is
  // called by its monster's own name.
  const look = LOOK_BY_SLUG[viewingSlug];

  return {
    sections,
    viewingType,
    viewingSlug,
    setViewingSlug,
    showMonster: (t) => { setViewingType(t); setViewingSlug(defaultLookSlug(t)); },
    expanded,
    setExpanded,
    lightboxMode,
    setLightboxMode,
    set: ENEMY_ANIMS[viewingSlug],
    def,
    look,
    looks: LOOKS_BY_TYPE[viewingType],
    viewingName: look?.name ?? def?.name ?? viewingSlug,
    // An alternate model says so, a summoned body is an add, and everything else
    // is either a boss or ordinary trash.
    kind: look?.kind ?? (def?.isBoss ? 'Boss' : def?.summonedBy ? 'Boss add' : null),
  };
}

/** The scrolling monster list, grouped by region, one Collection Log tile each. */
function MonsterList({ st }: { st: BestiaryState }) {
  const total = st.sections.reduce((n, sec) => n + sec.types.length, 0);
  return (
    <DebugCard title="Monsters" icon={ASSETS.misc.slayer_crossbow} aside={`${total}`}>
      <div className="max-h-[16.5em] overflow-y-auto custom-scrollbar pr-[0.2em] space-y-[0.45em]">
        {st.sections.map((sec) => (
          <div key={sec.key} className="space-y-[0.2em]">
            <Caption>{sec.label} <span className="text-[#6b5f48]">({sec.types.length})</span></Caption>
            <TileGrid>
              {sec.types.map((t) => (
                <PickTile
                  key={t}
                  name={ENEMIES[t].name}
                  sprite={enemySlugSpriteStyle(defaultLookSlug(t))}
                  picked={st.viewingType === t}
                  onClick={() => st.showMonster(t)}
                />
              ))}
            </TileGrid>
          </div>
        ))}
      </div>
    </DebugCard>
  );
}

/** A label and its value, the patch panel's stat line. */
function Row({ label, value, tone, icon }: { label: string; value: string; tone?: string; icon?: string }) {
  return (
    <>
      <span className="text-[0.68em] text-[#b3a585]">{label}</span>
      <span className={`text-[0.68em] text-right tabular-nums flex items-center justify-end gap-[0.25em] ${tone ?? 'text-osrs-yellow'}`}>
        {value}
        {icon && <img src={icon} alt="" className="w-[1.1em] h-[1.1em] object-contain shrink-0" onError={hideBrokenImg} />}
      </span>
    </>
  );
}

/** The card under the list: who it is, the numbers the board runs on, the bodies
 *  it can wear, and every baked clip playing. */
function MonsterCard({ st, set }: { st: BestiaryState; set: EnemyAnimSet }) {
  const { def, look, looks, kind, viewingSlug, viewingName } = st;
  const region = def?.region ? BIOMES[def.region].name : 'Anywhere';
  const clips = CLIP_NAMES.filter((c) => set.clips[c]);
  const sprite = enemySlugSpriteStyle(viewingSlug, true);
  return (
    <div className="rs-panel-inset p-[0.55em] space-y-[0.5em]">
      <div className="flex gap-[0.6em] items-start">
        {/* The full-size sprite, walking: its loop is cut for exactly this box. */}
        <div className="rs-log-sprite shrink-0" style={sprite}>{sprite ? null : '?'}</div>
        <div className="min-w-0 flex-1">
          <div className="text-[0.82em] text-osrs-orange font-bold truncate">{viewingName}</div>
          <div className="text-[0.62em] uppercase tracking-wide text-osrs-yellow mb-[0.3em]">
            {kind && <span className={def?.isBoss && !look ? 'text-osrs-red' : undefined}>{kind} · </span>}
            {region}
          </div>
          {def && (
            <div className="grid grid-cols-2 gap-x-[0.5em] gap-y-[0.15em]">
              <Row label="Hitpoints" value={`${def.hp}`} icon={ASSETS.misc.hp_icon} />
              <Row label="Speed" value={`${def.speed}`} />
              <Row label="Weakness" value={def.weakness ?? 'None'} tone="text-osrs-yellow capitalize" />
              <Row label="Reward" value={`${def.reward}`} icon={ASSETS.misc.coins_icon} />
              <Row label="Size" value={`${boardSize(def)}px · ${(boardSize(def) / GRID).toFixed(2)} tiles`} />
            </div>
          )}
        </div>
      </div>

      {looks && looks.length > 1 && (
        <div className="space-y-[0.2em]">
          <Caption>Looks ({looks.length})</Caption>
          <TileGrid>
            {looks.map((l) => (
              <PickTile
                key={l.slug}
                name={l.name}
                sprite={enemySlugSpriteStyle(l.slug)}
                picked={viewingSlug === l.slug}
                onClick={() => st.setViewingSlug(l.slug)}
              />
            ))}
          </TileGrid>
        </div>
      )}

      <div className="space-y-[0.2em]">
        <Caption>Clips · click one to enlarge</Caption>
        <TileGrid>
          {clips.map((c) => (
            <button
              key={c}
              onClick={() => st.setExpanded(c)}
              title={`Enlarge ${c}`}
              className="rs-log-entry w-full min-w-0"
            >
              <AnimPreview set={set} clipName={c} />
              <span className="rs-log-name capitalize">{c}</span>
            </button>
          ))}
        </TileGrid>
      </div>
    </div>
  );
}

/** The Bestiary tab itself: pick a monster, watch its baked clips, read its stats. */
export function BestiaryTab({ st }: { st: BestiaryState }) {
  return (
    <>
      <MonsterList st={st} />
      {st.set && <MonsterCard st={st} set={st.set} />}
    </>
  );
}

/**
 * The enlarged clip: a bigger canvas plus a frame scrubber, or the 3D model.
 *
 * Rendered outside the debug panel, over the whole board — a clip being stepped
 * through frame by frame should not be trapped inside a 26em window.
 */
export function BestiaryLightbox({ st }: { st: BestiaryState }) {
  const { expanded, set, viewingName, viewingSlug, lightboxMode } = st;
  if (!expanded || !set?.clips[expanded]) return null;
  return (
    <div
      className="absolute inset-0 z-40 flex items-center justify-center bg-black/70"
      onClick={() => st.setExpanded(null)}
    >
      <div
        className="rs-panel p-[0.6em] w-[24em] flex flex-col gap-[0.45em]"
        onClick={(e) => e.stopPropagation()}
        style={{ fontSize: fs('clamp(14px, 0.95vw, 20px)') }}
      >
        <div className="rs-panel-title flex items-center justify-between gap-[0.5em]" style={{ fontSize: '1em' }}>
          <span className="min-w-0 truncate">
            {viewingName} <span className="text-[0.8em] text-osrs-yellow capitalize">· {expanded}</span>
          </span>
          <span className="flex items-center gap-[0.3em] shrink-0">
            {(['3d', 'sprite'] as const).map((m) => (
              <button
                key={m}
                onClick={() => st.setLightboxMode(m)}
                title={m === '3d' ? 'The live 3D model' : 'The baked sprite sheet'}
                className={`rs-btn px-[0.5em] py-0 text-[0.7em] ${lightboxMode === m ? 'rs-btn-primary' : ''}`}
              >
                {m === '3d' ? '3D' : 'Sprite'}
              </button>
            ))}
            <button onClick={() => st.setExpanded(null)} title="Close" className="rs-btn px-[0.5em] py-0 text-[0.8em]">✕</button>
          </span>
        </div>
        {lightboxMode === '3d'
          ? <EnemyModelViewer slug={viewingSlug} initialClip={expanded} />
          : <AnimViewer set={set} clipName={expanded} />}
      </div>
    </div>
  );
}
