'use client';

import React from 'react';
import { ASSETS } from '@/lib/game/assets';
import type { UIState } from '@/lib/game/core/engine';
import { HUNTER_TRAPS, type HunterTrapId } from '@/lib/game/data/hunter-traps';
import { trapCost } from '@/lib/game/systems/hunter-traps';
import { SEED_BY_ID, type SeedId } from '@/lib/game/data/farming';
import { POTIONS, type PotionId } from '@/lib/game/data/herblore';
import { hideBrokenImg, fmt } from './ui-kit';

/**
 * The **Skills** interface — OSRS's Stats tab, doing the job it does in the game:
 * one place that says what every skill this run has going on, and how far each has
 * come. It opens on the skills grid; clicking a skill turns the panel into that
 * skill's own page.
 *
 * Every page is the same four parts, so the skills read as one family rather than
 * as separate screens:
 *
 * 1. a header — the skill's icon, what it has reached, and its progress bar;
 * 2. **resources** — the slots holding what this skill has to work with;
 * 3. the **bench** — the skill's one interaction; and
 * 4. one short line at the bottom saying what the skill is for.
 *
 * It **mirrors** the board, it does not replace it. Every button here is a button
 * that already exists somewhere else — a trap in the dock, an allotment on the
 * grass — so nothing moves out of the world and into a menu. What the panel adds
 * is the overview: the level, the XP, the whole inventory at once.
 *
 * Adding a skill is one entry in {@link SKILLS} plus its page in {@link SkillPage}.
 */

export type SkillId = 'hunter' | 'farming' | 'herblore';

interface SkillMeta {
  id: SkillId;
  name: string;
  icon: string;
  /** The big line in the grid box: a level where the skill has one, and what the
   *  skill is holding where it does not. */
  headline: (ui: UIState) => string;
  /** How far into the current level, 0–1. Skills without a level fill by what they
   *  have out on the board instead, so no box is ever a dead grey bar. */
  progress: (ui: UIState) => number;
  /** One short plain sentence. Same standard as a tower's signature. */
  tip: string;
}

const SKILLS: readonly SkillMeta[] = [
  {
    id: 'hunter',
    name: 'Hunter',
    icon: ASSETS.misc.hunter_icon,
    headline: (ui) => `Level ${ui.hunterLevel}`,
    progress: (ui) => (ui.hunterXpNeeded > 0 ? Math.min(1, ui.hunterXp / ui.hunterXpNeeded) : 1),
    tip: 'Traps on the road catch what walks into them.',
  },
  {
    id: 'farming',
    name: 'Farming',
    icon: ASSETS.misc.farming_icon,
    headline: (ui) => `${ui.farmPatches.length} allotment${ui.farmPatches.length === 1 ? '' : 's'}`,
    // No Farming level yet — the bar shows how much of your ground is working.
    progress: (ui) => (ui.farmPatches.length === 0 ? 0
      : ui.farmPatches.filter(p => p.stage !== 'empty').length / ui.farmPatches.length),
    tip: 'Seeds grow into herbs you can drink or brew.',
  },
  {
    id: 'herblore',
    name: 'Herblore',
    icon: ASSETS.misc.skill_herblore,
    headline: (ui) => `Level ${ui.herbloreLevel}`,
    progress: (ui) => (ui.herbloreXpNeeded > 0 ? Math.min(1, ui.herbloreXp / ui.herbloreXpNeeded) : 1),
    tip: 'Herbs brew into potions that last several waves.',
  },
];

export interface SkillsViewProps {
  ui: UIState;
  /** The skill whose page is open, or null for the grid. Held by GameRoot so the
   *  panel reopens where it was left. */
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
}

