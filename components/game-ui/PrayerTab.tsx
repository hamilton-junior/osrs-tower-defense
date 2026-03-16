
import React from 'react';
import { ASSETS } from '@/lib/game/assets';

interface PrayerTabProps {
  prayerPoints: number;
  maxPrayerPoints: number;
  prayerDrainRate: number;
  playerSkills: any;
  allPrayers: any[];
  activePrayers: Set<string>;
  togglePrayer: (id: string) => void;
  setActiveTooltip: (tooltip: any | null) => void;
}

export const PrayerTab: React.FC<PrayerTabProps> = ({ 
  prayerPoints, 
  maxPrayerPoints, 
  prayerDrainRate, 
  playerSkills, 
  allPrayers, 
  activePrayers, 
  togglePrayer, 
  setActiveTooltip 
}) => {
  return (
    <div className="flex flex-col gap-2">
      <div className="text-center border-b border-[var(--osrs-border-light)] pb-1">
        <span className="text-xs font-bold text-osrs-orange uppercase">Prayers</span>
      </div>
      <div className="flex justify-between items-center px-1">
        <span className="text-[10px] text-osrs-cyan font-bold">Points: {Math.ceil(prayerPoints || 0)} / {maxPrayerPoints}</span>
        <span className="text-[9px] text-[#c0c0c0] italic">Drain: {prayerDrainRate?.toFixed(1) || 0}/s</span>
      </div>
      <div className="grid grid-cols-4 gap-1 mt-1">
        {allPrayers.map((p: any) => {
          const isActive = activePrayers.has(p.id);
          const canUse = (playerSkills?.prayer?.level || 1) >= p.level;
          return (
            <div 
              key={p.id} 
              className={`aspect-square border cursor-pointer relative group/prayer flex items-center justify-center ${isActive ? 'bg-osrs-green/30 border-osrs-yellow shadow-[0_0_5px_rgba(255,255,0,0.5)]' : 'bg-black/40 border-[var(--osrs-border-light)]'} ${!canUse ? 'opacity-30 grayscale' : 'hover:border-white'}`}
              onClick={() => canUse && togglePrayer(p.id)}
              onMouseEnter={(e) => setActiveTooltip({
                x: e.clientX, y: e.clientY,
                title: p.name, content: p.description,
                bonus: canUse ? `Drain: ${p.drain}/s` : `Requires Level ${p.level} Prayer`, 
                color: canUse ? '#ffff00' : '#ff0000'
              })}
              onMouseLeave={() => setActiveTooltip(null)}
            >
              <img 
                src={`${ASSETS.misc.wiki_base}${p.name.replace(/ /g, '_')}_icon.png`} 
                className="w-full h-full object-contain p-1" 
                alt="" 
                onError={(e) => {
                  if (!(e.target as HTMLImageElement).src.includes('Prayer_icon.png')) (e.target as HTMLImageElement).src = ASSETS.misc.prayer_icon;
                  else (e.target as HTMLImageElement).style.opacity = '0';
                }}
              />
              {!canUse && <div className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-osrs-red">Lvl {p.level}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
};
