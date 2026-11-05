import webpush from 'web-push';
import type { PushOutcome, PushPayload, PushSender, PushTarget } from '../services/ports';

export interface VapidKeys {
  publicKey: string;
  privateKey: string;
  subject: string;
}

/** Web Push over VAPID. A 404 or 410 from the push service means the subscription is gone. */
export function createPushSender(vapid: VapidKeys): PushSender {
  const details = {
    subject: vapid.subject,
    publicKey: vapid.publicKey,
    privateKey: vapid.privateKey,
  };
  return {
    async send(target: PushTarget, payload: PushPayload): Promise<PushOutcome> {
      try {
        await webpush.sendNotification(
          { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
          JSON.stringify(payload),
          { vapidDetails: details, TTL: 24 * 3600, urgency: 'normal' },
        );
        return { ok: true };
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        return { ok: false, gone: status === 404 || status === 410 };
      }
    },
  };
}

/** A new VAPID key pair for the `vapid` CLI command. */
export const generateVapidKeys = (): { publicKey: string; privateKey: string } =>
  webpush.generateVAPIDKeys();
