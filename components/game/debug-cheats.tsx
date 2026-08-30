'use client';

import React, { useEffect, useMemo, useState } from 'react';
import type { GameEngine } from '@/lib/game/core/engine';
import { ENEMIES } from '@/lib/game/data/enemies';
import type { EnemyType } from '@/lib/game/types';
import { ALL_AFFIXES, AFFIX_DEFS, type EnemyAffix } from '@/lib/game/systems/affixes';
import { SCHEDULABLE_BOSSES } from '@/lib/game/systems/boss-mechanics';
import { styleSkillKey, MAX_TOWER_LEVEL } from '@/lib/game/systems/tower-xp';
import { TOWER_STYLES } from '@/lib/game/data/towers';

/** The slice of `UIState` the panel reads. It is handed the whole thing, but
 *  naming the fields keeps the table below honest about what it needs. */
export type DebugUi = {
  wave: number; money: number; lives: number; maxLives: number; waveActive: boolean;
  essence: number; slayerPoints: number; biomeName: string;
  selectedTowerId: string | null; lootBag: unknown[]; hunterLevel: number;
};

/** What every cheat group needs: the engine to call into, and the numbers to show. */
interface CheatProps {
  engineRef: React.RefObject<GameEngine | null>;
  ui: DebugUi;
}

/** The skills a *run* levels, as opposed to the account's meta-progression.
 *  Hunter is the only one so far. */
const RUN_SKILLS: ReadonlyArray<{
  key: 'hunter'; label: string; max: number; read: (ui: DebugUi) => number;
}> = [
  { key: 'hunter', label: 'Hunter', max: 99, read: (ui) => ui.hunterLevel },
];

function NumberRow({ label, value, onCommit, min = 0, max }: {
  label: string; value: number; onCommit: (n: number) => void; min?: number; max?: number;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => { setDraft(String(value)); }, [value]);
  const commit = () => {
    const n = Number(draft);
    if (!Number.isFinite(n)) return;
    onCommit(Math.min(max ?? Infinity, Math.max(min, Math.floor(n))));
  };
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[#cdbe91] text-[0.85em]">{label}</span>
      <span className="flex items-center gap-1">
        <input
          type="number"
          value={draft}
          min={min}
          max={max}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') commit(); }}
          className="w-[5.5em] bg-[#1a1712] border border-[#3a2f1d] rounded-[3px] px-[0.4em] py-[0.15em] text-osrs-yellow text-right text-[0.85em] outline-none focus:border-osrs-orange"
        />
        <button onClick={commit} className="rs-btn px-[0.5em] py-[0.2em] text-[0.75em]">Set</button>
      </span>
    </div>
  );
}

/** A pill in one of the wrapped pickers (enemies, affixes) — on or off. */
function PickPill({ on, label, title, onClick }: {
  on: boolean; label: string; title?: string; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`px-[0.4em] py-[0.15em] rounded-[3px] border text-[0.66em] capitalize ${on ? 'border-osrs-orange bg-osrs-orange/20 text-osrs-yellow' : 'border-[#3a2f1d] text-[#cdbe91] hover:border-[#6b5836]'}`}
    >
      {label}
    </button>
  );
}

/** The run's own counters: where you are, and what you have to spend. */
function RunCheats({ engineRef, ui }: CheatProps) {
  const eng = () => engineRef.current;
  return (
    <div className="rs-panel-inset p-[0.5em] space-y-[0.4em]">
      <NumberRow label="Wave" value={ui.wave} min={1} onCommit={(n) => eng()?.debugSetWave(n)} />
      <NumberRow label="Gold" value={ui.money} onCommit={(n) => eng()?.debugSetGold(n)} />
      <NumberRow label="Essence" value={ui.essence} onCommit={(n) => eng()?.debugSetEssence(n)} />
      <NumberRow label="Slayer pts" value={ui.slayerPoints} onCommit={(n) => eng()?.debugSetSlayerPoints(n)} />
      <NumberRow label="Lives" value={ui.lives} onCommit={(n) => eng()?.debugSetLives(n)} />
      {ui.waveActive && <p className="text-[0.66em] text-[#b3a585]">Wave editing is locked mid-wave.</p>}
    </div>
  );
}

/** The custom-wave picks, shared by both spawn blocks: an affixed spawn and a boss
 *  spawn both read the same roster and the same affix set. */
