import { buildActivity } from './activity';
import type { ActivityEntry } from './activity';
import type { StoredRecord } from './ports/record-store';

/** Recent care keeps this many lines in all, and reads at most this many per pet (SPEC-004 S-49). */
export const HOUSEHOLD_ACTIVITY_SHOWN = 20;

export type HouseholdActivityEntry = ActivityEntry & { petId: string };

/**
 * What everyone in the household did for the pets, newest first, for the Home and Household
 * "Recent care" panels. It reuses the per-pet activity of P7 (`buildActivity`) and bounds the
 * work: at most `perPet` lines of each pet go into the merge, and at most `total` come out, so
 * a household with many pets and a long history stays cheap.
 */
export function buildHouseholdActivity(
  all: readonly StoredRecord[],
  petIds: readonly string[],
  total = HOUSEHOLD_ACTIVITY_SHOWN,
  perPet = HOUSEHOLD_ACTIVITY_SHOWN,
): HouseholdActivityEntry[] {
  return petIds
    .flatMap((petId) =>
      buildActivity(all, petId)
        .slice(0, perPet)
        .map((entry): HouseholdActivityEntry => ({ ...entry, petId })),
    )
    .sort((a, b) => b.at.localeCompare(a.at) || b.key.localeCompare(a.key))
    .slice(0, total);
}
