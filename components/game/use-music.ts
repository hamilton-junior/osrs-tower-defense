'use client';

import { useEffect, useRef, useState } from 'react';
import { ASSETS } from '@/lib/game/assets';
import { MusicPlayer } from '@/lib/game/music/player';
import { loadNum } from './ui-kit';

const VOLUME_KEY = 'osrs_td_music_volume';

/**
 * The soundtrack's React hookup: one `MusicPlayer` for the page's life, playing
 * `track` (switching crossfades), silenced by the game's mute, at a level of its
 * own that is saved like the interface scale. Returns that level and its setter
 * for the volume flyout.
 */
export function useMusic(track: string | null, muted: boolean): [number, (v: number) => void] {
  const [volume, setVolume] = useState(() => Math.min(1, Math.max(0, loadNum(VOLUME_KEY, 0.5))));
  const player = useRef<MusicPlayer | null>(null);

  useEffect(() => {
    const p = new MusicPlayer(ASSETS.music);
    player.current = p;
    return () => {
      p.dispose();
      player.current = null;
    };
  }, []);

  useEffect(() => { player.current?.play(track); }, [track]);
  useEffect(() => { player.current?.setMuted(muted); }, [muted]);
  useEffect(() => {
    player.current?.setVolume(volume);
    try { localStorage.setItem(VOLUME_KEY, String(volume)); } catch { /* ignore */ }
  }, [volume]);

  return [volume, setVolume];
}
