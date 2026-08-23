'use client';

import React, { useMemo, useRef, useState } from 'react';
import { decodeSaveCode, encodeSaveCode, summarizeAccount, type AccountSave, type AccountSummary } from '@/lib/game/systems/account-save';
import { clampTier, tierLabel } from '@/lib/game/systems/difficulty';
import { applyAccountSave, readAccountSave } from './save';
import { fs, fmt } from './ui-kit';

/**
 * The 💾 Save Code panel: the whole account as one line of text.
 *
 * There is no backend and none is planned, so progress lives in this browser's
 * localStorage and nowhere else — clearing site data or opening the game on a second
 * machine loses everything. This panel is the answer: export writes every account key
 * (plus the run in progress) into a checksummed code, import writes one back.
 *
 * Import is destructive by design — it replaces the account rather than merging with
 * it, because merging lets the same code be imported twice for double the progress.
 * So it always shows the two accounts side by side and asks first.
 */

type Tab = 'export' | 'import';

/** One row of the side-by-side an import shows before it overwrites anything. */
function CompareRow({ label, mine, theirs }: { label: string; mine: React.ReactNode; theirs: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[1fr_auto_auto] gap-[0.5em] items-baseline text-[0.75em] py-[0.12em]">
      <span className="text-[#a89870]">{label}</span>
      <span className="text-[#cdbe91] tabular-nums text-right w-[5em]">{mine}</span>
      <span className="text-osrs-orange font-bold tabular-nums text-right w-[5em]">{theirs}</span>
    </div>
  );
}

function summaryRows(s: AccountSummary) {
  return {
    essence: fmt(s.essence),
    kills: fmt(s.kills),
    victories: fmt(s.victories),
    achievements: fmt(s.achievements),
    tier: s.bestTier < 0 ? '—' : tierLabel(clampTier(s.bestTier)),
    run: s.runWave === null ? '—' : `Wave ${s.runWave}`,
  };
}

