import type {Metadata} from 'next';
import ClientWrapper from '@/components/ClientWrapper';
import './globals.css'; // Global styles

export const metadata: Metadata = {
  title: 'OSRS Tower Defense',
  description: 'An Old School RuneScape themed tower defense game.',
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
