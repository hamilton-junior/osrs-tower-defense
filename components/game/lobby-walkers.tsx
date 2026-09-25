'use client';

import React, { useEffect, useRef } from 'react';
import { ASSETS } from '@/lib/game/assets';
import { ENEMY_ANIMS, DEATH_SETTLE_S, clipDurationS, clipFrame } from '@/lib/game/data/enemy-anims';
import { SPOTANIMS } from '@/lib/game/data/spotanims';
import { SPOTANIM_SHEETS } from '@/lib/game/data/spotanims.data';
import {
  drawDragonArrow, drawPlainBolt, drawShotGlow, drawShotTrail, drawSpotAnimGfx, paintSplat,
  spotAnimFrame, splatBlobAnchor, splatScale,
} from '@/lib/game/core/render/shot-art';
import {
  drawOrder, lobbyUnit, newLobby, stepLobby, walkerBodyY, walkerOverMenu,
  type LobbyEnv, type LobbyStage, type LobbyWalker, type WalkerSheet,
} from '@/lib/game/systems/lobby-walkers';

/** The walkers' shots and deaths sit as far under the menu as the torches do. */
const LOBBY_SOUND_LEVEL = 0.2;
/** The floor band is the bottom 28% of the lobby (.rs-lobby-floor). */
const FLOOR_FRAC = 0.72;
/** Transparent rows under the torch's base in its 256px cell (lobby_torch.png):
 *  the base stands this fraction of the torch box above the box's bottom edge. */
const TORCH_FOOT_PAD = 20 / 256;
/** The torches' own flat-shading dim (.rs-lobby-flame), so a monster reads as in
 *  the same room. */
const WALKER_FILTER = 'brightness(0.78)';

/**
 * The monsters that wander the start screen's floor, always in front of the
 * torches. Two canvases, both over the torches: the back one sits in the lobby, under the
 * menu; the over one (`overRef`, a sibling of the lobby) sits over the menu, for
 * the walkers whose feet stand below the menu's bottom edge and for every shot,
 * impact and hitsplat. Both paint over the room's vignette, so each canvas
 * darkens its walkers again with the same gradient.
 *
 * Every walker is drawn at its real OSRS size against the torches: the torch's
 * cell spans a known width in world units (lobby_torch.json), so its drawn width
 * gives the room's pixels per world unit.
 *
 * The simulation lives in systems/lobby-walkers; this component loads the
 * sheets, measures the room, draws what the simulation holds and plays the
 * sounds its events name. Nothing moves for a player who asks for reduced motion.
 */
