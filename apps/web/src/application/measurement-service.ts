import { getEntity } from '@petcare/domain';
import type { StoredRecord, RecordStore } from './ports/record-store';
import { InvalidInput } from './pet-service';

export const MEASUREMENT_KINDS = [
  'weight',
  'height',
  'length',
  'temperature',
  'heartRate',
  'respiratoryRate',
  'bodyCondition',
] as const;
export type Kind = (typeof MEASUREMENT_KINDS)[number];

export interface NewMeasurement {
  petId: string;
  kind: Kind;
  /** Already converted to the stored (SI) unit. */
  value: number;
  measuredAt: string;
  note?: string;
}

/** Measurement use cases (weight over time, size, vitals, body-condition score). */
export class MeasurementService {
  constructor(private readonly records: RecordStore) {}

  /** A pet's measurements, oldest first. */
  async list(householdId: string, petId: string): Promise<StoredRecord[]> {
    const rows = await this.records.list('measurement', householdId);
    return rows
      .filter((m) => m.deletedAt === null && m.data.petId === petId)
      .sort((a, b) => String(a.data.measuredAt).localeCompare(String(b.data.measuredAt)));
  }

  async add(householdId: string, input: NewMeasurement): Promise<StoredRecord> {
    const note = input.note?.trim();
    const data = {
      petId: input.petId,
      kind: input.kind,
      value: input.value,
      measuredAt: input.measuredAt,
      ...(note ? { note } : {}),
    };
    const parsed = getEntity('measurement').schema.safeParse(data);
    if (!parsed.success) throw new InvalidInput(parsed.error.issues[0]?.path.join('.') ?? '');
    return this.records.create('measurement', householdId, data);
  }

  remove(id: string): Promise<void> {
    return this.records.remove('measurement', id);
  }
}
