'use client';

import React from 'react';
import { ASSETS } from '@/lib/game/assets';
import type { TowerType, TargetingPriority, MageMode, Tower } from '@/lib/game/types';
import { hideBrokenImg } from './ui-kit';

/**
 * How a tower presents itself: its icon at every tier, the name it goes by in a
 * list, the targeting-priority glyphs, the wizard's spellbook art, and the copy
 * that states each tower's signature niche.
 *
 * Presentation only — the numbers behind the copy live in
 * `systems/tower-identity.ts`. Moved out of GameRoot.tsx verbatim.
 */

export const TOWER_ORDER: TowerType[] = ['archer', 'wizard', 'cannon', 'tzhaar', 'slayer', 'toxic'];
/**
 * The targeting-priority buttons. Six of them across the panel left no room for
 * words — the truncated stubs ("Str", "Weak", "Clean") were unreadable — so each
 * button is a glyph instead, and the tooltip carries the sentence.
 *
 * They read as one system rather than six unrelated pictures: a **dimension** icon
 * (what is being compared) plus an **arrow** (which end of it — ⬆ most, ⬇ least).
 * `first`/`last` compare *progress along the path*, so they take the run-energy orb
 * in its two real states — the lit gold boot (1070) for the runner out in front, the
 * unlit brown one (1069) for the straggler at the back. Neither `closest` nor
 * `unmarked` has an opposite to pair against, but both still take ⬇ ("least
 * distance", "fewest statuses") so all six obey the same rule.
 *
 * `unmarked` wears the reticle (518, OSRS's click marker) and `closest` the
 * vulnerability splat — swapped on request, and both are placeholders: neither
 * picture argues for its meaning, so better ones are still wanted.
 */
export const PRIORITY_ICONS: Record<TargetingPriority, { icon?: string; arrow?: 'up' | 'down'; alt: string }> = {
  first: { icon: ASSETS.misc.orb_run_on, arrow: 'up', alt: 'Front of the queue' },
  last: { icon: ASSETS.misc.orb_run, arrow: 'down', alt: 'Back of the queue' },
  strongest: { icon: ASSETS.misc.orb_hitpoints, arrow: 'up', alt: 'Most HP' },
  weakest: { icon: ASSETS.misc.orb_hitpoints, arrow: 'down', alt: 'Least HP' },
  closest: { icon: ASSETS.debuffs.vuln, arrow: 'down', alt: 'Nearest' },
  unmarked: { icon: ASSETS.misc.reticle, arrow: 'down', alt: 'Fewest statuses' },
};
/** Sentinel `sellConfirm` value: the pending sell is the whole marquee selection,
 *  not one tower id. Sharing the state keeps Esc/Enter routing in one place. */
export const MULTI_SELL = '__multi__';

/** A labelled row of spell buttons in the multi-select panel (one per spellbook
 *  present in the selection). */
export function MultiSpellRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[0.68em] text-[#d3c3a0] mb-[0.25em] px-[0.2em] uppercase tracking-wide">{label}</div>
      <div className="flex gap-[0.25em]">{children}</div>
    </div>
  );
}

/** One spell button in a {@link MultiSpellRow}. Shows the spell's own icon, lit
 *  when every wizard of that book already agrees on it. */
export function MultiSpellButton({ icon, label, color, active, title, onClick }: {
  icon?: string; label: string; color: string; active: boolean; title: string; onClick: () => void;
}) {
  return (
    <button
      title={title}
      aria-label={label}
      onClick={onClick}
      className={`rs-btn flex-1 flex items-center justify-center px-0 py-[0.25em] ${active ? 'rs-btn-primary' : ''}`}
      style={{ borderBottom: `2px solid ${color}` }}
    >
      {icon
        ? <img src={icon} alt={label} className="w-[1.3em] h-[1.3em] object-contain" onError={hideBrokenImg} />
        : <span className="text-[0.6em]" style={{ color }}>{label}</span>}
    </button>
  );
}

/** Button order, shared by the single-tower and multi-select panels. Three across,
 *  two rows, so each ⬆/⬇ pair sits side by side (path on top, HP below) with the
 *  two arrow-less oddities last in each row. */
