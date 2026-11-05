import { NetworkError, RemoteError } from '../../application/ports/remote-api';
import type { PullPage, PushResult, RemoteApi } from '../../application/ports/remote-api';
import { http, problemCode } from './http';

/** The sync endpoints over HTTP. 5xx answers are retried later, so they read as NetworkError. */
export function createSyncRemote(): RemoteApi {
  const fail = (status: number, body: unknown): never => {
    if (status >= 500) throw new NetworkError(`HTTP ${status}`);
    throw new RemoteError(status, problemCode(body));
  };
  return {
    async push(request) {
      const { status, body } = await http('POST', '/api/sync/push', request);
      if (status !== 200) fail(status, body);
      return body as { results: PushResult[]; serverTime: string };
    },
    async pull(cursor, limit) {
      const params = new URLSearchParams();
      if (cursor) params.set('cursor', cursor);
      if (limit !== undefined) params.set('limit', String(limit));
      const { status, body } = await http('GET', `/api/sync/pull?${params.toString()}`);
      if (status !== 200) fail(status, body);
      return body as PullPage;
    },
  };
}
