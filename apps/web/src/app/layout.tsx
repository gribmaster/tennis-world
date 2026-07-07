import type { Metadata } from 'next';
import { Cormorant_Garamond, Inter } from 'next/font/google';
import './globals.css';

// Fonts: the two families the HTML prototypes load (Cormorant Garamond for
// serif/display, Inter for sans/body). Loaded via next/font so they are
// self-hosted and optimized — NOT a runtime <link> to fonts.googleapis.com.
// Each is exposed as a CSS variable consumed by tailwind.config.ts's fontFamily.
const serif = Cormorant_Garamond({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600'],
  style: ['normal', 'italic'],
  variable: '--font-serif',
  display: 'swap',
});

const sans = Inter({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600'],
  variable: '--font-sans',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Tennis World',
  description: 'A curated atlas of the world’s most beautiful tennis courts.',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${serif.variable} ${sans.variable}`}>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
