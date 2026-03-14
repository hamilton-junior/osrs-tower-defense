
import React from 'react';

interface HerbloreTabProps {
  herbloreLevel: number;
  addMessage: (msg: string) => void;
}

export const HerbloreTab: React.FC<HerbloreTabProps> = ({ 
  herbloreLevel, 
  addMessage 
}) => {
  return (
    <div className="flex flex-col h-full overflow-y-auto p-2 gap-2">
      <div className="flex justify-between items-center mb-2 bg-black/20 p-2 rounded border border-[var(--osrs-border-light)]">
        <div className="flex items-center gap-2">
           <img src="https://oldschool.runescape.wiki/images/Herblore_icon.png" className="w-6 h-6 object-contain" alt="" />
           <span className="text-osrs-green font-bold text-lg">Level: {herbloreLevel || 1}</span>
        </div>
        <p className="text-xs text-[#c0c0c0] italic">Mix potions for combat buffs.</p>
      </div>

      <div className="grid grid-cols-1 gap-2">
        {[
          { name: 'Strength Potion', ingredients: 'Tarromin + Limpwurt', level: 12, xp: 50, icon: 'Strength_potion(3)' },
          { name: 'Prayer Potion', ingredients: 'Ranarr + Snape Grass', level: 38, xp: 87.5, icon: 'Prayer_potion(3)' },
          { name: 'Super Strength', ingredients: 'Kwuarm + Limpwurt', level: 55, xp: 125, icon: 'Super_strength(3)' },
          { name: 'Ranging Potion', ingredients: 'Dwarf Weed + Wine of Zamorak', level: 72, xp: 162.5, icon: 'Ranging_potion(3)' },
          { name: 'Magic Potion', ingredients: 'Lantadyme + Potato Cactus', level: 76, xp: 172.5, icon: 'Magic_potion(3)' },
          { name: 'Saradomin Brew', ingredients: 'Toadflax + Crushed Nest', level: 81, xp: 180, icon: 'Saradomin_brew(3)' },
        ].map((potion) => (
          <div key={potion.name} className="bg-[#3e2e18] p-2 border border-[var(--osrs-border-light)] flex justify-between items-center group hover:border-osrs-yellow transition-colors">
            <div className="flex items-center gap-3">
              <img src={`https://oldschool.runescape.wiki/images/${potion.icon}.png`} className="w-8 h-8 object-contain" alt="" />
              <div>
                <p className="text-osrs-orange font-bold text-xs group-hover:text-white">{potion.name}</p>
                <p className="text-[10px] text-[#c0c0c0]">{potion.ingredients}</p>
                <p className="text-[9px] text-osrs-green">Lvl {potion.level} • {potion.xp} XP</p>
              </div>
            </div>
            <button 
              className={`osrs-button px-3 py-1.5 text-[10px] font-bold uppercase ${herbloreLevel >= potion.level ? 'text-osrs-yellow hover:text-white' : 'opacity-50 cursor-not-allowed'}`}
              disabled={herbloreLevel < potion.level}
              onClick={() => addMessage("You don't have the ingredients.")}
            >
              Mix
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};
