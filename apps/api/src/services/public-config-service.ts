import { MAX_MUTATIONS_PER_PUSH } from '@petcare/domain';
import type { Config, Provider } from '../config/env';

export interface PublicConfig {
  providers: Provider[];
  emailPasswordEnabled: boolean;
  vapidPublicKey: string | null;
  limits: { maxFileBytes: number; householdQuotaBytes: number; maxMutationsPerPush: number };
}

const ORDER: Provider[] = ['google', 'github', 'apple', 'microsoft'];

/** What the browser may know: enabled sign-in providers, push key, limits. No secrets. */
export function getPublicConfig(config: Config): PublicConfig {
  return {
    providers: ORDER.filter((p) => config.providers[p] !== null),
    emailPasswordEnabled: config.emailPasswordEnabled,
    vapidPublicKey: config.vapid?.publicKey ?? null,
    limits: {
      maxFileBytes: config.maxFileBytes,
      householdQuotaBytes: config.householdQuotaBytes,
      maxMutationsPerPush: MAX_MUTATIONS_PER_PUSH,
    },
  };
}
