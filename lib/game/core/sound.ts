import { ASSETS } from '../assets';

/**
 * The sound effects the game can play, mapped to their (remote OSRS wiki) URLs.
 * Keys are stable names the engine references; swapping a URL only touches here.
 */
export const GAME_SOUNDS: Record<string, string> = {
  fire_archer: ASSETS.sounds.shoot.archer[1],
  fire_wizard: ASSETS.sounds.shoot.wizard_air[0],
  fire_cannon: ASSETS.sounds.misc.cannon_fire,
  fire_tzhaar: ASSETS.sounds.shoot.tzhaar[1],
  fire_slayer: ASSETS.sounds.shoot.slayer[1],
  fire_toxic: ASSETS.sounds.shoot.toxic[1],
  hit: ASSETS.sounds.misc.hit,
  base_hit: ASSETS.sounds.misc.block, // player taking damage, no armour (take-damage splat 510) — on a leak
  death: ASSETS.sounds.misc.kill,
  wave: ASSETS.sounds.misc.wave,
  fireworks: ASSETS.sounds.misc.fireworks, // relic pickup only — too festive for a routine build
  sell: ASSETS.sounds.misc.sell,
  click: ASSETS.sounds.misc.click,
  game_over: ASSETS.sounds.misc.game_over, // the "You Are Dead!" jingle
  prayer_on: ASSETS.sounds.misc.prayer_on,
  prayer_off: ASSETS.sounds.misc.prayer_off,
  select: ASSETS.sounds.misc.select,
  interface_open: ASSETS.sounds.misc.interface_open,
  interface_close: ASSETS.sounds.misc.interface_close,
};

// --- Per-prayer activation sounds ----------------------------------------
// Each prayer plays its own OSRS activation clip where one exists (decoded from
// the cache, see ASSETS.sounds.prayer); prayers without a unique clip fall back
// to the generic `prayer_on` vwoom. The engine calls `prayer_on_<id>`, which is
// always registered here, so the lookup never misses.
const PRAYER_SOUNDS = ASSETS.sounds.prayer as Record<string, string>;
export const PRAYER_IDS = [
  'burst_of_strength', 'sharp_eye', 'mystic_will', 'hawk_eye', 'mystic_lore',
  'ultimate_strength', 'protect_from_magic', 'protect_from_missiles',
  'protect_from_melee', 'eagle_eye', 'mystic_might', 'piety', 'rigour', 'augury',
];
for (const id of PRAYER_IDS) {
  GAME_SOUNDS[`prayer_on_${id}`] = PRAYER_SOUNDS[id] ?? ASSETS.sounds.misc.prayer_on;
}

// --- Per-enemy-type death sounds -----------------------------------------
// The engine plays `death_<type>` on a kill; each enemy has its own death clip
// decoded from the cache (see ASSETS.sounds.death, keyed by enemy type). Falls
// back to the generic `death` key for anything unmapped.
const DEATH = ASSETS.sounds.death as Record<string, string>;
for (const [type, url] of Object.entries(DEATH)) GAME_SOUNDS[`death_${type}`] = url;

// Per-spell cast sounds, keyed `cast_<element|ancient>_<level>` (+ `cast_support`).
// The wizard plays the clip for the exact spell it casts, and the engine uses the
// clip's duration to time the projectile's flight (see fireTowers).
const shoot = ASSETS.sounds.shoot as Record<string, Record<number, string>>;
// Elemental towers have five tiers (Strike/Bolt/Blast/Wave/Surge); the wizard
// plays `cast_<el>_<level>` on fire. (Surge = level 5 — previously unmapped.)
for (const el of ['air', 'water', 'earth', 'fire']) {
  for (let lvl = 1; lvl <= 5; lvl++) GAME_SOUNDS[`cast_${el}_${lvl}`] = shoot[`wizard_${el}`][lvl - 1];
}
// Ancient towers have four tiers (Rush/Burst/Blitz/Barrage); cast is shared per
// element (every level maps to the same `ancient_<el>` clip).
for (const an of ['ice', 'blood', 'shadow', 'smoke']) {
  for (let lvl = 1; lvl <= 4; lvl++) GAME_SOUNDS[`cast_${an}_${lvl}`] = shoot[`ancient_${an}`][lvl - 1];
}
GAME_SOUNDS['cast_support'] = shoot.support[1];

// Spell IMPACT sounds, keyed `hit_<el|anc>_<level>`, played when the bolt lands
// (see GameEngine.hit). Pairs 1:1 with each cast above so every spell has the
// authentic cast-on-fire + impact-on-hit it does in OSRS.
const spellHit = ASSETS.sounds.spellHit as Record<string, string>;
for (const [key, url] of Object.entries(spellHit)) GAME_SOUNDS[`hit_${key}`] = url;

/** Sound categories: `combat` rings out with the fight (and is faded/suppressed
 *  between waves); `ui` (interface, prayers, GE, jingles) always plays. */
export type SoundCategory = 'combat' | 'ui';
export function soundCategory(key: string): SoundCategory {
  if (/^(fire_|cast_|hit_|death_)/.test(key)) return 'combat';
  return key === 'hit' || key === 'death' || key === 'base_hit' ? 'combat' : 'ui';
}

