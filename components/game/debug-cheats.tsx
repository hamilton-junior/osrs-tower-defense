'use client';

import React, { useEffect, useMemo, useState } from 'react';
import type { GameEngine } from '@/lib/game/core/engine';
import { ENEMIES } from '@/lib/game/data/enemies';
import type { EnemyType } from '@/lib/game/types';
import { ALL_AFFIXES, AFFIX_DEFS, type EnemyAffix } from '@/lib/game/systems/affixes';
import { SCHEDULABLE_BOSSES } from '@/lib/game/systems/boss-mechanics';
import { styleSkillKey, MAX_TOWER_LEVEL } from '@/lib/game/systems/tower-xp';
import { TOWER_STYLES } from '@/lib/game/data/towers';
import { DIVERSIONS, type DiversionMood } from '@/lib/game/data/diversions';
import { ASSETS, iconUrl } from '@/lib/game/assets';
import { hideBrokenImg } from './ui-kit';
import { enemySpriteStyle, diversionSpriteStyle } from './enemy-ui';
import { TOWER_COMBAT, towerIcon, towerTierIcon, wizardStaffUrl } from './tower-ui';

/** The slice of `UIState` the panel reads. It is handed the whole thing, but
 *  naming the fields keeps the table below honest about what it needs. */
export type DebugUi = {
  wave: number; money: number; lives: number; maxLives: number; waveActive: boolean;
  essence: number; slayerPoints: number; biomeName: string;
  selectedTowerId: string | null; lootBag: unknown[]; hunterLevel: number; herbloreLevel: number;
};

/** What every cheat tab needs: the engine to call into, and the numbers to show. */
export interface CheatProps {
  engineRef: React.RefObject<GameEngine | null>;
  ui: DebugUi;
}

// ─── Building blocks ────────────────────────────────────────────────────────
// The console borrows the game's own furniture instead of drawing its own: the
// patch panel's sunken card and grey notes, the Collection Log's small tiles, the
// number field of the Herblore bench. A cheat should look like the screen it tests.

/** A titled sunken card: the one frame every group of cheats sits in. */
export function DebugCard({ title, icon, aside, children }: {
  title: string; icon?: string; aside?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <div className="rs-panel-inset p-[0.55em] space-y-[0.45em]">
      <div className="flex items-center gap-[0.4em] min-w-0">
        {icon && <img src={icon} alt="" className="w-[1.2em] h-[1.2em] object-contain shrink-0" onError={hideBrokenImg} />}
        <span className="text-[0.82em] text-osrs-orange font-bold shrink-0">{title}</span>
        {aside != null && <span className="ml-auto min-w-0 truncate text-[0.68em] text-osrs-yellow">{aside}</span>}
      </div>
      {children}
    </div>
  );
}

/** The grey line under a control that says what it will and will not do. */
export function Note({ children }: { children: React.ReactNode }) {
  return <p className="text-[0.66em] text-[#b3a585] leading-snug">{children}</p>;
}

/** A small uppercase caption over a block of tiles. */
export function Caption({ children }: { children: React.ReactNode }) {
  return <div className="text-[0.62em] uppercase tracking-wide text-[#b3a585]">{children}</div>;
}

/** A wide button with its icon, the patch panel's Plant / Dig up shape. */
export function ActionButton({ label, icon, title, onClick, disabled, primary, className = '' }: {
  label: string; icon?: string; title?: string; onClick: () => void;
  disabled?: boolean; primary?: boolean; className?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`rs-btn ${primary ? 'rs-btn-primary' : ''} w-full min-w-0 px-[0.4em] py-[0.35em] text-[0.74em] flex items-center justify-center gap-[0.4em] ${className}`}
    >
      {icon && <img src={icon} alt="" className="w-[1.2em] h-[1.2em] object-contain shrink-0" onError={hideBrokenImg} />}
      <span className="truncate">{label}</span>
    </button>
  );
}

/** Five tiles to a row: the width the Collection Log's small tile was cut for. */
export function TileGrid({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`grid grid-cols-5 gap-[0.3em] ${className}`}>{children}</div>;
}

/** One pickable thing (a monster, an affix, a diversion) as a Collection Log tile.
 *  Sheets are drawn still: their walk loop is sized for the full 3.4em sprite, and
 *  forty walking goblins would say nothing a still one does not. */
