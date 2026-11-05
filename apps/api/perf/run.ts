import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { spawn, execFileSync } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { GenericContainer } from 'testcontainers';
import { Redis } from 'ioredis';
import pg from 'pg';
import { v7 as uuidv7 } from 'uuid';
import { seedEnvelope } from '../src/cli/seed-envelope';
import { summarize, verdict } from './report';
import type { Sample } from './report';

/**
 * QA-01: 100 concurrent virtual users hit pull, push and REST reads on the envelope seed
 * (1,000 users, 20,000 records in each of 10 households). Writes reports/perf-<date>.json and
 * exits non-zero when reads p95 > 300 ms, push p95 > 500 ms or API RSS > 512 MB.
 */
const VIRTUAL_USERS = Number(process.env.PERF_VUS ?? 100);
const WARMUP_MS = 5_000;
const MEASURE_MS = 30_000;
const PORT = 3190;
const ORIGIN = 'http://localhost:5173';
const BASE = `http://127.0.0.1:${PORT}`;
const PASSWORD = 'correct-horse-battery';
const WRITE_SHARE = 0.2;
const REQUEST_TIMEOUT_MS = 15_000;
/**
 * A virtual user pauses between requests, as a person does: a random 0.5-1.5 s (mean 1 s) by
 * default, so 100 users make about 100 requests a second. PERF_THINK_MS=0 removes the pause to
 * find the saturation point instead.
 */
const THINK_MS = Number(process.env.PERF_THINK_MS ?? 1000);

interface Vu {
  cookie: string;
  householdId: string;
  petId: string;
}

async function waitForHealth(child: ChildProcess): Promise<void> {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error('the API process exited while starting');
    try {
      if ((await fetch(`${BASE}/api/health`)).ok) return;
    } catch {
      // not listening yet
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error('the API did not become healthy within 60 s');
}

/** Resident memory of a process in MB, on Windows, Linux and macOS. */
function rssMb(pid: number): number {
  if (process.platform === 'win32') {
    const out = execFileSync('tasklist', ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH'], {
      encoding: 'utf8',
    });
    const kb = Number((out.split('","')[4] ?? '').replace(/[^0-9]/g, ''));
    return kb / 1024;
  }
  if (process.platform === 'linux') {
    const status = readFileSync(`/proc/${pid}/status`, 'utf8');
    return Number(/VmRSS:\s+(\d+)/.exec(status)?.[1] ?? 0) / 1024;
  }
  return Number(execFileSync('ps', ['-o', 'rss=', '-p', String(pid)], { encoding: 'utf8' })) / 1024;
}

async function signUpUser(n: number): Promise<{ cookie: string; userId: string }> {
  const res = await fetch(`${BASE}/api/auth/sign-up/email`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: ORIGIN,
      // Better Auth limits sign-ups per client address; each virtual user has its own.
      'x-forwarded-for': `10.20.${Math.floor(n / 250)}.${(n % 250) + 1}`,
    },
    body: JSON.stringify({ email: `vu-${n}@example.test`, name: `VU ${n}`, password: PASSWORD }),
  });
  if (!res.ok) throw new Error(`sign-up ${n} failed: ${res.status}`);
  const cookie = res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ');
  const body = (await res.json()) as { user: { id: string } };
  return { cookie, userId: body.user.id };
}

