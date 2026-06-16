'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { GameEngine, LOGIC_WIDTH, LOGIC_HEIGHT, type UIState } from '@/lib/game/core/engine';
import { TOWERS } from '@/lib/game/data/towers';
import type { TowerType } from '@/lib/game/types';

const TOWER_ORDER: TowerType[] = ['archer', 'wizard', 'cannon', 'tzhaar', 'slayer', 'toxic'];

const INITIAL: UIState = {
  money: 200, lives: 20, wave: 1, waveActive: false,
  remaining: 0, gameOver: false, selectedTowerType: null, selectedTowerId: null,
};

export default function GameRoot() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const [ui, setUi] = useState<UIState>(INITIAL);

  useEffect(() => {
    if (!canvasRef.current) return;
    const engine = new GameEngine(canvasRef.current, (patch) => {
      setUi((prev) => ({ ...prev, ...patch }));
    });
    engineRef.current = engine;
    engine.start();
    return () => {
      engine.stop();
      engineRef.current = null;
    };
  }, []);

  const toLogic = useCallback((clientX: number, clientY: number) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return { x: 0, y: 0 };
    return {
      x: ((clientX - rect.left) / rect.width) * LOGIC_WIDTH,
      y: ((clientY - rect.top) / rect.height) * LOGIC_HEIGHT,
    };
  }, []);

  const onMove = useCallback((e: React.MouseEvent) => {
    const { x, y } = toLogic(e.clientX, e.clientY);
    engineRef.current?.setPointer(x, y);
  }, [toLogic]);

  const onClick = useCallback((e: React.MouseEvent) => {
    const { x, y } = toLogic(e.clientX, e.clientY);
    engineRef.current?.handleClick(x, y);
  }, [toLogic]);

  const onContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    engineRef.current?.selectTowerType(null);
  }, []);

  const selectedTower = ui.selectedTowerId
    ? engineRef.current?.towers.find((t) => t.id === ui.selectedTowerId) ?? null
    : null;

  return (
    <div className="relative w-full h-full overflow-hidden bg-black select-none font-osrs">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full block cursor-crosshair touch-none"
        style={{ imageRendering: 'pixelated' }}
        onMouseMove={onMove}
        onClick={onClick}
        onContextMenu={onContextMenu}
      />

      {/* Top HUD */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 flex gap-2 z-10">
        <Stat label="GP" value={ui.money} color="var(--osrs-yellow)" />
        <Stat label="Wave" value={ui.wave} color="var(--osrs-orange)" />
        <Stat label="Lives" value={ui.lives} color={ui.lives <= 5 ? 'var(--osrs-red)' : 'var(--osrs-green)'} />
        {ui.waveActive && <Stat label="Enemies" value={ui.remaining} color="#fff" />}
      </div>

      {/* Start wave */}
      {!ui.waveActive && !ui.gameOver && (
        <button
          className="osrs-button absolute top-3 right-3 px-4 py-2 z-10"
          onClick={() => engineRef.current?.startWave()}
        >
          ▶ Start Wave {ui.wave}
        </button>
      )}

      {/* Tower shop */}
      <div className="osrs-window absolute bottom-3 left-1/2 -translate-x-1/2 p-2 z-10">
        <div className="flex gap-2">
          {TOWER_ORDER.map((type) => {
            const cost = TOWERS[type].tiers[0].upgradeCost;
            const active = ui.selectedTowerType === type;
            const afford = ui.money >= cost;
            return (
              <button
                key={type}
                onClick={() => engineRef.current?.selectTowerType(active ? null : type)}
                disabled={!afford}
                className={`osrs-button flex flex-col items-center px-3 py-1 min-w-[84px] ${active ? 'ring-2 ring-[var(--osrs-orange)]' : ''} ${!afford ? 'opacity-50' : ''}`}
              >
                <span className="capitalize text-sm">{TOWERS[type].baseName}</span>
                <span className="text-xs" style={{ color: afford ? 'var(--osrs-yellow)' : 'var(--osrs-red)' }}>{cost} gp</span>
              </button>
            );
          })}
        </div>
        <p className="text-center text-[10px] text-[#c0c0c0] mt-1">
          Click a tower, then click the map to place · right‑click to cancel
        </p>
      </div>

      {/* Selected tower panel */}
      {selectedTower && (
        <div className="osrs-window absolute top-16 right-3 p-2 z-10 w-48">
          <div className="osrs-window-title mb-2"><span>{selectedTower.name}</span></div>
          <div className="text-xs space-y-1 px-1">
            <Row k="Level" v={`${selectedTower.level}/${selectedTower.maxLevel}`} />
            <Row k="Damage" v={selectedTower.damage} />
            <Row k="Range" v={Math.round(selectedTower.range)} />
          </div>
          <div className="flex gap-2 mt-2">
            {selectedTower.level < selectedTower.maxLevel && (
              <button
                className="osrs-button flex-1 px-2 py-1 text-xs"
                disabled={ui.money < selectedTower.upgradeCost}
                onClick={() => engineRef.current?.upgradeTower(selectedTower.id)}
              >
                Upgrade ({selectedTower.upgradeCost})
              </button>
            )}
            <button
              className="osrs-button px-2 py-1 text-xs"
              onClick={() => engineRef.current?.sellTower(selectedTower.id)}
            >
              Sell
            </button>
          </div>
        </div>
      )}

      {/* Game over */}
      {ui.gameOver && (
        <div className="absolute inset-0 bg-black/70 flex items-center justify-center z-20">
          <div className="osrs-window p-1 text-center w-80">
            <div className="osrs-window-title mb-3"><span>Game Over</span></div>
            <p className="text-lg text-osrs-yellow mb-4">You reached wave {ui.wave}.</p>
            <button className="osrs-button px-6 py-2 w-full" onClick={() => engineRef.current?.restart()}>
              Play Again
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="osrs-window px-3 py-1 flex items-center gap-2">
      <span className="text-xs text-[#c0c0c0] uppercase">{label}</span>
      <span className="text-lg" style={{ color }}>{value}</span>
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex justify-between">
      <span className="text-[#c0c0c0]">{k}</span>
      <span className="text-osrs-yellow">{v}</span>
    </div>
  );
}
