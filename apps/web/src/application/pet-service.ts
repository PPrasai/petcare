import { getEntity } from '@petcare/domain';
import { changedFields, formToPetData, petToForm, withoutEmpty } from './pet-form';
import type { ArchiveReason, PetFormValues } from './pet-form';
import type { RecordStore, StoredRecord } from './ports/record-store';

export class InvalidInput extends Error {
  constructor(readonly path: string) {
    super(`invalid ${path}`);
    this.name = 'InvalidInput';
  }
}

/** Pet use cases. */
export class PetService {
  constructor(private readonly records: RecordStore) {}

  /** Pets of the household; archived pets are listed after the active ones. */
  async list(householdId: string): Promise<StoredRecord[]> {
    const pets = (await this.records.list('pet', householdId)).filter((p) => p.deletedAt === null);
    const archived = (p: StoredRecord) => (p.data.archivedAt ? 1 : 0);
    return pets.sort(
      (a, b) => archived(a) - archived(b) || String(a.data.name).localeCompare(String(b.data.name)),
    );
  }

  async get(id: string): Promise<StoredRecord | undefined> {
    const pet = await this.records.get('pet', id);
    return pet && pet.deletedAt === null ? pet : undefined;
  }

  formValues(pet: StoredRecord): PetFormValues {
    return petToForm(pet);
  }

  /** Checks the input against the shared pet schema, then queues the create. */
  async create(householdId: string, values: PetFormValues): Promise<StoredRecord> {
    const data = withoutEmpty(formToPetData(values));
    this.check(data);
    return this.records.create('pet', householdId, data);
  }

  /** Saves only the fields that changed. Returns the pet unchanged when nothing did. */
  async update(id: string, values: PetFormValues): Promise<StoredRecord> {
    const pet = await this.requirePet(id);
    const fields = changedFields(pet.data, formToPetData(values));
    if (Object.keys(fields).length === 0) return pet;
    this.check({ ...pet.data, ...fields });
    return this.records.update('pet', id, fields);
  }

  /** Archives a pet (kept with all its history) or restores it (reason null). */
  async archive(id: string, reason: ArchiveReason | null): Promise<StoredRecord> {
    await this.requirePet(id);
    return this.records.update(
      'pet',
      id,
      reason === null
        ? { archivedAt: null, archivedReason: null }
        : { archivedAt: new Date().toISOString(), archivedReason: reason },
    );
  }

  private async requirePet(id: string): Promise<StoredRecord> {
    const pet = await this.get(id);
    if (!pet) throw new Error('pet not found');
    return pet;
  }

  private check(data: Record<string, unknown>): void {
    const parsed = getEntity('pet').schema.safeParse(data);
    if (!parsed.success) throw new InvalidInput(parsed.error.issues[0]?.path.join('.') ?? '');
  }
}
