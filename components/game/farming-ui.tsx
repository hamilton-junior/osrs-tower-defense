'use client';

import React, { useState } from 'react';
import { ASSETS, coinsIcon } from '@/lib/game/assets';
import type { UIState } from '@/lib/game/core/engine';
import { DIVERSION_BY_ID } from '@/lib/game/data/diversions';
import { SEEDS, SEED_BY_ID, type SeedDef, type SeedId } from '@/lib/game/data/farming';
import { seedCost } from '@/lib/game/systems/farming';
import type { CombatStyle } from '@/lib/game/types';
import { MovablePanel } from './MovablePanel';
import { fmt, fs, hideBrokenImg, pct, Price } from './ui-kit';

/**
 * The **farming patch** interface — what opens when an allotment is clicked.
 *
 * It is laid out the way OSRS lays out a Collection Log, because the two screens
 * answer the same question: *out of a fixed list of things, which one do I want to
 * look at?* So the fourteen seeds are a grid of sunken item cards at the top, and
 * whichever one is picked is written out underneath in a detail card — the herb it
 * becomes, what it costs, how long it keeps the patch, how big the buff is and who
 * it reaches. Picking a tile only reads it; the Sow button below the card is what
 * puts a seed in the ground. That split is the point of the layout: a player can
 * leaf through the whole ladder without ever spending a coin by accident.
 *
 * The grid runs in the ladder's own order, Guam 9 through Torstol 85, with no tabs
 * over it. The ladder *is* the grouping — it already sorts the herbs by ambition,
 * and a tab strip on fourteen entries would hide half the list to save one row.
 * A seed that costs more gold than the run has is darkened the way an unobtained
 * log entry is, but it stays clickable, because reading what a Torstol does is how
 * a player decides to save up for one.
 *
 * A patch with something already in it gets the same frame and the same detail
 * card, minus the grid: the herb, a bar showing how far along it is, the buff it
 * is going to hand over, and the spade. The panel floats over the board rather
 * than living in the bottom bar because the patch it is filling is on the board,
 * and it is a between-waves interface — pressing Start Wave closes it. It is
 * movable like every other floating panel, so it never has to sit on the patch.
 */

/** Who a herb's buff reaches, as one short phrase for the detail card's last row.
 *  The three tower multipliers can be narrowed to a combat style; the other three
 *  effects don't touch towers at all, so they name what they do touch instead. */
const STYLE_TOWERS: Record<CombatStyle, string> = {
  melee: 'Melee towers',
  ranged: 'Ranged towers',
  magic: 'Magic towers',
};

function scopeOf(s: SeedDef): string {
  if (s.effect === 'prayer') return 'Prayer drain';
  if (s.effect === 'life') return 'On wave clear';
  if (s.effect === 'gold') return 'Kill rewards';
  return s.style ? STYLE_TOWERS[s.style] : 'Every tower';
}

/** How big the buff is. Every effect is a fraction except `life`, which is lives. */
function boostOf(s: SeedDef): string {
  return s.effect === 'life' ? `+${s.amount} life` : pct(s.amount);
}

/** The herb's name and its signature badge — the detail card's heading, shared by
 *  the seed being considered and the herb already in the ground. */
function HerbHeading({ seed }: { seed: SeedDef }) {
  return (
    <>
      <div className="text-[0.82em] text-osrs-orange font-bold leading-tight">{seed.herbName}</div>
      <div className="flex items-center gap-[0.3em] text-[0.62em] uppercase tracking-wide text-osrs-yellow mt-[0.1em]">
        <img src={seed.signature.icon} alt="" className="w-[1.1em] h-[1.1em] object-contain" onError={hideBrokenImg} />
        <span>{seed.signature.label}</span>
        <span className="text-[#8c8069] normal-case tracking-normal">· Farming {seed.level}</span>
      </div>
    </>
  );
}

/** One label/value line of the detail card's stat block. A row whose value is
 *  gold carries the coin pile after it, the same as every price in the game. */
function Row({ label, value, tone, icon }: { label: string; value: string; tone?: string; icon?: string }) {
  return (
    <>
      <span className="text-[0.68em] text-[#b3a585]">{label}</span>
      <span className={`text-[0.68em] text-right tabular-nums flex items-center justify-end gap-[0.25em] ${tone ?? 'text-osrs-yellow'}`}>
        {value}
        {icon && <img src={icon} alt="" className="w-[1.1em] h-[1.1em] object-contain shrink-0" onError={hideBrokenImg} />}
      </span>
    </>
  );
}

