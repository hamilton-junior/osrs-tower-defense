
import React from 'react';
import { ASSETS } from '@/lib/game/assets';
import { TOWERS as TOWER_DATA } from '@/lib/game/data/towers';

interface EntityTooltipProps {
  hoveredEntity: any;
  tooltipPos: { x: number, y: number };
}

const DAMAGE_TYPE_ICONS: Record<string, string> = {
  archer: 'Ranged_icon',
  wizard: 'Magic_icon',
  cannon: 'Ranged_icon',
  tzhaar: 'Attack_icon',
  slayer: 'Ranged_icon',
  toxic: 'Magic_icon',
};

function clamp(x: number, y: number, w = 200, h = 220) {
  let left = x + 15;
  let top = y + 15;
  if (typeof window !== 'undefined') {
    if (left + w > window.innerWidth - 8) left = x - w - 8;
    if (top + h > window.innerHeight - 8) top = y - h - 8;
  }
  return { left: Math.max(8, left), top: Math.max(8, top) };
}

export const EntityTooltip: React.FC<EntityTooltipProps> = ({ hoveredEntity, tooltipPos }) => {
  if (!hoveredEntity) return null;

  const { left, top } = clamp(tooltipPos.x, tooltipPos.y);
  const dmgIcon = DAMAGE_TYPE_ICONS[hoveredEntity?.data?.type] || 'Attack_icon';

  return (
    <div
      className="fixed pointer-events-none bg-black/95 border-2 border-[var(--osrs-border-light)] p-2 rounded text-osrs-yellow text-xs z-50 shadow-2xl min-w-[130px] max-w-[200px] font-osrs"
      style={{ left, top }}
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
          <p className="text-[10px] text-[#c0c0c0] italic mt-1">Right-click for info</p>
        </div>
      ) : hoveredEntity.type === 'pet' ? (
        <div className="space-y-0.5">
          <p className="text-osrs-cyan italic font-bold">Follower</p>
          <p className="text-white text-[10px]">{hoveredEntity.data.bonus}</p>
        </div>
      ) : (
        <div className="space-y-0.5">
          <p>Level: <span className="text-white">{hoveredEntity.data.level}</span></p>
          <div className="flex items-center gap-1">
            {hoveredEntity.data.maxDamage && hoveredEntity.data.maxDamage > 0 ? (
              <span className="text-white">Hit: {hoveredEntity.data.minDamage || 0}–{hoveredEntity.data.maxDamage}</span>
            ) : (
              <span className="text-white">Dmg: {hoveredEntity.data.damage}</span>
            )}
            <img
              src={`${ASSETS.misc.wiki_base}${dmgIcon}.png`}
              className="w-3 h-3 object-contain"
              alt=""
            />
          </div>
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
