'use client';

import React from 'react';
import { ASSETS } from '@/lib/game/assets';
import type { UIState } from '@/lib/game/core/engine';
import { HUNTER_TRAPS, type HunterTrapId } from '@/lib/game/data/hunter-traps';
import { trapCost } from '@/lib/game/systems/hunter-traps';
import { SEED_BY_ID, type SeedId } from '@/lib/game/data/farming';
import { POTIONS, POTION_BY_ID, type PotionId } from '@/lib/game/data/herblore';
import { FISH, SPOT_CASTS } from '@/lib/game/data/fishing';
import { castSeconds } from '@/lib/game/systems/fishing';
import { brewDamageMult, outrankedBy, overhealCap } from '@/lib/game/systems/herblore';
import { hideBrokenImg, fmt, Price } from './ui-kit';
import { HoverTip } from './HoverTip';
import { potionTooltip } from './potion-tip';

/**
 * The **Skills** interface, built in the frame the Collection Log already uses: a row
 * of tabs, a counter in the corner, and one scrolling body underneath. There is no
 * front page and no back button — the tabs *are* the navigation, the way the log's
 * are, so a skill is always one click from any other skill.
 *
 * Under the tabs, every skill is the same three parts:
 *
 * 1. a header — the skill's icon, what it has reached, and its progress bar;
 * 2. the body — labelled bands of **sprite tiles**, one tile per thing the skill is
 *    holding or offering; and
 * 3. one short line at the bottom saying what the skill is for.
 *
 * The tile is the whole idiom. A trap, an allotment, a herb, a potion, a fish: each
 * is a square with its own sprite, its name, and one number at the foot — the price,
 * the count, the waves left. That is what the log does with a boss drop and what the
 * planting screen does with a seed, and it is why the panel now fills its width
 * instead of running one column of full-width rows down the middle of forty ems.
 * Tiles also killed the nested scroll: there is exactly one scrolling region here.
 *
 * It **mirrors** the board, it does not replace it. Every tile is a button that
 * already exists somewhere else — a trap in the dock, an allotment on the grass — so
 * nothing moves out of the world and into a menu. What the panel adds is the
 * overview: the level, the XP, the whole inventory at once.
 *
 * Adding a skill is one entry in {@link SKILLS} plus its page in {@link SkillPage}.
 */

export type SkillId = 'hunter' | 'farming' | 'herblore' | 'fishing';

interface SkillMeta {
  id: SkillId;
  name: string;
  icon: string;
  /** The big line in the header: a level where the skill has one, and what the
   *  skill is holding where it does not. */
  headline: (ui: UIState) => string;
  /** The quieter half of the header — the XP into the current level, where there is
   *  one. This is what used to be a whole "XP" band at the top of every page. */
  detail: (ui: UIState) => string | null;
  /** How far into the current level, 0–1. Skills without a level fill by what they
   *  have out on the board instead, so no bar is ever a dead grey strip. */
  progress: (ui: UIState) => number;
  /** The corner counter, in the log's own shape: how many of a thing this skill has
   *  against how many there are to have. */
  counter: (ui: UIState) => { obtained: number; total: number; noun: string };
  /** One line explaining what that counter is counting, on its tooltip. */
  counterTip: string;
  /** One short plain sentence. Same standard as a tower's signature. */
  tip: string;
}

