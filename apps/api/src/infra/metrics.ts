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
  const notificationsSent = meter.createCounter('petcare_notifications_sent_total', {
    description: 'Notification rows handled by the dispatcher, by result',
  });
  const dispatchLag = meter.createHistogram('petcare_notification_dispatch_lag_seconds', {
    description: 'Seconds between a notification being due and the dispatcher handling it',
    unit: 's',
  });
  const signins = meter.createCounter('petcare_auth_signins_total', {
    description: 'Sign-in and sign-up attempts by method and result',
  });
  const uploads = meter.createCounter('petcare_upload_bytes_total', {
    description: 'Bytes of accepted file uploads',
    unit: 'By',
  });
  return {
    inviteAttempt: (result) => inviteAttempts.add(1, { result }),
    syncMutation: (status) => syncMutations.add(1, { status }),
    syncConflicts: (type, count) => syncConflicts.add(count, { type }),
    notificationSent: (result) => notificationsSent.add(1, { result }),
    dispatchLag: (seconds) => dispatchLag.record(seconds),
    authSignin: (method, result) => signins.add(1, { method, result }),
    uploadBytes: (bytes) => uploads.add(bytes),
  };
}