export function PickTile({ name, sprite, img, foot, nameColor, picked, disabled, title, onClick }: {
  name: string;
  /** A baked sprite sheet, drawn as the tile's background. */
  sprite?: React.CSSProperties;
  /** A plain icon, for things with no sheet. Wins over `sprite`. */
  img?: string;
  foot?: React.ReactNode;
  nameColor?: string;
  picked?: boolean;
  disabled?: boolean;
  title?: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title ?? name}
      className={`rs-log-entry rs-log-sm w-full min-w-0 disabled:opacity-40 disabled:cursor-not-allowed ${picked ? 'rs-log-pick' : ''}`}
    >
      {img ? (
        <div className="rs-log-sprite">
          <img src={img} alt="" className="w-full h-full object-contain" style={{ imageRendering: 'pixelated' }} onError={hideBrokenImg} />
        </div>
      ) : (
        <div className="rs-log-sprite" style={sprite}>{sprite ? null : '?'}</div>
      )}
      <span className="rs-log-name" style={nameColor ? { color: nameColor } : undefined}>{name}</span>
      {foot != null && <span className="rs-log-kc">{foot}</span>}
    </button>
  );
}

/** Three cells of a `NumberGrid`: label, field, Set. Enter commits too. */
function NumberRow({ label, icon, value, onCommit, min = 0, max, disabled }: {
  label: string; icon?: string; value: number; onCommit: (n: number) => void;
  min?: number; max?: number; disabled?: boolean;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => { setDraft(String(value)); }, [value]);
  const commit = () => {
    const n = Number(draft);
    if (!Number.isFinite(n)) return;
    onCommit(Math.min(max ?? Infinity, Math.max(min, Math.floor(n))));
  };
  return (
    <>
      <span className="min-w-0 flex items-center gap-[0.35em] text-[0.7em] text-[#b3a585]">
        {icon && <img src={icon} alt="" className="w-[1.35em] h-[1.35em] object-contain shrink-0" onError={hideBrokenImg} />}
        <span className="truncate">{label}</span>
        {max != null && <span className="text-[#6b5f48] tabular-nums shrink-0">/ {max}</span>}
      </span>
      <input
        type="number"
        value={draft}
        min={min}
        max={max}
        disabled={disabled}
        aria-label={label}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') commit(); }}
        className="rs-num w-[6.5em] text-[0.74em] tabular-nums"
      />
      <button onClick={commit} disabled={disabled} className="rs-btn px-[0.55em] py-[0.1em] text-[0.7em]">Set</button>
    </>
  );
}

function NumberGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-[1fr_auto_auto] items-center gap-x-[0.4em] gap-y-[0.3em]">{children}</div>;
}

// ─── Run ────────────────────────────────────────────────────────────────────

/** The run's own counters: where you are, and what you have to spend. */
export function RunTab({ engineRef, ui }: CheatProps) {
  const eng = () => engineRef.current;
  return (
    <DebugCard title="Run" icon={ASSETS.misc.coins_icon} aside={`Wave ${ui.wave}`}>
      <NumberGrid>
        <NumberRow label="Wave" icon={ASSETS.misc.multicombat_icon} value={ui.wave} min={1} disabled={ui.waveActive} onCommit={(n) => eng()?.debugSetWave(n)} />
        <NumberRow label="Gold" icon={ASSETS.misc.coins_icon} value={ui.money} onCommit={(n) => eng()?.debugSetGold(n)} />
        <NumberRow label="Essence" icon={ASSETS.misc.rune_essence_icon} value={ui.essence} onCommit={(n) => eng()?.debugSetEssence(n)} />
        <NumberRow label="Slayer points" icon={ASSETS.misc.slayer_crossbow} value={ui.slayerPoints} onCommit={(n) => eng()?.debugSetSlayerPoints(n)} />
        <NumberRow label="Lives" icon={ASSETS.misc.hp_icon} value={ui.lives} onCommit={(n) => eng()?.debugSetLives(n)} />
      </NumberGrid>
      {ui.waveActive && <Note>The wave number is locked mid-wave.</Note>}
    </DebugCard>
  );
}

// ─── Spawn ──────────────────────────────────────────────────────────────────

/** The custom-wave picks, shared by every spawn card: an affixed spawn and a boss
 *  spawn both read the same roster and the same affix set. */
export interface SpawnPicks {
  picked: Set<EnemyType>;
  togglePick: (t: EnemyType) => void;
  clearPicks: () => void;
  countEach: number;
  setCountEach: (n: number) => void;
  affixPick: Set<EnemyAffix>;
  toggleAffix: (a: EnemyAffix) => void;
}

