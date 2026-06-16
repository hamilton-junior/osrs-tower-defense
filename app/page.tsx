'use client';

import dynamic from 'next/dynamic';

const GameRoot = dynamic(() => import('@/components/game/GameRoot'), { ssr: false });

export default function Page() {
  return (
    <div className="h-screen w-screen bg-black text-osrs-yellow font-osrs flex flex-col overflow-hidden">
      <header className="w-full bg-[var(--osrs-brown)] border-b-2 border-[var(--osrs-border-dark)] px-3 py-2 flex items-center justify-between shadow-md z-20">
        <h1 className="text-2xl text-osrs-orange drop-shadow-md">OSRS Tower Defense</h1>
      </header>
      <main className="flex-1 relative bg-black">
        <GameRoot />
      </main>
    </div>
  );
}
