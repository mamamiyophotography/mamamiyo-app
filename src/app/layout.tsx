import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Mamamiyo Photography — Booking',
  description: 'Book your newborn, maternity, or family photoshoot with Mamamiyo Photography.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
