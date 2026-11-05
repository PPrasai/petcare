import { getEntity } from '@petcare/domain';
import type { RecordStore, StoredRecord } from './ports/record-store';

export const SPECIES = ['dog', 'cat', 'rabbit', 'other'] as const;
export type Species = (typeof SPECIES)[number];

export interface NewPet {
  name: string;
  species: Species;
}

/** Pet use cases. Slice 8 extends this with edit, archive and measurements. */
export class PetService {
  constructor(private readonly records: RecordStore) {}

  async list(householdId: string): Promise<StoredRecord[]> {
    const pets = await this.records.list('pet', householdId);
    return pets
      .filter((p) => p.deletedAt === null)
      .sort((a, b) => String(a.data.name).localeCompare(String(b.data.name)));
  }

  /** Checks the input against the shared pet schema, then queues the create. */
  async create(householdId: string, input: NewPet): Promise<StoredRecord> {
    const data = { name: input.name.trim(), species: input.species };
    const parsed = getEntity('pet').schema.safeParse(data);
    if (!parsed.success) throw new Error('invalid pet');
    return this.records.create('pet', householdId, data);
  }
}
