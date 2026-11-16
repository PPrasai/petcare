import 'fake-indexeddb/auto';
import { DEFAULT_PREFERENCES } from '@petcare/domain';
import type { Preferences } from '@petcare/domain';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthError } from '../application/ports/auth-api';
import type { AuthApi, MeSnapshot } from '../application/ports/auth-api';
import { NetworkError } from '../application/ports/remote-api';
import type { RemoteApi } from '../application/ports/remote-api';
import { useConnectivityStore } from '../state/connectivity';
import { useSessionStore } from '../state/session';
import { createRuntime } from './runtime';

// The demo database cannot be opened in this test (a broken or blocked browser store).
vi.mock('../data/local/demo-data', async (original) => ({
  ...(await original<typeof import('../data/local/demo-data')>()),
  seedDemo: () => Promise.reject(new Error('storage broken')),
}));

const ME: MeSnapshot = {
  user: { id: 'u-runtime', name: 'Pat', email: 'pat@example.com' },
  households: [{ id: 'h1', name: 'Pat pets', role: 'owner' }],
  preferences: DEFAULT_PREFERENCES,
};

const memoryStorage = () => {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  };
};

const offlineRemote = {
  pull: () => Promise.reject(new NetworkError()),
  push: () => Promise.reject(new NetworkError()),
} as unknown as RemoteApi;

function auth(me: AuthApi['me']): AuthApi {
  return {
    config: () => Promise.reject(new NetworkError()),
    me,
    signInEmail: () => Promise.resolve(),
    signUpEmail: () => Promise.resolve(),
    signOut: () => Promise.resolve(),
    socialSignInUrl: () => Promise.resolve(''),
  };
}

let storage: ReturnType<typeof memoryStorage>;
let online: boolean;
let puts: Preferences[];
beforeEach(async () => {
  // A clean device for every test: no database is left over from the one before.
  for (const db of await indexedDB.databases()) if (db.name) indexedDB.deleteDatabase(db.name);
  storage = memoryStorage();
  online = false;
  puts = [];
  vi.stubGlobal('localStorage', storage);
  vi.stubGlobal('window', {
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  });
  vi.stubGlobal('document', {
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    visibilityState: 'visible',
  });
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: { method?: string; body?: string }) => {
      if (!online) return Promise.reject(new TypeError('offline'));
      if (url === '/api/me/preferences' && init?.method === 'PUT') {
        const body = JSON.parse(String(init.body)) as Preferences;
        puts.push(body);
        return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
      }
      return Promise.resolve(new Response('{}', { status: 200 }));
    }),
  );
  useSessionStore.getState().setSignedOut();
  useConnectivityStore.getState().reset();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function signedIn(me: AuthApi['me'] = () => Promise.resolve(ME)) {
  const runtime = createRuntime({ auth: auth(me), remote: offlineRemote });
  await runtime.bootstrap();
  return runtime;
}

describe('start-up robustness', () => {
  it('shows sign-in with a message, never a throw, when /me answers with something unusable', async () => {
    const runtime = createRuntime({
      auth: auth(() => Promise.reject(new AuthError('other'))),
      remote: offlineRemote,
    });
    await expect(runtime.bootstrap()).resolves.toBeUndefined();
    const state = useSessionStore.getState();
    expect(state.status).toBe('signedOut');
    expect(state.startupProblem).toBe(true);
  });

  it('plain offline with nothing stored shows sign-in without the problem message', async () => {
    await signedIn(() => Promise.reject(new NetworkError()));
    const state = useSessionStore.getState();
    expect(state.status).toBe('signedOut');
    expect(state.startupProblem).toBe(false);
  });

  it('uses the remembered session when /me answers with an unexpected status', async () => {
    storage.setItem('petcare-last-session', JSON.stringify(ME));
    const runtime = await signedIn(() => Promise.reject(new AuthError('other')));
    expect(useSessionStore.getState().status).toBe('signedIn');
    await vi.waitFor(() => expect(useConnectivityStore.getState().online).toBe(false));
    await runtime.services.session.signOut();
  });

  it('still opens when something unexpected throws while starting', async () => {
    storage.setItem('petcare-demo', '1');
    const runtime = createRuntime({ auth: auth(() => Promise.resolve(ME)), remote: offlineRemote });
    await expect(runtime.bootstrap()).resolves.toBeUndefined();
    expect(useSessionStore.getState().status).toBe('signedOut');
  });
});

