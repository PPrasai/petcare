import 'fake-indexeddb/auto';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { FileStorageUnavailable, isBlobStorageError } from '../../application/ports/file-gateway';
import type { FileApi } from '../../application/ports/file-api';
import { createFileGateway } from './file-access';
import { LocalDb } from './local-db';

async function gateway(putError?: Error) {
  const db = new LocalDb('u1', { indexedDB: new IDBFactory(), IDBKeyRange });
  await db.open();
  if (putError) {
    db.pendingFiles.put = (() => Promise.reject(putError)) as unknown as typeof db.pendingFiles.put;
  }
  return { db, files: createFileGateway(db, {} as FileApi, 'u1', () => undefined) };
}

describe('file gateway attach', () => {
  it('keeps the file for upload', async () => {
    const { db, files } = await gateway();
    const { fileId } = await files.attach(
      'h1',
      new File(['x'], 'a.pdf', { type: 'application/pdf' }),
    );
    expect(await db.pendingFiles.get(fileId)).toMatchObject({ name: 'a.pdf' });
  });

  it('says files cannot be saved when the browser refuses a Blob (WebKit private mode)', async () => {
    const refusal = new Error('Error preparing Blob/File data to be stored in object store');
    refusal.name = 'UnknownError';
    const { files } = await gateway(refusal);
    await expect(
      files.attach('h1', new File(['x'], 'a.pdf', { type: 'application/pdf' })),
    ).rejects.toBeInstanceOf(FileStorageUnavailable);
  });

  it('passes other storage errors through untouched', async () => {
    const full = new Error('quota');
    full.name = 'QuotaExceededError';
    const { files } = await gateway(full);
    await expect(files.attach('h1', new File(['x'], 'a.pdf'))).rejects.toBe(full);
  });

  it('recognises the Blob refusal', () => {
    expect(isBlobStorageError(new Error('Error preparing Blob/File data'))).toBe(true);
    expect(isBlobStorageError(new Error('quota'))).toBe(false);
    expect(isBlobStorageError('nope')).toBe(false);
  });
});
