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
  place: ASSETS.sounds.misc.upgrade,
  sell: ASSETS.sounds.misc.sell,
  click: ASSETS.sounds.misc.click,
  game_over: ASSETS.sounds.misc.death,
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
  private volume = 0.135; // default game loudness (25% quieter than the old 0.18)

  constructor(sources: Record<string, string>) {
    if (typeof Audio === 'undefined') return; // SSR / non-browser guard
    for (const [key, url] of Object.entries(sources)) {
      const audio = new Audio();
      audio.preload = 'auto';
      audio.volume = this.volume;
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
        a.volume = this.volume;
        return a;
      });
      this.pools.set(key, pool);
      this.poolIdx.set(key, 0);
    }
    const idx = (this.poolIdx.get(key) ?? 0) % pool.length;
    this.poolIdx.set(key, idx + 1);
    const node = pool[idx];
    try {
      node.volume = this.volume;
      node.currentTime = 0; // restart this voice
      void node.play().catch(() => {}); // ignore autoplay rejections
    } catch {
      /* ignore */
    }
  }
}
