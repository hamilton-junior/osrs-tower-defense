
import React from 'react';

interface Pet {
    id: string;
    name: string;
    type: string;
    bonus: string;
}

interface PetTabProps {
  pets: Pet[];
  setActiveTooltip: (tooltip: any | null) => void;
  playSound: (sound: string) => void;
}

export const PetTab: React.FC<PetTabProps> = ({ 
  pets, 
  setActiveTooltip,
  playSound 
}) => {
  return (
    <div className="flex flex-col gap-3 h-full overflow-y-auto custom-scrollbar pr-1">
      <div className="text-center border-b border-[var(--osrs-border-light)] pb-1 mb-1">
        <span className="text-xs font-bold text-osrs-orange uppercase">Pet Menagerie</span>
      </div>
      
      {pets.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 opacity-40">
           <p className="text-[11px] text-[#c0c0c0] text-center">No pets following you yet...</p>
           <p className="text-[9px] text-[#808080] text-center mt-1">Complete rare feats or defeat bosses to earn followers.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2">
          {pets.map((pet) => (
            <div 
              key={pet.id}
              className="osrs-panel p-2 flex items-center gap-3 hover:brightness-110 cursor-pointer transition-all border border-transparent hover:border-osrs-yellow/30"
              onMouseEnter={(e) => setActiveTooltip({
                x: e.clientX, y: e.clientY,
                title: pet.name,
                content: pet.bonus,
                color: '#00ffff'
              })}
              onMouseLeave={() => setActiveTooltip(null)}
              onClick={() => playSound('click')}
            >
              <div className="w-10 h-10 bg-black/40 border border-[var(--osrs-border-dark)] rounded flex items-center justify-center p-1">
                <img 
                  src={`https://oldschool.runescape.wiki/images/${pet.name.replace(/ /g, '_')}_icon.png`}
                  alt={pet.name}
                  className="max-w-full max-h-full object-contain"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = `https://oldschool.runescape.wiki/images/${pet.type.replace(/ /g, '_')}_icon.png`;
                  }}
                />
              </div>
              <div className="flex flex-col overflow-hidden">
                <span className="text-[11px] font-bold text-white truncate">{pet.name}</span>
                <span className="text-[9px] text-osrs-yellow italic truncate">{pet.bonus}</span>
              </div>
            </div>
          ))}
        </div>
      )}
      
      <div className="mt-auto pt-4 border-t border-[var(--osrs-border-dark)]">
         <p className="text-[9px] text-[#5d5245] text-center italic">Only one pet can follow you at a time.</p>
      </div>
    </div>
  );
};
