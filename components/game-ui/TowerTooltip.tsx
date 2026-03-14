
import React from 'react';

interface TowerTooltipProps {
  activeTooltip: any;
}

export const TowerTooltip: React.FC<TowerTooltipProps> = ({ activeTooltip }) => {
  if (!activeTooltip) return null;

  return (
    <div 
      className="fixed z-[100] pointer-events-none osrs-panel p-3 min-w-[180px] max-w-[250px] shadow-[0_0_15px_rgba(0,0,0,0.7)] animate-in fade-in zoom-in duration-200"
      style={{ left: activeTooltip.x + 15, top: activeTooltip.y + 15 }}
    >
      <div className="flex flex-col gap-1.5">
        <div className="flex justify-between items-center border-b border-[var(--osrs-border-dark)] pb-1">
          <span className="font-bold text-sm uppercase tracking-wider" style={{ color: activeTooltip.color || '#ff981f' }}>{activeTooltip.title}</span>
          {activeTooltip.level && <span className="text-[10px] text-white opacity-60">Lvl {activeTooltip.level}</span>}
        </div>
        <p className="text-xs text-white/90 leading-relaxed italic">{activeTooltip.content}</p>
        {(activeTooltip.bonus || activeTooltip.stats) && (
          <div className="mt-1 pt-1 border-t border-white/10 text-[10px] text-osrs-green font-mono">
            {activeTooltip.bonus || activeTooltip.stats}
          </div>
        )}
      </div>
    </div>
  );
};
