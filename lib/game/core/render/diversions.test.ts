import { describe, it, expect } from 'vitest';
import { drawDiversions } from './diversions';
import { DIVERSION_ANIMS, diversionAnimKey } from '../../data/diversion-anims';
import type { GameRenderer } from '../renderer';
import type { Diversion } from '../../systems/diversions';

/**
 * The one thing about this layer that is worth pinning: a diversion draws the sheet
 * the engine preloaded, at a whole frame cell. Get the key wrong and nothing throws
 * — the NPC quietly falls back to its portrait and stops animating, which is exactly
 * the bug a typo here would cause.
 */

type Call = [unknown, ...number[]];

/** A canvas that only records what was drawn, and the transforms around it. */
function fakeCtx() {
  const drawn: Call[] = [];
  const scales: number[][] = [];
  const ctx = {
    drawn, scales,
    save() {}, restore() {}, translate() {}, rotate() {}, beginPath() {},
    ellipse() {}, stroke() {}, arc() {}, fill() {}, fillText() {},
    scale(x: number, y: number) { scales.push([x, y]); },
    drawImage(...args: Call) { drawn.push(args); },
    globalAlpha: 1, strokeStyle: '', fillStyle: '', lineWidth: 1, font: '', textAlign: '',
  };
  return ctx as unknown as CanvasRenderingContext2D & typeof ctx;
}

/** An engine stub holding one loaded image per key it is told about. */
function fakeRenderer(list: Diversion[], loaded: string[]) {
  const images = new Map<string, unknown>(loaded.map((k) => [k, { key: k }]));
  return { e: { diversions: list, images, imageOk: (k: string) => images.has(k) } } as unknown as GameRenderer;
}

function diversion(over: Partial<Diversion>): Diversion {
  return {
    id: 'd1', defId: 'hans', mood: 'gift', x: 100, y: 200, homeX: 100, homeY: 200,
    phase: 'here', exit: null, facing: 'front', facingLeft: false, line: 'hi', ...over,
  } as Diversion;
}

describe('drawDiversions', () => {
  it('draws one whole frame cell of the baked sheet', () => {
    const key = diversionAnimKey('hans', 'front', 'stand');
    const ctx = fakeCtx();
    drawDiversions(fakeRenderer([diversion({})], [key]), ctx);

    const set = DIVERSION_ANIMS.hans;
    const stand = set.views.front!.stand!;
    expect(ctx.drawn).toHaveLength(1);
    const [img, sx, sy, sw, sh] = ctx.drawn[0];
    expect((img as { key: string }).key).toBe(key);
    expect(sx % set.frameW).toBe(0);
    expect(sx).toBeLessThan(stand.frames * set.frameW);
    expect([sy, sw, sh]).toEqual([0, set.frameW, set.frameH]);
  });

  it('walks in the view it is travelling in, mirrored when heading left', () => {
    const key = diversionAnimKey('hans', 'side', 'walk');
    const ctx = fakeCtx();
    drawDiversions(fakeRenderer([diversion({ phase: 'arriving', facing: 'side', facingLeft: true })], [key]), ctx);

    expect((ctx.drawn[0][0] as { key: string }).key).toBe(key);
    expect(ctx.scales).toContainEqual([-1, 1]);
  });

  it('falls back to the static portrait while the sheet is still loading', () => {
    const ctx = fakeCtx();
    drawDiversions(fakeRenderer([diversion({})], ['diversion_hans']), ctx);
    expect((ctx.drawn[0][0] as { key: string }).key).toBe('diversion_hans');
  });
});
