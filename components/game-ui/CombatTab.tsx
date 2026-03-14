
import React from 'react';

interface CombatTabProps {
  gameSpeed: number;
  isPlaying: boolean;
  isPaused: boolean;
  autoSpawn: boolean;
  slayerTask: any | null;
  setGameSpeed: (speed: number) => void;
  handleStartWave: () => void;
  handlePauseResume: () => void;
  setAutoSpawn: (auto: boolean) => void;
  playSound: (sound: string) => void;
}

export const CombatTab: React.FC<CombatTabProps> = ({ 
  gameSpeed, 
  isPlaying, 
  isPaused, 
  autoSpawn, 
  slayerTask,
  setGameSpeed,
  handleStartWave,
  handlePauseResume,
  setAutoSpawn,
  playSound 
}) => {
  return (
    <div className="flex flex-col gap-3">
      <div className="text-center border-b border-[var(--osrs-border-light)] pb-1">
        <span className="text-xs font-bold text-osrs-orange uppercase tracking-widest">Combat Options</span>
      </div>
      <div className="grid grid-cols-3 gap-1">
        {[1, 2, 3].map(s => (
          <button 
            key={s} 
            onClick={() => {
              playSound('click');
              setGameSpeed(s);
            }} 
            className={`osrs-button text-[10px] py-1.5 ${gameSpeed === s ? 'brightness-125 border-white' : ''}`}
          >
            {s}x
          </button>
        ))}
      </div>
      <div className="flex flex-col gap-2">
        <button 
          onClick={handleStartWave} 
          disabled={isPlaying || isPaused} 
          className={`osrs-button py-2 text-xs uppercase ${!isPlaying && !isPaused ? 'pulse-yellow' : 'opacity-50'}`}
        >
          {isPlaying ? 'Wave In Progress' : 'Start Next Wave'}
        </button>
        <button 
          onClick={handlePauseResume} 
          className={`osrs-button py-2 text-xs uppercase font-bold ${isPaused ? 'text-osrs-yellow border-osrs-yellow' : 'text-[#c0c0c0]'}`}
        >
          {isPaused ? '▶ Resume' : '⏸ Pause'}
        </button>
        <button 
          onClick={() => {
            playSound('click');
            setAutoSpawn(!autoSpawn);
          }} 
          className={`osrs-button py-1.5 text-[10px] uppercase transition-all ${autoSpawn ? 'text-osrs-green border-osrs-green' : 'text-[#c0c0c0]'}`}
        >
          {autoSpawn ? 'Auto-Start: ON' : 'Auto-Start: OFF'}
        </button>
      </div>
      {slayerTask && (
        <div className="bg-black/40 border border-[var(--osrs-border-light)] p-2 rounded">
          <div className="text-[10px] text-osrs-orange font-bold uppercase mb-1">Current Task</div>
          <div className="text-xs text-osrs-yellow flex justify-between">
             <span className="capitalize">{slayerTask.type.replace('_',' ')}</span>
             <span className="font-mono">{slayerTask.count}</span>
          </div>
        </div>
      )}
    </div>
  );
};
