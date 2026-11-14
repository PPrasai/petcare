import { useQuery } from '@tanstack/react-query';
import { t } from '../../i18n/t';
import { useSessionStore } from '../../state/session';
import { useHouseholdId } from '../shared/permissions';
import { useServices } from '../shared/services-context';

/** The name of a household member, or null while it is not known (members need the server). */
export function useMemberName(userId: string | null): string | null {
  const { households } = useServices();
  const householdId = useHouseholdId();
  const members = useQuery({
    queryKey: ['members', householdId],
    queryFn: () => households.members(householdId),
    enabled: userId !== null && householdId !== '',
    retry: false,
  });
  return members.data?.find((m) => m.userId === userId)?.name ?? null;
}

/**
 * The note on a reminder row for its audience (PO-petcare-002 Q-08): nothing for everyone,
 * "Only you" for the reader's own, "Only for <name>" for another member's.
 */
export function useAudienceLabel(audienceUserIds: unknown[]): (audience: unknown) => string {
  const me = useSessionStore((s) => s.user?.id ?? '');
  const others = audienceUserIds.filter((a): a is string => typeof a === 'string' && a !== me);
  const { households } = useServices();
  const householdId = useHouseholdId();
  const members = useQuery({
    queryKey: ['members', householdId],
    queryFn: () => households.members(householdId),
    enabled: others.length > 0 && householdId !== '',
    retry: false,
  });
  return (audience) => {
    if (typeof audience !== 'string' || audience === '') return '';
    if (audience === me) return t('reminder.onlyYou');
    const name = members.data?.find((m) => m.userId === audience)?.name;
    return t('reminder.who.only', { name: name ?? t('reminder.who.otherMember') });
  };
}
