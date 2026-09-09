import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Mamamiyo Booking',
    short_name: 'Mamamiyo',
    description: 'Mamamiyo Photography booking and studio management.',
    start_url: '/',
    display: 'standalone',
    background_color: '#E9B7A8',
    theme_color: '#E9B7A8',
    icons: [
      {
        src: '/app-icon-192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/app-icon-512.png',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
  };
}
