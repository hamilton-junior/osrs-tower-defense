
import React from 'react';
import { ASSETS } from '@/lib/game/assets';
import { TOWERS as TOWER_DATA } from '@/lib/game/data/towers';

interface TowerSelectionGridProps {
  money: number;
  selectedTower: string | null;
  setSelectedTower: (tower: string | null) => void;
  setSelectedPlacedTower: (tower: any | null) => void;
  setActiveTooltip: (tooltip: any | null) => void;
  towerCostReduction: number;
}

const DAMAGE_TYPE_ICONS: Record<string, string> = {
  archer: 'Ranged_icon',
  wizard: 'Magic_icon',
  cannon: 'Ranged_icon',
  tzhaar: 'Attack_icon',
  slayer: 'Ranged_icon',
  toxic: 'Magic_icon',
};

function wikiImg(name: string, onErr?: (e: React.SyntheticEvent<HTMLImageElement>) => void, cls?: string) {
  return (
    <img
      src={`${ASSETS.misc.wiki_base}${name.replace(/ /g, '_')}.png`}
      className={cls || 'max-w-full max-h-full object-contain drop-shadow-md'}
      alt={name}
      onError={(e) => {
        const img = e.currentTarget;
        if (img.dataset.errored) { img.style.display = 'none'; return; }
        img.dataset.errored = '1';
        img.src = `${ASSETS.misc.wiki_base}${name.replace(/ /g, '_')}_detail.png`;
      }}
    />
  );
}

export const TowerSelectionGrid: React.FC<TowerSelectionGridProps> = ({
  money,
  selectedTower,
  setSelectedTower,
  setSelectedPlacedTower,
  setActiveTooltip,
  towerCostReduction
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
          const effectiveCost = Math.floor(firstTier.upgradeCost * (towerCostReduction || 1));
          const canAfford = money >= effectiveCost;
          const dmgIcon = DAMAGE_TYPE_ICONS[tower.type] || 'Attack_icon';
          const dmgLabel = firstTier.maxDamage && firstTier.maxDamage > 0
            ? `${firstTier.minDamage || 0}-${firstTier.maxDamage}`
            : `${firstTier.damage}`;

          return (
            <button
              key={tower.type}
              onClick={() => {
                setSelectedTower(isSelected ? null : tower.type);
                setSelectedPlacedTower(null);
              }}
              onMouseEnter={(e) => {
                setActiveTooltip({
                  x: e.clientX, y: e.clientY,
                  title: tower.baseName.toUpperCase(),
                  content: `Tier 1: ${firstTier.name}`,
                  stats: `Attack Speed: ${firstTier.cooldown / 600} ticks — Range: ${firstTier.range / 25} tiles`,
                  color: firstTier.color,
                  tierIcons: tower.tiers.map((t: any) => t.name)
                });
              }}
              onMouseLeave={() => setActiveTooltip(null)}
              disabled={!canAfford}
              className={`
                flex flex-col items-center w-[72px] py-1 px-1 border-2 transition-all relative group
                ${isSelected ? 'border-osrs-yellow bg-[#4a3f35] shadow-[0_0_8px_rgba(255,255,0,0.6)]' : 'border-[#2d2d2d] bg-[#1a1a1a] hover:bg-[#2d2d2d] hover:border-[#5d5d5d]'}
                ${canAfford ? 'cursor-pointer' : 'opacity-40 cursor-not-allowed'}
              `}
            >
              {/* Current tier icon */}
              <div className="w-9 h-9 flex items-center justify-center relative mb-0.5">
                <img 
                  src={(ASSETS.towers as any)[tower.type][firstTier.level]} 
                  className="max-w-full max-h-full object-contain drop-shadow-md"
                  alt={firstTier.name}
                  onError={(e) => {
                    const img = e.currentTarget;
                    if (img.dataset.errored) { img.style.display = 'none'; return; }
                    img.dataset.errored = '1';
                    img.src = img.src.replace('.png', '_detail.png');
                  }}
                />
              </div>

              {/* Name */}
              <span className="text-[9px] font-bold uppercase tracking-tight truncate w-full text-center" style={{ color: firstTier.color }}>
                {tower.baseName}
              </span>

              {/* Damage + skill type icon */}
              <div className="flex items-center gap-0.5 justify-center">
                <span className="text-[9px] text-white">Dmg: {dmgLabel}</span>
                <img
                  src={`${ASSETS.misc.wiki_base}${dmgIcon}.png`}
                  className="w-2.5 h-2.5 object-contain"
                  alt=""
                  onError={(e) => { e.currentTarget.style.display = 'none'; }}
                />
              </div>

              {/* Cost */}
              <span className={`text-[9px] font-bold mt-0.5 ${canAfford ? 'text-osrs-green' : 'text-osrs-red'}`}>
                {effectiveCost}gp
              </span>

              {isSelected && <div className="absolute -top-1 -right-1 w-2 h-2 bg-osrs-yellow rounded-full animate-ping" />}
            </button>
          );
        })}
      </div>
    </div>
  );
};
