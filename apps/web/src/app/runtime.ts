import { QueryClient } from '@tanstack/react-query';
import { v7 as uuidv7 } from 'uuid';
import { DEFAULT_PREFERENCES, preferencesSchema } from '@petcare/domain';
import type { Preferences } from '@petcare/domain';
import { ConflictService } from '../application/conflict-service';
import { AccountService } from '../application/account-service';
import { HouseholdService } from '../application/household-service';
import { createHouseholdRemote } from '../data/remote/household-remote';
import { DEMO_HOUSEHOLD_KEY, createDemoHousehold } from '../data/local/demo-household';
import type { HouseholdApi } from '../application/ports/household-api';
import { EmergencyService } from '../application/emergency-service';
import { createEmergencyRemote } from '../data/remote/emergency-remote';
import { ContactService } from '../application/contact-service';
import { DocumentService } from '../application/document-service';
import { ExpenseService } from '../application/expense-service';
import { HealthService } from '../application/health-service';
import { createFilesRemote } from '../data/remote/files-remote';
import { createPushRemote } from '../data/remote/push-remote';
import { RemovalService } from '../application/removal-service';
import { TodayService } from '../application/today-service';
import { LogService } from '../application/log-service';
import { MeasurementService } from '../application/measurement-service';
import { PetService } from '../application/pet-service';
import { PetPhotoService } from '../application/photo-service';
import { CanvasImageReducer } from '../data/media/canvas-image-reducer';
import { AuthError } from '../application/ports/auth-api';
import type { AuthApi, MeSnapshot } from '../application/ports/auth-api';
import { NetworkError } from '../application/ports/remote-api';
import type { RemoteApi } from '../application/ports/remote-api';
import type { RecordStore } from '../application/ports/record-store';
import type { Services, SessionControl, SignInResult } from '../application/services';
import {
  DEMO_HOUSEHOLD,
  DEMO_USER,
  DEMO_USER_ID,
  seedDemo,
  unreachableFiles,
  unreachableRemote,
  wipeDemo,
} from '../data/local/demo-data';
import { blockNetwork } from '../data/remote/network-gate';
import { createAuthRemote } from '../data/remote/auth-remote';
import { createSyncRemote } from '../data/remote/sync-remote';
import { forgetSession, recalledSession, rememberSession } from '../data/local/session-cache';
import { openUserData } from '../data/local/user-data';
import type { UserData } from '../data/local/user-data';
import { createScheduler } from '../data/sync/scheduler';
import type { Scheduler } from '../data/sync/scheduler';
import { useConnectivityStore } from '../state/connectivity';
import { useUiPreferences } from '../state/ui-preferences';
import { useSessionStore } from '../state/session';
import { createAccountRemote } from '../data/remote/account-remote';
import type { PreferenceDevice } from '../application/ports/preference-device';
import { adoptDeviceTimeZone } from '../application/time-zone';

