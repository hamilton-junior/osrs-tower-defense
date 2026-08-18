import { describe, it, expect } from 'vitest';
import { mergeUnlockBatch, unlockDwellMs, UNLOCK_DWELL_MS, UNLOCK_DWELL_MIN_MS } from './unlock-queue';

const a = { kind: 'prayer', name: 'Sharp Eye' };
const b = { kind: 'achievement', name: 'Not a Scratch' };
const c = { kind: 'achievement', name: 'Ledger Opened' };

describe('mergeUnlockBatch', () => {
  it('replaces a batch the UI has already been shown', () => {
    expect(mergeUnlockBatch([a], [b], true)).toEqual([b]);
  });

  it('appends to a batch that has not been pushed yet, oldest first', () => {
    expect(mergeUnlockBatch([a], [b], false)).toEqual([a, b]);
  });

  it('keeps appending across any number of producers in the same flush', () => {
    let pending = mergeUnlockBatch([], [a], true);
    pending = mergeUnlockBatch(pending, [b], false);
    pending = mergeUnlockBatch(pending, [c], false);
    expect(pending).toEqual([a, b, c]);
  });

  it('never mutates the batch it was given', () => {
    const pending = [a];
    mergeUnlockBatch(pending, [b], false);
    expect(pending).toEqual([a]);
  });

  it('drops nothing when the incoming batch is empty', () => {
    expect(mergeUnlockBatch([a], [], false)).toEqual([a]);
  });
});

describe('unlockDwellMs', () => {
  it('gives a lone popup the full dwell', () => {
    expect(unlockDwellMs(1)).toBe(UNLOCK_DWELL_MS);
  });

  it('never exceeds the full dwell', () => {
    expect(unlockDwellMs(0)).toBeLessThanOrEqual(UNLOCK_DWELL_MS);
  });

  it('shortens as the queue grows, so a big batch still drains promptly', () => {
    expect(unlockDwellMs(6)).toBeLessThan(UNLOCK_DWELL_MS);
    expect(unlockDwellMs(12)).toBeLessThan(unlockDwellMs(6));
  });

  it('never drops below the readable floor, however long the queue', () => {
    expect(unlockDwellMs(500)).toBe(UNLOCK_DWELL_MIN_MS);
  });

  it('is monotonic: a longer queue never holds a popup longer', () => {
    for (let n = 1; n < 40; n++) expect(unlockDwellMs(n + 1)).toBeLessThanOrEqual(unlockDwellMs(n));
  });
});
