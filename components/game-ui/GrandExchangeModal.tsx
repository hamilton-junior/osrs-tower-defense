
import React from 'react';
import { ASSETS } from '@/lib/game/assets';
import { GE_CONSUMABLES } from '@/lib/game/data/shop';

interface GrandExchangeModalProps {
  money: number;
  inventory: any[];
  itemPriceMultipliers: Record<string, number>;
  onClose: () => void;
  onBuy: (id: string, cost: number) => void;
  onSell: (index: number) => void;
}

export const GrandExchangeModal: React.FC<GrandExchangeModalProps> = ({ 
  money, inventory, itemPriceMultipliers, onClose, onBuy, onSell 
}) => {
  const [tab, setTab] = React.useState<'buy' | 'sell'>('buy');
  const [collapsedCategories, setCollapsedCategories] = React.useState<Set<string>>(new Set());

  const toggleCategory = (category: string) => {
    const newCollapsed = new Set(collapsedCategories);
    if (newCollapsed.has(category)) {
      newCollapsed.delete(category);
    } else {
      newCollapsed.add(category);
    }
    setCollapsedCategories(newCollapsed);
  };

  return (
    <div className="absolute inset-0 bg-black/80 flex items-center justify-center z-50 p-6 pointer-events-auto">
      <div className="osrs-window w-full max-w-2xl max-h-[85vh] flex flex-col shadow-[0_0_50px_rgba(0,0,0,0.9)] scale-in-center">
        <div className="osrs-window-title px-4 py-2 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <span className="text-xl">🏪</span>
            <h2 className="text-osrs-yellow text-xl font-bold tracking-widest">Grand Exchange</h2>
          </div>
          <button onClick={onClose} className="text-osrs-red font-bold text-2xl hover:text-white transition-colors">X</button>
        </div>

        <div className="flex border-b border-[var(--osrs-border-dark)] bg-[var(--osrs-brown-dark)]">
          <button onClick={() => setTab('buy')} className={`flex-1 py-3 text-xs font-bold uppercase transition-all ${tab === 'buy' ? 'bg-[var(--osrs-brown)] text-osrs-yellow border-t-2 border-osrs-yellow' : 'text-[#808080] hover:text-white'}`}>Buy Upgrades</button>
          <button onClick={() => setTab('sell')} className={`flex-1 py-3 text-xs font-bold uppercase transition-all ${tab === 'sell' ? 'bg-[var(--osrs-brown)] text-osrs-yellow border-t-2 border-osrs-yellow' : 'text-[#808080] hover:text-white'}`}>Sell Items</button>
        </div>

        <div 
          className="p-6 overflow-y-auto custom-scrollbar flex-1 min-h-[400px]"
          style={{ backgroundImage: `url(${ASSETS.misc.background_pattern})`, backgroundRepeat: 'repeat' }}
        >
          {tab === 'buy' ? (
            <div className="flex flex-col gap-6">
              {['potion', 'ore', 'herb', 'seed', 'bones', 'logs'].map(category => {
                const items = GE_CONSUMABLES.filter((item: any) => item.type === category);
                if (items.length === 0) return null;
                const categoryNames: Record<string, string> = {
                  potion: 'Potions', ore: 'Ores', herb: 'Herbs & Ingredients', seed: 'Seeds', bones: 'Bones', logs: 'Logs'
                };
                const categoryIcons: Record<string, string> = {
                  potion: 'Herblore', ore: 'Mining', herb: 'Herblore', seed: 'Farming', bones: 'Prayer', logs: 'Woodcutting'
                };
                const isCollapsed = collapsedCategories.has(category);

                return (
                  <div key={category} className="flex flex-col">
                    <div 
                      className="flex items-center justify-between mb-3 border-b border-[#5d5d5d] pb-1 cursor-pointer hover:bg-white/5 transition-colors"
                      onClick={() => toggleCategory(category)}
                    >
                      <div className="flex items-center gap-2">
                        <img src={`${ASSETS.misc.wiki_base}${categoryIcons[category]}_icon.png`} className="w-5 h-5 object-contain" alt="" />
                        <h3 className="text-osrs-yellow font-bold uppercase tracking-widest">{categoryNames[category]}</h3>
                      </div>
                      <span className="text-osrs-yellow text-sm font-bold">{isCollapsed ? '[+]' : '[-]'}</span>
                    </div>
                    
                    {!isCollapsed && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {items.map((item: any) => {
                          const multiplier = itemPriceMultipliers[item.id] || 1.0;
                          const currentCost = Math.floor(item.cost * multiplier);
                          const priceTrend = multiplier > 1.0 ? 'text-red-400' : multiplier < 1.0 ? 'text-green-400' : 'text-osrs-yellow';

                          return (
                            <div key={item.id} className="bg-[#3e2e18] p-4 border-2 border-[var(--osrs-border-dark)] hover:border-[var(--osrs-border-light)] transition-all flex justify-between items-center group relative overflow-hidden">
                              <div className="flex items-center gap-4">
                                <div className="w-12 h-12 bg-black/40 rounded border border-white/5 flex items-center justify-center relative group-hover:scale-110 transition-transform">
                                  <img src={`${ASSETS.misc.wiki_base}${item.wiki}.png`} className="max-w-[80%] max-h-[80%] object-contain" alt="" onError={e => { if (!e.currentTarget.src.includes('_detail.png')) e.currentTarget.src = `${ASSETS.misc.wiki_base}${item.wiki}_detail.png`; else e.currentTarget.style.opacity = '0'; }}/>
                                </div>
                                <div>
                                  <p className="text-osrs-yellow font-bold text-sm uppercase group-hover:text-white">{item.name}</p>
                                  <p className="text-[10px] text-[#c0c0c0] leading-tight mt-0.5">{item.desc}</p>
                                  {multiplier !== 1.0 && (
                                    <p className={`text-[9px] font-bold ${priceTrend}`}>
                                      {multiplier > 1.0 ? '▲' : '▼'} Market: {multiplier.toFixed(2)}x
                                    </p>
                                  )}
                                </div>
                              </div>
                              <button 
                                onClick={() => onBuy(item.id, currentCost)}
                                disabled={money < currentCost}
                                className={`osrs-button px-3 py-2 text-[10px] font-bold uppercase ${money >= currentCost ? 'text-osrs-yellow' : 'opacity-50'}`}
                              >
                                {currentCost} GP
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="grid grid-cols-4 sm:grid-cols-6 gap-3">
              {inventory.map((item, index) => {
                const multiplier = itemPriceMultipliers[item.id] || 1.0;
                const basePrice = item.sellPrice || 50;
                const currentSellPrice = Math.floor(basePrice * multiplier);
                
                return (
                  <div key={index} className="bg-[#3e2e18] p-2 border border-[var(--osrs-border-dark)] flex flex-col items-center gap-2 group hover:border-osrs-yellow cursor-pointer" onClick={() => onSell(index)}>
                    <img src={`${ASSETS.misc.wiki_base}${item.name.replace(/ /g, '_')}_detail.png`} className="w-10 h-10 object-contain" alt="" onError={e => { if (e.currentTarget.src.includes('_detail.png')) e.currentTarget.src = `${ASSETS.misc.wiki_base}${item.name.replace(/ /g, '_')}.png`; else e.currentTarget.style.opacity = '0'; }} />
                    <p className="text-[9px] text-center truncate w-full text-white">{item.name}</p>
                    <span className="text-osrs-yellow text-[10px] font-bold">{currentSellPrice} GP</span>
                  </div>
                );
              })}
              {inventory.length === 0 && <p className="col-span-full text-center text-[#808080] italic py-12">Your inventory is empty.</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
