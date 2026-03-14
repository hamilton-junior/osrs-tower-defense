
import React from 'react';
import { TOWERS as TOWER_DATA } from '@/lib/game/data/towers';

interface EntityTooltipProps {
  hoveredEntity: any;
  tooltipPos: { x: number, y: number };
}

export const EntityTooltip: React.FC<EntityTooltipProps> = ({ hoveredEntity, tooltipPos }) => {
  if (!hoveredEntity) return null;

  return (
    <div 
      className="fixed pointer-events-none bg-black/95 border-2 border-[var(--osrs-border-light)] p-2 rounded text-osrs-yellow text-xs z-50 shadow-2xl min-w-[120px] font-osrs"
      style={{ left: tooltipPos.x + 15, top: tooltipPos.y + 15 }}
    >
      <p className="font-bold text-sm capitalize border-b border-white/10 mb-1 pb-1">
        {hoveredEntity.type === 'enemy' ? hoveredEntity.data.type.replace('_', ' ') : hoveredEntity.data.name}
      </p>
      {hoveredEntity.type === 'enemy' ? (
        <div className="space-y-0.5">
          <p>HP: <span className="text-white">{Math.ceil(hoveredEntity.data.hp)} / {hoveredEntity.data.maxHp}</span></p>
          <p>Speed: <span className="text-white">{hoveredEntity.data.speed?.toFixed(1)}</span></p>
          {hoveredEntity.data.resistance > 0 && <p>Resist: <span className="text-osrs-cyan">{Math.round(hoveredEntity.data.resistance * 100)}%</span></p>}
          {hoveredEntity.data.weakness && <p>Weakness: <span className="text-osrs-yellow capitalize">{hoveredEntity.data.weakness}</span></p>}
          {hoveredEntity.data.stunTimer > 0 && <p className="text-osrs-red font-bold">STUNNED ({hoveredEntity.data.stunTimer.toFixed(1)}s)</p>}
          {hoveredEntity.data.slowTimer > 0 && <p className="text-osrs-yellow font-bold">SLOWED ({hoveredEntity.data.slowTimer.toFixed(1)}s)</p>}
          {hoveredEntity.data.burnTimer > 0 && <p className="text-osrs-orange font-bold">BURNING ({hoveredEntity.data.burnTimer.toFixed(1)}s)</p>}
          <p className="text-[10px] text-[#c0c0c0] italic mt-1">Right-click for detailed info</p>
        </div>
      ) : hoveredEntity.type === 'pet' ? (
        <div className="space-y-0.5">
          <p className="text-osrs-cyan italic font-bold">Follower</p>
          <p className="text-white text-[10px]">{hoveredEntity.data.bonus}</p>
        </div>
      ) : (
        <div className="space-y-0.5">
          <p>Level: <span className="text-white">{hoveredEntity.data.level}</span></p>
          <p>Damage: <span className="text-white">{hoveredEntity.data.damage}</span></p>
          <p>Range: <span className="text-white">{hoveredEntity.data.range}</span></p>
          <p>Speed: <span className="text-white">{(hoveredEntity.data.cooldown / 1000).toFixed(1)}s</span></p>
          {hoveredEntity.data.special && <p className="text-osrs-cyan font-bold uppercase text-[10px]">Special: {hoveredEntity.data.special}</p>}
          {hoveredEntity.data.mageMode === 'utility' && <p className="text-osrs-green font-bold text-[10px]">SUPPORT AURA ACTIVE</p>}
          {hoveredEntity.data.level < (TOWER_DATA[hoveredEntity.data.type]?.tiers.length || 4) && (
            <p className="text-osrs-green mt-1">Next: <span className="text-white">{
              TOWER_DATA[hoveredEntity.data.type]?.tiers[hoveredEntity.data.level]?.name || 'Elite Gear'
            }</span></p>
          )}
          <p className="text-[10px] text-[#c0c0c0] italic mt-1">Right-click to toggle range</p>
        </div>
      )}
    </div>
  );
};
