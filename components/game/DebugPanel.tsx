'use client';

import React, { useState } from 'react';
import type { GameEngine } from '@/lib/game/core/engine';
import { MovablePanel } from './MovablePanel';
import { CheatsTab, type DebugUi } from './debug-cheats';
import { BestiaryTab, BestiaryLightbox, useBestiary } from './debug-bestiary';

export type { DebugUi };

/** In-game debug + bestiary panel. Two tabs: "Cheats" (set wave/gold/lives,
 *  spawn a custom wave, clear the field) and "Bestiary" (a model viewer that
 *  plays each enemy's baked walk/hurt/death clips off-wave, with its stats).
 *
 *  This file is only the frame: the tab strip, and the two tabs' own modules. */
export function DebugPanel({ engineRef, ui, onClose, globalLock }: {
  engineRef: React.RefObject<GameEngine | null>;
  ui: DebugUi;
  onClose: () => void;
  globalLock: boolean;
}) {
  const [tab, setTab] = useState<'cheats' | 'bestiary'>('cheats');
  // The bestiary's state lives here because its lightbox is drawn outside the
  // panel, over the whole board — both halves read the same selection.
  const bestiary = useBestiary();

  return (
    <>
      <MovablePanel
        id="debug"
        globalLock={globalLock}
        className="rs-panel absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 p-3 z-30 w-[26em]"
        style={{ fontSize: 'clamp(13px, 0.9vw, 18px)' }}
      >
        <div className="rs-panel-title flex items-center justify-between">
          <span className="flex items-center gap-2">🛠 Debug</span>
          <button onClick={onClose} title="Close" className="rs-btn px-[0.5em] py-0 text-[0.8em]">✕</button>
        </div>

        <div className="grid grid-cols-2 gap-[0.3em] my-[0.6em]">
          {(['cheats', 'bestiary'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rs-btn py-[0.3em] text-[0.8em] capitalize ${tab === t ? 'rs-btn-primary' : ''}`}
            >
              {t === 'cheats' ? 'Cheats' : 'Bestiary'}
            </button>
          ))}
        </div>

        <CheatsTab engineRef={engineRef} ui={ui} active={tab === 'cheats'} />
        {tab === 'bestiary' && <BestiaryTab st={bestiary} />}
      </MovablePanel>

      <BestiaryLightbox st={bestiary} />
    </>
  );
}
