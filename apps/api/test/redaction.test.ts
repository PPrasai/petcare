import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from './support/test-app';
import type { TestApp } from './support/test-app';
import { testConfig } from './support/test-config';

// QA-12 (partial, slice 3): logs never contain passwords, cookies, tokens or request bodies.
// Trace redaction (CON-petcare-001 I-06 for spans) is added with observability in slice 17;
// the token routes themselves arrive in slices 11 and 14, where this test grows to hit them.
const PASSWORD = 'hunter2-correct-horse';
const COOKIE = 'better-auth.session_token=SESSIONSECRET123';
const BEARER = 'Bearer BEARERSECRET456';
const NOTES = 'private vet notes about Momo';

let api: TestApp;
beforeAll(async () => {
  api = await createTestApp(testConfig({ RUN_MIGRATIONS: 'false' }), 'trace');
});
afterAll(async () => {
  await api.close();
});

describe('log redaction', () => {
  it('does not log secrets sent in headers, query or body', async () => {
    await api.app.inject({
      method: 'POST',
      url: '/api/nope?token=QUERYSECRET789',
      headers: {
        origin: 'http://localhost:5173',
        'content-type': 'application/json',
        cookie: COOKIE,
        authorization: BEARER,
      },
      payload: JSON.stringify({ password: PASSWORD, notes: NOTES }),
    });
    await api.app.inject({
      method: 'GET',
      url: '/cal/CALTOKEN-abcdefghijklmnopqrstuvwxyz0123456789.ics',
    });
    await api.app.inject({
      method: 'GET',
      url: '/api/public/emergency/EMERGTOKEN-abcdefghijklmnop',
    });

    const output = api.logs();
    expect(output.length).toBeGreaterThan(0);
    for (const secret of [
      PASSWORD,
      'SESSIONSECRET123',
      'BEARERSECRET456',
      NOTES,
      'QUERYSECRET789',
      'CALTOKEN',
      'EMERGTOKEN',
    ]) {
      expect(output, `log contains ${secret}`).not.toContain(secret);
    }
  });

  it('logs the route template, not the raw URL', async () => {
    const line = api
      .logs()
      .split('\n')
      .find((l) => l.includes('"request"'));
    expect(line).toBeDefined();
    expect(line).toContain('"route":"unmatched"');
  });

  it('redacts sensitive fields when code logs them by mistake', async () => {
    api.app.log.info(
      {
        req: { headers: { cookie: COOKIE, authorization: BEARER } },
        user: { password: PASSWORD, token: 'TOKENVALUE', secret: 'SECRETVALUE' },
        body: { notes: NOTES },
      },
      'mistake',
    );
    const output = api.logs();
    for (const secret of [
      'SESSIONSECRET123',
      'BEARERSECRET456',
      PASSWORD,
      'TOKENVALUE',
      'SECRETVALUE',
      NOTES,
    ]) {
      expect(output).not.toContain(secret);
    }
    expect(output).toContain('[redacted]');
  });
});
