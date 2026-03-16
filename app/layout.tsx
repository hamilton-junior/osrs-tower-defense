import type {Metadata} from 'next';
import { Inter, JetBrains_Mono, VT323 } from 'next/font/google';
import ClientWrapper from '@/components/ClientWrapper';
import './globals.css'; // Global styles

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
});

const vt323 = VT323({
  weight: '400',
  subsets: ['latin'],
  variable: '--font-osrs',
});

export const metadata: Metadata = {
  title: 'OSRS Tower Defense',
  description: 'An Old School RuneScape themed tower defense game.',
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable} ${vt323.variable}`}>
      <body suppressHydrationWarning>
        <ClientWrapper>
          {children}
        </ClientWrapper>
      </body>
    </html>
  );
}
