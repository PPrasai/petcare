import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { VACCINE_SOON_DAYS, rankPets } from '../../application/ranking';
import type { StoredRecord } from '../../application/ports/record-store';
import type { TodayView } from '../../application/today';
import { useSessionStore } from '../../state/session';
import { useHouseholdId } from '../shared/permissions';
import { useServices } from '../shared/services-context';
import { useNow } from '../shared/use-now';

export interface HomePet {
  id: string;
  name: string;
  archived: boolean;
  record: StoredRecord;
}

export const NOTHING: TodayView = { overdue: [], today: [], upcoming: [], snoozed: [], done: [] };

/** The household's pets and what is due, read once for Home and the sidebar (same query keys). */
export function useHomeData() {
  const { pets, today } = useServices();
  const householdId = useHouseholdId();
  const tz = useSessionStore((s) => s.preferences.timeZone);
  const user = useSessionStore((s) => s.user);
  const list = useQuery({
    queryKey: ['pet', householdId],
    queryFn: () => pets.list(householdId),
    enabled: householdId !== '',
  });
  const view = useQuery({
    queryKey: ['today', householdId, { home: true }],
    queryFn: () =>
      today.view(householdId, {
        now: new Date(),
        tz,
        userId: user?.id ?? '',
        petId: null,
        horizonDays: VACCINE_SOON_DAYS,
      }),
    enabled: householdId !== '',
  });
  const homePets = useMemo<HomePet[]>(
    () =>
      (list.data ?? []).map((record) => ({
        id: record.id,
        name: String(record.data.name),
        archived: Boolean(record.data.archivedAt),
        record,
      })),
    [list.data],
  );
  return { householdId, tz, user, list, view, homePets };
}

/** The pets in Home order (most urgent first), for the sidebar. */
export function useRankedPets() {
  const { homePets, view } = useHomeData();
  const now = useNow();
  return useMemo(() => rankPets(homePets, view.data ?? NOTHING, now), [homePets, view.data, now]);
}