const SKILLS: readonly SkillMeta[] = [
  {
    id: 'hunter',
    name: 'Hunter',
    icon: ASSETS.misc.hunter_icon,
    headline: (ui) => `Level ${ui.hunterLevel}`,
    detail: (ui) => `${fmt(ui.hunterXp)} / ${fmt(ui.hunterXpNeeded)} xp`,
    progress: (ui) => (ui.hunterXpNeeded > 0 ? Math.min(1, ui.hunterXp / ui.hunterXpNeeded) : 1),
    counter: (ui) => ({ obtained: ui.traps.length, total: ui.maxTraps, noun: 'traps' }),
    counterTip: 'Springing a trap is what levels Hunter, and a higher level allows more traps out at once.',
    tip: 'Traps on the road catch what walks into them.',
  },
  {
    id: 'farming',
    name: 'Farming',
    icon: ASSETS.misc.farming_icon,
    headline: (ui) => `${ui.farmPatches.length} allotment${ui.farmPatches.length === 1 ? '' : 's'}`,
    detail: (ui) => `${ui.herbPouch.reduce((n, h) => n + h.count, 0)} herbs held`,
    // No Farming level yet — the bar shows how much of your ground is working.
    progress: (ui) => (ui.farmPatches.length === 0 ? 0
      : ui.farmPatches.filter(p => p.stage !== 'empty').length / ui.farmPatches.length),
    counter: (ui) => ({
      obtained: ui.farmPatches.filter(p => p.stage !== 'empty').length,
      total: ui.farmPatches.length,
      noun: 'patches',
    }),
    counterTip: 'How much of your ground has something in it.',
    tip: 'Seeds grow into herbs you pull out of the ground.',
  },
  {
    id: 'herblore',
    name: 'Herblore',
    icon: ASSETS.misc.skill_herblore,
    headline: (ui) => `Level ${ui.herbloreLevel}`,
    detail: (ui) => `${fmt(ui.herbloreXp)} / ${fmt(ui.herbloreXpNeeded)} xp`,
    progress: (ui) => (ui.herbloreXpNeeded > 0 ? Math.min(1, ui.herbloreXp / ui.herbloreXpNeeded) : 1),
    counter: (ui) => ({
      obtained: POTIONS.filter(p => p.level <= ui.herbloreLevel).length,
      total: POTIONS.length,
      noun: 'potions',
    }),
    counterTip: 'How much of the bench your level has opened.',
    tip: 'Herbs brew into potions that last several waves.',
  },
  {
    id: 'fishing',
    name: 'Fishing',
    icon: ASSETS.misc.skill_fishing,
    headline: (ui) => `Level ${ui.fishingLevel}`,
    detail: (ui) => `${fmt(ui.fishingXp)} / ${fmt(ui.fishingXpNeeded)} xp`,
    progress: (ui) => (ui.fishingXpNeeded > 0 ? Math.min(1, ui.fishingXp / ui.fishingXpNeeded) : 1),
    counter: (ui) => ({
      obtained: FISH.filter(f => f.level <= ui.fishingLevel).length,
      total: FISH.length,
      noun: 'fish',
    }),
    counterTip: 'How much of the catch table your level has opened.',
    tip: 'Cast into a pool between waves and eat what you catch.',
  },
];

export interface SkillsViewProps {
  ui: UIState;
  /** The skill whose page is open. Held by GameRoot so the panel reopens where it
   *  was left; null means it has never been opened, and lands on the first tab. */
  open: SkillId | null;
  onOpen: (id: SkillId | null) => void;
  onSelectTrap: (id: HunterTrapId | null) => void;
  /** Click an allotment — the same click the board takes: sow it, or pull the herb. */
  onOpenPatch: (patchId: string) => void;
  onMovePlot: (patchId: string) => void;
  onBuyPlot: () => void;
  /** Drink a herb raw — one wave of its own buff, the pouch's cheap option. */
  onUseHerb: (seedId: SeedId) => void;
  /** Turn a herb + a secondary into a potion. */
  onBrewPotion: (potionId: PotionId) => void;
  /** Drink a brewed potion — several waves, and the reason to brew at all. */
  onDrinkPotion: (potionId: PotionId) => void;
  /** Cast a line into a pool. */
  onCast: (spotId: string) => void;
}

export function SkillsView(props: SkillsViewProps) {
  const { ui, open, onOpen } = props;
  const meta = SKILLS.find((s) => s.id === open) ?? SKILLS[0];
  const counter = meta.counter(ui);
  const detail = meta.detail(ui);
  return (
    <div className="flex flex-col flex-1 min-h-0 gap-[0.35em]">
      <SkillTabStrip tab={meta.id} onPick={onOpen} counter={counter} counterTip={meta.counterTip} />

      {/* One header for every skill: the icon, the name, what it has reached. */}
      <div className="flex items-baseline gap-[0.45em]">
        <img src={meta.icon} alt="" className="w-[1.3em] h-[1.3em] object-contain self-center" onError={hideBrokenImg} />
        <span className="text-[0.82em] text-osrs-orange">{meta.name}</span>
        <span className="ml-auto text-[0.72em] text-[#cdbe91] tabular-nums">{meta.headline(ui)}</span>
        {detail && <span className="text-[0.66em] text-[#9d8f6e] tabular-nums">{detail}</span>}
      </div>
      <div className="rs-progress">
        <div className="rs-progress-fill" style={{ width: `${Math.round(meta.progress(ui) * 100)}%` }} />
      </div>

      {/* The one scrolling region in the panel. Everything above and below it holds
          still while the page under it moves, the way the log's body does. */}
      <div className="overflow-y-auto custom-scrollbar pr-[0.2em] flex-1 min-h-0 py-[0.1em]">
        <SkillPage {...props} skill={meta.id} />
      </div>

      <div className="text-[0.68em] text-[#9d8f6e] flex items-center gap-[0.35em]">
        <img src={meta.icon} alt="" className="w-[1em] h-[1em] object-contain" onError={hideBrokenImg} />
        {meta.tip}
      </div>
    </div>
  );
}