interface SpawnPicks {
  picked: Set<EnemyType>;
  togglePick: (t: EnemyType) => void;
  clearPicks: () => void;
  countEach: number;
  setCountEach: (n: number) => void;
  affixPick: Set<EnemyAffix>;
  toggleAffix: (a: EnemyAffix) => void;
}

/** Pick a roster, pick a count, put it on the board. */
function CustomWave({ engineRef, ui, picks }: CheatProps & { picks: SpawnPicks }) {
  // Declaration order in `ENEMIES` is meaningless to anyone hunting for one name in a
  // wrapped grid of forty. Sort by displayed name, and sink the bosses to the end so the
  // ordinary roster stays a contiguous block instead of being interleaved with them.
  const allEnemies = useMemo(() => {
    const rank = (t: EnemyType) => (ENEMIES[t].isBoss ? 1 : 0);
    return (Object.keys(ENEMIES) as EnemyType[]).sort(
      (a, b) => rank(a) - rank(b) || ENEMIES[a].name.localeCompare(ENEMIES[b].name),
    );
  }, []);
  const { picked, countEach } = picks;

  return (
    <div className="rs-panel-inset p-[0.5em]">
      <div className="text-[0.72em] text-osrs-orange uppercase tracking-wide mb-[0.4em]">Custom wave</div>
      <div className="flex flex-wrap gap-[0.25em] max-h-[9em] overflow-y-auto mb-[0.5em]">
        {allEnemies.map((t) => (
          <PickPill
            key={t}
            on={picked.has(t)}
            label={ENEMIES[t].name}
            title={ENEMIES[t].name}
            onClick={() => picks.togglePick(t)}
          />
        ))}
      </div>
      <div className="flex items-center justify-between gap-2 mb-[0.5em]">
        <NumberRow label="Count each" value={countEach} min={1} onCommit={picks.setCountEach} />
      </div>
      <div className="flex gap-[0.4em]">
        <button
          disabled={ui.waveActive || picked.size === 0}
          onClick={() => engineRef.current?.debugStartCustomWave([...picked], countEach)}
          className="rs-btn rs-btn-primary flex-1 py-[0.35em] text-[0.78em] disabled:opacity-50"
        >
          ▶ Spawn ({picked.size > 0 ? picked.size * countEach : 0})
        </button>
        <button onClick={picks.clearPicks} className="rs-btn px-[0.6em] py-[0.35em] text-[0.78em]">Clear</button>
      </div>
      {ui.waveActive && <p className="text-[0.66em] text-[#b3a585] mt-[0.4em]">Finish or clear the field first.</p>}
    </div>
  );
}

/** The same picks, wearing modifiers — or one boss, wearing them. */
function AffixesAndBosses({ engineRef, ui, picks }: CheatProps & { picks: SpawnPicks }) {
  const { picked, countEach, affixPick } = picks;
  return (
    <div className="rs-panel-inset p-[0.5em]">
      <div className="text-[0.72em] text-osrs-orange uppercase tracking-wide mb-[0.4em]">Affixes &amp; bosses</div>
      <div className="flex flex-wrap gap-[0.25em] mb-[0.5em]">
        {ALL_AFFIXES.map((a) => (
          <PickPill
            key={a}
            on={affixPick.has(a)}
            label={AFFIX_DEFS[a].name}
            title={AFFIX_DEFS[a].desc}
            onClick={() => picks.toggleAffix(a)}
          />
        ))}
      </div>
      <p className="text-[0.62em] text-[#b3a585] mb-[0.5em]">
        No affix selected = a random elite. Spawning applies the selected affixes to the
        Custom-wave picks above (or Goblins if none).
      </p>
      <button
        disabled={ui.waveActive}
        onClick={() => engineRef.current?.debugSpawnAffixed(picked.size ? [...picked] : ['goblin'], [...affixPick], countEach)}
        className="rs-btn rs-btn-primary w-full py-[0.35em] text-[0.78em] disabled:opacity-50 mb-[0.5em]"
      >
        ✦ Spawn affixed ({(picked.size || 1) * countEach})
      </button>
      <div className="text-[0.66em] text-[#cdbe91] mb-[0.3em]">Spawn boss (with selected modifiers):</div>
      {/* A grid, not a flex row: `flex-1` cannot shrink a button below its own
          label (min-width: auto), so seven bosses — "Alchemical Hydra" among
          them — pushed the row straight out of the panel. Fixed columns give
          each a width to be truncated into. */}
      <div className="grid grid-cols-3 gap-[0.4em]">
        {SCHEDULABLE_BOSSES.map((b) => (
          <button
            key={b}
            disabled={ui.waveActive}
            title={ENEMIES[b]?.name ?? b}
            onClick={() => engineRef.current?.debugSpawnBoss(b, [...affixPick])}
            className="rs-btn min-w-0 px-[0.3em] py-[0.35em] text-[0.72em] capitalize truncate disabled:opacity-50"
          >
            {ENEMIES[b]?.name ?? b}
          </button>
        ))}
      </div>
      {ui.waveActive && <p className="text-[0.66em] text-[#b3a585] mt-[0.4em]">Finish or clear the field first.</p>}
    </div>
  );
}

