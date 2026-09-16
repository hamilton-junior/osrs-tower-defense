import { describe, it, expect } from 'vitest';
import { noticeMs, NOTICE_MIN_MS, NOTICE_MAX_MS } from './notice-timing';

describe('noticeMs', () => {
  it('gives a short refusal the floor', () => {
    expect(noticeMs('Not enough gold')).toBe(NOTICE_MIN_MS);
  });

  it('holds a longer line longer', () => {
    expect(noticeMs('Ranarr weed: a life restored')).toBeGreaterThan(noticeMs('Not enough gold'));
  });

  it('never holds past the cap, however long the text', () => {
    expect(noticeMs('x'.repeat(500))).toBe(NOTICE_MAX_MS);
  });

  it('never drops below the old flat 1.4s hold', () => {
    expect(noticeMs('')).toBeGreaterThanOrEqual(1400);
  });

  it('ignores padding around the text', () => {
    expect(noticeMs(`   ${'y'.repeat(40)}   `)).toBe(noticeMs('y'.repeat(40)));
  });

  it('is monotonic: more text never holds shorter', () => {
    for (let n = 0; n < 150; n++) expect(noticeMs('z'.repeat(n + 1))).toBeGreaterThanOrEqual(noticeMs('z'.repeat(n)));
  });
});
