'use client';

import React from 'react';
import { ASSETS } from '@/lib/game/assets';

/**
 * The castle room the start screen stands in: a brick wall over a flagstone
 * floor, lit by two torches that flank the stone panel. Pure scenery behind the
 * panel, so it takes no props and catches no clicks.
 *
 * The torch plays its baked sheet with a CSS `steps()` animation; the sheet's
 * 18 frames run at ~100ms each (lobby_torch.json), so one loop is 1.8s.
 */
export function StartLobby() {
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
