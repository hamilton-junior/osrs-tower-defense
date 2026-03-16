
import React from 'react';
import { ASSETS } from '@/lib/game/assets';

interface InventoryTabProps {
  inventory: any[];
  handleEquipItem: (itemId: string) => void;
  setActiveTooltip: (tooltip: any | null) => void;
}

export const InventoryTab: React.FC<InventoryTabProps> = ({ 
  inventory, 
  handleEquipItem, 
  setActiveTooltip 
}) => {
  return (
    <div className="flex flex-col gap-2">
      <div className="text-center border-b border-[var(--osrs-border-light)] pb-1">
        <span className="text-xs font-bold text-osrs-orange uppercase">Inventory</span>
      </div>
      <div className="grid grid-cols-4 gap-1 mt-1">
        {Array.from({ length: 28 }).map((_, i) => {
          const item = (inventory || [])[i];
          return (
            <div 
              key={i} 
              className="aspect-square p-0.5 group relative cursor-pointer hover:bg-white/10 flex items-center justify-center rounded-sm transition-colors" 
              onClick={() => item && handleEquipItem(item.id)}
              onMouseEnter={(e) => item && setActiveTooltip({
                x: e.clientX, y: e.clientY,
                title: item.name, content: item.description,
                bonus: item.bonus ? Object.entries(item.bonus).map(([k, v]) => `+${v} ${k}`).join(', ') : '',
                color: '#ffff00'
              })}
              onMouseLeave={() => setActiveTooltip(null)}
            >
              {item ? (
                <img 
                  src={`${ASSETS.misc.wiki_base}${item.name.replace(/ /g, '_')}.png`} 
                  alt={item.name} 
                  className="w-full h-full object-contain"
                  onError={(e) => {
                    const img = e.target as HTMLImageElement;
                    if (img.dataset.errored === '2') {
                      img.style.opacity = '0';
                      return;
                    }
                    
                    const name = item.name.replace(/ /g, '_');
                    if (!img.dataset.errored) {
                       img.dataset.errored = '1';
                       const sentenceCase = name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
                       img.src = `${ASSETS.misc.wiki_base}${sentenceCase}.png`;
                    } else if (img.dataset.errored === '1') {
                       img.dataset.errored = '2';
                       img.src = `${ASSETS.misc.wiki_base}${name}_detail.png`;
                    }
                  }}
                />
              ) : (
                <div className="w-full h-full opacity-10" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
