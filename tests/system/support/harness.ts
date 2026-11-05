import { randomUUID } from 'node:crypto';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import pg from 'pg';
import { afterAll, beforeAll, inject } from 'vitest';
import { v7 as uuidv7 } from 'uuid';
import { buildServer, loadConfig } from '../../../apps/api/src/server';
import {
  LocalDb,
  LocalStore,
  NetworkError,
  RemoteError,
  createSyncEngine,
} from '../../../apps/web/src/data/sync/index';
import type {
  PullPage,
  PushMutation,
  PushResult,
  RemoteApi,
  SyncEngine,
} from '../../../apps/web/src/data/sync/index';

type App = Awaited<ReturnType<typeof buildServer>>;

declare module 'vitest' {
  interface ProvidedContext {
    adminDatabaseUrl: string;
    redisUrl: string;
  }
}

const ORIGIN = 'http://localhost:5173';
let nextIp = 1;

export interface Reply {
  statusCode: number;
  body: string;
  headers: Record<string, string | string[] | number | undefined>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  json: () => any;
}

/** A cookie-keeping HTTP session against the in-process API. */
export class Session {
  private cookies = new Map<string, string>();
  readonly ip = `198.51.100.${nextIp++ % 250}`;
  userId = '';
  constructor(private readonly app: App) {}

  async request(method: 'GET' | 'POST', url: string, body?: unknown): Promise<Reply> {
    const cookie = [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
    const res = await this.app.inject({
      method,
      url,
      remoteAddress: '127.0.0.1',
      headers: {
        origin: ORIGIN,
        'x-forwarded-for': this.ip,
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        ...(cookie ? { cookie } : {}),
      },
      ...(body === undefined ? {} : { payload: JSON.stringify(body) }),
    });
    for (const header of [res.headers['set-cookie']].flat()) {
      if (!header) continue;
      const [pair = '', ...attrs] = header.split(';');
      const [name = '', ...value] = pair.split('=');
      if (attrs.some((a) => /max-age=0/i.test(a)) || value.join('=') === '') {
        this.cookies.delete(name.trim());
      } else this.cookies.set(name.trim(), value.join('='));
    }
    return res;
  }
}

/** The sync engine's view of the server: the real API, with an offline switch. */
export class InjectRemote implements RemoteApi {
  offline = false;
  /** When set, the response of the next push is thrown away after the server applied it. */
  loseNextPushResponse = false;
  /** Every push request that reached the server, in order. */
  readonly pushes: { clientId: string; mutations: PushMutation[] }[] = [];

  constructor(private readonly session: Session) {}

  async push(request: { clientId: string; mutations: PushMutation[] }) {
    if (this.offline) throw new NetworkError();
    this.pushes.push(request);
    const res = await this.session.request('POST', '/api/sync/push', request);
    if (res.statusCode !== 200) throw new RemoteError(res.statusCode, res.json().code ?? 'error');
    if (this.loseNextPushResponse) {
      this.loseNextPushResponse = false;
      throw new NetworkError('response lost');
    }
    return res.json() as { results: PushResult[]; serverTime: string };
  }

