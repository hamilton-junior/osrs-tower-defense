'use client';

import React, { useState } from 'react';
import type { GameEngine } from '@/lib/game/core/engine';
import { ASSETS } from '@/lib/game/assets';
import { GENIE_LAMP } from '@/lib/game/data/diversions';
import { MovablePanel } from './MovablePanel';
import { fs, hideBrokenImg } from './ui-kit';
import {
  DiversionTab, RunTab, SkillsTab, SpawnTab, ToolsTab, useSpawnPicks, type DebugUi,
} from './debug-cheats';
import { BestiaryTab, BestiaryLightbox, useBestiary } from './debug-bestiary';

export type { DebugUi };

type DebugTabId = 'run' | 'spawn' | 'dd' | 'skills' | 'tools' | 'bestiary';

/** The console's pages, one stone each, in the order a test usually walks them. */
const TABS: ReadonlyArray<{ id: DebugTabId; label: string; icon: string }> = [
  { id: 'run', label: 'Run', icon: ASSETS.misc.coins_icon },
  { id: 'spawn', label: 'Spawn', icon: ASSETS.misc.multicombat_icon },
  { id: 'dd', label: 'Distractions & Diversions', icon: GENIE_LAMP.icon },
  { id: 'skills', label: 'Skills', icon: ASSETS.misc.stats_icon },
  { id: 'tools', label: 'Tools', icon: ASSETS.misc.inventory_icon },
  { id: 'bestiary', label: 'Bestiary', icon: ASSETS.misc.slayer_crossbow },
];

/** In-game debug console: a stone tab strip over one scrolling page of cards.
 *
 *  This file is only the frame. The pages live in `debug-cheats` and
 *  `debug-bestiary`, and share that file's card and tile building blocks. */
export function DebugPanel({ engineRef, ui, onClose, globalLock }: {
  engineRef: React.RefObject<GameEngine | null>;
  ui: DebugUi;
  onClose: () => void;
  globalLock: boolean;
}) {
  const [tab, setTab] = useState<DebugTabId>('run');
  // Both pickers live in the frame so a trip to another page keeps them. The
  // bestiary's lightbox is also drawn outside the panel, over the whole board,
  // and has to read the same selection as its tab.
  const picks = useSpawnPicks();
  const bestiary = useBestiary();
  const active = TABS.find((t) => t.id === tab) ?? TABS[0];

  return (
    <>
      <MovablePanel
        id="debug"
        globalLock={globalLock}
        // Pinned by its top edge, not centred: pages differ in height, and a centred
        // panel would move its own tab strip on every switch.
        className="rs-panel absolute top-[6vh] left-1/2 -translate-x-1/2 z-30 p-[0.6em] w-[26em] flex flex-col"
        style={{ fontSize: fs('clamp(14px, 0.95vw, 20px)'), maxHeight: '80vh' }}
      >
        <div className="rs-panel-title flex items-center justify-between" style={{ fontSize: '1em' }}>
          <span className="flex items-center gap-[0.4em]">
            <img src={ASSETS.misc.construction_icon} alt="" className="w-[1.3em] h-[1.3em] object-contain" onError={hideBrokenImg} />
            Debug
          </span>
          <button onClick={onClose} title="Close" className="rs-btn px-[0.5em] py-0 text-[0.8em]">✕</button>
        </div>

        <div className="flex items-center gap-[0.3em] mt-[0.45em] shrink-0">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              title={t.label}
              aria-label={t.label}
              className={`rs-tab ${tab === t.id ? 'rs-tab-on' : ''}`}
            >
              <img src={t.icon} alt="" onError={hideBrokenImg} />
            </button>
          ))}
          <span className="ml-auto min-w-0 truncate text-[0.78em] font-bold text-osrs-yellow">{active.label}</span>
        </div>

        <div className="mt-[0.45em] min-h-0 flex-1 overflow-y-auto custom-scrollbar pr-[0.15em] space-y-[0.45em]">
          {tab === 'run' && <RunTab engineRef={engineRef} ui={ui} />}
          {tab === 'spawn' && <SpawnTab engineRef={engineRef} ui={ui} picks={picks} />}
          {tab === 'dd' && <DiversionTab engineRef={engineRef} ui={ui} />}
          {tab === 'skills' && <SkillsTab engineRef={engineRef} ui={ui} />}
          {tab === 'tools' && <ToolsTab engineRef={engineRef} ui={ui} />}
          {tab === 'bestiary' && <BestiaryTab st={bestiary} />}
        </div>
      </MovablePanel>

      <BestiaryLightbox st={bestiary} />
    </>
  );
}
