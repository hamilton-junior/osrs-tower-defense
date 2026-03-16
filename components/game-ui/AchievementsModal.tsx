
import React from 'react';
import { ASSETS } from '@/lib/game/assets';

interface AchievementsModalProps {
  achievements: any[];
  onClose: () => void;
}

export const AchievementsModal: React.FC<AchievementsModalProps> = ({ achievements, onClose }) => {
  return (
    <div className="absolute inset-0 bg-black/80 flex items-center justify-center z-50 p-6 pointer-events-auto">
      <div className="osrs-window w-full max-w-xl shadow-[0_0_30px_rgba(0,0,0,0.8)]">
        <div className="osrs-window-title px-4 py-2 flex justify-between items-center bg-[#5d5245]">
          <h2 className="text-osrs-yellow font-bold text-lg tracking-widest uppercase">Achievement Diary</h2>
          <button onClick={onClose} className="text-osrs-red font-bold text-xl hover:text-white transition-colors">X</button>
        </div>
        <div 
          className="p-6 min-h-[400px]"
          style={{ backgroundImage: `url(${ASSETS.misc.background_pattern})`, backgroundRepeat: 'repeat' }}
        >
          <div className="grid grid-cols-1 gap-3">
            {achievements.map((a) => (
              <div key={a.id} className={`p-3 border-2 transition-all flex justify-between items-center ${a.completed ? 'bg-osrs-green/10 border-osrs-green/50' : 'bg-black/20 border-[var(--osrs-border-dark)]'}`}>
                <div className="flex gap-4 items-center">
                  <div className={`w-10 h-10 rounded flex items-center justify-center text-xl ${a.completed ? 'grayscale-0' : 'grayscale text-white/20'}`}>🏆</div>
                  <div>
                    <h3 className={`font-bold text-sm ${a.completed ? 'text-osrs-orange' : 'text-[#808080]'}`}>{a.name}</h3>
                    <p className="text-[10px] text-[#c0c0c0] leading-tight">{a.description}</p>
                  </div>
                </div>
                {a.completed && <span className="text-osrs-green font-bold text-xs uppercase tracking-tighter">Completed</span>}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
