import { eq } from 'drizzle-orm';
import type { Preferences } from '@petcare/domain';
import { DEFAULT_PREFERENCES } from '@petcare/domain';
import type { Db } from '../db/connection';
import { userPreferences } from '../db/schema';

type Row = typeof userPreferences.$inferSelect;

function toPreferences(row: Row): Preferences {
  return {
    weightUnit: row.weightUnit as Preferences['weightUnit'],
    lengthUnit: row.lengthUnit as Preferences['lengthUnit'],
    temperatureUnit: row.temperatureUnit as Preferences['temperatureUnit'],
    timeZone: row.timeZone,
    dateFormat: row.dateFormat as Preferences['dateFormat'],
    currency: row.currency,
    theme: row.theme as Preferences['theme'],
    leadMinutes: {
      vaccination: row.leadVaccinationMin,
      medication: row.leadMedicationMin,
      careRoutine: row.leadRoutineMin,
      reminder: row.leadReminderMin,
      vetVisit: row.leadVetFollowupMin,
    },
    pushEnabled: row.pushEnabled,
    pushTypes: row.pushTypes as Preferences['pushTypes'],
  };
}

function toColumns(p: Preferences) {
  return {
    weightUnit: p.weightUnit,
    lengthUnit: p.lengthUnit,
    temperatureUnit: p.temperatureUnit,
    timeZone: p.timeZone,
    dateFormat: p.dateFormat,
    currency: p.currency,
    theme: p.theme,
    leadVaccinationMin: p.leadMinutes.vaccination,
    leadMedicationMin: p.leadMinutes.medication,
    leadRoutineMin: p.leadMinutes.careRoutine,
    leadReminderMin: p.leadMinutes.reminder,
    leadVetFollowupMin: p.leadMinutes.vetVisit,
    pushEnabled: p.pushEnabled,
    pushTypes: p.pushTypes,
  };
}

export function createPreferencesRepository(db: Db) {
  return {
    /** The user's preferences, or the defaults when they have never saved any. */
    async get(userId: string): Promise<Preferences> {
      const [row] = await db
        .select()
        .from(userPreferences)
        .where(eq(userPreferences.userId, userId));
      return row ? toPreferences(row) : DEFAULT_PREFERENCES;
    },

    async save(userId: string, preferences: Preferences): Promise<Preferences> {
      const values = { ...toColumns(preferences), updatedAt: new Date() };
      await db
        .insert(userPreferences)
        .values({ userId, ...values })
        .onConflictDoUpdate({ target: userPreferences.userId, set: values });
      return preferences;
    },
  };
}
