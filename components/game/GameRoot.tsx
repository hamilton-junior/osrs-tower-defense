'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { GameEngine, type UIState } from '@/lib/game/core/engine';
import { TOWERS } from '@/lib/game/data/towers';
import { ASSETS } from '@/lib/game/assets';
import type { TowerType } from '@/lib/game/types';

const TOWER_ORDER: TowerType[] = ['archer', 'wizard', 'cannon', 'tzhaar', 'slayer', 'toxic'];
const PRIORITY_LABELS = { first: '1st', last: 'Last', strongest: 'Str', weakest: 'Weak', closest: 'Near' } as const;
const towerIcon = (type: TowerType) => (ASSETS.towers as Record<string, Record<number, string>>)[type]?.[1];

/** Attack type per tower, for the damage icon/label in the stats panel. */
const TOWER_COMBAT: Record<TowerType, { icon: string; label: string }> = {
  archer: { icon: ASSETS.misc.ranged_icon, label: 'Ranged' },
  wizard: { icon: ASSETS.misc.magic_icon, label: 'Magic' },
  cannon: { icon: ASSETS.misc.ranged_icon, label: 'Ranged' },
  tzhaar: { icon: ASSETS.misc.strength_icon, label: 'Melee' },
  slayer: { icon: ASSETS.misc.strength_icon, label: 'Melee' },
  toxic: { icon: ASSETS.misc.ranged_icon, label: 'Ranged' },
};

const TICK_MS = 600; // OSRS game tick = 0.6s
const TILE_PX = 32; // grid tile size in logic px (mirrors engine GRID)

/** "3 ticks (1.8s)" from a cooldown in ms. */
const attackSpeed = (cooldownMs: number) => {
  const ticks = Math.max(1, Math.round(cooldownMs / TICK_MS));
  return `${ticks} ${ticks === 1 ? 'tick' : 'ticks'} (${(cooldownMs / 1000).toFixed(1)}s)`;
};

const INITIAL: UIState = {
  money: 200, lives: 20, maxLives: 20, wave: 1, waveActive: false,
  remaining: 0, gameOver: false, selectedTowerType: null, selectedTowerId: null,
  movingTowerId: null, gameSpeed: 1, muted: false, volume: 0.18,
};

const fmt = (n: number) => (n >= 10000 ? `${Math.floor(n / 1000)}k` : n.toLocaleString());

