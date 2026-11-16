import { getEntity } from '@petcare/domain';
import { changedFields, formToPetData, petToForm, withoutEmpty } from './pet-form';
import type { ArchiveReason, PetFormValues } from './pet-form';
import type { IdGenerator } from './ports/runtime';
import type { NewRecord, RecordStore, StoredRecord } from './ports/record-store';

export class InvalidInput extends Error {
  constructor(readonly path: string) {
    super(`invalid ${path}`);
    this.name = 'InvalidInput';
  }
}

/** Pet use cases. */
export class PetService {
  constructor(
    private readonly records: RecordStore,
    private readonly ids: IdGenerator = { next: () => crypto.randomUUID() },
  ) {}

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

  /**
   * Creates a pet and its first reminders in one local transaction (the add-pet wizard): either
   * all of them are written or none, so a failure never leaves a pet without its reminders and a
   * retry cannot make a second pet. `reminders` gets the new pet's id.
   */
  async createWithReminders(
    householdId: string,
    values: PetFormValues,
    reminders: (petId: string) => Record<string, unknown>[],
  ): Promise<StoredRecord> {
    const data = withoutEmpty(formToPetData(values));
    this.check(data);
    const petId = this.ids.next();
    const items: NewRecord[] = [{ id: petId, type: 'pet', data }];
    for (const reminder of reminders(petId)) {
      const parsed = getEntity('reminder').schema.safeParse(reminder);
      if (!parsed.success) throw new InvalidInput(parsed.error.issues[0]?.path.join('.') ?? '');
      items.push({ type: 'reminder', data: reminder });
    }
    const written = await this.records.createMany(householdId, items);
    const pet = written[0];
    if (!pet) throw new Error('pet was not written');
    return pet;
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