/**
 * The row of tabs, one per skill, plus the counter in the corner — the Collection
 * Log's own header, down to the colours. The strip wraps rather than spilling, so it
 * survives every UI scale the panel can be set to.
 */
function SkillTabStrip({ tab, onPick, counter, counterTip }: {
  tab: SkillId;
  onPick: (id: SkillId) => void;
  counter: { obtained: number; total: number; noun: string };
  counterTip: string;
}) {
  const complete = counter.total > 0 && counter.obtained >= counter.total;
  return (
    <div className="flex items-center justify-between gap-[0.4em]">
      <div className="flex flex-wrap gap-[0.3em] min-w-0">
        {SKILLS.map((s) => (
          <button
            key={s.id}
            onClick={() => onPick(s.id)}
            title={s.tip}
            className={`rs-btn flex items-center gap-[0.3em] px-[0.6em] py-[0.15em] text-[0.76em] ${s.id === tab ? 'rs-btn-primary' : ''}`}
          >
            <img src={s.icon} alt="" className="w-[1.1em] h-[1.1em] object-contain" onError={hideBrokenImg} />
            {s.name}
          </button>
        ))}
      </div>
      <span
        title={counterTip}
        className="text-[0.78em] font-bold shrink-0 whitespace-nowrap self-start tabular-nums"
        style={{ color: complete ? 'var(--osrs-green)' : 'var(--osrs-yellow)' }}
      >
        {counter.obtained}/{counter.total} {counter.noun}
      </span>
    </div>
  );
}

function SkillPage(props: SkillsViewProps & { skill: SkillId }) {
  if (props.skill === 'hunter') return <HunterPage {...props} />;
  if (props.skill === 'herblore') return <HerblorePage {...props} />;
  if (props.skill === 'fishing') return <FishingPage {...props} />;
  return <FarmingPage {...props} />;
}

// ───────────────────────────────── The tile ─────────────────────────────────

/** What the pouch holds, as a lookup — the emitted list only carries the stacks
 *  that are actually there, so anything absent is a zero. */
function pouchCounts(ui: UIState): Partial<Record<SeedId, number>> {
  const out: Partial<Record<SeedId, number>> = {};
  for (const h of ui.herbPouch) out[h.seedId] = h.count;
  return out;
}

/**
 * The potion the pouch's Brew button offers for one herb: the highest rung this
 * level opens, falling back to the lowest so the button can say what it is locked
 * behind. Several herbs make two potions — a harralander is an Energy potion early
 * and a Combat potion later — and the shortcut always offers the better one.
 *
 * Potions built out of another potion are skipped: the bench below is where a
 * Sanfew serum or a Super combat is made, since a herb alone never brews one.
 */
function herbPotion(seedId: SeedId, level: number) {
  const made = POTIONS.filter((p) => p.herb === seedId && !p.potionInput);
  const open = made.filter((p) => p.level <= level);
  return open[open.length - 1] ?? made[0] ?? null;
}

/** A small labelled band — the same rule between every page's sections. */
function Section({ label, right, children }: { label: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="mt-[0.15em]">
      <div className="flex items-center gap-[0.4em] text-[0.68em] text-[#9d8f6e] uppercase tracking-wide mb-[0.25em]">
        <span>{label}</span>
        {right && <span className="ml-auto tabular-nums text-[#cdbe91]">{right}</span>}
      </div>
      {children}
    </div>
  );
}

/**
 * A band of tiles. `auto-fill` rather than a fixed column count, because the panel's
 * width is a clamp and the em is the UI scale — a grid of five would be cramped at
 * one end of that range and stretched at the other. `min` is the narrowest a tile may
 * be before the row drops one.
 */
function TileGrid({ min = '5.4em', children }: { min?: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-[0.3em]" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${min}, 1fr))` }}>
      {children}
    </div>
  );
}

