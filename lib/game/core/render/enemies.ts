import { SPAWN_ANIM_SECONDS } from '../../types';
import type { CombatStyle, Element, Enemy } from '../../types';
import { ENEMY_ANIMS, clipFrame, clipDurationS, DEATH_SETTLE_S } from '../../data/enemy-anims';
import { TOWER_STYLES } from '../../data/towers';
import { ELEMENTS } from '../../systems/magic';
import { AFFIX_DEFS, SHIELD_HP_FRAC } from '../../systems/affixes';
import { ZULRAH_PHASES, hydraPhase, HYDRA_VENT_SECS, moleIsHidden, MOLE_UNDER_SECS, NEX_WARD_MAX_SECS, nexIsShielded, bossPhaseClip, phaseResistedStyles } from '../../systems/boss-mechanics';
import type { DeathFx } from '../engine-state';
import type { GameRenderer } from '../renderer';
import { GUARDIAN_LINK_COLOR, SOUL_COLORS, PORTAL_MASK_R } from './shared';
import { SPOTANIMS } from '../../data/spotanims';

/** Nex's ward: Zarosian violet, shared by the dome, the tether and the boss-bar caption
 *  so the three read as one mechanic. */
const NEX_WARD_COLOR = '#c9a0ff';

/**
 * Enemies: their baked walk/hurt/death clips, HP bars, affix marks, the hit
 * flash masked to the sprite's own silhouette, and the boss-specific extras
 * (mole mound, Guardians' tether, Cerberus's souls, Jad's healers).
 */

/**
 * Draw `img` (a source region) to `ctx` at the current transform, with a red
 * hit-flash that is **clipped to the sprite's own silhouette**.
 *
 * Tinting on the main canvas with `source-atop` doesn't work: the destination
 * there is the opaque map background, so the red fills the whole sprite box.
 * Instead we composite on an offscreen buffer whose only opaque pixels are the
 * sprite itself — `source-atop` then masks the red by the sprite's alpha — and
 * blit that tinted silhouette over the already-drawn sprite.
 */
export function drawFlashTint(gr: GameRenderer, 
  ctx: CanvasRenderingContext2D,
  img: CanvasImageSource,
  sx: number, sy: number, sw: number, sh: number,
  dx: number, dy: number, dw: number, dh: number,
  flash: number,
  color = '#e00000',
) {
  if (!gr.flashBuf) {
    gr.flashBuf = document.createElement('canvas');
    gr.flashCtx = gr.flashBuf.getContext('2d');
  }
  const buf = gr.flashBuf;
  const bctx = gr.flashCtx;
  if (!bctx) return;
  if (buf.width !== sw || buf.height !== sh) { buf.width = sw; buf.height = sh; }
  bctx.clearRect(0, 0, sw, sh);
  bctx.globalCompositeOperation = 'source-over';
  bctx.globalAlpha = 1;
  bctx.imageSmoothingEnabled = false;
  bctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
  // `color` only where the sprite is opaque (masked by its alpha).
  bctx.globalCompositeOperation = 'source-atop';
  bctx.globalAlpha = Math.min(1, flash) * 0.6;
  bctx.fillStyle = color;
  bctx.fillRect(0, 0, sw, sh);
  bctx.globalCompositeOperation = 'source-over';
  bctx.globalAlpha = 1;
  // Blit the tinted silhouette over the sprite at the caller's transform.
  ctx.drawImage(buf, 0, 0, sw, sh, dx, dy, dw, dh);
}

