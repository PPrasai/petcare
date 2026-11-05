import { HouseholdError } from '../../application/ports/household-api';
import type {
  CreatedInvite,
  HouseholdApi,
  InviteInfo,
  InvitePreview,
  JoinedHousehold,
  MemberInfo,
} from '../../application/ports/household-api';
import { NetworkError } from '../../application/ports/remote-api';
import { http, problemCode } from './http';

function failure(status: number, body: unknown): HouseholdError {
  if (status === 429) return new HouseholdError('rateLimited');
  if (status === 403) return new HouseholdError('forbidden');
  if (status === 404) return new HouseholdError('notFound');
  if (status === 400) return new HouseholdError('invalid');
  if (status === 409 && problemCode(body) === 'lastOwner') return new HouseholdError('lastOwner');
  return new HouseholdError('other');
}

async function call(method: string, path: string, body?: unknown, ok = [200]) {
  try {
    const result = await http(method, path, body);
    if (!ok.includes(result.status)) throw failure(result.status, result.body);
    return result.body;
  } catch (error) {
    if (error instanceof NetworkError) throw new HouseholdError('offline');
    throw error;
  }
}

const base = (householdId: string) => `/api/households/${householdId}`;

/** The household, member and invite endpoints over HTTP. */
export function createHouseholdRemote(): HouseholdApi {
  return {
    async members(id) {
      return (await call('GET', `${base(id)}/members`)) as MemberInfo[];
    },
    async changeRole(id, userId, role) {
      await call('PATCH', `${base(id)}/members/${encodeURIComponent(userId)}`, { role });
    },
    async removeMember(id, userId) {
      await call('DELETE', `${base(id)}/members/${encodeURIComponent(userId)}`, undefined, [204]);
    },
    async leave(id) {
      await call('POST', `${base(id)}/leave`, {}, [204]);
    },
    async transferOwnership(id, userId) {
      await call('POST', `${base(id)}/transfer-ownership`, { userId });
    },
    async rename(id, name) {
      await call('PATCH', base(id), { name });
    },
    async invites(id) {
      return (await call('GET', `${base(id)}/invites`)) as InviteInfo[];
    },
    async createInvite(id, role) {
      return (await call('POST', `${base(id)}/invites`, { role }, [201])) as CreatedInvite;
    },
    async revokeInvite(id, inviteId) {
      await call('DELETE', `${base(id)}/invites/${inviteId}`, undefined, [204]);
    },
    async previewInvite(secret) {
      return (await call('POST', '/api/invites/preview', secret)) as InvitePreview;
    },
    async acceptInvite(secret) {
      return (await call('POST', '/api/invites/accept', secret)) as JoinedHousehold;
    },
    async resolveConflict(conflictId) {
      await call('POST', `/api/conflicts/${conflictId}/resolve`, {});
    },
  };
}