interface TileFaceProps {
  /** The small corner glyph — a buff icon, a trap's signature. Top left. */
  sig?: string;
  /** The tile's own sprite. */
  icon?: string;
  /** Drawn instead of a sprite, in the log's own "nothing here" type: the `+` of the
   *  buy-a-plot tile. */
  glyph?: React.ReactNode;
  name: string;
  foot: React.ReactNode;
  footColor?: string;
  /** Anything absolutely positioned over the tile — the bench's ingredient counts,
   *  the fish ladder's healing. Badges only: a button cannot nest in a button. */
  corner?: React.ReactNode;
}

function TileFace({ sig, icon, glyph, name, foot, footColor, corner }: TileFaceProps) {
  return (
    <>
      {sig && <img src={sig} alt="" className="rs-log-sig" onError={hideBrokenImg} />}
      {corner}
      <div className="rs-log-sprite">
        {icon
          ? <img src={icon} alt="" className="w-full h-full object-contain"
              style={{ imageRendering: 'pixelated' }} onError={hideBrokenImg} />
          : glyph}
      </div>
      <span className="rs-log-name">{name}</span>
      <span className="rs-log-kc" style={footColor ? { color: footColor } : undefined}>{foot}</span>
    </>
  );
}

/**
 * A tile you can press. `confirm` is what makes it ask first, so the extra click only
 * ever appears where there is a reason — a herb already riding the wave, a dose still
 * running, a brew that would heal nothing — and every other press is the single click
 * it has always been. Armed, the
 * foot says **Sure?** in red and disarms itself after a few seconds, or the moment the
 * reason to ask goes away.
 */
function Tile({ onPress, disabled, locked, picked, title, tip, confirm, confirmTitle, ...face }: TileFaceProps & {
  onPress: () => void;
  disabled?: boolean;
  /** Out of reach: too low a level, or too little gold. */
  locked?: boolean;
  /** Armed for the board — the selected trap. */
  picked?: boolean;
  title?: string;
  /** A hover card in place of the plain `title`. Armed, the card gains the
   *  `confirmTitle` line in red. */
  tip?: React.ReactNode;
  confirm?: boolean;
  confirmTitle?: string;
}) {
  const [armed, setArmed] = React.useState(false);
  React.useEffect(() => {
    if (!armed) return;
    if (!confirm || disabled) { setArmed(false); return; }
    const t = window.setTimeout(() => setArmed(false), 3000);
    return () => window.clearTimeout(t);
  }, [armed, confirm, disabled]);
  const button = (
    <button
      type="button"
      onClick={() => {
        if (confirm && !armed) { setArmed(true); return; }
        setArmed(false);
        onPress();
      }}
      disabled={disabled}
      title={tip ? undefined : armed ? confirmTitle : title}
      className={`rs-log-entry rs-log-sm w-full disabled:opacity-40 ${locked ? 'rs-log-locked' : ''} ${picked ? 'rs-log-pick' : ''}`}
    >
      <TileFace
        {...face}
        foot={armed ? 'Sure?' : face.foot}
        footColor={armed ? 'var(--osrs-red)' : face.footColor}
      />
    </button>
  );
  if (!tip) return button;
  // The card hangs off a wrapper, not the button: a disabled button swallows the
  // mouse events the card opens on, and a locked rung is the tile most worth reading.
  return (
    <HoverTip
      widthEm={17}
      content={armed && confirmTitle ? (
        <div className="flex flex-col gap-[0.4em]">
          {tip}
          <span className="text-[0.8em] text-osrs-red">{confirmTitle}</span>
        </div>
      ) : tip}
    >
      <div className="flex w-full min-w-0" tabIndex={-1}>{button}</div>
    </HoverTip>
  );
}

/**
 * A tile that is only a record — what is out on the road, what is riding this wave.
 * A `<div>` rather than a disabled `<button>`, because a disabled button greys itself
 * to 40% and these are the things that *are* working.
 */
function TileStatic({ title, tip, ...face }: TileFaceProps & { title?: string; tip?: React.ReactNode }) {
  const tile = (
    <div className="rs-log-entry rs-log-sm" title={tip ? undefined : title}>
      <TileFace {...face} />
    </div>
  );
  return tip ? <HoverTip widthEm={17} content={tip}>{tile}</HoverTip> : tile;
}

/** The second action a tile carries, as a sibling rather than a child — a button
 *  cannot nest in a button, and `rs-log-sm` clips its own overflow. */
