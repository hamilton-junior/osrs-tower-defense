'use client';

import React, { useState } from 'react';
import dynamic from 'next/dynamic';
import { Settings } from 'lucide-react';

// Dynamically import the game component to avoid SSR issues with canvas
const GameCanvas = dynamic(() => import('@/components/GameCanvas'), { ssr: false });

export default function Page() {
  const [showSettings, setShowSettings] = useState(false);

  return (
    <div className="h-screen w-screen bg-black text-osrs-yellow font-osrs flex flex-col overflow-hidden">
      <header className="w-full bg-[var(--osrs-brown)] border-b-2 border-[var(--osrs-border-dark)] p-2 flex justify-between items-center shadow-md z-20 relative">
        <div className="absolute inset-x-0 bottom-0 h-[1px] bg-[var(--osrs-border-light)]"></div>
        <h1 className="text-2xl text-osrs-orange drop-shadow-md px-2">
          OSRS Tower Defense
        </h1>
        <div className="flex gap-4">
          <button 
            onClick={() => setShowSettings(!showSettings)}
            className="osrs-button flex items-center gap-2 px-3 py-1"
          >
            <Settings size={16} />
            <span>Settings</span>
          </button>
        </div>
      </header>

      <main className="flex-1 w-full relative overflow-hidden bg-[#000]">
        <GameCanvas />
      </main>

      {showSettings && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="osrs-window p-1 max-w-md w-full">
            <div className="osrs-window-title mb-4">
              <span>Game Settings</span>
              <button 
                onClick={() => setShowSettings(false)}
                className="text-osrs-red hover:text-white"
              >
                X
              </button>
            </div>
            <div className="p-4 space-y-4 bg-[var(--osrs-brown-dark)]/30">
              <p className="text-lg text-[#c0c0c0] text-center">Settings are currently managed in-game via the Grand Exchange and Tower Menus.</p>
              <div className="flex justify-center mt-6">
                <button 
                  onClick={() => setShowSettings(false)}
                  className="osrs-button px-6 py-2 w-full"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
