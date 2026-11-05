import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { instantToLocalDate } from '@petcare/domain';
import type { HealthType } from '../../application/health-service';
import { useSessionStore } from '../../state/session';
import { useHouseholdId } from '../shared/permissions';
import { useServices } from '../shared/services-context';

/** A pet's records of one type, kept fresh by the local-write invalidation. */
export function useHealthList(type: HealthType, petId: string) {
  const { health } = useServices();
  const householdId = useHouseholdId();
  return useQuery({
    queryKey: [type, householdId, { petId }],
    queryFn: () => health.list(type, householdId, petId),
    enabled: householdId !== '',
  });
}

/** Today's calendar date in the user's time zone. */
export function useToday(): string {
  const tz = useSessionStore((s) => s.preferences.timeZone);
  const [today] = useState(() => instantToLocalDate(Date.now(), tz));
  return today;
}

/** Maps an InvalidInput path to a field name -> message map for a form. */
export function errorsFor(path: string | null, message: string): Record<string, string> {
  return path === null ? {} : { [path.split('.')[0] ?? path]: message };
}
