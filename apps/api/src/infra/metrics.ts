import { metrics } from '@opentelemetry/api';
import type { Metrics } from '../services/ports';

/** Custom metrics (AS section 6). Names carry the `petcare_` prefix. */
export function createMetrics(): Metrics {
  const meter = metrics.getMeter('petcare-api');
  const inviteAttempts = meter.createCounter('petcare_invite_attempts_total', {
    description: 'Invite preview and accept attempts by result',
  });
  return {
    inviteAttempt: (result) => inviteAttempts.add(1, { result }),
  };
}
