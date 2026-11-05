/** Why web push cannot be used on this device, or `ready`. */
export type PushSupport = 'ready' | 'unsupported' | 'needsInstall' | 'notConfigured';

export type PushState = 'subscribed' | 'unsubscribed' | 'denied';

/** Device notifications for this browser (CAP-07). The data layer talks to the browser and API. */
export interface PushControl {
  support(vapidPublicKey: string | null): PushSupport;
  state(): Promise<PushState>;
  /** Asks permission, subscribes this device and registers it with the server. */
  enable(vapidPublicKey: string): Promise<PushState>;
  /** Unsubscribes this device and removes it from the server. */
  disable(): Promise<void>;
  /** Asks the server to send a test notification to the user's devices. */
  sendTest(): Promise<'sent' | 'rateLimited' | 'failed'>;
}
