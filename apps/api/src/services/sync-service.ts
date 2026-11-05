import { PULL_LIMIT_DEFAULT, PULL_LIMIT_MAX } from '@petcare/domain';
import type { RecordEnvelope, RecordType } from '@petcare/domain';
import { z } from 'zod';
import { iso, toEnvelope } from '../repositories';
import { AppError, forbidden, invalid, notFound } from './app-error';
import { createPushProcessor } from './sync-push';
import { decodeCursor, encodeCursor, presentConflict } from './sync-types';
import type { SyncServiceDeps } from './sync-types';

export { decodeCursor, encodeCursor } from './sync-types';
export type { Mutation, PushResult, RejectCode, SyncServiceDeps } from './sync-types';

export function createSyncService(deps: SyncServiceDeps) {
  const { unitOfWork, directory, clock } = deps;
  const processor = createPushProcessor(deps);

  return {
    /** POST /api/sync/push: mutations run in array order, each in its own transaction. */
    push: processor.push,

    /** GET /api/sync/pull: the current envelope of every record changed after the cursor. */
    async pull(userId: string, query: { cursor?: string; limit?: string | number }) {
      const limit = z.coerce
        .number()
        .int()
        .min(1)
        .max(PULL_LIMIT_MAX)
        .default(PULL_LIMIT_DEFAULT)
        .safeParse(query.limit ?? undefined);
      if (!limit.success) throw invalid('limit must be 1-1000', '/limit');
      const after = decodeCursor(query.cursor);

      const repos = unitOfWork.repositories;
      const households = await repos.households.listForUser(userId);
      const householdIds = households.map((h) => h.id);

      if (after > 0) {
        // Rows older than the retention horizon are purged; a cursor behind them is unusable.
        const oldest = await repos.sync.oldestSeq();
        if (oldest !== null && after < oldest - 1) {
          throw new AppError('cursorExpired', 410, 'pull again from an empty cursor');
        }
      }

      const rows = await repos.sync.changedRecords(householdIds, after, limit.data + 1);
      const hasMore = rows.length > limit.data;
      const page = rows.slice(0, limit.data);

      const byType = new Map<RecordType, string[]>();
      for (const r of page) {
        const type = r.recordType as RecordType;
        byType.set(type, [...(byType.get(type) ?? []), r.recordId]);
      }
      const envelopes = new Map<string, RecordEnvelope>();
      for (const [type, ids] of byType) {
        for (const row of await repos.records.findMany(type, ids)) {
          envelopes.set(`${type}:${row.id}`, toEnvelope(type, row));
        }
      }
      const changes = page
        .map((r) => envelopes.get(`${r.recordType}:${r.recordId}`))
        .filter((e): e is RecordEnvelope => e !== undefined);

      const since = after > 0 ? await repos.sync.changeTimeAt(after) : null;
      const conflicts = await repos.sync.unresolvedConflicts(householdIds, since);
      const last = page.at(-1);

      return {
        changes,
        households,
        conflicts: conflicts.map(presentConflict),
        cursor: encodeCursor(last ? last.lastSeq : after),
        hasMore,
        serverTime: iso(clock()),
      };
    },

    /** POST /api/conflicts/:id/resolve: acknowledge a conflict (owner or caretaker). */
    async resolveConflict(userId: string, conflictId: string) {
      const repos = unitOfWork.repositories;
      const conflict = await repos.sync.findConflict(conflictId);
      if (!conflict) throw notFound();
      const role = await directory.requireMember(userId, conflict.householdId);
      if (role === 'viewer') throw forbidden();
      await repos.sync.resolveConflict(conflictId, userId, clock());
      const resolved = await repos.sync.findConflict(conflictId);
      if (!resolved) throw notFound();
      return presentConflict(resolved);
    },
  };
}
export type SyncService = ReturnType<typeof createSyncService>;
