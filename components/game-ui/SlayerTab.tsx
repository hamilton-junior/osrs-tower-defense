import React from 'react';
import { ASSETS } from '@/lib/game/assets';
import { ENEMIES } from '@/lib/game/data/enemies';
import { EnemyType } from '@/lib/game/types';

interface SlayerTabProps {
  slayerPoints: number;
  slayerTask: { type: EnemyType, count: number, reward: number } | null;
  consecutiveTasks: number;
  unlockedTowers: string[];
  blockedEnemies: string[];
  extendedTasks: string[];
  unlockTower: (towerId: string, cost: number) => void;
  blockEnemy: (enemyType: string, cost: number) => void;
  extendTask: (enemyType: string, cost: number) => void;
  skipTask: (cost: number) => void;
  addMessage: (msg: string) => void;
}

export const SlayerTab: React.FC<SlayerTabProps> = ({
  slayerPoints,
  slayerTask,
  consecutiveTasks,
  unlockedTowers,
  blockedEnemies,
  extendedTasks,
  unlockTower,
  blockEnemy,
  extendTask,
  skipTask,
  addMessage
}) => {
  const UNLOCKS = [
    { id: 'cannon', name: 'Dwarf Multicannon', cost: 100, desc: 'Unlocks the Cannon tower.' },
    { id: 'slayer', name: 'Slayer Tower', cost: 250, desc: 'Unlocks the Slayer melee tower.' }
  ];

  const BLOCK_COST = 50;
  const EXTEND_COST = 30;
  const SKIP_COST = 30;

  return (
    <div className="flex flex-col h-full text-osrs-yellow font-osrs">
      <div className="flex items-center gap-2 mb-4 border-b border-osrs-border-dark pb-2">
        <img src={ASSETS.misc.slayer_crossbow} className="w-6 h-6" alt="Slayer" />
        <h2 className="text-xl">Slayer Master</h2>
      </div>

      <div className="flex justify-between items-center mb-4 bg-black/50 p-2 rounded border border-osrs-border-dark">
        <div>
          <span className="text-gray-400">Slayer Points: </span>
          <span className="text-white">{slayerPoints}</span>
        </div>
        <div>
          <span className="text-gray-400">Task Streak: </span>
          <span className="text-white">{consecutiveTasks}</span>
        </div>
      </div>

      <div className="mb-4 bg-black/50 p-2 rounded border border-osrs-border-dark">
        <h3 className="text-lg mb-2 text-osrs-orange">Current Task</h3>
        {slayerTask ? (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <img src={ASSETS.enemies[slayerTask.type as keyof typeof ASSETS.enemies] || ASSETS.misc.portal} className="w-8 h-8 object-contain" alt={slayerTask.type} />
              <div>
                <div className="text-white">{ENEMIES[slayerTask.type]?.name || slayerTask.type}</div>
                <div className="text-sm text-gray-400">{slayerTask.count} remaining</div>
              </div>
            </div>
            <button
              className={`px-3 py-1 text-sm rounded border ${slayerPoints >= SKIP_COST ? 'bg-red-900/50 border-red-500 hover:bg-red-800/50 text-white' : 'bg-gray-800 border-gray-600 text-gray-500 cursor-not-allowed'}`}
              onClick={() => slayerPoints >= SKIP_COST && skipTask(SKIP_COST)}
              title={`Skip task for ${SKIP_COST} points`}
              disabled={slayerPoints < SKIP_COST}
            >
              Skip ({SKIP_COST})
            </button>
          </div>
        ) : (
          <div className="text-gray-400 italic">No active task. Complete a wave to get one.</div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
        <h3 className="text-lg mb-2 text-osrs-orange">Unlocks</h3>
        <div className="space-y-2 mb-4">
          {UNLOCKS.map(unlock => {
            const isUnlocked = unlockedTowers.includes(unlock.id);
            return (
              <div key={unlock.id} className="bg-black/40 p-2 rounded border border-osrs-border-dark flex justify-between items-center">
                <div>
                  <div className="text-white">{unlock.name}</div>
                  <div className="text-xs text-gray-400">{unlock.desc}</div>
                </div>
                {isUnlocked ? (
                  <span className="text-green-500 text-sm">Unlocked</span>
                ) : (
                  <button
                    className={`px-3 py-1 text-sm rounded border ${slayerPoints >= unlock.cost ? 'bg-osrs-brown-dark border-osrs-border-light hover:bg-osrs-brown text-white' : 'bg-gray-800 border-gray-600 text-gray-500 cursor-not-allowed'}`}
                    onClick={() => slayerPoints >= unlock.cost && unlockTower(unlock.id, unlock.cost)}
                    disabled={slayerPoints < unlock.cost}
                  >
                    {unlock.cost} pts
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <h3 className="text-lg mb-2 text-osrs-orange">Block & Extend List</h3>
        <div className="text-xs text-gray-400 mb-2">Block enemies ({BLOCK_COST} pts) or Extend tasks ({EXTEND_COST} pts).</div>
        <div className="grid grid-cols-1 gap-2 mb-4">
          {Object.entries(ENEMIES).filter(([_, e]) => !e.isBoss).map(([id, enemy]) => {
            const isBlocked = blockedEnemies.includes(id);
            const isExtended = extendedTasks.includes(id);
            return (
              <div key={id} className="flex items-center justify-between p-2 border rounded bg-black/40 border-osrs-border-dark">
                <div className="flex items-center gap-2">
                  <img src={ASSETS.enemies[id as keyof typeof ASSETS.enemies] || ASSETS.misc.portal} className="w-8 h-8 object-contain" alt={enemy.name} />
                  <span className="text-sm">{enemy.name}</span>
                </div>
                <div className="flex gap-2">
                  <button
                    className={`px-2 py-1 text-xs rounded border ${isExtended ? 'bg-green-900/50 border-green-500 text-green-400 cursor-default' : slayerPoints >= EXTEND_COST ? 'bg-osrs-brown-dark border-osrs-border-light hover:bg-osrs-brown text-white' : 'bg-gray-800 border-gray-600 text-gray-500 cursor-not-allowed'}`}
                    onClick={() => {
                      if (!isExtended && slayerPoints >= EXTEND_COST) extendTask(id, EXTEND_COST);
                      else if (!isExtended) addMessage("Not enough Slayer Points.");
                    }}
                    disabled={isExtended || slayerPoints < EXTEND_COST}
                  >
                    {isExtended ? 'Extended' : `Extend (${EXTEND_COST})`}
                  </button>
                  <button
                    className={`px-2 py-1 text-xs rounded border ${isBlocked ? 'bg-red-900/50 border-red-500 text-red-400 cursor-default' : slayerPoints >= BLOCK_COST ? 'bg-osrs-brown-dark border-osrs-border-light hover:bg-osrs-brown text-white' : 'bg-gray-800 border-gray-600 text-gray-500 cursor-not-allowed'}`}
                    onClick={() => {
                      if (!isBlocked && slayerPoints >= BLOCK_COST) blockEnemy(id, BLOCK_COST);
                      else if (!isBlocked) addMessage("Not enough Slayer Points.");
                    }}
                    disabled={isBlocked || slayerPoints < BLOCK_COST}
                  >
                    {isBlocked ? 'Blocked' : `Block (${BLOCK_COST})`}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
