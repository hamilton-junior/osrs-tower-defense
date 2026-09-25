'use client';

import React, { useEffect, useRef } from 'react';
import { ASSETS } from '@/lib/game/assets';
import { LobbyWalkers } from './lobby-walkers';

/** The crackle sits well under the menu's clicks: a third of an ambient loop's
 *  default 0.6. */
const TORCH_LEVEL = 0.2;

/**
 * The castle room the start screen stands in: a brick wall over a flagstone
 * floor, lit by two torches that flank the stone panel, with the game's monsters
 * wandering across the floor (lobby-walkers.tsx). Pure scenery, so it catches no
 * clicks. The lobby sits behind the panel; the canvas after it sits over the
 * panel, for the monsters that walk past in front of it.
 *
 * The torch plays its baked sheet with a CSS `steps()` animation; the sheet's
 * 18 frames run at ~100ms each (lobby_torch.json), so one loop is 1.8s.
 *
 * The torches crackle while the screen is up. The engine may not exist yet on
 * the first render, so a miss is retried on the page's first click, which is
 * also when a browser starts allowing sound.
 */
export function StartLobby({ onAmbient, onSound }: {
  onAmbient: (key: string, level: number) => (() => void) | undefined;
  onSound: (key: string, level: number) => void;
}) {
  useEffect(() => {
    let stop = onAmbient('lobby_torch', TORCH_LEVEL);
    const retry = () => { stop ??= onAmbient('lobby_torch', TORCH_LEVEL); };
    if (!stop) window.addEventListener('pointerdown', retry, { once: true });
    return () => {
      window.removeEventListener('pointerdown', retry);
      stop?.();
    };
    // Mount-only: the loop runs for as long as the lobby is on screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const vars = {
    '--lobby-wall': `url(${ASSETS.lobby.wall})`,
    '--lobby-floor': `url(${ASSETS.lobby.floor})`,
    '--lobby-torch': `url(${ASSETS.lobby.torch})`,
  } as React.CSSProperties;
  const overRef = useRef<HTMLCanvasElement>(null);
  return (
    <>
    <div className="rs-lobby" style={vars} aria-hidden>
      <div className="rs-lobby-wall" />
      <div className="rs-lobby-floor" />
      <LobbyWalkers onSound={onSound} overRef={overRef} />
      <div className="rs-lobby-torch rs-lobby-torch-l">
        <div className="rs-lobby-halo" />
        <div className="rs-lobby-flame" />
      </div>
      <div className="rs-lobby-torch rs-lobby-torch-r">
        <div className="rs-lobby-halo" />
        <div className="rs-lobby-flame" />
      </div>
    </div>
    <canvas ref={overRef} className="rs-lobby-over" aria-hidden />
    </>
  );
}
