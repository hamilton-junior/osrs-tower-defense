'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ASSETS } from '@/lib/game/assets';
import { MusicPlayer } from '@/lib/game/music/player';

const DEFAULT_VOLUME = 0.75;
const VOLUME_KEY = 'osrs_td_music_level';
/**
 * The key the level was saved under before. Every first visit wrote the default
 * there, so what it holds is mostly not a choice anyone made — dropped, not read.
 */
const OLD_VOLUME_KEY = 'osrs_td_music_volume';

/** The saved level, 0 included: a player who slid the music off wants it off. */
function loadVolume() {
  try {
    const raw = localStorage.getItem(VOLUME_KEY);
    const v = raw === null ? NaN : Number(raw);
    return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : DEFAULT_VOLUME;
  } catch {
    return DEFAULT_VOLUME;
  }
}

/**
 * The soundtrack's React hookup: one `MusicPlayer` for the page's life, playing
 * `track` (switching crossfades), silenced by the game's mute, at a level of its
 * own. The level is saved only when the player moves it, so a later change to the
 * default still reaches everyone who never did. Returns that level and its setter
 * for the volume flyout.
 */
export function useMusic(track: string | null, muted: boolean): [number, (v: number) => void] {
  const [volume, setVolume] = useState(loadVolume);
  const player = useRef<MusicPlayer | null>(null);

  useEffect(() => {
    try { localStorage.removeItem(OLD_VOLUME_KEY); } catch { /* ignore */ }
    const p = new MusicPlayer(ASSETS.music);
    player.current = p;
    return () => {
      p.dispose();
      player.current = null;
    };
  }, []);

  useEffect(() => { player.current?.play(track); }, [track]);
  useEffect(() => { player.current?.setMuted(muted); }, [muted]);
  useEffect(() => { player.current?.setVolume(volume); }, [volume]);

  const choose = useCallback((v: number) => {
    setVolume(v);
    try { localStorage.setItem(VOLUME_KEY, String(v)); } catch { /* ignore */ }
  }, []);

  return [volume, choose];
}
