'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { GameEngine, LOGIC_WIDTH, LOGIC_HEIGHT, type UIState } from '@/lib/game/core/engine';
import { TOWERS } from '@/lib/game/data/towers';
import { ASSETS } from '@/lib/game/assets';
import type { TowerType } from '@/lib/game/types';

const TOWER_ORDER: TowerType[] = ['archer', 'wizard', 'cannon', 'tzhaar', 'slayer', 'toxic'];
const PRIORITY_LABELS = { first: '1st', last: 'Last', strongest: 'Str', weakest: 'Weak', closest: 'Near' } as const;
const towerIcon = (type: TowerType) => (ASSETS.towers as Record<string, Record<number, string>>)[type]?.[1];

const INITIAL: UIState = {
  money: 200, lives: 20, wave: 1, waveActive: false,
  remaining: 0, gameOver: false, selectedTowerType: null, selectedTowerId: null, gameSpeed: 1,
};

const fmt = (n: number) => (n >= 10000 ? `${Math.floor(n / 1000)}k` : n.toLocaleString());

export default function GameRoot() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const [ui, setUi] = useState<UIState>(INITIAL);

  useEffect(() => {
    if (!canvasRef.current) return;
    const engine = new GameEngine(canvasRef.current, (patch) => setUi((prev) => ({ ...prev, ...patch })));
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

      {/* Top-left orb cluster (OSRS minimap-orb style) */}
      <div className="absolute top-4 left-4 flex flex-col gap-3 z-10">
        <Orb icon={ASSETS.misc.hp_icon} label="HP" value={ui.lives} color={ui.lives <= 5 ? '#ff5b5b' : '#7CFC58'} />
        <Orb icon={ASSETS.misc.coins_icon} label="GP" value={fmt(ui.money)} color="#ffd000" />
        <Orb label="Wave" value={ui.wave} color="var(--osrs-orange)" />
      </div>

      {/* Selected tower panel (top-right) */}
      {selectedTower && (
        <div className="rs-panel absolute top-4 right-4 p-3 z-10 w-52">
          <div className="rs-panel-title">{selectedTower.name}</div>
          <div className="text-xs space-y-1 px-1">
            <Row k="Level" v={`${selectedTower.level}/${selectedTower.maxLevel}`} />
            <Row k="Damage" v={selectedTower.damage} />
            <Row k="Range" v={Math.round(selectedTower.range)} />
          </div>
          <div className="mt-3">
            <div className="text-[10px] text-[#b7a98c] mb-1 px-1 uppercase tracking-wide">Target priority</div>
            <div className="grid grid-cols-5 gap-1">
              {(['first', 'last', 'strongest', 'weakest', 'closest'] as const).map((p) => (
                <button
                  key={p}
                  title={p}
                  onClick={() => engineRef.current?.setTargetingPriority(selectedTower.id, p)}
                  className={`rs-btn text-[9px] px-0 py-1 ${selectedTower.targetingPriority === p ? 'rs-btn-primary' : ''}`}
                >
                  {PRIORITY_LABELS[p]}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-2 mt-3">
            {selectedTower.level < selectedTower.maxLevel && (
              <button
                className="rs-btn flex-1 px-2 py-1 text-xs"
                disabled={ui.money < selectedTower.upgradeCost}
                onClick={() => engineRef.current?.upgradeTower(selectedTower.id)}
              >
                Upgrade ({selectedTower.upgradeCost})
              </button>
            )}
            <button className="rs-btn px-2 py-1 text-xs" onClick={() => engineRef.current?.sellTower(selectedTower.id)}>
              Sell
            </button>
          </div>
        </div>
      )}

      {/* Bottom-right interface panel: start wave + tower shop */}
      <div className="rs-panel absolute bottom-4 right-4 p-3 z-10 w-[380px]">
        {!ui.gameOver && (
          ui.waveActive ? (
            <div className="text-center text-sm text-osrs-orange py-2">
              ⚔ Wave {ui.wave} — {ui.remaining} enemies left
            </div>
          ) : (
            <button
              className="rs-btn rs-btn-primary w-full py-2 mb-3 text-base animate-pulse"
              onClick={() => engineRef.current?.startWave()}
            >
              ▶ Start Wave {ui.wave}
            </button>
          )
        )}
        <div className="rs-panel-title">Towers</div>
        <div className="grid grid-cols-6 gap-2">
          {TOWER_ORDER.map((type) => {
            const cost = TOWERS[type].tiers[0].upgradeCost;
            const active = ui.selectedTowerType === type;
            const afford = ui.money >= cost;
            const icon = towerIcon(type);
            return (
              <button
                key={type}
                title={`${TOWERS[type].baseName} — ${cost} gp`}
                onClick={() => engineRef.current?.selectTowerType(active ? null : type)}
                disabled={!afford}
                className={`rs-slot ${active ? 'selected' : ''}`}
              >
                {icon ? (
                  <img src={icon} alt={TOWERS[type].baseName} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                ) : (
                  <span className="text-[10px] capitalize">{TOWERS[type].baseName}</span>
                )}
                <span className="rs-slot-cost" style={{ color: afford ? 'var(--osrs-yellow)' : 'var(--osrs-red)' }}>{cost}</span>
              </button>
            );
          })}
        </div>
        <p className="text-center text-[10px] text-[#b7a98c] mt-2">
          Click a tower, then click the map to place · right‑click to cancel
        </p>
      </div>

      {/* Speed control (bottom-left) */}
      <div className="rs-panel absolute bottom-4 left-4 p-2 z-10 flex items-center gap-1">
        <span className="text-[10px] text-[#b7a98c] mr-1 uppercase tracking-wide">Speed</span>
        {[1, 2, 5].map((s) => (
          <button
            key={s}
            onClick={() => engineRef.current?.setGameSpeed(s)}
            className={`rs-btn px-2 py-1 text-xs ${ui.gameSpeed === s ? 'rs-btn-primary' : ''}`}
          >
            {s}×
          </button>
        ))}
      </div>

      {/* Game over */}
      {ui.gameOver && (
        <div className="absolute inset-0 bg-black/70 flex items-center justify-center z-20">
          <div className="rs-panel p-6 text-center w-80">
            <div className="rs-panel-title text-base">Game Over</div>
            <p className="text-lg text-osrs-yellow my-4">You reached wave {ui.wave}.</p>
            <button className="rs-btn rs-btn-primary px-6 py-2 w-full" onClick={() => engineRef.current?.restart()}>
              Play Again
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Orb({ icon, label, value, color }: { icon?: string; label: string; value: React.ReactNode; color: string }) {
  return (
    <div className="flex flex-col items-center" title={label}>
      <div className="rs-orb" style={{ backgroundImage: `url(${ASSETS.misc.orb_background})` }}>
        {icon && (
          <img src={icon} alt="" className="rs-orb-badge" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
        )}
        <span className="rs-orb-value" style={{ color }}>{value}</span>
      </div>
      <span className="rs-orb-label">{label}</span>
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex justify-between">
      <span className="text-[#b7a98c]">{k}</span>
      <span className="text-osrs-yellow">{v}</span>
    </div>
  );
}
