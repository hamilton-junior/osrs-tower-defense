import { describe, it, expect } from 'vitest';
import { feedbackUrl, FEEDBACK, type FeedbackContext } from './feedback';

const ctx = (wave: number): FeedbackContext => ({
  wave,
  mode: 'classic',
  lives: 10,
  gold: 500,
  build: 'abc1234',
  screen: '1728×768',
  ua: 'test',
  when: '2026-07-10T00:00:00.000Z',
});

describe('feedbackUrl', () => {
  it('pre-fills the Wave field with the current wave', () => {
    const url = new URL(feedbackUrl('https://example.com/form', ctx(7)));
    expect(url.searchParams.get('Wave')).toBe('7');
  });
  it('sets a param for every configured prefill field', () => {
    const url = new URL(feedbackUrl('https://example.com/form', ctx(3)));
    for (const field of Object.keys(FEEDBACK.prefill)) {
      expect(url.searchParams.get(field), field).not.toBeNull();
    }
  });
  it('leaves an empty base untouched (a hidden button)', () => {
    expect(feedbackUrl('', ctx(1))).toBe('');
  });
  it('falls back to the raw base when the URL is malformed', () => {
    expect(feedbackUrl('not a url', ctx(1))).toBe('not a url');
  });
});
