
import React from 'react';
import { TOWERS as TOWER_DATA } from '@/lib/game/data/towers';

interface RightClickModalProps {
  entity: any;
  onClose: () => void;
}

export const RightClickModal: React.FC<RightClickModalProps> = ({ entity, onClose }) => {
  if (!entity) return null;

  return (
    <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-[100] p-4 pointer-events-auto">
      <div className="osrs-window w-full max-w-sm shadow-2xl relative flex flex-col">
        <div className="osrs-window-title flex justify-between items-center px-2 py-1">
          <h3 className="text-lg font-bold capitalize text-osrs-yellow">
            {entity.type === 'enemy' ? entity.data.type.replace('_', ' ') : entity.data.name}
          </h3>
          <button onClick={onClose} className="text-osrs-red font-bold text-lg hover:text-white transition-colors px-2">X</button>
        </div>
        
        <div className="p-4 bg-[url('https://oldschool.runescape.wiki/images/Back_pattern.png')] space-y-4">
          {entity.type === 'enemy' ? (
            <>
              <div className="bg-black/20 p-3 rounded border border-[var(--osrs-border-light)]">
                <p className="text-osrs-orange font-bold mb-2 border-b border-white/10">Combat Stats</p>
                <div className="grid grid-cols-2 gap-2 text-sm font-osrs">
                  <p>Health:</p><p className="text-white text-right">{Math.ceil(entity.data.hp)} / {entity.data.maxHp}</p>
                  <p>Speed:</p><p className="text-white text-right">{entity.data.speed}</p>
                  <p>Reward:</p><p className="text-osrs-yellow text-right">{entity.data.reward} GP</p>
                </div>
              </div>
              <div className="bg-black/10 p-3 rounded italic text-sm text-[#c0c0c0] border border-white/5 font-osrs">
                &quot;A dangerous creature of Gielinor. It seems to be heading towards the exit!&quot;
              </div>
            </>
          ) : (
            <>
              <div className="bg-black/20 p-3 rounded border border-[var(--osrs-border-light)]">
                <p className="text-osrs-orange font-bold mb-2 border-b border-white/10">Tower Stats</p>
                <div className="grid grid-cols-2 gap-2 text-sm font-osrs">
                  <p>Level:</p><p className="text-white text-right">{entity.data.level}</p>
                  <p>Damage:</p><p className="text-white text-right">{entity.data.damage}</p>
                  <p>Range:</p><p className="text-white text-right">{entity.data.range}</p>
                  <p>Cooldown:</p><p className="text-white text-right">{(entity.data.cooldown / 1000).toFixed(1)}s</p>
                </div>
              </div>
              
              {entity.data.level < (TOWER_DATA[entity.data.type]?.tiers.length || 4) && (
                <div className="bg-black/20 p-3 rounded border border-[var(--osrs-border-light)]">
                  <p className="text-osrs-yellow font-bold mb-2 border-b border-white/10">Future Upgrades</p>
                  <div className="space-y-2 text-[10px] font-osrs">
                    {TOWER_DATA[entity.data.type]?.tiers.slice(entity.data.level).map((tier: any) => (
                      <div key={tier.level} className="flex justify-between border-b border-white/5 pb-1">
                        <span className="text-[#c0c0c0]">LVL {tier.level}:</span>
                        <span className="text-white font-bold">{tier.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="bg-black/20 p-3 rounded border border-[var(--osrs-border-light)]">
                <p className="text-osrs-cyan font-bold mb-2 border-b border-white/10">Skills</p>
                <div className="grid grid-cols-2 gap-2 text-sm font-osrs">
                  {Object.entries(entity.data.skills).map(([skill, data]: [string, any]) => (
                    <div key={skill} className="flex justify-between">
                      <span className="capitalize">{skill}:</span>
                      <span className="text-white font-bold">Lvl {data.level}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
          
          <button 
            onClick={onClose}
            className="w-full osrs-button py-2 font-bold text-osrs-yellow transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