/** Everything that puts something on the board, and the switch that sweeps it off. */
function SpawnCheats({ engineRef, ui, picks }: CheatProps & { picks: SpawnPicks }) {
  return (
    <>
      <CustomWave engineRef={engineRef} ui={ui} picks={picks} />
      <AffixesAndBosses engineRef={engineRef} ui={ui} picks={picks} />
      <button
        onClick={() => engineRef.current?.debugClearEnemies()}
        className="rs-btn w-full py-[0.35em] text-[0.8em]"
      >
        ☠ Clear field (kill all enemies)
      </button>
    </>
  );
}

/** The skills the run itself levels. */
function LevelCheats({ engineRef, ui }: CheatProps) {
  return (
    <div className="rs-panel-inset p-[0.5em] space-y-[0.4em]">
      <div className="text-[0.72em] text-osrs-orange uppercase tracking-wide">Run skills</div>
      {/* One row per skill the run levels. Hunter is the only one today;
          the next one is a line in RUN_SKILLS, not a new panel. */}
      {RUN_SKILLS.map((sk) => (
        <NumberRow
          key={sk.key}
          label={sk.label}
          value={sk.read(ui)}
          min={1}
          max={sk.max}
          onCommit={(n) => engineRef.current?.debugSetSkillLevel(sk.key, n)}
        />
      ))}
      <p className="text-[0.66em] text-[#b3a585]">Setting a level clears the XP into it.</p>
    </div>
  );
}

/** Level and tier for whatever tower is selected on the map. */
function SelectedTowerCheats({ engineRef, ui }: CheatProps) {
  // Read the tower live off the engine, the way GameRoot does: the panel re-renders
  // on every emit, so the numbers below stay current without a UIState key of their own.
  const tower = ui.selectedTowerId
    ? engineRef.current?.towers.find((t) => t.id === ui.selectedTowerId) ?? null
    : null;
  return (
    <div className="rs-panel-inset p-[0.5em] space-y-[0.4em]">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[0.72em] text-osrs-orange uppercase tracking-wide">Selected tower</span>
        <span className="text-[0.74em] text-osrs-yellow truncate" title={tower?.name}>
          {tower?.name ?? '—'}
        </span>
      </div>
      {tower ? (
        <>
          <NumberRow
            label="Combat level"
            value={tower.skills[styleSkillKey(TOWER_STYLES[tower.type].style)].level}
            min={1}
            max={MAX_TOWER_LEVEL}
            onCommit={(n) => engineRef.current?.debugSetTowerLevel(tower.id, n)}
          />
          <NumberRow
            label="Tier"
            value={tower.level}
            min={1}
            max={tower.maxLevel}
            onCommit={(n) => engineRef.current?.debugSetTowerTier(tower.id, n)}
          />
          <p className="text-[0.66em] text-[#b3a585]">Tier is free here, and goes back down.</p>
        </>
      ) : (
        <p className="text-[0.66em] text-[#b3a585]">Click a tower on the map first.</p>
      )}
    </div>
  );
}

