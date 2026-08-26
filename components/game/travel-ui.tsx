'use client';

import React from 'react';
import { ASSETS } from '@/lib/game/assets';
import type { UIState } from '@/lib/game/core/engine';
import { BIOMES, type BiomeId } from '@/lib/game/data/biomes';
import { fs, hideBrokenImg } from './ui-kit';

/**
 * **The fork in the road.** Every few waves the run reaches a turn and picks the
 * region it marches into next — the board is re-skinned in that region's palette
 * and starts sending that region's own monsters.
 *
 * The card sells the destination with the two things that actually change: a
 * painted strip of the region's real ground/road palette (the same colours the
 * renderer will draw the board in), and the locals it will send. Nothing here is a
 * stand-in — the palette is the biome's own table and each monster wears its own
 * live sprite.
 */

type TravelOption = NonNullable<UIState['pendingTravel']>[number];

/** How many locals a card shows before it stops listing them. */
const LOCALS_SHOWN = 5;

/** A band of the card, sized as a percentage of its height (mirrors the relic card). */
const band = (bg: string, pct: number): React.CSSProperties => ({
  background: bg,
  height: `${pct}%`,
  borderRadius: 6,
  flex: '0 0 auto',
});

/** One region on offer. Clicking marches the run there. */
export function TravelCardView({ option, onPick }: { option: TravelOption; onPick: () => void }) {
  const biome = BIOMES[option.id as BiomeId] ?? BIOMES.lumbridge;
  const enemyIcons = ASSETS.enemies as Record<string, string | undefined>;
  const locals = option.locals.slice(0, LOCALS_SHOWN);
  const k = 1.5;
  const fz = (min: number, vw: number, max: number) => fs(`clamp(${min * k}px, ${(vw * k).toFixed(3)}vw, ${max * k}px)`);
  return (
    <button
      onClick={onPick}
      title={`Travel to ${biome.name}`}
      className="draft-card group relative flex flex-col overflow-hidden text-center"
      style={{
        width: 'clamp(198px, 18vw, 252px)',
        aspectRatio: '180 / 260',
        background: '#2A2A2A',
        border: '3px solid #000000',
        borderRadius: 10,
        padding: 3,
        gap: 2,
        cursor: 'pointer',
        boxShadow: `0 0 0 1px #000, 0 8px 20px rgba(0,0,0,0.6), 0 0 16px ${biome.road.centre}55`,
      }}
    >
      {/* name band (12%) */}
      <div className="flex items-center justify-center px-1" style={band('#222222', 12)}>
        <span className="font-osrs leading-none text-osrs-orange" style={{ fontSize: fz(8, 0.74, 12), textShadow: '0 1px 1px #000' }}>
          {biome.name}
        </span>
      </div>

      {/* the ground itself (48%) — the region's real palette, road and all */}
      <div
        className="relative overflow-hidden"
        style={{
          ...band(`linear-gradient(${biome.bgTop}, ${biome.bgBottom})`, 48),
          boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.55)',
        }}
      >
        {/* a length of that region's road, drawn in the same layers the board uses */}
        <span
          className="absolute left-0 right-0"
          style={{ top: '46%', height: '22%', background: biome.road.border }}
        />
        <span
          className="absolute left-0 right-0"
          style={{ top: '50%', height: '14%', background: biome.road.mid }}
        />
        <span
          className="absolute left-0 right-0"
          style={{ top: '53%', height: '6%', background: biome.road.centre }}
        />
        {/* scenery: a bush and a rock in the region's own decor tones */}
        <span className="absolute" style={{ left: '14%', top: '18%', width: '14%', height: '18%', borderRadius: '50%', background: biome.decor.bush }} />
        <span className="absolute" style={{ left: '68%', top: '74%', width: '12%', height: '12%', borderRadius: 3, background: biome.decor.rock }} />
      </div>

      {/* locals band (10%) */}
      <div className="flex items-center justify-center" style={band('#222222', 10)}>
        <span className="font-osrs uppercase tracking-wide text-[#cdbe91]" style={{ fontSize: fz(7, 0.56, 10), textShadow: '0 1px 1px #000' }}>
          {locals.length ? 'Locals' : 'No locals'}
        </span>
      </div>

      {/* who lives there (28%) */}
      <div className="flex items-center justify-center gap-[0.3em] px-2 flex-wrap" style={band('#2F2F2F', 28)}>
        {locals.length === 0 ? (
          <span className="font-osrs leading-tight text-[#e7dcc0]" style={{ fontSize: fz(8, 0.72, 12) }}>
            Only the wandering sort come here.
          </span>
        ) : locals.map((m) => (
          <img
            key={m.type}
            src={enemyIcons[m.type] ?? ''}
            alt={m.name}
            title={m.name}
            className="object-contain"
            style={{ width: '1.9em', height: '1.9em', filter: 'drop-shadow(0 2px 3px rgba(0,0,0,0.7))' }}
            onError={hideBrokenImg}
          />
        ))}
      </div>
    </button>
  );
}
