'use client';

import React, { useRef, useEffect, useState } from 'react';
import { GameEngine, GlobalUpgrades } from '@/lib/game/engine';

interface TowerSkill {
  level: number;
  xp: number;
  nextLevelXp: number;
}

interface TowerData {
  id: string;
  name: string;
  type: string;
  level: number;
  maxLevel: number;
  damage: number;
  range: number;
  cooldown: number;
  upgradeCost: number;
  skills: Record<string, TowerSkill>;
  equipment?: Record<string, any>;
}

interface EnemyData {
  id: string;
  type: string;
  hp: number;
  maxHp: number;
  speed: number;
  reward: number;
}

interface SlayerTask {
  type: string;
  count: number;
  total: number;
  reward: number;
}

interface GameState {
  money: number;
  lives: number;
  wave: number;
  isPlaying: boolean;
  runeEssence?: number;
  slayerTask?: SlayerTask | null;
  consecutiveTasks?: number;
  remainingEnemies?: number;
  prayerPoints?: number;
  maxPrayerPoints?: number;
  activePrayers?: string[];
  specialAttackCharge?: number;
  achievements?: any[];
  pets?: any[];
  inventory?: any[];
  quests?: any[];
  autoSpawnTimer?: number;
  achievementPoints?: number;
}

export default function GameCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const [gameState, setGameState] = useState<GameState>({
    money: 150,
    lives: 20,
    wave: 1,
    isPlaying: false,
    runeEssence: 0,
    slayerTask: null,
    consecutiveTasks: 0,
    remainingEnemies: 0,
    prayerPoints: 10,
    maxPrayerPoints: 10,
    activePrayers: [],
    specialAttackCharge: 0,
    achievements: [],
    pets: [],
    inventory: [],
    quests: []
  });

  const [autoSpawn, setAutoSpawn] = useState(false);
  const [autoSpawnDelay, setAutoSpawnDelay] = useState(3);
  const [autoSpawnTimer, setAutoSpawnTimer] = useState(0);
  const [gameSpeed, setGameSpeed] = useState(1);

  // Persistence
  const [runeEssence, setRuneEssence] = useState(0);
  const [upgrades, setUpgrades] = useState<GlobalUpgrades>({
    archerRange: 1.0,
    magicDamage: 1.0,
    cannonSpeed: 1.0,
    slayerReward: 1.0,
    prayerEfficiency: 1.0,
    startingMoney: 0,
    rewardMultiplier: 1.0,
    waveSpeed: 1.0,
    towerCostReduction: 1.0,
    xpGainMultiplier: 1.0,
    prayerRegen: 0
  });

  const UPGRADE_LIMITS = {
    archerRange: 2.0, // Max +100%
    magicDamage: 2.5, // Max +150%
    cannonSpeed: 2.0, // Max +100%
    slayerReward: 2.5,  // Max +150%
    prayerEfficiency: 2.0, // Max +100%
    startingMoney: 500,
    rewardMultiplier: 2.5,
    waveSpeed: 2.0,
    towerCostReduction: 0.5, // Max 50% discount
    xpGainMultiplier: 3.0,
    prayerRegen: 1.0 // 1 point per second
  };

  const [showGrandExchange, setShowGrandExchange] = useState(false);
  const [showAchievements, setShowAchievements] = useState(false);
  const [showQuests, setShowQuests] = useState(false);
  const [showInventory, setShowInventory] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [hoveredEntity, setHoveredEntity] = useState<any | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const [rightClickedEntity, setRightClickedEntity] = useState<any | null>(null);

  useEffect(() => {
    setIsMounted(true);
    const savedEssence = localStorage.getItem('osrs_td_essence');
    if (savedEssence) setRuneEssence(parseInt(savedEssence));
    
    const savedUpgrades = localStorage.getItem('osrs_td_upgrades');
    if (savedUpgrades) setUpgrades(JSON.parse(savedUpgrades));
  }, []);

  useEffect(() => {
    if (!isMounted) return;
    // Save to local storage
    localStorage.setItem('osrs_td_essence', runeEssence.toString());
    localStorage.setItem('osrs_td_upgrades', JSON.stringify(upgrades));
  }, [runeEssence, upgrades, isMounted]);

  useEffect(() => {
    if (!canvasRef.current || !isMounted) return;

    console.log('Initializing GameEngine...');
    // Initialize game engine
    const canvas = canvasRef.current;
    const engine = new GameEngine(canvas, (state: Partial<GameState>) => {
      setGameState((prev: GameState) => ({ ...prev, ...state }));
      if (state.runeEssence !== undefined) {
        setRuneEssence(state.runeEssence);
      }
    }, runeEssence, upgrades);
    engineRef.current = engine;

    // Start loop
    engine.start();

    // Use ResizeObserver for more reliable sizing
    const resizeObserver = new ResizeObserver(() => {
      engine.resize();
    });
    
    if (canvas.parentElement) {
      resizeObserver.observe(canvas.parentElement);
    }

    return () => {
      console.log('Stopping GameEngine...');
      engine.stop();
      resizeObserver.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMounted]); 
  
  // To handle updates from GE to Engine:
  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.upgrades = upgrades;
      engineRef.current.runeEssence = runeEssence;
      engineRef.current.autoSpawnEnabled = autoSpawn;
      engineRef.current.autoSpawnDelay = autoSpawnDelay;
      engineRef.current.gameSpeed = gameSpeed;
    }
  }, [upgrades, runeEssence, autoSpawn, autoSpawnDelay, gameSpeed]);

  // Handle engine state updates locally
  useEffect(() => {
    if (gameState.autoSpawnTimer !== undefined) setAutoSpawnTimer(gameState.autoSpawnTimer);
  }, [gameState.autoSpawnTimer]);


  const handleStartWave = () => {
    engineRef.current?.startWave();
  };

  const handlePathChange = (index: number) => {
    engineRef.current?.setPath(index);
  };

  const handleTogglePrayer = (type: string) => {
    engineRef.current?.togglePrayer(type as any);
  };

  const handleSpecialAttack = () => {
    engineRef.current?.useSpecialAttack();
  };

  const handleBuyPotion = (type: 'overload' | 'super_restore' | 'prayer_potion') => {
    engineRef.current?.buyPotion(type);
  };

  const buyUpgrade = (type: keyof GlobalUpgrades, cost: number, increment: number) => {
    const currentVal = upgrades[type];
    const limit = UPGRADE_LIMITS[type];
    
    // Check if within limits (handles both positive and negative increments)
    const canUpgrade = increment > 0 ? currentVal < limit : currentVal > limit;
    
    if (runeEssence >= cost && canUpgrade) {
      setRuneEssence((prev: number) => prev - cost);
      setUpgrades((prev: GlobalUpgrades) => ({
        ...prev,
        [type]: increment > 0 ? Math.min(prev[type] + increment, limit) : Math.max(prev[type] + increment, limit)
      }));
    }
  };

  // Tower selection
  const [selectedTower, setSelectedTower] = useState<string | null>(null);
  const [selectedPlacedTower, setSelectedPlacedTower] = useState<any | null>(null);

  const handleCanvasClick = (e: React.MouseEvent) => {
    if (!engineRef.current) return;
    
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    if (selectedTower) {
      engineRef.current.placeTower(selectedTower, x, y);
      setSelectedTower(null); // Deselect after placement
    } else {
      // Check if clicked on existing tower
      const entity = engineRef.current.getEntityAt(x, y);
      if (entity && entity.type === 'tower') {
        setSelectedPlacedTower(entity.data);
      } else {
        setSelectedPlacedTower(null);
      }
    }
  };

  const handleUpgrade = () => {
    if (engineRef.current && selectedPlacedTower) {
      engineRef.current.upgradeTower(selectedPlacedTower.id);
      // Force update state to reflect changes
      setSelectedPlacedTower({ ...selectedPlacedTower, ...engineRef.current.towers.find((t: any) => t.id === selectedPlacedTower.id) });
    }
  };

  const handleSell = () => {
    if (engineRef.current && selectedPlacedTower) {
      engineRef.current.sellTower(selectedPlacedTower.id);
      setSelectedPlacedTower(null);
    }
  };

  const handleClaimQuest = (questId: string) => {
    engineRef.current?.claimQuestReward(questId);
  };

  const handleEquipItem = (itemId: string) => {
    if (engineRef.current && selectedPlacedTower) {
      engineRef.current.equipItem(selectedPlacedTower.id, itemId);
      // Update selected tower state
      const updatedTower = engineRef.current.towers.find((t: any) => t.id === selectedPlacedTower.id);
      if (updatedTower) setSelectedPlacedTower({ ...updatedTower });
      setShowInventory(false);
    }
  };

  const handleUnequipItem = (slot: 'weapon' | 'shield' | 'accessory') => {
    if (engineRef.current && selectedPlacedTower) {
      engineRef.current.unequipItem(selectedPlacedTower.id, slot);
      const updatedTower = engineRef.current.towers.find((t: any) => t.id === selectedPlacedTower.id);
      if (updatedTower) setSelectedPlacedTower({ ...updatedTower });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!engineRef.current) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const entity = engineRef.current.getEntityAt(x, y);
    if (entity) {
      setHoveredEntity(entity);
      setTooltipPos({ x: e.clientX, y: e.clientY });
      engineRef.current.hoveredEntityId = entity.data.id;
    } else {
      setHoveredEntity(null);
      engineRef.current.hoveredEntityId = null;
    }
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!engineRef.current) return;

    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const entity = engineRef.current.getEntityAt(x, y) as any;
    if (entity && entity.type === 'tower') {
      const tower = engineRef.current.towers.find((t: any) => t.id === entity.data.id);
      if (tower) {
        tower.showRange = !tower.showRange;
        setGameState(prev => ({ ...prev })); // Force re-render
      }
    }
  };

  if (!isMounted) return <div className="w-full h-full bg-[#1e1e1e]" />;

  return (
    <div className="relative w-full h-full flex flex-col overflow-hidden bg-[#000]">
      {/* Canvas - Moved to top and absolute to stay behind UI */}
      <canvas 
        ref={canvasRef}
        className="absolute inset-0 block cursor-crosshair touch-none w-full h-full z-0"
        onClick={handleCanvasClick}
        onMouseMove={handleMouseMove}
        onContextMenu={handleContextMenu}
      />

      {/* Game HUD */}
      <div className="absolute top-0 left-0 w-full p-2 flex justify-between items-start pointer-events-none z-10">
        <div className="flex gap-4 bg-[#3d3d3d]/90 p-2 border-2 border-[#5d5d5d] rounded text-[#ffff00] shadow-lg pointer-events-auto">
          <div className="flex flex-col items-center px-2">
            <span className="text-xs text-[#c0c0c0]">HP</span>
            <span className="font-bold text-xl text-[#ff0000]">{gameState.lives}</span>
          </div>
          <div className="w-px bg-[#5d5d5d]"></div>
          <div className="flex flex-col items-center px-2">
            <span className="text-xs text-[#c0c0c0]">GP</span>
            <span className="font-bold text-xl text-[#ffff00]">{gameState.money}</span>
          </div>
          <div className="w-px bg-[#5d5d5d]"></div>
          <div className="flex flex-col items-center px-2">
            <span className="text-xs text-[#c0c0c0]">Wave</span>
            <span className="font-bold text-xl text-[#ffffff]">{gameState.wave}</span>
          </div>
          <div className="w-px bg-[#5d5d5d]"></div>
          <div className="flex flex-col items-center px-2">
            <span className="text-xs text-[#c0c0c0]">Enemies</span>
            <span className="font-bold text-xl text-[#ff4500]">{gameState.remainingEnemies || 0}</span>
          </div>
          <div className="w-px bg-[#5d5d5d]"></div>
          <div className="flex flex-col items-center px-2">
            <span className="text-xs text-[#c0c0c0]">Essence</span>
            <span className="font-bold text-xl text-[#00ffff]">{gameState.runeEssence || 0}</span>
          </div>
          <div className="w-px bg-[#5d5d5d]"></div>
          <div className="flex flex-col items-center px-2">
            <span className="text-xs text-[#c0c0c0]">Points</span>
            <span className="font-bold text-xl text-[#ffff00]">{gameState.achievementPoints || 0}</span>
          </div>
        </div>

        <div className="flex flex-col gap-2 items-end pointer-events-auto">
          <div className="flex gap-2">
            <div className="flex flex-col gap-1">
              <button 
                onClick={handleSpecialAttack}
                disabled={!gameState.isPlaying || (gameState.specialAttackCharge || 0) < 50}
                className={`
                  px-4 py-2 border-2 border-[#2d2d2d] font-bold shadow-lg transition-all text-xs
                  ${(gameState.specialAttackCharge || 0) >= 50 
                    ? 'bg-[#ff4500] hover:bg-[#ff6347] text-white animate-pulse' 
                    : 'bg-[#5d5d5d] text-[#808080] cursor-not-allowed'}
                `}
              >
                SPECIAL ({(gameState.specialAttackCharge || 0).toFixed(0)}%)
              </button>
              <div className="h-2 w-full bg-[#2d2d2d] border border-[#5d5d5d] rounded-full overflow-hidden">
                <div 
                  className="h-full bg-[#ff4500] transition-all duration-300" 
                  style={{ width: `${Math.min(100, (gameState.specialAttackCharge || 0))}%` }}
                />
              </div>
            </div>

            <button 
              onClick={handleStartWave}
              className="bg-[#5d5d5d] hover:bg-[#6d6d6d] text-[#ffff00] px-4 py-2 border-2 border-[#2d2d2d] font-bold shadow-lg active:translate-y-1 transition-transform h-fit"
            >
              Start Wave
            </button>
          </div>

          <div className="flex gap-2 items-center bg-[#3d3d3d]/90 p-1 border-2 border-[#5d5d5d] rounded shadow-lg">
            <span className="text-[10px] font-bold text-[#c0c0c0] px-1">SPEED:</span>
            {[1, 2, 3].map(speed => (
              <button
                key={speed}
                onClick={() => setGameSpeed(speed)}
                className={`
                  px-3 py-1 text-xs font-bold rounded transition-all
                  ${gameSpeed === speed ? 'bg-[#ffff00] text-black shadow-[0_0_5px_rgba(255,255,0,0.5)]' : 'bg-[#2d2d2d] text-[#c0c0c0] hover:bg-[#4d4d4d]'}
                `}
              >
                {speed}x
              </button>
            ))}
          </div>

          <div className="bg-[#3d3d3d]/90 p-2 border-2 border-[#5d5d5d] rounded shadow-lg flex flex-col gap-2 min-w-[150px]">
            <div className="flex items-center justify-between gap-4">
              <label className="text-[10px] font-bold text-[#c0c0c0] cursor-pointer flex items-center gap-2">
                <input 
                  type="checkbox" 
                  checked={autoSpawn} 
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAutoSpawn(e.target.checked)}
                  className="accent-[#ffff00]"
                />
                AUTO-SPAWN
              </label>
              {(autoSpawnTimer || 0) > 0 && !gameState.isPlaying && (
                <span className="text-xs font-bold text-[#00ff00]">:{autoSpawnTimer.toFixed(1)}s</span>
              )}
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] text-[#c0c0c0]">DELAY:</span>
              <input 
                type="number" 
                min="1" 
                max="30" 
                value={autoSpawnDelay} 
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAutoSpawnDelay(parseInt(e.target.value) || 3)}
                className="w-12 bg-[#1e1e1e] border border-[#5d5d5d] text-[#00ff00] text-xs px-1 rounded"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Prayer Side Bar */}
      <div className="absolute right-4 top-1/2 -translate-y-1/2 flex flex-col gap-2 z-10 pointer-events-auto">
        <div className="bg-[#3d3d3d]/90 p-2 border-2 border-[#5d5d5d] rounded flex flex-col items-center">
          <span className="text-[10px] text-[#00ffff] font-bold">PRAYER</span>
          <span className="text-sm text-white font-bold">{(gameState.prayerPoints || 0).toFixed(1)}</span>
          <div className="w-1 h-20 bg-[#2d2d2d] border border-[#5d5d5d] rounded-full mt-1 relative overflow-hidden">
            <div 
              className="absolute bottom-0 left-0 w-full bg-[#00ffff] transition-all duration-300"
              style={{ height: `${((gameState.prayerPoints || 0) / (gameState.maxPrayerPoints || 10)) * 100}%` }}
            />
          </div>
        </div>
        
        {[
          { id: 'piety', name: 'Piety', color: '#ffff00', desc: 'Dmg +20%' },
          { id: 'rigour', name: 'Rigour', color: '#00ff00', desc: 'Range +20%' },
          { id: 'augury', name: 'Augury', color: '#00ffff', desc: 'Dmg +15%' }
        ].map(prayer => (
          <button
            key={prayer.id}
            onClick={() => handleTogglePrayer(prayer.id)}
            className={`
              w-12 h-12 border-2 rounded flex flex-col items-center justify-center transition-all group relative
              ${gameState.activePrayers?.includes(prayer.id) 
                ? 'border-[#ffff00] bg-[#ffff00]/20 shadow-[0_0_10px_rgba(255,255,0,0.5)]' 
                : 'border-[#5d5d5d] bg-[#3d3d3d]/90 hover:border-[#ffff00]'}
            `}
          >
            <div className="text-[8px] font-bold text-white uppercase">{prayer.id[0]}</div>
            <div className="absolute left-[-100px] top-0 bg-black/90 text-[10px] text-white p-1 rounded opacity-0 group-hover:opacity-100 pointer-events-none w-24 text-center">
              {prayer.name}: {prayer.desc}
            </div>
          </button>
        ))}
      </div>

      {/* Potions Bar */}
      <div className="absolute left-4 top-1/2 -translate-y-1/2 flex flex-col gap-2 z-10 pointer-events-auto">
        {[
          { id: 'overload', name: 'Overload', cost: 100, color: '#800080' },
          { id: 'super_restore', name: 'Restore', cost: 50, color: '#ff00ff' },
          { id: 'prayer_potion', name: 'Prayer Pot', cost: 30, color: '#00ffff' }
        ].map(pot => (
          <button
            key={pot.id}
            onClick={() => handleBuyPotion(pot.id as any)}
            disabled={gameState.money < pot.cost}
            className={`
              w-12 h-12 border-2 rounded flex flex-col items-center justify-center transition-all group relative
              ${gameState.money >= pot.cost ? 'border-[#ffff00] bg-[#3d3d3d]/90 hover:bg-[#4d4d4d]' : 'border-[#5d5d5d] bg-[#2d2d2d] opacity-50 cursor-not-allowed'}
            `}
          >
            <div className="w-4 h-6 rounded-b-sm border border-white/30" style={{ backgroundColor: pot.color }}></div>
            <div className="text-[8px] font-bold text-[#ffff00] mt-1">{pot.cost}g</div>
            <div className="absolute right-[-100px] top-0 bg-black/90 text-[10px] text-white p-1 rounded opacity-0 group-hover:opacity-100 pointer-events-none w-24 text-center">
              {pot.name}
            </div>
          </button>
        ))}
      </div>

      {/* Slayer Task UI - Moved down to avoid HUD overlap */}
      <div className="absolute top-[160px] right-4 flex flex-col gap-2 z-10 pointer-events-auto">
        {gameState.slayerTask && (
          <div className="bg-[#3d3d3d]/90 p-2 border-2 border-[#5d5d5d] rounded text-[#ffff00] shadow-lg">
            <h3 className="text-xs font-bold text-[#ff981f] border-b border-[#5d5d5d] mb-1">Slayer Task</h3>
            <p className="text-sm">
              Kill {gameState.slayerTask.count} <span className="capitalize">{gameState.slayerTask.type.replace('_', ' ')}s</span>
            </p>
            <p className="text-xs text-[#c0c0c0]">Reward: {gameState.slayerTask.reward} gp</p>
            {(gameState.consecutiveTasks ?? 0) > 0 && (
              <p className="text-[10px] text-[#00ff00]">Streak: {gameState.consecutiveTasks} (+{(gameState.consecutiveTasks ?? 0) * 10}%)</p>
            )}
          </div>
        )}

        {/* Pets UI */}
        {gameState.pets && gameState.pets.length > 0 && (
          <div className="bg-[#3d3d3d]/90 p-2 border-2 border-[#5d5d5d] rounded text-[#ffff00] shadow-lg">
            <h3 className="text-xs font-bold text-[#00ffff] border-b border-[#5d5d5d] mb-1">Pets ({gameState.pets.length})</h3>
            <div className="flex flex-wrap gap-1 max-w-[150px]">
              {gameState.pets.map((pet: any) => (
                <div key={pet.id} className="group relative">
                  <div className="w-8 h-8 bg-[#2d2d2d] border border-[#5d5d5d] rounded flex items-center justify-center cursor-help hover:border-[#00ffff] overflow-hidden">
                    <img
                      src={`https://oldschool.runescape.wiki/images/${pet.type.split('_').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join('_')}.png`}
                      alt={pet.name}
                      className="w-full h-full object-contain"
                      onError={(e) => { (e.target as HTMLImageElement).src = 'https://oldschool.runescape.wiki/images/Beaver.png'; }}
                    />
                  </div>
                  <div className="absolute right-full mr-2 top-0 bg-black/90 text-[10px] text-white p-2 rounded opacity-0 group-hover:opacity-100 pointer-events-none w-36 text-center z-20 border border-[#00ffff]">
                    <div className="text-[#ffff00] font-bold">{pet.name}</div>
                    <div className="text-[#c0c0c0] mt-1">{pet.bonus}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Path Selection & GE - Only show when not playing */}
      {!gameState.isPlaying && (
        <div className="absolute top-16 left-4 flex gap-2 pointer-events-auto z-10">
          {gameState.wave === 1 && (
            <>
              <button 
                onClick={() => handlePathChange(0)}
                className="bg-[#3d3d3d] hover:bg-[#4d4d4d] text-[#ffff00] px-3 py-1 border-2 border-[#5d5d5d] text-xs font-bold shadow-md"
              >
                Winding Path
              </button>
              <button 
                onClick={() => handlePathChange(1)}
                className="bg-[#3d3d3d] hover:bg-[#4d4d4d] text-[#ffff00] px-3 py-1 border-2 border-[#5d5d5d] text-xs font-bold shadow-md"
              >
                Spiral Path
              </button>
            </>
          )}
          <button 
            onClick={() => setShowGrandExchange(true)}
            className="bg-[#5d5d5d] hover:bg-[#6d6d6d] text-[#00ffff] px-3 py-1 border-2 border-[#2d2d2d] text-xs font-bold shadow-md ml-4"
          >
            Grand Exchange
          </button>
          <button 
            onClick={() => setShowAchievements(true)}
            className="bg-[#5d5d5d] hover:bg-[#6d6d6d] text-[#ffff00] px-3 py-1 border-2 border-[#2d2d2d] text-xs font-bold shadow-md"
          >
            Achievements
          </button>
          <button 
            onClick={() => setShowQuests(true)}
            className="bg-[#5d5d5d] hover:bg-[#6d6d6d] text-[#ff981f] px-3 py-1 border-2 border-[#2d2d2d] text-xs font-bold shadow-md"
          >
            Quests
          </button>
          <button 
            onClick={() => setShowInventory(true)}
            className="bg-[#5d5d5d] hover:bg-[#6d6d6d] text-[#c0c0c0] px-3 py-1 border-2 border-[#2d2d2d] text-xs font-bold shadow-md"
          >
            Inventory ({gameState.inventory?.length || 0})
          </button>
        </div>
      )}

      {/* Achievements Modal */}
      {showAchievements && (
        <div className="absolute inset-0 bg-black/80 z-50 flex items-center justify-center pointer-events-auto">
          <div className="bg-[#3d3d3d] border-4 border-[#5d5d5d] p-6 rounded-lg w-[400px] shadow-2xl relative">
            <div className="flex justify-between items-center mb-4 border-b-2 border-[#5d5d5d] pb-2">
              <h2 className="text-[#ffff00] font-bold text-2xl tracking-tight">Achievement Diary</h2>
              <button 
                onClick={() => setShowAchievements(false)} 
                className="text-[#ff0000] font-bold hover:scale-110 transition-transform cursor-pointer"
              >
                [X]
              </button>
            </div>
            
            <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
              {gameState.achievements?.map((ach) => (
                <div key={ach.id} className={`p-3 border rounded ${ach.completed ? 'bg-[#00ff00]/10 border-[#00ff00]' : 'bg-[#2d2d2d] border-[#4d4d4d]'}`}>
                  <div className="flex justify-between items-center">
                    <span className={`font-bold ${ach.completed ? 'text-[#00ff00]' : 'text-[#ffff00]'}`}>{ach.name}</span>
                    {ach.completed && <span className="text-[10px] bg-[#00ff00] text-black px-1 rounded font-bold">DONE</span>}
                  </div>
                  <p className="text-xs text-[#c0c0c0] mt-1">{ach.description}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Quests Modal */}
      {showQuests && (
        <div className="absolute inset-0 bg-black/80 z-50 flex items-center justify-center pointer-events-auto">
          <div className="bg-[#3d3d3d] border-4 border-[#5d5d5d] p-6 rounded-lg w-[450px] shadow-2xl relative">
            <div className="flex justify-between items-center mb-4 border-b-2 border-[#5d5d5d] pb-2">
              <h2 className="text-[#ff981f] font-bold text-2xl tracking-tight">Quest Journal</h2>
              <button 
                onClick={() => setShowQuests(false)} 
                className="text-[#ff0000] font-bold hover:scale-110 transition-transform cursor-pointer"
              >
                [X]
              </button>
            </div>
            
            <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
              {gameState.quests?.map((quest) => (
                <div key={quest.id} className={`p-3 border rounded ${quest.completed ? 'bg-[#00ff00]/10 border-[#00ff00]' : 'bg-[#2d2d2d] border-[#4d4d4d]'}`}>
                  <div className="flex justify-between items-center">
                    <span className={`font-bold ${quest.completed ? 'text-[#00ff00]' : 'text-[#ffff00]'}`}>{quest.name}</span>
                    {quest.completed && !quest.claimed && (
                      <button 
                        onClick={() => handleClaimQuest(quest.id)}
                        className="text-[10px] bg-[#00ff00] text-black px-2 py-1 rounded font-bold hover:bg-[#32CD32]"
                      >
                        CLAIM REWARD
                      </button>
                    )}
                    {quest.claimed && <span className="text-[10px] text-[#808080] font-bold italic">CLAIMED</span>}
                  </div>
                  <p className="text-xs text-[#c0c0c0] mt-1">{quest.description}</p>
                  <div className="mt-2 h-2 w-full bg-[#1e1e1e] rounded-full overflow-hidden border border-[#5d5d5d]">
                    <div 
                      className="h-full bg-[#ff981f]" 
                      style={{ width: `${(quest.objective.current / quest.objective.target) * 100}%` }}
                    />
                  </div>
                  <p className="text-[10px] text-right text-[#808080] mt-1">{quest.objective.current} / {quest.objective.target}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Inventory Modal */}
      {showInventory && (
        <div className="absolute inset-0 bg-black/80 z-50 flex items-center justify-center pointer-events-auto">
          <div className="bg-[#3d3d3d] border-4 border-[#5d5d5d] p-6 rounded-lg w-[480px] shadow-2xl relative">
            <div className="flex justify-between items-center mb-4 border-b-2 border-[#5d5d5d] pb-2">
              <h2 className="text-[#c0c0c0] font-bold text-2xl tracking-tight">Inventory</h2>
              <button 
                onClick={() => setShowInventory(false)} 
                className="text-[#ff0000] font-bold hover:scale-110 transition-transform cursor-pointer"
              >
                [X]
              </button>
            </div>
            
            {(!gameState.inventory || gameState.inventory.length === 0) ? (
              <div className="text-center py-8">
                <p className="text-[#808080] italic">Your inventory is empty.</p>
                <p className="text-[#5d5d5d] text-xs mt-2">Complete quests or defeat enemies to find items!</p>
              </div>
            ) : (
              <div className="grid grid-cols-4 gap-2 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                {gameState.inventory.map((item: any) => {
                  const typeColor = item.type === 'weapon' ? '#ff9900' : item.type === 'shield' ? '#4488ff' : '#cc44ff';
                  const typeLabel = item.type === 'weapon' ? 'WPN' : item.type === 'shield' ? 'SHD' : 'ACC';
                  return (
                    <div 
                      key={item.id} 
                      className="aspect-square bg-[#2d2d2d] border-2 border-[#5d5d5d] rounded p-1 flex flex-col items-center justify-center group relative cursor-pointer hover:border-[#ffff00] transition-colors"
                      onClick={() => handleEquipItem(item.id)}
                    >
                      {/* Item type badge */}
                      <div className="absolute top-0 right-0 text-[7px] font-bold px-1 rounded-bl" style={{ backgroundColor: typeColor, color: '#000' }}>
                        {typeLabel}
                      </div>
                      <div className="w-10 h-10 flex items-center justify-center">
                        <img 
                          src={`https://oldschool.runescape.wiki/images/${item.name.replace(/ /g, '_')}.png`} 
                          alt={item.name}
                          className="max-w-full max-h-full object-contain"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none';
                            const parent = (e.target as HTMLImageElement).parentElement;
                            if (parent) parent.innerHTML = '<span style="font-size:20px">⚔️</span>';
                          }}
                        />
                      </div>
                      <div className="text-[7px] text-[#c0c0c0] text-center mt-0.5 truncate w-full text-center">{item.name}</div>
                      {/* Hover tooltip */}
                      <div className="absolute inset-0 bg-black/95 opacity-0 group-hover:opacity-100 transition-opacity p-2 flex flex-col items-center justify-center text-center z-10 rounded">
                        <span className="text-[11px] font-bold" style={{ color: typeColor }}>{item.name}</span>
                        <div className="w-full h-px bg-[#5d5d5d] my-1" />
                        <span className="text-[9px] text-[#c0c0c0]">{item.description}</span>
                        {item.bonus?.damage && <span className="text-[9px] text-[#ff6600] mt-0.5">⚔ +{item.bonus.damage} DMG</span>}
                        {item.bonus?.range && <span className="text-[9px] text-[#44ff44] mt-0.5">🏹 +{item.bonus.range} RNG</span>}
                        {item.bonus?.defense && <span className="text-[9px] text-[#4488ff] mt-0.5">🛡 +{item.bonus.defense} DEF</span>}
                        {item.bonus?.cooldown && <span className="text-[9px] text-[#ffff00] mt-0.5">⚡ {item.bonus.cooldown}ms CD</span>}
                        {selectedPlacedTower && <span className="text-[9px] text-[#00ff00] mt-1 font-bold animate-pulse">CLICK TO EQUIP</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {!selectedPlacedTower && gameState.inventory && gameState.inventory.length > 0 && (
              <p className="text-[10px] text-center text-[#808080] mt-4 italic">Select a tower on the field first to equip items.</p>
            )}
          </div>
        </div>
      )}

      {/* Grand Exchange Modal */}
      {showGrandExchange && (
        <div className="absolute inset-0 bg-black/80 z-50 flex items-center justify-center pointer-events-auto">
          <div className="bg-[#3d3d3d] border-4 border-[#5d5d5d] p-6 rounded-lg w-[450px] shadow-2xl relative">
            <div className="flex justify-between items-center mb-4 border-b-2 border-[#5d5d5d] pb-2">
              <h2 className="text-[#ffff00] font-bold text-2xl tracking-tight">Grand Exchange</h2>
              <button 
                onClick={() => setShowGrandExchange(false)} 
                className="text-[#ff0000] font-bold hover:scale-110 transition-transform cursor-pointer"
              >
                [X]
              </button>
            </div>
            
            <div className="mb-6 text-center bg-[#2d2d2d] p-3 border border-[#5d5d5d] rounded">
              <span className="text-[#c0c0c0] text-sm uppercase tracking-wider">Rune Essence</span>
              <div className="text-[#00ffff] font-bold text-3xl drop-shadow-[0_0_8px_rgba(0,255,255,0.5)]">{runeEssence}</div>
            </div>

            <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
              {[
                { id: 'archerRange', name: 'Better Bowstrings', desc: 'Archer Range +10%', cost: 10, inc: 0.1 },
                { id: 'magicDamage', name: 'Ancient Magicks', desc: 'Magic Damage +10%', cost: 15, inc: 0.1 },
                { id: 'cannonSpeed', name: 'Dwarf Engineering', desc: 'Cannon Speed +10%', cost: 20, inc: 0.1 },
                { id: 'slayerReward', name: 'Slayer Helmet', desc: 'Slayer Reward +15%', cost: 25, inc: 0.15 },
                { id: 'prayerEfficiency', name: 'Holy Grail', desc: 'Prayer Drain -10%', cost: 30, inc: 0.1 },
                { id: 'startingMoney', name: 'Merchant Guild', desc: 'Starting GP +50', cost: 40, inc: 50 },
                { id: 'rewardMultiplier', name: 'Wealth Ring', desc: 'Enemy Rewards +15%', cost: 50, inc: 0.15 },
                { id: 'towerCostReduction', name: 'Guild Discount', desc: 'Tower Price -5%', cost: 60, inc: -0.05 },
                { id: 'xpGainMultiplier', name: 'Combat Training', desc: 'Tower XP +20%', cost: 70, inc: 0.2 },
                { id: 'prayerRegen', name: 'Prayer Renewal', desc: 'Prayer Regen +0.1/s', cost: 80, inc: 0.1 },
                { id: 'waveSpeed', name: 'Agility Training', desc: 'Wave Spawn Speed +10%', cost: 90, inc: 0.1 },
              ].map((item) => {
                const isMaxed = upgrades[item.id as keyof GlobalUpgrades] >= UPGRADE_LIMITS[item.id as keyof GlobalUpgrades];
                return (
                  <div key={item.id} className="flex justify-between items-center bg-[#2d2d2d] p-3 border border-[#4d4d4d] rounded hover:border-[#ffff00] transition-colors group">
                    <div>
                      <div className="text-[#ffff00] font-bold text-base group-hover:text-[#ffffff] transition-colors">{item.name}</div>
                      <div className="text-[#c0c0c0] text-xs italic">{item.desc}</div>
                      <div className="text-[#00ff00] text-[10px] mt-1 font-mono">
                        {item.id === 'startingMoney' 
                          ? `Current: ${upgrades[item.id as keyof GlobalUpgrades]}`
                          : `Current: ${upgrades[item.id as keyof GlobalUpgrades] > 1.0 ? '+' : ''}${Math.round((upgrades[item.id as keyof GlobalUpgrades] - 1) * 100)}%`
                        }
                        {isMaxed && <span className="ml-2 text-[#ff0000] font-bold">[MAX]</span>}
                      </div>
                    </div>
                    <button 
                      onClick={() => buyUpgrade(item.id as keyof GlobalUpgrades, item.cost, item.inc)}
                      disabled={runeEssence < item.cost || isMaxed}
                      className={`
                        px-4 py-2 text-xs font-bold border-2 rounded transition-all
                        ${runeEssence >= item.cost && !isMaxed
                          ? 'bg-[#5d5d5d] hover:bg-[#00ff00] hover:text-black border-[#2d2d2d] text-[#ffff00] cursor-pointer active:translate-y-0.5' 
                          : 'bg-[#2d2d2d] text-[#5d5d5d] border-[#3d3d3d] cursor-not-allowed'}
                      `}
                    >
                      {isMaxed ? 'Maxed' : `${item.cost} Essence`}
                    </button>
                  </div>
                );
              })}
            </div>
            
            <div className="mt-6 text-center text-[10px] text-[#808080] italic">
              * Upgrades are permanent and persist across games.
            </div>
          </div>
        </div>
      )}

      {/* Upgrade Menu */}
      {selectedPlacedTower && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-[#3d3d3d] p-4 border-4 border-[#5d5d5d] rounded shadow-2xl z-20 flex flex-col gap-2 min-w-[300px]">
          <div className="flex justify-between items-center border-b border-[#5d5d5d] pb-1">
            <h3 className="text-[#ffff00] font-bold">{selectedPlacedTower.name}</h3>
            <button 
              onClick={() => setSelectedPlacedTower(null)}
              className="bg-[#ff0000] text-white rounded w-5 h-5 flex items-center justify-center text-xs font-bold border border-white"
            >
              X
            </button>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="text-xs text-[#c0c0c0] space-y-1">
              <p className="font-bold text-[#ff981f]">Stats</p>
              <p>Level: {selectedPlacedTower.level} / {selectedPlacedTower.maxLevel}</p>
              <p>Damage: {selectedPlacedTower.damage}</p>
              <p>Range: {selectedPlacedTower.range}</p>
              <p>Speed: {(selectedPlacedTower.cooldown / 1000).toFixed(1)}s</p>
            </div>
            
            <div className="text-xs text-[#c0c0c0] space-y-1">
              <p className="font-bold text-[#00ffff]">Skills</p>
              {Object.entries(selectedPlacedTower.skills || {}).map(([name, skill]: [string, any]) => (
                <div key={name} className="flex justify-between">
                  <span className="capitalize">{name}:</span>
                  <span className="font-bold text-white">Lvl {skill.level}</span>
                </div>
              ))}
            </div>
          </div>

          {selectedPlacedTower.type === 'archer' && (
            <div className="mt-2 border-t border-[#5d5d5d] pt-2">
              <p className="text-[10px] font-bold text-[#00ff00] mb-1">Combat Style</p>
              <div className="flex gap-1">
                {['rapid', 'long_range'].map(style => (
                  <button
                    key={style}
                    onClick={() => engineRef.current?.setArcherStyle(selectedPlacedTower.id, style as any)}
                    className={`text-[9px] flex-1 py-1 border rounded capitalize ${selectedPlacedTower.attackStyle === style ? 'bg-[#00ff00] text-black border-white' : 'bg-[#1e1e1e] text-[#c0c0c0] border-[#5d5d5d]'}`}
                  >
                    {style.replace('_', ' ')}
                  </button>
                ))}
              </div>
            </div>
          )}

          {selectedPlacedTower.type === 'wizard' && (
            <div className="mt-2 border-t border-[#5d5d5d] pt-2">
              <p className="text-[10px] font-bold text-[#ffff00] mb-1">Mage Specialization</p>
              <div className="flex gap-1 mb-2">
                {['elemental', 'ancients', 'utility'].map(mode => (
                  <button
                    key={mode}
                    onClick={() => engineRef.current?.setMageMode(selectedPlacedTower.id, mode as any)}
                    className={`text-[9px] px-2 py-1 border rounded capitalize ${selectedPlacedTower.mageMode === mode ? 'bg-[#ffff00] text-black border-white' : 'bg-[#1e1e1e] text-[#c0c0c0] border-[#5d5d5d]'}`}
                  >
                    {mode}
                  </button>
                ))}
              </div>
              
              {selectedPlacedTower.mageMode === 'elemental' && (
                <div className="grid grid-cols-4 gap-1">
                  {['air', 'water', 'earth', 'fire'].map(elem => (
                    <button
                      key={elem}
                      onClick={() => engineRef.current?.setMageElement(selectedPlacedTower.id, elem as any)}
                      className={`text-[9px] p-1 border rounded capitalize ${selectedPlacedTower.element === elem ? 'bg-[#00ffff] text-black border-white' : 'bg-[#1e1e1e] text-[#c0c0c0] border-[#5d5d5d]'}`}
                    >
                      {elem}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="flex gap-2 mt-2">
            {selectedPlacedTower.level < selectedPlacedTower.maxLevel ? (
              <button 
                onClick={handleUpgrade}
                disabled={gameState.money < selectedPlacedTower.upgradeCost}
                className={`flex-1 px-4 py-2 border-2 border-[#2d2d2d] text-xs font-bold ${gameState.money >= selectedPlacedTower.upgradeCost ? 'bg-[#00ff00] text-black hover:bg-[#32CD32]' : 'bg-[#5d5d5d] text-[#808080] cursor-not-allowed'}`}
              >
                Upgrade ({selectedPlacedTower.upgradeCost} gp)
              </button>
            ) : (
              <div className="flex-1 text-center text-xs text-[#00ff00] font-bold py-2 border-2 border-[#00ff00]/20 bg-[#00ff00]/5">Max Level</div>
            )}
            <button 
              onClick={handleSell}
              className="px-4 py-2 bg-[#ff0000] hover:bg-[#cc0000] border-2 border-[#2d2d2d] text-xs font-bold text-white shadow-md active:translate-y-0.5"
            >
              Sell
            </button>
          </div>
        </div>
      )}

      {/* Tooltip */}
      {hoveredEntity && (
        <div 
          className="fixed pointer-events-none bg-[#1e1e1e]/95 border-2 border-[#5d5d5d] p-2 rounded text-[#ffff00] text-xs z-50 shadow-2xl min-w-[120px]"
          style={{ left: tooltipPos.x + 15, top: tooltipPos.y + 15 }}
        >
          <p className="font-bold text-sm capitalize border-b border-[#5d5d5d] mb-1 pb-1">
            {hoveredEntity.type === 'enemy' ? hoveredEntity.data.type.replace('_', ' ') : hoveredEntity.data.name}
          </p>
          {hoveredEntity.type === 'enemy' ? (
            <div className="space-y-0.5">
              <p>HP: <span className="text-white">{Math.ceil(hoveredEntity.data.hp)} / {hoveredEntity.data.maxHp}</span></p>
              <p>Speed: <span className="text-white">{hoveredEntity.data.speed}</span></p>
              <p className="text-[10px] text-[#c0c0c0] italic mt-1">Right-click for info</p>
            </div>
          ) : (
            <div className="space-y-0.5">
              <p>Level: <span className="text-white">{hoveredEntity.data.level}</span></p>
              <p>Damage: <span className="text-white">{hoveredEntity.data.damage}</span></p>
              <p>Range: <span className="text-white">{hoveredEntity.data.range}</span></p>
              <p className="text-[10px] text-[#c0c0c0] italic mt-1">Right-click for toggle range</p>
            </div>
          )}
        </div>
      )}

      {/* Right Click Status Modal */}
      {rightClickedEntity && (
        <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-[100] p-4 pointer-events-auto">
          <div className="bg-[#3d3d3d] border-4 border-[#5d5d5d] p-6 rounded-lg shadow-2xl max-w-sm w-full text-[#ffff00] relative">
            <div className="flex justify-between items-center mb-4 border-b-2 border-[#5d5d5d] pb-2">
              <h3 className="text-2xl font-bold capitalize">
                {rightClickedEntity.type === 'enemy' ? rightClickedEntity.data.type.replace('_', ' ') : rightClickedEntity.data.name}
              </h3>
              <button onClick={() => setRightClickedEntity(null)} className="text-[#ff0000] font-bold text-xl hover:scale-110 transition-transform cursor-pointer">X</button>
            </div>
            
            <div className="space-y-4">
              {rightClickedEntity.type === 'enemy' ? (
                <>
                  <div className="bg-[#1e1e1e] p-3 rounded border-2 border-[#5d5d5d]">
                    <p className="text-[#ff981f] font-bold mb-2 border-b border-[#3d3d3d]">Combat Stats</p>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <p>Health:</p><p className="text-white text-right">{Math.ceil(rightClickedEntity.data.hp)} / {rightClickedEntity.data.maxHp}</p>
                      <p>Speed:</p><p className="text-white text-right">{rightClickedEntity.data.speed}</p>
                      <p>Reward:</p><p className="text-[#ffff00] text-right">{rightClickedEntity.data.reward} GP</p>
                    </div>
                  </div>
                  <div className="bg-[#2d2d2d] p-3 rounded italic text-sm text-[#c0c0c0] border border-[#4d4d4d]">
                    &quot;A dangerous creature of Gielinor. It seems to be heading towards the exit!&quot;
                  </div>
                </>
              ) : (
                <>
                  <div className="bg-[#1e1e1e] p-3 rounded border-2 border-[#5d5d5d]">
                    <p className="text-[#ff981f] font-bold mb-2 border-b border-[#3d3d3d]">Tower Stats</p>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <p>Level:</p><p className="text-white text-right">{rightClickedEntity.data.level}</p>
                      <p>Damage:</p><p className="text-white text-right">{rightClickedEntity.data.damage}</p>
                      <p>Range:</p><p className="text-white text-right">{rightClickedEntity.data.range}</p>
                      <p>Cooldown:</p><p className="text-white text-right">{(rightClickedEntity.data.cooldown / 1000).toFixed(1)}s</p>
                    </div>
                  </div>
                  <div className="bg-[#1e1e1e] p-3 rounded border-2 border-[#5d5d5d]">
                    <p className="text-[#00ffff] font-bold mb-2 border-b border-[#3d3d3d]">Skills</p>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      {Object.entries(rightClickedEntity.data.skills).map(([skill, data]: [string, any]) => (
                        <div key={skill} className="flex justify-between">
                          <span className="capitalize">{skill}:</span>
                          <span className="text-white font-bold">Lvl {data.level}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
            
            <button 
              onClick={() => setRightClickedEntity(null)}
              className="w-full mt-6 bg-[#5d5d5d] hover:bg-[#6d6d6d] py-3 rounded font-bold border-2 border-[#2d2d2d] text-[#ffff00] transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Tower Selection Bar */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-[#3d3d3d]/90 p-2 border-2 border-[#5d5d5d] rounded flex gap-2 shadow-xl z-10">
        {[
          { id: 'archer', name: 'Ranger', cost: 50, color: '#00ff00', icon: '🏹' },
          { id: 'wizard', name: 'Mage', cost: 75, color: '#0000ff', icon: '🪄' },
          { id: 'cannon', name: 'Cannon', cost: 250, color: '#ff0000', icon: '💣' },
          { id: 'tzhaar', name: 'TzHaar', cost: 200, color: '#8B0000', icon: '🌋' },
          { id: 'slayer', name: 'Slayer', cost: 125, color: '#4B0082', icon: '⚔️' },
          { id: 'toxic', name: 'Toxic', cost: 300, color: '#008080', icon: '🐍' }
        ].map(tower => (
          <button
            key={tower.id}
            onClick={() => {
              setSelectedTower(tower.id);
              setSelectedPlacedTower(null);
            }}
            className={`
              flex flex-col items-center p-2 border-2 rounded w-20 transition-all
              ${selectedTower === tower.id ? 'border-[#ffff00] bg-[#4d4d4d]' : 'border-[#2d2d2d] hover:bg-[#4d4d4d]'}
              ${gameState.money < tower.cost ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
            `}
            disabled={gameState.money < tower.cost}
          >
            <div className="w-8 h-8 rounded-full mb-1 flex items-center justify-center text-lg" style={{ backgroundColor: tower.color }}>
              {tower.icon}
            </div>
            <span className="text-xs font-bold text-[#ffff00]">{tower.name}</span>
            <span className="text-[10px] text-[#c0c0c0]">{tower.cost} gp</span>
          </button>
        ))}
      </div>
    </div>
  );
}
