
import React from 'react';
import { ASSETS } from '@/lib/game/assets';

interface InventoryTabProps {
  inventory: any[];
  handleEquipItem: (itemId: string) => void;
  buryBone: (itemIndex: number) => void;
  setActiveTooltip: (tooltip: any | null) => void;
}

export const InventoryTab: React.FC<InventoryTabProps> = ({ 
  inventory, 
  handleEquipItem, 
  buryBone,
  setActiveTooltip 
}) => {
  return (
    <div className="flex flex-col gap-2">
      <div className="text-center border-b border-[var(--osrs-border-light)] pb-1">
        <span className="text-xs font-bold text-osrs-orange uppercase">Inventory</span>
      </div>
      <div className="grid grid-cols-4 gap-2 mt-2">
        {Array.from({ length: 28 }).map((_, i) => {
          const item = (inventory || [])[i];
          return (
            <div 
              key={i} 
              className="aspect-square p-1 group relative cursor-pointer hover:bg-white/10 flex items-center justify-center rounded-sm transition-colors border border-white/5" 
              onClick={() => {
                if (!item) return;
                if (item.type === 'bone') buryBone(i);
                else handleEquipItem(item.id);
              }}
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
                  src={(ASSETS.items as Record<string, string>)[item.id] || `${ASSETS.misc.wiki_base}${item.name.replace(/ /g, '_')}.png`}
                  alt={item.name}
                  className="w-full h-full object-contain"
                  onError={(e) => {
                    const img = e.target as HTMLImageElement;
                    if (img.dataset.errored === '3') {
                      img.style.opacity = '0';
                      return;
                    }
                    
                    const name = item.name.replace(/ /g, '_');
                    if (!img.dataset.errored) {
                       img.dataset.errored = '1';
                       // Try adding _detail
                       img.src = `${ASSETS.misc.wiki_base}${name}_detail.png`;
                    } else if (img.dataset.errored === '1') {
                       img.dataset.errored = '2';
                       // Try sentence case
                       const sentenceCase = name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
                       img.src = `${ASSETS.misc.wiki_base}${sentenceCase}.png`;
                    } else if (img.dataset.errored === '2') {
                       img.dataset.errored = '3';
                       // Try with %28 and %29 for parentheses if any
                       const encoded = name.replace(/\(/g, '%28').replace(/\)/g, '%29');
                       img.src = `${ASSETS.misc.wiki_base}${encoded}.png`;
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
