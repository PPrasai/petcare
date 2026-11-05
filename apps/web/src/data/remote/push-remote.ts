import type { PushControl, PushState, PushSupport } from '../../application/ports/push-control';
import { http } from './http';

const isIos = () => /iPad|iPhone|iPod/.test(navigator.userAgent);
const isInstalled = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  (navigator as unknown as { standalone?: boolean }).standalone === true;

/** The base64url VAPID key as the bytes `pushManager.subscribe` wants. */
function keyBytes(key: string): Uint8Array<ArrayBuffer> {
  const padded = key
    .replaceAll('-', '+')
    .replaceAll('_', '/')
    .padEnd(Math.ceil(key.length / 4) * 4, '=');
  const raw = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  return (await navigator.serviceWorker.getRegistration()) ?? null;
}

export function createPushRemote(): PushControl {
  return {
    support(vapidPublicKey): PushSupport {
      // iOS delivers web push only to an installed (home screen) app.
      if (isIos() && !isInstalled()) return 'needsInstall';
      if (
        !('serviceWorker' in navigator) ||
        !('PushManager' in window) ||
        !('Notification' in window)
      ) {
        return 'unsupported';
      }
      return vapidPublicKey ? 'ready' : 'notConfigured';
    },

    async state(): Promise<PushState> {
      if (!('Notification' in window)) return 'unsubscribed';
      if (Notification.permission === 'denied') return 'denied';
      const reg = await registration();
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      return sub ? 'subscribed' : 'unsubscribed';
    },

    async enable(vapidPublicKey): Promise<PushState> {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') return 'denied';
      const reg = await navigator.serviceWorker.ready;
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: keyBytes(vapidPublicKey),
        }));
      const json = sub.toJSON();
      const { status } = await http('POST', '/api/push/subscriptions', {
        endpoint: sub.endpoint,
        keys: { p256dh: json.keys?.p256dh ?? '', auth: json.keys?.auth ?? '' },
      });
      if (status !== 201) throw new Error(`subscribe failed (${status})`);
      return 'subscribed';
    },

    async disable(): Promise<void> {
      const reg = await registration();
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      if (!sub) return;
      await http('DELETE', '/api/push/subscriptions', { endpoint: sub.endpoint });
      await sub.unsubscribe();
    },

    async sendTest() {
      const { status } = await http('POST', '/api/push/test');
      if (status === 202) return 'sent';
      return status === 429 ? 'rateLimited' : 'failed';
    },
  };
}
