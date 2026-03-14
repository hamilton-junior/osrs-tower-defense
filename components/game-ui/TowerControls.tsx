
import React from 'react';

interface TowerControlsProps {
  selectedTower: any;
  handleUpgradeTower: () => void;
  handleSellTower: () => void;
  handleTargetModeChange?: () => void;
  handleTowerModeChange?: () => void;
}

export const TowerControls: React.FC<TowerControlsProps> = ({ 
  selectedTower, 
  handleUpgradeTower, 
  handleSellTower,
  handleTargetModeChange,
  handleTowerModeChange
}) => {
  if (!selectedTower) return null;

  return (
    <div className="osrs-panel p-3 flex flex-col gap-3 min-w-[200px] pointer-events-auto">
      <div className="border-b border-[var(--osrs-border-dark)] pb-1 flex justify-between items-center">
        <span className="text-osrs-orange font-bold text-sm uppercase">{selectedTower.name}</span>
        <span className="bg-black/40 px-2 py-0.5 rounded text-[10px] text-osrs-yellow">Lvl {selectedTower.level}</span>
      </div>
      
      <div className="grid grid-cols-2 gap-2 text-[11px]">
        <div className="text-[#c0c0c0]">Damage: <span className="text-white font-bold">{Math.floor(selectedTower.damage)}</span></div>
        <div className="text-[#c0c0c0]">Speed: <span className="text-white font-bold">{(1000 / selectedTower.cooldown).toFixed(1)}/s</span></div>
        <div className="text-[#c0c0c0]">Range: <span className="text-white font-bold">{selectedTower.range}px</span></div>
        <div className="text-[#c0c0c0]">Kills: <span className="text-osrs-yellow font-bold">{selectedTower.kills || 0}</span></div>
      </div>

      <div className="flex flex-col gap-2 pt-1">
        <button 
          onClick={handleUpgradeTower} 
          disabled={selectedTower.level >= 4}
          className={`osrs-button py-2 text-xs uppercase ${selectedTower.level < 4 ? 'text-osrs-green' : 'opacity-50'}`}
        >
          {selectedTower.level < 4 ? `Upgrade (${selectedTower.upgradeCost} GP)` : 'Max Level'}
        </button>
        <button 
          onClick={handleSellTower} 
          className="osrs-button py-2 text-xs uppercase text-osrs-red"
        >
          Sell (+{Math.floor(selectedTower.upgradeCost * 0.5)} GP)
        </button>
      </div>

      {(selectedTower.type === 'archer' || selectedTower.type === 'wizard') && (
        <div className="flex flex-col gap-2 mt-2 border-t border-[var(--osrs-border-dark)] pt-3">
           <div className="text-[10px] text-osrs-orange uppercase font-bold text-center mb-1">Combat Style</div>
           <div className="flex gap-1">
              <button 
                className={`osrs-button flex-1 py-1.5 text-[10px] uppercase ${selectedTower.attackStyle !== 'long_range' ? 'brightness-125 border-white' : ''}`}
                onClick={handleTargetModeChange}
              >
                {selectedTower.type === 'wizard' ? 'Elemental' : 'Rapid'}
              </button>
              <button 
                className={`osrs-button flex-1 py-1.5 text-[10px] uppercase ${selectedTower.attackStyle === 'long_range' ? 'brightness-125 border-white' : ''}`}
                onClick={handleTowerModeChange}
              >
                {selectedTower.type === 'wizard' ? 'Ancients' : 'Longrange'}
              </button>
           </div>
        </div>
      )}
    </div>
  );
};
