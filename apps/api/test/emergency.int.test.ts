import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { ApiClient } from './support/api-client';
import { pngOfSize } from './support/multipart';
import { mutation, pushOne } from './support/sync-helpers';
import { createTestApp } from './support/test-app';
import type { TestApp } from './support/test-app';
import { testConfig } from './support/test-config';
import { createTestDatabase } from './support/test-db';
import type { TestDatabase } from './support/test-db';
import { createPeople, shareHousehold } from './support/world';
import type { People } from './support/world';

/** QA-19: the public emergency page shows only the fields the owner switched on. */
let database: TestDatabase;
let api: TestApp;
let people: People;
let householdId: string;
let petId: string;
let cardId: string;
const owner = () => people.owner.client;
const publicPath = (token: string, suffix = '') => `/api/public/emergency/${token}${suffix}`;
const tokenOf = (url: string) => /\/e\/([A-Za-z0-9_-]{43})$/.exec(url)?.[1] ?? '';

beforeAll(async () => {
  database = await createTestDatabase();
  api = await createTestApp(
    testConfig({
      DATABASE_URL: database.url,
      REDIS_URL: inject('redisUrl'),
      FILES_DIR: mkdtempSync(join(tmpdir(), 'petcare-emergency-')),
    }),
    undefined,
    { relaxRateLimits: true },
  );
  people = await createPeople(api);
  householdId = (await shareHousehold(people, { api, databaseUrl: database.url })).householdId;

  const photo = await owner().upload(
    { householdId },
    { name: 'momo.png', type: 'image/png', bytes: pngOfSize() },
  );
  expect(photo.statusCode).toBe(201);
  const pet = mutation(householdId, 'pet', 'create', {
    name: 'Momo',
    species: 'dog',
    breed: 'Beagle',
    colour: 'tan',
    markings: 'white paw',
    microchipId: '985112000111222',
    photoFileId: photo.json().id,
  });
  expect((await pushOne(owner(), pet)).status).toBe('applied');
  petId = pet.id;
  for (const fields of [
    { petId, kind: 'allergy', name: 'Chicken' },
    { petId, kind: 'chronic', name: 'Arthritis' },
  ]) {
    expect(
      (await pushOne(owner(), mutation(householdId, 'condition', 'create', fields))).status,
    ).toBe('applied');
  }
  const medication = mutation(householdId, 'medication', 'create', {
    petId,
    name: 'Carprofen',
    schedule: { tz: 'UTC', kind: 'daily', times: ['08:00'], startOn: '2026-01-01' },
  });
  expect((await pushOne(owner(), medication)).status).toBe('applied');

  const card = mutation(householdId, 'emergencyCard', 'create', {
    petId,
    visibleFields: ['name', 'allergies', 'ownerPhone'],
    ownerPhone: '+1 555 0100',
    ownerDisplayName: 'Sam',
    notes: 'private note',
    isLost: false,
  });
  expect((await pushOne(owner(), card)).status).toBe('applied');
  cardId = card.id;
});
afterAll(async () => {
  await api.close();
  await database.drop();
});

const link = async () => {
  const res = await owner().post(`/api/emergency/${cardId}/link`);
  expect(res.statusCode).toBe(201);
  return tokenOf(res.json().url);
};

