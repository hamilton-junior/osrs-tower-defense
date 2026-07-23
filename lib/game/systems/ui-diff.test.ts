import { describe, it, expect } from 'vitest';
import { sameSnapshotValue, changedState } from './ui-diff';

describe('sameSnapshotValue', () => {
  it('compares primitives by value', () => {
    expect(sameSnapshotValue(3, 3)).toBe(true);
    expect(sameSnapshotValue(3, 4)).toBe(false);
    expect(sameSnapshotValue('a', 'a')).toBe(true);
    expect(sameSnapshotValue(null, null)).toBe(true);
    expect(sameSnapshotValue(null, undefined)).toBe(false);
    expect(sameSnapshotValue(false, 0)).toBe(false);
  });

  it('treats NaN as equal to itself, so a NaN field does not emit every frame', () => {
    expect(sameSnapshotValue(NaN, NaN)).toBe(true);
  });

  it('compares freshly-rebuilt arrays by their contents', () => {
    // What the engine actually does: `[...this.multiSelectedIds]` every emit.
    expect(sameSnapshotValue([1, 2, 3], [1, 2, 3])).toBe(true);
    expect(sameSnapshotValue([1, 2, 3], [1, 2])).toBe(false);
    expect(sameSnapshotValue([1, 2, 3], [1, 3, 2])).toBe(false);
    expect(sameSnapshotValue([], [])).toBe(true);
  });

  it('compares plain objects by their contents, including nested ones', () => {
    expect(sameSnapshotValue({ a: 1, b: { c: 2 } }, { a: 1, b: { c: 2 } })).toBe(true);
    expect(sameSnapshotValue({ a: 1, b: { c: 2 } }, { a: 1, b: { c: 3 } })).toBe(false);
  });

  it('reports objects with different key sets as different', () => {
    expect(sameSnapshotValue({ a: 1 }, { a: 1, b: 2 })).toBe(false);
    expect(sameSnapshotValue({ a: 1, b: undefined }, { a: 1, c: undefined })).toBe(false);
  });

  it('never confuses an array with an object', () => {
    expect(sameSnapshotValue([], {})).toBe(false);
  });

  it('handles the real runMods shape (object of objects of numbers)', () => {
    const mods = () => ({ damage: { magic: 1.2 }, range: {}, fireRate: { ranged: 1.05 } });
    expect(sameSnapshotValue(mods(), mods())).toBe(true);
  });

  it('gives up past the depth limit and reports "changed" rather than "equal"', () => {
    const deep = () => ({ a: { b: { c: { d: { e: { f: { g: 1 } } } } } } });
    expect(sameSnapshotValue(deep(), deep())).toBe(false);
  });
});

describe('changedState', () => {
  it('returns the whole snapshot when there is no previous one', () => {
    const next = { money: 10, wave: 1 };
    expect(changedState(null, next)).toEqual(next);
  });

  it('returns only the keys whose value moved', () => {
    const prev = { money: 10, wave: 1, lives: 5 };
    const next = { money: 25, wave: 1, lives: 5 };
    expect(changedState(prev, next)).toEqual({ money: 25 });
  });

  it('returns nothing when a rebuilt snapshot is value-identical', () => {
    // The damage-hot-path case: new object identities, same values → no render.
    const snap = () => ({ money: 10, multiSelectedIds: [1, 2], runMods: { damage: { magic: 1.2 } } });
    expect(changedState(snap(), snap())).toEqual({});
  });

  it('picks up a changed array even though its identity always differs', () => {
    const prev = { ids: [1, 2] };
    const next = { ids: [1, 2, 3] };
    expect(changedState(prev, next)).toEqual({ ids: [1, 2, 3] });
  });

  it('emits a key that flipped to null', () => {
    const prev = { slayerTask: { type: 'imp' } as { type: string } | null };
    const next = { slayerTask: null as { type: string } | null };
    expect(changedState(prev, next)).toEqual({ slayerTask: null });
  });
});
