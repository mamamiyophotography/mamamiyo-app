import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Mamamiyo Photography — Booking',
  description: 'Book your newborn, maternity, or family photoshoot with Mamamiyo Photography.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href="https://fonts.googleapis.com/css2?family=Quicksand:wght@500;600;700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body>{children}</body>
    </html>
  );
}
