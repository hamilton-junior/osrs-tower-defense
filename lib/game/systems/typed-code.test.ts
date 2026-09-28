import { describe, expect, it } from 'vitest';
import { NOTHING_TYPED, TYPED_CODE_GAP_MS, typeKey, type TypedCode } from './typed-code';

/** Type `keys` in order, `gap` ms apart, and return the index of each key that completed `code`. */
function type(keys: string[], code: string, gap = 100): number[] {
  let state: TypedCode = NOTHING_TYPED;
  const done: number[] = [];
  keys.forEach((key, i) => {
    const r = typeKey(state, key, 1000 + i * gap, code);
    state = r.next;
    if (r.done) done.push(i);
  });
  return done;
}

describe('typeKey', () => {
  it('completes the code on its last key', () => {
    expect(type(['7', '3'], '73')).toEqual([1]);
  });

  it('needs the keys in order', () => {
    expect(type(['3', '7'], '73')).toEqual([]);
  });

  it('starts over on a wrong key, which may begin the code again', () => {
    expect(type(['7', '1', '3'], '73')).toEqual([]);
    expect(type(['7', '7', '3'], '73')).toEqual([2]);
  });

  it('starts over after a long pause', () => {
    expect(type(['7', '3'], '73', TYPED_CODE_GAP_MS + 1)).toEqual([]);
    expect(type(['7', '3'], '73', TYPED_CODE_GAP_MS)).toEqual([1]);
  });

  it('skips keys that print nothing, like the Shift some layouts need for digits', () => {
    expect(type(['Shift', '7', 'Shift', '3'], '73')).toEqual([3]);
  });

  it('fires once per complete code, and again when typed again', () => {
    expect(type(['7', '3', '3'], '73')).toEqual([1]);
    expect(type(['7', '3', '7', '3'], '73')).toEqual([1, 3]);
  });
});