export const PRIORITY_ORDER = ['first', 'last', 'closest', 'strongest', 'weakest', 'unmarked'] as const;
/** Spelled-out tooltips — the buttons are glyphs, so the words live here. */
export const PRIORITY_TIPS: Record<TargetingPriority, string> = {
  first: 'First — the enemy furthest along the path',
  last: 'Last — the enemy least far along the path',
  strongest: 'Strongest — the highest current HP',
  weakest: 'Weakest — the lowest current HP',
  closest: 'Closest — the nearest to this tower',
  unmarked: 'Unmarked — carrying no status yet, so poison / burn / slow spreads across the wave instead of re-applying to one enemy',
};

/** One targeting-priority glyph: the dimension icon, with the most/least arrow
 *  tucked into its corner when the priority has one. */
export function PriorityGlyph({ spec }: { spec: (typeof PRIORITY_ICONS)[TargetingPriority] }) {
  // Laid out side by side, not overlaid: at the size these buttons actually get,
  // an arrow tucked into the icon's corner shrinks to an unreadable speck.
  const arrow = spec.arrow && (
    <img
      src={spec.arrow === 'up' ? ASSETS.misc.arrow_up : ASSETS.misc.arrow_down}
      alt=""
      className="w-[0.85em] h-[0.85em] object-contain shrink-0"
      onError={hideBrokenImg}
    />
  );
  return (
    <span className="inline-flex items-center justify-center gap-[0.1em]" aria-label={spec.alt}>
      {spec.icon && <img src={spec.icon} alt="" className="w-[1.15em] h-[1.15em] object-contain shrink-0" onError={hideBrokenImg} />}
      {arrow}
    </span>
  );
}
export const towerIcon = (type: TowerType) => (ASSETS.towers as Record<string, Record<number, string>>)[type]?.[1];
export const towerTierIcon = (type: TowerType, tier: number) => (ASSETS.towers as Record<string, Record<number, string>>)[type]?.[tier];
/** Wiki spell-icon URL for a spell-file name (e.g. `Fire_Wave`), if it exists. */
export const spellIconUrl = (name: string): string | undefined => ASSETS.spells[name];
/** Staves cycled per spellbook in the wizard's on-tile picker. */
export const WIZ_TOWER = ASSETS.towers.wizard as Record<string, string>;
export const WIZARD_STAVES = ['elemental_air', 'elemental_water', 'elemental_earth', 'elemental_fire'].map((k) => WIZ_TOWER[k]);
export const WIZARD_SCEPTRES = ['ancient_ice', 'ancient_blood', 'ancient_shadow', 'ancient_smoke'].map((k) => WIZ_TOWER[k]);
export const WIZARD_UTILITY_STAFF = WIZ_TOWER['utility'];
/** Hotkeys for the selected wizard's spell grid, by slot — the badge on each
 *  button and the keys `GameEngine.selectWizardSlot` answers to. Utility has
 *  only three fields, so it never reaches R. */
export const WIZARD_SLOT_KEYS = ['Q', 'W', 'E', 'R'] as const;
/** The staff sprite a placed wizard shows — matches its spellbook & element,
 *  the same image the board renders. */
export const wizardStaffUrl = (t: { mageMode?: MageMode; element?: string; ancientType?: string }): string | undefined => {
  const mode = t.mageMode ?? 'elemental';
  if (mode === 'ancients') return WIZ_TOWER[`ancient_${t.ancientType ?? 'ice'}`];
  if (mode === 'utility') return WIZ_TOWER['utility'];
  return WIZ_TOWER[`elemental_${t.element ?? 'air'}`];
};
/** Spellbook tab icon for a wizard's mode (Elemental→Standard, Ancients→Ancient,
 *  Utility→Arceuus). */
export const spellbookIcon = (mode?: MageMode): string =>
  mode === 'ancients' ? ASSETS.misc.spellbook_ancient
    : mode === 'utility' ? ASSETS.misc.spellbook_arceuus
      : ASSETS.misc.spellbook_standard;
/** The old 6-tower on-map picker is kept in the source but disabled — the wizard
 *  now gets a spellbook picker on its tile instead. Flip to re-enable it. */