function toggled<T>(prev: Set<T>, v: T): Set<T> {
  const n = new Set(prev);
  if (n.has(v)) n.delete(v); else n.add(v);
  return n;
}

/** Held by the panel's shell, so a roster picked on Spawn is still picked after a
 *  trip to another tab. */
export function useSpawnPicks(): SpawnPicks {
  const [picked, setPicked] = useState<Set<EnemyType>>(new Set());
  const [countEach, setCountEach] = useState(5);
  const [affixPick, setAffixPick] = useState<Set<EnemyAffix>>(new Set());
  return {
    picked,
    togglePick: (t) => setPicked((prev) => toggled(prev, t)),
    clearPicks: () => setPicked(new Set()),
    countEach,
    setCountEach,
    affixPick,
    toggleAffix: (a) => setAffixPick((prev) => toggled(prev, a)),
  };
}

/** Pick a roster, pick a count, put it on the board. */
function CustomWaveCard({ engineRef, ui, picks }: CheatProps & { picks: SpawnPicks }) {
  // Declaration order in `ENEMIES` is meaningless to anyone hunting for one name in a
  // grid of forty. Sort by displayed name, and sink the bosses to the end so the
  // ordinary roster stays a contiguous block instead of being interleaved with them.
  const allEnemies = useMemo(() => {
    const rank = (t: EnemyType) => (ENEMIES[t].isBoss ? 1 : 0);
    return (Object.keys(ENEMIES) as EnemyType[]).sort(
      (a, b) => rank(a) - rank(b) || ENEMIES[a].name.localeCompare(ENEMIES[b].name),
    );
  }, []);
  const { picked, countEach } = picks;
  const total = picked.size * countEach;

  return (
    <DebugCard title="Custom wave" icon={ASSETS.misc.multicombat_icon} aside={picked.size > 0 ? `${picked.size} picked` : undefined}>
      <div className="max-h-[16.5em] overflow-y-auto custom-scrollbar pr-[0.2em]">
        <TileGrid>
          {allEnemies.map((t) => (
            <PickTile
              key={t}
              name={ENEMIES[t].name}
              sprite={enemySpriteStyle(t)}
              picked={picked.has(t)}
              foot={picked.has(t) ? `×${countEach}` : undefined}
              onClick={() => picks.togglePick(t)}
            />
          ))}
        </TileGrid>
      </div>
      <NumberGrid>
        <NumberRow label="Count each" value={countEach} min={1} onCommit={picks.setCountEach} />
      </NumberGrid>
      <div className="grid grid-cols-[2fr_1fr] gap-[0.35em]">
        <ActionButton
          primary
          label={`Spawn ${total}`}
          icon={ASSETS.misc.multicombat_icon}
          disabled={ui.waveActive || picked.size === 0}
          onClick={() => engineRef.current?.debugStartCustomWave([...picked], countEach)}
        />
        <ActionButton label="Clear picks" disabled={picked.size === 0} onClick={picks.clearPicks} />
      </div>
      {ui.waveActive && <Note>Finish or clear the field first.</Note>}
    </DebugCard>
  );
}

/** The same picks, wearing modifiers. */
function AffixCard({ engineRef, ui, picks }: CheatProps & { picks: SpawnPicks }) {
  const { picked, countEach, affixPick } = picks;
  return (
    <DebugCard title="Affixes" icon={AFFIX_DEFS.shielded.icon} aside={affixPick.size > 0 ? `${affixPick.size} picked` : 'Random'}>
      <TileGrid>
        {ALL_AFFIXES.map((a) => (
          <PickTile
            key={a}
            name={AFFIX_DEFS[a].name}
            img={AFFIX_DEFS[a].icon}
            nameColor={AFFIX_DEFS[a].color}
            title={AFFIX_DEFS[a].desc}
            picked={affixPick.has(a)}
            onClick={() => picks.toggleAffix(a)}
          />
        ))}
      </TileGrid>
      <Note>With none picked, each spawn rolls a random elite. Goblins stand in for an empty roster.</Note>
      <ActionButton
        primary
        label={`Spawn affixed ${(picked.size || 1) * countEach}`}
        icon={AFFIX_DEFS.shielded.icon}
        disabled={ui.waveActive}
        onClick={() => engineRef.current?.debugSpawnAffixed(picked.size ? [...picked] : ['goblin'], [...affixPick], countEach)}
      />
    </DebugCard>
  );
}

