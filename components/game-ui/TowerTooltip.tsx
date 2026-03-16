
import React from 'react';

interface TowerTooltipProps {
  activeTooltip: any;
}

function TierIcon({ name }: { name: string }) {
  return (
    <img
      src={`https://oldschool.runescape.wiki/images/${name.replace(/ /g, '_')}.png`}
      className="w-4 h-4 object-contain"
      alt={name}
      title={name}
      onError={(e) => {
        const img = e.currentTarget;
        if (!img.src.includes('_detail')) {
          img.src = `https://oldschool.runescape.wiki/images/${name.replace(/ /g, '_')}_detail.png`;
        } else {
          img.style.display = 'none';
        }
      }}
    />
  );
}

function clamp(x: number, y: number, w = 270, h = 200) {
  let left = x + 15;
  let top = y + 15;
  if (typeof window !== 'undefined') {
    if (left + w > window.innerWidth - 8) left = x - w - 8;
    if (top + h > window.innerHeight - 8) top = y - h - 8;
  }
  return { left: Math.max(8, left), top: Math.max(8, top) };
}

export const TowerTooltip: React.FC<TowerTooltipProps> = ({ activeTooltip }) => {
  if (!activeTooltip) return null;

  const { left, top } = clamp(activeTooltip.x, activeTooltip.y);

  return (
    <div
      className="fixed z-[100] pointer-events-none osrs-panel p-3 min-w-[180px] max-w-[270px] shadow-[0_0_15px_rgba(0,0,0,0.7)]"
      style={{ left, top }}
    >
      <div className="flex flex-col gap-1.5">
        <div className="flex justify-between items-center border-b border-[var(--osrs-border-dark)] pb-1">
          <span className="font-bold text-sm uppercase tracking-wider" style={{ color: activeTooltip.color || '#ff981f' }}>
            {activeTooltip.title}
          </span>
          {activeTooltip.level && <span className="text-[10px] text-white opacity-60">Lvl {activeTooltip.level}</span>}
        </div>
        <p className="text-xs text-white/90 leading-relaxed italic">{activeTooltip.content}</p>

        {/* Upgrade path tier icons */}
        {activeTooltip.tierIcons && activeTooltip.tierIcons.length > 0 && (
          <div className="mt-1 pt-1 border-t border-white/10">
            <p className="text-[9px] text-[#c0c0c0] uppercase mb-1 tracking-widest">Upgrade Path</p>
            <div className="flex items-center gap-1 flex-wrap">
              {activeTooltip.tierIcons.map((name: string, idx: number) => (
                <React.Fragment key={name}>
                  <div className="flex flex-col items-center gap-0.5">
                    <TierIcon name={name} />
                    <span className="text-[7px] text-[#888] text-center leading-tight max-w-[36px] truncate">{name}</span>
                  </div>
                  {idx < activeTooltip.tierIcons.length - 1 && (
                    <span className="text-[#5d5d5d] text-xs mb-3">›</span>
                  )}
                </React.Fragment>
              ))}
            </div>
          </div>
        )}

        {(activeTooltip.bonus || activeTooltip.stats) && (
          <div className="mt-1 pt-1 border-t border-white/10 text-[10px] text-osrs-green font-mono">
            {activeTooltip.bonus || activeTooltip.stats}
          </div>
        )}
      </div>
    </div>
  );
};
