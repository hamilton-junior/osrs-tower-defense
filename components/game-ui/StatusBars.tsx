
import React from 'react';

interface StatusBarsProps {
  currentHP: number;
  maxHP: number;
  currentPrayer: number;
  maxPrayer: number;
}

export const StatusBars: React.FC<StatusBarsProps> = ({ 
  currentHP, 
  maxHP, 
  currentPrayer, 
  maxPrayer 
}) => {
  return (
    <div className="flex flex-col gap-1 px-2 py-2 border-b border-[var(--osrs-border-dark)] bg-black/40">
      {/* Hitpoints Bar */}
      <div className="flex flex-col">
        <div className="flex justify-between items-center px-1">
          <span className="text-[9px] text-osrs-red font-bold uppercase tracking-widest">Hitpoints</span>
          <span className="text-[10px] text-white font-bold">{Math.ceil(currentHP)}/{maxHP}</span>
        </div>
        <div className="h-4 bg-black border border-[var(--osrs-border-light)] relative rounded overflow-hidden">
          <div 
            className="h-full bg-gradient-to-r from-[#800000] to-[#ff0000] transition-all duration-300" 
            style={{ width: `${Math.max(0, (currentHP / maxHP) * 100)}%` }} 
          />
        </div>
      </div>

      {/* Prayer Bar */}
      <div className="flex flex-col mt-1">
        <div className="flex justify-between items-center px-1">
          <span className="text-[9px] text-osrs-cyan font-bold uppercase tracking-widest">Prayer</span>
          <span className="text-[10px] text-white font-bold">{Math.floor(currentPrayer)}/{maxPrayer}</span>
        </div>
        <div className="h-4 bg-black border border-[var(--osrs-border-light)] relative rounded overflow-hidden">
          <div 
            className={`h-full bg-gradient-to-r from-[#008080] to-[#00ffff] transition-all duration-300 ${currentPrayer > 0 ? 'animate-pulse' : ''}`} 
            style={{ width: `${Math.max(0, (currentPrayer / maxPrayer) * 100)}%` }} 
          />
        </div>
      </div>
    </div>
  );
};
