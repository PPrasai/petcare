import { metrics } from '@opentelemetry/api';
import type { Metrics } from '../services/ports';

/** Custom metrics (AS section 6). Names carry the `petcare_` prefix. */
export function createMetrics(): Metrics {
  const meter = metrics.getMeter('petcare-api');
  const inviteAttempts = meter.createCounter('petcare_invite_attempts_total', {
    description: 'Invite preview and accept attempts by result',
  });
  const syncMutations = meter.createCounter('petcare_sync_mutations_total', {
    description: 'Pushed mutations by status',
  });
  const syncConflicts = meter.createCounter('petcare_sync_conflicts_total', {
    description: 'Conflict rows written by record type',
  });
  return {
    inviteAttempt: (result) => inviteAttempts.add(1, { result }),
    syncMutation: (status) => syncMutations.add(1, { status }),
    syncConflicts: (type, count) => syncConflicts.add(count, { type }),
  };
}