/** One boss at a time, wearing whatever affixes are picked above. */
function BossCard({ engineRef, ui, picks }: CheatProps & { picks: SpawnPicks }) {
  return (
    <DebugCard title="Bosses" icon={ASSETS.misc.bandos_symbol}>
      <TileGrid>
        {SCHEDULABLE_BOSSES.map((b) => (
          <PickTile
            key={b}
            name={ENEMIES[b]?.name ?? b}
            sprite={enemySpriteStyle(b)}
            disabled={ui.waveActive}
            title={`Spawn ${ENEMIES[b]?.name ?? b}`}
            onClick={() => engineRef.current?.debugSpawnBoss(b, [...picks.affixPick])}
          />
        ))}
      </TileGrid>
      <Note>A boss spawns with the affixes picked above.</Note>
    </DebugCard>
  );
}

/** Everything that puts something on the board, and the switch that sweeps it off. */
export function SpawnTab({ engineRef, ui, picks }: CheatProps & { picks: SpawnPicks }) {
  return (
    <>
      <CustomWaveCard engineRef={engineRef} ui={ui} picks={picks} />
      <AffixCard engineRef={engineRef} ui={ui} picks={picks} />
      <BossCard engineRef={engineRef} ui={ui} picks={picks} />
      <ActionButton label="Clear field" icon={ASSETS.misc.hit_splat} title="Kill every enemy on the board" onClick={() => engineRef.current?.debugClearEnemies()} />
    </>
  );
}

// ─── Distractions & Diversions ──────────────────────────────────────────────

/** The three kinds of Distraction & Diversion, in the order the player meets them. */
const DIVERSION_MOODS: ReadonlyArray<{ mood: DiversionMood; label: string }> = [
  { mood: 'walkby', label: 'Walk-bys' },
  { mood: 'event', label: 'Random events' },
  { mood: 'nest', label: 'Nests' },
];

/** Summon any Distraction & Diversion. The engine refuses one with nothing to do,
 *  such as the Hunting expert with no worn trap, and says why in a notice. */
export function DiversionTab({ engineRef, ui }: CheatProps) {
  return (
    <>
      {DIVERSION_MOODS.map(({ mood, label }) => {
        const list = DIVERSIONS.filter((d) => d.mood === mood);
        return (
          <DebugCard key={mood} title={label} icon={list[0]?.sprite} aside={`${list.length}`}>
            <TileGrid>
              {list.map((d) => (
                <PickTile
                  key={d.id}
                  name={d.name}
                  sprite={diversionSpriteStyle(d.id)}
                  disabled={ui.waveActive}
                  title={d.tip}
                  onClick={() => engineRef.current?.debugSpawnDiversion(d.id)}
                />
              ))}
            </TileGrid>
          </DebugCard>
        );
      })}
      {ui.waveActive && <Note>Diversions only turn up between waves.</Note>}
      <ActionButton label="Clear diversions" onClick={() => engineRef.current?.debugClearDiversions()} />
    </>
  );
}

// ─── Skills ─────────────────────────────────────────────────────────────────

/** The skills a *run* levels, as opposed to the account's meta-progression. */
const RUN_SKILLS: ReadonlyArray<{
  key: 'hunter' | 'herblore'; label: string; icon: string; max: number; read: (ui: DebugUi) => number;
}> = [
  { key: 'hunter', label: 'Hunter', icon: ASSETS.misc.hunter_icon, max: 99, read: (ui) => ui.hunterLevel },
  { key: 'herblore', label: 'Herblore', icon: ASSETS.misc.skill_herblore, max: 99, read: (ui) => ui.herbloreLevel },
];

/** The skills the run itself levels. The next one is a line in RUN_SKILLS. */
export function SkillsTab({ engineRef, ui }: CheatProps) {
  return (
    <DebugCard title="Run skills" icon={ASSETS.misc.stats_icon}>
      <NumberGrid>
        {RUN_SKILLS.map((sk) => (
          <NumberRow
            key={sk.key}
            label={sk.label}
            icon={sk.icon}
            value={sk.read(ui)}
            min={1}
            max={sk.max}
            onCommit={(n) => engineRef.current?.debugSetSkillLevel(sk.key, n)}
          />
        ))}
      </NumberGrid>
      <Note>Setting a level clears the XP into it.</Note>
    </DebugCard>
  );
}

// ─── Tools ──────────────────────────────────────────────────────────────────

