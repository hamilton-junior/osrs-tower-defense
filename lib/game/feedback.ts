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
   * Optional. If your form has a text field whose **title** exactly matches this
   * string, we pre-fill it with an auto-captured context blob (wave, mode, lives,
   * gold, build, device, time) so a report arrives actionable. NocoDB pre-fills a
   * form field from a query param whose key matches the field title. Leave '' to
   * send the player to a blank form.
   */
  contextField: string;
} = {
  bugFormUrl: 'https://app.nocodb.com/nc/form/86cb8d1f-883f-47b8-a9a2-0b6e27797c8b',
  suggestionFormUrl: 'https://app.nocodb.com/nc/form/9b6cb5a8-c74c-4c2b-ae8f-ffda0ec15aa4',
  contextField: '',
};

/** Whether at least one form link is configured (drives showing the launcher). */
export const FEEDBACK_ENABLED = !!(FEEDBACK.bugFormUrl || FEEDBACK.suggestionFormUrl);

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

/** Build the outgoing form URL, appending the context param when both a form
 *  link and a {@link FEEDBACK.contextField} title are configured. */
export function feedbackUrl(base: string, ctx: FeedbackContext): string {
  if (!base || !FEEDBACK.contextField) return base;
  try {
    const u = new URL(base);
    u.searchParams.set(FEEDBACK.contextField, formatContext(ctx));
    return u.toString();
  } catch {
    return base; // malformed URL — fall back to the plain link
  }
}
