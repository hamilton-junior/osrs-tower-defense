
import React from 'react';
import { ASSETS } from '@/lib/game/assets';

interface TopOverlayProps {
  money: number;
  runeEssence: number;
  wave: number;
  isSidebarCollapsed: boolean;
  setActiveTooltip: (tooltip: any | null) => void;
}

export const TopOverlay: React.FC<TopOverlayProps> = ({ 
  money, 
  runeEssence, 
  wave, 
  isSidebarCollapsed,
  setActiveTooltip 
}) => {
  return (
    <div className={`absolute top-10 left-1/2 -translate-x-1/2 flex gap-4 pointer-events-none z-10 transition-all duration-300 ${isSidebarCollapsed ? '-translate-y-20 opacity-0' : ''}`}>
      <div className="osrs-panel px-6 py-2 flex items-center gap-8 pointer-events-auto shadow-2xl">
        <div 
          className="flex items-center gap-2 group cursor-help" 
          onMouseEnter={(e) => setActiveTooltip({ 
            x: e.clientX, 
            y: e.clientY, 
            title: 'GP (Coins)', 
            content: 'Main currency used to buy and upgrade towers.', 
            color: '#ffff00' 
          })} 
          onMouseLeave={() => setActiveTooltip(null)}
        >
          <img src={ASSETS.misc.coins_icon} className="w-8 h-8 object-contain drop-shadow-md" alt="GP" />
          <span className="text-osrs-yellow font-bold text-xl drop-shadow-md">{money.toLocaleString()}</span>
        </div>
        <div 
          className="flex items-center gap-2 group cursor-help" 
          onMouseEnter={(e) => setActiveTooltip({ 
            x: e.clientX, 
            y: e.clientY, 
            title: 'Rune Essence', 
            content: 'Rare magical essence used for global permanent upgrades.', 
            color: '#00ffff' 
          })} 
          onMouseLeave={() => setActiveTooltip(null)}
        >
          <img src={ASSETS.misc.rune_essence_icon} className="w-8 h-8 object-contain drop-shadow-md" alt="Essence" />
          <span className="text-osrs-cyan font-bold text-xl drop-shadow-md">{(runeEssence || 0).toLocaleString()}</span>
        </div>
        <div className="border-l-2 border-[var(--osrs-border-dark)] pl-4 flex flex-col items-center">
          <span className="text-xs text-osrs-orange font-bold uppercase tracking-widest leading-none mb-1">Wave</span>
          <span className="text-white font-bold text-2xl leading-none drop-shadow-md">{wave}</span>
        </div>
      </div>
    </div>
  );
};