/** Reroll the road, or re-skin it. */
function MapCheats({ engineRef, ui }: CheatProps) {
  return (
    <div className="rs-panel-inset p-[0.5em] space-y-[0.4em]">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[0.72em] text-osrs-orange uppercase tracking-wide">Map</span>
        <span className="text-[0.74em] text-osrs-yellow truncate" title={ui.biomeName}>{ui.biomeName}</span>
      </div>
      <div className="flex gap-[0.4em]">
        <button
          disabled={ui.waveActive}
          onClick={() => engineRef.current?.debugRerollMap()}
          title="Roll a fresh road layout + biome (between waves only)"
          className="rs-btn flex-1 py-[0.35em] text-[0.78em] disabled:opacity-50"
        >
          🎲 Reroll map
        </button>
        <button
          onClick={() => engineRef.current?.debugCycleBiome()}
          title="Re-skin this layout with the next region's palette"
          className="rs-btn flex-1 py-[0.35em] text-[0.78em]"
        >
          🎨 Cycle biome
        </button>
      </div>
      {ui.waveActive && <p className="text-[0.66em] text-[#b3a585]">Reroll is locked mid-wave. Cycle biome is always safe.</p>}
    </div>
  );
}

/** The one-shot buttons. Two to a row: the labels are short, the panel is narrow,
 *  and every new tool used to make this column taller than the screen. */
function ToolButtons({ engineRef, ui }: CheatProps) {
  const eng = () => engineRef.current;
  const tools: { label: string; title: string; run: () => void }[] = [
    { label: '✦ Test unlock', title: 'Show the unlock popup with a stand-in reward', run: () => eng()?.debugTestUnlock() },
    { label: '📖 Seed log', title: 'Fill the Collection Log with sample kill counts', run: () => eng()?.debugSeedLog() },
    { label: '🎒 Give gear', title: 'Drop one of every Classic gear piece into the loot bag', run: () => eng()?.debugGiveGear() },
    { label: `🧹 Clear items (${ui.lootBag.length})`, title: 'Empty the loot bag (worn gear stays equipped)', run: () => eng()?.debugClearItems() },
  ];
  return (
    <div className="grid grid-cols-2 gap-[0.4em]">
      {tools.map((t) => (
        <button key={t.label} onClick={t.run} title={t.title} className="rs-btn py-[0.35em] text-[0.74em]">
          {t.label}
        </button>
      ))}
    </div>
  );
}

function ToolCheats(props: CheatProps) {
  return (
    <>
      <SelectedTowerCheats {...props} />
      <MapCheats {...props} />
      <ToolButtons {...props} />
    </>
  );
}

const CHEAT_TABS = ['run', 'spawn', 'levels', 'tools'] as const;
type CheatTab = (typeof CHEAT_TABS)[number];

/**
 * The Cheats tab: four groups behind four subtabs, because one column of every
 * cheat in the game grew taller than the screen.
 *
 * It stays mounted while the Bestiary is showing (hidden, not unmounted) so the
 * custom-wave roster a player just picked is still picked when they come back.
 */
export function CheatsTab({ engineRef, ui, active }: CheatProps & { active: boolean }) {
  const [tab, setTab] = useState<CheatTab>('run');
  const [picked, setPicked] = useState<Set<EnemyType>>(new Set());
  const [countEach, setCountEach] = useState(5);
  const [affixPick, setAffixPick] = useState<Set<EnemyAffix>>(new Set());

  const picks: SpawnPicks = {
    picked,
    togglePick: (t) => setPicked((prev) => {
      const n = new Set(prev);
      if (n.has(t)) n.delete(t); else n.add(t);
      return n;
    }),
    clearPicks: () => setPicked(new Set()),
    countEach,
    setCountEach,
    affixPick,
    toggleAffix: (a) => setAffixPick((prev) => {
      const n = new Set(prev);
      if (n.has(a)) n.delete(a); else n.add(a);
      return n;
    }),
  };

  return (
    <div className="space-y-[0.5em]" hidden={!active}>
      {/* Subcategories keep each group compact instead of one tall column. */}
      <div className="grid grid-cols-4 gap-[0.3em]">
        {CHEAT_TABS.map((ct) => (
          <button
            key={ct}
            onClick={() => setTab(ct)}
            className={`rs-btn py-[0.25em] text-[0.72em] capitalize ${tab === ct ? 'rs-btn-primary' : ''}`}
          >
            {ct}
          </button>
        ))}
      </div>

      {tab === 'run' && <RunCheats engineRef={engineRef} ui={ui} />}
      {tab === 'spawn' && <SpawnCheats engineRef={engineRef} ui={ui} picks={picks} />}
      {tab === 'levels' && <LevelCheats engineRef={engineRef} ui={ui} />}
      {tab === 'tools' && <ToolCheats engineRef={engineRef} ui={ui} />}
    </div>
  );
}