export default function GameRoot() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const [ui, setUi] = useState<UIState>(INITIAL);
  const [banner, setBanner] = useState<string | null>(null);
  const prevWaveActive = useRef(false);

  useEffect(() => {
    if (!canvasRef.current) return;
    const engine = new GameEngine(canvasRef.current, (patch) => setUi((prev) => ({ ...prev, ...patch })));
    engineRef.current = engine;
    engine.resize();
    engine.start();
    const onResize = () => engine.resize();
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      engine.stop();
      engineRef.current = null;
    };
  }, []);

  // Flash a "Wave N" banner when a wave begins.
  useEffect(() => {
    if (ui.waveActive && !prevWaveActive.current) {
      setBanner(`Wave ${ui.wave}`);
      const t = setTimeout(() => setBanner(null), 1600);
      prevWaveActive.current = ui.waveActive;
      return () => clearTimeout(t);
    }
    prevWaveActive.current = ui.waveActive;
  }, [ui.waveActive, ui.wave]);

  const toLogic = useCallback((clientX: number, clientY: number) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    const engine = engineRef.current;
    if (!rect || rect.width === 0 || !engine) return { x: 0, y: 0 };
    return {
      x: ((clientX - rect.left) / rect.width) * engine.width,
      y: ((clientY - rect.top) / rect.height) * engine.height,
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
    engineRef.current?.cancelAction();
  }, []);

  const selectedTower = ui.selectedTowerId
    ? engineRef.current?.towers.find((t) => t.id === ui.selectedTowerId) ?? null
    : null;
  const moving = !!ui.movingTowerId;
  const moveCost = selectedTower ? engineRef.current?.moveTowerCost(selectedTower) ?? 0 : 0;
  const sellValue = selectedTower ? engineRef.current?.sellValue(selectedTower) ?? 0 : 0;

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

      {/* Wave-start banner */}
      {banner && (
        <div className="rs-wave-banner absolute left-1/2 top-[12%] -translate-x-1/2 z-20 pointer-events-none">
          {banner}
        </div>
      )}

      {/* Top-right data-orb cluster (OSRS minimap-orb style) */}
      <div className="absolute top-4 right-4 flex flex-col gap-2 z-10 items-end">
        <Orb
          icon={ASSETS.misc.hp_icon}
          title="Lives"
          value={ui.lives}
          valueColor={ui.lives <= 5 ? '#ff4b4b' : undefined}
          fill={ui.lives / ui.maxLives}
          fillColor="linear-gradient(180deg, #e23a3a, #8a0000)"
        />
        <Orb
          icon={ASSETS.misc.coins_icon}
          title="Gold"
          value={fmt(ui.money)}
          fill={1}
          fillColor="linear-gradient(180deg, #ecc63c, #957a10)"
        />
        <Orb
          icon={ASSETS.misc.attack_icon}
          title="Wave"
          value={ui.wave}
          fill={1}
          fillColor="linear-gradient(180deg, #3ac0c0, #0a6b6b)"
        />
      </div>

      {/* Selected tower panel (top-left) */}
      {selectedTower && (
        <div
          className="rs-panel absolute top-4 left-4 p-3 z-10 w-[17em]"
          style={{ fontSize: 'clamp(13px, 0.92vw, 19px)' }}
        >
          <div className="rs-panel-title flex items-center gap-2" style={{ fontSize: '1.05em' }}>
            {towerIcon(selectedTower.type) && (
              <img src={towerIcon(selectedTower.type)} alt="" className="w-[1.4em] h-[1.4em] object-contain" />
            )}
            <span className="truncate">{selectedTower.name}</span>
          </div>

          <div className="space-y-[0.4em] px-[0.2em] mt-[0.5em]">
            <Stat
              icon={TOWER_COMBAT[selectedTower.type].icon}
              label={`Damage (${TOWER_COMBAT[selectedTower.type].label})`}
              value={
                selectedTower.type === 'cannon' && selectedTower.maxDamage != null
                  ? `${selectedTower.minDamage ?? 0}–${selectedTower.maxDamage}`
                  : selectedTower.damage
              }
            />
            <Stat icon={ASSETS.misc.attack_icon} label="Attack speed" value={attackSpeed(selectedTower.cooldown)} />
            <Stat label="Range" value={`${Math.round(selectedTower.range / TILE_PX)} tiles`} />
            <Stat label="Level" value={`${selectedTower.level}/${selectedTower.maxLevel}`} />
          </div>

          <div className="mt-[0.7em]">
            <div className="text-[0.72em] text-[#b7a98c] mb-[0.3em] px-[0.2em] uppercase tracking-wide">Target priority</div>
            <div className="grid grid-cols-5 gap-[0.3em]">
              {(['first', 'last', 'strongest', 'weakest', 'closest'] as const).map((p) => (
                <button
                  key={p}
                  title={p}
                  onClick={() => engineRef.current?.setTargetingPriority(selectedTower.id, p)}
                  className={`rs-btn px-0 py-[0.35em] text-[0.7em] ${selectedTower.targetingPriority === p ? 'rs-btn-primary' : ''}`}
                >
                  {PRIORITY_LABELS[p]}
                </button>
              ))}
            </div>
          </div>

          {moving ? (
            <div className="mt-[0.7em] text-center text-[0.8em] text-osrs-orange leading-snug">
              ▸ Click a tile to move here ({moveCost} gp)<br />
              <span className="text-[#b7a98c]">right‑click to cancel</span>
            </div>
          ) : (
            <div className="mt-[0.7em] space-y-[0.4em] text-[0.95em]">
              {selectedTower.level < selectedTower.maxLevel && (
                <button
                  className="rs-btn w-full flex items-center justify-center gap-[0.3em] px-[0.4em] py-[0.45em]"
                  title={`Upgrade to next tier for ${selectedTower.upgradeCost} gp`}
                  disabled={ui.money < selectedTower.upgradeCost}
                  onClick={() => engineRef.current?.upgradeTower(selectedTower.id)}
                >
                  <span className="text-[#5bd75b] font-bold">⬆</span>
                  Upgrade — {selectedTower.upgradeCost} gp
                </button>
              )}
              <div className="flex gap-[0.4em]">
                <button
                  className="rs-btn flex-1 flex items-center justify-center gap-[0.3em] px-[0.4em] py-[0.45em]"
                  title={`Move this tower for ${moveCost} gp`}
                  disabled={ui.money < moveCost}
                  onClick={() => engineRef.current?.beginMoveTower(selectedTower.id)}
                >
                  <span className="text-[#cdbe91]">✥</span> Move ({moveCost} gp)
                </button>
                <button
                  className="rs-btn flex-1 px-[0.4em] py-[0.45em]"
                  title={`Sell this tower for ${sellValue} gp (75% refund)`}
                  onClick={() => engineRef.current?.sellTower(selectedTower.id)}
                >
                  Sell ({sellValue} gp)
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Bottom-right interface panel: start wave + tower shop */}
      <div
        className="rs-panel absolute bottom-4 right-4 p-3 z-10 w-[24em]"
        style={{ fontSize: 'clamp(13px, 0.9vw, 18px)' }}
      >
        {!ui.gameOver && (
          ui.waveActive ? (
            <div className="text-center text-[0.95em] text-osrs-orange py-[0.4em]">
              ⚔ Wave {ui.wave} — {ui.remaining} enemies left
            </div>
          ) : (
            <button
              className="rs-btn rs-btn-primary w-full py-[0.5em] mb-[0.6em] text-[1.05em] animate-pulse"
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
        <p className="text-center text-[0.7em] text-[#b7a98c] mt-[0.5em]">
          Click a tower, then click the map to place · right‑click to cancel
        </p>
      </div>

      {/* Speed + sound control (bottom-left) */}
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
        <button
          onClick={() => engineRef.current?.toggleMute()}
          title={ui.muted ? 'Unmute' : 'Mute'}
          className="rs-btn px-2 py-1 text-xs ml-1"
        >
          {ui.muted ? '🔇' : '🔊'}
        </button>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={ui.muted ? 0 : ui.volume}
          onChange={(e) => engineRef.current?.setVolume(Number(e.target.value))}
          title={`Volume ${Math.round(ui.volume * 100)}%`}
          className="rs-volume ml-1 w-20"
          aria-label="Volume"
        />
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

function Orb({ icon, title, value, valueColor, fill, fillColor }: {
  icon?: string;
  title: string;
  value: React.ReactNode;
  valueColor?: string;
  fill: number;
  fillColor: string;
}) {
  const pct = Math.max(0, Math.min(1, fill)) * 100;
  return (
    <div className="rs-orb" title={title}>
      <span className="rs-orb-value" style={valueColor ? { color: valueColor } : undefined}>{value}</span>
      <div className="rs-orb-sphere">
        <div className="rs-orb-fill" style={{ height: `${pct}%`, background: fillColor }} />
        <div className="rs-orb-gloss" />
        {icon && <img src={icon} alt="" className="rs-orb-icon" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />}
      </div>
    </div>
  );
}

function Stat({ icon, label, value }: { icon?: string; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="flex items-center gap-[0.4em] text-[#cdbe91]">
        {icon && (
          <img src={icon} alt="" className="w-[1.2em] h-[1.2em] object-contain" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
        )}
        {label}
      </span>
      <span className="text-osrs-yellow font-bold whitespace-nowrap">{value}</span>
    </div>
  );
}
