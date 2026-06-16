'use client';

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { GameEngine } from '@/lib/game/engine';
import type { GlobalUpgrades, Item, Achievement, Pet, Quest, ActivePotion, FarmingPatch } from '@/lib/game/types';
import { TOWERS as TOWER_DATA } from '@/lib/game/data/towers';
import { ENEMIES as ENEMY_DATA } from '@/lib/game/data/enemies';
import { PRAYERS as PRAYER_DATA } from '@/lib/game/data/prayers';
import { ITEMS as ITEM_DATA } from '@/lib/game/data/items';
import { GE_CONSUMABLES } from '@/lib/game/data/shop';
import { ASSETS } from '@/lib/game/assets';

// UI Components
import { TopOverlay } from './game-ui/TopOverlay';
import { StatusSidebar } from './game-ui/StatusSidebar';
import { FarmingTab } from './game-ui/FarmingTab';
import { HerbloreTab } from './game-ui/HerbloreTab';
import { MagicTab } from './game-ui/MagicTab';
import { ConstructionTab } from './game-ui/ConstructionTab';
import { TowerSelectionGrid } from './game-ui/TowerSelectionGrid';
import { ActivePotionsDisplay } from './game-ui/ActivePotionsDisplay';
import { EntityTooltip } from './game-ui/EntityTooltip';
import { TowerTooltip } from './game-ui/TowerTooltip';
import { RightClickModal } from './game-ui/RightClickModal';
import { SelectedTowerModal } from './game-ui/SelectedTowerModal';
import { GrandExchangeModal } from './game-ui/GrandExchangeModal';
import { EssenceShopModal } from './game-ui/EssenceShopModal';
import { QuestLogModal } from './game-ui/QuestLogModal';
import { AchievementsModal } from './game-ui/AchievementsModal';
import { TowerControls } from './game-ui/TowerControls';
import { GameOverModal } from './game-ui/GameOverModal';

interface TowerSkill {
  level: number;
  xp: number;
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
  ancientType?: string;
  element?: string;
  targetingPriority?: string;
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
  achievements?: Achievement[];
  pets?: Pet[];
  inventory?: Item[];
  quests?: Quest[];
  achievementPoints?: number;
  // Loose: the initial state seeds only a partial skill set.
  playerSkills?: Record<string, any>;
  autoSpawnTimer?: number;
  selectedTower?: string | null;
  selectedPlacedTower?: TowerData | null;
  prayerPoints: number;
  maxPrayerPoints: number;
  prayerDrainRate?: number;
  activePotions?: ActivePotion[];
  itemPriceMultipliers?: Record<string, number>;
  isPaused?: boolean;
  gameOver?: boolean;
  farmingPatches?: FarmingPatch[];
  pohUpgrades?: string[];
}

