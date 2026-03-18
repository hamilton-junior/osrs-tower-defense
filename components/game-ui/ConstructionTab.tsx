import React, { useState } from 'react';
import { Item } from '@/lib/game/types';
import { ASSETS } from '@/lib/game/assets';

export interface POHUpgrade {
  id: string;
  name: string;
  description: string;
  levelReq: number;
  xpReward: number;
  materials: { id: string; name: string; amount: number }[];
  buffDescription: string;
}

export const POH_UPGRADES: POHUpgrade[] = [
  {
    id: 'wooden_bed',
    name: 'Wooden Bed',
    description: 'A basic bed to rest in.',
    levelReq: 1,
    xpReward: 50,
    materials: [
      { id: 'plank', name: 'Plank', amount: 3 },
      { id: 'steel_nails', name: 'Steel nails', amount: 3 }
    ],
    buffDescription: '+5% Base Tower Damage'
  },
  {
    id: 'oak_table',
    name: 'Oak Table',
    description: 'A sturdy table for planning.',
    levelReq: 22,
    xpReward: 150,
    materials: [
      { id: 'oak_plank', name: 'Oak plank', amount: 4 },
      { id: 'steel_nails', name: 'Steel nails', amount: 4 }
    ],
    buffDescription: '+10% GP from kills'
  },
  {
    id: 'teak_shelves',
    name: 'Teak Shelves',
    description: 'Store your supplies efficiently.',
    levelReq: 45,
    xpReward: 400,
    materials: [
      { id: 'teak_plank', name: 'Teak plank', amount: 3 },
      { id: 'steel_nails', name: 'Steel nails', amount: 6 }
    ],
    buffDescription: '+10% Item Drop Rate'
  },
  {
    id: 'mahogany_portal',
    name: 'Mahogany Portal',
    description: 'A magical portal to anywhere.',
    levelReq: 65,
    xpReward: 1000,
    materials: [
      { id: 'mahogany_plank', name: 'Mahogany plank', amount: 5 },
      { id: 'law_rune', name: 'Law rune', amount: 10 }
    ],
    buffDescription: '-10% Tower Cooldowns'
  }
];

interface ConstructionTabProps {
  inventory: (Item & { amount?: number })[];
  constructionLevel: number;
  pohUpgrades: string[];
  buildUpgrade: (upgradeId: string) => void;
  addMessage: (msg: string) => void;
}

export const ConstructionTab: React.FC<ConstructionTabProps> = ({
  inventory,
  constructionLevel,
  pohUpgrades,
  buildUpgrade,
  addMessage
}) => {
  const hasMaterials = (materials: { id: string; amount: number }[]) => {
    return materials.every(req => {
      const count = inventory.filter(i => i.id.startsWith(req.id)).length;
      return count >= req.amount;
    });
  };

  return (
    <div className="flex flex-col text-[var(--osrs-text)] font-osrs">
      <div className="text-center mb-4">
        <h2 className="text-xl text-[var(--osrs-orange)]">Player-Owned House</h2>
        <p className="text-sm">Construction Level: {constructionLevel}</p>
      </div>

      <div className="pr-2 space-y-2">
        {POH_UPGRADES.map(upgrade => {
          const isBuilt = pohUpgrades.includes(upgrade.id);
          const canBuild = constructionLevel >= upgrade.levelReq && hasMaterials(upgrade.materials);

          return (
            <div key={upgrade.id} className={`p-2 border-2 ${isBuilt ? 'border-green-600 bg-green-900/30' : 'border-[var(--osrs-border-light)] bg-[var(--osrs-brown-dark)]'} rounded`}>
              <div className="flex justify-between items-start mb-2">
                <div>
                  <h3 className="font-bold text-[var(--osrs-orange)]">{upgrade.name}</h3>
                  <p className="text-xs text-gray-300">{upgrade.description}</p>
                  <p className="text-xs text-yellow-400 mt-1">Buff: {upgrade.buffDescription}</p>
                </div>
                {isBuilt ? (
                  <span className="text-green-400 text-sm font-bold">BUILT</span>
                ) : (
                  <button
                    className={`osrs-button px-3 py-1 text-xs ${canBuild ? '' : 'opacity-50 cursor-not-allowed'}`}
                    disabled={!canBuild}
                    onClick={() => buildUpgrade(upgrade.id)}
                  >
                    Build
                  </button>
                )}
              </div>

              {!isBuilt && (
                <div className="text-xs">
                  <p className={constructionLevel >= upgrade.levelReq ? 'text-green-400' : 'text-red-400'}>
                    Requires Level {upgrade.levelReq}
                  </p>
                  <div className="mt-1">
                    <p className="text-gray-400">Materials:</p>
                    <ul className="list-disc list-inside">
                      {upgrade.materials.map(mat => {
                        const count = inventory.filter(i => i.id.startsWith(mat.id)).length;
                        const hasEnough = count >= mat.amount;
                        return (
                          <li key={mat.id} className={hasEnough ? 'text-green-400' : 'text-red-400'}>
                            {mat.name}: {count} / {mat.amount}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                  <p className="text-gray-400 mt-1">Grants {upgrade.xpReward} XP</p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
