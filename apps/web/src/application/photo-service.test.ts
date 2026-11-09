import { describe, expect, it } from 'vitest';
import { PhotoUnusable } from './ports/image-reducer';
import type { ImageReducer } from './ports/image-reducer';
import type { FileGateway } from './ports/file-gateway';
import type { RecordStore, StoredRecord } from './ports/record-store';
import { PetPhotoService } from './photo-service';

// QA-35 (service part): a fake reducer; the real one needs a browser and is run by
// e2e/pet-photo.spec.ts.
const PET = '0190a1b2-c3d4-7e5f-8a6b-000000000001';
const OLD = '0190a1b2-c3d4-7e5f-8a6b-0000000000f1';
const NEW = '0190a1b2-c3d4-7e5f-8a6b-0000000000f2';

function setup(photoFileId: string | null, reducer?: ImageReducer) {
  const pet = { id: PET, data: { name: 'Momo', photoFileId } } as unknown as StoredRecord;
  const updates: Record<string, unknown>[] = [];
  const attached: File[] = [];
  const discarded: string[] = [];
  const store = {
    get: () => Promise.resolve(pet),
    update: (_t: string, _id: string, fields: Record<string, unknown>) => {
      updates.push(fields);
      return Promise.resolve(pet);
    },
  } as unknown as RecordStore;
  const files = {
    attach: (_h: string, file: File) => {
      attached.push(file);
      return Promise.resolve({ fileId: NEW });
    },
    discard: (id: string) => {
      discarded.push(id);
      return Promise.resolve();
    },
  } as unknown as FileGateway;
  const fake: ImageReducer = reducer ?? {
    reduce: () => Promise.resolve(new Blob(['small'], { type: 'image/jpeg' })),
  };
  return { service: new PetPhotoService(store, files, fake), updates, attached, discarded };
}

const chosen = new File(['big'], 'IMG_0001.heic', { type: 'image/heic' });

describe('PetPhotoService', () => {
  it('keeps the reduced picture, points the pet at it and has nothing to release', async () => {
    const { service, updates, attached, discarded } = setup(null);
    await service.set('h1', PET, chosen);
    expect(attached).toHaveLength(1);
    expect(attached[0]?.type).toBe('image/jpeg');
    expect(attached[0]?.size).toBe(5);
    expect(updates).toEqual([{ photoFileId: NEW }]);
    expect(discarded).toEqual([]);
  });

  it('releases the old file when the photo is replaced', async () => {
    const { service, updates, discarded } = setup(OLD);
    await service.set('h1', PET, chosen);
    expect(updates).toEqual([{ photoFileId: NEW }]);
    expect(discarded).toEqual([OLD]);
  });

  it('sets the photo to null and releases the file on remove', async () => {
    const { service, updates, discarded } = setup(OLD);
    await service.remove(PET);
    expect(updates).toEqual([{ photoFileId: null }]);
    expect(discarded).toEqual([OLD]);
  });

  it('does nothing when there is no photo to remove', async () => {
    const { service, updates } = setup(null);
    await service.remove(PET);
    expect(updates).toEqual([]);
  });

  it('changes nothing when the file cannot be decoded', async () => {
    const { service, updates, attached, discarded } = setup(OLD, {
      reduce: () => Promise.reject(new PhotoUnusable()),
    });
    await expect(service.set('h1', PET, chosen)).rejects.toBeInstanceOf(PhotoUnusable);
    expect(updates).toEqual([]);
    expect(attached).toEqual([]);
    expect(discarded).toEqual([]);
  });
});
