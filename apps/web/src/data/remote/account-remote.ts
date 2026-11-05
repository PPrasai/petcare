import type { Preferences } from '@petcare/domain';
import { AccountError } from '../../application/ports/account-api';
import type {
  AccountApi,
  CalendarLink,
  CalendarLinkState,
  LinkedAccounts,
} from '../../application/ports/account-api';
import { NetworkError } from '../../application/ports/remote-api';
import { http, problemCode } from './http';
import { assertNetworkAllowed } from './network-gate';

function failure(status: number, body: unknown): AccountError {
  if (status === 401) return new AccountError('signedOut');
  if (status === 429) return new AccountError('rateLimited');
  if (status === 400 || status === 422) return new AccountError('invalid');
  if (status === 409 && problemCode(body) === 'soleOwner') return new AccountError('soleOwner');
  return new AccountError('other');
}

async function call(method: string, path: string, body?: unknown, ok = [200]) {
  try {
    const result = await http(method, path, body);
    if (!ok.includes(result.status)) throw failure(result.status, result.body);
    return result.body;
  } catch (error) {
    if (error instanceof NetworkError) throw new AccountError('offline');
    throw error;
  }
}

const field = <T>(body: unknown, key: string): T | undefined =>
  typeof body === 'object' && body !== null ? (body as Record<string, T>)[key] : undefined;

/** The /api/me, calendar and Better Auth account endpoints over HTTP. */
export function createAccountRemote(): AccountApi {
  return {
    async savePreferences(preferences) {
      return (await call('PUT', '/api/me/preferences', preferences)) as Preferences;
    },
    async linkedAccounts(): Promise<LinkedAccounts> {
      const me = await call('GET', '/api/me');
      return {
        providers: field<string[]>(me, 'linkedProviders') ?? [],
        hasPassword: field<boolean>(me, 'hasPassword') ?? false,
      };
    },
    async linkProvider(provider) {
      const body = await call('POST', '/api/auth/link-social', {
        provider,
        callbackURL: '/settings',
      });
      const url = field<string>(body, 'url');
      if (!url) throw new AccountError('other');
      return url;
    },
    async unlinkProvider(providerId) {
      await call('POST', '/api/auth/unlink-account', { providerId });
    },
    async setPassword(newPassword) {
      await call('POST', '/api/auth/set-password', { newPassword });
    },
    async changePassword(currentPassword, newPassword) {
      await call('POST', '/api/auth/change-password', {
        currentPassword,
        newPassword,
        revokeOtherSessions: false,
      });
    },
    async calendarLink(): Promise<CalendarLinkState> {
      const body = await call('GET', '/api/calendar/link');
      return {
        exists: field<boolean>(body, 'exists') ?? false,
        createdAt: field<string | null>(body, 'createdAt') ?? null,
      };
    },
    async createCalendarLink(): Promise<CalendarLink> {
      const body = await call('POST', '/api/calendar/link', {}, [201]);
      return {
        url: String(field<string>(body, 'url')),
        createdAt: String(field<string>(body, 'createdAt')),
      };
    },
    async revokeCalendarLink() {
      await call('DELETE', '/api/calendar/link', undefined, [204]);
    },
    async exportData() {
      assertNetworkOrOffline();
      let response: Response;
      try {
        response = await fetch('/api/me/export', { credentials: 'same-origin' });
      } catch {
        throw new AccountError('offline');
      }
      if (!response.ok) throw failure(response.status, null);
      return response.blob();
    },
    async deleteAccount() {
      await call('DELETE', '/api/me', { confirm: 'DELETE MY ACCOUNT' }, [204]);
    },
  };
}

function assertNetworkOrOffline(): void {
  try {
    assertNetworkAllowed();
  } catch {
    throw new AccountError('offline');
  }
}