function TileCorner({ onPress, disabled, title, children }: {
  onPress: () => void;
  disabled?: boolean;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onPress}
      disabled={disabled}
      title={title}
      className="rs-btn absolute top-[0.15em] right-[0.15em] z-10 px-[0.3em] py-[0.05em] text-[0.5em] leading-none disabled:opacity-40"
    >
      {children}
    </button>
  );
}

// ───────────────────────────────── Hunter ─────────────────────────────────

function HunterPage({ ui, onSelectTrap }: SkillsViewProps) {
  return (
    <>
      {/* The bench: the same five traps the dock offers, with the level and the price
          each one is actually asking for. Clicking arms it for the road. */}
      <Section label="Traps" right={`${ui.traps.length} / ${ui.maxTraps} out`}>
        <TileGrid min="6em">
          {HUNTER_TRAPS.map((def) => {
            const locked = ui.hunterLevel < def.level;
            const cost = trapCost(def, ui.wave);
            const afford = ui.money >= cost;
            const full = ui.traps.length >= ui.maxTraps;
            const active = ui.selectedTrapId === def.id;
            return (
              <Tile
                key={def.id}
                sig={def.signature.icon}
                icon={def.sprite}
                name={def.name}
                foot={locked ? `L${def.level}` : <Price amount={cost} afford={afford && !full} />}
                locked={locked}
                picked={active}
                disabled={ui.waveActive || locked}
                title={locked ? `Needs Hunter ${def.level}` : def.tip}
                onPress={() => onSelectTrap(active ? null : def.id)}
              />
            );
          })}
        </TileGrid>
      </Section>

      {/* Resources: what is actually lying on the road right now, and how much
          catching each one has left in it. */}
      <Section label="On the road">
        {ui.traps.length === 0 ? (
          <div className="text-[0.7em] text-[#9d8f6e]">Nothing set. Pick a trap, then click the road.</div>
        ) : (
          <TileGrid min="6em">
            {ui.traps.map((t) => (
              <TileStatic
                key={t.id}
                icon={t.icon}
                name={t.name}
                foot={`${t.charges}/${t.maxCharges}`}
                title={`${t.name}: ${t.charges} of ${t.maxCharges} catches left. Picking it up returns ${t.refund} gp.`}
              />
            ))}
          </TileGrid>
        )}
      </Section>
    </>
  );
}

// ───────────────────────────────── Farming ─────────────────────────────────

const STAGE_LABEL: Record<string, string> = {
  empty: 'Bare',
  sown: 'Sown',
  growing: 'Growing',
  ready: 'Ready',
};