export const SHOW_TOWER_PICKER = false;
/**
 * How a tower reads in a list. Non-wizards use their tier name; a wizard's tier
 * name is shared by all three spellbooks, so it would call an Ancient tower
 * "Elemental". Name it by the book it is on and the element it casts — the two
 * things that actually tell two wizard towers apart.
 */
export function towerListName(t: Tower): string {
  if (t.type !== 'wizard') return t.name;
  const mode = t.mageMode ?? 'elemental';
  const book = mode === 'ancients' ? 'Ancient' : mode === 'utility' ? 'Utility' : 'Elemental';
  const pick = mode === 'ancients' ? (t.ancientType ?? 'ice')
    : mode === 'utility' ? (t.supportSpell ?? 'curse')
      : (t.element ?? 'air');
  return `${book} Wizard · ${pick.charAt(0).toUpperCase()}${pick.slice(1)}`;
}

/** Attack type per tower, for the damage icon/label in the stats panel. */
export const TOWER_COMBAT: Record<TowerType, { icon: string; label: string }> = {
  archer: { icon: ASSETS.misc.ranged_icon, label: 'Ranged' },
  wizard: { icon: ASSETS.misc.magic_icon, label: 'Magic' },
  cannon: { icon: ASSETS.misc.ranged_icon, label: 'Ranged' },
  tzhaar: { icon: ASSETS.misc.strength_icon, label: 'Melee' },
  slayer: { icon: ASSETS.misc.strength_icon, label: 'Melee' },
  toxic: { icon: ASSETS.misc.ranged_icon, label: 'Ranged' },
};

/** Each non-wizard tower's signature niche — the specific scenario where it earns
 *  its slot over the wizard (which owns raw single-target + AoE). Copy mirrors the
 *  maths in systems/tower-identity.ts and the on-hit effects in the engine. Notes
 *  gated on a tier the tower hasn't reached are shown locked, so upgrading carries
 *  a visible promise. The wizard returns null — it has its own spellbook section. */
export function towerSignature(
  type: TowerType,
  level: number,
): { label: string; desc: string; notes: { text: string; active: boolean }[] } | null {
  switch (type) {
    case 'archer':
      return {
        label: 'Twin Shot',
        desc: 'Fast, relentless arrows — raw single-target volume.',
        notes: [
          { text: 'Lv3 Dark Bow: looses a 2nd arrow at the next target', active: level >= 3 },
          { text: 'Lv4: arrows bite harder vs high-HP foes', active: level >= 4 },
        ],
      };
    case 'cannon':
      return {
        label: 'Full Splash',
        desc: 'Full-damage blast — no AoE falloff, unlike Ancients.',
        notes: [{ text: 'Blast radius widens with each tier', active: true }],
      };
    case 'tzhaar':
      return {
        label: 'Knockback',
        desc: 'Shoves enemies back — crowd control the wizard can’t match.',
        notes: [
          { text: 'Every hit also briefly stuns (daggers 0.3–0.45s)', active: true },
          { text: 'Lv3 maul: crushes for the full 0.6s stun', active: level >= 3 },
        ],
      };
    case 'slayer':
      return {
        label: 'Slayer Mark',
        desc: 'Bonus damage vs your task, Superiors and bosses.',
        notes: [
          { text: '+50% vs your current Slayer task', active: true },
          { text: '+30% vs Superiors · +25% vs bosses', active: true },
        ],
      };
    case 'toxic':
      return {
        label: 'Venom',
        desc: 'A separate dark-green venom DoT, apart from poison.',
        notes: [
          { text: 'Each hit ramps the venom up to a damage-scaled cap', active: true },
          { text: 'Keeps ticking after foes leave its range', active: true },
          { text: 'Ignores crowd-control resistance — bites bosses just as hard', active: true },
        ],
      };
    case 'wizard':
      return {
        label: 'Arcane Mastery',
        desc: 'The complete caster — pick a spellbook to specialise.',
        notes: [
          { text: 'Elemental: raw single-target + weakness bonus', active: true },
          { text: 'Ancients: true AoE barrages with a status', active: true },
          { text: 'Utility: an always-on aura that buffs nearby towers', active: true },
        ],
      };
    default:
      return null;
  }
}
