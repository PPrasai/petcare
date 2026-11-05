import { and, eq, isNull } from 'drizzle-orm';
import type { Db } from '../db/connection';
import { conditions, emergencyTokens, medications } from '../db/schema';

export interface PetHealthNames {
  allergies: string[];
  conditions: string[];
  medications: { name: string; endOn: string | null }[];
}

/** emergency_tokens (server-only link hashes) and the pet facts a public card may show. */
export function createEmergencyRepository(db: Db) {
  return {
    /** Stores the hash of a new token for the card, replacing the old one. */
    async replaceToken(cardId: string, tokenHash: Buffer): Promise<Date> {
      const values = { tokenHash, createdAt: new Date() };
      const [row] = await db
        .insert(emergencyTokens)
        .values({ cardId, ...values })
        .onConflictDoUpdate({ target: emergencyTokens.cardId, set: values })
        .returning({ createdAt: emergencyTokens.createdAt });
      return row?.createdAt ?? values.createdAt;
    },

    async deleteToken(cardId: string): Promise<void> {
      await db.delete(emergencyTokens).where(eq(emergencyTokens.cardId, cardId));
    },

    async cardOfToken(tokenHash: Buffer): Promise<string | null> {
      const [row] = await db
        .select({ cardId: emergencyTokens.cardId })
        .from(emergencyTokens)
        .where(eq(emergencyTokens.tokenHash, tokenHash));
      return row?.cardId ?? null;
    },

    /** Names only: allergies, other open conditions, and medications with their end dates. */
    async healthNames(petId: string): Promise<PetHealthNames> {
      const found = await db
        .select({ kind: conditions.kind, name: conditions.name })
        .from(conditions)
        .where(
          and(
            eq(conditions.petId, petId),
            isNull(conditions.deletedAt),
            isNull(conditions.resolvedOn),
          ),
        );
      const meds = await db
        .select({ name: medications.name, schedule: medications.schedule })
        .from(medications)
        .where(and(eq(medications.petId, petId), isNull(medications.deletedAt)));
      return {
        allergies: found.filter((c) => c.kind === 'allergy').map((c) => c.name),
        conditions: found.filter((c) => c.kind !== 'allergy').map((c) => c.name),
        medications: meds.map((m) => {
          const endOn = (m.schedule as { endOn?: string | null } | null)?.endOn;
          return { name: m.name, endOn: endOn ?? null };
        }),
      };
    },
  };
}