async function main(): Promise<void> {
  const postgres = await new PostgreSqlContainer('postgres:17-alpine').start();
  const redisContainer = await new GenericContainer('redis:7-alpine')
    .withExposedPorts(6379)
    .start();
  const redisUrl = `redis://${redisContainer.getHost()}:${redisContainer.getMappedPort(6379)}`;
  const databaseUrl = postgres.getConnectionUri();
  let server: ChildProcess | undefined;
  try {
    server = spawn(process.execPath, ['--import', 'tsx', 'perf/serve.ts'], {
      cwd: new URL('..', import.meta.url),
      stdio: ['ignore', 'inherit', 'inherit'],
      env: {
        ...process.env,
        NODE_ENV: 'test',
        PORT: String(PORT),
        APP_ORIGIN: ORIGIN,
        DATABASE_URL: databaseUrl,
        REDIS_URL: redisUrl,
        REDIS_KEY_PREFIX: 'perf:',
        BETTER_AUTH_SECRET: 'perf-secret-perf-secret-perf-secret-123',
        FILES_DIR: '.perf-files',
        OTEL_SDK_DISABLED: 'true',
        LOG_LEVEL: 'silent',
        RUN_JOBS: 'false',
      },
    });
    await waitForHealth(server);
    const serverPid = server.pid ?? 0;

    console.log('seeding the envelope (1,000 users, 10 households x 20,000 records)...');
    const seeded = await seedEnvelope(databaseUrl);

    console.log(`signing up ${VIRTUAL_USERS} virtual users...`);
    const db = new pg.Client({ connectionString: databaseUrl });
    db.on('error', () => undefined);
    await db.connect();
    const redis = new Redis(redisUrl);
    redis.on('error', () => undefined);
    const users: Vu[] = [];
    for (let n = 0; n < VIRTUAL_USERS; n += 10) {
      const batch = await Promise.all(
        Array.from({ length: Math.min(10, VIRTUAL_USERS - n) }, (_, k) => signUpUser(n + k)),
      );
      for (const [k, user] of batch.entries()) {
        const householdId = seeded.householdIds[(n + k) % seeded.householdIds.length] ?? '';
        await db.query(
          `INSERT INTO memberships (household_id, user_id, role) VALUES ($1, $2, 'caretaker')`,
          [householdId, user.userId],
        );
        await redis.del(`perf:mem:${user.userId}`);
        const pet = await db.query<{ id: string }>(
          'SELECT id FROM pets WHERE household_id = $1 LIMIT 1',
          [householdId],
        );
        users.push({ cookie: user.cookie, householdId, petId: pet.rows[0]?.id ?? '' });
      }
    }
    await db.end();
    redis.disconnect();

    // One request of each kind first, so a broken setup fails with a reason, not a timeout.
    const first = users[0];
    if (first) {
      for (const path of ['/api/me', '/api/households', '/api/sync/pull?limit=100']) {
        const res = await fetch(`${BASE}${path}`, {
          headers: { cookie: first.cookie },
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        console.log(`smoke ${path} -> ${res.status}`);
      }
    }

    const samples: Sample[] = [];
    let rssPeak = 0;
    const sampler = setInterval(() => {
      try {
        rssPeak = Math.max(rssPeak, rssMb(serverPid));
      } catch {
        // the process may be between states; the next tick samples again
      }
    }, 500);

    const measureFrom = Date.now() + WARMUP_MS;
    const stopAt = measureFrom + MEASURE_MS;
    console.log(`${VIRTUAL_USERS} virtual users for ${(WARMUP_MS + MEASURE_MS) / 1000} s...`);
    await Promise.all(
      users.map((vu, index) => virtualUser(vu, index, measureFrom, stopAt, samples)),
    );
    clearInterval(sampler);
    rssPeak = Math.max(rssPeak, rssMb(serverPid));

    const report = summarize({
      samples,
      rssPeakMb: rssPeak,
      virtualUsers: VIRTUAL_USERS,
      thinkMs: THINK_MS,
      measuredSeconds: MEASURE_MS / 1000,
    });
    const reportsDir = fileURLToPath(new URL('../../../reports/', import.meta.url));
    mkdirSync(reportsDir, { recursive: true });
    const file = `${reportsDir}perf-${new Date().toISOString().slice(0, 10)}.json`;
    writeFileSync(file, JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    console.log(`written to ${file}`);
    const breaches = verdict(report);
    if (breaches.length > 0) {
      console.error(`perf budget breached:\n- ${breaches.join('\n- ')}`);
      process.exitCode = 1;
    } else {
      console.log('perf budget met');
    }
  } finally {
    server?.kill();
    await redisContainer.stop();
    await postgres.stop();
  }
}

/** One virtual user: a loop of reads and pushes until `stopAt`; only samples after `from` count. */
async function virtualUser(
  vu: Vu,
  index: number,
  from: number,
  stopAt: number,
  samples: Sample[],
): Promise<void> {
  const headers = { cookie: vu.cookie, origin: ORIGIN, 'content-type': 'application/json' };
  const reads = [
    '/api/me',
    '/api/households',
    `/api/households/${vu.householdId}/members`,
    '/api/sync/pull?limit=100',
  ];
  for (let step = index; Date.now() < stopAt; step++) {
    const isWrite = (step * 7919) % 100 < WRITE_SHARE * 100;
    const started = performance.now();
    let ok: boolean;
    let path = '/api/sync/push';
    try {
      if (isWrite) {
        const mutation = {
          mutationId: uuidv7(),
          type: 'measurement',
          id: uuidv7(),
          householdId: vu.householdId,
          op: 'create',
          baseVersion: 0,
          fields: {
            petId: vu.petId,
            kind: 'weight',
            value: 5 + (step % 50) / 10,
            measuredAt: new Date().toISOString(),
          },
          clientTime: new Date().toISOString(),
        };
        const res = await fetch(`${BASE}/api/sync/push`, {
          method: 'POST',
          headers,
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
          body: JSON.stringify({ clientId: uuidv7(), mutations: [mutation] }),
        });
        const body = (await res.json()) as { results?: { status: string }[] };
        ok = res.ok && body.results?.[0]?.status === 'applied';
      } else {
        path = reads[step % reads.length] ?? '';
        const res = await fetch(`${BASE}${path}`, {
          headers,
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        await res.arrayBuffer();
        ok = res.ok;
      }
    } catch {
      ok = false;
    }
    const ms = performance.now() - started;
    if (THINK_MS > 0) await new Promise((r) => setTimeout(r, THINK_MS * (0.5 + Math.random())));
    if (Date.now() >= from)
      samples.push({
        kind: isWrite ? 'push' : 'read',
        path: path.replace(vu.householdId, ':householdId').replace(/\?.*/, ''),
        ms,
        ok,
      });
  }
}

try {
  await main();
} catch (error) {
  console.error('perf run failed:', error);
  process.exitCode = 1;
}
