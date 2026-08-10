import type { MetadataRoute } from 'next';

/**
 * The web manifest. Milestone 48, item 7.
 *
 * The approval queue is a phone task — "approval happens in spare moments or it
 * doesn't happen" — so this has to be installable to a home screen rather than
 * a browser tab someone has to find.
 *
 * `standalone` display is what removes the browser chrome; without it the queue
 * loses about 15% of a small screen to a URL bar it never needs.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Halyard',
    short_name: 'Halyard',
    description: 'Autonomous up to the point of publication, and never past it.',
    start_url: '/queue',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#FAF8F4',
    theme_color: '#C4714A',
    categories: ['productivity', 'business'],
    icons: [
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'Queue', url: '/queue', description: 'Approve what is waiting' },
      { name: "Today's take", url: '/take', description: 'One line on one story' },
      { name: 'Inbox', url: '/inbox', description: 'Comments with drafted replies' },
    ],
  };
}
