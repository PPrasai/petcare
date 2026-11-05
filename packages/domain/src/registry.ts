import type { EntityDefinition } from './define-entity';
import type { RecordType } from './schemas';
import { careCompletion } from './entities/care-completion';
import { careRoutine } from './entities/care-routine';
import { condition } from './entities/condition';
import { contact } from './entities/contact';
import { document } from './entities/document';
import { emergencyCard } from './entities/emergency-card';
import { expense } from './entities/expense';
import { measurement } from './entities/measurement';
import { medication } from './entities/medication';
import { medicationDose } from './entities/medication-dose';
import { pet } from './entities/pet';
import { reminder } from './entities/reminder';
import { reminderCompletion } from './entities/reminder-completion';
import { reminderSnooze } from './entities/reminder-snooze';
import { symptomEntry } from './entities/symptom-entry';
import { vaccination } from './entities/vaccination';
import { vetVisit } from './entities/vet-visit';

/** The one list of record types. Sync, local store, permissions and reminders read it. */
export const entities: EntityDefinition[] = [
  pet,
  measurement,
  vaccination,
  medication,
  medicationDose,
  vetVisit,
  condition,
  symptomEntry,
  careRoutine,
  careCompletion,
  reminder,
  reminderCompletion,
  reminderSnooze,
  document,
  expense,
  contact,
  emergencyCard,
];

export function getEntity(type: RecordType): EntityDefinition {
  const found = entities.find((e) => e.type === type);
  if (!found) throw new Error(`unknown record type: ${type}`);
  return found;
}

export function isRecordType(value: string): value is RecordType {
  return entities.some((e) => e.type === value);
}
