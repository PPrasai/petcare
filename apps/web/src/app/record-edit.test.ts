import 'fake-indexeddb/auto';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ContactService } from '../application/contact-service';
import { DocumentService } from '../application/document-service';
import { ExpenseService } from '../application/expense-service';
import { changedFields } from '../application/record-checks';
import { HealthService } from '../application/health-service';
import { MeasurementService } from '../application/measurement-service';
import { InvalidInput } from '../application/pet-service';
import type { RecordStore, StoredRecord } from '../application/ports/record-store';
import { LocalDb } from '../data/local/local-db';
import type { LocalRecord } from '../data/local/local-db';
import { LocalStore } from '../data/sync/local-store';

// Editing a record: the service validates the whole record, writes only what changed to Dexie
// and queues one small update, with no network involved (the outbox is what sync sends later).
const HOUSEHOLD = '0197c8a0-0000-7000-8000-0000000000aa';
const PET = '0197c8a0-0000-7000-8000-0000000000bb';
const FILE = '0197c8a0-0000-7000-8000-0000000000cc';

let db: LocalDb;
let store: LocalStore;
let records: RecordStore;
let n = 0;

const present = (r: LocalRecord): StoredRecord => ({
  id: r.id,
  type: r.type,
  householdId: r.householdId,
  version: r.version,
  createdBy: r.createdBy,
  updatedAt: r.updatedAt,
  deletedAt: r.deletedAt,
  pending: r._pending === true,
  data: r.data,
});

beforeEach(async () => {
  db = new LocalDb('u1', { indexedDB: new IDBFactory(), IDBKeyRange });
  await db.open();
  n = 0;
  store = new LocalStore({
    db,
    clock: { now: () => new Date('2026-06-01T10:00:00Z') },
    ids: { next: () => `0197c8a0-0000-7000-8000-${String(++n).padStart(12, '0')}` },
    actorId: 'u1',
  });
  records = {
    list: async (type, householdId) =>
      (await db.records(type).where('householdId').equals(householdId).toArray()).map(present),
    get: async (type, id) => {
      const row = await store.get(type, id);
      return row ? present(row) : undefined;
    },
    create: async (type, householdId, data) => present(await store.create(type, householdId, data)),
    createMany: () => Promise.reject(new Error('not used')),
    update: async (type, id, fields) => present(await store.update(type, id, fields)),
    remove: (type, id) => store.remove(type, id),
    restore: () => Promise.reject(new Error('not used')),
  };
});
afterEach(() => db.close());

/** Pretends the server has the record, so the next change is a separate update. */
async function markSynced(type: Parameters<LocalStore['get']>[0], id: string, version = 3) {
  await db.outbox.clear();
  await db.records(type).update(id, { version, _pending: false });
}

describe('editing a vaccination', () => {
  it('queues one update with only the changed fields, and null for a cleared one', async () => {
    const health = new HealthService(records);
    const made = await health.add('vaccination', HOUSEHOLD, {
      petId: PET,
      vaccineName: 'Rabies',
      givenOn: '2026-05-01',
      batchNumber: 'B1',
    });
    await markSynced('vaccination', made.id);

    const edited = await health.edit('vaccination', made.id, {
      vaccineName: 'Rabies booster',
      givenOn: '2026-05-01',
      batchNumber: '',
    });

    expect(edited.data).toMatchObject({ vaccineName: 'Rabies booster', petId: PET });
    expect(edited.pending).toBe(true);
    const queue = await db.outbox.toArray();
    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject({
      op: 'update',
      id: made.id,
      baseVersion: 3,
      fields: { vaccineName: 'Rabies booster', batchNumber: null },
    });
  });

  it('folds an edit of a record that was never sent into its create', async () => {
    const health = new HealthService(records);
    const made = await health.add('vaccination', HOUSEHOLD, {
      petId: PET,
      vaccineName: 'Rabies',
      givenOn: '2026-05-01',
    });
    await health.edit('vaccination', made.id, { vaccineName: 'Rabies 2', givenOn: '2026-05-01' });
    const queue = await db.outbox.toArray();
    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject({ op: 'create', fields: { vaccineName: 'Rabies 2' } });
  });

  it('writes nothing when nothing changed', async () => {
    const health = new HealthService(records);
    const made = await health.add('vaccination', HOUSEHOLD, {
      petId: PET,
      vaccineName: 'Rabies',
      givenOn: '2026-05-01',
    });
    await markSynced('vaccination', made.id);
    await health.edit('vaccination', made.id, { vaccineName: 'Rabies', givenOn: '2026-05-01' });
    expect(await db.outbox.count()).toBe(0);
  });

  it('rejects an invalid record without writing, naming the field', async () => {
    const health = new HealthService(records);
    const made = await health.add('vaccination', HOUSEHOLD, {
      petId: PET,
      vaccineName: 'Rabies',
      givenOn: '2026-05-01',
    });
    await markSynced('vaccination', made.id);
    await expect(
      health.edit('vaccination', made.id, { vaccineName: '', givenOn: '2026-05-01' }),
    ).rejects.toMatchObject({ path: 'vaccineName' });
    await expect(
      health.edit('vaccination', made.id, { vaccineName: 'x', givenOn: 'tomorrow' }),
    ).rejects.toBeInstanceOf(InvalidInput);
    expect(await db.outbox.count()).toBe(0);
  });
});

