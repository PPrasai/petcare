import { useQuery } from '@tanstack/react-query';
import { t } from '../../i18n/t';
import { useHouseholdId } from '../shared/permissions';
import { useServices } from '../shared/services-context';

/** The household's contacts, kept fresh by the local-write invalidation. */
export function useContacts() {
  const { contacts } = useServices();
  const householdId = useHouseholdId();
  return useQuery({
    queryKey: ['contact', householdId],
    queryFn: () => contacts.list(householdId),
    enabled: householdId !== '',
  });
}

/** Select options for linking a visit or vaccination to a contact (first option: none). */
export function useContactOptions(): { value: string; label: string }[] {
  const { data } = useContacts();
  return [
    { value: '', label: t('contacts.none') },
    ...(data ?? []).map((c) => ({ value: c.id, label: String(c.data.name) })),
  ];
}

/** The name of a contact by id, or null. */
export function useContactName(id: unknown): string | null {
  const { data } = useContacts();
  if (typeof id !== 'string') return null;
  const found = data?.find((c) => c.id === id);
  return found ? String(found.data.name) : null;
}