/** Fading, shrinking sprites of enemies that just died. */
export function drawDeaths(gr: GameRenderer, ctx: CanvasRenderingContext2D) {
  for (const d of gr.e.deaths) {
    const t = Math.max(0, d.life / d.maxLife); // 1 → 0
    if (d.caughtBy) { drawCatch(gr, ctx, d, t); continue; }
    // `animType` override (a Jad healer dies as `yt_hurkot`), same as drawEnemies.
    const deathSlug = d.animType && ENEMY_ANIMS[d.animType] ? d.animType : d.type;
    const deathClip = ENEMY_ANIMS[deathSlug]?.clips.death;
    const animKey = deathClip ? `enemyanim_${deathSlug}_death` : '';
    if (deathClip && gr.e.imageOk(animKey)) {
      // Animated death: the collapse clip plays out at full size, then the body
      // lies where it fell for DEATH_SETTLE_S while it fades — the clip clamps to
      // its last frame, so the fade always runs over the settled pose rather than
      // over the fall itself.
      const set = ENEMY_ANIMS[deathSlug]!;
      const img = gr.e.images.get(animKey)!;
      const elapsed = (d.maxLife - d.life); // 0 → maxLife
      const fi = clipFrame(deathClip, elapsed);
      const ds = (d.isBoss ? 60 : 30) * (d.renderScale ?? 1) * 1.32; // match drawEnemies
      ctx.save();
      ctx.globalAlpha = Math.min(1, d.life / DEATH_SETTLE_S);
      ctx.translate(d.x, d.y);
      // Baked clips face RIGHT (canonical model space, same as static sprites);
      // flip only when travelling left.
      if (d.movingLeft) ctx.scale(-1, 1);
      ctx.drawImage(img, fi * set.frameW, 0, set.frameW, set.frameH, -ds / 2, -ds / 2, ds, ds);
      ctx.restore();
      continue;
    }
    if (!gr.e.imageOk(d.type)) continue;
    const img = gr.e.images.get(d.type)!;
    const size = (d.isBoss ? 60 : 30) * (d.renderScale ?? 1) * (0.7 + t * 0.3); // shrink slightly
    ctx.save();
    ctx.globalAlpha = t * 0.85;
    ctx.translate(d.x, d.y - (1 - t) * 12); // drift up a touch
    if (d.movingLeft) ctx.scale(-1, 1);
    ctx.drawImage(img, -size / 2, -size / 2, size, size);
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

/**
 * A creature going into a trap rather than falling over: the body slides to the
 * trap, shrinking and spinning as it goes, and a bright ring snaps shut behind it.
 * Deliberately unlike a death — nothing collapses, because nothing was killed
 * where it stood, and the player needs to see at a glance which of the two the
 * road just did.
 */
function drawCatch(
  gr: GameRenderer,
  ctx: CanvasRenderingContext2D,
  d: DeathFx,
  t: number,
) {
  const trap = d.caughtBy!;
  const k = 1 - t; // 0 → 1 over the fx's life
  // Ease-in: it hangs for an instant, then is snatched.
  const e = k * k;
  const x = d.x + (trap.x - d.x) * e;
  const y = d.y + (trap.y - d.y) * e;
  const slug = d.animType && ENEMY_ANIMS[d.animType] ? d.animType : d.type;
  const animKey = ENEMY_ANIMS[slug]?.clips.walk ? `enemyanim_${slug}_walk` : '';
  const base = (d.isBoss ? 60 : 30) * (d.renderScale ?? 1);
  const scale = 1 - 0.85 * e; // down to a scrap by the time it arrives
  ctx.save();
  ctx.globalAlpha = Math.min(1, (1 - e) * 1.4);
  ctx.translate(x, y);
  ctx.rotate(e * Math.PI * 1.2); // tumbling in
  if (d.movingLeft) ctx.scale(-1, 1);
  if (animKey && gr.e.imageOk(animKey)) {
    const set = ENEMY_ANIMS[slug]!;
    const ds = base * 1.32 * scale;
    // Frame 0 of the walk: a shape being carried off, not a body mid-collapse.
    ctx.drawImage(gr.e.images.get(animKey)!, 0, 0, set.frameW, set.frameH, -ds / 2, -ds / 2, ds, ds);
  } else if (gr.e.imageOk(d.type)) {
    const ds = base * scale;
    ctx.drawImage(gr.e.images.get(d.type)!, -ds / 2, -ds / 2, ds, ds);
  }
  ctx.restore();
  // The trap closing: a ring that shrinks onto it as the body lands.
  ctx.save();
  ctx.globalAlpha = e * 0.85;
  ctx.strokeStyle = '#ffd45e';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(trap.x, trap.y, 22 * (1 - e) + 5, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
  ctx.globalAlpha = 1;
}

/**
 * The churning mound an underground Giant Mole pushes up — drawn where it will
 * surface, not where it went down (the engine moves it on the way in). Earth heaves
 * out of the ground and a crack of soil widens as the beat runs out, so the player
 * can read both *where* and *when* it is coming back.
 */
export function drawMoleMound(gr: GameRenderer, ctx: CanvasRenderingContext2D, e: Enemy) {
  // 0 → 1 across the underground beat: the heap swells as it comes up.
  const t = 1 - Math.max(0, Math.min(1, (e.bossState?.moleTimer ?? 0) / MOLE_UNDER_SECS));
  // Sized off the Mole itself, so it reads as *this boss* about to arrive rather than
  // a decal. It sits on the road, which is also brown — hence the dark rim and the
  // pale heaved crest, which carry the shape on grass and on dirt alike.
  const r = (26 + 22 * t) * (e.renderScale ?? 1);
  ctx.save();
  // A dark ring of turned-up earth, then the heap itself, then a lit crest.
  ctx.fillStyle = 'rgba(38, 27, 16, 0.75)';
  ctx.beginPath();
  ctx.ellipse(e.x, e.y + r * 0.12, r * 1.06, r * 0.62, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(104, 78, 50, 0.96)';
  ctx.beginPath();
  ctx.ellipse(e.x, e.y, r, r * 0.55, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(160, 126, 86, 0.95)';
  ctx.beginPath();
  ctx.ellipse(e.x, e.y - r * 0.16, r * 0.62, r * 0.3, 0, 0, Math.PI * 2);
  ctx.fill();
  // Clods thrown clear of the heap, further out the closer it is to breaking through.
  ctx.fillStyle = 'rgba(150, 118, 80, 0.95)';
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + t * 3;
    const d = r * (0.9 + 0.45 * ((i * 7) % 5) / 5) + t * 14;
    ctx.beginPath();
    ctx.arc(e.x + Math.cos(a) * d, e.y + Math.sin(a) * d * 0.6, 2.5 + t * 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** What the selected tower is paid extra to kill. Selecting a tower marks those
 *  enemies: an Elemental wizard rings the ones weak to its element, and any other
 *  tower rings the ones weak to its combat style. Same ring, same promise — the
 *  style answer is not a second-class one, it just reads in the combat-triangle
 *  colour instead. */
interface WeaknessMark {
  element: Element | null;
  style: CombatStyle | undefined | null;
  color: string | null;
  pulse: number;
}

function weaknessMark(gr: GameRenderer): WeaknessMark {
  const sel = gr.e.selectedTowerId ? gr.e.towers.find(t => t.id === gr.e.selectedTowerId) : null;
  const element = sel && sel.type === 'wizard' && (sel.mageMode ?? 'elemental') === 'elemental' ? (sel.element ?? 'air') : null;
  const style = sel && !element ? TOWER_STYLES[sel.type]?.style : null;
  const color = element && element !== 'none' ? ELEMENTS[element].color
    : style === 'melee' ? '#ff4d4d'
      : style === 'ranged' ? '#7fd14a'
        : null;
  return { element, style, color, pulse: 0.5 + 0.5 * Math.sin(performance.now() / 300) };
}

/** How far an oversized sprite lifts everything drawn over its head. */
function overheadLift(e: Enemy, isBoss: boolean): number {
  return Math.max(0, ((e.renderScale ?? 1) - 1) * (isBoss ? 30 : 15));
}

/** The top of the HP bar — the anchor the prayer overheads stack off too. */
function hpBarY(e: Enemy, isBoss: boolean): number {
  return e.y - (isBoss ? 40 : 22) - overheadLift(e, isBoss);
}

/**
 * Scurrius: a rat on its way home is about to hand his health back. Nothing else in
 * the fight would show that, and a boss bar that rises for no visible reason reads as
 * a bug rather than as a mechanic — so the rat is leashed to him while it returns.
 */
function drawRatLeashes(gr: GameRenderer, ctx: CanvasRenderingContext2D) {
  for (const e of gr.e.enemies) {
    if (e.ratPhase !== 'return' || !e.ownerId) continue;
    const king = gr.e.enemies.find((o) => o.id === e.ownerId);
    if (!king) continue;
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = '#48d04a';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 6]);
    // gameTime is private to GameEngine; performance.now() gives the same crawl
    // (unpaused, like every other pulse/animation timer in this file) without it.
    ctx.lineDashOffset = -((performance.now() / 1000) * 30) % 12;
    ctx.beginPath();
    ctx.moveTo(e.x, e.y);
    ctx.lineTo(king.x, king.y);
    ctx.stroke();
    ctx.restore();
  }
}

/**
 * Nex: a dashed violet tether from her to the acolyte holding her ward. The gate is
 * legible without it only if the player happens to read the boss bar — the line says
 * *this* body is the one keeping her out of reach, which is the whole fight.
 */
function drawNexTethers(gr: GameRenderer, ctx: CanvasRenderingContext2D) {
  for (const e of gr.e.enemies) {
    if (!nexIsShielded(e.bossState)) continue;
    const ward = gr.e.enemies.find((a) => a.id === e.bossState?.nexWardId);
    if (!ward) continue;
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.strokeStyle = NEX_WARD_COLOR;
    ctx.lineWidth = 2;
    ctx.setLineDash([7, 5]);
    // Crawling toward the ward, so the line reads as her drawing on it rather than as
    // decoration. `performance.now()` for the same reason the rat leashes use it.
    ctx.lineDashOffset = -((performance.now() / 1000) * 26) % 12;
    ctx.beginPath();
    ctx.moveTo(e.x, e.y);
    ctx.lineTo(ward.x, ward.y);
    ctx.stroke();
    ctx.restore();
  }
}

/**
 * Something the General's slam shook loose: **Bandos's own sigil** at its feet for as
 * long as the crowd-control immunity lasts. The slam's own shockwave is gone in half a
 * second, so without this the state it left behind — holds simply not landing — would
 * read as the towers being broken rather than as the mechanic working.
 *
 * The mark used to be a plain brass ring, which said "this one is special" without ever
 * saying *why*; the god's emblem names the source, and it is the same emblem the player
 * sees on the General himself. It is drawn at the body's feet — under the sprite, where
 * the ring was — and tinted brass over its stone so it stays readable on dark road.
 */
function drawSlamGuard(
  gr: GameRenderer, ctx: CanvasRenderingContext2D, e: Enemy, size: number,
) {
  const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 220);
  const img = gr.e.imageOk('bandos_symbol') ? gr.e.images.get('bandos_symbol') : null;
  ctx.save();
  if (img) {
    const w = size * 0.62;
    const h = (w * img.height) / img.width;
    const dx = e.x - w / 2, dy = e.y + size * 0.34 - h / 2;
    ctx.globalAlpha = 0.45 + pulse * 0.4;
    ctx.drawImage(img, 0, 0, img.width, img.height, dx, dy, w, h);
    drawFlashTint(gr, ctx, img, 0, 0, img.width, img.height, dx, dy, w, h, 1, '#d9b24a');
  } else {
    // Until the sigil decodes, the old ring — an immune body must never look ordinary.
    ctx.strokeStyle = `rgba(217,178,74,${0.45 + pulse * 0.35})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(e.x, e.y + size * 0.34, size * 0.4, size * 0.16, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

/** Superior slayer variant: an extremely faint warm shimmer behind the sprite,
 *  echoing the sparkle that marks a "Bigger and Badder" spawn. */
function drawSuperiorGlow(ctx: CanvasRenderingContext2D, e: Enemy, size: number) {
  const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 600);
  const glowR = size * 0.62;
  const g = ctx.createRadialGradient(e.x, e.y, glowR * 0.25, e.x, e.y, glowR);
  g.addColorStop(0, `rgba(255, 238, 170, ${0.05 + pulse * 0.06})`);
  g.addColorStop(1, 'rgba(255, 238, 170, 0)');
  ctx.save();
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(e.x, e.y, glowR, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** The body itself: its baked clip if one is loaded, else the static sprite, else
 *  a coloured blob — each with the hit flash masked to its own silhouette. */
function drawEnemyBody(
  gr: GameRenderer, ctx: CanvasRenderingContext2D, e: Enemy,
  size: number, shx: number, shy: number, flash: number,
) {
  const isBoss = !!e.isBoss;
  const movingLeft = (gr.e.path[e.pathIndex + 1]?.x ?? e.x) < e.x;
  // `animType` overrides the clip slug (e.g. a Jad healer renders `yt_hurkot`
  // once baked); fall back to `type`'s clip when the override isn't baked.
  const animSlug = e.animType && ENEMY_ANIMS[e.animType] ? e.animType : e.type;
  const animSet = ENEMY_ANIMS[animSlug];
  // A mechanic clip — the Mole's dig and climb-out, Brutus pawing the ground and
  // charging — is the real OSRS animation for a phase whose mechanic *is* that
  // animation. It outranks both the hurt flinch and the walk loop: the boss is not
  // walking, and a flinch that interrupted the telegraph would break the one thing
  // the mechanic is trying to say. Which clip belongs to which phase lives in
  // `bossPhaseClip`, beside the phase durations that size it.
  const phaseClip = bossPhaseClip(e.bossState);
  const mechClip = phaseClip ? animSet?.clips[phaseClip.name as keyof typeof animSet.clips] : undefined;
  const hurting = !mechClip && !!animSet?.clips.hurt && (e.hurtAnim ?? 0) > 0;
  const clipName = mechClip ? phaseClip!.name : hurting ? 'hurt' : 'walk';
  const animKey = animSet ? `enemyanim_${animSlug}_${clipName}` : '';
  if (animSet && gr.e.imageOk(animKey)) {
    // Animated enemy: loop `walk` on alive-time, or play a one-shot (the Mole's
    // dig/emerge, else the `hurt` flinch) over exactly that clip's window. The hurt
    // window is sized to the clip's own duration in `damage`, and the Mole's phases
    // are sized to theirs in `boss-mechanics`, so `elapsed` counts up from 0 in both.
    const clip = mechClip ?? (hurting ? animSet.clips.hurt! : animSet.clips.walk);
    const img = gr.e.images.get(animKey)!;
    const elapsed = mechClip
      ? phaseClip!.elapsed
      : hurting ? clipDurationS(clip) - (e.hurtAnim ?? 0) : e.animTime ?? 0;
    const fi = clipFrame(clip, elapsed);
    const fw = animSet.frameW, fh = animSet.frameH;
    // The baked creature fills ~88% of its cell (6% margin/side); scale up to
    // undo that, plus a touch more so the model reads a bit larger on the map.
    const ds = size * 1.32;
    ctx.save();
    ctx.translate(e.x + shx, e.y + shy);
    // Baked clips face RIGHT (canonical model space, same as static sprites);
    // flip only when travelling left, exactly like the static-sprite branch.
    if (movingLeft) ctx.scale(-1, 1);
    ctx.drawImage(img, fi * fw, 0, fw, fh, -ds / 2, -ds / 2, ds, ds);
    if (flash > 0) {
      drawFlashTint(gr, ctx, img, fi * fw, 0, fw, fh, -ds / 2, -ds / 2, ds, ds, flash);
    }
    // Boss phase tint: recolour the body to its current phase. Zulrah's form
    // says which style it's weak to; the Hydra's chemical colour says how many
    // vents you've broken — both readable at a glance without the caption.
    const zc = e.bossState?.kind === 'zulrah'
      ? ZULRAH_PHASES[e.bossState.phaseIndex % ZULRAH_PHASES.length].color
      : e.bossState?.kind === 'hydra'
        ? hydraPhase(e.bossState.shattered ?? 0).color : null;
    if (zc) drawFlashTint(gr, ctx, img, fi * fw, 0, fw, fh, -ds / 2, -ds / 2, ds, ds, 0.6, zc);
    ctx.restore();
  } else if (gr.e.imageOk(e.type)) {
    const img = gr.e.images.get(e.type)!;
    ctx.save();
    ctx.translate(e.x + shx, e.y + shy);
    if (movingLeft) ctx.scale(-1, 1);
    ctx.drawImage(img, -size / 2, -size / 2, size, size);
    if (flash > 0) {
      const sw = img.naturalWidth || size, sh = img.naturalHeight || size;
      drawFlashTint(gr, ctx, img, 0, 0, sw, sh, -size / 2, -size / 2, size, size, flash);
    }
    ctx.restore();
  } else {
    const r = isBoss ? 20 : 12;
    ctx.fillStyle = flash > 0 ? '#e00000' : e.color;
    ctx.beginPath();
    ctx.arc(e.x + shx, e.y + shy, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Affix auras: a pulsing ring per affix in its themed colour, so an elite enemy
 *  reads at a glance (concentric when it carries two). */
function drawAffixRings(ctx: CanvasRenderingContext2D, e: Enemy, isBoss: boolean, matAlpha: number) {
  const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 400);
  ctx.save();
  ctx.lineWidth = 2;
  e.affixes!.forEach((a, idx) => {
    ctx.strokeStyle = AFFIX_DEFS[a].color;
    ctx.globalAlpha = matAlpha * (0.35 + pulse * 0.35);
    ctx.beginPath();
    ctx.arc(e.x, e.y, (isBoss ? 24 : 15) + idx * 4, 0, Math.PI * 2);
    ctx.stroke();
  });
  ctx.restore();
}

/** How many ice crystals stand in Vorkath's shell, and how fast the shell turns
 *  (seconds per revolution). Slow on purpose: the shield is a *wait*, and a fast spin
 *  reads as an attack winding up. */
const VORKATH_SHARDS = 6;
const VORKATH_SPIN_SECS = 9;

/** Boss phase telegraphs: what this boss is doing *right now*, drawn on the body. */
function drawBossTelegraph(gr: GameRenderer, ctx: CanvasRenderingContext2D, e: Enemy, size: number) {
  const st = e.bossState!;
  if (st.kind === 'zulrah') {
    // A pulsing ring in the current form's colour, echoing the body tint.
    const phase = ZULRAH_PHASES[st.phaseIndex % ZULRAH_PHASES.length];
    const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 320);
    ctx.save();
    ctx.strokeStyle = phase.color;
    ctx.globalAlpha = 0.5 + pulse * 0.4;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(e.x, e.y, size * 0.62, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  } else if (st.kind === 'vorkath' && st.immune) {
    // Ice shield: a slowly turning shell of real ice around him while he is immune.
    //
    // The crystals are the game's own (spotanim 1200, the blue of the three-way recolour
    // his freeze is built from), one sprite per crystal, each turned to point outward and
    // the whole ring rotated on wall-clock time. It used to be six stroked lines in a
    // gradient, which read as a targeting reticle rather than as armour — and this shield
    // is the one thing in the fight the player must recognise instantly, because every
    // shot fired at it is wasted.
    const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 200);
    ctx.save();
    const r = size * 0.66;
    const g = ctx.createRadialGradient(e.x, e.y, r * 0.4, e.x, e.y, r);
    g.addColorStop(0, 'rgba(150,220,255,0)');
    g.addColorStop(1, `rgba(150,220,255,${0.22 + pulse * 0.16})`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(e.x, e.y, r, 0, Math.PI * 2);
    ctx.fill();
    const meta = SPOTANIMS.ice_shard;
    const key = 'spotanim_ice_shard';
    const spin = (performance.now() / 1000 / VORKATH_SPIN_SECS) * Math.PI * 2;
    if (meta && gr.e.imageOk(key)) {
      const img = gr.e.images.get(key)!;
      // The crystals themselves are still; the shell turns. Their own sheet is a *melt*,
      // so playing it would have the shield perpetually thawing — one frame, held.
      const s = size * 0.5;
      ctx.globalAlpha = 0.75 + pulse * 0.25;
      for (let k = 0; k < VORKATH_SHARDS; k++) {
        const a = (k / VORKATH_SHARDS) * Math.PI * 2 + spin;
        ctx.save();
        ctx.translate(e.x + Math.cos(a) * r * 0.86, e.y + Math.sin(a) * r * 0.86);
        // Baked tip-down, so a quarter turn puts the point along the outward radius.
        ctx.rotate(a - Math.PI / 2);
        ctx.drawImage(img, 0, 0, meta.frameW, meta.frameH, -s / 2, -s / 2, s, s);
        ctx.restore();
      }
    } else {
      // Until the sheet decodes, the old spokes — the shield must never be invisible.
      ctx.strokeStyle = `rgba(200,240,255,${0.7 + pulse * 0.3})`;
      ctx.lineWidth = 2;
      for (let k = 0; k < VORKATH_SHARDS; k++) {
        const a = (k / VORKATH_SHARDS) * Math.PI * 2 + spin;
        ctx.beginPath();
        ctx.moveTo(e.x + Math.cos(a) * r * 0.5, e.y + Math.sin(a) * r * 0.5);
        ctx.lineTo(e.x + Math.cos(a) * r, e.y + Math.sin(a) * r);
        ctx.stroke();
      }
    }
    ctx.restore();
  } else if (st.kind === 'hydra' && st.venting) {
    // Chemical vent: an acid-green haze with bubbling motes, and a ring that
    // drains anticlockwise as the window runs out — the player's break timer.
    const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 180);
    const r = size * 0.66;
    ctx.save();
    const g = ctx.createRadialGradient(e.x, e.y, r * 0.35, e.x, e.y, r);
    g.addColorStop(0, 'rgba(150,255,90,0)');
    g.addColorStop(1, `rgba(150,255,90,${0.2 + pulse * 0.18})`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(e.x, e.y, r, 0, Math.PI * 2);
    ctx.fill();
    // The window timer, drawn as the ring's remaining arc.
    const left = Math.max(0, Math.min(1, (st.ventTimer ?? 0) / HYDRA_VENT_SECS));
    ctx.strokeStyle = `rgba(182,255,106,${0.75 + pulse * 0.25})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(e.x, e.y, r, -Math.PI / 2, -Math.PI / 2 + left * Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  } else if (nexIsShielded(st)) {
    // The ward: a violet dome she stands inside, with the fail-safe drawn as the ring's
    // remaining arc — the same timer language the Hydra's vent window uses, because it
    // answers the same question ("how long do I have?"), only inverted: here the arc
    // running out is the player's *relief*, not their deadline.
    const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 260);
    const r = size * 0.7;
    ctx.save();
    const g = ctx.createRadialGradient(e.x, e.y, r * 0.3, e.x, e.y, r);
    g.addColorStop(0, 'rgba(201,160,255,0)');
    g.addColorStop(1, `rgba(201,160,255,${0.2 + pulse * 0.18})`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(e.x, e.y, r, 0, Math.PI * 2);
    ctx.fill();
    const left = Math.max(0, Math.min(1, (st.nexWardTimer ?? 0) / NEX_WARD_MAX_SECS));
    ctx.strokeStyle = `rgba(220,190,255,${0.7 + pulse * 0.3})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(e.x, e.y, r, -Math.PI / 2, -Math.PI / 2 + left * Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

/** Health bar — colour shifts green → yellow → red as HP drops. */
function drawHealthBar(ctx: CanvasRenderingContext2D, e: Enemy, isBoss: boolean) {
  const bw = isBoss ? 60 : 30;
  // Lift the bar by any extra sprite height so scaled-up sprites (Zulrah)
  // don't cover it.
  const by = hpBarY(e, isBoss);
  const ratio = Math.max(0, e.hp / e.maxHp);
  ctx.fillStyle = '#400';
  ctx.fillRect(e.x - bw / 2, by, bw, 4);
  ctx.fillStyle = ratio > 0.5 ? '#3c3' : ratio > 0.25 ? '#e0c020' : '#e23a3a';
  ctx.fillRect(e.x - bw / 2, by, bw * ratio, 4);
  // Shielded affix: a slim cyan pip above the HP bar for the shield left,
  // normalised against the affix's max shield (≈ SHIELD_HP_FRAC of max HP).
  if (e.shieldHp && e.shieldHp > 0) {
    const sratio = Math.min(1, e.shieldHp / Math.max(1, e.maxHp * SHIELD_HP_FRAC));
    ctx.fillStyle = '#13303a';
    ctx.fillRect(e.x - bw / 2, by - 5, bw, 3);
    ctx.fillStyle = '#7fd0ff';
    ctx.fillRect(e.x - bw / 2, by - 5, bw * sratio, 3);
  }
}

/**
 * Protection-prayer overheads: a small prayer icon per style the enemy is actively
 * praying against — its own `protectedStyle` (the affix / an innate species prayer)
 * plus any *per-style* boss phase (Zulrah's forms, Cerberus's soul locks). Drawn
 * above the HP bar; the icon says "switch styles".
 */
function drawPrayerOverheads(gr: GameRenderer, ctx: CanvasRenderingContext2D, e: Enemy, isBoss: boolean) {
  const prayed = new Set<string>();
  if (e.protectedStyle) prayed.add(e.protectedStyle);
  for (const s of phaseResistedStyles(e.bossState)) prayed.add(s);
  if (!prayed.size) return;
  const styles = [...prayed];
  // Drawn at the headicon's native 25px (scaled down for rank-and-file), so
  // the sprite's own gold disc stays crisp — no backdrop of ours is needed.
  const isz = isBoss ? 20 : 14;
  const gap = 2;
  const totalW = styles.length * isz + (styles.length - 1) * gap;
  const iy = hpBarY(e, isBoss) - (e.shieldHp && e.shieldHp > 0 ? 9 : 6) - isz;
  let ix = e.x - totalW / 2;
  for (const s of styles) {
    const img = gr.e.images.get(`prayericon_${s}`);
    if (img && img.complete && img.naturalWidth > 0) ctx.drawImage(img, ix, iy, isz, isz);
    ix += isz + gap;
  }
}

/**
 * Overhead speech — a boss announcing a mechanic one beat before it fires, drawn
 * the way OSRS draws NPC chat: yellow, centred over the head, hard black shadow and
 * no bubble. It sits above everything else on the enemy (prayer icons, HP bar), so
 * the telegraph is never the thing that gets covered up.
 */
function drawOverheadSay(ctx: CanvasRenderingContext2D, e: Enemy, isBoss: boolean) {
  ctx.save();
  ctx.font = "bold 13px 'RuneScape', Arial";
  ctx.textAlign = 'center';
  const ty = e.y - (isBoss ? 62 : 42) - overheadLift(e, isBoss);
  ctx.fillStyle = '#000';
  ctx.fillText(e.say!, e.x + 1, ty + 1);
  ctx.fillStyle = '#ffff00';
  ctx.fillText(e.say!, e.x, ty);
  ctx.restore();
}

/** Weakness highlight: a pulsing ring in the selected tower's element or style. */
function drawWeaknessRing(ctx: CanvasRenderingContext2D, e: Enemy, isBoss: boolean, mark: WeaknessMark) {
  ctx.save();
  ctx.strokeStyle = mark.color!;
  ctx.globalAlpha = 0.45 + mark.pulse * 0.4;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(e.x, e.y, isBoss ? 26 : 16, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

/** Every living enemy: its body, then everything the player reads off it. This
 *  function is the running order; each layer is its own function above. */
export function drawEnemies(gr: GameRenderer, ctx: CanvasRenderingContext2D) {
  const mark = weaknessMark(gr);
  const pp = gr.e.portalPoint;
  // Jad (if present) — its healers draw a heal-beam back to it.
  const jad = gr.e.enemies.find((en) => en.bossState?.kind === 'jad');

  drawRatLeashes(gr, ctx);
  drawNexTethers(gr, ctx);

  for (const e of gr.e.enemies) {
    // The Giant Mole is underground: no body, no HP bar, no overlays — only the
    // churning mound. The engine has already moved it to where it will surface, so
    // the mound sits at the *destination*: it is the tell, and the player gets the
    // whole underground beat to read the reposition before the Mole is back.
    if (moleIsHidden(e.bossState)) { drawMoleMound(gr, ctx, e); continue; }
    const isBoss = !!e.isBoss;
    // While still in the portal (materialising or not yet walked clear), hide
    // the HP bar / overlays so nothing pokes through the gateway.
    const inPortal = (e.spawnAnim ?? 0) > 0 || Math.hypot(e.x - pp.x, e.y - pp.y) < PORTAL_MASK_R;
    // Portal materialise: for the first SPAWN_ANIM_SECONDS after emerging the
    // enemy fades in (smoothstep) and grows from 45%→100% (ease-out), so it
    // looks like it's stepping out of the gateway rather than popping in.
    const spawnT = e.spawnAnim && e.spawnAnim > 0 ? 1 - e.spawnAnim / SPAWN_ANIM_SECONDS : 1;
    const matScale = 0.3 + 0.7 * (spawnT * (2 - spawnT)); // easeOutQuad grow
    const matAlpha = spawnT * spawnT * (3 - 2 * spawnT); // smoothstep fade-in
    ctx.save();
    ctx.globalAlpha = matAlpha;
    const size = (isBoss ? 60 : 30) * (e.renderScale ?? 1) * matScale;
    const flash = e.flashTimer && e.flashTimer > 0 ? e.flashTimer / 0.15 : 0;
    // Impact = a slight shake while the hit registers.
    const shx = flash > 0 ? (Math.random() - 0.5) * 6 * flash : 0;
    const shy = flash > 0 ? (Math.random() - 0.5) * 6 * flash : 0;

    if (typeof e.type === 'string' && e.type.startsWith('superior_')) drawSuperiorGlow(ctx, e, size);

    drawEnemyBody(gr, ctx, e, size, shx, shy, flash);

    // Yt-HurKot healer flair: a pulsing heal-beam back to Jad + a small heal
    // badge, drawn over the (imp / real Yt-HurKot) body the normal path rendered.
    if (e.healer && !inPortal) drawHealerFx(gr, ctx, e, jad, size);

    // A Summoned Soul flies its style's colours: a beam back to Cerberus in that
    // style's tint, and the style spelled out under it. The whole decision the fight
    // asks — *which* soul do I kill? — is unanswerable if the player has to guess
    // which one is which.
    if (e.soulStyle && !inPortal) drawSoulFx(gr, ctx, e, size);

    if (!inPortal && e.affixes && e.affixes.length) drawAffixRings(ctx, e, isBoss, matAlpha);
    if (!inPortal && e.bossState) drawBossTelegraph(gr, ctx, e, size);
    if (!inPortal && (e.ccImmuneTimer ?? 0) > 0) drawSlamGuard(gr, ctx, e, size);
    // Hidden while the enemy is still in the portal so nothing pokes through.
    if (!inPortal) drawHealthBar(ctx, e, isBoss);
    if (!inPortal) drawPrayerOverheads(gr, ctx, e, isBoss);
    if (!inPortal && e.say) drawOverheadSay(ctx, e, isBoss);
    if (!inPortal && mark.color && (mark.element ? e.weakness === mark.element : e.styleWeakness === mark.style)) {
      drawWeaknessRing(ctx, e, isBoss, mark);
    }

    ctx.restore(); // end materialise alpha
  }

  drawGuardianTether(gr, ctx);
}

/**
 * The Grotesque Guardians' shared stone: a live beam between the pair. It is the
 * mitigation made visible — while this is up, both take half damage, and the only way
 * to cut it is to drop one of them.
 *
 * Drawn *over* the bodies, deliberately. Under them it was invisible: the two statues
 * are wider than the lane between them, so the beam was covered by the very things it
 * connects.
 */
export function drawGuardianTether(gr: GameRenderer, ctx: CanvasRenderingContext2D) {
  const dusk = gr.e.enemies.find((en) => en.bossState?.kind === 'dusk');
  if (!dusk?.bossState?.linked) return;
  const dawn = gr.e.enemies.find((en) => en.id === dusk.bossState!.partnerId);
  if (!dawn) return;
  const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 220);
  ctx.save();
  ctx.strokeStyle = GUARDIAN_LINK_COLOR;
  ctx.lineCap = 'round';
  ctx.globalAlpha = 0.25 + 0.2 * pulse;
  ctx.lineWidth = 9;
  ctx.beginPath();
  ctx.moveTo(dusk.x, dusk.y);
  ctx.lineTo(dawn.x, dawn.y);
  ctx.stroke();
  ctx.globalAlpha = 0.85 + 0.15 * pulse;
  ctx.lineWidth = 2.5;
  ctx.stroke();
  // Motes of stone travelling the beam, so it reads as *flowing* rather than a line
  // someone drew between two sprites.
  const t = (performance.now() / 900) % 1;
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = GUARDIAN_LINK_COLOR;
  for (const off of [0, 0.33, 0.66]) {
    const p = (t + off) % 1;
    ctx.beginPath();
    ctx.arc(dusk.x + (dawn.x - dusk.x) * p, dusk.y + (dawn.y - dusk.y) * p, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/**
 * A Summoned Soul's flair: a beam back to Cerberus in the colour of the style it is
 * locking, plus that style's name under it. Cerberus's whole question is *which soul
 * do I kill for my board*, and the player cannot answer it if the three read alike.
 */
export function drawSoulFx(gr: GameRenderer, ctx: CanvasRenderingContext2D, e: Enemy, size: number) {
  const color = SOUL_COLORS[e.soulStyle!];
  const owner = e.ownerId ? gr.e.enemies.find((o) => o.id === e.ownerId) : undefined;
  const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 260);
  ctx.save();
  if (owner) {
    // The lock made visible: while this beam is up, that style barely touches him.
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.3 + 0.25 * pulse;
    ctx.lineWidth = 3;
    ctx.setLineDash([7, 6]);
    ctx.beginPath();
    ctx.moveTo(e.x, e.y);
    ctx.lineTo(owner.x, owner.y);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.globalAlpha = 0.55 + 0.3 * pulse;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(e.x, e.y, size * 0.62, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.fillStyle = color;
  ctx.font = "bold 11px 'RuneScape', Arial";
  ctx.textAlign = 'center';
  ctx.fillText(e.soulStyle!.toUpperCase(), e.x, e.y + size * 0.62 + 12);
  ctx.restore();
}

/** Yt-HurKot healer flair over its rendered body: a pulsing green heal-beam back
 *  to Jad and a small green cross badge, so it reads as the thing mending Jad and
 *  a target to cut down. The body sprite + HP bar come from the normal enemy path. */
export function drawHealerFx(gr: GameRenderer, ctx: CanvasRenderingContext2D, e: Enemy, jad: Enemy | undefined, size: number) {
  const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 240);
  // Heal beam to Jad — a soft green tendril pulsing along its length.
  if (jad) {
    ctx.save();
    ctx.strokeStyle = `rgba(80,220,90,${0.3 + pulse * 0.35})`;
    ctx.lineWidth = 2;
    ctx.shadowColor = 'rgba(80,220,90,0.8)';
    ctx.shadowBlur = 5;
    ctx.setLineDash([3, 4]);
    ctx.beginPath();
    ctx.moveTo(e.x, e.y);
    ctx.lineTo(jad.x, jad.y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }
  // Green cross badge floating just above the body.
  const bx = e.x, by = e.y - size * 0.55 - 4;
  ctx.save();
  ctx.strokeStyle = `rgba(120,255,140,${0.7 + pulse * 0.3})`;
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.shadowColor = 'rgba(60,220,90,0.9)';
  ctx.shadowBlur = 4;
  ctx.beginPath();
  ctx.moveTo(bx - 4, by); ctx.lineTo(bx + 4, by);
  ctx.moveTo(bx, by - 4); ctx.lineTo(bx, by + 4);
  ctx.stroke();
  ctx.restore();
}
