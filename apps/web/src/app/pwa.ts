import { Workbox } from 'workbox-window';

/** Registers the service worker (production builds only). */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  const workbox = new Workbox('/sw.js');
  void workbox.register();
}