/**
 * Lightweight SFX player over HTMLAudioElement. Preloads each source once and
 * plays a clone per trigger so overlapping shots don't cut each other off.
 * A per-key throttle keeps rapid fire from machine-gunning the same clip.
 */
export class SoundManager {
  private readonly cache = new Map<string, HTMLAudioElement>();
  /** Clip durations (s), captured on `loadedmetadata` so the value survives
   *  even if the live element is mid-seek, and is ready before the first play. */
  private readonly durations = new Map<string, number>();
  private readonly lastPlayed = new Map<string, number>();
  /** Small per-key ring of reusable nodes (see `play`). */
  private readonly pools = new Map<string, HTMLAudioElement[]>();
  private readonly poolIdx = new Map<string, number>();
  private static readonly POOL_SIZE = 4;
  private muted = false;
  /** Element gain at slider 100% — the comfortable game loudness (25% quieter
   *  than the old 0.18). The UI slider is a 0..1 fraction OF this, so 100% never
   *  blasts and the player only turns it down from a sane ceiling. */
  private static readonly MAX_GAIN = 0.135;
  /** User-facing volume on a 0..1 scale (what the UI shows as a %). Starts at
   *  75% so the default isn't too loud but there's headroom to raise it. */
  private volume = 0.75;
  /** While set, combat-category plays are dropped (between waves — stragglers
   *  landing after the clear stay silent). UI sounds are unaffected. */
  private combatSuppressed = false;

  /** Real HTMLAudioElement gain for the current slider position. */
  private gain() {
    return this.volume * SoundManager.MAX_GAIN;
  }

  constructor(sources: Record<string, string>) {
    if (typeof Audio === 'undefined') return; // SSR / non-browser guard
    for (const [key, url] of Object.entries(sources)) {
      const audio = new Audio();
      audio.preload = 'auto';
      audio.volume = this.gain();
      // Cache the duration the moment metadata decodes, so projectiles fired on
      // the very first cast already get the exact clip length (no 0.6s guess).
      audio.addEventListener('loadedmetadata', () => {
        if (isFinite(audio.duration)) this.durations.set(key, audio.duration);
      });
      audio.src = url;
      audio.load(); // force eager fetch/decode now, not lazily on first play
      this.cache.set(key, audio);
    }
  }

  get isMuted() {
    return this.muted;
  }

  get level() {
    return this.volume;
  }

  setMuted(value: boolean) {
    this.muted = value;
  }

  setVolume(value: number) {
    this.volume = Math.max(0, Math.min(1, value));
  }

  setCombatSuppressed(on: boolean) {
    this.combatSuppressed = on;
  }

  /** Fade every currently-ringing combat clip to silence over `secs`, then stop
   *  it and restore the node's volume for future plays. Also suppresses new
   *  combat plays until {@link setCombatSuppressed}(false). */
  fadeCombat(secs = 0.6) {
    this.combatSuppressed = true;
    if (typeof requestAnimationFrame === 'undefined') return; // SSR guard
    for (const [key, pool] of this.pools) {
      if (soundCategory(key) !== 'combat') continue;
      for (const node of pool) {
        if (node.paused || node.ended) continue;
        const startVol = node.volume;
        const t0 = performance.now();
        const step = () => {
          const k = Math.min(1, (performance.now() - t0) / (secs * 1000));
          node.volume = startVol * (1 - k);
          if (k < 1 && !node.paused) requestAnimationFrame(step);
          else {
            try { node.pause(); } catch { /* ignore */ }
            node.volume = this.gain();
          }
        };
        requestAnimationFrame(step);
      }
    }
  }

  /** Loaded duration (seconds) of a clip, or NaN if unknown/not yet decoded.
   *  Prefers the value captured at `loadedmetadata`, falling back to the live
   *  element (covers clips already decoded before the listener attached). */
  duration(key: string): number {
    const cached = this.durations.get(key);
    if (cached !== undefined) return cached;
    const audio = this.cache.get(key);
    return audio && isFinite(audio.duration) ? audio.duration : NaN;
  }

  play(key: string, throttleMs = 50) {
    if (this.muted) return;
    if (this.combatSuppressed && soundCategory(key) === 'combat') return;
    const base = this.cache.get(key);
    if (!base) return;
    const now = performance.now();
    if (now - (this.lastPlayed.get(key) ?? 0) < throttleMs) return;
    this.lastPlayed.set(key, now);
    // Reuse a small bounded ring of nodes per key instead of cloneNode() on every
    // shot. Unbounded clones (e.g. at 5× speed with many towers) exhaust the
    // browser's media-element budget and silence ALL audio; a fixed pool can't.
    let pool = this.pools.get(key);
    if (!pool) {
      pool = Array.from({ length: SoundManager.POOL_SIZE }, () => {
        const a = base.cloneNode() as HTMLAudioElement;
        a.volume = this.gain();
        return a;
      });
      this.pools.set(key, pool);
      this.poolIdx.set(key, 0);
    }
    const idx = (this.poolIdx.get(key) ?? 0) % pool.length;
    this.poolIdx.set(key, idx + 1);
    const node = pool[idx];
    try {
      node.volume = this.gain();
      node.currentTime = 0; // restart this voice
      void node.play().catch(() => {}); // ignore autoplay rejections
    } catch {
      /* ignore */
    }
  }
}
