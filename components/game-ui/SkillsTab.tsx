
import React from 'react';
import { ASSETS } from '@/lib/game/assets';

interface SkillsTabProps {
  playerSkills: Record<string, any>;
  setShowAchievements: (show: boolean) => void;
  setActiveTooltip: (tooltip: any | null) => void;
  playSound: (sound: string) => void;
}

export const SkillsTab: React.FC<SkillsTabProps> = ({ 
  playerSkills, 
  setShowAchievements, 
  setActiveTooltip,
  playSound 
}) => {
  return (
    <div className="flex flex-col gap-2">
      <div className="text-center border-b border-[var(--osrs-border-light)] pb-1">
        <span className="text-xs font-bold text-osrs-orange uppercase">Character Stats</span>
      </div>
      <button 
        onClick={() => {
          playSound('interface_open');
          setShowAchievements(true);
        }}
        className="osrs-button w-full py-1 text-xs uppercase mb-2"
      >
        View Diary
      </button>
      <div className="grid grid-cols-2 gap-x-2 gap-y-3 mt-1">
        {Object.entries(playerSkills || {}).map(([key, skill]: [string, any]) => (
          <div 
            key={key} 
            className="flex items-center gap-2 group relative cursor-help p-1 hover:bg-white/5 rounded"
            onMouseEnter={(e) => setActiveTooltip({
              x: e.clientX, y: e.clientY,
              title: key.toUpperCase(), 
              content: `Level: ${skill.level} (XP: ${skill.xp} / ${Math.pow(skill.level, 2) * 100})`,
              color: '#ff981f'
            })}
            onMouseLeave={() => setActiveTooltip(null)}
          >
            <img src={`${ASSETS.misc.wiki_base}${key.charAt(0).toUpperCase() + key.slice(1)}_icon.png`} className="w-6 h-6 object-contain" alt="" />
            <div className="flex flex-col">
               <span className="text-sm text-osrs-yellow font-bold leading-tight">{skill.level}</span>
               <span className="text-[11px] text-[#c0c0c0] uppercase tracking-tighter leading-none">{key}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
