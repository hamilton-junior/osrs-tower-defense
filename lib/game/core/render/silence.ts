import type { AncientType } from '../../types';
import type { GameRenderer } from '../renderer';
import { SPOTANIMS } from '../../data/spotanims';

/**
 * **A silenced tower wears the element that silenced it.**
 *
 * Nex's acolytes each knock out the towers casting their own Ancient, and the disable
 * itself is the board's one standard look — 40% alpha plus the prohibited sign, drawn in
 * `drawTowers` and nowhere else. That look says *off*; it cannot say *by whom*, and with
 * four acolytes taking turns that is the whole readable half of the fight. So this dresses
 * the same downed tower in its attacker's element: Glacies leaves it iced over, Umbra
 * shrouded, Cruor bled, Fumus smoking.
 *
 * **It is the spell's own baked GFX and nothing else.** Nothing here is hand-drawn: an ice
 * block painted next to the real Ice Barrage would be a second visual language for one
 * idea, and the board already has the real one baked out of the cache.
 *
 * It adds **no** state and no rules — it is drawn straight off `Tower.silencedBy` and the
 * disable timer that owns it, so it can never outlive the silence or contradict the sign.
 *
 * Two layers of the same sheet, because a tower has to be *inside* the effect for it to
 * read: `'under'` goes down before the sprite, wider and dimmer and half a cycle behind,
 * so the tower stands in it; `'over'` goes down after the sprite, tighter and stronger, so
 * the spell has hold of it. Both stay beneath the prohibited sign, drawn last at full
 * opacity.
 *
 * It **loops** rather than playing once: an impact is a moment, but being silenced is a
 * state, and a state that animates once and then freezes reads as a stuck frame. The loop
 * runs on `runSeconds` (game time), so it slows with game speed and stops with the pause
 * like every other spell on the board, and it is offset per tower position so a row of
 * silenced towers is not a row of identical stills.
 */

/** Seconds of thaw at the tail: the effect lets go before the tower comes back, so the
 *  player sees it returning rather than having it blink on. */
const FADE = 0.8;

/** The layer's size as a multiple of the fitted box, and how strongly it draws. */
const LAYERS = {
  under: { mult: 1.3, alpha: 0.45, phase: 0.5 },
  over: { mult: 1, alpha: 0.95, phase: 0 },
} as const;

/**
 * How one element dresses a tower.
 *
 * The numbers exist because the bakes are not comparable to each other. Every spotanim is
 * a 192px frame, but how much of it the art fills is whatever the cache model happened to
 * need: Ice Barrage's block is a narrow column filling 24%×58% of its frame, Blood
 * Barrage's spike is a hairline at 8%, Smoke Barrage's cloud fills the whole frame, and
 * Shadow Barrage's spikes come with four blank frames in the strip. Drawing every sheet
 * at one flat size therefore draws four different sizes on screen — most of them a smudge.
 * So `art` records the measured bounds of the ink inside the frame (fractions of it,
 * `cx`/`cy` being its centre) and the draw fits *that* to the tower rather than fitting
 * the padding.
 *
 * `tall`/`wide` are the caps on the art itself in multiples of the tower's `visualRadius`
 * — whichever binds first wins, so a wide splash grows until it is as wide as it may be
 * and a narrow column until it is as tall as it may be. `at` then places the copies (also
 * in `visualRadius`), which is what lets a shape narrower than the tower still cover it:
 * two ice columns side by side, nine blood spikes in a row.
 */
interface Dressing {
  slug: string;
  art: { w: number; h: number; cx: number; cy: number };
  tall: number;
  wide: number;
  at: readonly (readonly [number, number])[];
  /** The frames worth playing, when the bake has blanks or a mirrored tail. */
  frames?: readonly number[];
}