function FarmingPage({ ui, onOpenPatch, onMovePlot, onBuyPlot, onUseHerb, onBrewPotion }: SkillsViewProps) {
  const busy = ui.waveActive || ui.gameOver;
  // The harvest is the one farming button that wants the opposite clock: a ripe
  // herb only comes out while the wave is running.
  const afford = ui.money >= ui.plotCost;
  return (
    <>
      {/* Resources: the ground itself, plus the tile that buys more of it. A ready
          plot is the one thing here worth walking back to the board for, so it says
          so in green. */}
      <Section label="Allotments" right={`${ui.farmPatches.filter((p) => p.stage === 'ready').length} ready`}>
        <TileGrid min="5.8em">
          {ui.farmPatches.map((p) => (
            <div key={p.id} className="relative">
              <Tile
                icon={p.icon}
                name={p.name}
                foot={p.wavesLeft > 0 ? `${p.wavesLeft}w` : STAGE_LABEL[p.stage] ?? p.stage}
                footColor={p.stage === 'ready' ? '#4dff4d' : undefined}
                disabled={p.stage === 'ready' ? ui.gameOver : busy}
                title={p.stage === 'ready' ? 'Pull the herb'
                  : p.stage === 'empty' ? 'Sow a seed' : 'See what is growing'}
                onPress={() => onOpenPatch(p.id)}
              />
              <TileCorner
                onPress={() => onMovePlot(p.id)}
                disabled={busy}
                title="Move this allotment somewhere else, free of charge"
              >
                Move
              </TileCorner>
            </div>
          ))}
          {/* The bench: buying more ground. The price is the only cap there is, and
              the empty square is the log's own way of saying "not yet". */}
          <Tile
            glyph="+"
            name="Buy plot"
            foot={<Price amount={ui.plotCost} afford={afford} />}
            locked={!afford}
            disabled={busy || !afford}
            title={afford ? 'Buy another allotment. The next one costs double' : `Another allotment costs ${fmt(ui.plotCost)} gp`}
            onPress={onBuyPlot}
          />
        </TileGrid>
      </Section>

      {/* The pouch. Every herb here is a fork: spend it on the next wave, or put it
          on the bench and get several waves out of it later. */}
      <Section label="Herb pouch" right={`${ui.herbPouch.reduce((n, h) => n + h.count, 0)} held`}>
        {ui.herbPouch.length === 0 ? (
          <div className="text-[0.7em] text-[#9d8f6e]">Empty. Harvest a ready allotment.</div>
        ) : (
          <TileGrid min="5.8em">
            {ui.herbPouch.map((h) => {
              const potion = herbPotion(h.seedId, ui.herbloreLevel);
              const riding = ui.farmBuffs.some((b) => b.seedId === h.seedId);
              const canBrew = !!potion && !busy && ui.herbloreLevel >= potion.level && ui.money >= potion.cost;
              return (
                <div key={h.seedId} className="relative">
                  <Tile
                    sig={h.labelIcon}
                    icon={h.icon}
                    name={h.name}
                    foot={`×${h.count}`}
                    disabled={busy}
                    confirm={riding}
                    title={`Drink it raw: ${h.label} for the next wave`}
                    confirmTitle={`${h.name} is already riding this wave. A second one adds nothing.`}
                    onPress={() => onUseHerb(h.seedId)}
                  />
                  {potion && (
                    <button
                      type="button"
                      onClick={() => onBrewPotion(potion.id)}
                      disabled={!canBrew}
                      title={ui.herbloreLevel < potion.level
                        ? `${potion.name} needs Herblore ${potion.level}`
                        : `Brew a ${potion.name}: ${potion.secondary?.name ?? 'no second ingredient'}, ${fmt(potion.cost)} gp`}
                      className="rs-btn absolute top-[0.15em] right-[0.15em] z-10 p-[0.1em] leading-none disabled:opacity-40"
                    >
                      <img src={potion.icon} alt="" className="w-[1.1em] h-[1.1em] object-contain block" onError={hideBrokenImg} />
                    </button>
                  )}
                </div>
              );
            })}
          </TileGrid>
        )}
      </Section>

      <Section label="Riding this wave" right={ui.farmBuffs.length > 0 ? `${ui.farmBuffs.length} up` : undefined}>
        {ui.farmBuffs.length === 0 ? (
          <div className="text-[0.7em] text-[#9d8f6e]">No herb drunk. Use one from the pouch.</div>
        ) : (
          <TileGrid min="6.4em">
            {ui.farmBuffs.map((h) => (
              <TileStatic
                key={h.seedId}
                icon={h.icon}
                name={h.herbName}
                title={h.tip}
                foot={
                  <span className="inline-flex items-center gap-[0.2em]">
                    <img src={h.labelIcon} alt="" className="w-[1em] h-[1em] object-contain" onError={hideBrokenImg} />
                    {h.label}
                  </span>
                }
              />
            ))}
          </TileGrid>
        )}
      </Section>
    </>
  );
}

// ──────────────────────────────── Herblore ────────────────────────────────

/**
 * The potion bench. Farming decides what the pouch holds; this decides what it is
 * worth. Every tile is the same bargain — one herb and some gold now, for a buff that
 * outlives the wave you drink it on — and the level is what opens the better halves
 * of that trade. What each rung wants rides in its corner, so a glance at the grid
 * says which potions you can actually make right now.
 */
