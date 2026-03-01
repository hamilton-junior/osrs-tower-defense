'use client';

import React, { useState, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import { Settings, Send } from 'lucide-react';
import { GoogleGenAI } from '@google/genai';

// Dynamically import the game component to avoid SSR issues with canvas
const GameCanvas = dynamic(() => import('@/components/GameCanvas'), { ssr: false });

export default function Page() {
  const [showSettings, setShowSettings] = useState(false);

  return (
    <div className="h-screen w-screen bg-[#1e1e1e] text-[#ffff00] font-mono flex flex-col overflow-hidden">
      <header className="w-full bg-[#3d3d3d] border-b-4 border-[#5d5d5d] p-4 flex justify-between items-center shadow-lg z-20">
        <h1 className="text-2xl font-bold text-[#ffff00] drop-shadow-md" style={{ textShadow: '2px 2px 0 #000' }}>
          OSRS Tower Defense
        </h1>
        <div className="flex gap-4">
          <button 
            onClick={() => setShowSettings(!showSettings)}
            className="flex items-center gap-2 bg-[#5d5d5d] hover:bg-[#6d6d6d] px-3 py-1 border-2 border-[#2d2d2d] rounded shadow-sm transition-colors"
          >
            <Settings size={18} />
            <span>Settings</span>
          </button>
        </div>
      </header>

      <main className="flex-1 w-full relative overflow-hidden bg-[#000]">
        <GameCanvas />
      </main>

      {showSettings && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-[#3d3d3d] border-4 border-[#5d5d5d] p-6 max-w-md w-full shadow-2xl rounded-lg">
            <h2 className="text-xl font-bold text-[#ffff00] mb-4 text-center" style={{ textShadow: '1px 1px 0 #000' }}>Game Settings</h2>
            <div className="space-y-4">
              <p className="text-sm text-[#c0c0c0]">Settings are currently managed in-game via the Grand Exchange and Tower Menus.</p>
              <div className="flex justify-end gap-2 mt-6">
                <button 
                  onClick={() => setShowSettings(false)}
                  className="bg-[#5d5d5d] hover:bg-[#6d6d6d] px-4 py-2 border-2 border-[#2d2d2d] text-[#ffff00] font-bold"
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
