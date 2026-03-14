
import React from 'react';

interface SpecialAttackBarProps {
  specialAttackCharge: number;
  handleSpecialAttack: () => void;
}

export const SpecialAttackBar: React.FC<SpecialAttackBarProps> = ({ 
  specialAttackCharge, 
  handleSpecialAttack 
}) => {
  return (
    <div className="px-2 pt-2 pb-1 border-b border-[var(--osrs-border-light)] bg-black/20">
      <div 
        className="h-5 bg-black border border-[var(--osrs-border-light)] relative rounded overflow-hidden group cursor-pointer" 
        onClick={handleSpecialAttack}
      >
        <div 
          className="h-full bg-gradient-to-r from-[#104e10] via-[#1e8e1e] to-[#2ecc2e]" 
          style={{ width: `${Math.min(100, specialAttackCharge || 0)}%` }} 
        />
        <div className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-white uppercase drop-shadow-md">
          Special Attack: {Math.floor(specialAttackCharge || 0)}%
        </div>
      </div>
    </div>
  );
};
