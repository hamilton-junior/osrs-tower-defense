'use client';

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { GameEngine, GlobalUpgrades } from '@/lib/game/engine';
import { TOWERS as TOWER_DATA } from '@/lib/game/data/towers';
import { ENEMIES as ENEMY_DATA } from '@/lib/game/data/enemies';
import { PRAYERS as PRAYER_DATA } from '@/lib/game/data/prayers';
import { ITEMS as ITEM_DATA } from '@/lib/game/data/items';
import { GE_CONSUMABLES } from '@/lib/game/data/shop';

// UI Components
import { TopOverlay } from './game-ui/TopOverlay';
import { StatusSidebar } from './game-ui/StatusSidebar';
import { TowerSelectionGrid } from './game-ui/TowerSelectionGrid';
import { ActivePotionsDisplay } from './game-ui/ActivePotionsDisplay';
import { EntityTooltip } from './game-ui/EntityTooltip';
import { TowerTooltip } from './game-ui/TowerTooltip';
import { RightClickModal } from './game-ui/RightClickModal';
import { SelectedTowerModal } from './game-ui/SelectedTowerModal';
import { GrandExchangeModal } from './game-ui/GrandExchangeModal';
import { QuestLogModal } from './game-ui/QuestLogModal';
import { AchievementsModal } from './game-ui/AchievementsModal';
import { TowerControls } from './game-ui/TowerControls';

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
  ancientType?: string;
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
  prayerDrainRate?: number;
  activePotions?: any[];
  isPaused?: boolean;
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
    playerSkills: {
      mining: { level: 1, xp: 0 },
      woodcutting: { level: 1, xp: 0 },
      herblore: { level: 1, xp: 0 },
      crafting: { level: 1, xp: 0 },
      prayer: { level: 1, xp: 0 }
    }
  });

  const [activeTab, setActiveTab] = useState<'inventory' | 'quests' | 'achievements' | 'ge' | 'combat' | 'prayer' | 'herblore' | 'settings' | 'pets'>('inventory');
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

  const [showGrandExchange, setShowGrandExchange] = useState(false);
  const [geTab, setGeTab] = useState<'upgrades' | 'potions' | 'sell'>('upgrades');
  const [showAchievements, setShowAchievements] = useState(false);
  const [showQuests, setShowQuests] = useState(false);
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
    const savedEssence = localStorage.getItem('osrs_td_essence');
    if (savedEssence) setRuneEssence(parseInt(savedEssence));
    const savedUpgrades = localStorage.getItem('osrs_td_upgrades');
    if (savedUpgrades) setUpgrades(JSON.parse(savedUpgrades));
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

  const getLogicCoords = (clientX: number, clientY: number) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return { x: 0, y: 0 };
    const scaleX = (canvasRef.current?.width || 1200) / rect.width;
    const scaleY = (canvasRef.current?.height || 800) / rect.height;
    return { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY };
  };

  const buyUpgrade = useCallback((type: keyof GlobalUpgrades, cost: number, increment: number) => {
    const currentVal = upgrades[type];
    const limit = UPGRADE_LIMITS[type];
    const canUpgrade = increment > 0 ? currentVal < limit : currentVal > limit;
    if (runeEssence >= cost && canUpgrade) {
      engineRef.current?.playSound('sell');
      setRuneEssence((prev: number) => prev - cost);
      setUpgrades((prev: GlobalUpgrades) => ({
        ...prev,
        [type]: increment > 0 ? Math.min(prev[type] + increment, limit) : Math.max(prev[type] + increment, limit)
      }));
    } else {
      engineRef.current?.playSound('click');
    }
  }, [runeEssence, upgrades]);

  const handleCanvasClick = useCallback((e: React.MouseEvent) => {
    if (!engineRef.current) return;
    const { x, y } = getLogicCoords(e.clientX, e.clientY);
    if (engineRef.current.collectLootAt(x, y)) return;

    const patch = engineRef.current.farmingPatches.find((p: any) => x >= p.x - 20 && x <= p.x + 20 && y >= p.y - 20 && y <= p.y + 20);
    if (patch) {
      if (patch.stage === patch.maxStage) engineRef.current.harvestPatch(patch.id);
      else if (patch.stage === 0) {
        const seed = engineRef.current.inventory.find((i: any) => i.type === 'seed');
        if (seed) engineRef.current.plantSeed(patch.id, seed);
        else engineRef.current.addMessage("You need seeds to plant here.");
      } else engineRef.current.addMessage("This patch is growing.");
      return;
    }

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
    const entity = engineRef.current.getEntityAt(x, y);
    if (entity) {
      setHoveredEntity(entity);
      setTooltipPos({ x: e.clientX, y: e.clientY });
      engineRef.current.hoveredEntityId = entity.data.id;
    } else {
      setHoveredEntity(null);
      engineRef.current.hoveredEntityId = null;
    }
  }, []);

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
    if (engineRef.current && gameState.selectedPlacedTower) {
      engineRef.current.playSound('click');
      engineRef.current.equipItem(gameState.selectedPlacedTower.id, itemId);
      const updatedTower = engineRef.current.towers.find((t: any) => t.id === gameState.selectedPlacedTower!.id);
      if (updatedTower) setSelectedPlacedTower({ ...updatedTower });
    } else {
      engineRef.current?.playSound('click');
    }
  }, [gameState.selectedPlacedTower, setSelectedPlacedTower]);

  const handleSetWave = useCallback((wave: number) => {
    engineRef.current?.setWave(wave);
  }, []);

  const handleSetGold = useCallback((gold: number) => {
    engineRef.current?.setGold(gold);
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

  return (
    <div className="relative w-full h-full flex flex-col overflow-hidden bg-[#000] select-none text-base">
      {/* Canvas */}
      <canvas 
        ref={canvasRef}
        className="absolute inset-0 block cursor-crosshair touch-none w-full h-full z-0 image-pixelated"
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
          handleSpecialAttack={handleSpecialAttack}
          handleEquipItem={handleEquipItem}
          setShowAchievements={setShowAchievements}
          setGameSpeed={setGameSpeed}
          handleStartWave={handleStartWave}
          handlePauseResume={() => setIsPaused(!isPaused)}
          setAutoSpawn={setAutoSpawn}
          togglePrayer={(id) => engineRef.current?.togglePrayer(id as any)}
          setShowQuestLog={setShowQuests}
          setShowGE={setShowGrandExchange}
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
        />
      </div>

      {/* Selection Grid */}
      <TowerSelectionGrid 
        selectedTower={gameState.selectedTower || null}
        setSelectedTower={setSelectedTower}
        setSelectedPlacedTower={setSelectedPlacedTower}
        money={gameState.money}
        setActiveTooltip={setActiveTooltip}
      />

      {/* Active Buffs */}
      <ActivePotionsDisplay activePotions={gameState.activePotions || []} />

      {/* Modals */}
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
          onBuy={(id, cost) => engineRef.current?.buyPotion(id as any, cost)}
          onSell={(index) => engineRef.current?.sellItem(index)}
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
          onUnequip={(towerId, slot) => engineRef.current?.unequipItem(towerId, slot as any)}
          onSetArcherStyle={(towerId, style) => engineRef.current?.setArcherStyle(towerId, style as any)}
          onSetMageMode={(towerId, mode) => engineRef.current?.setMageMode(towerId, mode as any)}
          onSetMageElement={(towerId, elem) => engineRef.current?.setMageElement(towerId, elem as any)}
          onSetAncientType={(towerId, type) => engineRef.current?.setAncientType(towerId, type as any)}
          money={gameState.money}
        />
      )}

      {/* Tooltips */}
      <EntityTooltip hoveredEntity={hoveredEntity} tooltipPos={tooltipPos} />
      
      {activeTooltip && (
        <TowerTooltip 
          activeTooltip={activeTooltip}
        />
      )}
    </div>
  );
}
