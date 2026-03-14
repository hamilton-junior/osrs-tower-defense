
import React from 'react';

interface QuestTabProps {
  questPoints: number;
  quests: any[];
  setShowQuestLog: (show: boolean) => void;
  playSound: (sound: string) => void;
}

export const QuestTab: React.FC<QuestTabProps> = ({ 
  questPoints, 
  quests, 
  setShowQuestLog, 
  playSound 
}) => {
  return (
    <div className="flex flex-col gap-2">
      <div className="text-center border-b border-[var(--osrs-border-light)] pb-1 mb-1">
        <span className="text-xs font-bold text-osrs-orange uppercase">Quest Journal</span>
      </div>
      <div className="bg-black/30 p-2 border border-[var(--osrs-border-dark)] text-center mb-2">
         <span className="text-osrs-red font-bold text-sm">Quest Points: {questPoints || 0}</span>
      </div>
      <div className="flex flex-col gap-1 overflow-y-auto max-h-[160px] custom-scrollbar italic">
        {quests.map((q: any) => (
          <div 
            key={q.id} 
            className={`text-xs p-1 cursor-pointer hover:bg-white/5 truncate transition-colors ${q.status === 'completed' ? 'text-osrs-green' : q.status === 'started' ? 'text-osrs-yellow' : 'text-osrs-red'}`}
            onClick={() => {
              playSound('interface_open');
              setShowQuestLog(true);
            }}
          >
            • {q.name}
          </div>
        ))}
      </div>
    </div>
  );
};