function HerblorePage({ ui, onBrewPotion, onDrinkPotion }: SkillsViewProps) {
  const busy = ui.waveActive || ui.gameOver;
  const held = pouchCounts(ui);
  const stock = new Map(ui.potionStock.map((p) => [p.id, p.count]));
  return (
    <>
      {/* The whole ladder, locked rungs included, so the skill says up front what it
          is going to be worth growing herbs for. */}
      <Section label="Bench">
        <TileGrid min="6.6em">
          {POTIONS.map((def) => {
            const locked = ui.herbloreLevel < def.level;
            const herb = def.herb ? SEED_BY_ID[def.herb] : null;
            const herbs = def.herb ? held[def.herb] ?? 0 : 0;
            // A few rungs are brewed out of a finished potion rather than a herb —
            // a Sanfew serum out of a Super restore, a Super combat out of a Super
            // strength — so the tile shows whichever inputs it actually wants.
            const base = def.potionInput ? POTION_BY_ID[def.potionInput] : null;
            const bases = base ? stock.get(base.id) ?? 0 : 0;
            const afford = ui.money >= def.cost;
            const missing = (!!herb && herbs < 1) || (!!base && bases < 1);
            const inputs = [
              herb ? { icon: herb.herbIcon, name: herb.herbName, count: herbs } : null,
              base ? { icon: base.icon, name: base.name, count: bases } : null,
            ].filter((i): i is { icon: string; name: string; count: number } => i !== null);
            const recipe = [herb?.herbName, base?.name, def.secondary?.name].filter(Boolean).join(' + ');
            return (
              <Tile
                key={def.id}
                icon={def.icon}
                name={def.name}
                foot={locked ? `L${def.level}` : <Price amount={def.cost} afford={afford} />}
                locked={locked}
                disabled={busy || locked || missing || !afford}
                title={locked
                  ? `Needs Herblore ${def.level}`
                  : `${recipe}: ${def.waves > 0 ? `${def.waves} waves` : 'one drink'}`}
                tip={potionTooltip(def, {
                  recipe: { herbs, bases, money: ui.money, level: ui.herbloreLevel },
                  note: busy ? 'Only between waves' : undefined,
                })}
                onPress={() => onBrewPotion(def.id)}
                corner={inputs.length > 0 && (
                  <span className="absolute top-[0.1em] right-[0.15em] z-10 flex flex-col items-end gap-[0.05em] pointer-events-none">
                    {inputs.map((i) => (
                      <span key={i.name} className="flex items-center gap-[0.1em] leading-none">
                        <img src={i.icon} alt="" className="w-[0.9em] h-[0.9em] object-contain" onError={hideBrokenImg} />
                        <span className="text-[0.55em] tabular-nums" style={{ color: i.count > 0 ? 'var(--osrs-yellow)' : 'var(--osrs-red)' }}>
                          {i.count}
                        </span>
                      </span>
                    ))}
                  </span>
                )}
              />
            );
          })}
        </TileGrid>
      </Section>

      {/* Resources: what is brewed and waiting. Nothing here does anything until it
          is drunk — that is the whole point of a stock. */}
      <Section label="Brewed" right={`${ui.potionStock.reduce((n, p) => n + p.count, 0)} held`}>
        {ui.potionStock.length === 0 ? (
          <div className="text-[0.7em] text-[#9d8f6e]">Nothing brewed. The bench is above.</div>
        ) : (
          <TileGrid min="6.6em">
            {ui.potionStock.map((p) => {
              const def = POTIONS.find((d) => d.id === p.id);
              const cost = def?.lifeCost ?? 0;
              const running = ui.activePotions.find((a) => a.id === p.id);
              // A cleanser with nothing to clean is the one potion worth greying
              // out: drinking it would spend the stock and change nothing.
              const idle = !!def?.clearsBrew && ui.brewStacks < 1;
              const short = cost > 0 && ui.lives <= cost;
              // A better tier of the same effect is already up: the engine refuses
              // the dose rather than spending it, so the tile says so first.
              const covered = def ? outrankedBy(ui.activePotions, def) : null;
              // A Saradomin brew at the overheal ceiling still spends itself and still
              // leaves its permanent debt behind — the one drink that costs the player
              // something for nothing, so it asks before it pours.
              const capped = !!def?.overheals && ui.lives >= overhealCap(ui.maxLives);
              return (
                <Tile
                  key={p.id}
                  icon={p.icon}
                  name={p.name}
                  foot={`×${p.count}`}
                  disabled={busy || short || idle || !!covered}
                  confirm={!!running || capped}
                  title={short ? 'Too few lives to drink that'
                    : idle ? 'No brew to clear'
                    : covered ? `${covered.name} already covers that`
                    : def?.tip}
                  tip={def && potionTooltip(def, {
                    vitals: { lives: ui.lives, maxLives: ui.maxLives },
                    note: busy ? 'Only between waves' : undefined,
                    warn: short ? 'Too few lives to drink that'
                      : idle ? 'No brew to clear'
                      : covered ? `${covered.name} already covers that`
                      : undefined,
                  })}
                  confirmTitle={running
                    ? `${p.name} still has ${running.wavesLeft} wave${running.wavesLeft === 1 ? '' : 's'} left. Another dose only starts it over.`
                    : 'You are already at the overheal cap. This heals nothing and still leaves a brew.'}
                  onPress={() => onDrinkPotion(p.id)}
                />
              );
            })}
          </TileGrid>
        )}
      </Section>

      {ui.brewStacks > 0 && (
        <Section
          label="Brew debt"
          right={`−${Math.round((1 - brewDamageMult(ui.brewStacks)) * 100)}% damage`}
        >
          <div className="text-[0.7em] text-[#cdbe91]">
            A Super restore clears three brews, a Sanfew serum clears the lot.
          </div>
        </Section>
      )}

      <Section label="Running">
        {ui.activePotions.length === 0 ? (
          <div className="text-[0.7em] text-[#9d8f6e]">Nothing drunk. A dose runs for several waves.</div>
        ) : (
          <TileGrid min="6.4em">
            {ui.activePotions.map((a) => (
              <TileStatic
                key={a.id}
                sig={a.labelIcon}
                icon={a.icon}
                name={a.name}
                title={`${a.tip} · ${a.label}`}
                tip={POTION_BY_ID[a.id] && potionTooltip(POTION_BY_ID[a.id], { wavesLeft: a.wavesLeft })}
                foot={`${a.wavesLeft} wave${a.wavesLeft === 1 ? '' : 's'}`}
              />
            ))}
          </TileGrid>
        )}
      </Section>
    </>
  );
}