describe('the public card', () => {
  it('shows exactly the fields in visibleFields, and never a cached copy', async () => {
    const token = await link();
    const res = await new ApiClient(api).get(publicPath(token));
    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.json()).toEqual({
      isLost: false,
      name: 'Momo',
      allergies: ['Chicken'],
      ownerPhone: '+1 555 0100',
    });
    expect(res.body).not.toContain('Beagle');
    expect(res.body).not.toContain('985112000111222');
    expect(res.body).not.toContain('private note');
  });

  it('follows the toggles, and adds the lost message only while the pet is lost', async () => {
    const token = await link();
    const row = await owner().get('/api/sync/pull');
    const card = row.json().changes.find((c: { id: string }) => c.id === cardId);
    const update = mutation(
      householdId,
      'emergencyCard',
      'update',
      {
        visibleFields: ['photo', 'species', 'breed', 'conditions', 'medications', 'notes'],
        isLost: true,
        lostSince: '2026-06-01T10:00:00Z',
        lostMessage: 'Please call me',
      },
      { id: cardId, baseVersion: card.version },
    );
    expect((await pushOne(owner(), update)).status).toBe('applied');
    const res = await new ApiClient(api).get(publicPath(token));
    expect(res.json()).toEqual({
      isLost: true,
      lostSince: '2026-06-01T10:00:00Z',
      lostMessage: 'Please call me',
      hasPhoto: true,
      species: 'dog',
      breed: 'Beagle',
      conditions: ['Arthritis'],
      medications: ['Carprofen'],
      notes: 'private note',
    });
    expect(res.body).not.toContain('Momo');
    expect(res.body).not.toContain('555');
  });

  it('serves the photo only while photo is switched on', async () => {
    const token = await link();
    const anonymous = new ApiClient(api);
    const photo = await anonymous.get(publicPath(token, '/photo'));
    expect(photo.statusCode).toBe(200);
    expect(photo.headers['content-type']).toBe('image/png');
    expect(photo.headers['x-content-type-options']).toBe('nosniff');

    const pull = (await owner().get('/api/sync/pull')).json();
    const card = pull.changes.find((c: { id: string }) => c.id === cardId);
    const off = mutation(
      householdId,
      'emergencyCard',
      'update',
      { visibleFields: ['name'] },
      { id: cardId, baseVersion: card.version },
    );
    expect((await pushOne(owner(), off)).status).toBe('applied');
    expect((await anonymous.get(publicPath(token, '/photo'))).statusCode).toBe(404);
  });
});

describe('the link', () => {
  it('stops working once revoked or regenerated, and a malformed token is a 404', async () => {
    const anonymous = new ApiClient(api);
    const first = await link();
    expect((await anonymous.get(publicPath(first))).statusCode).toBe(200);

    const second = await link();
    expect(second).not.toBe(first);
    expect((await anonymous.get(publicPath(first))).statusCode).toBe(404);
    expect((await anonymous.get(publicPath(second))).statusCode).toBe(200);

    expect((await owner().request('DELETE', `/api/emergency/${cardId}/link`)).statusCode).toBe(204);
    expect((await anonymous.get(publicPath(second))).statusCode).toBe(404);
    expect((await anonymous.get(publicPath(second, '/photo'))).statusCode).toBe(404);
    expect((await anonymous.get(publicPath('short'))).statusCode).toBe(404);
  });

  it('is managed by the owner only; others get 403, outsiders and strangers 404, anonymous 401', async () => {
    const path = `/api/emergency/${cardId}/link`;
    expect((await people.caretaker.client.post(path)).statusCode).toBe(403);
    expect((await people.viewer.client.request('DELETE', path)).statusCode).toBe(403);
    expect((await people.outsider.client.post(path)).statusCode).toBe(404);
    expect((await owner().post(`/api/emergency/${petId}/link`)).statusCode).toBe(404);
    expect((await new ApiClient(api).post(path)).statusCode).toBe(401);
  });

  it('stops serving a card whose pet or card was deleted', async () => {
    const token = await link();
    const pull = (await owner().get('/api/sync/pull')).json();
    const card = pull.changes.find((c: { id: string }) => c.id === cardId);
    const gone = mutation(
      householdId,
      'emergencyCard',
      'delete',
      {},
      { id: cardId, baseVersion: card.version },
    );
    expect((await pushOne(owner(), gone)).status).toBe('applied');
    expect((await new ApiClient(api).get(publicPath(token))).statusCode).toBe(404);
  });
});

describe('rate limit', () => {
  it('allows 60 requests a minute per IP and then answers 429', async () => {
    const strict = await createTestApp(
      testConfig({
        DATABASE_URL: database.url,
        REDIS_URL: inject('redisUrl'),
        REDIS_KEY_PREFIX: 'emergency-limit:',
      }),
    );
    try {
      const client = new ApiClient(strict, undefined, '203.0.113.77');
      const token = 'A'.repeat(43);
      const statuses: number[] = [];
      for (let i = 0; i < 61; i++) statuses.push((await client.get(publicPath(token))).statusCode);
      expect(statuses.slice(0, 60).every((s) => s === 404)).toBe(true);
      expect(statuses[60]).toBe(429);
    } finally {
      await strict.close();
    }
  });
});
