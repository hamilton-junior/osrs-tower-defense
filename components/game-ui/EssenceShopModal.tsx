import React from 'react';
import { GlobalUpgrades } from '@/lib/game/types';

interface EssenceShopModalProps {
  runeEssence: number;
  upgrades: GlobalUpgrades;
  buyUpgrade: (type: keyof GlobalUpgrades, cost: number, increment: number) => void;
  onClose: () => void;
  questsCompleted: number;
  slayerTasksCompleted: number;
  maxWave: number;
  achievementPoints: number;
}

const UPGRADE_DATA: { id: keyof GlobalUpgrades; name: string; desc: string; cost: number; inc: number; max: number; unlockReq: string; isUnlocked: (p: EssenceShopModalProps) => boolean; icon: string }[] = [
  { id: 'startingMoney', name: 'Starting Gold', desc: '+50 Starting Gold', cost: 50, inc: 50, max: 500, unlockReq: 'Reach Wave 5', isUnlocked: p => p.maxWave >= 5, icon: 'Coins_detail' },
  { id: 'archerRange', name: 'Eagle Eye', desc: 'Archer Range +10%', cost: 100, inc: 0.1, max: 2.0, unlockReq: 'Complete 2 Quests', isUnlocked: p => p.questsCompleted >= 2, icon: 'Ranged_icon' },
  { id: 'archerDamage', name: 'Void Archer', desc: 'Archer Damage +10%', cost: 150, inc: 0.1, max: 2.5, unlockReq: '10 Slayer Tasks', isUnlocked: p => p.slayerTasksCompleted >= 10, icon: 'Ranged_icon' },
  { id: 'magicDamage', name: 'Mystic Might', desc: 'Magic Damage +10%', cost: 150, inc: 0.1, max: 2.5, unlockReq: 'Complete 5 Quests', isUnlocked: p => p.questsCompleted >= 5, icon: 'Magic_icon' },
  { id: 'cannonSpeed', name: 'Dwarf Engineering', desc: 'Cannon Speed +10%', cost: 200, inc: 0.1, max: 2.0, unlockReq: 'Reach Wave 20', isUnlocked: p => p.maxWave >= 20, icon: 'Cannon_barrels' },
  { id: 'towerCostReduction', name: 'Bargain Hunter', desc: 'Tower Costs -5%', cost: 300, inc: -0.05, max: 0.5, unlockReq: '500 Achievement Pts', isUnlocked: p => p.achievementPoints >= 500, icon: 'Coins_detail' },
  { id: 'rewardMultiplier', name: 'Wealthy Drops', desc: 'Wave Rewards +20%', cost: 250, inc: 0.2, max: 3.0, unlockReq: 'Reach Wave 30', isUnlocked: p => p.maxWave >= 30, icon: 'Coins_detail' }
];

export const EssenceShopModal: React.FC<EssenceShopModalProps> = (props) => {
  return (
    <div className="absolute inset-0 bg-black/80 flex items-center justify-center z-50 p-6 pointer-events-auto">
      <div className="osrs-window w-full max-w-2xl max-h-[85vh] flex flex-col shadow-[0_0_50px_rgba(0,0,0,0.9)] scale-in-center">
        <div className="osrs-window-title px-4 py-2 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <span className="text-xl">🔮</span>
            <h2 className="text-[#00ffff] text-xl font-bold tracking-widest text-shadow">Essence Shop (Upgrades)</h2>
          </div>
          <button onClick={props.onClose} className="text-osrs-red font-bold text-2xl hover:text-white transition-colors">X</button>
        </div>

        <div className="p-4 bg-[var(--osrs-brown-dark)] border-b border-[var(--osrs-border-dark)] flex justify-between items-center">
            <span className="text-[#c0c0c0] text-xs uppercase tracking-widest font-bold">Available Rune Essence:</span>
            <div className="flex items-center gap-2">
                <img src="https://oldschool.runescape.wiki/images/Pure_essence_detail.png" className="w-5 h-5 object-contain" alt="" />
                <span className="text-[#00ffff] font-bold text-lg">{props.runeEssence}</span>
            </div>
        </div>

        <div className="p-6 overflow-y-auto custom-scrollbar bg-[url('https://oldschool.runescape.wiki/images/Back_pattern.png')] flex-1 min-h-[400px]">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {UPGRADE_DATA.map((item) => {
              const currentVal = props.upgrades[item.id];
              const isMaxed = item.inc > 0 ? currentVal >= item.max : currentVal <= item.max;
              const isUnlocked = item.isUnlocked(props);
              
              return (
                <div key={item.id} className={`bg-[#3e2e18] p-4 border-2 ${isUnlocked ? 'border-[var(--osrs-border-dark)] hover:border-[#00ffff]' : 'border-red-900 opacity-60'} transition-all flex justify-between items-center relative overflow-hidden group`}>
                  <div className="flex items-center gap-3 z-10">
                    <div className="w-10 h-10 bg-black/40 rounded flex items-center justify-center relative">
                      <img src={`https://oldschool.runescape.wiki/images/${item.icon}.png`} className="max-w-[80%] max-h-[80%] object-contain" alt="" onError={e => e.currentTarget.src = `https://oldschool.runescape.wiki/images/Vial_detail.png`} />
                    </div>
                    <div>
                      <p className="text-[#00ffff] font-bold text-xs uppercase text-shadow-sm">{item.name}</p>
                      <p className="text-[9px] text-white my-1">{item.desc}</p>
                      {isUnlocked ? (
                         <p className="text-[10px] text-osrs-yellow font-bold uppercase truncate">
                           Current: {item.inc > 0 && currentVal < 5 ? (currentVal * 100).toFixed(0) + '%' : currentVal}
                           {isMaxed ? ' (MAX)' : ` -> ${item.inc > 0 && currentVal < 5 ? ((currentVal + item.inc) * 100).toFixed(0) + '%' : (currentVal + item.inc)}`}
                         </p>
                      ) : (
                         <p className="text-[9px] text-osrs-red uppercase font-bold">Requires: {item.unlockReq}</p>
                      )}
                    </div>
                  </div>
                  
                  {isUnlocked && !isMaxed && (
                      <button 
                        onClick={() => props.buyUpgrade(item.id, item.cost, item.inc)}
                        disabled={props.runeEssence < item.cost}
                        className={`osrs-button px-3 py-2 text-[10px] font-bold uppercase ${props.runeEssence >= item.cost ? 'text-[#00ffff]' : 'opacity-50'} z-10 flex flex-col items-center gap-1`}
                      >
                        Buy Upgrade
                        <span className="text-[9px] font-mono tracking-widest drop-shadow">{item.cost} Ess</span>
                      </button>
                  )}
                  {isMaxed && (
                      <div className="text-osrs-green font-bold uppercase text-[10px] tracking-widest px-3 py-2 z-10 border border-osrs-green/30 bg-osrs-green/10 rounded">Maxed</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