describe('editing other health records', () => {
  it('changes a medication schedule as a whole value', async () => {
    const health = new HealthService(records);
    const schedule = { tz: 'UTC', kind: 'daily', times: ['08:00'], startOn: '2026-06-01' };
    const made = await health.add('medication', HOUSEHOLD, { petId: PET, name: 'Pill', schedule });
    await markSynced('medication', made.id);
    await health.edit('medication', made.id, {
      name: 'Pill',
      schedule: { ...schedule, times: ['09:30'] },
    });
    expect((await db.outbox.toArray())[0]?.fields).toEqual({
      schedule: { ...schedule, times: ['09:30'] },
    });
  });

  it('edits a vet visit, a condition and a symptom', async () => {
    const health = new HealthService(records);
    const visit = await health.add('vetVisit', HOUSEHOLD, {
      petId: PET,
      visitedOn: '2026-05-01',
      reason: 'Check-up',
    });
    const condition = await health.add('condition', HOUSEHOLD, {
      petId: PET,
      kind: 'allergy',
      name: 'Chicken',
    });
    const symptom = await health.add('symptomEntry', HOUSEHOLD, {
      petId: PET,
      observedAt: '2026-05-01T08:00:00.000Z',
      description: 'Limping',
    });
    const edited = [
      await health.edit('vetVisit', visit.id, { visitedOn: '2026-05-01', reason: 'Dental' }),
      await health.edit('condition', condition.id, { kind: 'chronic', name: 'Chicken' }),
      await health.edit('symptomEntry', symptom.id, {
        observedAt: '2026-05-01T08:00:00.000Z',
        description: 'Limping less',
        severity: 'mild',
      }),
    ];
    expect(edited.map((r) => r.data.petId)).toEqual([PET, PET, PET]);
    expect(edited[0]?.data.reason).toBe('Dental');
    expect(edited[1]?.data.kind).toBe('chronic');
    expect(edited[2]?.data).toMatchObject({ description: 'Limping less', severity: 'mild' });
  });
});

describe('changedFields', () => {
  it('leaves a stored list the form does not carry alone', () => {
    expect(changedFields({ reason: 'a', fileIds: [] }, { reason: 'b' })).toEqual({ reason: 'b' });
  });
});

describe('editing a measurement', () => {
  it('changes the value and clears an emptied note (notes cannot be null, so it becomes empty)', async () => {
    const measurements = new MeasurementService(records);
    const made = await measurements.add(HOUSEHOLD, {
      petId: PET,
      kind: 'weight',
      value: 10,
      measuredAt: '2026-05-01T08:00:00.000Z',
      note: 'after lunch',
    });
    await markSynced('measurement', made.id);
    const edited = await measurements.update(made.id, {
      kind: 'weight',
      value: 10.5,
      measuredAt: '2026-05-01T08:00:00.000Z',
      note: '  ',
    });
    expect(edited.data).toMatchObject({ value: 10.5, petId: PET });
    expect((await db.outbox.toArray())[0]?.fields).toEqual({ value: 10.5, note: '' });
    await expect(
      measurements.update(made.id, { kind: 'weight', value: -1, measuredAt: 'x' }),
    ).rejects.toBeInstanceOf(InvalidInput);
  });
});

describe('editing an expense', () => {
  const form = {
    petId: PET,
    spentOn: '2026-05-01',
    category: 'vet',
    amount: '12.50',
    currency: 'USD',
    note: '',
    fileId: FILE,
  };

  it('converts the amount, keeps the receipt when none is chosen and clears an emptied pet', async () => {
    const expenses = new ExpenseService(records);
    const made = await expenses.add(HOUSEHOLD, form);
    await markSynced('expense', made.id);
    const edited = await expenses.update(made.id, {
      ...form,
      amount: '20',
      petId: '',
      fileId: '',
    });
    expect(edited.data).toMatchObject({ amountMinor: 2000, fileId: FILE });
    expect(edited.data.petId ?? null).toBeNull();
    expect((await db.outbox.toArray())[0]?.fields).toEqual({ amountMinor: 2000, petId: null });
  });

  it('rejects a bad amount', async () => {
    const expenses = new ExpenseService(records);
    const made = await expenses.add(HOUSEHOLD, form);
    await expect(expenses.update(made.id, { ...form, amount: 'abc' })).rejects.toMatchObject({
      path: 'amount',
    });
  });
});

describe('editing a contact and a document', () => {
  it('clears an emptied contact field', async () => {
    const contacts = new ContactService(records);
    const blank = { role: 'vet', phone: '', email: '', address: '', website: '', note: '' };
    const made = await contacts.add(HOUSEHOLD, { ...blank, name: 'Dr Lee', phone: '555-0101' });
    await markSynced('contact', made.id);
    await contacts.update(made.id, { ...blank, name: 'Dr Lee', phone: '', note: 'Mon to Fri' });
    expect((await db.outbox.toArray())[0]?.fields).toEqual({ phone: null, note: 'Mon to Fri' });
    await expect(contacts.update(made.id, { ...blank, name: '' })).rejects.toMatchObject({
      path: 'name',
    });
  });

  it('renames a document and keeps its file', async () => {
    const documents = new DocumentService(records);
    const made = await documents.add(HOUSEHOLD, {
      petId: PET,
      title: 'Scan',
      category: 'vetRecord',
      fileId: FILE,
    });
    await markSynced('document', made.id);
    const edited = await documents.update(made.id, { title: 'Blood test', category: 'labResult' });
    expect(edited.data).toMatchObject({ title: 'Blood test', category: 'labResult', fileId: FILE });
    expect((await db.outbox.toArray())[0]?.fields).toEqual({
      title: 'Blood test',
      category: 'labResult',
    });
  });
});
