'use client';

import React, { useEffect } from 'react';
import { ASSETS } from '@/lib/game/assets';

/** The crackle sits well under the menu's clicks: a third of an ambient loop's
 *  default 0.6. */
const TORCH_LEVEL = 0.2;

/**
 * The castle room the start screen stands in: a brick wall over a flagstone
 * floor, lit by two torches that flank the stone panel. Pure scenery behind the
 * panel, so it takes no props and catches no clicks.
 *
 * The torch plays its baked sheet with a CSS `steps()` animation; the sheet's
 * 18 frames run at ~100ms each (lobby_torch.json), so one loop is 1.8s.
 *
 * The torches crackle while the screen is up. The engine may not exist yet on
 * the first render, so a miss is retried on the page's first click, which is
 * also when a browser starts allowing sound.
 */
export function StartLobby({ onAmbient }: { onAmbient: (key: string, level: number) => (() => void) | undefined }) {
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
  return (
    <div className="rs-lobby" style={vars} aria-hidden>
      <div className="rs-lobby-wall" />
      <div className="rs-lobby-floor" />
      <div className="rs-lobby-torch rs-lobby-torch-l">
        <div className="rs-lobby-halo" />
        <div className="rs-lobby-flame" />
      </div>
      <div className="rs-lobby-torch rs-lobby-torch-r">
        <div className="rs-lobby-halo" />
        <div className="rs-lobby-flame" />
      </div>
    </div>
  );
}
