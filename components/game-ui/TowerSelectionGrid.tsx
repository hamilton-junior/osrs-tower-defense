
import React from 'react';
import { TOWERS as TOWER_DATA } from '@/lib/game/data/towers';

interface TowerSelectionGridProps {
  money: number;
  selectedTower: string | null;
  setSelectedTower: (tower: string | null) => void;
  setSelectedPlacedTower: (tower: any | null) => void;
  setActiveTooltip: (tooltip: any | null) => void;
}

export const TowerSelectionGrid: React.FC<TowerSelectionGridProps> = ({
  money,
  selectedTower,
  setSelectedTower,
  setSelectedPlacedTower,
  setActiveTooltip
}) => {
  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 z-10 pointer-events-none">
      {selectedTower && (
        <div className="text-center mb-1 text-[11px] text-osrs-yellow font-bold bg-black/80 py-0.5 px-4 border border-osrs-yellow/50 rounded-sm tracking-widest uppercase animate-pulse font-mono">
          Click on map to place — [ESC to cancel]
        </div>
      )}
      <div className="flex bg-[#3e2e18]/90 border-2 border-[var(--osrs-border-dark)] p-1 gap-1 pointer-events-auto rounded shadow-2xl">
        {Object.values(TOWER_DATA).map((tower: any) => {
          const isSelected = selectedTower === tower.type;
          const firstTier = tower.tiers[0];
          const canAfford = money >= firstTier.upgradeCost;
          return (
            <button
              key={tower.type}
              onClick={() => {
                setSelectedTower(isSelected ? null : tower.type);
                setSelectedPlacedTower(null);
              }}
              onMouseEnter={(e) => {
                const damageInfo = firstTier.maxDamage ? `Hit: ${firstTier.minDamage || 0}-${firstTier.maxDamage}` : `Damage: ${firstTier.damage}`;
                setActiveTooltip({
                  x: e.clientX, y: e.clientY,
                  title: tower.baseName.toUpperCase(),
                  content: `${firstTier.name} (${damageInfo})`,
                  bonus: `Path: ${tower.tiers.map((t: any) => t.name).join(' → ')}`,
                  color: firstTier.color
                });
              }}
              onMouseLeave={() => setActiveTooltip(null)}
              disabled={!canAfford}
              className={`
                flex flex-col items-center w-[68px] py-1.5 px-1 border-2 transition-all relative group
                ${isSelected ? 'border-osrs-yellow bg-[#4a3f35] shadow-[0_0_8px_rgba(255,255,0,0.6)]' : 'border-[#2d2d2d] bg-[#1a1a1a] hover:bg-[#2d2d2d] hover:border-[#5d5d5d]'}
                ${!canAfford ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}
              `}
            >
              <div className="w-9 h-9 flex items-center justify-center relative mb-0.5">
                <img
                  src={`https://oldschool.runescape.wiki/images/${tower.tiers[0].name.replace(/ /g, '_')}.png`}
                  alt={tower.baseName}
                  className="max-w-full max-h-full object-contain drop-shadow-md"
                  onError={(e) => { 
                    const img = e.target as HTMLImageElement;
                    if (!img.src.includes('_detail')) {
                      img.src = `https://oldschool.runescape.wiki/images/${tower.tiers[0].name.replace(/ /g, '_')}_detail.png`;
                    } else {
                      img.style.display='none'; 
                    }
                  }}
                />
              </div>
              <span className="text-[9px] font-bold uppercase tracking-tight" style={{ color: firstTier.color }}>{tower.baseName}</span>
              <span className={`text-[9px] font-bold ${canAfford ? 'text-osrs-green' : 'text-osrs-red'}`}>{firstTier.upgradeCost}gp</span>
              {isSelected && <div className="absolute -top-1 -right-1 w-2 h-2 bg-osrs-yellow rounded-full animate-ping" />}
            </button>
          );
        })}
      </div>
    </div>
  );
};
