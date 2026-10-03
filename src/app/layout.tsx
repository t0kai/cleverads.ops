import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import { AuthProvider } from '@/features/auth/AuthProvider';
import './globals.css';

// IBM Plex (SIL Open Font License, see fonts/LICENSE-IBM-Plex.txt), served from this site: no third-party font requests.
const sans = localFont({
  src: [
    { path: './fonts/ibm-plex-sans-latin-400-normal.woff2', weight: '400' },
    { path: './fonts/ibm-plex-sans-latin-500-normal.woff2', weight: '500' },
    { path: './fonts/ibm-plex-sans-latin-600-normal.woff2', weight: '600' },
    { path: './fonts/ibm-plex-sans-latin-700-normal.woff2', weight: '700' },
  ],
  variable: '--font-plex-sans',
  display: 'swap',
});
const mono = localFont({
  src: [
    { path: './fonts/ibm-plex-mono-latin-400-normal.woff2', weight: '400' },
    { path: './fonts/ibm-plex-mono-latin-500-normal.woff2', weight: '500' },
  ],
  variable: '--font-plex-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'CleverAds Operations',
  description: 'CleverAds team tools: DV360 optimization sheets and more.',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: '#2447D6' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-AU" className={`${sans.variable} ${mono.variable}`}>
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
