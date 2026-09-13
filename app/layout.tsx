import type { Metadata } from 'next';
import { Bungee, Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});
const roadDisplay = Bungee({ variable: '--font-road-display', subsets: ['latin'], weight: '400', display: 'swap' });

export const metadata: Metadata = {
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/favicon-16.png', type: 'image/png', sizes: '16x16' },
      { url: '/favicon-32.png', type: 'image/png', sizes: '32x32' },
      { url: '/favicon-48.png', type: 'image/png', sizes: '48x48' },
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180' }],
  },
  title: 'RepoRoad — a live lo-fi drive through GitHub',
  description:
    'Take a cosy voxel drive through open source. Explore GitHub repository buildings whose floors reflect their stars, with community chat and a shared lofi soundtrack.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${roadDisplay.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