// ───────────────────────────────── Fishing ─────────────────────────────────

/**
 * The pools this map dealt, and the ladder of fish they hold. A pool mirrors the
 * board the same way a Hunter trap does: casting here is the same cast as clicking
 * the water, just with the level and the catch table alongside it.
 */
function FishingPage({ ui, onCast }: { ui: UIState; onCast: (spotId: string) => void }) {
  return (
    <>
      {/* The bar shortens as the level climbs, so the header carries the number
          the ladder is buying: three seconds at Fishing 1, half that at 99. */}
      <Section
        label="Pools"
        right={`${ui.fishingSpots.filter((s) => s.stage === 'ready').length} ready · ${castSeconds(ui.fishingLevel).toFixed(1)}s cast`}
      >
        {ui.fishingSpots.length === 0 ? (
          <div className="text-[0.7em] text-[#9d8f6e]">This map has no water.</div>
        ) : (
          <TileGrid min="6em">
            {ui.fishingSpots.map((s) => {
              // A cast runs to its end, so while one is out every pool is closed —
              // the one holding the line included.
              const lineOut = ui.castSpotId !== null;
              const spent = s.stage === 'spent';
              return (
                <Tile
                  key={s.id}
                  // The baked spot sprite is an eight-frame strip, so an <img> of it
                  // would show all eight at once. The skill's own icon stands in.
                  icon={ASSETS.misc.skill_fishing}
                  name="Fishing spot"
                  foot={spent ? `${s.wavesLeft}w` : `${s.casts} / ${SPOT_CASTS}`}
                  footColor={spent ? 'var(--osrs-red)' : undefined}
                  locked={spent}
                  disabled={ui.waveActive || spent || lineOut}
                  title={lineOut ? 'Your line is already out'
                    : spent ? 'The fish come back in a few waves' : 'Cast a line'}
                  onPress={() => onCast(s.id)}
                />
              );
            })}
          </TileGrid>
        )}
      </Section>

      <Section label="Catches">
        <TileGrid min="6.6em">
          {FISH.map((f) => {
            const locked = f.level > ui.fishingLevel;
            return (
              <TileStatic
                key={f.id}
                icon={f.icon}
                name={f.name}
                title={locked ? `Needs Fishing ${f.level}` : 'Eat it for lives, or sell it for gold.'}
                foot={locked ? `L${f.level}` : <Price amount={f.gold} />}
                {...(locked ? {} : {
                  // The heal caps at maxLives and does not happen at all once lives
                  // are already full — a plain "+{n}" overpromises both times — so the
                  // life count reads "at most". Gold is the other half of the same
                  // fish, paid instead at full lives, and rides at the foot.
                  corner: (
                    <span className="absolute top-[0.1em] right-[0.15em] z-10 flex items-center gap-[0.1em] leading-none pointer-events-none">
                      <img src={ASSETS.misc.orb_hitpoints} alt="" className="w-[0.9em] h-[0.9em] object-contain" onError={hideBrokenImg} />
                      <span className="text-[0.55em] tabular-nums text-[#cdbe91]">&le;{f.lives}</span>
                    </span>
                  ),
                })}
              />
            );
          })}
        </TileGrid>
      </Section>
    </>
  );
}