const DRESS: Record<AncientType, Dressing> = {
  // Ice Barrage's impact: the block the spell freezes its target inside. Two columns so
  // the tower is in the ice rather than behind one pane of it.
  ice: {
    slug: 'hit_ice_4',
    art: { w: 0.24, h: 0.58, cx: 0.5, cy: 0.65 },
    tall: 2.6, wide: 9,
    at: [[-0.5, 0], [0.5, 0]],
  },
  // Blood Barrage's impact: a spike of blood driven up through the tower. The flat
  // rasteriser caught it as a hairline — 8% of its frame wide — so it takes nine of them
  // in a row to be a curtain rather than a scratch, and only the frames where the spike
  // stands at full height, since the strip spends most of itself growing and collapsing.
  blood: {
    slug: 'hit_blood_4',
    art: { w: 0.08, h: 0.80, cx: 0.5, cy: 0.47 },
    tall: 3.2, wide: 99,
    at: [[-1.12, 0], [-0.84, 0], [-0.56, 0], [-0.28, 0], [0, 0], [0.28, 0], [0.56, 0], [0.84, 0], [1.12, 0]],
    frames: [5, 6, 7, 8, 9],
  },
  // Shadow Barrage's impact: dark spikes driven through it. Frames 0, 7, 8 and 15 of the
  // strip are empty and the tail mirrors the head, so the loop plays the one rise-and-fall
  // instead of blinking out three times a cycle.
  shadow: {
    slug: 'hit_shadow_4',
    art: { w: 0.27, h: 0.75, cx: 0.5, cy: 0.55 },
    tall: 2.8, wide: 9,
    at: [[-0.5, 0], [0.5, 0]],
    frames: [1, 2, 3, 4, 5, 6],
  },
  // Smoke Barrage's impact: the cloud it bursts into. It fills its frame but sparsely, so
  // three overlapping copies give it body, and the loop is cut to the frames where the
  // cloud is out at full size instead of the puff it opens and closes on.
  smoke: {
    slug: 'hit_smoke_4',
    art: { w: 1, h: 0.99, cx: 0.5, cy: 0.49 },
    tall: 3, wide: 99,
    at: [[-0.4, 0], [0, 0], [0.4, 0]],
    frames: [5, 6, 7, 8, 9, 10],
  },
};

export function drawSilencedTower(
  gr: GameRenderer,
  ctx: CanvasRenderingContext2D,
  ancient: AncientType,
  x: number,
  y: number,
  radius: number,
  timer: number,
  layer: 'under' | 'over',
) {
  const a = timer < FADE ? Math.max(0, timer / FADE) : 1;
  if (a <= 0) return;
  const d = DRESS[ancient];
  const meta = SPOTANIMS[d.slug];
  const key = `spotanim_${d.slug}`;
  // No fallback: the disable already has its own standard look, and the one thing this may
  // not do is invent a second version of a spell we have baked.
  if (!meta || !gr.e.imageOk(key)) return;

  const n = d.frames ? d.frames.length : meta.frames;
  const frameAt = (i: number) => (d.frames ? d.frames[i] : i);
  let total = 0;
  for (let i = 0; i < n; i++) total += meta.frameMs[frameAt(i)];
  if (total <= 0) return;

  const { mult, alpha, phase } = LAYERS[layer];
  // Per-tower offset so neighbours are out of step, plus the layer's own half-cycle so the
  // two copies read as one effect rather than a doubled image.
  const offset = (x * 7 + y * 13) % total + phase * total;
  let rem = (gr.e.runSeconds * 1000 * meta.speed + offset) % total;
  let i = 0;
  for (; i < n - 1; i++) {
    const ms = meta.frameMs[frameAt(i)];
    if (rem < ms) break;
    rem -= ms;
  }
  const fi = frameAt(i);

  // Fit the *art*, not the frame: whichever cap binds first decides the box.
  const box = Math.min(radius * d.tall / d.art.h, radius * d.wide / d.art.w) * mult;
  const ox = -(d.art.cx - 0.5) * box;
  const oy = -(d.art.cy - 0.5) * box;

  const img = gr.e.images.get(key)!;
  ctx.save();
  ctx.globalAlpha = alpha * a;
  if (meta.blend === 'add') ctx.globalCompositeOperation = 'lighter';
  for (const [dx, dy] of d.at) {
    ctx.drawImage(
      img,
      fi * meta.frameW, 0, meta.frameW, meta.frameH,
      x + ox + dx * radius - box / 2, y + oy + dy * radius - box / 2, box, box,
    );
  }
  ctx.restore();
}
