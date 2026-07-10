import type {Metadata, Viewport} from 'next';
import ClientWrapper from '@/components/ClientWrapper';
import './globals.css'; // Global styles

export const metadata: Metadata = {
  title: 'OSRS Tower Defense',
  description: 'An Old School RuneScape themed tower defense game.',
};

// The board is sized to the viewport, so any zoom re-fits the canvas and
// re-anchors every tower mid-run. Lock the viewport (this covers touch pinch);
// GameRoot blocks the desktop routes. Players scale the interface with the
// UI −/+ control instead.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="en">
      <body suppressHydrationWarning>
        <ClientWrapper>
          {children}
        </ClientWrapper>
      </body>
    </html>
  );
}