describe('preferences, offline first', () => {
  it('applies a change at once while offline, remembers it, and sends it when back online', async () => {
    const runtime = await signedIn();
    // The first sign-in offers the device zone; settle that before the test's own change.
    await vi.waitFor(() => expect(storage.getItem('petcare-zone-adopted:u-runtime')).toBe('1'));
    const next = { ...DEFAULT_PREFERENCES, weightUnit: 'lb' as const, theme: 'dark' as const };
    const saved = await runtime.services.account.savePreferences(next);

    expect(saved.pending).toBe(true);
    const state = useSessionStore.getState();
    expect(state.preferences.weightUnit).toBe('lb');
    expect(state.preferencesPending).toBe(true);
    const remembered = JSON.parse(storage.getItem('petcare-last-session') ?? '{}') as MeSnapshot;
    expect(remembered.preferences.weightUnit).toBe('lb');
    expect(puts).toHaveLength(0);

    online = true;
    expect(await runtime.services.account.flush()).toBe(true);
    expect(puts.at(-1)).toEqual(next);
    expect(useSessionStore.getState().preferencesPending).toBe(false);
    await runtime.services.session.signOut();
  });

  it('keeps a waiting change across a restart and sends it on the next start', async () => {
    const first = await signedIn();
    await vi.waitFor(() => expect(storage.getItem('petcare-zone-adopted:u-runtime')).toBe('1'));
    await first.services.account.savePreferences({ ...DEFAULT_PREFERENCES, currency: 'EUR' });
    expect(useSessionStore.getState().preferencesPending).toBe(true);

    online = true;
    // A new start: the server still has the old preferences, the device has the newer ones.
    const second = createRuntime({ auth: auth(() => Promise.resolve(ME)), remote: offlineRemote });
    await second.bootstrap();
    await vi.waitFor(() => expect(puts.at(-1)?.currency).toBe('EUR'));
    expect(useSessionStore.getState().preferences.currency).toBe('EUR');
    await vi.waitFor(() => expect(useSessionStore.getState().preferencesPending).toBe(false));
    await second.services.session.signOut();
  });
});

describe('time zone of a new account', () => {
  const pretendZone = (zone: string) => {
    const real = Intl.DateTimeFormat.prototype.resolvedOptions;
    vi.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockImplementation(function (
      this: Intl.DateTimeFormat,
    ) {
      return { ...real.call(this), timeZone: zone };
    });
  };

  it('sets the device zone once while the stored zone is still the untouched default', async () => {
    pretendZone('Europe/Paris');
    online = true;
    const runtime = await signedIn();
    await vi.waitFor(() =>
      expect(useSessionStore.getState().preferences.timeZone).toBe('Europe/Paris'),
    );
    await vi.waitFor(() => expect(puts.at(-1)?.timeZone).toBe('Europe/Paris'));

    // The user changes it back; the next start must not override that choice.
    await runtime.services.account.savePreferences({
      ...useSessionStore.getState().preferences,
      timeZone: 'UTC',
    });
    puts.length = 0;
    const again = createRuntime({ auth: auth(() => Promise.resolve(ME)), remote: offlineRemote });
    await again.bootstrap();
    await new Promise((r) => setTimeout(r, 50));
    expect(puts).toHaveLength(0);
    await again.services.session.signOut();
  });

  it('leaves an account that already changed something alone', async () => {
    pretendZone('Europe/Paris');
    online = true;
    const changed = { ...ME, preferences: { ...DEFAULT_PREFERENCES, theme: 'dark' as const } };
    const runtime = await signedIn(() => Promise.resolve(changed));
    await new Promise((r) => setTimeout(r, 50));
    expect(useSessionStore.getState().preferences.timeZone).toBe('UTC');
    expect(puts).toHaveLength(0);
    await runtime.services.session.signOut();
  });
});
