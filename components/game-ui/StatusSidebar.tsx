
import React from 'react';
import { InventoryTab } from './InventoryTab';
import { SkillsTab } from './SkillsTab';
import { CombatTab } from './CombatTab';
import { PrayerTab } from './PrayerTab';
import { PetTab } from './PetTab';
import { QuestTab } from './QuestTab';
import { SettingsTab } from './SettingsTab';
import { SpecialAttackBar } from './SpecialAttackBar';

interface StatusSidebarProps {
  playerHP: number;
  playerMaxHP: number;
  specialAttackCharge: number;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  isSidebarCollapsed: boolean;
  
  // Tab Props
  inventory: any[];
  playerSkills: Record<string, any>;
  gameSpeed: number;
  isPlaying: boolean;
  isPaused: boolean;
  autoSpawn: boolean;
  slayerTask: any | null;
  prayerPoints: number;
  maxPrayerPoints: number;
  prayerDrainRate: number;
  allPrayers: any[];
  activePrayers: Set<string>;
  herbloreLevel: number;
  questPoints: number;
  quests: any[];
  currentRegion: string;

  // Handlers
  handleSpecialAttack: () => void;
  handleEquipItem: (itemId: string) => void;
  setShowAchievements: (show: boolean) => void;
  setGameSpeed: (speed: number) => void;
  handleStartWave: () => void;
  handlePauseResume: () => void;
  setAutoSpawn: (auto: boolean) => void;
  togglePrayer: (id: string) => void;
  setShowQuestLog: (show: boolean) => void;
  setShowGE: (show: boolean) => void;
  setShowEssenceShop: (show: boolean) => void;
  setIsSidebarCollapsed: (collapsed: boolean) => void;
  playSound: (sound: string) => void;
  addMessage: (msg: string) => void;
  resetGame: () => void;
  setActiveTooltip: (tooltip: any | null) => void;
  pets: any[];
  toggleDevMode: () => void;
  devMode: boolean;
  handleSetWave: (wave: number) => void;
  handleSetGold: (gold: number) => void;
}

interface TabButtonProps {
  id: string;
  icon: string;
  label: string;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  playSound: (sound: string) => void;
  setActiveTooltip: (tooltip: any | null) => void;
}

const TabButton: React.FC<TabButtonProps> = React.memo(({ id, icon, label, activeTab, setActiveTab, playSound, setActiveTooltip }) => {
  const src = icon.startsWith('http') ? icon : `https://oldschool.runescape.wiki/images/${icon}.png`;
  return (
    <div 
      className={`osrs-tab p-1 flex items-center justify-center transition-all cursor-pointer ${activeTab === id ? 'active brightness-125 border-t-osrs-yellow' : 'opacity-70 hover:opacity-100'}`}
      onClick={() => {
        playSound('click');
        setActiveTab(id);
      }}
      onMouseEnter={(e) => setActiveTooltip({
        x: e.clientX, y: e.clientY - 40,
        title: label, content: `Click to switch to ${label} tab.`,
        color: '#ff981f'
      })}
      onMouseLeave={() => setActiveTooltip(null)}
    >
      <img 
        src={src} 
        className="w-5 h-5 object-contain" 
        alt={label} 
        onError={(e) => {
          const img = e.currentTarget;
          if (img.dataset.errored) return;
          img.dataset.errored = '1';
          img.style.opacity = '0.4';
        }}
      />
    </div>
  );
});

