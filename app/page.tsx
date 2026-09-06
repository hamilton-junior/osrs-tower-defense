'use client';

import dynamic from 'next/dynamic';

const GameRoot = dynamic(() => import('@/components/game/GameRoot'), { ssr: false });

/** Where the game lives. Shown in the header so anyone watching over a
 *  shoulder — or over a stream — can read off where to play it themselves. */
const GAME_URL = 'https://hamilton-junior.github.io/osrs-tower-defense/';
const GAME_URL_LABEL = 'hamilton-junior.github.io/osrs-tower-defense';

export default function Page() {
  return (
    <div className="h-screen w-screen bg-black text-osrs-yellow font-osrs flex flex-col overflow-hidden relative">
      {/* The header floats as a top-left overlay instead of taking a row of its
          own — the board is height-bound, so every reclaimed pixel of height makes
          it wider. It sits over the empty top-left grass corner (the HUD lives
          top-right), and `pointer-events-none` lets clicks fall through to the
          board except on the link itself. */}
      <header className="absolute top-0 left-0 z-20 px-3 py-2 flex items-center gap-3 pointer-events-none">
        <h1 className="text-2xl text-osrs-orange drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">OSRS Tower Defense</h1>
        <a
          href={GAME_URL}
          target="_blank"
          rel="noopener noreferrer"
          title="Play it yourself, in a new tab"
          className="pointer-events-auto shrink-0 truncate text-sm text-osrs-yellow hover:text-osrs-orange underline decoration-dotted underline-offset-4 drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]"
        >
          ▶ Play it: {GAME_URL_LABEL}
        </a>
      </header>
      {/* `min-h-0` lets this shrink to the full screen height: without it a flex
          item refuses to go below its content's min-height, so the board + bottom
          bar would overflow the screen and the page's `overflow-hidden` would clip
          the bar off the bottom edge. */}
      <main className="flex-1 min-h-0 relative bg-black">
        <GameRoot />
      </main>
    </div>
  );
}
