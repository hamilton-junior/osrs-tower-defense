
import React from 'react';

interface QuestLogModalProps {
  quests: any[];
  onClose: () => void;
}

export const QuestLogModal: React.FC<QuestLogModalProps> = ({ quests, onClose }) => {
  return (
    <div className="absolute inset-0 bg-black/80 flex items-center justify-center z-50 p-6 pointer-events-auto">
      <div className="osrs-window w-full max-w-lg shadow-[0_0_30px_rgba(0,0,0,0.8)]">
        <div className="osrs-window-title px-4 py-2 flex justify-between items-center bg-[#5d5245]">
          <h2 className="text-osrs-yellow font-bold text-lg tracking-widest uppercase">Quest Log</h2>
          <button onClick={onClose} className="text-osrs-red font-bold text-xl hover:text-white transition-colors">X</button>
        </div>
        <div className="p-6 bg-[url('https://oldschool.runescape.wiki/images/Back_pattern.png')] min-h-[400px]">
          <div className="space-y-4">
            {quests.map((q) => (
              <div key={q.id} className="border-b border-[var(--osrs-border-dark)] pb-3">
                <div className="flex justify-between items-center mb-1">
                  <h3 className={`font-bold text-sm ${q.status === 'completed' ? 'text-osrs-green' : 'text-osrs-yellow'}`}>{q.name}</h3>
                  <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded ${q.status === 'completed' ? 'bg-osrs-green/20' : 'bg-osrs-red/20 text-osrs-red'}`}>{q.status}</span>
                </div>
                <p className="text-[11px] text-[#c0c0c0] leading-tight italic">{q.description}</p>
                {q.status === 'completed' && q.rewards && (
                   <div className="mt-2 flex gap-2">
                      <span className="text-[9px] text-osrs-green font-bold uppercase">Rewards:</span>
                      <span className="text-[9px] text-white/70">{q.rewards}</span>
                   </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
