
import React from 'react';

interface ActivePotionsDisplayProps {
  activePotions: any[];
}

export const ActivePotionsDisplay: React.FC<ActivePotionsDisplayProps> = ({ activePotions }) => {
  if (!activePotions || activePotions.length === 0) return null;

  return (
    <div className="absolute bottom-4 right-[300px] flex flex-col-reverse gap-1 z-10 pointer-events-none">
      {activePotions.map((p: any) => (
        <div key={p.type} className="flex items-center gap-2 bg-black/60 border border-osrs-yellow/30 p-1 rounded-sm min-w-[100px] group relative">
          <img 
            src={`https://oldschool.runescape.wiki/images/${p.type.charAt(0).toUpperCase() + p.type.slice(1).replace('_', ' ')}_potion(4).png`} 
            className="w-5 h-5 object-contain" 
            alt="" 
            onError={(e) => { if (!(e.target as HTMLImageElement).src.includes('Vial_detail.png')) (e.target as HTMLImageElement).src = 'https://oldschool.runescape.wiki/images/Vial_detail.png'; else (e.target as HTMLImageElement).style.opacity = '0'; }}
          />
          <div className="flex flex-col">
            <span className="text-[9px] text-osrs-yellow font-bold uppercase leading-none">{p.type.replace('_', ' ')}</span>
            <span className="text-[8px] text-white font-mono leading-none">{Math.floor(p.timer)}s</span>
          </div>
          <div className="absolute left-full ml-2 bg-black/90 border border-osrs-border-light p-2 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 w-32">
            <p className="text-[9px] text-osrs-yellow font-bold uppercase mb-1">{p.type.replace('_', ' ')}</p>
            <p className="text-[8px] text-white leading-tight">Active combat boost. Duration stacks with multiple doses.</p>
          </div>
        </div>
      ))}
    </div>
  );
};
