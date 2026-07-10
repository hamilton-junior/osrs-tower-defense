/**
 * In-game feedback → NocoDB shared **Form Views**.
 *
 * The game is a static site (GitHub Pages, no backend), so we never call the
 * NocoDB API from the client — that would leak an API token into the public
 * bundle. Instead we just link out to NocoDB's public *form* pages, which the
 * player fills in a new tab. Nothing secret ships to the browser.
 *
 * To wire it up, in NocoDB: open your feedback table → add a **Form** view →
 * **Share** → enable "Anyone with the link" → copy the link → paste it below.
 * An empty string hides that button.
 */
export const FEEDBACK: {
  /** Public NocoDB Form-View link for bug reports. */
  bugFormUrl: string;
  /** Public NocoDB Form-View link for ideas / suggestions. */
  suggestionFormUrl: string;
  /**
   * Form fields to pre-fill from the live run context. NocoDB pre-fills a form
   * field from a query param whose key exactly matches the field's **title**, so
   * each key here must be a field title present on the form; a key with no matching
   * field is silently ignored, so it is safe to list one only some forms have.
   *
   * The default pre-fills a **Wave** field with the current wave number (add a
   * Number/Text field titled exactly "Wave" to the form). To attach the full
   * run/device blob instead, add e.g. `Context: formatContext`.
   */
  prefill: Record<string, (ctx: FeedbackContext) => string>;
  /** Community Discord invite. Unlike the forms it takes no context — it is a
   *  plain link out. Empty string hides the button. */
  discordUrl: string;
} = {
  bugFormUrl: 'https://app.nocodb.com/nc/form/86cb8d1f-883f-47b8-a9a2-0b6e27797c8b',
  suggestionFormUrl: 'https://app.nocodb.com/nc/form/9b6cb5a8-c74c-4c2b-ae8f-ffda0ec15aa4',
  prefill: {
    Wave: (ctx) => String(ctx.wave),
  },
  discordUrl: 'https://discord.gg/TdJQJXPkzF',
};

/** Whether at least one destination is configured (drives showing the launcher). */
export const FEEDBACK_ENABLED = !!(FEEDBACK.bugFormUrl || FEEDBACK.suggestionFormUrl || FEEDBACK.discordUrl);

/** Auto-captured run/device context attached to a report (best-effort). */
export interface FeedbackContext {
  wave: number;
  mode: string;
  lives: number;
  gold: number;
  build: string;
  screen: string;
  ua: string;
  when: string;
}

/** A one-line, human-readable context string for the NocoDB context field. */
export function formatContext(ctx: FeedbackContext): string {
  return [
    `wave ${ctx.wave}`,
    ctx.mode,
    `lives ${ctx.lives}`,
    `gold ${ctx.gold}`,
    `build ${ctx.build}`,
    ctx.screen,
    ctx.when,
    ctx.ua,
  ].join(' · ');
}

/** Build the outgoing form URL, appending a query param for every field in
 *  {@link FEEDBACK.prefill} so the matching form fields arrive pre-filled. */
export function feedbackUrl(base: string, ctx: FeedbackContext): string {
  if (!base) return base;
  try {
    const u = new URL(base);
    for (const [field, valueOf] of Object.entries(FEEDBACK.prefill)) {
      u.searchParams.set(field, valueOf(ctx));
    }
    return u.toString();
  } catch {
    return base; // malformed URL — fall back to the plain link
  }
}