export interface SowPanelProps {
  ui: UIState;
  /** The patch this panel is filling. Never null — `GameRoot` only mounts the
   *  panel while one is open. */
  patchId: string;
  globalLock: boolean;
  onSow: (patchId: string, seedId: SeedId) => void;
  onDigUp: (patchId: string) => void;
  onMovePlot: (patchId: string) => void;
  onBuyPlot: () => void;
  onClose: () => void;
}

export function SowPanel({ ui, patchId, globalLock, onSow, onDigUp, onMovePlot, onBuyPlot, onClose }: SowPanelProps) {
  const plot = ui.farmPatches.find((p) => p.id === patchId) ?? null;
  const growing = plot?.seedId ? SEED_BY_ID[plot.seedId] : null;
  // Which tile the grid is reading out. There is always one, so the detail card
  // and the Sow button are always there and the panel never changes height as a
  // player leafs through the ladder.
  // Seeds the player carries (the Strange Plant's) sow for nothing, so the panel
  // opens on one of those when there is one.
  const heldOf = (id: SeedId) =>
    ui.inventory.reduce((n, s) => n + (s?.kind === 'seed' && s.id === id ? s.count : 0), 0);
  const [picked, setPicked] = useState<SeedId>(
    () => (ui.inventory.find((s) => s?.kind === 'seed')?.id as SeedId | undefined) ?? SEEDS[0].id,
  );
  // Digging up is the one irreversible button on the patch: the herb is gone and
  // the gold with it, and a misclick costs several waves of growth. So it asks
  // first, the way OSRS asks before it destroys an item.
  const [confirmDig, setConfirmDig] = useState(false);
  const seed = SEED_BY_ID[picked];
  // Seeds cost a little more the deeper the run goes, so every price on this panel
  // is the price *now* — except the one in the dig-up warning, which is the gold
  // the player actually handed over for what is in the ground.
  const held = heldOf(picked) > 0;
  const price = held ? 0 : seedCost(seed, ui.wave);
  const broke = ui.money < price;
  // A patch mid-growth: how many of its waves are behind it.
  const grown = growing && plot ? growing.waves - plot.wavesLeft : 0;

  return (
    <div
      className="absolute left-1/2 bottom-[14%] -translate-x-1/2 z-30"
      style={{ fontSize: fs('clamp(14px, 0.95vw, 20px)') }}
    >
      <MovablePanel
        id="sow"
        globalLock={globalLock}
        className="rs-panel relative p-[0.6em] w-[24em] flex flex-col"
        style={{ maxHeight: '78vh' }}
      >
        <div className="rs-panel-title flex items-center justify-between" style={{ fontSize: '1em' }}>
          <span className="flex items-center gap-2">
            <img
              src={growing ? growing.herbIcon : ASSETS.misc.farming_icon}
              alt=""
              className="w-[1.3em] h-[1.3em] object-contain"
              onError={hideBrokenImg}
            />
            {growing ? growing.herbName : 'Allotment'}
          </span>
          <button onClick={onClose} title="Close the patch (Esc)" className="rs-btn px-[0.5em] py-0 text-[0.8em]">✕</button>
        </div>

        {growing && plot ? (
          <>
            <p className="text-[0.66em] text-[#b3a585] leading-snug mt-[0.35em] px-[0.1em]">
              It grows while you fight. Dig it up if you want the plot back.
            </p>
            <div className="rs-panel-inset mt-[0.45em] p-[0.55em] flex gap-[0.6em] items-start">
              <img
                src={growing.herbIcon}
                alt=""
                className="w-[3.4em] h-[3.4em] object-contain shrink-0"
                style={{ imageRendering: 'pixelated' }}
                onError={hideBrokenImg}
              />
              <div className="flex-1 min-w-0">
                <HerbHeading seed={growing} />
                <p className="text-[0.66em] text-[#cdbe91] leading-snug mt-[0.3em]">{growing.tip}</p>
                <div className="grid grid-cols-2 gap-x-[0.5em] gap-y-[0.15em] mt-[0.35em] items-center">
                  <Row label="Boost" value={boostOf(growing)} />
                  <Row label="Affects" value={scopeOf(growing)} tone="text-[#cdbe91]" />
                </div>
              </div>
            </div>
            <div className="mt-[0.45em] px-[0.1em]">
              <div className="flex items-center justify-between text-[0.68em] mb-[0.2em]">
                <span className="text-[#b3a585]">Ready in</span>
                <span className="text-osrs-yellow tabular-nums">
                  {plot.wavesLeft} wave{plot.wavesLeft === 1 ? '' : 's'}
                </span>
              </div>
              <div className="rs-progress" title={`${grown} of ${growing.waves} waves grown`}>
                <div className="rs-progress-fill" style={{ width: `${(grown / growing.waves) * 100}%` }} />
              </div>
            </div>
            {plot.tended && (
              <p className="flex items-center gap-[0.35em] text-[0.66em] text-[#cdbe91] leading-snug mt-[0.35em] px-[0.1em]">
                <img
                  src={DIVERSION_BY_ID.tool_leprechaun.sprite}
                  alt=""
                  className="w-[1.3em] h-[1.3em] object-contain shrink-0"
                  onError={hideBrokenImg}
                />
                The Tool Leprechaun tended this herb.
              </p>
            )}
            {confirmDig ? (
              <div className="rs-panel-inset mt-[0.55em] p-[0.45em]">
                <p className="text-[0.68em] text-[#cdbe91] leading-snug text-center">
                  Dig up the {growing.herbName}? {plot.paid > 0 ? `You lose the ${fmt(plot.paid)} gp it cost.` : 'You lose the seed.'}
                </p>
                <div className="flex gap-[0.35em] mt-[0.4em]">
                  <button
                    className="rs-btn flex-1 py-[0.3em] text-[0.72em] flex items-center justify-center gap-[0.35em]"
                    title={`Dig up the ${growing.seedName} and free the plot`}
                    onClick={() => { setConfirmDig(false); onDigUp(patchId); }}
                  >
                    <img src={ASSETS.misc.spade} alt="" className="w-[1.1em] h-[1.1em] object-contain" onError={hideBrokenImg} />
                    <span>Dig it up</span>
                  </button>
                  <button
                    className="rs-btn flex-1 py-[0.3em] text-[0.72em]"
                    title={`Leave the ${growing.seedName} growing`}
                    onClick={() => setConfirmDig(false)}
                  >
                    Leave it
                  </button>
                </div>
              </div>
            ) : (
              <button
                className="rs-btn w-full py-[0.35em] text-[0.74em] mt-[0.55em] flex items-center justify-center gap-[0.4em]"
                title={plot.paid > 0
                  ? `Dig up the ${growing.seedName}. You lose the ${fmt(plot.paid)} gp it cost`
                  : `Dig up the ${growing.seedName}. You lose the seed`}
                onClick={() => setConfirmDig(true)}
              >
                <img src={ASSETS.misc.spade} alt="" className="w-[1.1em] h-[1.1em] object-contain" onError={hideBrokenImg} />
                <span>Dig it up</span>
              </button>
            )}
          </>
        ) : (
          <>
            <p className="text-[0.66em] text-[#b3a585] leading-snug mt-[0.35em] px-[0.1em]">
              It grows while you fight. The herb goes into your pouch.
            </p>
            {/* The tile wears the herb, not the seed. OSRS draws every herb seed as
                the same small speck on a big canvas, so a grid of seed icons reads as
                fourteen identical dots; the herbs are the part a player can tell
                apart at a glance, and the herb is what the tile is promising. The
                seed keeps its own icon on the Sow button below, where it belongs. */}
            <div className="grid grid-cols-5 gap-[0.3em] mt-[0.45em] overflow-y-auto custom-scrollbar pr-[0.15em] min-h-0">
              {SEEDS.map((s) => {
                const have = heldOf(s.id);
                const cost = have > 0 ? 0 : seedCost(s, ui.wave);
                const cant = ui.money < cost;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setPicked(s.id)}
                    title={have > 0
                      ? `${s.seedName}: you carry ${have}, so it sows for free`
                      : cant
                        ? `${s.seedName} — ${s.signature.label}, ${cost} gp, more than you have`
                        : `${s.seedName} — ${s.signature.label}, ${cost} gp, ready in ${s.waves} waves`}
                    className={`rs-log-entry rs-log-sm ${cant ? 'rs-log-locked' : ''} ${s.id === picked ? 'rs-log-pick' : ''}`}
                  >
                    <img src={s.signature.icon} alt="" className="rs-log-sig" onError={hideBrokenImg} />
                    {have > 0 && (
                      <span
                        className="absolute top-[0.1em] right-[0.2em] flex items-center text-[0.55em] text-osrs-green tabular-nums"
                        style={{ textShadow: '1px 1px 0 #000' }}
                      >
                        <img src={s.seedIcon} alt="" className="w-[1.4em] h-[1.4em] object-contain" onError={hideBrokenImg} />
                        {have}
                      </span>
                    )}
                    <div className="rs-log-sprite">
                      <img
                        src={s.herbIcon}
                        alt=""
                        className="w-full h-full object-contain"
                        style={{ imageRendering: 'pixelated' }}
                        onError={hideBrokenImg}
                      />
                    </div>
                    <span className="rs-log-name">{s.herbName}</span>
                    <span className="rs-log-kc flex items-center justify-center gap-[0.25em]">
                      <img
                        src={ASSETS.misc.farming_icon}
                        alt=""
                        className="w-[1em] h-[1em] object-contain"
                        onError={hideBrokenImg}
                      />
                      {s.level}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="rs-panel-inset mt-[0.45em] p-[0.55em] flex gap-[0.6em] items-start">
              <img
                src={seed.herbIcon}
                alt=""
                className="w-[3.4em] h-[3.4em] object-contain shrink-0"
                style={{ imageRendering: 'pixelated' }}
                onError={hideBrokenImg}
              />
              <div className="flex-1 min-w-0">
                <HerbHeading seed={seed} />
                <p className="text-[0.66em] text-[#cdbe91] leading-snug mt-[0.3em]">{seed.tip}</p>
                <div className="grid grid-cols-2 gap-x-[0.5em] gap-y-[0.15em] mt-[0.35em] items-center">
                  {held
                    ? <Row label="Cost" value="Free" tone="text-osrs-green" />
                    : <Row label="Cost" value={fmt(price)} icon={coinsIcon(price)} tone={broke ? 'text-osrs-red' : 'text-osrs-yellow'} />}
                  <Row label="Ready in" value={`${seed.waves} waves`} />
                  <Row label="Boost" value={boostOf(seed)} />
                  <Row label="Affects" value={scopeOf(seed)} tone="text-[#cdbe91]" />
                </div>
              </div>
            </div>
            <button
              className="rs-btn rs-btn-primary w-full py-[0.35em] text-[0.74em] mt-[0.45em] flex items-center justify-center gap-[0.4em] disabled:opacity-50"
              disabled={broke}
              title={held
                ? `Sow your ${seed.seedName}, ready in ${seed.waves} waves`
                : broke ? `${seed.seedName} costs ${fmt(price)} gp` : `Sow a ${seed.seedName}, ready in ${seed.waves} waves`}
              onClick={() => onSow(patchId, seed.id)}
            >
              <img src={seed.seedIcon} alt="" className="w-[1.1em] h-[1.1em] object-contain" onError={hideBrokenImg} />
              <span>Sow the {seed.seedName}</span>
              {held ? <span className="text-osrs-green">Free</span> : <Price amount={price} afford={!broke} />}
            </button>
          </>
        )}

        {/* The ground, rather than what is in it. Moving a plot is free — an
            allotment the map dealt behind a boulder is the map's fault, not a
            thing to charge for — and a second one is the expensive half. */}
        <div className="flex gap-[0.35em] mt-[0.5em]">
          <button
            className="rs-btn flex-1 py-[0.3em] text-[0.72em] flex items-center justify-center gap-[0.35em]"
            title="Move this allotment somewhere else, free of charge"
            onClick={() => onMovePlot(patchId)}
          >
            <img src={ASSETS.misc.farming_icon} alt="" className="w-[1.1em] h-[1.1em] object-contain" onError={hideBrokenImg} />
            <span>Move plot</span>
          </button>
          <button
            className="rs-btn flex-1 py-[0.3em] text-[0.72em] flex items-center justify-center gap-[0.35em] disabled:opacity-50"
            disabled={ui.money < ui.plotCost}
            title={ui.money < ui.plotCost
              ? `Another allotment costs ${fmt(ui.plotCost)} gp`
              : `Buy another allotment for ${fmt(ui.plotCost)} gp. The next one costs double`}
            onClick={onBuyPlot}
          >
            <span>Buy plot</span>
            <Price amount={ui.plotCost} afford={ui.money >= ui.plotCost} />
          </button>
        </div>
      </MovablePanel>
    </div>
  );
}