  async pull(cursor: string | undefined, limit?: number): Promise<PullPage> {
    if (this.offline) throw new NetworkError();
    const params = new URLSearchParams();
    if (cursor) params.set('cursor', cursor);
    if (limit !== undefined) params.set('limit', String(limit));
    const res = await this.session.request('GET', `/api/sync/pull?${params.toString()}`);
    if (res.statusCode !== 200) throw new RemoteError(res.statusCode, res.json().code ?? 'error');
    return res.json() as PullPage;
  }
}

/** One signed-in person on one device: a local database, a store, an engine, a remote. */
export interface Device {
  session: Session;
  userId: string;
  db: LocalDb;
  store: LocalStore;
  engine: SyncEngine;
  remote: InjectRemote;
}

export interface SystemWorld {
  app: () => App;
  databaseUrl: () => string;
  query: <T = Record<string, unknown>>(text: string, params?: unknown[]) => Promise<T[]>;
  /** Signs up a new person and gives them a device. */
  newDevice: (label?: string) => Promise<Device>;
  /** A second device for a person who already has a session. */
  deviceFor: (device: Device) => Device;
  /** A household owned by `owner`, with `members` added as caretakers. */
  shareHousehold: (owner: Device, members: Device[]) => Promise<string>;
}

export function useSystemWorld(): SystemWorld {
  let app: App;
  let databaseUrl = '';
  let dbName = '';

  const query = async <T>(text: string, params: unknown[] = []): Promise<T[]> => {
    const client = new pg.Client({ connectionString: databaseUrl });
    await client.connect();
    try {
      return (await client.query(text, params)).rows as T[];
    } finally {
      await client.end();
    }
  };

  beforeAll(async () => {
    const admin = new pg.Client({ connectionString: inject('adminDatabaseUrl') });
    await admin.connect();
    dbName = `t_${randomUUID().replaceAll('-', '')}`;
    await admin.query(`CREATE DATABASE ${dbName}`);
    await admin.end();
    const url = new URL(inject('adminDatabaseUrl'));
    url.pathname = `/${dbName}`;
    databaseUrl = url.toString();
    app = await buildServer({
      config: loadConfig({
        NODE_ENV: 'test',
        APP_ORIGIN: ORIGIN,
        BETTER_AUTH_SECRET: 'test-secret-test-secret-test-secret-123',
        REDIS_KEY_PREFIX: `s${randomUUID().slice(0, 8)}:`,
        OTEL_SDK_DISABLED: 'true',
        LOG_LEVEL: 'silent',
        RUN_JOBS: 'false',
        DATABASE_URL: databaseUrl,
        REDIS_URL: inject('redisUrl'),
      }),
      relaxRateLimits: true,
    });
  });
  afterAll(async () => {
    await app.close();
    const admin = new pg.Client({ connectionString: inject('adminDatabaseUrl') });
    await admin.connect();
    await admin.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
    await admin.end();
  });

  const deviceFor = (existing: Device): Device => makeDevice(existing.session, existing.userId);

  function makeDevice(session: Session, userId: string): Device {
    const remote = new InjectRemote(session);
    const db = new LocalDb(userId, { indexedDB: new IDBFactory(), IDBKeyRange });
    const clock = { now: () => new Date() };
    const ids = { next: () => uuidv7() };
    const engine = createSyncEngine({ db, remote, clock, ids });
    const store = new LocalStore({
      db,
      clock,
      ids,
      actorId: userId,
      onWrite: () => void engine.refreshPending(),
    });
    return { session, userId, db, store, engine, remote };
  }

  return {
    app: () => app,
    databaseUrl: () => databaseUrl,
    query,
    async newDevice(label = 'person') {
      const session = new Session(app);
      const email = `${label}-${randomUUID()}@example.test`;
      const res = await session.request('POST', '/api/auth/sign-up/email', {
        email,
        name: `${label} Person`,
        password: 'correct-horse-battery',
      });
      if (res.statusCode !== 200) throw new Error(`sign-up failed: ${res.body}`);
      const me = (await session.request('GET', '/api/me')).json();
      session.userId = me.user.id as string;
      return makeDevice(session, session.userId);
    },
    deviceFor,
    async shareHousehold(owner, members) {
      const created = await owner.session.request('POST', '/api/households', { name: 'Home' });
      if (created.statusCode !== 201) throw new Error(`create failed: ${created.body}`);
      const householdId = created.json().id as string;
      for (const member of members) {
        const invite = await owner.session.request(
          'POST',
          `/api/households/${householdId}/invites`,
          { role: 'caretaker' },
        );
        const token = new URL(invite.json().link).hash.slice(1);
        const accepted = await member.session.request('POST', '/api/invites/accept', { token });
        if (accepted.statusCode >= 300) throw new Error(`accept failed: ${accepted.body}`);
      }
      return householdId;
    },
  };
}
