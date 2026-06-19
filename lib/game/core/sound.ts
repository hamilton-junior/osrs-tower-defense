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
  death: ASSETS.sounds.misc.kill,
  wave: ASSETS.sounds.misc.wave,
  place: ASSETS.sounds.misc.upgrade,
  sell: ASSETS.sounds.misc.sell,
  click: ASSETS.sounds.misc.click,
  game_over: ASSETS.sounds.misc.death,
  prayer_on: ASSETS.sounds.misc.prayer_on,
  prayer_off: ASSETS.sounds.misc.prayer_off,
};

// Per-spell cast sounds, keyed `cast_<element|ancient>_<level>` (+ `cast_support`).
// The wizard plays the clip for the exact spell it casts, and the engine uses the
// clip's duration to time the projectile's flight (see fireTowers).
const shoot = ASSETS.sounds.shoot as Record<string, Record<number, string>>;
for (const el of ['air', 'water', 'earth', 'fire']) {
  for (let lvl = 1; lvl <= 4; lvl++) GAME_SOUNDS[`cast_${el}_${lvl}`] = shoot[`wizard_${el}`][lvl - 1];
}
for (const an of ['ice', 'blood', 'shadow', 'smoke']) {
  for (let lvl = 1; lvl <= 4; lvl++) GAME_SOUNDS[`cast_${an}_${lvl}`] = shoot[`ancient_${an}`][lvl - 1];
}
GAME_SOUNDS['cast_support'] = shoot.support[1];

/**
 * Lightweight SFX player over HTMLAudioElement. Preloads each source once and
 * plays a clone per trigger so overlapping shots don't cut each other off.
 * A per-key throttle keeps rapid fire from machine-gunning the same clip.
 */
export class SoundManager {
  private readonly cache = new Map<string, HTMLAudioElement>();
  private readonly lastPlayed = new Map<string, number>();
  /** Small per-key ring of reusable nodes (see `play`). */
  private readonly pools = new Map<string, HTMLAudioElement[]>();
  private readonly poolIdx = new Map<string, number>();
  private static readonly POOL_SIZE = 4;
  private muted = false;
  private volume = 0.18;

  constructor(sources: Record<string, string>) {
    if (typeof Audio === 'undefined') return; // SSR / non-browser guard
    for (const [key, url] of Object.entries(sources)) {
      const audio = new Audio();
      audio.src = url;
      audio.preload = 'auto';
      audio.volume = this.volume;
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

  /** Loaded duration (seconds) of a clip, or NaN if unknown/not yet decoded. */
  duration(key: string): number {
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
