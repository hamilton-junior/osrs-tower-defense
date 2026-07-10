'use client';

import dynamic from 'next/dynamic';

const GameRoot = dynamic(() => import('@/components/game/GameRoot'), { ssr: false });

/** Where the game lives. Shown in the header so anyone watching over a
 *  shoulder — or over a stream — can read off where to play it themselves. */
const GAME_URL = 'https://hamilton-junior.github.io/osrs-tower-defense/';
const GAME_URL_LABEL = 'hamilton-junior.github.io/osrs-tower-defense';

export default function Page() {
  return (
    <div className="h-screen w-screen bg-black text-osrs-yellow font-osrs flex flex-col overflow-hidden">
      <header className="w-full bg-[var(--osrs-brown)] border-b-2 border-[var(--osrs-border-dark)] px-3 py-2 flex items-center justify-between gap-3 shadow-md z-20">
        <h1 className="text-2xl text-osrs-orange drop-shadow-md">OSRS Tower Defense</h1>
        <a
          href={GAME_URL}
          target="_blank"
          rel="noopener noreferrer"
          title="Play it yourself — opens in a new tab"
          className="shrink-0 truncate text-sm text-osrs-yellow hover:text-osrs-orange underline decoration-dotted underline-offset-4"
        >
          ▶ Play it: {GAME_URL_LABEL}
        </a>
      </header>
      <main className="flex-1 relative bg-black">
        <GameRoot />
      </main>
    </div>
  );
}
