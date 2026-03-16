'use client';

import React from 'react';
import { motion } from 'motion/react';

interface GameOverModalProps {
  wave: number;
  money: number;
  essence: number;
  onRestart: () => void;
}

export function GameOverModal({ wave, money, essence, onRestart }: GameOverModalProps) {
  const totalScore = money + essence;

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[100] p-4">
      <motion.div 
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="osrs-window max-w-md w-full p-1"
      >
        <div className="osrs-window-title">
          <span>Game Over</span>
        </div>
        
        <div className="p-6 space-y-6 text-center bg-[var(--osrs-brown-dark)]/40">
          <div className="space-y-2">
            <h2 className="text-4xl text-osrs-red font-bold drop-shadow-lg">YOU DIED</h2>
            <p className="text-osrs-orange text-lg">Your journey ends here...</p>
          </div>

          <div className="grid grid-cols-2 gap-4 py-4 border-y border-white/10">
            <div className="text-center">
              <p className="text-gray-400 text-sm uppercase">Wave Reached</p>
              <p className="text-2xl text-osrs-yellow">{wave}</p>
            </div>
            <div className="text-center">
              <p className="text-gray-400 text-sm uppercase">Total Score</p>
              <p className="text-2xl text-osrs-green">{totalScore}</p>
            </div>
          </div>

          <div className="space-y-3">
            <button 
              onClick={onRestart}
              className="osrs-button w-full py-3 text-xl hover:scale-105 transition-transform"
            >
              Restart Game
            </button>
          </div>
          
          <p className="text-xs text-gray-500 italic">
            "Oh dear, you are dead!"
          </p>
        </div>
      </motion.div>
    </div>
  );
}
