import React, { useState } from 'react';
import { Item } from '@/lib/game/types';
import { ASSETS } from '@/lib/game/assets';

interface MagicTabProps {
  inventory: Item[];
  magicLevel: number;
  castSpell: (spellId: string, targetItemIndex?: number) => void;
  addMessage: (msg: string) => void;
}

const SPELLS = [
  { 
    id: 'bones_to_peaches', 
    name: 'Bones to Peaches', 
    description: 'Converts bones in inventory to peaches (heals 5 HP).', 
    level: 60, 
    runes: { nature_rune: 2, earth_rune: 4, water_rune: 4 },
    icon: 'Bones_to_peaches.png'
  },
  { 
    id: 'high_alchemy', 
    name: 'High Level Alchemy', 
    description: 'Converts an item into coins.', 
    level: 55, 
    runes: { nature_rune: 1, fire_rune: 5 },
    icon: 'High_Level_Alchemy.png',
    requiresTarget: true
  },
  { 
    id: 'superheat_item', 
    name: 'Superheat Item', 
    description: 'Smelts ore into bars (gives XP and GP).', 
    level: 43, 
    runes: { nature_rune: 1, fire_rune: 4 },
    icon: 'Superheat_Item.png',
    requiresTarget: true
  },
  { 
    id: 'ice_barrage', 
    name: 'Ice Barrage', 
    description: 'Freezes all enemies on screen for 5 seconds.', 
    level: 94, 
    runes: { blood_rune: 2, death_rune: 4, water_rune: 6 },
    icon: 'Ice_Barrage.png',
    requiresTarget: false
  },
  { 
    id: 'blood_barrage', 
    name: 'Blood Barrage', 
    description: 'Deals damage to all enemies and heals you.', 
    level: 92, 
    runes: { blood_rune: 4, death_rune: 4, soul_rune: 1 },
    icon: 'Blood_Barrage.png',
    requiresTarget: false
  },
];

export const MagicTab: React.FC<MagicTabProps> = ({ 
  inventory,
  magicLevel,
  castSpell,
  addMessage
}) => {
  const [selectedSpell, setSelectedSpell] = useState<string | null>(null);

  const handleCastSpell = (spell: any, targetIndex?: number) => {
    if (magicLevel < spell.level) {
      addMessage(`You need a Magic level of ${spell.level} to cast this spell.`);
      return;
    }

    // Check runes
    for (const [runeId, amount] of Object.entries(spell.runes)) {
      const count = inventory.filter(i => i.id.startsWith(runeId)).length;
      if (count < (amount as number)) {
        addMessage(`You don't have enough ${runeId.replace('_', ' ')}s.`);
        return;
      }
    }

    if (spell.requiresTarget && targetIndex === undefined) {
      setSelectedSpell(spell.id);
      addMessage(`Select an item in your inventory to cast ${spell.name} on.`);
      return;
    }

    castSpell(spell.id, targetIndex);
    setSelectedSpell(null);
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto p-2 gap-2">
      <div className="flex justify-between items-center mb-2 bg-black/20 p-2 rounded border border-[var(--osrs-border-light)]">
        <div className="flex items-center gap-2">
           <img src={ASSETS.misc.magic_icon} className="w-6 h-6 object-contain" alt="" />
           <span className="text-osrs-green font-bold text-lg">Level: {magicLevel || 1}</span>
        </div>
        <p className="text-xs text-[#c0c0c0] italic">Cast spells for utility.</p>
      </div>

      {selectedSpell && (
        <div className="bg-red-900/50 p-2 border border-red-500 text-center mb-2">
          <p className="text-white text-sm">Select an item to cast spell on.</p>
          <button className="osrs-button px-2 py-1 mt-1 text-xs" onClick={() => setSelectedSpell(null)}>Cancel</button>
        </div>
      )}

      {selectedSpell ? (
        <div className="grid grid-cols-4 gap-1 bg-[#3e2e18] p-2 border border-[var(--osrs-border-light)]">
          {inventory.map((item, index) => (
            <div 
              key={item.id} 
              className="w-10 h-10 bg-black/40 border border-[#5d4037] flex items-center justify-center cursor-pointer hover:border-osrs-yellow"
              onClick={() => handleCastSpell(SPELLS.find(s => s.id === selectedSpell), index)}
            >
              <img src={`${ASSETS.misc.wiki_base}${item.name.replace(/ /g, '_')}.png`} alt={item.name} className="w-8 h-8 object-contain" onError={(e) => { e.currentTarget.src = ASSETS.misc.portal; }} />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2">
          {SPELLS.map((spell) => {
            let canCast = magicLevel >= spell.level;
            for (const [runeId, amount] of Object.entries(spell.runes)) {
              const count = inventory.filter(i => i.id.startsWith(runeId)).length;
              if (count < (amount as number)) canCast = false;
            }

            return (
              <div key={spell.name} className={`bg-[#3e2e18] p-2 border border-[var(--osrs-border-light)] flex justify-between items-center group hover:border-osrs-yellow transition-colors ${!canCast ? 'opacity-70' : ''}`}>
                <div className="flex items-center gap-3">
                  <img src={`${ASSETS.misc.wiki_base}${spell.icon}`} className="w-8 h-8 object-contain" alt="" />
                  <div>
                    <p className="text-osrs-orange font-bold text-xs group-hover:text-white">{spell.name}</p>
                    <p className="text-[10px] text-[#c0c0c0]">{spell.description}</p>
                    <p className="text-[9px] text-osrs-green">Lvl {spell.level}</p>
                  </div>
                </div>
                <button 
                  className={`osrs-button px-3 py-1.5 text-[10px] font-bold uppercase ${canCast ? 'text-osrs-yellow hover:text-white' : 'opacity-50 cursor-not-allowed'}`}
                  disabled={!canCast}
                  onClick={() => canCast && handleCastSpell(spell)}
                >
                  Cast
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