/** Level and tier for whatever tower is selected on the map. */
function SelectedTowerCard({ engineRef, ui }: CheatProps) {
  // Read the tower live off the engine, the way GameRoot does: the panel re-renders
  // on every emit, so the numbers below stay current without a UIState key of their own.
  const tower = ui.selectedTowerId
    ? engineRef.current?.towers.find((t) => t.id === ui.selectedTowerId) ?? null
    : null;
  const icon = tower
    ? (tower.type === 'wizard' ? wizardStaffUrl(tower) : towerTierIcon(tower.type, tower.level) ?? towerIcon(tower.type))
    : ASSETS.misc.construction_icon;
  return (
    <DebugCard title="Selected tower" icon={icon} aside={tower?.name ?? 'None'}>
      {tower ? (
        <>
          <NumberGrid>
            <NumberRow
              label="Combat level"
              icon={TOWER_COMBAT[tower.type]?.icon}
              value={tower.skills[styleSkillKey(TOWER_STYLES[tower.type].style)].level}
              min={1}
              max={MAX_TOWER_LEVEL}
              onCommit={(n) => engineRef.current?.debugSetTowerLevel(tower.id, n)}
            />
            <NumberRow
              label="Tier"
              icon={ASSETS.misc.arrow_up}
              value={tower.level}
              min={1}
              max={tower.maxLevel}
              onCommit={(n) => engineRef.current?.debugSetTowerTier(tower.id, n)}
            />
          </NumberGrid>
          <Note>Tier costs nothing here, and it can go back down.</Note>
        </>
      ) : (
        <Note>Click a tower on the map first.</Note>
      )}
    </DebugCard>
  );
}

/** Reroll the road, or re-skin it. */
function MapCard({ engineRef, ui }: CheatProps) {
  return (
    <DebugCard title="Map" icon={ASSETS.misc.compass} aside={ui.biomeName}>
      <div className="grid grid-cols-2 gap-[0.35em]">
        <ActionButton
          label="Reroll map"
          icon={ASSETS.misc.signpost}
          title="Roll a fresh road layout and biome (between waves only)"
          disabled={ui.waveActive}
          onClick={() => engineRef.current?.debugRerollMap()}
        />
        <ActionButton
          label="Cycle biome"
          icon={ASSETS.misc.farming_icon}
          title="Re-skin this layout with the next region's palette"
          onClick={() => engineRef.current?.debugCycleBiome()}
        />
      </div>
      {ui.waveActive && <Note>Reroll waits for the wave to end. Cycling the biome is always safe.</Note>}
    </DebugCard>
  );
}

/** The one-shot buttons, two to a row. */
function ItemsCard({ engineRef, ui }: CheatProps) {
  const eng = () => engineRef.current;
  const tools: { label: string; icon: string; title: string; run: () => void }[] = [
    { label: 'Test unlock', icon: ASSETS.misc.trophy, title: 'Show the unlock popup with a stand-in reward', run: () => eng()?.debugTestUnlock() },
    { label: 'Seed log', icon: iconUrl('Collection_log'), title: 'Fill the Collection Log with sample kill counts', run: () => eng()?.debugSeedLog() },
    { label: 'Give gear', icon: ASSETS.misc.loot_bag, title: 'Drop one of every Classic gear piece into the loot bag', run: () => eng()?.debugGiveGear() },
    { label: 'Give seeds', icon: ASSETS.misc.farming_icon, title: 'Put one of every seed into the inventory, to plant from there', run: () => eng()?.debugGiveSeeds() },
    { label: 'Give herbs', icon: ASSETS.misc.skill_herblore, title: 'Put one of every herb into the inventory, for the Herblore bench', run: () => eng()?.debugGiveHerbs() },
    { label: 'Give fish', icon: ASSETS.misc.skill_fishing, title: 'Put one of every fish into the inventory, to test eating and selling', run: () => eng()?.debugGiveFish() },
  ];
  return (
    <DebugCard title="Items and tests" icon={ASSETS.misc.inventory_icon}>
      <div className="grid grid-cols-2 gap-[0.35em]">
        {tools.map((t) => (
          <ActionButton key={t.label} label={t.label} icon={t.icon} title={t.title} onClick={t.run} />
        ))}
        <ActionButton
          className="col-span-2"
          label={`Clear items (${ui.lootBag.length})`}
          title="Empty the loot bag (worn gear stays equipped)"
          disabled={ui.lootBag.length === 0}
          onClick={() => eng()?.debugClearItems()}
        />
      </div>
    </DebugCard>
  );
}

export function ToolsTab(props: CheatProps) {
  return (
    <>
      <SelectedTowerCard {...props} />
      <MapCard {...props} />
      <ItemsCard {...props} />
    </>
  );
}
