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
   * Form fields to pre-fill from the live run context, keyed by the field's exact
   * **title** on the form. A key with no matching field is silently ignored, so it
   * is safe to list one only some forms have.
   *
   * ⚠ Three things must ALL be true or the value is dropped without a word — this
   * was verified against the live forms (2026-07-17), where none of them held:
   *   1. The field exists on the **table**.
   *   2. The field has been added to the **Form view** itself. A field can exist on
   *      the table and simply not be on the form — prefill has nothing to fill.
   *   3. **Enable Prefill** is toggled on in that form's *Share* dialog. It is OFF
   *      by default, and while it is off NO query param prefills anything, on any
   *      URL shape. (Free feature, all plans — just off until asked for.)
   *
   * NocoDB's documented URL shape puts the params inside the hash route
   * (`https://app.nocodb.com/#/nc/form/<id>?Wave=12`); {@link feedbackUrl} builds a
   * plain query string instead. Which of the two the live forms honour can only be
   * settled once (3) is on — re-test then and fix the builder if needed.
   *
   * The default pre-fills a **Wave** field with the current wave number. To attach
   * the full run/device blob instead, add e.g. `Context: formatContext`.
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