export const StatusSidebar: React.FC<StatusSidebarProps> = (props) => {
  const {
    playerHP, playerMaxHP, specialAttackCharge, activeTab, setActiveTab, isSidebarCollapsed,
    handleSpecialAttack, playSound, setActiveTooltip, setIsSidebarCollapsed
  } = props;

  return (
    <div className={`flex items-end pointer-events-auto transition-transform duration-500 shadow-2xl relative ${isSidebarCollapsed ? 'translate-y-[368px]' : ''}`}>
      {/* HP Bar (Left) - OLD STYLE */}
      <div 
        className="w-8 h-[300px] bg-[var(--osrs-brown)] border-2 border-[var(--osrs-border-dark)] relative overflow-hidden flex flex-col-reverse mr-1 cursor-help mb-0"
        onMouseEnter={(e) => setActiveTooltip({
          x: e.clientX, y: e.clientY,
          title: 'Hitpoints', content: `Current HP: ${Math.ceil(playerHP)} / ${playerMaxHP}`,
          color: '#ff0000'
        })}
        onMouseLeave={() => setActiveTooltip(null)}
      >
        <div className="absolute top-1 left-0 right-0 text-center z-10">
          <span className="text-[10px] text-white font-bold drop-shadow-md">{Math.ceil(playerHP)}</span>
        </div>
        <div className="absolute top-6 left-1/2 -translate-x-1/2 w-5 h-5 flex items-center justify-center">
          <img src="https://oldschool.runescape.wiki/images/Hitpoints_icon.png" alt="HP" className="w-full h-full object-contain" />
        </div>
        <div 
          className="w-full bg-[#ff0000] transition-all duration-500 border-t border-[#ff6666]" 
          style={{ height: `${Math.max(0, (playerHP / playerMaxHP) * 100)}%` }} 
        />
      </div>

      {/* Main Sidebar Panel */}
      <div className="flex flex-col w-[240px] h-[360px] osrs-panel relative overflow-visible flex-shrink-0">
        {/* Sidebar Toggle Button (At TOP) */}
        <button 
          onClick={() => {
            playSound('click');
            setIsSidebarCollapsed(!isSidebarCollapsed);
          }}
          className="w-full h-8 bg-[var(--osrs-brown)] border-2 border-b-0 border-[var(--osrs-border-dark)] flex items-center justify-center text-osrs-yellow hover:text-white transition-colors osrs-panel absolute -top-8 left-0 z-30"
          style={{ borderRadius: '8px 8px 0 0', boxShadow: '0 -4px 10px rgba(0,0,0,0.5)' }}
        >
          <span className="text-[10px] font-bold mr-2 tracking-widest">{isSidebarCollapsed ? 'SHOW UI' : 'HIDE UI'}</span>
          {isSidebarCollapsed ? '▲' : '▼'}
        </button>

        <SpecialAttackBar 
          specialAttackCharge={specialAttackCharge} 
          handleSpecialAttack={handleSpecialAttack} 
        />

        {/* Tab Content Area */}
        <div className="flex-1 p-3 bg-black/10 overflow-hidden text-[13px]">
          {activeTab === 'inventory' && (
            <InventoryTab 
              inventory={props.inventory} 
              handleEquipItem={props.handleEquipItem} 
              setActiveTooltip={props.setActiveTooltip} 
            />
          )}
          {activeTab === 'achievements' && (
            <SkillsTab 
              playerSkills={props.playerSkills} 
              setShowAchievements={props.setShowAchievements} 
              setActiveTooltip={props.setActiveTooltip} 
              playSound={props.playSound} 
            />
          )}
          {activeTab === 'combat' && (
            <CombatTab 
              gameSpeed={props.gameSpeed} 
              isPlaying={props.isPlaying} 
              isPaused={props.isPaused} 
              autoSpawn={props.autoSpawn} 
              slayerTask={props.slayerTask}
              setGameSpeed={props.setGameSpeed}
              handleStartWave={props.handleStartWave}
              handlePauseResume={props.handlePauseResume}
              setAutoSpawn={props.setAutoSpawn}
              playSound={props.playSound} 
            />
          )}
          {activeTab === 'prayer' && (
            <PrayerTab 
              prayerPoints={props.prayerPoints} 
              maxPrayerPoints={props.maxPrayerPoints} 
              prayerDrainRate={props.prayerDrainRate}
              playerSkills={props.playerSkills}
              allPrayers={props.allPrayers}
              activePrayers={props.activePrayers}
              togglePrayer={props.togglePrayer}
              setActiveTooltip={props.setActiveTooltip} 
            />
          )}
          {activeTab === 'pets' && (
            <PetTab 
              pets={props.pets} 
              setActiveTooltip={props.setActiveTooltip} 
              playSound={props.playSound} 
            />
          )}
          {activeTab === 'quests' && (
            <QuestTab 
              questPoints={props.questPoints} 
              quests={props.quests} 
              setShowQuestLog={props.setShowQuestLog} 
              playSound={props.playSound} 
            />
          )}
          {activeTab === 'settings' && (
            <SettingsTab 
              isSidebarCollapsed={props.isSidebarCollapsed} 
              setIsSidebarCollapsed={props.setIsSidebarCollapsed} 
              playSound={props.playSound} 
              resetGame={props.resetGame} 
              toggleDevMode={props.toggleDevMode}
              devMode={props.devMode}
              handleSetWave={props.handleSetWave}
              handleSetGold={props.handleSetGold}
            />
          )}

          {activeTab === 'ge' && (
            <div className="flex flex-col items-center justify-center h-full gap-3">
              <div className="osrs-panel p-2 flex flex-col items-center gap-2 w-full shadow-inner bg-black/20">
                 <img src="https://oldschool.runescape.wiki/images/Grand_Exchange_logo.png" className="w-10 h-10 object-contain drop-shadow-md" alt="" />
                 <button onClick={() => {
                   props.playSound('interface_open');
                   props.setShowGE(true);
                 }} className="osrs-button w-full py-2 text-xs uppercase">Open Exchange</button>
              </div>
              <div className="osrs-panel p-2 flex flex-col items-center gap-2 w-full shadow-inner bg-black/20">
                 <img src="https://oldschool.runescape.wiki/images/Pure_essence_detail.png" className="w-10 h-10 object-contain drop-shadow-md" alt="" />
                 <button onClick={() => {
                   props.playSound('interface_open');
                   props.setShowEssenceShop(true);
                 }} className="osrs-button w-full py-2 text-xs uppercase text-[#00ffff]">Essence Shop</button>
              </div>
            </div>
          )}
        </div>

        {/* Tab Navigation */}
        <div className="grid grid-cols-8 gap-0 border-t border-[var(--osrs-border-dark)] bg-[var(--osrs-brown-dark)]">
          <TabButton id="combat" icon="Combat_icon" label="Combat" activeTab={activeTab} setActiveTab={setActiveTab} playSound={playSound} setActiveTooltip={setActiveTooltip} />
          <TabButton id="achievements" icon="Skills_icon" label="Achievements" activeTab={activeTab} setActiveTab={setActiveTab} playSound={playSound} setActiveTooltip={setActiveTooltip} />
          <TabButton id="quests" icon="https://oldschool.runescape.wiki/images/Quest_point_icon.png?dc356" label="Quests" activeTab={activeTab} setActiveTab={setActiveTab} playSound={playSound} setActiveTooltip={setActiveTooltip} />
          <TabButton id="inventory" icon="https://oldschool.runescape.wiki/images/Inventory.png?d4795" label="Inventory" activeTab={activeTab} setActiveTab={setActiveTab} playSound={playSound} setActiveTooltip={setActiveTooltip} />
          <TabButton id="ge" icon="Coins_detail" label="Exchange" activeTab={activeTab} setActiveTab={setActiveTab} playSound={playSound} setActiveTooltip={setActiveTooltip} />
          <TabButton id="prayer" icon="Prayer_icon" label="Prayer" activeTab={activeTab} setActiveTab={setActiveTab} playSound={playSound} setActiveTooltip={setActiveTooltip} />
          <TabButton id="pets" icon="https://oldschool.runescape.wiki/images/Follower_Details.png?15a47" label="Pets" activeTab={activeTab} setActiveTab={setActiveTab} playSound={playSound} setActiveTooltip={setActiveTooltip} />
          <TabButton id="settings" icon="Audio_options_icon" label="Settings" activeTab={activeTab} setActiveTab={setActiveTab} playSound={playSound} setActiveTooltip={setActiveTooltip} />
        </div>
      </div>

      {/* Prayer Bar (Right) - OLD STYLE */}
      <div 
        className="w-8 h-[300px] bg-[var(--osrs-brown)] border-2 border-[var(--osrs-border-dark)] relative overflow-hidden flex flex-col-reverse ml-1 cursor-help"
        onMouseEnter={(e) => setActiveTooltip({
          x: e.clientX, y: e.clientY,
          title: 'Prayer', content: `Current Prayer: ${Math.ceil(props.prayerPoints)} / ${props.maxPrayerPoints}`,
          color: '#3ab0ff'
        })}
        onMouseLeave={() => setActiveTooltip(null)}
      >
        <div className="absolute top-1 left-0 right-0 text-center z-10">
          <span className="text-[10px] text-white font-bold drop-shadow-md">{Math.ceil(props.prayerPoints)}</span>
        </div>
        <div className="absolute top-6 left-1/2 -translate-x-1/2 w-5 h-5 flex items-center justify-center">
          <img src="https://oldschool.runescape.wiki/images/Prayer_icon.png" alt="Prayer" className="w-full h-full object-contain" />
        </div>
        <div 
          className="w-full bg-[#3ab0ff] transition-all duration-500 border-t border-[#66ccff]" 
          style={{ height: `${Math.max(0, (props.prayerPoints / props.maxPrayerPoints) * 100)}%` }} 
        />
      </div>
    </div>
  );
};