const UPGRADE_LIMITS = {
  archerRange: 2.0,
  archerDamage: 2.5,
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

export default function GameCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const [gameState, setGameState] = useState<GameState>({
    money: 60,
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
    prayerDrainRate: 0,
    activePotions: [],
    gameOver: false,
    playerSkills: {
      mining: { level: 1, xp: 0 },
      woodcutting: { level: 1, xp: 0 },
      herblore: { level: 1, xp: 0 },
      crafting: { level: 1, xp: 0 },
      prayer: { level: 1, xp: 0 }
    }
  });

  const [activeTab, setActiveTab] = useState<'inventory' | 'quests' | 'achievements' | 'ge' | 'combat' | 'prayer' | 'herblore' | 'settings' | 'pets' | 'slayer'>('inventory');
  const [autoSpawn, setAutoSpawn] = useState(false);
  const [autoSpawnDelay, setAutoSpawnDelay] = useState(3);
  const [autoSpawnTimer, setAutoSpawnTimer] = useState(0);
  const [gameSpeed, setGameSpeed] = useState(1);
  const [isPaused, setIsPaused] = useState(false);

  // Persistence
  const [runeEssence, setRuneEssence] = useState(0);
  const [upgrades, setUpgrades] = useState<GlobalUpgrades>({
    archerRange: 1.0,
    archerDamage: 1.0,
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
  const [upgradeCounts, setUpgradeCounts] = useState<Record<string, number>>({});

  const [showGrandExchange, setShowGrandExchange] = useState(false);
  const [showEssenceShop, setShowEssenceShop] = useState(false);
  const [geTab, setGeTab] = useState<'upgrades' | 'potions' | 'sell'>('upgrades');
  const [showAchievements, setShowAchievements] = useState(false);
  const [showQuests, setShowQuests] = useState(false);
  const [showLadderMenu, setShowLadderMenu] = useState(false);
  const [showFarmingUI, setShowFarmingUI] = useState(false);
  const [showHerbloreUI, setShowHerbloreUI] = useState(false);
  const [showMagicUI, setShowMagicUI] = useState(false);
  const [showConstructionUI, setShowConstructionUI] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
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
  const [devMode, setDevMode] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    
    // Resize observer for high-res canvas
    if (canvasRef.current) {
      const observer = new ResizeObserver(() => {
        engineRef.current?.resize();
      });
      observer.observe(canvasRef.current);
      return () => observer.disconnect();
    }
  }, []);

  useEffect(() => {
    const savedEssence = localStorage.getItem('osrs_td_essence');
    if (savedEssence) setRuneEssence(parseInt(savedEssence));
    const savedUpgrades = localStorage.getItem('osrs_td_upgrades');
    if (savedUpgrades) {
      try {
        const parsed = JSON.parse(savedUpgrades);
        setUpgrades(prev => ({ ...prev, ...parsed }));
      } catch (e) {
        console.error('Failed to parse saved upgrades', e);
      }
    }
    // Load player status
    const savedSkills = localStorage.getItem('osrs_td_player_skills');
    const savedWave = localStorage.getItem('osrs_td_wave');
    if (savedSkills || savedWave) {
      setGameState(prev => ({
        ...prev,
        ...(savedSkills ? { playerSkills: JSON.parse(savedSkills) } : {}),
        ...(savedWave ? { wave: parseInt(savedWave) } : {}),
      }));
    }
  }, []);

  // Foundational state update callbacks
  const setSelectedTower = useCallback((type: string | null) => {
    if (type) engineRef.current?.playSound('click');
    setGameState(prev => ({ ...prev, selectedTower: type }));
  }, []);

  const setSelectedPlacedTower = useCallback((data: any | null) => {
    if (data) engineRef.current?.playSound('click');
    setGameState(prev => ({ ...prev, selectedPlacedTower: data }));
  }, []);

  // Re-snapshot the selected tower after an engine mutation so the open modal
  // reflects the change (the modal renders from gameState.selectedPlacedTower).
  const refreshSelectedTower = useCallback((towerId: string) => {
    const updated = engineRef.current?.towers.find((t: any) => t.id === towerId);
    if (updated) setSelectedPlacedTower({ ...updated });
  }, [setSelectedPlacedTower]);

  const getLogicCoords = (clientX: number, clientY: number) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return { x: 0, y: 0 };
    // Map screen coordinates to the 1920x1080 logic space
    const scaleX = 1920 / rect.width;
    const scaleY = 1080 / rect.height;
    return { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY };
  };

  const buyUpgrade = useCallback((type: keyof GlobalUpgrades, cost: number, increment: number) => {
    const count = upgradeCounts[type] || 0;
    const currentCost = cost * Math.pow(2, count);
    const currentVal = upgrades[type];
    const limit = UPGRADE_LIMITS[type];
    const canUpgrade = increment > 0 ? currentVal < limit : currentVal > limit;
    
    if (runeEssence >= currentCost && canUpgrade) {
      engineRef.current?.playSound('sell');
      setRuneEssence((prev: number) => prev - currentCost);
      setUpgradeCounts(prev => ({ ...prev, [type]: count + 1 }));
      setUpgrades((prev: GlobalUpgrades) => {
        const currentVal = prev[type] ?? (type === 'towerCostReduction' ? 1.0 : 0);
        const newVal = increment > 0 
          ? Math.min(currentVal + increment, limit) 
          : Math.max(currentVal + increment, limit);
        return {
          ...prev,
          [type]: newVal
        };
      });
    } else {
      engineRef.current?.playSound('click');
    }
  }, [runeEssence, upgrades, upgradeCounts]);

  const handleCanvasClick = useCallback((e: React.MouseEvent) => {
    if (!engineRef.current) return;
    const { x, y } = getLogicCoords(e.clientX, e.clientY);
    if (engineRef.current.collectLootAt(x, y)) return;

    const node = engineRef.current.nodes.find((n: any) => x >= n.x - 16 && x <= n.x + 16 && y >= n.y - 16 && y <= n.y + 16);
    if (node) { engineRef.current.interactWithNode(node.id); return; }
    
    if (gameState.selectedTower) {
      engineRef.current.placeTower(gameState.selectedTower, x, y);
      setSelectedTower(null);
    } else {
      const entity = engineRef.current.getEntityAt(x, y);
      if (entity && entity.type === 'tower') setSelectedPlacedTower(entity.data);
      else setSelectedPlacedTower(null);
    }
  }, [gameState.selectedTower, setSelectedTower, setSelectedPlacedTower]);

  const handleUpgrade = useCallback(() => {
    if (engineRef.current && gameState.selectedPlacedTower) {
      engineRef.current.upgradeTower(gameState.selectedPlacedTower.id);
      const updatedTower = engineRef.current.towers.find((t: any) => t.id === gameState.selectedPlacedTower!.id);
      if (updatedTower) setSelectedPlacedTower({ ...updatedTower });
    }
  }, [gameState.selectedPlacedTower, setSelectedPlacedTower]);

  const handleSell = useCallback(() => {
    if (engineRef.current && gameState.selectedPlacedTower) {
      engineRef.current.sellTower(gameState.selectedPlacedTower.id);
      setSelectedPlacedTower(null);
    }
  }, [gameState.selectedPlacedTower, setSelectedPlacedTower]);

  const handleClaimQuest = useCallback((questId: string) => engineRef.current?.claimQuestReward(questId), []);

  const handleUnequipItem = useCallback((slot: 'weapon' | 'shield' | 'accessory') => {
    if (engineRef.current && gameState.selectedPlacedTower) {
      engineRef.current.unequipItem(gameState.selectedPlacedTower.id, slot);
      const updatedTower = engineRef.current.towers.find((t: any) => t.id === gameState.selectedPlacedTower!.id);
      if (updatedTower) setSelectedPlacedTower({ ...updatedTower });
    }
  }, [gameState.selectedPlacedTower, setSelectedPlacedTower]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!engineRef.current) return;
    const { x, y } = getLogicCoords(e.clientX, e.clientY);
    engineRef.current.updateMousePos(x, y);
    // Dev mode: hover-pickup bones
    if (devMode) {
      engineRef.current.collectLootAt(x, y, true);
    }
    const entity = engineRef.current.getEntityAt(x, y);
    if (entity) {
      setHoveredEntity(entity);
      setTooltipPos({ x: e.clientX, y: e.clientY });
      engineRef.current.hoveredEntityId = entity.data.id;
    } else {
      setHoveredEntity(null);
      engineRef.current.hoveredEntityId = null;
    }
  }, [devMode]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    if (gameState.selectedTower) { setSelectedTower(null); return; }
    if (!engineRef.current) return;
    const { x, y } = getLogicCoords(e.clientX, e.clientY);
    const entity = engineRef.current.getEntityAt(x, y);
    if (entity && entity.type === 'tower') {
      const tower = engineRef.current.towers.find((t: any) => t.id === entity.data.id);
      if (tower) { tower.showRange = !tower.showRange; setGameState(prev => ({ ...prev })); }
    }
  }, [gameState.selectedTower, setSelectedTower]);

  const toggleDevMode = useCallback(() => {
    setDevMode(prev => {
      const newVal = !prev;
      if (engineRef.current) {
        engineRef.current.devMode = newVal;
      }
      return newVal;
    });
  }, []);

  const handleTabChange = useCallback((tab: any) => {
    engineRef.current?.playSound('click');
    setActiveTab(tab);
  }, []);

  const handleStartWave = useCallback(() => {
    engineRef.current?.playSound('click');
    engineRef.current?.startWave();
  }, []);

  const handleSpecialAttack = useCallback(() => {
    engineRef.current?.useSpecialAttack();
  }, []);

  const handleEquipItem = useCallback((itemId: string) => {
    if (engineRef.current) {
      engineRef.current.playSound('click');
      engineRef.current.useItem(itemId, gameState.selectedPlacedTower?.id);
      if (gameState.selectedPlacedTower) {
        const updatedTower = engineRef.current.towers.find((t: any) => t.id === gameState.selectedPlacedTower!.id);
        if (updatedTower) setSelectedPlacedTower({ ...updatedTower });
      }
    }
  }, [gameState.selectedPlacedTower, setSelectedPlacedTower]);

  const handleSetWave = useCallback((wave: number) => {
    engineRef.current?.setWave(wave);
  }, []);

  const handleSetGold = useCallback((gold: number) => {
    engineRef.current?.setGold(gold);
  }, []);

  const handleRestart = useCallback(() => {
    engineRef.current?.restartGame();
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setSelectedTower(null); setSelectedPlacedTower(null); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [setSelectedTower, setSelectedPlacedTower]);

  useEffect(() => {
    if (!isMounted) return;
    localStorage.setItem('osrs_td_essence', runeEssence.toString());
    localStorage.setItem('osrs_td_upgrades', JSON.stringify(upgrades));
    // Save player skills and wave
    if (gameState.playerSkills && Object.keys(gameState.playerSkills).length > 0) {
      localStorage.setItem('osrs_td_player_skills', JSON.stringify(gameState.playerSkills));
    }
    localStorage.setItem('osrs_td_wave', gameState.wave.toString());
  }, [runeEssence, upgrades, gameState.playerSkills, gameState.wave, isMounted]);

  useEffect(() => {
    if (!canvasRef.current || !isMounted) return;
    const canvas = canvasRef.current;
    try {
      const engine = new GameEngine(canvas, (state) => {
        try {
          // The engine emits an EngineStatePatch; the UI's GameState is a looser
          // view of the same data, so reconcile the shapes at this one boundary.
          const safeState = structuredClone(state) as unknown as Partial<GameState>;
          setGameState((prev: GameState) => ({ ...prev, ...safeState }));
          if (safeState.runeEssence !== undefined) {
            setRuneEssence(safeState.runeEssence);
          }
        } catch (e) {
          console.error('Error in onStateChange:', e);
        }
      }, runeEssence, upgrades);
      engineRef.current = engine;
      engine.start();
    } catch (e) {
      console.error('GameEngine initialization failed:', e);
    }

    const resizeObserver = new ResizeObserver(() => {
      engineRef.current?.resize();
    });
    if (canvas.parentElement) {
      resizeObserver.observe(canvas.parentElement);
    }

    return () => {
      engineRef.current?.stop();
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

  return (
    <div className="relative w-full h-full flex flex-col overflow-hidden bg-[#000] select-none text-base">
      {/* Canvas */}
      <canvas 
        ref={canvasRef}
        className="absolute inset-0 block cursor-crosshair touch-none w-full h-full z-0"
        onClick={handleCanvasClick}
        onMouseMove={handleMouseMove}
        onContextMenu={handleContextMenu}
      />


      <TopOverlay 
        money={gameState.money} 
        runeEssence={runeEssence} 
        wave={gameState.wave} 
        isSidebarCollapsed={isSidebarCollapsed}
        setActiveTooltip={setActiveTooltip}
      />

      {/* HUD Layer - Anchored Bottom Right */}
      <div className="absolute right-4 bottom-4 flex flex-col-reverse items-end gap-3 z-20 pointer-events-none">
        <StatusSidebar 
          playerHP={gameState.lives}
          playerMaxHP={20}
          specialAttackCharge={gameState.specialAttackCharge || 0}
          activeTab={activeTab}
          setActiveTab={(tab: string) => setActiveTab(tab as any)}
          isSidebarCollapsed={isSidebarCollapsed}
          inventory={gameState.inventory || []}
          playerSkills={gameState.playerSkills || {}}
          gameSpeed={gameSpeed}
          isPlaying={gameState.isPlaying}
          isPaused={isPaused}
          autoSpawn={autoSpawn}
          slayerTask={gameState.slayerTask}
          prayerPoints={gameState.prayerPoints}
          maxPrayerPoints={gameState.maxPrayerPoints}
          prayerDrainRate={gameState.prayerDrainRate || 0}
          allPrayers={PRAYER_DATA}
          activePrayers={new Set()} 
          herbloreLevel={gameState.playerSkills?.herblore?.level || 1}
          questPoints={gameState.achievementPoints || 0}
          quests={gameState.quests || []}
          currentRegion="Misthalin"
          slayerPoints={engineRef.current?.slayerPoints || 0}
          consecutiveTasks={engineRef.current?.consecutiveTasks || 0}
          unlockedTowers={engineRef.current?.unlockedTowers || []}
          blockedEnemies={engineRef.current?.blockedEnemies || []}
          extendedTasks={engineRef.current?.extendedTasks || []}
          biggerAndBadder={engineRef.current?.biggerAndBadder || false}
          slayerHelmet={engineRef.current?.slayerHelmet || false}
          slayerMaster={engineRef.current?.slayerMaster || 'turael'}
          handleSpecialAttack={handleSpecialAttack}
          handleEquipItem={handleEquipItem}
          setShowAchievements={setShowAchievements}
          setGameSpeed={setGameSpeed}
          handleStartWave={handleStartWave}
          handlePauseResume={() => {
            const nextPaused = !isPaused;
            setIsPaused(nextPaused);
            if (nextPaused) engineRef.current?.pause();
            else engineRef.current?.resume();
          }}
          setAutoSpawn={setAutoSpawn}
          togglePrayer={(id) => engineRef.current?.togglePrayer(id as any)}
          setShowQuestLog={setShowQuests}
          setShowGE={setShowGrandExchange}
          setShowEssenceShop={setShowEssenceShop}
          setIsSidebarCollapsed={setIsSidebarCollapsed}
          playSound={(s) => engineRef.current?.playSound(s)}
          addMessage={(m) => engineRef.current?.addMessage(m)}
          resetGame={() => engineRef.current?.resetProgress()}
          setActiveTooltip={setActiveTooltip}
          pets={gameState.pets || []}
          toggleDevMode={toggleDevMode}
          devMode={devMode}
          handleSetWave={handleSetWave}
          handleSetGold={handleSetGold}
          buryBone={(index) => engineRef.current?.buryBone(index)}
          setSlayerMaster={(id) => engineRef.current?.setSlayerMaster(id)}
          unlockTower={(id, cost) => engineRef.current?.unlockTower(id, cost)}
          unlockSlayerReward={(id, cost) => engineRef.current?.unlockSlayerReward(id, cost)}
          blockEnemy={(type, cost) => engineRef.current?.blockEnemy(type, cost)}
          extendTask={(type, cost) => engineRef.current?.extendTask(type, cost)}
          skipTask={(cost) => engineRef.current?.skipTask(cost)}
        />
      </div>

      {/* Selection Grid */}
      <TowerSelectionGrid 
        selectedTower={gameState.selectedTower || null}
        setSelectedTower={setSelectedTower}
        setSelectedPlacedTower={setSelectedPlacedTower}
        money={gameState.money}
        setActiveTooltip={setActiveTooltip}
        towerCostReduction={upgrades.towerCostReduction}
      />

      {/* Active Buffs */}
      <ActivePotionsDisplay activePotions={gameState.activePotions || []} />

      {/* Ladder Menu Button */}
      <div className="absolute left-4 bottom-4 z-30 flex flex-col gap-2 pointer-events-auto">
        {showLadderMenu && (
          <div className="osrs-panel p-2 flex flex-col gap-2 mb-2 animate-in slide-in-from-bottom-2">
            <button 
              className="osrs-button py-2 px-4 text-xs uppercase flex items-center gap-2"
              onClick={() => {
                setShowFarmingUI(true);
                setShowLadderMenu(false);
                engineRef.current?.playSound('interface_open');
              }}
            >
              <img src={ASSETS.misc.farming_icon} className="w-5 h-5" alt="Farming" />
              Farming
            </button>
            <button 
              className="osrs-button py-2 px-4 text-xs uppercase flex items-center gap-2"
              onClick={() => {
                setShowHerbloreUI(true);
                setShowLadderMenu(false);
                engineRef.current?.playSound('interface_open');
              }}
            >
              <img src={ASSETS.misc.herblore_icon} className="w-5 h-5" alt="Herblore" />
              Herblore
            </button>
            <button 
              className="osrs-button py-2 px-4 text-xs uppercase flex items-center gap-2"
              onClick={() => {
                setShowMagicUI(true);
                setShowLadderMenu(false);
                engineRef.current?.playSound('interface_open');
              }}
            >
              <img src={ASSETS.misc.magic_icon} className="w-5 h-5" alt="Magic" />
              Magic
            </button>
            <button 
              className="osrs-button py-2 px-4 text-xs uppercase flex items-center gap-2"
              onClick={() => {
                setShowConstructionUI(true);
                setShowLadderMenu(false);
                engineRef.current?.playSound('interface_open');
              }}
            >
              <img src="https://oldschool.runescape.wiki/images/Construction_icon.png" className="w-5 h-5" alt="Construction" />
              Construction
            </button>
          </div>
        )}
        <button 
          className="w-12 h-12 bg-[var(--osrs-brown-dark)] border-2 border-[var(--osrs-border-light)] rounded-full flex items-center justify-center hover:bg-[var(--osrs-brown)] transition-colors shadow-lg"
          onClick={() => {
            setShowLadderMenu(!showLadderMenu);
            engineRef.current?.playSound('click');
          }}
        >
          <img src="https://oldschool.runescape.wiki/images/Ladder.png" className="w-8 h-8 object-contain" alt="Menu" onError={(e) => { e.currentTarget.src = ASSETS.misc.portal; }} />
        </button>
      </div>

      {/* Modals */}
      {showFarmingUI && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 pointer-events-auto">
          <div className="osrs-panel w-[400px] max-h-[80vh] flex flex-col relative">
            <button 
              className="absolute top-2 right-2 w-6 h-6 bg-red-900 border border-red-500 text-white flex items-center justify-center hover:bg-red-800"
              onClick={() => {
                setShowFarmingUI(false);
                engineRef.current?.playSound('interface_close');
              }}
            >
              X
            </button>
            <div className="p-4 h-full overflow-hidden">
              <FarmingTab 
                farmingPatches={gameState.farmingPatches || []} 
                inventory={gameState.inventory || []} 
                plantSeed={(patchId, seed) => engineRef.current?.plantSeed(patchId, seed)} 
                harvestPatch={(patchId) => engineRef.current?.harvestPatch(patchId)} 
                applyCompost={(patchId, compost) => engineRef.current?.applyCompost(patchId, compost)}
                curePatch={(patchId) => engineRef.current?.curePatch(patchId)}
                addMessage={(msg) => engineRef.current?.addMessage(msg)} 
                setActiveTooltip={setActiveTooltip} 
              />
            </div>
          </div>
        </div>
      )}

      {showHerbloreUI && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 pointer-events-auto">
          <div className="osrs-panel w-[400px] max-h-[80vh] flex flex-col relative">
            <button 
              className="absolute top-2 right-2 w-6 h-6 bg-red-900 border border-red-500 text-white flex items-center justify-center hover:bg-red-800"
              onClick={() => {
                setShowHerbloreUI(false);
                engineRef.current?.playSound('interface_close');
              }}
            >
              X
            </button>
            <div className="p-4 h-full overflow-hidden">
              <HerbloreTab 
                inventory={gameState.inventory || []}
                herbloreLevel={gameState.playerSkills?.herblore?.level || 1}
                makePotion={(herbId, secondaryId) => engineRef.current?.makePotion(herbId, secondaryId)}
                addMessage={(msg) => engineRef.current?.addMessage(msg)}
                setActiveTooltip={setActiveTooltip}
              />
            </div>
          </div>
        </div>
      )}

      {showMagicUI && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 pointer-events-auto">
          <div className="osrs-panel w-[400px] max-h-[80vh] flex flex-col relative">
            <button 
              className="absolute top-2 right-2 w-6 h-6 bg-red-900 border border-red-500 text-white flex items-center justify-center hover:bg-red-800"
              onClick={() => {
                setShowMagicUI(false);
                engineRef.current?.playSound('interface_close');
              }}
            >
              X
            </button>
            <div className="p-4 h-full overflow-hidden">
              <MagicTab 
                inventory={gameState.inventory || []}
                magicLevel={gameState.playerSkills?.magic?.level || 1}
                castSpell={(spellId, targetIndex) => engineRef.current?.castSpell(spellId, targetIndex)}
                addMessage={(msg) => engineRef.current?.addMessage(msg)}
              />
            </div>
          </div>
        </div>
      )}

      {showConstructionUI && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 pointer-events-auto">
          <div className="osrs-panel w-[400px] max-h-[80vh] flex flex-col relative">
            <button 
              className="absolute top-2 right-2 w-6 h-6 bg-red-900 border border-red-500 text-white flex items-center justify-center hover:bg-red-800"
              onClick={() => {
                setShowConstructionUI(false);
                engineRef.current?.playSound('interface_close');
              }}
            >
              X
            </button>
            <div className="p-4 h-full overflow-hidden">
              <ConstructionTab 
                inventory={gameState.inventory || []} 
                constructionLevel={gameState.playerSkills?.construction?.level || 1} 
                pohUpgrades={gameState.pohUpgrades || []}
                buildUpgrade={(upgradeId) => engineRef.current?.buildUpgrade(upgradeId)} 
                addMessage={(msg) => engineRef.current?.addMessage(msg)} 
              />
            </div>
          </div>
        </div>
      )}

      {showQuests && (
        <QuestLogModal 
          onClose={() => setShowQuests(false)}
          quests={gameState.quests || []}
        />
      )}

      {showGrandExchange && (
        <GrandExchangeModal 
          onClose={() => setShowGrandExchange(false)}
          money={gameState.money}
          inventory={gameState.inventory || []}
          itemPriceMultipliers={gameState.itemPriceMultipliers || {}}
          onBuy={(id, cost) => {
            const item = GE_CONSUMABLES.find(i => i.id === id);
            if (item) {
              if (item.type === 'potion') engineRef.current?.buyPotion(id as any, cost);
              else engineRef.current?.buyItem(item);
            }
          }}
          onSell={(index) => engineRef.current?.sellItem(index)}
        />
      )}

      {showEssenceShop && (
        <EssenceShopModal
          onClose={() => setShowEssenceShop(false)}
          runeEssence={runeEssence}
          upgrades={upgrades}
          buyUpgrade={buyUpgrade}
          questsCompleted={(gameState.quests || []).filter((q: any) => q.completed).length}
          slayerTasksCompleted={gameState.consecutiveTasks || 0}
          maxWave={gameState.wave}
          achievementPoints={gameState.achievementPoints || 0}
        />
      )}

      {showAchievements && (
        <AchievementsModal 
          onClose={() => setShowAchievements(false)}
          achievements={gameState.achievements || []}
        />
      )}

      {rightClickedEntity && (
        <RightClickModal 
          entity={rightClickedEntity}
          onClose={() => setRightClickedEntity(null)}
        />
      )}

      {gameState.selectedPlacedTower && (
        <SelectedTowerModal 
          tower={gameState.selectedPlacedTower}
          onClose={() => setSelectedPlacedTower(null)}
          onUpgrade={handleUpgrade}
          onSell={handleSell}
          onSetTargetingPriority={(p) => {
            engineRef.current?.setTargetingPriority(gameState.selectedPlacedTower!.id, p as any);
            const updated = engineRef.current?.towers.find((t: any) => t.id === gameState.selectedPlacedTower!.id);
            if (updated) setSelectedPlacedTower({ ...updated });
          }}
          onUnequip={(towerId, slot) => { engineRef.current?.unequipItem(towerId, slot as any); refreshSelectedTower(towerId); }}
          onSetArcherStyle={(towerId, style) => { engineRef.current?.setArcherStyle(towerId, style as any); refreshSelectedTower(towerId); }}
          onSetMageMode={(towerId, mode) => { engineRef.current?.setMageMode(towerId, mode as any); refreshSelectedTower(towerId); }}
          onSetMageElement={(towerId, elem) => { engineRef.current?.setMageElement(towerId, elem as any); refreshSelectedTower(towerId); }}
          onSetAncientType={(towerId, type) => { engineRef.current?.setAncientType(towerId, type as any); refreshSelectedTower(towerId); }}
          money={gameState.money}
          towerCostReduction={upgrades.towerCostReduction}
        />
      )}

      {/* Tooltips */}
      <EntityTooltip hoveredEntity={hoveredEntity} tooltipPos={tooltipPos} />
      
      {activeTooltip && (
        <TowerTooltip 
          activeTooltip={activeTooltip}
        />
      )}

      {gameState.gameOver && (
        <GameOverModal 
          wave={gameState.wave}
          money={gameState.money}
          essence={runeEssence}
          onRestart={handleRestart}
        />
      )}
    </div>
  );
}
