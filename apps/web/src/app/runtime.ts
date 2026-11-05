import { QueryClient } from '@tanstack/react-query';
import { ConflictService } from '../application/conflict-service';
import { HouseholdService } from '../application/household-service';
import { createHouseholdRemote } from '../data/remote/household-remote';
import { ContactService } from '../application/contact-service';
import { DocumentService } from '../application/document-service';
import { ExpenseService } from '../application/expense-service';
import { HealthService } from '../application/health-service';
import { createFilesRemote } from '../data/remote/files-remote';
import { createPushRemote } from '../data/remote/push-remote';
import { TodayService } from '../application/today-service';
import { MeasurementService } from '../application/measurement-service';
import { PetService } from '../application/pet-service';
import { AuthError } from '../application/ports/auth-api';
import type { AuthApi, MeSnapshot } from '../application/ports/auth-api';
import { NetworkError } from '../application/ports/remote-api';
import type { RemoteApi } from '../application/ports/remote-api';
import type { RecordStore } from '../application/ports/record-store';
import type { Services, SessionControl, SignInResult } from '../application/services';
import { createAuthRemote } from '../data/remote/auth-remote';
import { createSyncRemote } from '../data/remote/sync-remote';
import { forgetSession, recalledSession, rememberSession } from '../data/local/session-cache';
import { openUserData } from '../data/local/user-data';
import type { UserData } from '../data/local/user-data';
import { createScheduler } from '../data/sync/scheduler';
import type { Scheduler } from '../data/sync/scheduler';
import { useConnectivityStore } from '../state/connectivity';
import { useSessionStore } from '../state/session';

export interface Runtime {
  queryClient: QueryClient;
  services: Services;
  /** Decide who is signed in (online, or from this device's last session when offline). */
  bootstrap(): Promise<void>;
  /** Household names stored on this device, for the shell header. */
  households(): Promise<{ id: string; name: string }[]>;
}

export interface RuntimeDeps {
  auth?: AuthApi;
  remote?: RemoteApi;
}

/** Composition root of the live data layer (the demo layer arrives in slice 15). */
export function createRuntime(deps: RuntimeDeps = {}): Runtime {
  const auth = deps.auth ?? createAuthRemote();
  const remote = deps.remote ?? createSyncRemote();
  const queryClient = new QueryClient({
    defaultOptions: { queries: { networkMode: 'always', staleTime: Infinity, retry: false } },
  });

  let data: UserData | null = null;
  let scheduler: Scheduler | null = null;
  let detach: (() => void) | null = null;

  const invalidate = (types: string[]) => {
    for (const type of types) void queryClient.invalidateQueries({ queryKey: [type] });
    // The Today page is derived from several record types.
    void queryClient.invalidateQueries({ queryKey: ['today'] });
  };

  function open(me: MeSnapshot): void {
    close();
    const opened = openUserData(me.user.id, remote, createFilesRemote(), {
      onChanged: (types) => {
        invalidate(types);
        scheduler?.request();
      },
      onStatus: (status) => useConnectivityStore.getState().update(status),
    });
    data = opened;
    scheduler = createScheduler(opened.engine);
    useSessionStore.getState().setSignedIn(me.user, me.households, me.preferences);
    const onOnline = () => scheduler?.nudge();
    const onOffline = () => useConnectivityStore.getState().update({ online: false });
    const onVisible = () => {
      if (document.visibilityState === 'visible') scheduler?.nudge();
    };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    document.addEventListener('visibilitychange', onVisible);
    detach = () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      document.removeEventListener('visibilitychange', onVisible);
    };
    void opened.engine.refreshPending();
    scheduler.start();
  }

  function close(): void {
    scheduler?.stop();
    detach?.();
    data?.close();
    scheduler = null;
    detach = null;
    data = null;
  }

  const current = (): UserData => {
    if (!data) throw new Error('not signed in');
    return data;
  };

  const attempt = async (run: () => Promise<void>): Promise<SignInResult> => {
    try {
      await run();
      const me = await auth.me();
      if (!me) return { ok: false, reason: 'other' };
      rememberSession(me);
      open(me);
      return { ok: true };
    } catch (error) {
      if (error instanceof AuthError) {
        return {
          ok: false,
          reason: error.kind === 'invalid' || error.kind === 'exists' ? error.kind : 'other',
        };
      }
      throw error;
    }
  };

  const session: SessionControl = {
    signInEmail: (email, password) => attempt(() => auth.signInEmail(email, password)),
    signUpEmail: (name, email, password) => attempt(() => auth.signUpEmail(name, email, password)),
    signInSocial: (provider) => auth.socialSignInUrl(provider),
    async signOut() {
      const opened = data;
      close();
      await auth.signOut().catch(() => undefined);
      await opened?.wipe();
      forgetSession();
      queryClient.clear();
      useConnectivityStore.getState().reset();
      useSessionStore.getState().setSignedOut();
    },
  };

  const records: RecordStore = {
    list: (type, householdId) => current().records.list(type, householdId),
    get: (type, id) => current().records.get(type, id),
    create: (type, householdId, fields) => current().records.create(type, householdId, fields),
    update: (type, id, fields) => current().records.update(type, id, fields),
    remove: (type, id) => current().records.remove(type, id),
  };

  const householdApi = createHouseholdRemote();
  /** Re-reads the user's households (after joining, leaving or a transfer) and syncs. */
  async function refreshHouseholds(): Promise<void> {
    const me = await auth.me();
    if (!me) return;
    rememberSession(me);
    useSessionStore.getState().setHouseholds(me.households);
    scheduler?.request();
  }

  // The services read `data` lazily, so they keep working across sign-out and sign-in.
  const services: Services = {
    session,
    sync: {
      syncNow: () => current().sync.syncNow(),
      pendingCount: () => (data ? data.sync.pendingCount() : Promise.resolve(0)),
      problems: () => (data ? data.sync.problems() : Promise.resolve([])),
    },
    pets: new PetService(records),
    measurements: new MeasurementService(records),
    health: new HealthService(records),
    today: new TodayService(records),
    push: createPushRemote(),
    files: {
      attach: (householdId, file) => current().files.attach(householdId, file),
      open: (fileId) => current().files.open(fileId),
      release: (url) => URL.revokeObjectURL(url),
    },
    documents: new DocumentService(records),
    expenses: new ExpenseService(records),
    contacts: new ContactService(records),
    households: new HouseholdService(householdApi, refreshHouseholds),
    conflicts: new ConflictService(
      {
        list: (householdId) => current().conflicts.list(householdId),
        markResolved: (id, at) => current().conflicts.markResolved(id, at),
      },
      records,
      householdApi,
    ),
  };

  return {
    queryClient,
    services,
    households: () => (data ? data.households() : Promise.resolve([])),
    async bootstrap() {
      const store = useSessionStore.getState();
      try {
        store.setConfig(await auth.config());
      } catch {
        store.setConfig(null);
      }
      try {
        const me = await auth.me();
        if (me) {
          rememberSession(me);
          open(me);
        } else store.setSignedOut();
      } catch (error) {
        if (!(error instanceof NetworkError)) throw error;
        // Offline: open the last user's own data on this device, if there is any.
        const last = recalledSession();
        useConnectivityStore.getState().update({ online: false });
        if (last) open(last);
        else store.setSignedOut();
      }
    },
  };
}