export function SaveCodeModal({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('export');

  // Read the account once when the panel opens: it is a snapshot, and re-reading it
  // on every render would hand out a new `savedAt` (and a new code) each time.
  const mine = useMemo(() => readAccountSave(), []);
  const myCode = useMemo(() => encodeSaveCode(mine), [mine]);
  const mySummary = useMemo(() => summarizeAccount(mine), [mine]);

  const [copied, setCopied] = useState(false);
  const [pasted, setPasted] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [incoming, setIncoming] = useState<AccountSave | null>(null);
  const codeRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(myCode);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // No clipboard permission (or an insecure origin) — select it instead so the
      // player's own Ctrl+C still works.
      codeRef.current?.select();
    }
  };

  const download = () => {
    const stamp = new Date().toISOString().slice(0, 10);
    const url = URL.createObjectURL(new Blob([myCode], { type: 'text/plain' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `osrs-td-save-${stamp}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const check = (text: string) => {
    const result = decodeSaveCode(text);
    if (result.ok) { setIncoming(result.save); setError(null); }
    else { setIncoming(null); setError(result.error); }
  };

  const openFile = (file: File | undefined) => {
    if (!file) return;
    file.text().then((text) => { setPasted(text.trim()); check(text); })
      .catch(() => setError('That file could not be read.'));
  };

  const confirmImport = () => {
    if (!incoming) return;
    applyAccountSave(incoming);
    // The engine reads meta once on mount, so a reload is what makes the imported
    // account the one on screen.
    window.location.reload();
  };

  const a = summaryRows(mySummary);
  const b = incoming ? summaryRows(summarizeAccount(incoming)) : null;

  return (
    <div className="absolute inset-0 bg-black/82 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="rs-panel p-5 w-[26em] max-w-[94vw] flex flex-col"
        style={{ fontSize: fs('clamp(14px, 0.95vw, 19px)') }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-[0.5em] mb-[0.4em]">
          <span className="text-osrs-orange font-bold text-[1.1em]">💾 Save Code</span>
          <button className="rs-btn px-[0.7em] py-[0.15em] text-[0.85em]" onClick={onClose} title="Close">✕</button>
        </div>
        <p className="text-[0.72em] text-[#cdbe91] mb-[0.6em] leading-snug">
          Your progress is stored in this browser only. Copy the code to keep it safe or to play on another machine.
        </p>

        <div className="flex gap-[0.3em] mb-[0.6em]">
          <button
            className={`rs-btn flex-1 py-[0.3em] text-[0.8em] ${tab === 'export' ? 'rs-btn-primary' : ''}`}
            title="Get the code for this account"
            onClick={() => setTab('export')}
          >
            ⬆ Export
          </button>
          <button
            className={`rs-btn flex-1 py-[0.3em] text-[0.8em] ${tab === 'import' ? 'rs-btn-primary' : ''}`}
            title="Load an account from a code"
            onClick={() => setTab('import')}
          >
            ⬇ Import
          </button>
        </div>

        {tab === 'export' ? (
          <div className="flex flex-col gap-[0.5em]">
            <textarea
              ref={codeRef}
              readOnly
              value={myCode}
              onFocus={(e) => e.currentTarget.select()}
              className="rs-slot w-full h-[6em] p-[0.5em] text-[0.62em] leading-snug break-all bg-black/30 text-[#cdbe91] resize-none"
              spellCheck={false}
            />
            <div className="flex gap-[0.4em]">
              <button className="rs-btn rs-btn-primary flex-1 py-[0.4em] text-[0.85em]" title="Copy the code to the clipboard" onClick={copy}>
                {copied ? '✔ Copied' : '📋 Copy'}
              </button>
              <button className="rs-btn flex-1 py-[0.4em] text-[0.85em]" title="Save the code as a text file" onClick={download}>
                💾 Download
              </button>
            </div>
            <div className="border-t border-[var(--rs-keyline)] mt-[0.2em] pt-[0.4em]">
              <div className="text-[0.7em] text-[#a89870] mb-[0.2em]">This code carries:</div>
              <CompareRow label="⚡ Rune essence" mine="" theirs={a.essence} />
              <CompareRow label="💀 Kills logged" mine="" theirs={a.kills} />
              <CompareRow label="🏆 Victories" mine="" theirs={a.victories} />
              <CompareRow label="📜 Achievements" mine="" theirs={a.achievements} />
              <CompareRow label="⚔ Highest tier" mine="" theirs={a.tier} />
              <CompareRow label="▶ Run in progress" mine="" theirs={a.run} />
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-[0.5em]">
            <textarea
              value={pasted}
              onChange={(e) => { setPasted(e.target.value); setIncoming(null); setError(null); }}
              placeholder="Paste a save code here"
              className="rs-slot w-full h-[6em] p-[0.5em] text-[0.62em] leading-snug break-all bg-black/30 text-[#cdbe91] resize-none"
              spellCheck={false}
            />
            <div className="flex gap-[0.4em]">
              <button
                className="rs-btn rs-btn-primary flex-1 py-[0.4em] text-[0.85em]"
                title="Check the pasted code"
                disabled={pasted.trim().length === 0}
                onClick={() => check(pasted)}
              >
                🔍 Check code
              </button>
              <button className="rs-btn flex-1 py-[0.4em] text-[0.85em]" title="Load a save file from this device" onClick={() => fileRef.current?.click()}>
                📂 Load file
              </button>
              <input
                ref={fileRef}
                type="file"
                accept=".txt,text/plain"
                className="hidden"
                onChange={(e) => { openFile(e.target.files?.[0]); e.target.value = ''; }}
              />
            </div>

            {error && <div className="text-[0.75em] text-osrs-red text-center">{error}</div>}

            {b && (
              <div className="border-t border-[var(--rs-keyline)] mt-[0.2em] pt-[0.4em]">
                <div className="grid grid-cols-[1fr_auto_auto] gap-[0.5em] text-[0.7em] text-[#a89870] mb-[0.15em]">
                  <span />
                  <span className="text-right w-[5em]">This browser</span>
                  <span className="text-right w-[5em] text-osrs-orange">The code</span>
                </div>
                <CompareRow label="⚡ Rune essence" mine={a.essence} theirs={b.essence} />
                <CompareRow label="💀 Kills logged" mine={a.kills} theirs={b.kills} />
                <CompareRow label="🏆 Victories" mine={a.victories} theirs={b.victories} />
                <CompareRow label="📜 Achievements" mine={a.achievements} theirs={b.achievements} />
                <CompareRow label="⚔ Highest tier" mine={a.tier} theirs={b.tier} />
                <CompareRow label="▶ Run in progress" mine={a.run} theirs={b.run} />
                <div className="text-[0.72em] text-osrs-warn text-center mt-[0.5em] leading-snug">
                  Importing replaces everything in this browser. It cannot be undone.
                </div>
                <button
                  className="rs-btn rs-btn-primary w-full py-[0.45em] text-[0.9em] mt-[0.4em]"
                  title="Replace this browser's progress with the code"
                  onClick={confirmImport}
                >
                  ⬇ Overwrite my progress
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
