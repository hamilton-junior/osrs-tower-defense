import React from 'react';
import { ASSETS } from '@/lib/game/assets';
import { ITEMS } from '@/lib/game/data/items';

interface FarmingTabProps {
  farmingPatches: any[];
  inventory: any[];
  plantSeed: (patchId: string, seedItem: any) => void;
  harvestPatch: (patchId: string) => void;
  applyCompost?: (patchId: string, compostItem: any) => void;
  curePatch?: (patchId: string) => void;
  addMessage: (msg: string) => void;
  setActiveTooltip: (tooltip: any | null) => void;
}

export const FarmingTab: React.FC<FarmingTabProps> = ({
  farmingPatches,
  inventory,
  plantSeed,
  harvestPatch,
  applyCompost,
  curePatch,
  addMessage,
  setActiveTooltip
}) => {
  return (
    <div className="flex flex-col gap-2 pr-1">
      <div className="text-center border-b border-[var(--osrs-border-light)] pb-1 mb-1">
        <span className="text-xs font-bold text-osrs-orange uppercase">Farming Patches</span>
      </div>

      <div className="grid grid-cols-1 gap-2">
        {farmingPatches?.map(patch => {
          const isReady = patch.stage === patch.maxStage;
          const isGrowing = patch.stage > 0 && patch.stage < patch.maxStage;
          const isEmpty = patch.stage === 0;
          const isDiseased = patch.diseased;
          
          let seedItem = null;
          if (patch.seed) {
            seedItem = Object.values(ITEMS).find(i => i.id === patch.seed);
          }

          const progress = isGrowing ? (patch.stage / patch.maxStage) * 100 : (isReady ? 100 : 0);

          return (
            <div 
              key={patch.id} 
              className={`osrs-panel p-2 flex flex-col gap-2 border ${isReady ? 'border-osrs-green' : isDiseased ? 'border-red-500 bg-red-900/20' : 'border-[var(--osrs-border-dark)] hover:border-osrs-yellow/30'} transition-all`}
            >
              <div className="flex justify-between items-center">
                <span className="text-osrs-yellow font-bold text-xs uppercase capitalize">
                  {patch.type} Patch {patch.compost ? `(${patch.compost})` : ''}
                </span>
                {isDiseased && <span className="text-[10px] text-red-500 font-bold uppercase animate-pulse">Diseased!</span>}
                {isReady && !isDiseased && <span className="text-[10px] text-osrs-green font-bold uppercase animate-pulse">Ready!</span>}
                {isGrowing && !isDiseased && <span className="text-[10px] text-osrs-cyan font-bold uppercase">{Math.floor(progress)}%</span>}
                {isEmpty && <span className="text-[10px] text-[#808080] font-bold uppercase">Empty</span>}
              </div>

              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-black/40 border border-[var(--osrs-border-dark)] rounded flex items-center justify-center relative">
                  {isEmpty && (
                    <img src={ASSETS.misc.farming_icon} className="w-6 h-6 object-contain opacity-50 grayscale" alt="Empty Patch" />
                  )}
                  {isGrowing && seedItem && (
                    <img 
                      src={`${ASSETS.misc.wiki_base}${seedItem.name.replace(/ /g, '_')}.png`} 
                      className="w-6 h-6 object-contain opacity-70" 
                      alt={seedItem.name} 
                      onError={(e) => { e.currentTarget.src = ASSETS.misc.farming_icon; }}
                    />
                  )}
                  {isReady && seedItem && (
                    <img 
                      src={`${ASSETS.misc.wiki_base}${seedItem.harvestItem?.replace('clean_', '').replace('grimy_', '') || 'guam'}.png`} 
                      className="w-8 h-8 object-contain" 
                      alt="Ready to harvest" 
                      onError={(e) => { e.currentTarget.src = ASSETS.misc.farming_icon; }}
                    />
                  )}
                </div>

                <div className="flex-1 flex flex-col justify-center gap-1">
                  {isEmpty ? (
                    <>
                      <button 
                        className="osrs-button py-1.5 text-[10px] uppercase w-full"
                        onClick={() => {
                          const seed = inventory.find(i => i.type === 'seed' && i.seedType === patch.type);
                          if (seed) {
                            plantSeed(patch.id, seed);
                          } else {
                            addMessage(`You need a ${patch.type} seed to plant here.`);
                          }
                        }}
                      >
                        Plant Seed
                      </button>
                      {!patch.compost && (
                        <button 
                          className="osrs-button py-1.5 text-[10px] uppercase w-full text-osrs-orange"
                          onClick={() => {
                            const compost = inventory.find(i => i.id.includes('compost'));
                            if (compost && applyCompost) {
                              applyCompost(patch.id, compost);
                            } else {
                              addMessage("You don't have any compost.");
                            }
                          }}
                        >
                          Apply Compost
                        </button>
                      )}
                    </>
                  ) : isDiseased ? (
                    <button 
                      className="osrs-button py-1.5 text-[10px] uppercase w-full text-red-500 border-red-500"
                      onClick={() => {
                        const cure = inventory.find(i => i.id.startsWith('plant_cure'));
                        if (cure && curePatch) {
                          curePatch(patch.id);
                        } else {
                          addMessage("You need Plant Cure to save this patch!");
                        }
                      }}
                    >
                      Cure Disease
                    </button>
                  ) : isReady ? (
                    <button 
                      className="osrs-button py-1.5 text-[10px] uppercase w-full text-osrs-green border-osrs-green"
                      onClick={() => harvestPatch(patch.id)}
                    >
                      Harvest
                    </button>
                  ) : (
                    <div className="w-full bg-black/60 border border-[var(--osrs-border-dark)] h-3 rounded overflow-hidden relative">
                      <div 
                        className="h-full bg-osrs-cyan transition-all duration-1000" 
                        style={{ width: `${progress}%` }}
                      />
                      <span className="absolute inset-0 flex items-center justify-center text-[8px] text-white font-bold drop-shadow-md">
                        Growing...
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
