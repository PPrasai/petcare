import { DEFAULT_PREFERENCES } from '@petcare/domain';
import type { Preferences } from '@petcare/domain';
import { AuthError } from '../../application/ports/auth-api';
import type { AuthApi, ClientConfig, MeSnapshot } from '../../application/ports/auth-api';
import { http } from './http';

function field<T>(body: unknown, key: string): T | undefined {
  if (typeof body === 'object' && body !== null && key in body) {
    return (body as Record<string, T>)[key];
  }
  return undefined;
}

function failure(status: number): AuthError {
  if (status === 401 || status === 400) return new AuthError('invalid');
  if (status === 422) return new AuthError('exists');
  if (status === 429) return new AuthError('rateLimited');
  return new AuthError('other');
}

export function createAuthRemote(): AuthApi {
  return {
    async config(): Promise<ClientConfig> {
      const { status, body } = await http('GET', '/api/config');
      if (status !== 200) throw new AuthError('other');
      return {
        providers: field<string[]>(body, 'providers') ?? [],
        emailPasswordEnabled: field<boolean>(body, 'emailPasswordEnabled') ?? true,
        vapidPublicKey: field<string | null>(body, 'vapidPublicKey') ?? null,
        maxFileBytes: field<number>(body, 'maxFileBytes') ?? 10_485_760,
        householdQuotaBytes: field<number>(body, 'householdQuotaBytes') ?? 524_288_000,
      };
    },

    async me(): Promise<MeSnapshot | null> {
      const { status, body } = await http('GET', '/api/me');
      if (status === 401) return null;
      if (status !== 200) throw new AuthError('other');
      const user = field<MeSnapshot['user']>(body, 'user');
      if (!user) throw new AuthError('other');
      return {
        user: { id: user.id, name: user.name, email: user.email },
        households: field<MeSnapshot['households']>(body, 'households') ?? [],
        preferences: field<Preferences>(body, 'preferences') ?? DEFAULT_PREFERENCES,
      };
    },

    async signInEmail(email, password) {
      const { status } = await http('POST', '/api/auth/sign-in/email', { email, password });
      if (status !== 200) throw failure(status);
    },

    async signUpEmail(name, email, password) {
      const { status } = await http('POST', '/api/auth/sign-up/email', { name, email, password });
      if (status !== 200) throw failure(status);
    },

    async signOut() {
      await http('POST', '/api/auth/sign-out', {});
    },

    async socialSignInUrl(provider) {
      const { status, body } = await http('POST', '/api/auth/sign-in/social', {
        provider,
        callbackURL: '/',
      });
      const url = field<string>(body, 'url');
      if (status !== 200 || !url) throw new AuthError('other');
      return url;
    },
  };
}
