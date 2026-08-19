'use client';

import React, { useEffect, useMemo, useState } from 'react';
import type { UIState } from '@/lib/game/core/engine';
import { FEEDBACK, feedbackUrl, type FeedbackContext } from '@/lib/game/feedback';
import { loadChangelog, CHANGELOG_KINDS, type ChangelogEntry } from '@/lib/game/changelog';
import { fs } from './ui-kit';

/**
 * The 💬 panel: the recent-updates list baked from git history, and the links out
 * to the feedback forms and the Discord invite.
 *
 * Nothing a player types comes back through here — the form lives on NocoDB and
 * the changelog is written by us, so every line rendered is ours. Moved out of
 * GameRoot.tsx verbatim.
 */

export const CHANGE_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** 'YYYY-MM-DD' → '17 Jul 2026' (parsed by hand to dodge timezone shifts). */
export function formatChangeDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const [, y, mo, d] = m;
  return `${Number(d)} ${CHANGE_MONTHS[Number(mo) - 1] ?? mo} ${y}`;
}

/** Fold the (newest-first) changelog into consecutive same-day groups, order kept. */
export function groupChangesByDate(entries: ChangelogEntry[]): { date: string; items: ChangelogEntry[] }[] {
  const groups: { date: string; items: ChangelogEntry[] }[] = [];
  for (const e of entries) {
    const last = groups[groups.length - 1];
    if (last && last.date === e.date) last.items.push(e);
    else groups.push({ date: e.date, items: [e] });
  }
  return groups;
}

/** In-game feedback launcher — opens the configured NocoDB Form Views in a new
 *  tab. No API/token: these are public form pages the player fills externally.
 *  The current wave (and any other field in FEEDBACK.prefill) rides along on the
 *  URL so a report arrives pre-filled (see lib/game/feedback.ts). */
export function FeedbackModal({ ui, onClose }: { ui: UIState; onClose: () => void }) {
  // The baked changelog (git history → public/data/changelog.json). Loaded once
  // when the panel opens; a failure just leaves the list empty (loadChangelog
  // never throws), so the forms above always work even offline.
  const [changes, setChanges] = useState<ChangelogEntry[] | null>(null);
  useEffect(() => {
    const ac = new AbortController();
    loadChangelog(ac.signal).then(setChanges);
    return () => ac.abort();
  }, []);

  const ctx: FeedbackContext = useMemo(() => ({
    wave: ui.wave,
    mode: ui.gameMode,
    lives: ui.lives,
    gold: ui.money,
    build: (process.env.NEXT_PUBLIC_BUILD_SHA || 'live').slice(0, 7),
    screen: typeof window !== 'undefined' ? `${window.innerWidth}×${window.innerHeight}` : '',
    ua: typeof navigator !== 'undefined' ? navigator.userAgent : '',
    when: new Date().toISOString(),
  }), [ui.wave, ui.gameMode, ui.lives, ui.money]);

  const open = (base: string) => {
    const url = feedbackUrl(base, ctx);
    if (url && typeof window !== 'undefined') window.open(url, '_blank', 'noopener,noreferrer');
    onClose();
  };

  return (
    <div className="absolute inset-0 bg-black/82 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="rs-panel p-5 w-[24em] max-w-[94vw] flex flex-col"
        style={{ fontSize: fs('clamp(14px, 0.95vw, 19px)') }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-[0.5em] mb-[0.3em]">
          <span className="text-osrs-orange font-bold text-[1.1em]">💬 Feedback</span>
          <button className="rs-btn px-[0.7em] py-[0.15em] text-[0.85em]" onClick={onClose} title="Close">✕</button>
        </div>
        <p className="text-[0.72em] text-[#cdbe91] mb-[0.7em] leading-snug">
          Opens a short form in a new tab. Thanks for helping shape the game — every note is read.
        </p>
        <div className="flex flex-col gap-[0.5em]">
          {FEEDBACK.bugFormUrl && (
            <button
              className="rs-btn w-full py-[0.5em] text-[0.95em] flex items-center justify-center gap-[0.4em]"
              title="Open the bug-report form in a new tab"
              onClick={() => open(FEEDBACK.bugFormUrl)}
            >
              🐛 Report a bug
            </button>
          )}
          {FEEDBACK.suggestionFormUrl && (
            <button
              className="rs-btn w-full py-[0.5em] text-[0.95em] flex items-center justify-center gap-[0.4em]"
              title="Open the suggestion form in a new tab"
              onClick={() => open(FEEDBACK.suggestionFormUrl)}
            >
              💡 Suggest an idea
            </button>
          )}
          {/* Recent updates — proof the notes above get acted on. Every line is a
              commit subject (never a player's words), and a 💬 marks the ones a
              report drove. Hidden until at least one entry loads, so a failed or
              empty fetch leaves no dead heading. */}
          {changes && changes.length > 0 && (
            <>
              <div className="border-t border-[var(--rs-keyline)] mt-[0.2em]" />
              <span className="text-osrs-orange font-bold text-[0.85em] mt-[0.1em]">🔨 Recent updates</span>
              <div className="flex flex-col gap-[0.55em] max-h-[13em] overflow-y-auto custom-scrollbar pr-[0.2em] -mt-[0.1em]">
                {groupChangesByDate(changes).map((group) => (
                  <div key={group.date} className="flex flex-col gap-[0.28em]">
                    {/* Date header — one per day the history touched, so a run of commits
                        reads as "here's what shipped on the 17th". */}
                    <span className="text-[#a99a76] text-[0.6em] uppercase tracking-wider">
                      {formatChangeDate(group.date)}
                    </span>
                    {group.items.map((c, i) => {
                      const badge = CHANGELOG_KINDS[c.kind];
                      return (
                        <div
                          key={i}
                          className={`flex items-start gap-[0.4em] text-[0.72em] leading-snug ${i > 0 ? 'border-t border-[var(--rs-bevel-dark)] pt-[0.28em]' : ''}`}
                        >
                          <span
                            className="shrink-0 mt-[0.15em] px-[0.35em] py-[0.02em] rounded-sm font-bold uppercase tracking-wide text-[0.78em] text-center"
                            style={{ color: badge.color, border: `1px solid ${badge.color}`, minWidth: '4.6em' }}
                          >
                            {badge.label}
                          </span>
                          <span className="text-[#e7d9b0] flex-1 min-w-0">
                            {c.scope && <span className="text-[#a99a76]">{c.scope}: </span>}
                            {c.text}
                            {c.fromFeedback && <span title="Driven by player feedback" className="ml-[0.3em]">💬</span>}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </>
          )}
          {/* Discord is a plain link out — no run context rides along, and it is a
              conversation rather than a report, so a rule separates it from the
              forms above. */}
          {FEEDBACK.discordUrl && (
            <>
              <div className="border-t border-[var(--rs-keyline)] mt-[0.2em]" />
              <a
                href={FEEDBACK.discordUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="rs-btn w-full py-[0.5em] text-[0.95em] flex items-center justify-center gap-[0.4em]"
                title="Join the community Discord — opens in a new tab"
                onClick={onClose}
              >
                <svg viewBox="0 0 24 24" className="w-[1.2em] h-[1.2em] shrink-0" fill="#5865f2" aria-hidden="true">
                  <path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z" />
                </svg>
                Join the Discord
              </a>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
