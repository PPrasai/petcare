import type { Preferences } from '@petcare/domain';

export interface MeSnapshot {
  user: { id: string; name: string; email: string };
  households: { id: string; name: string; role: 'owner' | 'caretaker' | 'viewer' }[];
  preferences: Preferences;
}

export interface ClientConfig {
  providers: string[];
  emailPasswordEnabled: boolean;
}

/** A sign-in/up failure the form can explain. */
export class AuthError extends Error {
  constructor(readonly kind: 'invalid' | 'exists' | 'rateLimited' | 'other') {
    super(kind);
    this.name = 'AuthError';
  }
}

/** Account endpoints (Better Auth and /api/me). Network failures throw NetworkError. */
export interface AuthApi {
  config(): Promise<ClientConfig>;
  /** The signed-in user, or null when there is no session. */
  me(): Promise<MeSnapshot | null>;
  signInEmail(email: string, password: string): Promise<void>;
  signUpEmail(name: string, email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
  /** Where to send the browser to sign in with a provider. */
  socialSignInUrl(provider: string): Promise<string>;
}
