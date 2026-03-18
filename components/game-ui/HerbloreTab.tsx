
import React, { useState } from 'react';
import { Item } from '@/lib/game/types';
import { ASSETS } from '@/lib/game/assets';

interface HerbloreTabProps {
  inventory: Item[];
  herbloreLevel: number;
  makePotion: (herbId: string, secondaryId: string) => void;
  addMessage: (msg: string) => void;
  setActiveTooltip: (tooltip: any) => void;
}

const RECIPES = [
  { id: 'attack_potion', name: 'Attack potion(3)', herb: 'clean_guam', secondary: 'eye_of_newt', level: 1, xp: 25, icon: 'Attack_potion(3)' },
  { id: 'strength_potion', name: 'Strength potion(3)', herb: 'clean_torstol', secondary: 'limpwurt_root', level: 12, xp: 50, icon: 'Strength_potion(3)' }, // Simplified torstol for strength here, or use harralander/tarromin
  { id: 'prayer_potion', name: 'Prayer potion(3)', herb: 'clean_ranarr', secondary: 'snape_grass', level: 38, xp: 87.5, icon: 'Prayer_potion(3)' },
  { id: 'super_restore', name: 'Super restore(3)', herb: 'clean_snapdragon', secondary: 'red_spiders_eggs', level: 63, xp: 142.5, icon: 'Super_restore(3)' },
  { id: 'saradomin_brew', name: 'Saradomin brew(3)', herb: 'clean_toadflax', secondary: 'birds_nest', level: 81, xp: 180, icon: 'Saradomin_brew(3)' },
  { id: 'super_combat_potion', name: 'Super combat potion(3)', herb: 'clean_torstol', secondary: 'clean_torstol', level: 90, xp: 150, icon: 'Super_combat_potion(3)' }, // Simplified
];

export const HerbloreTab: React.FC<HerbloreTabProps> = ({ 
  inventory,
  herbloreLevel,
  makePotion,
  addMessage,
  setActiveTooltip
}) => {
  const handleMakePotion = (recipe: any) => {
    if (herbloreLevel < recipe.level) {
      addMessage(`You need a Herblore level of ${recipe.level} to make this potion.`);
      return;
    }

    const hasHerb = inventory.some(i => i.id.startsWith(recipe.herb));
    const hasSecondary = inventory.some(i => i.id.startsWith(recipe.secondary));
    const hasVial = inventory.some(i => i.id.startsWith('vial_of_water'));

    if (!hasHerb) {
      addMessage(`You need a ${recipe.herb.replace('clean_', '')} to make this potion.`);
      return;
    }
    if (!hasSecondary) {
      addMessage(`You need a ${recipe.secondary.replace(/_/g, ' ')} to make this potion.`);
      return;
    }
    if (!hasVial) {
      addMessage(`You need a vial of water to make this potion.`);
      return;
    }

    makePotion(recipe.herb, recipe.secondary);
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto p-2 gap-2">
      <div className="flex justify-between items-center mb-2 bg-black/20 p-2 rounded border border-[var(--osrs-border-light)]">
        <div className="flex items-center gap-2">
           <img src={ASSETS.misc.herblore_icon} className="w-6 h-6 object-contain" alt="" />
           <span className="text-osrs-green font-bold text-lg">Level: {herbloreLevel || 1}</span>
        </div>
        <p className="text-xs text-[#c0c0c0] italic">Mix potions for combat buffs.</p>
      </div>

      <div className="grid grid-cols-1 gap-2">
        {RECIPES.map((recipe) => {
          const hasHerb = inventory.some(i => i.id.startsWith(recipe.herb));
          const hasSecondary = inventory.some(i => i.id.startsWith(recipe.secondary));
          const hasVial = inventory.some(i => i.id.startsWith('vial_of_water'));
          const canMake = hasHerb && hasSecondary && hasVial && herbloreLevel >= recipe.level;

          return (
            <div key={recipe.name} className={`bg-[#3e2e18] p-2 border border-[var(--osrs-border-light)] flex justify-between items-center group hover:border-osrs-yellow transition-colors ${!canMake ? 'opacity-70' : ''}`}>
              <div className="flex items-center gap-3">
                <img src={`${ASSETS.misc.wiki_base}${recipe.icon}.png`} className="w-8 h-8 object-contain" alt="" />
                <div>
                  <p className="text-osrs-orange font-bold text-xs group-hover:text-white">{recipe.name}</p>
                  <p className="text-[10px] text-[#c0c0c0]">{recipe.herb.replace('clean_', '')} + {recipe.secondary.replace(/_/g, ' ')}</p>
                  <p className="text-[9px] text-osrs-green">Lvl {recipe.level} • {recipe.xp} XP</p>
                </div>
              </div>
              <button 
                className={`osrs-button px-3 py-1.5 text-[10px] font-bold uppercase ${canMake ? 'text-osrs-yellow hover:text-white' : 'opacity-50 cursor-not-allowed'}`}
                disabled={!canMake}
                onClick={() => canMake && handleMakePotion(recipe)}
              >
                Mix
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};