export function LobbyWalkers({ onSound, soundSeconds, overRef }: {
  onSound: (key: string, level: number) => void;
  /** Length in seconds of a loaded sound, or NaN while it is unknown. */
  soundSeconds: (key: string) => number;
  overRef: React.RefObject<HTMLCanvasElement | null>;
}) {
  const backRef = useRef<HTMLCanvasElement>(null);
  const soundRef = useRef(onSound);
  useEffect(() => { soundRef.current = onSound; }, [onSound]);
  const secondsRef = useRef(soundSeconds);
  useEffect(() => { secondsRef.current = soundSeconds; }, [soundSeconds]);

  useEffect(() => {
    const back = backRef.current, front = overRef.current;
    const lobby = back?.parentElement;
    if (!back || !front || !lobby) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const bctx = back.getContext('2d'), fctx = front.getContext('2d');
    if (!bctx || !fctx) return;

    const images = new Map<string, HTMLImageElement>();
    /** The image at `url` once decoded, else null (asking starts the load). */
    const image = (url: string): HTMLImageElement | null => {
      let img = images.get(url);
      if (!img) {
        img = new Image();
        img.src = url;
        images.set(url, img);
      }
      return img.complete && img.naturalWidth > 0 ? img : null;
    };

    const sheets = new Map<string, WalkerSheet>();
    const sheet = (slug: string): WalkerSheet | null => {
      const known = sheets.get(slug);
      if (known) return known;
      const set = ENEMY_ANIMS[slug];
      if (!set) return null;
      const death = set.clips.death;
      if (death) image(death.url);
      if (set.clips.hurt) image(set.clips.hurt.url);
      const walk = image(set.clips.walk.url);
      if (!walk) return null;
      const made = {
        ...bodySpan(walk, set.frameW, set.frameH),
        deathS: death ? clipDurationS(death) : 0,
        worldCell: set.worldCell ?? null,
      };
      sheets.set(slug, made);
      return made;
    };

    let stage: LobbyStage = { width: 0, floorTop: 0, floorBottom: 0, menuBottom: 0, torchFoot: 0, strips: [], em: 16, worldPx: 0 };
    let dpr = 1;
    // Set once the draw below exists; measure() runs before it does.
    let repaint = () => {};
    const measure = () => {
      const box = lobby.getBoundingClientRect();
      const em = parseFloat(getComputedStyle(lobby).fontSize) || 16;
      const floorTop = box.height * FLOOR_FRAC;
      // A shot may only land where the menu panel does not hide the floor.
      const room = roomEl?.getBoundingClientRect();
      let strips: Array<[number, number]> = [[0, box.width]];
      if (room && room.bottom - box.top > floorTop) {
        strips = [[0, room.left - box.left], [room.right - box.left, box.width]];
      }
      const torchCell = SPOTANIM_SHEETS.lobby_torch?.worldCell;
      const torch = torchEl?.getBoundingClientRect();
      const torchW = torch?.width ?? 0;
      stage = {
        width: box.width, floorTop, floorBottom: box.height,
        menuBottom: room ? room.bottom - box.top : 0,
        torchFoot: torch ? torch.bottom - box.top - torch.height * TORCH_FOOT_PAD : 0,
        strips, em,
        worldPx: torchCell && torchW > 0 ? torchW / torchCell : 0,
      };
      dpr = Math.min(2, window.devicePixelRatio || 1);
      // Assigning a canvas's size wipes it, even to the size it already has, and
      // the observer fires after this frame's draw: a tab switch that only grows
      // the menu would paint the room empty for a frame. Resize only on a real
      // change, and repaint straight away when there is one.
      let resized = false;
      for (const c of [back, front]) {
        const cw = Math.round(box.width * dpr), ch = Math.round(box.height * dpr);
        if (c.width === cw && c.height === ch) continue;
        c.width = cw; c.height = ch;
        resized = true;
      }
      if (resized) repaint();
    };
    const roomEl = lobby.parentElement?.querySelector('.rs-start-room') ?? null;
    const torchEl = lobby.querySelector('.rs-lobby-torch');
    measure();
    // The torch box is 14em and the menu grows with its tab, so either one moving
    // re-measures the room even when the lobby's own box holds still.
    const ro = new ResizeObserver(measure);
    for (const el of [lobby, roomEl, torchEl]) if (el) ro.observe(el);

    const state = newLobby(Math.random);
    const env: LobbyEnv = {
      get stage() { return stage; }, rand: Math.random, sheet,
      soundSeconds: (key) => secondsRef.current(key),
    };

    const drawWalker = (ctx: CanvasRenderingContext2D, w: LobbyWalker) => {
      const set = ENEMY_ANIMS[w.slug];
      if (!set) return;
      let clip = set.clips.walk;
      let t = w.walkAge;
      let alpha = 1;
      const hurt = set.clips.hurt;
      if (w.struckAge !== null && w.deadAge === null) {
        // The tick between the killing hit and the death: it stops and flinches,
        // or holds its step when it has no flinch.
        if (hurt && image(hurt.url)) {
          clip = hurt;
          t = w.struckAge;
        }
      } else if (w.deadAge !== null) {
        const death = set.clips.death;
        if (death && image(death.url)) {
          clip = death;
          t = w.deadAge;
          alpha = Math.min(1, (w.sheet.deathS + DEATH_SETTLE_S - w.deadAge) / DEATH_SETTLE_S);
        } else {
          // No collapse to play: the body holds its last step and fades.
          alpha = Math.max(0, 1 - w.deadAge / DEATH_SETTLE_S);
        }
      }
      const img = image(clip.url);
      if (!img || alpha <= 0) return;
      const fi = clipFrame(clip, t);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(w.x, walkerBodyY(w));
      // Baked clips face right; flip for the walk to the left.
      if (w.dir === -1) ctx.scale(-1, 1);
      ctx.drawImage(img, fi * set.frameW, 0, set.frameW, set.frameH, -w.size / 2, -w.size / 2, w.size, w.size);
      ctx.restore();
    };

    /** The room's vignette over the walkers only: `source-atop` keeps it to their pixels. */
    const vignette = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
      const cx = w * 0.5, cy = h * 0.45;
      const rx = w * 0.5 * Math.SQRT2, ry = h * 0.55 * Math.SQRT2;
      ctx.save();
      ctx.globalCompositeOperation = 'source-atop';
      ctx.translate(cx, cy);
      ctx.scale(rx, ry);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
      g.addColorStop(0.35, 'rgba(0,0,0,0)');
      g.addColorStop(1, 'rgba(0,0,0,0.72)');
      ctx.fillStyle = g;
      ctx.fillRect(-cx / rx, -cy / ry, w / rx, h / ry);
      ctx.restore();
    };

    let splatAnchor: { ox: number; oy: number } | null = null;
    const drawEffects = (ctx: CanvasRenderingContext2D) => {
      const u = lobbyUnit(stage);
      for (const w of state.walkers) {
        const shot = w.strike?.shot;
        if (!shot?.launched || w.deadAge !== null) continue;
        drawShotTrail(ctx, shot.trail, shot.color, (shot.tower === 'cannon' ? 5 : 3) * u);
        const angle = Math.atan2(walkerBodyY(w) - shot.y, w.x - shot.x);
        const meta = shot.spell ? SPOTANIMS[`proj_${shot.spell}`] : undefined;
        const flight = meta ? image(meta.url) : null;
        if (shot.tower === 'cannon' || (shot.spell && !flight)) {
          drawShotGlow(ctx, shot.x, shot.y, (shot.tower === 'cannon' ? 4 : 5) * u, shot.color);
          continue;
        }
        ctx.save();
        ctx.translate(shot.x, shot.y);
        ctx.rotate(angle);
        if (meta && flight) {
          const s = meta.size * u;
          const fi = spotAnimFrame(meta, shot.age * 1000, true);
          ctx.drawImage(flight, fi * meta.frameW, 0, meta.frameW, meta.frameH, -s / 2, -s / 2, s, s);
        } else {
          ctx.scale(u, u);
          if (shot.tower === 'archer') drawDragonArrow(ctx);
          else drawPlainBolt(ctx, shot.color);
        }
        ctx.restore();
      }
      for (const g of state.gfx) {
        const meta = SPOTANIMS[g.slug];
        const img = meta ? image(meta.url) : null;
        if (meta && img) drawSpotAnimGfx(ctx, img, meta, g.age, g.x, g.y, g.size);
      }
      const splat = image(ASSETS.hitsplats.hit);
      if (splat && !splatAnchor) splatAnchor = splatBlobAnchor(splat);
      for (const h of state.splats) {
        ctx.save();
        ctx.globalAlpha = Math.min(1, h.life / 0.3);
        ctx.translate(h.x, h.y);
        ctx.scale(h.scale, h.scale);
        paintSplat(ctx, 0, 0, h.value, 'hit', splatScale(h.value), splat, splatAnchor ?? { ox: 0, oy: 0 });
        ctx.restore();
      }
    };

    const draw = () => {
      const w = stage.width, h = stage.floorBottom;
      for (const ctx of [bctx, fctx]) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, w, h);
      }
      for (const ctx of [bctx, fctx]) ctx.filter = WALKER_FILTER;
      for (const walker of drawOrder(state.walkers)) {
        drawWalker(walkerOverMenu(walker, stage) ? fctx : bctx, walker);
      }
      for (const ctx of [bctx, fctx]) {
        ctx.filter = 'none';
        vignette(ctx, w, h);
      }
      drawEffects(fctx);
    };
    repaint = draw;

    let raf = 0;
    let last = performance.now();
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      // A hidden tab gets no frames; the clamp keeps the lobby from leaping ahead
      // when it comes back.
      const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
      last = now;
      if (document.hidden || stage.width <= 0) return;
      for (const ev of stepLobby(state, dt, env)) {
        const keys = ev.kind === 'impact' ? ev.sounds : [ev.sound];
        for (const key of keys) soundRef.current(key, LOBBY_SOUND_LEVEL);
      }
      draw();
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [overRef]);

  return <canvas ref={backRef} className="rs-lobby-walkers" />;
}

/** The body's span in a walk sheet's first cell, as fractions of the cell's
 *  height: where the feet sit (the lowest opaque row) and how tall it stands. */
function bodySpan(img: HTMLImageElement, fw: number, fh: number): { feetFrac: number; bodyFrac: number } {
  // Unreadable: the bake's usual margin and a human's height.
  const fallback = { feetFrac: 0.94, bodyFrac: 0.6 };
  try {
    const c = document.createElement('canvas');
    c.width = fw; c.height = fh;
    const g = c.getContext('2d', { willReadFrequently: true });
    if (!g) return fallback;
    g.drawImage(img, 0, 0, fw, fh, 0, 0, fw, fh);
    const d = g.getImageData(0, 0, fw, fh).data;
    const opaque = (y: number) => {
      for (let x = 0; x < fw; x++) if (d[(y * fw + x) * 4 + 3] > 16) return true;
      return false;
    };
    let bottom = fh - 1;
    while (bottom >= 0 && !opaque(bottom)) bottom--;
    if (bottom < 0) return fallback;
    let top = 0;
    while (!opaque(top)) top++;
    return { feetFrac: (bottom + 1) / fh, bodyFrac: (bottom + 1 - top) / fh };
  } catch {
    return fallback;
  }
}
