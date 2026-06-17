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
};

/**
 * Lightweight SFX player over HTMLAudioElement. Preloads each source once and
 * plays a clone per trigger so overlapping shots don't cut each other off.
 * A per-key throttle keeps rapid fire from machine-gunning the same clip.
 */
export class SoundManager {
  private readonly cache = new Map<string, HTMLAudioElement>();
  private readonly lastPlayed = new Map<string, number>();
  private muted = false;
  private volume = 0.35;

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

  setMuted(value: boolean) {
    this.muted = value;
  }

  setVolume(value: number) {
    this.volume = Math.max(0, Math.min(1, value));
  }

  play(key: string, throttleMs = 50) {
    if (this.muted) return;
    const base = this.cache.get(key);
    if (!base) return;
    const now = performance.now();
    if (now - (this.lastPlayed.get(key) ?? 0) < throttleMs) return;
    this.lastPlayed.set(key, now);
    try {
      const node = base.cloneNode() as HTMLAudioElement;
      node.volume = this.volume;
      void node.play().catch(() => {}); // ignore autoplay rejections
    } catch {
      /* ignore */
    }
  }
}
