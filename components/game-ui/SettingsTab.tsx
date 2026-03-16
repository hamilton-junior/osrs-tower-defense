
import React from 'react';

interface SettingsTabProps {
  isSidebarCollapsed: boolean;
  setIsSidebarCollapsed: (collapsed: boolean) => void;
  playSound: (sound: string) => void;
  resetGame: () => void;
  toggleDevMode: () => void;
  devMode: boolean;
  handleSetWave: (wave: number) => void;
  handleSetGold: (gold: number) => void;
}

export const SettingsTab: React.FC<SettingsTabProps> = ({ 
  isSidebarCollapsed, 
  setIsSidebarCollapsed, 
  playSound, 
  resetGame,
  toggleDevMode,
  devMode,
  handleSetWave,
  handleSetGold
}) => {
  return (
    <div className="flex flex-col gap-3">
      <div className="text-center border-b border-[var(--osrs-border-light)] pb-1">
        <span className="text-xs font-bold text-osrs-orange uppercase">Settings</span>
      </div>
      
      <button 
        onClick={() => {
          playSound('click');
          toggleDevMode();
        }}
        className={`osrs-button w-full py-2 text-[10px] uppercase font-bold ${devMode ? 'text-osrs-green border-osrs-green' : 'text-osrs-red border-osrs-red'}`}
      >
        Dev Mode: {devMode ? 'ON' : 'OFF'}
      </button>

      {devMode && (
        <div className="flex flex-col gap-2 p-2 bg-red-900/20 border border-red-900/50 rounded">
          <p className="text-[9px] text-osrs-red font-bold uppercase text-center">Developer Tools</p>
          <p className="text-[9px] text-osrs-green text-center">🦴 Hover to pickup bones</p>
          <button 
            onClick={() => {
              if (confirm('Verify: Reset ALL progress?')) resetGame();
            }}
            className="osrs-button w-full py-1 text-[10px] uppercase"
          >
            Reset Progress
          </button>
          <div className="flex gap-1">
            <input 
              type="number" 
              placeholder="Wave" 
              className="w-1/2 bg-black border border-[var(--osrs-border-light)] text-white text-xs px-1"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const val = parseInt((e.target as HTMLInputElement).value);
                  if (!isNaN(val)) handleSetWave(val);
                }
              }}
            />
            <button 
              className="osrs-button w-1/2 py-1 text-[10px] uppercase"
              onClick={(e) => {
                 const input = (e.currentTarget.previousElementSibling as HTMLInputElement);
                 const val = parseInt(input.value);
                 if (!isNaN(val)) handleSetWave(val);
              }}
            >
              Set Wave
            </button>
          </div>
          <div className="flex gap-1">
            <input 
              type="number" 
              placeholder="Gold" 
              className="w-1/2 bg-black border border-[var(--osrs-border-light)] text-white text-xs px-1"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const val = parseInt((e.target as HTMLInputElement).value);
                  if (!isNaN(val)) handleSetGold(val);
                }
              }}
            />
            <button 
              className="osrs-button w-1/2 py-1 text-[10px] uppercase"
              onClick={(e) => {
                 const input = (e.currentTarget.previousElementSibling as HTMLInputElement);
                 const val = parseInt(input.value);
                 if (!isNaN(val)) handleSetGold(val);
              }}
            >
              Set Gold
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