/** Where the demo keeps its preferences: in the demo database, not on the server. */
const DEMO_PREFERENCES_KEY = 'demoPreferences';
/** A real account's preferences on this device, and the copy the server has not received yet. */
const PREFERENCES_KEY = 'preferences';
const PENDING_PREFERENCES_KEY = 'preferencesPending';
/** Set once per account and device when the device time zone has been offered (a new account starts on UTC). */
const ZONE_ADOPTED_PREFIX = 'petcare-zone-adopted:';

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
    const onOnline = () => {
      scheduler?.nudge();
      void services.account.flush().catch(() => undefined);
    };
    const onOffline = () => useConnectivityStore.getState().update({ online: false });
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      scheduler?.nudge();
      void services.account.flush().catch(() => undefined);
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
    void resumePreferences().catch(() => undefined);
  }

  function close(): void {
    scheduler?.stop();
    detach?.();
    data?.close();
    scheduler = null;
    detach = null;
    data = null;
  }

  const DEMO_FLAG = 'petcare-demo';
  const setDemoFlag = (on: boolean) => {
    try {
      if (on) localStorage.setItem(DEMO_FLAG, '1');
      else localStorage.removeItem(DEMO_FLAG);
    } catch {
      // Without storage a reload leaves the demo, which is harmless.
    }
  };
  const demoFlag = (): boolean => {
    try {
      return localStorage.getItem(DEMO_FLAG) === '1';
    } catch {
      return false;
    }
  };

  /** Opens the demo database (seeding it if empty). Never starts sync and never uses the network. */
  async function openDemo(): Promise<void> {
    blockNetwork(true);
    await seedDemo();
    data = openUserData(DEMO_USER_ID, unreachableRemote(), unreachableFiles(), {
      onChanged: invalidate,
      onStatus: () => undefined,
    });
    const saved = await data.readSetting(DEMO_PREFERENCES_KEY);
    const parsed = saved ? preferencesSchema.safeParse(JSON.parse(saved)) : null;
    const preferences = parsed?.success
      ? parsed.data
      : { ...DEFAULT_PREFERENCES, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone };
    if (parsed?.success) useUiPreferences.getState().setTheme(preferences.theme);
    // A household renamed in the demo keeps its new name after a reload.
    const stored = await data.households();
    useSessionStore
      .getState()
      .setSignedIn(
        DEMO_USER,
        stored.length > 0
          ? stored.map((h) => ({ id: h.id, name: h.name, role: h.role }))
          : [{ id: DEMO_HOUSEHOLD.id, name: DEMO_HOUSEHOLD.name, role: DEMO_HOUSEHOLD.role }],
        preferences,
        true,
      );
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
    async startDemo() {
      close();
      setDemoFlag(true);
      await openDemo();
    },
    async resetDemo() {
      close();
      await wipeDemo();
      await openDemo();
      // Every screen re-reads the freshly seeded database.
      await queryClient.invalidateQueries();
    },
    async exitDemo() {
      close();
      setDemoFlag(false);
      blockNetwork(false);
      queryClient.clear();
      useSessionStore.getState().setSignedOut();
      // Sign-in options are needed again if the demo was opened straight from a reload.
      if (!useSessionStore.getState().config) {
        void auth
          .config()
          .then((config) => useSessionStore.getState().setConfig(config))
          .catch(() => undefined);
      }
    },
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
    createMany: (householdId, items) => current().records.createMany(householdId, items),
    update: (type, id, fields) => current().records.update(type, id, fields),
    remove: (type, id) => current().records.remove(type, id),
    restore: (record) => current().records.restore(record),
  };

  const remoteHouseholds = createHouseholdRemote();
  /** The demo's people and invites live in the demo database; no request is made. */
  const demoHouseholds = createDemoHousehold({
    read: () => current().readSetting(DEMO_HOUSEHOLD_KEY),
    write: (value) => current().writeSetting(DEMO_HOUSEHOLD_KEY, value),
    rename: (id, name) => current().renameHousehold(id, name),
    now: () => new Date(),
    id: () => uuidv7(),
    origin: () => window.location.origin,
  });
  /** Household actions go to the server, or in the demo to this device. */
  const householdApi: HouseholdApi = new Proxy(remoteHouseholds, {
    get: (remote, name: keyof HouseholdApi) =>
      (useSessionStore.getState().demo ? demoHouseholds : remote)[name],
  });
  /** Re-reads the user's households (after joining, leaving or a transfer) and syncs. */
  async function refreshHouseholds(): Promise<void> {
    if (useSessionStore.getState().demo) {
      const rows = await current().households();
      useSessionStore
        .getState()
        .setHouseholds(rows.map((h) => ({ id: h.id, name: h.name, role: h.role })));
      return;
    }
    const me = await auth.me();
    if (!me) return;
    // The device's own preferences win over the server's while a save is still waiting.
    const state = useSessionStore.getState();
    rememberSession(state.demo ? me : { ...me, preferences: state.preferences });
    state.setHouseholds(me.households);
    scheduler?.request();
  }

  /** Makes saved preferences take effect now and on the next offline start. */
  function applyPreferences(preferences: Preferences): void {
    const state = useSessionStore.getState();
    state.setPreferences(preferences);
    useUiPreferences.getState().setTheme(preferences.theme);
    // The demo's preferences stay in the demo database, never in the offline copy of a real session.
    if (state.demo) return;
    const last = recalledSession();
    if (last) rememberSession({ ...last, preferences });
  }

  // The services read `data` lazily, so they keep working across sign-out and sign-in.
  const measurements = new MeasurementService(records);
  const health = new HealthService(records);
  const documents = new DocumentService(records);
  const expenses = new ExpenseService(records);
  const today = new TodayService(records);
  const files: Services['files'] = {
    attach: (householdId, file) => current().files.attach(householdId, file),
    open: (fileId) => current().files.open(fileId),
    release: (url) => URL.revokeObjectURL(url),
    discard: (fileId) => current().files.discard(fileId),
  };
  const reducer = new CanvasImageReducer();
  const accountApi = createAccountRemote();
  const readJson = async (key: string): Promise<Preferences | null> => {
    const raw = data ? await data.readSetting(key) : undefined;
    if (!raw) return null;
    try {
      const parsed = preferencesSchema.safeParse(JSON.parse(raw));
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  };
  /** Preferences are written to this device first; the server save follows when it can (offline first). */
  const preferenceDevice: PreferenceDevice = {
    localOnly: () => useSessionStore.getState().demo,
    async write(preferences, pending) {
      const json = JSON.stringify(preferences);
      if (useSessionStore.getState().demo) {
        await current().writeSetting(DEMO_PREFERENCES_KEY, json);
        return;
      }
      await current().writeSetting(PREFERENCES_KEY, json);
      if (pending) await current().writeSetting(PENDING_PREFERENCES_KEY, json);
      useSessionStore.getState().setPreferencesPending(pending);
    },
    pending: () => readJson(PENDING_PREFERENCES_KEY),
    async settle(sent) {
      const waiting = await readJson(PENDING_PREFERENCES_KEY);
      // A newer save replaced it while this one was in flight: leave that one waiting.
      if (waiting && JSON.stringify(waiting) !== JSON.stringify(sent)) return;
      await current().writeSetting(PENDING_PREFERENCES_KEY, '');
      useSessionStore.getState().setPreferencesPending(false);
    },
  };

  /**
   * After sign-in: preferences still waiting from an earlier session come back (and win over the
   * server's copy), a new account's untouched UTC default becomes this device's time zone (once),
   * and anything waiting is sent.
   */
  async function resumePreferences(): Promise<void> {
    const state = useSessionStore.getState();
    if (state.demo || !data || !state.user) return;
    const waiting = await readJson(PENDING_PREFERENCES_KEY);
    if (waiting) {
      applyPreferences(waiting);
      state.setPreferencesPending(true);
    } else {
      const flag = ZONE_ADOPTED_PREFIX + state.user.id;
      let adopted = false;
      try {
        adopted = localStorage.getItem(flag) === '1';
        if (!adopted) localStorage.setItem(flag, '1');
      } catch {
        // Without storage the check repeats next time; it only ever changes an untouched default.
      }
      const next = adopted ? null : adoptDeviceTimeZone(state.preferences);
      if (next) await services.account.savePreferences(next);
    }
    await services.account.flush();
  }

  const services: Services = {
    session,
    sync: {
      syncNow: () => current().sync.syncNow(),
      pendingCount: () => (data ? data.sync.pendingCount() : Promise.resolve(0)),
      problems: () => (data ? data.sync.problems() : Promise.resolve([])),
    },
    pets: new PetService(records, { next: () => uuidv7() }),
    photos: new PetPhotoService(records, files, reducer),
    measurements,
    health,
    today,
    push: createPushRemote(),
    files,
    documents,
    expenses,
    log: new LogService(measurements, health, expenses, documents, files, reducer, records, today),
    removal: new RemovalService(records),
    contacts: new ContactService(records),
    households: new HouseholdService(householdApi, refreshHouseholds),
    emergency: new EmergencyService(records, createEmergencyRemote()),
    account: new AccountService(accountApi, applyPreferences, preferenceDevice),
    conflicts: new ConflictService(
      {
        list: (householdId) => current().conflicts.list(householdId),
        markResolved: (id, at) => current().conflicts.markResolved(id, at),
      },
      records,
      householdApi,
    ),
  };

  /** Decides who is signed in; throws only for trouble that bootstrap turns into the sign-in page. */
  async function start(): Promise<void> {
    const store = useSessionStore.getState();
    store.setStartupProblem(false);
    if (demoFlag()) {
      await openDemo();
      return;
    }
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
      // Any reply the app cannot use (no connection, a 5xx or 404, a body that is not JSON) is
      // treated like being offline: the last user's own data on this device opens, if there is any.
      const last = recalledSession();
      useConnectivityStore.getState().update({ online: false });
      if (last) open(last);
      else {
        store.setSignedOut();
        // Plain offline shows the ordinary sign-in page; anything else says what happened.
        if (!(error instanceof NetworkError)) store.setStartupProblem(true);
      }
    }
  }

  return {
    queryClient,
    services,
    households: () => (data ? data.households() : Promise.resolve([])),
    async bootstrap() {
      try {
        await start();
      } catch {
        // Whatever else went wrong (storage, say), the app still opens, on the sign-in page.
        close();
        setDemoFlag(false);
        blockNetwork(false);
        useSessionStore.getState().setSignedOut();
        useSessionStore.getState().setStartupProblem(true);
      }
    },
  };
}
