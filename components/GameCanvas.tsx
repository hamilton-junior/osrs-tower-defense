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
  attackStyle?: string;
  mageMode?: string;
  element?: string;
  targetingPriority?: string;
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
  messages?: string[];
  specialAttackCharge?: number;
  achievements?: any[];
  pets?: any[];
  inventory?: any[];
  quests?: any[];
  achievementPoints?: number;
  playerSkills?: Record<string, any>;
  autoSpawnTimer?: number;
  selectedTower?: string | null;
  selectedPlacedTower?: TowerData | null;
  prayerPoints: number;
  maxPrayerPoints: number;
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
    specialAttackCharge: 0,
    achievements: [],
    pets: [],
    inventory: [],
    quests: [],
    messages: [],
    selectedTower: null,
    selectedPlacedTower: null,
    prayerPoints: 10,
    maxPrayerPoints: 99,
    playerSkills: {
      mining: { level: 1, xp: 0 },
      woodcutting: { level: 1, xp: 0 },
      herblore: { level: 1, xp: 0 },
      crafting: { level: 1, xp: 0 },
      prayer: { level: 1, xp: 0 }
    }
  });

  const [activeTab, setActiveTab] = useState<'inventory' | 'quests' | 'achievements' | 'ge' | 'combat'>('inventory');
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
    archerRange: 2.0,
    magicDamage: 2.5,
    cannonSpeed: 2.0,
    slayerReward: 2.5,
    prayerEfficiency: 2.0,
    startingMoney: 500,
    rewardMultiplier: 2.5,
    waveSpeed: 2.0,
    towerCostReduction: 0.5,
    xpGainMultiplier: 3.0,
    prayerRegen: 1.0
  };

  const [showGrandExchange, setShowGrandExchange] = useState(false);
  const [showAchievements, setShowAchievements] = useState(false);
  const [showQuests, setShowQuests] = useState(false);
  const [showInventory, setShowInventory] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [hoveredEntity, setHoveredEntity] = useState<any | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const [rightClickedEntity, setRightClickedEntity] = useState<any | null>(null);
  const [activeTooltip, setActiveTooltip] = useState<{
    x: number;
    y: number;
    title: string;
    content: string;
    color?: string;
    bonus?: string;
  } | null>(null);

  useEffect(() => {
    setIsMounted(true);
    const savedEssence = localStorage.getItem('osrs_td_essence');
    if (savedEssence) setRuneEssence(parseInt(savedEssence));
    const savedUpgrades = localStorage.getItem('osrs_td_upgrades');
    if (savedUpgrades) setUpgrades(JSON.parse(savedUpgrades));
  }, []);

  useEffect(() => {
    if (!isMounted) return;
    localStorage.setItem('osrs_td_essence', runeEssence.toString());
    localStorage.setItem('osrs_td_upgrades', JSON.stringify(upgrades));
  }, [runeEssence, upgrades, isMounted]);

  useEffect(() => {
    if (!canvasRef.current || !isMounted) return;
    const canvas = canvasRef.current;
    const engine = new GameEngine(canvas, (state: Partial<GameState>) => {
      setGameState((prev: GameState) => ({ ...prev, ...state }));
      if (state.runeEssence !== undefined) {
        setRuneEssence(state.runeEssence);
      }
    }, runeEssence, upgrades);
    engineRef.current = engine;
    engine.start();

    const resizeObserver = new ResizeObserver(() => {
      engine.resize();
    });
    if (canvas.parentElement) {
      resizeObserver.observe(canvas.parentElement);
    }

    return () => {
      engine.stop();
      resizeObserver.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMounted]);

  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.upgrades = upgrades;
      engineRef.current.runeEssence = runeEssence;
      engineRef.current.autoSpawnEnabled = autoSpawn;
      engineRef.current.autoSpawnDelay = autoSpawnDelay;
      engineRef.current.gameSpeed = gameSpeed;
      engineRef.current.setSelectedTowerType(gameState.selectedTower || null);
    }
  }, [upgrades, runeEssence, autoSpawn, autoSpawnDelay, gameSpeed, gameState.selectedTower]);

  useEffect(() => {
    if (gameState.autoSpawnTimer !== undefined) setAutoSpawnTimer(gameState.autoSpawnTimer);
  }, [gameState.autoSpawnTimer]);

  const setSelectedTower = (type: string | null) => {
    if (type) engineRef.current?.playSound('click');
    setGameState(prev => ({ ...prev, selectedTower: type }));
  };

  const setSelectedPlacedTower = (data: any | null) => {
    if (data) engineRef.current?.playSound('click');
    setGameState(prev => ({ ...prev, selectedPlacedTower: data }));
  };

  const handleStartWave = () => {
    engineRef.current?.playSound('click');
    engineRef.current?.startWave();
  };
  const handlePathChange = (index: number) => {
    engineRef.current?.playSound('click');
    engineRef.current?.setPath(index);
  };
  const handleSpecialAttack = () => {
    // Special attack sound is already handled in engine.useSpecialAttack()
    engineRef.current?.useSpecialAttack();
  };
  const handleBuyPotion = (type: 'overload' | 'super_restore' | 'prayer_potion') => {
    // Potion sound is already handled in engine.buyPotion()
    engineRef.current?.buyPotion(type);
  };

  const getLogicCoords = (clientX: number, clientY: number) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return { x: 0, y: 0 };
    // Direct 1:1 pixel mapping to fix click offset
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    return { x, y };
  };

  const buyUpgrade = (type: keyof GlobalUpgrades, cost: number, increment: number) => {
    const currentVal = upgrades[type];
    const limit = UPGRADE_LIMITS[type];
    const canUpgrade = increment > 0 ? currentVal < limit : currentVal > limit;
    if (runeEssence >= cost && canUpgrade) {
      engineRef.current?.playSound('sell'); // Coins sound for purchase
      setRuneEssence((prev: number) => prev - cost);
      setUpgrades((prev: GlobalUpgrades) => ({
        ...prev,
        [type]: increment > 0 ? Math.min(prev[type] + increment, limit) : Math.max(prev[type] + increment, limit)
      }));
    } else {
      engineRef.current?.playSound('click'); // Feedback for failed click
    }
  };

  const handleCanvasClick = (e: React.MouseEvent) => {
    if (!engineRef.current) return;
    const { x, y } = getLogicCoords(e.clientX, e.clientY);
    
    // Try to collect loot first (clicking bones)
    const collectedLoot = engineRef.current.collectLootAt(x, y);
    if (collectedLoot) return;
    
    if (gameState.selectedTower) {
      engineRef.current.placeTower(gameState.selectedTower, x, y);
      setSelectedTower(null);
    } else {
      const entity = engineRef.current.getEntityAt(x, y);
      if (entity && entity.type === 'tower') {
        setSelectedPlacedTower(entity.data);
      } else {
        setSelectedPlacedTower(null);
      }
    }
  };

  const handleUpgrade = () => {
    if (engineRef.current && gameState.selectedPlacedTower) {
      // Upgrade sound is already handled in engine.upgradeTower()
      engineRef.current.upgradeTower(gameState.selectedPlacedTower.id);
      const updatedTower = engineRef.current.towers.find((t: any) => t.id === gameState.selectedPlacedTower!.id);
      if (updatedTower) setSelectedPlacedTower({ ...updatedTower });
    }
  };

  const handleSell = () => {
    if (engineRef.current && gameState.selectedPlacedTower) {
      // Sell sound is already handled in engine.sellTower()
      engineRef.current.sellTower(gameState.selectedPlacedTower.id);
      setSelectedPlacedTower(null);
    }
  };

  const handleClaimQuest = (questId: string) => engineRef.current?.claimQuestReward(questId);

  const handleEquipItem = (itemId: string) => {
    if (engineRef.current && gameState.selectedPlacedTower) {
      engineRef.current.playSound('click');
      engineRef.current.equipItem(gameState.selectedPlacedTower.id, itemId);
      const updatedTower = engineRef.current.towers.find((t: any) => t.id === gameState.selectedPlacedTower!.id);
      if (updatedTower) setSelectedPlacedTower({ ...updatedTower });
      setShowInventory(false);
    } else {
      engineRef.current?.playSound('click');
    }
  };

  const handleUnequipItem = (slot: 'weapon' | 'shield' | 'accessory') => {
    if (engineRef.current && gameState.selectedPlacedTower) {
      engineRef.current.unequipItem(gameState.selectedPlacedTower.id, slot);
      const updatedTower = engineRef.current.towers.find((t: any) => t.id === gameState.selectedPlacedTower!.id);
      if (updatedTower) setSelectedPlacedTower({ ...updatedTower });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!engineRef.current) return;
    const { x, y } = getLogicCoords(e.clientX, e.clientY);

    engineRef.current.updateMousePos(x, y);

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
    if (gameState.selectedTower) {
      setSelectedTower(null);
      return;
    }
    if (!engineRef.current) return;
    const { x, y } = getLogicCoords(e.clientX, e.clientY);
    const entity = engineRef.current.getEntityAt(x, y);
    if (entity && entity.type === 'tower') {
      const tower = engineRef.current.towers.find((t: any) => t.id === entity.data.id);
      if (tower) {
        tower.showRange = !tower.showRange;
        setGameState(prev => ({ ...prev }));
      }
    }
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectedTower(null);
        setSelectedPlacedTower(null);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  if (!isMounted) return <div className="w-full h-full bg-[#1e1e1e]" />;

  const handleTabChange = (tab: any) => {
    engineRef.current?.playSound('click');
    setActiveTab(tab);
  };

  return (
    <div className="relative w-full h-full flex flex-col overflow-hidden bg-[#000] font-osrs select-none">
      {/* Canvas */}
      <canvas 
        ref={canvasRef}
        className="absolute inset-0 block cursor-crosshair touch-none w-full h-full z-0 image-pixelated"
        onClick={handleCanvasClick}
        onMouseMove={handleMouseMove}
        onContextMenu={handleContextMenu}
      />

      {/* OSRS Top Bar */}
      <div className="absolute top-0 left-0 w-full h-8 bg-[var(--osrs-brown)] border-b-2 border-[var(--osrs-border-dark)] flex items-center px-4 z-10 shadow-lg">
        <span className="text-osrs-yellow text-lg font-bold tracking-widest uppercase drop-shadow-md">
          {gameState.isPlaying ? `Wave ${gameState.wave} In Progress` : `Preparing for Wave ${gameState.wave}`}
        </span>
      </div>

      {/* Top Overlay: Currency & Waves */}
      <div className="absolute top-10 left-1/2 -translate-x-1/2 flex gap-4 pointer-events-none z-10">
        <div className="osrs-panel px-6 py-2 flex items-center gap-8 pointer-events-auto shadow-2xl">
          <div className="flex items-center gap-2 group cursor-help" onMouseEnter={(e) => setActiveTooltip({ x: e.clientX, y: e.clientY, title: 'GP (Coins)', content: 'Main currency used to buy and upgrade towers.', color: '#ffff00' })} onMouseLeave={() => setActiveTooltip(null)}>
            <img src="https://oldschool.runescape.wiki/images/Coins_detail.png" className="w-8 h-8 object-contain drop-shadow-md" alt="GP" />
            <span className="text-osrs-yellow font-bold text-xl drop-shadow-md">{gameState.money.toLocaleString()}</span>
          </div>
          <div className="flex items-center gap-2 group cursor-help" onMouseEnter={(e) => setActiveTooltip({ x: e.clientX, y: e.clientY, title: 'Rune Essence', content: 'Rare magical essence used for global permanent upgrades.', color: '#00ffff' })} onMouseLeave={() => setActiveTooltip(null)}>
            <img src="https://oldschool.runescape.wiki/images/Rune_essence_detail.png" className="w-8 h-8 object-contain drop-shadow-md" alt="Essence" />
            <span className="text-osrs-cyan font-bold text-xl drop-shadow-md">{(gameState.runeEssence || 0).toLocaleString()}</span>
          </div>
          <div className="border-l-2 border-[var(--osrs-border-dark)] pl-4 flex flex-col items-center">
            <span className="text-xs text-osrs-orange font-bold uppercase tracking-widest leading-none mb-1">Wave</span>
            <span className="text-white font-bold text-2xl leading-none drop-shadow-md">{gameState.wave}</span>
          </div>
        </div>
      </div>

      {/* Main Status Column (Right Side) */}
      <div className="absolute bottom-4 right-4 flex flex-col items-center pointer-events-none group/ui z-20">
        <div className="flex items-end pointer-events-auto shadow-2xl">
          {/* HP Bar (Left) */}
          <div className="w-8 h-[300px] bg-[var(--osrs-brown)] border-2 border-[var(--osrs-border-dark)] relative overflow-hidden flex flex-col-reverse mr-1">
             <div className="absolute top-1 left-0 right-0 text-center z-10">
               <span className="text-xs text-white font-bold drop-shadow-md">{gameState.lives}</span>
             </div>
             <div className="absolute top-6 left-1/2 -translate-x-1/2 w-5 h-5 flex items-center justify-center">
                <img src="https://oldschool.runescape.wiki/images/Hitpoints_icon.png" alt="HP" className="w-full h-full object-contain" />
             </div>
             <div className="w-full bg-[#ff0000] transition-all duration-500 border-t border-[#ff6666]" style={{ height: `${(gameState.lives / 20) * 100}%` }} />
          </div>

          {/* Main Sidebar Panel */}
          <div className="flex flex-col w-[220px] h-[300px] osrs-panel relative overflow-hidden flex-shrink-0">
            <div className="flex-1 p-2 overflow-y-auto custom-scrollbar relative">
              {activeTab === 'combat' && (
                <div className="flex flex-col gap-3">
                  <div className="text-center border-b border-[var(--osrs-border-light)] pb-1">
                    <span className="text-xs font-bold text-osrs-orange uppercase tracking-widest">Combat Options</span>
                  </div>
                  <div className="grid grid-cols-3 gap-1">
                    {[1, 2, 3].map(s => (
                      <button key={s} onClick={() => {
                        engineRef.current?.playSound('click');
                        setGameSpeed(s);
                      }} className={`osrs-button text-[10px] py-1.5 ${gameSpeed === s ? 'brightness-125 border-white' : ''}`}>{s}x</button>
                    ))}
                  </div>
                  <div className="flex flex-col gap-2">
                    <button onClick={handleStartWave} disabled={gameState.isPlaying} className={`osrs-button py-2 text-xs uppercase ${!gameState.isPlaying ? 'pulse-yellow' : 'opacity-50'}`}>
                      {gameState.isPlaying ? 'Wave In Progress' : 'Start Next Wave'}
                    </button>
                    <button 
                      onClick={() => {
                        engineRef.current?.playSound('click');
                        setAutoSpawn(!autoSpawn);
                      }} 
                      className={`osrs-button py-1.5 text-[10px] uppercase transition-all ${autoSpawn ? 'text-osrs-green border-osrs-green' : 'text-[#c0c0c0]'}`}
                    >
                      {autoSpawn ? 'Auto-Start: ON' : 'Auto-Start: OFF'}
                    </button>
                  </div>
                  {gameState.slayerTask && (
                    <div className="bg-black/40 border border-[var(--osrs-border-light)] p-2 rounded">
                      <div className="text-[10px] text-osrs-orange font-bold uppercase mb-1">Current Task</div>
                      <div className="text-xs text-osrs-yellow flex justify-between">
                         <span className="capitalize">{gameState.slayerTask.type.replace('_',' ')}</span>
                         <span className="font-mono">{gameState.slayerTask.count}</span>
                      </div>
                    </div>
                  )}
                  <div className="mt-1">
                    <span className="text-[10px] font-bold text-osrs-orange uppercase block mb-1 text-center">Special Attack</span>
                    <div className="h-6 bg-black border border-[var(--osrs-border-light)] relative rounded overflow-hidden group cursor-pointer" onClick={handleSpecialAttack}>
                      <div className="h-full bg-gradient-to-r from-[#104e10] via-[#1e8e1e] to-[#2ecc2e]" style={{ width: `${Math.min(100, gameState.specialAttackCharge || 0)}%` }} />
                      <div className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-white uppercase drop-shadow-md">
                        {gameState.specialAttackCharge}%
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'achievements' && (
                <div className="flex flex-col gap-2">
                  <div className="text-center border-b border-[var(--osrs-border-light)] pb-1">
                    <span className="text-xs font-bold text-osrs-orange uppercase">Character Stats</span>
                  </div>
                  <button 
                    onClick={() => {
                      engineRef.current?.playSound('interface_open');
                      setShowAchievements(true);
                    }}
                    className="osrs-button w-full py-1 text-[10px] uppercase mb-2"
                  >
                    View Diary
                  </button>
                  <div className="grid grid-cols-2 gap-x-2 gap-y-3 mt-1">
                    {Object.entries(gameState.playerSkills || {}).map(([key, skill]: [string, any]) => (
                      <div 
                        key={key} 
                        className="flex items-center gap-2 group relative cursor-help p-1 hover:bg-white/5 rounded"
                        onMouseEnter={(e) => setActiveTooltip({
                          x: e.clientX, y: e.clientY,
                          title: key.toUpperCase(), 
                          content: `Level: ${skill.level} (XP: ${skill.xp} / ${Math.pow(skill.level, 2) * 100})`,
                          color: '#ff981f'
                        })}
                        onMouseLeave={() => setActiveTooltip(null)}
                      >
                        <img src={`https://oldschool.runescape.wiki/images/${key.charAt(0).toUpperCase() + key.slice(1)}_icon.png`} className="w-6 h-6 object-contain" alt="" />
                        <div className="flex flex-col">
                           <span className="text-xs text-osrs-yellow font-bold leading-tight">{skill.level}</span>
                           <span className="text-[9px] text-[#c0c0c0] uppercase tracking-tighter leading-none">{key}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {activeTab === 'inventory' && (
                <div className="flex flex-col gap-2">
                  <div className="text-center border-b border-[var(--osrs-border-light)] pb-1">
                    <span className="text-xs font-bold text-osrs-orange uppercase">Inventory</span>
                  </div>
                  <button 
                    onClick={() => {
                      engineRef.current?.playSound('interface_open');
                      setShowInventory(true);
                    }}
                    className="osrs-button w-full py-1 text-[10px] uppercase mb-2"
                  >
                    Full View
                  </button>
                  <div className="grid grid-cols-4 gap-1">
                    {(gameState.inventory || []).map((item: any) => (
                      <div 
                        key={item.id} 
                        className="aspect-square bg-black/40 border border-[var(--osrs-border-light)] p-0.5 group relative cursor-pointer hover:border-white" 
                        onClick={() => handleEquipItem(item.id)}
                        onMouseEnter={(e) => setActiveTooltip({
                          x: e.clientX, y: e.clientY,
                          title: item.name, content: item.description,
                          bonus: `${item.bonus.damage ? `+${item.bonus.damage} Str ` : ''}${item.bonus.range ? `+${item.bonus.range} Range` : ''}`,
                          color: '#ffff00'
                        })}
                        onMouseLeave={() => setActiveTooltip(null)}
                      >
                        <img 
                          src={`https://oldschool.runescape.wiki/images/${item.name.replace(/ /g, '_')}_detail.png`} 
                          alt={item.name} 
                          className="w-full h-full object-contain"
                          onError={(e) => {
                            const img = e.target as HTMLImageElement;
                            if (img.src.includes('_detail')) img.src = `https://oldschool.runescape.wiki/images/${item.name.replace(/ /g, '_')}.png`;
                            else img.style.opacity = '0';
                          }}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {activeTab === 'quests' && (
                <div className="flex flex-col gap-2">
                   {gameState.pets && gameState.pets.length > 0 && (
                     <div className="mb-3">
                        <div className="text-[9px] text-osrs-cyan font-bold uppercase border-b border-osrs-cyan/30 mb-1">Followers</div>
                        <div className="flex flex-wrap gap-1">
                          {gameState.pets.map((pet: any) => (
                            <div key={pet.id} className="w-8 h-8 bg-black/40 border border-[var(--osrs-border-light)] p-0.5 rounded group relative cursor-help">
                               <img src={`https://oldschool.runescape.wiki/images/${pet.type.split('_').map((w: any) => w.charAt(0).toUpperCase() + w.slice(1)).join('_')}.png`} className="w-full h-full object-contain" alt="" />
                               <div className="absolute hidden group-hover:block right-full mr-2 top-0 w-44 p-2 bg-black/95 border border-osrs-yellow z-[100] shadow-2xl">
                                  <div className="flex items-center gap-2 mb-1">
                                    <img src={`https://oldschool.runescape.wiki/images/${pet.type.split('_').map((w: any) => w.charAt(0).toUpperCase() + w.slice(1)).join('_')}.png`} className="w-8 h-8 object-contain" alt="" />
                                    <span className="text-osrs-yellow font-bold text-xs">{pet.name}</span>
                                  </div>
                                  <p className="text-white text-[10px] leading-tight">{pet.bonus}</p>
                               </div>
                            </div>
                          ))}
                        </div>
                     </div>
                   )}
                   <div className="text-center border-b border-[var(--osrs-border-light)] pb-1">
                    <span className="text-xs font-bold text-osrs-orange uppercase tracking-tighter">Quests</span>
                  </div>
                  <div className="flex flex-col gap-1 mt-1">
                    {gameState.quests?.map(q => (
                      <div key={q.id} className={`text-[10px] py-1 px-1.5 border border-transparent hover:bg-white/5 cursor-pointer leading-tight ${q.completed ? 'text-osrs-green' : 'text-osrs-red'}`} onClick={() => {
                        engineRef.current?.playSound('interface_open');
                        setShowQuests(true);
                      }}>{q.name}</div>
                    ))}
                  </div>
                </div>
              )}

               {activeTab === ('prayer' as any) && (
                <div className="flex flex-col gap-2">
                  <div className="text-center border-b border-[var(--osrs-border-light)] pb-1">
                    <span className="text-xs font-bold text-osrs-orange uppercase">Prayers</span>
                  </div>
                  <div className="grid grid-cols-3 gap-1 mt-1">
                    {((engineRef.current as any)?.allPrayers || []).map((p: any) => {
                      const isActive = (engineRef.current as any)?.activePrayers.has(p.id);
                      return (
                        <div 
                          key={p.id} 
                          className={`aspect-square border cursor-pointer relative group/prayer ${isActive ? 'bg-osrs-green/20 border-osrs-yellow' : 'bg-black/40 border-[var(--osrs-border-light)]'}`}
                          onClick={() => engineRef.current?.togglePrayer(p.id)}
                          onMouseEnter={(e) => setActiveTooltip({
                            x: e.clientX, y: e.clientY,
                            title: p.name, content: p.description,
                            bonus: `Drain: ${p.drain}/s`, color: '#ffff00'
                          })}
                          onMouseLeave={() => setActiveTooltip(null)}
                        >
                          <img src={`https://oldschool.runescape.wiki/images/${p.name.replace(/ /g, '_')}_icon.png`} className="w-full h-full object-contain p-1" alt="" />
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              {activeTab === 'ge' && (
                <div className="flex flex-col items-center justify-center h-full gap-4">
                  <div className="osrs-panel p-2 flex flex-col items-center gap-2 w-full">
                     <img src="https://oldschool.runescape.wiki/images/Exchange_icon.png" className="w-12 h-12 object-contain" alt="" />
                     <button onClick={() => {
                       engineRef.current?.playSound('interface_open');
                       setShowGrandExchange(true);
                     }} className="osrs-button w-full py-2 text-xs uppercase">Open Exchange</button>
                  </div>
                  <p className="text-[10px] text-[#c0c0c0] text-center font-mono">Market access for upgrades and supplies.</p>
                </div>
              )}
            </div>
            
            {/* The Tab Icons Panel (Fixed Bottom) */}
            <div className="grid grid-cols-6 w-full bg-[var(--osrs-brown)] border-t-2 border-[var(--osrs-border-dark)] p-0.5 h-10 flex-shrink-0 gap-[1px]">
              <button onClick={() => handleTabChange('combat')} className={`osrs-tab flex items-center justify-center ${activeTab === 'combat' ? 'active' : ''}`} title="Combat Control">
                <img src="https://oldschool.runescape.wiki/images/Attack_icon.png" className="w-6 h-6 object-contain" alt="" />
              </button>
              <button onClick={() => handleTabChange('achievements')} className={`osrs-tab flex items-center justify-center ${activeTab === 'achievements' ? 'active' : ''}`} title="Player Stats">
                <img src="https://oldschool.runescape.wiki/images/Stats_icon.png" className="w-6 h-6 object-contain" alt="" />
              </button>
              <button onClick={() => handleTabChange('inventory')} className={`osrs-tab flex items-center justify-center ${activeTab === 'inventory' ? 'active' : ''}`} title="Inventory">
                <img src="https://oldschool.runescape.wiki/images/Inventory.png" className="w-6 h-6 object-contain" alt="" />
              </button>
              <button onClick={() => handleTabChange('quests')} className={`osrs-tab flex items-center justify-center ${activeTab === 'quests' ? 'active' : ''}`} title="Quests & Followers">
                <img src="https://oldschool.runescape.wiki/images/Quest_point_icon.png" className="w-6 h-6 object-contain" alt="" />
              </button>
              <button onClick={() => handleTabChange('ge')} className={`osrs-tab flex items-center justify-center ${activeTab === 'ge' ? 'active' : ''}`} title="Grand Exchange">
                <img src="https://oldschool.runescape.wiki/images/Coins_detail.png" className="w-6 h-6 object-contain" alt="" />
              </button>
              <button onClick={() => handleTabChange('prayer' as any)} className={`osrs-tab flex items-center justify-center ${activeTab === ('prayer' as any) ? 'active' : ''}`} title="Prayers">
                <img src="https://oldschool.runescape.wiki/images/Prayer_icon.png" className="w-6 h-6 object-contain" alt="" />
              </button>
            </div>
          </div>

            {/* Prayer Bar (Right) */}
          <div className="w-8 h-[300px] bg-[var(--osrs-brown)] border-2 border-[var(--osrs-border-dark)] relative overflow-hidden flex flex-col-reverse ml-1">
             <div className="absolute top-1 left-0 right-0 text-center z-10">
               <span className="text-xs text-white font-bold drop-shadow-md">{(gameState as any).prayerPoints?.toFixed(0)}</span>
             </div>
             <div className="absolute top-6 left-1/2 -translate-x-1/2 w-5 h-5 flex items-center justify-center">
                <img src="https://oldschool.runescape.wiki/images/Prayer_icon.png" alt="Prayer" className="w-full h-full object-contain" />
             </div>
             <div className="w-full bg-[var(--osrs-cyan)] transition-all duration-500 border-t border-[#ccffff]" style={{ height: `${((gameState as any).prayerPoints / (gameState as any).maxPrayerPoints) * 100}%` }} />
          </div>
        </div>
      </div>

      {/* Achievements Modal */}
      {showAchievements && (
        <div className="absolute inset-0 bg-black/80 z-50 flex items-center justify-center pointer-events-auto">
          <div className="osrs-window w-[400px] shadow-2xl relative flex flex-col">
            <div className="osrs-window-title flex justify-between items-center px-2 py-1">
              <h2 className="text-osrs-yellow font-bold text-lg tracking-tight">Achievement Diary</h2>
              <button 
                onClick={() => {
                  engineRef.current?.playSound('interface_close');
                  setShowAchievements(false);
                }} 
                className="text-osrs-red font-bold hover:text-white transition-colors px-2"
              >
                X
              </button>
            </div>
            
            <div className="p-4 bg-[url('https://oldschool.runescape.wiki/images/Back_pattern.png')] flex-1 overflow-y-auto custom-scrollbar space-y-3 max-h-[450px]">
              {gameState.achievements?.map((ach) => (
                <div key={ach.id} className={`p-3 border-2 ${ach.completed ? 'bg-osrs-green/10 border-osrs-green' : 'bg-[#3e2e18] border-[var(--osrs-border-light)]'}`}>
                  <div className="flex justify-between items-center">
                    <span className={`font-bold ${ach.completed ? 'text-osrs-green' : 'text-osrs-yellow'}`}>{ach.name}</span>
                    {ach.completed && <span className="text-[10px] bg-osrs-green text-black px-1 rounded font-bold">DONE</span>}
                  </div>
                  <p className="text-xs text-[#c0c0c0] mt-1 italic">{ach.description}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Quests Modal */}
      {showQuests && (
        <div className="absolute inset-0 bg-black/80 z-50 flex items-center justify-center pointer-events-auto">
          <div className="osrs-window w-[450px] shadow-2xl relative flex flex-col">
            <div className="osrs-window-title flex justify-between items-center px-2 py-1">
              <h2 className="text-osrs-orange font-bold text-lg tracking-tight">Quest Journal</h2>
              <button 
                onClick={() => {
                  engineRef.current?.playSound('interface_close');
                  setShowQuests(false);
                }} 
                className="text-osrs-red font-bold hover:text-white transition-colors px-2"
              >
                X
              </button>
            </div>
            
            <div className="p-4 bg-[url('https://oldschool.runescape.wiki/images/Back_pattern.png')] flex-1 overflow-y-auto custom-scrollbar space-y-3 max-h-[450px]">
              {gameState.quests?.map((quest) => (
                <div key={quest.id} className={`p-3 border-2 ${quest.completed ? 'bg-osrs-green/10 border-osrs-green' : 'bg-[#3e2e18] border-[var(--osrs-border-light)]'}`}>
                  <div className="flex justify-between items-center">
                    <span className={`font-bold ${quest.completed ? 'text-osrs-green' : 'text-osrs-yellow'}`}>{quest.name}</span>
                    {quest.completed && !quest.claimed && (
                      <button 
                        onClick={() => handleClaimQuest(quest.id)}
                        className="osrs-button text-[10px] px-2 py-1 text-osrs-green font-bold"
                      >
                        CLAIM REWARD
                      </button>
                    )}
                    {quest.claimed && <span className="text-[10px] text-[#808080] font-bold italic">CLAIMED</span>}
                  </div>
                  <p className="text-xs text-[#c0c0c0] mt-1 italic">{quest.description}</p>
                  <div className="mt-2 h-2 w-full bg-black/40 rounded-full overflow-hidden border border-[var(--osrs-border-light)]">
                    <div 
                      className="h-full bg-osrs-orange" 
                      style={{ width: `${Math.min(100, (quest.objective.current / quest.objective.target) * 100)}%` }}
                    />
                  </div>
                  <p className="text-[10px] text-right text-[#808080] mt-1">{quest.objective.current} / {quest.objective.target}</p>
                  {/* Reward preview */}
                  <div className="mt-2 pt-2 border-t border-white/10 flex items-center gap-2">
                    <span className="text-[9px] text-osrs-orange font-bold">REWARD:</span>
                    {quest.reward?.money && <span className="text-[9px] text-osrs-yellow">{quest.reward.money}gp</span>}
                    {quest.reward?.essence && <span className="text-[9px] text-osrs-cyan">{quest.reward.essence} ess</span>}
                    {quest.reward?.item && (
                      <div className="flex items-center gap-1">
                        <img 
                          src={`https://oldschool.runescape.wiki/images/${quest.reward.item.name.replace(/ /g, '_')}_detail.png`}
                          alt={quest.reward.item.name}
                          className="w-5 h-5 object-contain"
                          onError={(e) => {
                            const img = e.target as HTMLImageElement;
                            if (img.src.includes('_detail')) {
                              img.src = `https://oldschool.runescape.wiki/images/${quest.reward.item!.name.replace(/ /g, '_')}.png`;
                            } else { img.style.display = 'none'; }
                          }}
                        />
                        <span className="text-[9px] text-osrs-orange">{quest.reward.item.name}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Inventory Modal */}
      {showInventory && (
        <div className="absolute inset-0 bg-black/80 z-50 flex items-center justify-center pointer-events-auto">
          <div className="osrs-window w-[480px] shadow-2xl relative flex flex-col">
            <div className="osrs-window-title flex justify-between items-center px-2 py-1">
              <h2 className="text-[#c0c0c0] font-bold text-lg tracking-tight">Inventory</h2>
              <button 
                onClick={() => {
                  engineRef.current?.playSound('interface_close');
                  setShowInventory(false);
                }} 
                className="text-osrs-red font-bold hover:text-white transition-colors px-2"
              >
                X
              </button>
            </div>
            
            <div className="p-4 bg-[url('https://oldschool.runescape.wiki/images/Back_pattern.png')] flex-1 overflow-y-auto custom-scrollbar max-h-[450px]">
              {(!gameState.inventory || gameState.inventory.length === 0) ? (
                <div className="text-center py-8">
                  <p className="text-[#808080] italic">Your inventory is empty.</p>
                  <p className="text-[#5d5d5d] text-xs mt-2">Complete quests or defeat enemies to find items!</p>
                </div>
              ) : (
                <div className="grid grid-cols-4 gap-2">
                  {gameState.inventory.map((item: any) => {
                    const typeColor = item.type === 'weapon' ? 'var(--osrs-orange)' : item.type === 'shield' ? 'var(--osrs-cyan)' : '#cc44ff';
                    const typeLabel = item.type === 'weapon' ? 'WPN' : item.type === 'shield' ? 'SHD' : 'ACC';
                    return (
                      <div 
                        key={item.id} 
                        className="aspect-square bg-[#3e2e18] border-2 border-[var(--osrs-border-light)] rounded p-1 flex flex-col items-center justify-center group relative cursor-pointer hover:border-osrs-yellow transition-colors"
                        onClick={() => handleEquipItem(item.id)}
                      >
                        {/* Item type badge */}
                        <div className="absolute top-0 right-0 text-[7px] font-bold px-1 rounded-bl" style={{ backgroundColor: typeColor, color: '#000' }}>
                          {typeLabel}
                        </div>
                        <div className="w-10 h-10 flex items-center justify-center">
                          <img 
                            src={`https://oldschool.runescape.wiki/images/${item.name.replace(/ /g, '_')}_detail.png`} 
                            alt={item.name}
                            className="max-w-full max-h-full object-contain"
                            onError={(e) => {
                              const img = e.target as HTMLImageElement;
                              if (img.src.includes('_detail')) {
                                img.src = `https://oldschool.runescape.wiki/images/${item.name.replace(/ /g, '_')}.png`;
                              } else {
                                (e.target as HTMLImageElement).style.display = 'none';
                                const parent = (e.target as HTMLImageElement).parentElement;
                                if (parent && !parent.querySelector('span')) parent.innerHTML = '<span style="font-size:20px">⚔️</span>';
                              }
                            }}
                          />
                        </div>
                        <div className="text-[7px] text-[#c0c0c0] text-center mt-0.5 truncate w-full text-center">{item.name}</div>
                        {/* Hover tooltip */}
                        <div className="absolute inset-0 bg-black/95 opacity-0 group-hover:opacity-100 transition-opacity p-2 flex flex-col items-center justify-center text-center text-white text-[9px] z-10 rounded">
                          <span className="text-[11px] font-bold" style={{ color: typeColor }}>{item.name}</span>
                          <div className="w-full h-px bg-white/10 my-1" />
                          <span className="text-[9px] text-[#c0c0c0] italic">{item.description}</span>
                          {item.bonus?.damage && <span className="text-[9px] text-osrs-orange mt-0.5">⚔ +{item.bonus.damage} DMG</span>}
                          {item.bonus?.range && <span className="text-[9px] text-osrs-green mt-0.5">🏹 +{item.bonus.range} RNG</span>}
                          {item.bonus?.defense && <span className="text-[9px] text-osrs-cyan mt-0.5">🛡 +{item.bonus.defense} DEF</span>}
                          {item.bonus?.cooldown && <span className="text-[9px] text-osrs-yellow mt-0.5">⚡ {item.bonus.cooldown}ms CD</span>}
                          {gameState.selectedPlacedTower && <span className="text-[9px] text-osrs-green mt-1 font-bold animate-pulse">CLICK TO EQUIP</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              {!gameState.selectedPlacedTower && gameState.inventory && gameState.inventory.length > 0 && (
                <p className="text-[10px] text-center text-[#808080] mt-4 italic">Select a tower on the field first to equip items.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Grand Exchange Modal */}
      {showGrandExchange && (
        <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-50 pointer-events-auto">
          <div className="osrs-window w-[600px] h-[450px] flex flex-col shadow-2xl">
            <div className="osrs-window-title flex justify-between items-center px-2 py-1">
              <span className="text-osrs-orange font-bold drop-shadow-md text-lg">Grand Exchange</span>
              <button onClick={() => {
                engineRef.current?.playSound('interface_close');
                setShowGrandExchange(false);
              }} className="text-osrs-red font-bold hover:text-white transition-colors text-lg px-2">X</button>
            </div>
            
            <div className="flex-1 p-4 overflow-y-auto custom-scrollbar bg-[url('https://oldschool.runescape.wiki/images/Back_pattern.png')]">
              <div className="flex justify-between items-center mb-4 bg-black/20 p-2 rounded border border-[var(--osrs-border-light)]">
                <div className="flex items-center gap-2">
                   <img src="https://oldschool.runescape.wiki/images/Rune_essence_detail.png" className="w-6 h-6 object-contain" alt="" />
                   <span className="text-osrs-cyan font-bold text-lg">Essence: {gameState.runeEssence}</span>
                </div>
                <p className="text-xs text-[#c0c0c0] italic">Purchase permanent upgrades for your account.</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {[
                  { id: 'archerDamage', name: 'Ranged Strength', desc: 'Archer Damage +10%', cost: 10, inc: 0.1 },
                  { id: 'wizardDamage', name: 'Mystic Might', desc: 'Wizard Damage +10%', cost: 15, inc: 0.1 },
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
                    <div key={item.id} className="flex justify-between items-center bg-[#3e2e18] p-2 border border-[var(--osrs-border-light)] hover:border-osrs-yellow transition-colors group shadow-sm">
                      <div>
                        <div className="text-osrs-yellow font-bold text-sm group-hover:text-white transition-colors">{item.name}</div>
                        <div className="text-[#c0c0c0] text-[10px] italic">{item.desc}</div>
                        <div className="text-osrs-green text-[10px] mt-1 font-mono">
                          {item.id === 'startingMoney' 
                            ? `Current: ${upgrades[item.id as keyof GlobalUpgrades]}`
                            : `Current: ${upgrades[item.id as keyof GlobalUpgrades] > 1.0 ? '+' : ''}${Math.round((upgrades[item.id as keyof GlobalUpgrades] - 1) * 100)}%`
                          }
                          {isMaxed && <span className="ml-2 text-osrs-red font-bold">[MAX]</span>}
                        </div>
                      </div>
                      <button 
                        onClick={() => buyUpgrade(item.id as keyof GlobalUpgrades, item.cost, item.inc)}
                        disabled={runeEssence < item.cost || isMaxed}
                        className={`
                          osrs-button px-3 py-1.5 text-[10px] font-bold uppercase
                          ${runeEssence >= item.cost && !isMaxed
                            ? 'text-osrs-yellow hover:text-white' 
                            : 'opacity-50 cursor-not-allowed'}
                        `}
                      >
                        {isMaxed ? 'Maxed' : `${item.cost} Ess`}
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
        </div>
      )}

      {/* Upgrade Menu */}
      {gameState.selectedPlacedTower && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 osrs-window w-[320px] shadow-2xl z-20 flex flex-col gap-2">
          <div className="osrs-window-title flex justify-between items-center px-2 py-1">
            <h3 className="text-osrs-yellow font-bold">{gameState.selectedPlacedTower.name}</h3>
            <button 
              onClick={() => setSelectedPlacedTower(null)}
              className="text-osrs-red font-bold hover:text-white"
            >
              X
            </button>
          </div>
          
          <div className="p-3 bg-[url('https://oldschool.runescape.wiki/images/Back_pattern.png')]">
            <div className="grid grid-cols-2 gap-4">
              <div className="text-xs text-[#c0c0c0] space-y-1">
                <p className="font-bold text-osrs-orange">Stats</p>
                <p>Level: {gameState.selectedPlacedTower.level} / {gameState.selectedPlacedTower.maxLevel}</p>
                <p>Damage: {gameState.selectedPlacedTower.damage}</p>
                <p>Range: {gameState.selectedPlacedTower.range}</p>
                <p>Speed: {(gameState.selectedPlacedTower.cooldown / 1000).toFixed(1)}s</p>
              </div>
              
              <div className="text-xs text-[#c0c0c0] space-y-1">
                <p className="font-bold text-osrs-cyan">Skills</p>
                {Object.entries(gameState.selectedPlacedTower.skills || {}).map(([name, skill]: [string, any]) => (
                  <div key={name} className="flex justify-between">
                    <span className="capitalize">{name}:</span>
                    <span className="font-bold text-white">Lvl {skill.level}</span>
                  </div>
                ))}
              </div>
            </div>

            {gameState.selectedPlacedTower.type === 'archer' && (
              <div className="mt-2 border-t border-[var(--osrs-border-light)] pt-2">
                <p className="text-[10px] font-bold text-osrs-green mb-1">Combat Style</p>
                <div className="flex gap-1">
                  {['rapid', 'long_range'].map(style => (
                    <button
                      key={style}
                      onClick={() => engineRef.current?.setArcherStyle(gameState.selectedPlacedTower!.id, style as any)}
                      className={`osrs-button text-[9px] flex-1 py-1 capitalize ${gameState.selectedPlacedTower?.attackStyle === style ? 'brightness-125 border-white' : ''}`}
                    >
                      {style.replace('_', ' ')}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {gameState.selectedPlacedTower.type === 'wizard' && (
              <div className="mt-2 border-t border-[var(--osrs-border-light)] pt-2">
                <p className="text-[10px] font-bold text-osrs-yellow mb-1">Mage Specialization</p>
                <div className="flex gap-1 mb-2">
                  {['elemental', 'ancients', 'utility'].map(mode => (
                    <button
                      key={mode}
                      onClick={() => engineRef.current?.setMageMode(gameState.selectedPlacedTower!.id, mode as any)}
                      className={`osrs-button text-[9px] px-2 py-1 capitalize ${gameState.selectedPlacedTower?.mageMode === mode ? 'brightness-125 border-white' : ''}`}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
                
                {gameState.selectedPlacedTower.mageMode === 'elemental' && (
                  <div className="grid grid-cols-4 gap-1">
                    {['air', 'water', 'earth', 'fire'].map(elem => (
                      <button
                        key={elem}
                        onClick={() => engineRef.current?.setMageElement(gameState.selectedPlacedTower!.id, elem as any)}
                        className={`osrs-button text-[9px] p-1 capitalize ${gameState.selectedPlacedTower?.element === elem ? 'brightness-125 border-white' : ''}`}
                      >
                        {elem}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Targeting Priority */}
            <div className="mt-2 border-t border-[var(--osrs-border-light)] pt-2">
              <p className="text-[10px] font-bold text-osrs-orange mb-1 uppercase tracking-wider">Targeting Priority</p>
              <div className="grid grid-cols-3 gap-1">
                {['first', 'last', 'strongest', 'weakest', 'closest'].map(priority => (
                  <button
                    key={priority}
                    onClick={() => {
                      engineRef.current?.setTargetingPriority(gameState.selectedPlacedTower!.id, priority as any);
                      const updatedTower = engineRef.current?.towers.find((t: any) => t.id === gameState.selectedPlacedTower!.id);
                      if (updatedTower) setSelectedPlacedTower({ ...updatedTower });
                    }}
                    className={`osrs-button text-[9px] py-1 capitalize ${gameState.selectedPlacedTower?.targetingPriority === priority ? 'brightness-125 border-white' : ''}`}
                  >
                    {priority}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-2 mt-3">
              {gameState.selectedPlacedTower.level < gameState.selectedPlacedTower.maxLevel ? (
                <button 
                  onClick={handleUpgrade}
                  disabled={gameState.money < gameState.selectedPlacedTower.upgradeCost}
                  className={`flex-1 osrs-button py-2 text-xs font-bold ${gameState.money >= gameState.selectedPlacedTower.upgradeCost ? 'text-osrs-green' : 'opacity-50 cursor-not-allowed'}`}
                >
                  Upgrade ({gameState.selectedPlacedTower.upgradeCost} gp)
                </button>
              ) : (
                <div className="flex-1 text-center text-xs text-osrs-green font-bold py-2 border border-osrs-green/30 bg-osrs-green/10 rounded">Max Level</div>
              )}
              <button 
                onClick={handleSell}
                className="osrs-button px-4 py-2 text-xs font-bold text-osrs-red hover:text-white"
              >
                Sell
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tooltip */}
      {hoveredEntity && (
        <div 
          className="fixed pointer-events-none bg-black/95 border-2 border-[var(--osrs-border-light)] p-2 rounded text-osrs-yellow text-xs z-50 shadow-2xl min-w-[120px] font-osrs"
          style={{ left: tooltipPos.x + 15, top: tooltipPos.y + 15 }}
        >
          <p className="font-bold text-sm capitalize border-b border-white/10 mb-1 pb-1">
            {hoveredEntity.type === 'enemy' ? hoveredEntity.data.type.replace('_', ' ') : hoveredEntity.data.name}
          </p>
          {hoveredEntity.type === 'enemy' ? (
            <div className="space-y-0.5">
              <p>HP: <span className="text-white">{Math.ceil(hoveredEntity.data.hp)} / {hoveredEntity.data.maxHp}</span></p>
              <p>Speed: <span className="text-white">{hoveredEntity.data.speed}</span></p>
              <p className="text-[10px] text-[#c0c0c0] italic mt-1">Right-click for info</p>
            </div>
          ) : hoveredEntity.type === 'pet' ? (
            <div className="space-y-0.5">
              <p className="text-osrs-cyan italic font-bold">Follower</p>
              <p className="text-white text-[10px]">{hoveredEntity.data.bonus}</p>
            </div>
          ) : (
            <div className="space-y-0.5">
              <p>Level: <span className="text-white">{hoveredEntity.data.level}</span></p>
              <p>Damage: <span className="text-white">{hoveredEntity.data.damage}</span></p>
              <p>Range: <span className="text-white">{hoveredEntity.data.range}</span></p>
              {hoveredEntity.data.level < 4 && (
                <p className="text-osrs-green mt-1">Next: <span className="text-white">{
                  (() => {
                    const upgradeNames: any = {
                      archer: ['Magic Shortbow', 'Crystal Bow', 'Faerdhinen'],
                      wizard: ['Bolt Spells', 'Blast Spells', 'Ancient Magicks'],
                      cannon: ['Granite Cannon', 'Heavy Ballista', 'Dragon Slayer'],
                      tzhaar: ['Toktz-xil-ak', 'TzHaar-Ket-Om', 'Inquisitor Mace'],
                      slayer: ['Karils Cross', 'Twisted Bow', 'Zaryte Cross'],
                      toxic:  ['Serp Blowpipe', 'Trident', 'Magma Blowpipe']
                    };
                    const names = upgradeNames[hoveredEntity.data.type];
                    return names ? names[hoveredEntity.data.level - 1] : 'Elite Gear';
                  })()
                }</span></p>
              )}
              <p className="text-[10px] text-[#c0c0c0] italic mt-1">Right-click for toggle range</p>
            </div>
          )}
        </div>
      )}

      {/* Right Click Status Modal */}
      {rightClickedEntity && (
        <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-[100] p-4 pointer-events-auto">
          <div className="osrs-window w-full max-w-sm shadow-2xl relative flex flex-col">
            <div className="osrs-window-title flex justify-between items-center px-2 py-1">
              <h3 className="text-lg font-bold capitalize text-osrs-yellow">
                {rightClickedEntity.type === 'enemy' ? rightClickedEntity.data.type.replace('_', ' ') : rightClickedEntity.data.name}
              </h3>
              <button onClick={() => setRightClickedEntity(null)} className="text-osrs-red font-bold text-lg hover:text-white transition-colors px-2">X</button>
            </div>
            
            <div className="p-4 bg-[url('https://oldschool.runescape.wiki/images/Back_pattern.png')] space-y-4">
              {rightClickedEntity.type === 'enemy' ? (
                <>
                  <div className="bg-black/20 p-3 rounded border border-[var(--osrs-border-light)]">
                    <p className="text-osrs-orange font-bold mb-2 border-b border-white/10">Combat Stats</p>
                    <div className="grid grid-cols-2 gap-2 text-sm font-osrs">
                      <p>Health:</p><p className="text-white text-right">{Math.ceil(rightClickedEntity.data.hp)} / {rightClickedEntity.data.maxHp}</p>
                      <p>Speed:</p><p className="text-white text-right">{rightClickedEntity.data.speed}</p>
                      <p>Reward:</p><p className="text-osrs-yellow text-right">{rightClickedEntity.data.reward} GP</p>
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
                      <p>Level:</p><p className="text-white text-right">{rightClickedEntity.data.level}</p>
                      <p>Damage:</p><p className="text-white text-right">{rightClickedEntity.data.damage}</p>
                      <p>Range:</p><p className="text-white text-right">{rightClickedEntity.data.range}</p>
                      <p>Cooldown:</p><p className="text-white text-right">{(rightClickedEntity.data.cooldown / 1000).toFixed(1)}s</p>
                    </div>
                  </div>
                  
                  {rightClickedEntity.data.level < 4 && (
                    <div className="bg-black/20 p-3 rounded border border-[var(--osrs-border-light)]">
                      <p className="text-osrs-yellow font-bold mb-2 border-b border-white/10">Future Upgrades</p>
                      <div className="space-y-2 text-[10px] font-osrs">
                        {[2, 3, 4].filter(l => l > rightClickedEntity.data.level).map(lvl => {
                          const upgrades: any = {
                             archer: [null, 'Magic Shortbow', 'Crystal Bow', 'Bow of Faerdhinen'],
                             wizard: [null, 'Bolt Spells', 'Blast Spells', 'Ancient Magicks'],
                             cannon: [null, 'Granite Cannon', 'Heavy Ballista', 'Dragon Slayer Ballista'],
                             tzhaar: [null, 'Toktz-xil-ak', 'TzHaar-Ket-Om', "Inquisitor's Mace"],
                             slayer: [null, 'Karils Crossbow', 'Twisted Bow', 'Zaryte Crossbow'],
                             toxic:  [null, 'Serp Blowpipe', 'Trident of Swamp', 'Magma Blowpipe']
                          };
                          const names = upgrades[rightClickedEntity.data.type as keyof typeof upgrades];
                          return (
                            <div key={lvl} className="flex justify-between border-b border-white/5 pb-1">
                              <span className="text-[#c0c0c0]">LVL {lvl}:</span>
                              <span className="text-white font-bold">{names ? names[lvl-1] : 'Elite Gear'}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <div className="bg-black/20 p-3 rounded border border-[var(--osrs-border-light)]">
                    <p className="text-osrs-cyan font-bold mb-2 border-b border-white/10">Skills</p>
                    <div className="grid grid-cols-2 gap-2 text-sm font-osrs">
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
              
              <button 
                onClick={() => setRightClickedEntity(null)}
                className="w-full osrs-button py-2 font-bold text-osrs-yellow transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}


      {/* Chat Box (Bottom Left) */}
      <div className="absolute bottom-4 left-4 w-[480px] h-36 bg-[rgba(0,0,0,0.6)] border-2 border-[var(--osrs-border-dark)] rounded-sm pointer-events-auto z-10 flex flex-col overflow-hidden shadow-2xl font-osrs">
        <div className="bg-[var(--osrs-brown)] px-2 py-0.5 border-b border-[var(--osrs-border-light)] flex justify-between font-mono">
          <span className="text-[10px] font-bold text-[#c0c0c0]">ALL GAME MESSAGES</span>
          <span className="text-[10px] text-osrs-yellow">Report</span>
        </div>
        <div className="flex-1 p-2 overflow-y-auto custom-scrollbar flex flex-col-reverse font-mono text-left">
          {[...(gameState.messages || [])].reverse().map((msg, i) => (
            <div key={i} className="text-[11px] text-[#ffffff] leading-tight mb-1">
              <span className="text-osrs-orange font-bold">System:</span> {msg}
            </div>
          ))}
        </div>
      </div>

      {/* Tower Selection Grid (Bottom Center) - Always Visible */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 z-10 pointer-events-none">
        {gameState.selectedTower && (
          <div className="text-center mb-1 text-[11px] text-osrs-yellow font-bold bg-black/80 py-0.5 px-4 border border-osrs-yellow/50 rounded-sm tracking-widest uppercase animate-pulse font-mono">
            Click on map to place — [ESC to cancel]
          </div>
        )}
        <div className="flex bg-[#3e2e18]/90 border-2 border-[var(--osrs-border-dark)] p-1 gap-1 pointer-events-auto rounded shadow-2xl">
          {[
            { id: 'archer', name: 'Archer', cost: 50, icon: '🏹', wikiImg: 'Shortbow', color: '#00ff00', desc: 'Fast Ranged attacks.', upgrades: 'Magic Shortbow → Crystal Bow → Bow of Faerdhinen' },
            { id: 'wizard', name: 'Wizard', cost: 100, icon: '🪄', wikiImg: 'Staff', color: '#00ffff', desc: 'Magic damage. Access to Elemental spells and Ancient Magicks.', upgrades: 'Bolt → Blast → Wave → Surge / Ancient Spells' },
            { id: 'cannon', name: 'Cannon', cost: 250, icon: '💣', wikiImg: 'Dwarf_multicannon', color: '#00ff00', desc: 'AoE Ranged damage.', upgrades: 'Granite Cannon → Heavy Ballista → Dragon Hunter Ballista' },
            { id: 'tzhaar', name: 'TzHaar', cost: 500, icon: '🛡️', wikiImg: 'TzHaar-Ket', color: '#ff0000', desc: 'Heavy Melee strength.', upgrades: 'Toktz-xil-ak → TzHaar-Ket-Om → Inquisitor\'s Mace' },
            { id: 'slayer', name: 'Slayer', cost: 750, icon: '⚔️', wikiImg: 'Slayer_helmet', color: '#00ff00', desc: 'Ranged specialist. Bonus vs Tasks.', upgrades: 'Karils Crossbow → Twisted Bow → Zaryte Crossbow' },
            { id: 'toxic', name: 'Toxic', cost: 1000, icon: '🐍', wikiImg: 'Toxic_blowpipe', color: '#00ff00', desc: 'Venomous Ranged damage.', upgrades: 'Blowpipe → Serp Blowpipe → Trident → Magma Blowpipe' },
          ].map((tower) => {
            const isSelected = gameState.selectedTower === tower.id;
            const canAfford = gameState.money >= tower.cost;
            return (
              <button
                key={tower.id}
                onClick={() => {
                  setSelectedTower(isSelected ? null : tower.id);
                  setSelectedPlacedTower(null);
                }}
                onMouseEnter={(e) => setActiveTooltip({
                  x: e.clientX, y: e.clientY,
                  title: tower.name.toUpperCase(),
                  content: tower.desc,
                  bonus: `Path: ${tower.upgrades}`,
                  color: tower.color
                })}
                onMouseLeave={() => setActiveTooltip(null)}
                disabled={!canAfford}
                className={`
                  flex flex-col items-center w-[68px] py-1.5 px-1 border-2 transition-all relative group
                  ${isSelected ? 'border-osrs-yellow bg-[#4a3f35] shadow-[0_0_8px_rgba(255,255,0,0.6)]' : 'border-[#2d2d2d] bg-[#1a1a1a] hover:bg-[#2d2d2d] hover:border-[#5d5d5d]'}
                  ${!canAfford ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}
                `}
              >
                <div className="w-9 h-9 flex items-center justify-center relative mb-0.5">
                  <img
                    src={`https://oldschool.runescape.wiki/images/${tower.wikiImg}.png`}
                    alt={tower.name}
                    className="max-pw-full max-h-full object-contain drop-shadow-md"
                    onError={(e) => { (e.target as HTMLImageElement).style.display='none'; (e.target as HTMLImageElement).nextElementSibling!.classList.remove('hidden'); }}
                  />
                  <span className="hidden text-2xl">{tower.icon}</span>
                </div>
                <span className="text-[9px] font-bold uppercase tracking-tight" style={{ color: tower.color }}>{tower.name}</span>
                <span className={`text-[9px] font-bold ${canAfford ? 'text-osrs-green' : 'text-osrs-red'}`}>{tower.cost}gp</span>
                {isSelected && <div className="absolute -top-1 -right-1 w-2 h-2 bg-osrs-yellow rounded-full animate-ping" />}
              </button>
            );
          })}
        </div>
      </div>
      {/* Global Tooltip Renderer */}
      {activeTooltip && (
        <div 
          className="fixed z-[1000] pointer-events-none p-2 bg-black/95 border border-osrs-yellow shadow-2xl w-48 font-osrs"
          style={{ 
            left: Math.min(window.innerWidth - 200, activeTooltip.x + 10), 
            top: activeTooltip.y - 100 // Try above mouse
          }}
        >
          <p className="text-osrs-yellow font-bold text-xs" style={{ color: activeTooltip.color }}>{activeTooltip.title}</p>
          <p className="text-white text-[10px] mt-1 leading-tight">{activeTooltip.content}</p>
          {activeTooltip.bonus && <p className="text-osrs-cyan text-[8px] mt-1">{activeTooltip.bonus}</p>}
        </div>
      )}
    </div>
  );
}
