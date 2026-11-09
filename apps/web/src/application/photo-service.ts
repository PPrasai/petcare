import type { FileGateway } from './ports/file-gateway';
import type { ImageReducer } from './ports/image-reducer';
import type { RecordStore } from './ports/record-store';

/** A pet's photo: chosen, reduced on the device, kept for upload, and set on the pet (CAP-22). */
export class PetPhotoService {
  constructor(
    private readonly records: RecordStore,
    private readonly files: FileGateway,
    private readonly reducer: ImageReducer,
  ) {}

  /**
   * Reduces the picture, keeps it on the device (it uploads with the next sync, offline or not)
   * and points the pet at it. A photo it replaces is released. Throws `PhotoUnusable` when the
   * file cannot be decoded; nothing changes then.
   */
  async set(householdId: string, petId: string, file: File): Promise<void> {
    const reduced = await this.reducer.reduce(file);
    const previous = await this.currentFileId(petId);
    const { fileId } = await this.files.attach(
      householdId,
      new File([reduced], 'photo.jpg', { type: reduced.type || 'image/jpeg' }),
    );
    await this.records.update('pet', petId, { photoFileId: fileId });
    if (previous) await this.files.discard(previous);
  }

  /** Takes the photo off the pet (the species illustration shows again) and releases the file. */
  async remove(petId: string): Promise<void> {
    const previous = await this.currentFileId(petId);
    if (!previous) return;
    await this.records.update('pet', petId, { photoFileId: null });
    await this.files.discard(previous);
  }

  private async currentFileId(petId: string): Promise<string | null> {
    const pet = await this.records.get('pet', petId);
    const id = pet?.data.photoFileId;
    return typeof id === 'string' ? id : null;
  }
}
