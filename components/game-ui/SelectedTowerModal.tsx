
import React from 'react';
import { TOWERS as TOWER_DATA } from '@/lib/game/data/towers';

interface SelectedTowerModalProps {
  tower: any;
  money: number;
  onClose: () => void;
  onUpgrade: () => void;
  onSell: () => void;
  onUnequip: (towerId: string, slot: string) => void;
  onSetArcherStyle: (towerId: string, style: string) => void;
  onSetMageMode: (towerId: string, mode: string) => void;
  onSetMageElement: (towerId: string, elem: string) => void;
  onSetAncientType: (towerId: string, type: string) => void;
  onSetTargetingPriority: (towerId: string, priority: string) => void;
  towerCostReduction: number;
}

export const SelectedTowerModal: React.FC<SelectedTowerModalProps> = ({ 
  tower, money, onClose, onUpgrade, onSell, onUnequip, 
  onSetArcherStyle, onSetMageMode, onSetMageElement, onSetAncientType, onSetTargetingPriority,
  towerCostReduction
}) => {
  if (!tower) return null;

  return (
    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 osrs-window w-[320px] shadow-2xl z-20 flex flex-col gap-2 pointer-events-auto">
      <div className="osrs-window-title flex justify-between items-center px-2 py-1">
        <h3 className="text-osrs-yellow font-bold">{tower.name}</h3>
        <button onClick={onClose} className="text-osrs-red font-bold hover:text-white">X</button>
      </div>
      
      <div className="p-3 bg-[url('https://oldschool.runescape.wiki/images/Back_pattern.png')]">
        <div className="grid grid-cols-2 gap-4">
          <div className="text-xs text-[#c0c0c0] space-y-1">
            <p className="font-bold text-osrs-orange">Stats</p>
            <p>Level: {tower.level} / {tower.maxLevel}</p>
            {tower.maxDamage && tower.maxDamage > 0 ? (
              <p>Hit: {tower.minDamage || 0}-{tower.maxDamage}</p>
            ) : (
              <p>Damage: {tower.damage}</p>
            )}
            <p>Range: {tower.range}</p>
            <p>Speed: {(tower.cooldown / 1000).toFixed(1)}s</p>
          </div>
          
          <div className="text-xs text-[#c0c0c0] space-y-1">
            <p className="font-bold text-osrs-cyan">Skills</p>
            {Object.entries(tower.skills || {}).map(([name, skill]: [string, any]) => (
              <div key={name} className="flex justify-between">
                <span className="capitalize">{name}:</span>
                <span className="font-bold text-white">Lvl {skill.level}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-2 border-t border-[var(--osrs-border-light)] pt-2">
          <p className="text-[10px] font-bold text-osrs-yellow mb-1 uppercase tracking-wider">Equipment</p>
          <div className="grid grid-cols-3 gap-1">
            {['weapon', 'shield', 'accessory'].map(slot => {
              const item = tower.equipment?.[slot];
              return (
                <div key={slot} className="aspect-square bg-black/40 border border-[var(--osrs-border-light)] rounded flex flex-col items-center justify-center relative group/eq">
                  <span className="text-[7px] text-[#808080] absolute top-0.5 uppercase">{slot.slice(0, 3)}</span>
                  {item ? (
                    <img src={`https://oldschool.runescape.wiki/images/${item.name.replace(/ /g, '_')}.png`} className="w-8 h-8 object-contain p-1" alt="" />
                  ) : (
                    <span className="text-lg opacity-20">{slot === 'weapon' ? '⚔️' : slot === 'shield' ? '🛡️' : '💍'}</span>
                  )}
                  {item && (
                    <div className="absolute inset-0 bg-black/95 opacity-0 group-hover/eq:opacity-100 transition-opacity p-1 flex flex-col items-center justify-center text-[8px] z-10 rounded">
                      <span className="text-osrs-yellow font-bold truncate w-full">{item.name}</span>
                      <button onClick={() => onUnequip(tower.id, slot)} className="text-osrs-red mt-1 hover:text-white">Unequip</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {tower.type === 'archer' && (
          <div className="mt-2 border-t border-[var(--osrs-border-light)] pt-2">
            <p className="text-[10px] font-bold text-osrs-green mb-1">Combat Style</p>
            <div className="flex gap-1">
              {['rapid', 'long_range'].map(style => (
                <button
                  key={style}
                  onClick={() => onSetArcherStyle(tower.id, style)}
                  className={`osrs-button text-[9px] flex-1 py-1 capitalize ${tower.attackStyle === style ? 'brightness-125 border-white' : ''}`}
                >
                  {style.replace('_', ' ')}
                </button>
              ))}
            </div>
          </div>
        )}

        {tower.type === 'wizard' && (
          <div className="mt-2 border-t border-[var(--osrs-border-light)] pt-2">
            <p className="text-[10px] font-bold text-osrs-yellow mb-1">Mage Specialization</p>
            <div className="flex gap-1 mb-2">
              {['elemental', 'ancients', 'utility'].map(mode => (
                <button
                  key={mode}
                  onClick={() => onSetMageMode(tower.id, mode)}
                  className={`osrs-button text-[9px] px-2 py-1 capitalize ${tower.mageMode === mode ? 'brightness-125 border-white' : ''}`}
                >
                  {mode}
                </button>
              ))}
            </div>
            
            {tower.mageMode === 'elemental' && (
              <div className="grid grid-cols-4 gap-1">
                {['air', 'water', 'earth', 'fire'].map(elem => (
                  <button
                    key={elem}
                    onClick={() => onSetMageElement(tower.id, elem)}
                    className={`osrs-button text-[9px] p-1 capitalize ${tower.element === elem ? 'brightness-125 border-white' : ''}`}
                  >
                    {elem}
                  </button>
                ))}
              </div>
            )}

            {tower.mageMode === 'ancients' && (
              <div className="grid grid-cols-4 gap-1">
                {['ice', 'blood', 'shadow', 'smoke'].map(type => (
                  <button
                    key={type}
                    onClick={() => onSetAncientType(tower.id, type)}
                    className={`osrs-button text-[9px] p-1 capitalize ${tower.ancientType === type ? 'brightness-125 border-white' : ''}`}
                  >
                    {type}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="mt-2 border-t border-[var(--osrs-border-light)] pt-2">
          <p className="text-[10px] font-bold text-osrs-orange mb-1 uppercase tracking-wider">Targeting Priority</p>
          <div className="grid grid-cols-3 gap-1">
            {['first', 'last', 'strongest', 'weakest', 'closest'].map(priority => (
              <button
                key={priority}
                onClick={() => onSetTargetingPriority(tower.id, priority)}
                className={`osrs-button text-[9px] py-1 capitalize ${tower.targetingPriority === priority ? 'brightness-125 border-white' : ''}`}
              >
                {priority}
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-2 mt-3">
          {tower.level < tower.maxLevel ? (
            <button 
              onClick={onUpgrade}
              disabled={money < Math.floor(tower.upgradeCost * (towerCostReduction || 1))}
              className={`flex-1 osrs-button py-2 text-xs font-bold ${money >= Math.floor(tower.upgradeCost * (towerCostReduction || 1)) ? 'text-osrs-green' : 'opacity-50 cursor-not-allowed'}`}
            >
              Upgrade ({Math.floor(tower.upgradeCost * (towerCostReduction || 1))} gp)
            </button>
          ) : (
            <div className="flex-1 text-center text-xs text-osrs-green font-bold py-2 border border-osrs-green/30 bg-osrs-green/10 rounded">Max Level</div>
          )}
          <button onClick={onSell} className="osrs-button px-4 py-2 text-xs font-bold text-osrs-red hover:text-white">Sell</button>
        </div>
      </div>
    </div>
  );
};
