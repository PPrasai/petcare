import { RECORD_TYPES } from '@petcare/domain';
import type { RecordType } from '@petcare/domain';
import type { ApiClient } from './api-client';
import { mutation, pushOne, uid } from './sync-helpers';

/** References a fixture can use. Created once per household with `createPrerequisites`. */
export interface Refs {
  householdId: string;
  petId: string;
  contactId: string;
  medicationId: string;
  routineId: string;
  reminderId: string;
  fileId: string;
  userId: string;
}

const schedule = { tz: 'UTC', kind: 'daily', startOn: '2026-01-01' };
const at = '2026-06-01T09:00:00Z';

/** Valid `data` for each record type. `petId` can be overridden to use a fresh pet. */
export function validData(
  type: RecordType,
  refs: Refs,
  petId = refs.petId,
): Record<string, unknown> {
  const data: Record<RecordType, Record<string, unknown>> = {
    pet: { name: 'Fixture pet', species: 'cat' },
    measurement: { petId, kind: 'weight', value: 5.2, measuredAt: at },
    vaccination: { petId, vaccineName: 'Rabies', givenOn: '2026-01-10', nextDueOn: '2027-01-10' },
    medication: { petId, name: 'Pill', schedule },
    medicationDose: {
      medicationId: refs.medicationId,
      petId,
      occurrenceAt: at,
      givenAt: at,
      skipped: false,
    },
    vetVisit: { petId, visitedOn: '2026-02-02', reason: 'checkup' },
    condition: { petId, kind: 'allergy', name: 'Chicken' },
    symptomEntry: { petId, observedAt: at, description: 'limping' },
    careRoutine: { petId, kind: 'walk', title: 'Morning walk', schedule, active: true },
    careCompletion: {
      routineId: refs.routineId,
      petId,
      occurrenceAt: at,
      completedAt: at,
      skipped: false,
    },
    reminder: { title: 'Call vet', schedule, active: true },
    reminderCompletion: { reminderId: refs.reminderId, occurrenceAt: at, completedAt: at },
    reminderSnooze: {
      sourceType: 'reminder',
      sourceId: refs.reminderId,
      occurrenceAt: at,
      snoozedUntil: '2026-06-01T10:00:00Z',
      userId: refs.userId,
    },
    document: { title: 'Certificate', category: 'certificate', fileId: refs.fileId },
    expense: { spentOn: '2026-03-03', category: 'vet', amountMinor: 4500, currency: 'USD' },
    contact: { name: 'Dr. Vet', role: 'vet' },
    emergencyCard: { petId, visibleFields: ['name'], isLost: false },
    careLog: { petId, kind: 'walk', occurredAt: at, durationMin: 30 },
    mealPreset: { petId, foodName: 'Kibble', quantity: 1, quantityUnit: 'cup' },
  };
  return data[type];
}

/** One valid change to an existing record of each mergeable type (appendOnly types have none). */
export const updateFor: Partial<Record<RecordType, Record<string, unknown>>> = {
  pet: { diet: 'wet food' },
  measurement: { value: 6.1 },
  vaccination: { note: 'booster' },
  medication: { note: 'with food' },
  vetVisit: { reason: 'follow-up' },
  condition: { note: 'mild' },
  symptomEntry: { severity: 'mild' },
  careRoutine: { title: 'Evening walk' },
  reminder: { title: 'Call the vet' },
  document: { title: 'Renamed' },
  expense: { note: 'receipt kept' },
  contact: { note: 'open late' },
  emergencyCard: { notes: 'shy dog' },
  mealPreset: { quantity: 2 },
};

export const ALL_TYPES: RecordType[] = [...RECORD_TYPES];

/**
 * The records other records point at, created by the owner: a pet, contact, medication,
 * care routine and reminder, plus a stored file row (inserted by the caller's SQL helper).
 */
export async function createPrerequisites(
  owner: ApiClient,
  ownerId: string,
  householdId: string,
  insertFile: (householdId: string, fileId: string) => Promise<void>,
): Promise<Refs> {
  const refs: Refs = {
    householdId,
    petId: uid(),
    contactId: uid(),
    medicationId: uid(),
    routineId: uid(),
    reminderId: uid(),
    fileId: uid(),
    userId: ownerId,
  };
  const make = async (type: RecordType, id: string) => {
    const result = await pushOne(
      owner,
      mutation(householdId, type, 'create', validData(type, refs), { id }),
    );
    if (result.status !== 'applied')
      throw new Error(`prerequisite ${type} failed: ${JSON.stringify(result)}`);
  };
  await make('pet', refs.petId);
  await make('contact', refs.contactId);
  await make('medication', refs.medicationId);
  await make('careRoutine', refs.routineId);
  await make('reminder', refs.reminderId);
  await insertFile(householdId, refs.fileId);
  return refs;
}
