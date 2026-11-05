import 'fake-indexeddb/auto';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FileApi } from '../../application/ports/file-api';
import { NetworkError, RemoteError } from '../../application/ports/remote-api';
import { LocalDb } from '../local/local-db';
import { enqueue } from './outbox';
import { uploadPendingFiles } from './pending-files';

// CAP-12: a file chosen offline is uploaded before the record that refers to it is pushed.
let db: LocalDb;
beforeEach(async () => {
  db = new LocalDb('u1', { indexedDB: new IDBFactory(), IDBKeyRange });
  await db.open();
});
afterEach(() => db.close());

const HID = '0197c8a0-0000-7000-8000-0000000000aa';
const PLACEHOLDER = '0197c8a0-0000-7000-8000-0000000000f1';
const REAL = '0197c8a0-0000-7000-8000-0000000000f2';
const DOC = '0197c8a0-0000-7000-8000-0000000000d1';

async function queueDocument(): Promise<void> {
  const data = { title: 'Rabies certificate', category: 'certificate', fileId: PLACEHOLDER };
  await db.pendingFiles.put({
    id: PLACEHOLDER,
    householdId: HID,
    name: 'cert.png',
    mimeType: 'image/png',
    blob: new Blob(['x'], { type: 'image/png' }),
  });
  await db.records('document').put({
    id: DOC,
    type: 'document',
    householdId: HID,
    version: 0,
    createdAt: '2026-06-01T10:00:00Z',
    createdBy: 'u1',
    updatedAt: '2026-06-01T10:00:00Z',
    updatedBy: 'u1',
    deletedAt: null,
    data,
    _pending: true,
  });
  await enqueue(db, {
    mutationId: '0197c8a0-0000-7000-8000-0000000000e1',
    type: 'document',
    id: DOC,
    householdId: HID,
    op: 'create',
    baseVersion: 0,
    fields: data,
    clientTime: '2026-06-01T10:00:00Z',
  });
}

const apiThat = (upload: FileApi['upload']): FileApi => ({ upload, download: async () => null });
const changes: string[][] = [];

describe('uploadPendingFiles', () => {
  it('uploads the file and swaps the placeholder in the record and the queued mutation', async () => {
    await queueDocument();
    const api = apiThat(async () => ({
      id: REAL,
      mimeType: 'image/png',
      sizeBytes: 1,
      originalName: 'cert.png',
    }));
    await uploadPendingFiles(db, api, 'u1', (types) => changes.push(types));

    expect((await db.records('document').get(DOC))?.data.fileId).toBe(REAL);
    expect((await db.outbox.toArray())[0]?.fields.fileId).toBe(REAL);
    expect(await db.pendingFiles.count()).toBe(0);
    expect(changes.at(-1)).toEqual(['document']);
  });

  it('keeps the file and stops when the network is down', async () => {
    await queueDocument();
    const api = apiThat(async () => {
      throw new NetworkError();
    });
    await expect(uploadPendingFiles(db, api, 'u1', () => undefined)).rejects.toBeInstanceOf(
      NetworkError,
    );
    expect(await db.pendingFiles.count()).toBe(1);
    expect((await db.outbox.toArray())[0]?.fields.fileId).toBe(PLACEHOLDER);
  });

  it('drops a file the server refuses and notes a sync problem', async () => {
    await queueDocument();
    const api = apiThat(async () => {
      throw new RemoteError(415, 'unsupportedType');
    });
    await uploadPendingFiles(db, api, 'u1', () => undefined);
    expect(await db.pendingFiles.count()).toBe(0);
    const [problem] = await db.problems.toArray();
    expect(problem?.code).toBe('unsupportedType');
  });
});