export function SkillsView(props: SkillsViewProps) {
  const { ui, open, onOpen } = props;
  const meta = open ? SKILLS.find((s) => s.id === open) ?? null : null;

  if (!meta) {
    return (
      <div className="flex flex-col gap-[0.4em]">
        <div className="text-[0.72em] text-[#cdbe91] uppercase tracking-wide">Skills</div>
        <div className="grid grid-cols-2 gap-[0.4em]">
          {SKILLS.map((s) => (
            <button
              key={s.id}
              onClick={() => onOpen(s.id)}
              title={s.tip}
              className="rs-panel-inset flex items-center gap-[0.5em] p-[0.45em] text-left hover:brightness-125"
            >
              <img src={s.icon} alt="" className="w-[1.7em] h-[1.7em] object-contain shrink-0" onError={hideBrokenImg} />
              <span className="min-w-0 flex-1">
                <span className="block text-[0.8em] text-osrs-orange truncate">{s.name}</span>
                <span className="block text-[0.72em] text-[#cdbe91] tabular-nums truncate">{s.headline(ui)}</span>
                <span className="rs-progress mt-[0.25em] block">
                  <span className="rs-progress-fill block" style={{ width: `${Math.round(s.progress(ui) * 100)}%` }} />
                </span>
              </span>
            </button>
          ))}
        </div>
        <div className="text-[0.68em] text-[#9d8f6e] mt-[0.1em]">
          Click a skill to see what it is holding.
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-[0.45em]">
      {/* One header for every skill: back out, the icon, the name, the headline. */}
      <div className="flex items-center gap-[0.45em]">
        <button onClick={() => onOpen(null)} title="Back to the skills" className="rs-btn px-[0.5em] py-[0.15em] text-[0.7em]">
          ‹
        </button>
        <img src={meta.icon} alt="" className="w-[1.5em] h-[1.5em] object-contain" onError={hideBrokenImg} />
        <span className="text-[0.82em] text-osrs-orange">{meta.name}</span>
        <span className="ml-auto text-[0.72em] text-[#cdbe91] tabular-nums">{meta.headline(ui)}</span>
      </div>
      <div className="rs-progress">
        <div className="rs-progress-fill" style={{ width: `${Math.round(meta.progress(ui) * 100)}%` }} />
      </div>
      <SkillPage {...props} skill={meta.id} />
      <div className="text-[0.68em] text-[#9d8f6e] flex items-center gap-[0.35em]">
        <img src={meta.icon} alt="" className="w-[1em] h-[1em] object-contain" onError={hideBrokenImg} />
        {meta.tip}
      </div>
    </div>
  );
}

function SkillPage(props: SkillsViewProps & { skill: SkillId }) {
  if (props.skill === 'hunter') return <HunterPage {...props} />;
  if (props.skill === 'herblore') return <HerblorePage {...props} />;
  return <FarmingPage {...props} />;
}

/** What the pouch holds, as a lookup — the emitted list only carries the stacks
 *  that are actually there, so anything absent is a zero. */
function pouchCounts(ui: UIState): Partial<Record<SeedId, number>> {
  const out: Partial<Record<SeedId, number>> = {};
  for (const h of ui.herbPouch) out[h.seedId] = h.count;
  return out;
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
 * A `rs-btn` that asks once before it spends something for nothing. `confirm` is
 * what makes it ask, so the extra click only ever appears where there is a reason
 * — a herb already riding the wave, a dose still running — and every other press
 * is the single click it has always been. Armed, it says **Sure?** in red and
 * disarms itself after a few seconds, or the moment the reason to ask goes away.
 */
function ConfirmButton({ confirm, onPress, disabled, title, confirmTitle, children }: {
  confirm: boolean;
  onPress: () => void;
  disabled?: boolean;
  title?: string;
  confirmTitle: string;
  children: React.ReactNode;
}) {
  const [armed, setArmed] = React.useState(false);
  React.useEffect(() => {
    if (!armed) return;
    if (!confirm || disabled) { setArmed(false); return; }
    const t = window.setTimeout(() => setArmed(false), 3000);
    return () => window.clearTimeout(t);
  }, [armed, confirm, disabled]);
  return (
    <button
      onClick={() => {
        if (confirm && !armed) { setArmed(true); return; }
        setArmed(false);
        onPress();
      }}
      disabled={disabled}
      title={confirm ? confirmTitle : title}
      className="rs-btn px-[0.45em] py-[0.1em] text-[0.65em] shrink-0 disabled:opacity-40"
      style={armed ? { color: 'var(--osrs-red)' } : undefined}
    >
      {armed ? 'Sure?' : children}
    </button>
  );
}

// ───────────────────────────────── Hunter ─────────────────────────────────

function HunterPage({ ui, onSelectTrap }: SkillsViewProps) {
  return (
    <>
      <Section label="XP" right={`${fmt(ui.hunterXp)} / ${fmt(ui.hunterXpNeeded)}`}>
        <div className="text-[0.7em] text-[#cdbe91]">
          Springing a trap is what levels it. A higher level allows more traps out at once.
        </div>
      </Section>

      {/* The bench: the same five traps the dock offers, with the level and the
          price each one is actually asking for. Clicking arms it for the road. */}
      <Section label="Traps" right={`${ui.traps.length} / ${ui.maxTraps} out`}>
        <div className="flex flex-col gap-[0.25em]">
          {HUNTER_TRAPS.map((def) => {
            const locked = ui.hunterLevel < def.level;
            const cost = trapCost(def, ui.wave);
            const afford = ui.money >= cost;
            const full = ui.traps.length >= ui.maxTraps;
            const active = ui.selectedTrapId === def.id;
            return (
              <button
                key={def.id}
                onClick={() => onSelectTrap(active ? null : def.id)}
                disabled={ui.waveActive || locked}
                title={locked ? `Needs Hunter ${def.level}` : def.tip}
                className={`rs-panel-inset flex items-center gap-[0.45em] p-[0.35em] text-left disabled:opacity-40 ${active ? 'brightness-150' : 'hover:brightness-125'}`}
              >
                <img src={def.sprite} alt="" className={`w-[1.4em] h-[1.4em] object-contain shrink-0 ${locked ? 'grayscale' : ''}`} onError={hideBrokenImg} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[0.74em] text-osrs-orange truncate">{def.name}</span>
                  <span className="block text-[0.68em] text-[#cdbe91] truncate">{def.tip}</span>
                </span>
                <span
                  className="text-[0.72em] tabular-nums shrink-0"
                  style={{ color: !locked && afford && !full ? 'var(--osrs-yellow)' : 'var(--osrs-red)' }}
                >
                  {locked ? `L${def.level}` : fmt(cost)}
                </span>
              </button>
            );
          })}
        </div>
      </Section>

      {/* Resources: what is actually lying on the road right now, and how much
          catching each one has left in it. */}
      <Section label="On the road">
        {ui.traps.length === 0 ? (
          <div className="text-[0.7em] text-[#9d8f6e]">Nothing set. Pick a trap, then click the road.</div>
        ) : (
          <div className="flex flex-wrap gap-[0.3em]">
            {/* `.rs-slot` is width:100% + a square aspect, so it takes its size from
                whatever holds it. Without this wrapper each trap stretched to the
                whole row and came out enormous. */}
            {ui.traps.map((t) => (
              <div key={t.id} className="w-[2.6em]">
                <div className="rs-slot" title={`${t.name} — ${t.charges} of ${t.maxCharges} catches left`}>
                  <img src={t.icon} alt={t.name} onError={hideBrokenImg} />
                  <span className="rs-slot-cost" style={{ color: 'var(--osrs-yellow)' }}>{t.charges}</span>
                </div>
              </div>
            ))}
          </div>
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
  const afford = ui.money >= ui.plotCost;
  return (
    <>
      {/* Resources: the ground itself. A ready plot is the one thing here worth
          walking back to the board for, so it says so in green. */}
      <Section label="Allotments" right={`${ui.farmPatches.filter((p) => p.stage === 'ready').length} ready`}>
        {ui.farmPatches.length === 0 ? (
          <div className="text-[0.7em] text-[#9d8f6e]">This map dealt no ground. Buy a plot below.</div>
        ) : (
          <div className="flex flex-col gap-[0.25em]">
            {ui.farmPatches.map((p) => (
              <div key={p.id} className="rs-panel-inset flex items-center gap-[0.45em] p-[0.35em]">
                <img src={p.icon} alt="" className="w-[1.4em] h-[1.4em] object-contain shrink-0" onError={hideBrokenImg} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[0.74em] text-osrs-orange truncate">{p.name}</span>
                  <span
                    className="block text-[0.68em] truncate"
                    style={{ color: p.stage === 'ready' ? '#4dff4d' : '#cdbe91' }}
                  >
                    {STAGE_LABEL[p.stage] ?? p.stage}
                    {p.wavesLeft > 0 && ` · ${p.wavesLeft} wave${p.wavesLeft === 1 ? '' : 's'} left`}
                  </span>
                </span>
                <button
                  onClick={() => onOpenPatch(p.id)}
                  disabled={busy}
                  title={p.stage === 'ready' ? 'Pull the herb' : p.stage === 'empty' ? 'Sow a seed' : 'See what is growing'}
                  className="rs-btn px-[0.45em] py-[0.1em] text-[0.65em] shrink-0 disabled:opacity-40"
                >
                  {p.stage === 'ready' ? 'Harvest' : p.stage === 'empty' ? 'Sow' : 'Open'}
                </button>
                <button
                  onClick={() => onMovePlot(p.id)}
                  disabled={busy}
                  title="Pick this allotment up and put it down somewhere else — free"
                  className="rs-btn px-[0.45em] py-[0.1em] text-[0.65em] shrink-0 disabled:opacity-40"
                >
                  Move
                </button>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* The pouch. Every herb here is a fork: spend it on the next wave, or put it
          on the bench and get several waves out of it later. */}
      <Section label="Herb pouch" right={`${ui.herbPouch.reduce((n, h) => n + h.count, 0)} held`}>
        {ui.herbPouch.length === 0 ? (
          <div className="text-[0.7em] text-[#9d8f6e]">Empty. Harvest a ready allotment.</div>
        ) : (
          <div className="flex flex-col gap-[0.25em]">
            {ui.herbPouch.map((h) => {
              const potion = POTIONS.find((p) => p.herb === h.seedId);
              const riding = ui.farmBuffs.some((b) => b.seedId === h.seedId);
              return (
                <div key={h.seedId} className="rs-panel-inset flex items-center gap-[0.45em] p-[0.35em]">
                  <img src={h.icon} alt="" className="w-[1.4em] h-[1.4em] object-contain shrink-0" onError={hideBrokenImg} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[0.74em] text-osrs-orange truncate">
                      {h.name} <span className="text-[#cdbe91] tabular-nums">×{h.count}</span>
                    </span>
                    <span className="block text-[0.68em] text-[#cdbe91] truncate">{h.tip}</span>
                  </span>
                  <ConfirmButton
                    confirm={riding}
                    onPress={() => onUseHerb(h.seedId)}
                    disabled={busy}
                    title={`Drink it raw — ${h.label} for the next wave`}
                    confirmTitle={`${h.name} is already riding this wave. A second one adds nothing.`}
                  >
                    Use
                  </ConfirmButton>
                  {potion && (
                    <button
                      onClick={() => onBrewPotion(potion.id)}
                      disabled={busy || ui.herbloreLevel < potion.level || ui.money < potion.secondary.cost}
                      title={ui.herbloreLevel < potion.level
                        ? `${potion.name} needs Herblore ${potion.level}`
                        : `Brew a ${potion.name} — ${potion.secondary.name}, ${fmt(potion.secondary.cost)} gp`}
                      className="rs-btn px-[0.45em] py-[0.1em] text-[0.65em] shrink-0 disabled:opacity-40"
                    >
                      Brew
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Section>

      {/* The bench: buying more ground. The price is the only cap there is. */}
      <Section label="Buy ground">
        <button
          onClick={onBuyPlot}
          disabled={busy || !afford}
          title={afford ? 'Buy another allotment — the next one costs double' : `Another allotment costs ${fmt(ui.plotCost)} gp`}
          className="rs-btn w-full flex items-center justify-center gap-[0.4em] py-[0.2em] text-[0.7em] disabled:opacity-50"
        >
          <img src={ASSETS.misc.farming_icon} alt="" className="w-[1.1em] h-[1.1em] object-contain" onError={hideBrokenImg} />
          <span>Buy plot</span>
          <span className="tabular-nums" style={{ color: afford ? 'var(--osrs-yellow)' : 'var(--osrs-red)' }}>
            {fmt(ui.plotCost)}
          </span>
        </button>
      </Section>

      <Section label="Riding this wave" right={ui.farmBuffs.length > 0 ? `${ui.farmBuffs.length} up` : undefined}>
        {ui.farmBuffs.length === 0 ? (
          <div className="text-[0.7em] text-[#9d8f6e]">No herb drunk. Use one from the pouch.</div>
        ) : (
          <div className="flex flex-col gap-[0.25em]">
            {ui.farmBuffs.map((h) => (
              <div key={h.seedId} className="rs-panel-inset flex items-center gap-[0.45em] p-[0.35em]">
                <img src={h.icon} alt="" className="w-[1.4em] h-[1.4em] object-contain shrink-0" onError={hideBrokenImg} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[0.74em] text-osrs-orange truncate">{h.herbName}</span>
                  <span className="block text-[0.68em] text-[#cdbe91] truncate">{h.tip}</span>
                </span>
                <img src={h.labelIcon} alt="" className="w-[1em] h-[1em] object-contain shrink-0" onError={hideBrokenImg} />
                <span className="text-[0.68em] text-[#cdbe91] shrink-0">{h.label}</span>
              </div>
            ))}
          </div>
        )}
      </Section>
    </>
  );
}

// ──────────────────────────────── Herblore ────────────────────────────────

/**
 * The potion bench. Farming decides what the pouch holds; this decides what it is
 * worth. Every row is the same bargain — one herb and some gold now, for a buff
 * that outlives the wave you drink it on — and the level is what opens the better
 * halves of that trade.
 */
function HerblorePage({ ui, onBrewPotion, onDrinkPotion }: SkillsViewProps) {
  const busy = ui.waveActive || ui.gameOver;
  const held = pouchCounts(ui);
  const stock = new Map(ui.potionStock.map((p) => [p.id, p.count]));
  return (
    <>
      <Section label="XP" right={`${fmt(ui.herbloreXp)} / ${fmt(ui.herbloreXpNeeded)}`}>
        <div className="text-[0.7em] text-[#cdbe91]">
          Brewing is what levels it. A higher level opens the stronger potions.
        </div>
      </Section>

      {/* The bench: the whole ladder, locked rungs included, so the skill says up
          front what it is going to be worth growing herbs for. */}
      <Section label="Bench">
        <div className="flex flex-col gap-[0.25em]">
          {POTIONS.map((def) => {
            const locked = ui.herbloreLevel < def.level;
            const herbs = held[def.herb] ?? 0;
            const afford = ui.money >= def.secondary.cost;
            const herb = SEED_BY_ID[def.herb];
            return (
              <button
                key={def.id}
                onClick={() => onBrewPotion(def.id)}
                disabled={busy || locked || herbs < 1 || !afford}
                title={locked
                  ? `Needs Herblore ${def.level}`
                  : `${herb.herbName} + ${def.secondary.name} — ${def.waves} waves`}
                className="rs-panel-inset flex items-center gap-[0.45em] p-[0.35em] text-left disabled:opacity-40 hover:brightness-125"
              >
                <img src={def.icon} alt="" className={`w-[1.4em] h-[1.4em] object-contain shrink-0 ${locked ? 'grayscale' : ''}`} onError={hideBrokenImg} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[0.74em] text-osrs-orange truncate">{def.name}</span>
                  <span className="block text-[0.68em] text-[#cdbe91] truncate">{def.tip}</span>
                </span>
                <span className="flex items-center gap-[0.15em] shrink-0" title={`${herbs} ${herb.herbName} in the pouch`}>
                  <img src={herb.herbIcon} alt="" className="w-[1em] h-[1em] object-contain" onError={hideBrokenImg} />
                  <span className="text-[0.68em] tabular-nums" style={{ color: herbs > 0 ? 'var(--osrs-yellow)' : 'var(--osrs-red)' }}>
                    {herbs}
                  </span>
                </span>
                <span
                  className="text-[0.72em] tabular-nums shrink-0"
                  style={{ color: !locked && afford ? 'var(--osrs-yellow)' : 'var(--osrs-red)' }}
                >
                  {locked ? `L${def.level}` : fmt(def.secondary.cost)}
                </span>
              </button>
            );
          })}
        </div>
      </Section>

      {/* Resources: what is brewed and waiting. Nothing here does anything until
          it is drunk — that is the whole point of a stock. */}
      <Section label="Brewed" right={`${ui.potionStock.reduce((n, p) => n + p.count, 0)} held`}>
        {ui.potionStock.length === 0 ? (
          <div className="text-[0.7em] text-[#9d8f6e]">Nothing brewed. The bench is above.</div>
        ) : (
          <div className="flex flex-col gap-[0.25em]">
            {ui.potionStock.map((p) => {
              const def = POTIONS.find((d) => d.id === p.id);
              const cost = def?.lifeCost ?? 0;
              const running = ui.activePotions.find((a) => a.id === p.id);
              return (
                <div key={p.id} className="rs-panel-inset flex items-center gap-[0.45em] p-[0.35em]">
                  <img src={p.icon} alt="" className="w-[1.4em] h-[1.4em] object-contain shrink-0" onError={hideBrokenImg} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[0.74em] text-osrs-orange truncate">
                      {p.name} <span className="text-[#cdbe91] tabular-nums">×{p.count}</span>
                    </span>
                    <span className="block text-[0.68em] text-[#cdbe91] truncate">
                      {def ? `${def.waves} waves` : ''}
                      {cost > 0 && ` · costs ${cost} life`}
                    </span>
                  </span>
                  <ConfirmButton
                    confirm={!!running}
                    onPress={() => onDrinkPotion(p.id)}
                    disabled={busy || (cost > 0 && ui.lives <= cost)}
                    title={cost > 0 && ui.lives <= cost ? 'Too few lives to drink that' : def?.tip}
                    confirmTitle={`${p.name} still has ${running?.wavesLeft ?? 0} wave${running?.wavesLeft === 1 ? '' : 's'} left. Another dose only starts it over.`}
                  >
                    Drink
                  </ConfirmButton>
                </div>
              );
            })}
          </div>
        )}
      </Section>

      <Section label="Running">
        {ui.activePotions.length === 0 ? (
          <div className="text-[0.7em] text-[#9d8f6e]">Nothing drunk. A dose runs for several waves.</div>
        ) : (
          <div className="flex flex-col gap-[0.25em]">
            {ui.activePotions.map((a) => (
              <div key={a.id} className="rs-panel-inset flex items-center gap-[0.45em] p-[0.35em]">
                <img src={a.icon} alt="" className="w-[1.4em] h-[1.4em] object-contain shrink-0" onError={hideBrokenImg} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[0.74em] text-osrs-orange truncate">{a.name}</span>
                  <span className="block text-[0.68em] text-[#cdbe91] truncate">{a.tip}</span>
                </span>
                <img src={a.labelIcon} alt="" className="w-[1em] h-[1em] object-contain shrink-0" onError={hideBrokenImg} />
                <span className="text-[0.68em] text-[#cdbe91] tabular-nums shrink-0">
                  {a.wavesLeft} wave{a.wavesLeft === 1 ? '' : 's'}
                </span>
              </div>
            ))}
          </div>
        )}
      </Section>
    </>
  );
}
