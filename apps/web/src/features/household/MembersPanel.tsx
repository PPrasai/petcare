import { useQueryClient } from '@tanstack/react-query';
import type { UseQueryResult } from '@tanstack/react-query';
import { useState } from 'react';
import type { ReactNode } from 'react';
import type { MemberRole } from '../../application/ports/household-api';
import { t } from '../../i18n/t';
import type { MessageKey } from '../../i18n/en';
import { useSessionStore } from '../../state/session';
import {
  Banner,
  Button,
  Card,
  Dialog,
  Initials,
  Line,
  Pill,
  SelectField,
  Sheet,
  SheetHead,
} from '../../ui';
import type { Tone } from '../../ui';
import { useServices } from '../shared/services-context';
import { useToastStore } from '../shared/toast';
import { useHouseholdAction } from './useHouseholdAction';

interface Person {
  userId: string;
  name: string;
  role: MemberRole;
}

const ROLE_TONE: Record<MemberRole, Tone> = { owner: 'soon', caretaker: 'today', viewer: 'ok' };
const ROLE_ORDER: MemberRole[] = ['owner', 'caretaker', 'viewer'];
const roleLabel = (role: MemberRole) => t(`household.role.${role}` as MessageKey);
const roleHint = (role: MemberRole) => t(`household.roleHint.${role}` as MessageKey);

/** Owners first, then caretakers, then viewers; you first in your role, then by name. */
function ordered(people: Person[], me: string): Person[] {
  return [...people].sort(
    (a, b) =>
      ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role) ||
      Number(b.userId === me) - Number(a.userId === me) ||
      a.name.localeCompare(b.name),
  );
}

/** The member rows (list items). `manage` adds the owner's "Manage" action to a person's row. */
export function PeopleLines({
  members,
  me,
  manage,
}: {
  members: Person[];
  me: string;
  manage?: (person: Person) => ReactNode;
}) {
  return ordered(members, me).map((m) => (
    <Line
      key={m.userId}
      testId="member-row"
      lead={<Initials name={m.name} seed={m.userId} />}
      title={m.name}
      sub={
        m.userId === me ? t('household.youPrefix', { hint: roleHint(m.role) }) : roleHint(m.role)
      }
      aside={<Pill tone={ROLE_TONE[m.role]}>{roleLabel(m.role)}</Pill>}
      actions={manage?.(m)}
    />
  ));
}

function MemberSheet({
  householdId,
  person,
  onClose,
  onTransfer,
}: {
  householdId: string;
  person: Person;
  onClose: () => void;
  onTransfer: () => void;
}) {
  const { households } = useServices();
  const client = useQueryClient();
  const showToast = useToastStore((s) => s.show);
  const { run, error, busy } = useHouseholdAction();
  const reload = () => client.invalidateQueries({ queryKey: ['members', householdId] });
  return (
    <>
      <SheetHead title={person.name} onClose={onClose} />
      <Line
        as="div"
        lead={<Initials name={person.name} seed={person.userId} />}
        title={roleLabel(person.role)}
        sub={roleHint(person.role)}
      />
      {error ? <Banner tone="warn">{error}</Banner> : null}
      <SelectField
        label={t('household.roleOf', { name: person.name })}
        value={person.role}
        options={(['caretaker', 'viewer'] as const).map((r) => ({
          value: r,
          label: roleLabel(r),
        }))}
        disabled={busy}
        onChange={(e) => {
          const role = e.target.value === 'viewer' ? 'viewer' : 'caretaker';
          void run(async () => {
            await households.changeRole(householdId, person.userId, role);
            await reload();
            showToast(
              t('household.roleChanged', {
                name: person.name,
                role: roleLabel(role).toLowerCase(),
              }),
            );
          });
        }}
      />
      <Button variant="secondary" disabled={busy} onClick={onTransfer}>
        {t('household.makeOwner', { name: person.name })}
      </Button>
      <Button
        variant="danger"
        disabled={busy}
        onClick={() =>
          void run(async () => {
            await households.removeMember(householdId, person.userId);
            await reload();
            showToast(t('household.removed', { name: person.name }));
            onClose();
          })
        }
      >
        {t('household.remove', { name: person.name })}
      </Button>
    </>
  );
}

interface Props {
  householdId: string;
  isOwner: boolean;
  members: UseQueryResult<Person[]>;
  onInvite: () => void;
  /** The invite sheet, which has to sit inside a card. */
  children?: ReactNode;
}

/** People in the household, with the owner's invite, role change, removal and ownership transfer. */
export function MembersPanel({ householdId, isOwner, members, onInvite, children }: Props) {
  const { households } = useServices();
  const me = useSessionStore((s) => s.user?.id ?? '');
  const client = useQueryClient();
  const { run, error, busy } = useHouseholdAction();
  const [managing, setManaging] = useState<string | null>(null);
  const [transferTo, setTransferTo] = useState<string | null>(null);
  const person = members.data?.find((m) => m.userId === managing);
  const target = members.data?.find((m) => m.userId === transferTo);

  return (
    <Card>
      <div className="sech">
        <h2>{t('household.people')}</h2>
        {isOwner ? <Button onClick={onInvite}>{t('household.invite')}</Button> : null}
      </div>
      {members.isError ? <Banner tone="warn">{t('household.error.offline')}</Banner> : null}
      {members.isPending && members.fetchStatus !== 'idle' ? (
        <div className="empty" aria-busy="true">
          {t('ui.loading')}
        </div>
      ) : null}
      {error ? <Banner tone="warn">{error}</Banner> : null}
      {(members.data ?? []).length > 0 ? (
        <ul>
          <PeopleLines
            members={members.data ?? []}
            me={me}
            manage={(m) =>
              isOwner && m.userId !== me && m.role !== 'owner' ? (
                <button
                  type="button"
                  className="linkbtn"
                  aria-label={t('household.manage', { name: m.name })}
                  onClick={() => setManaging(m.userId)}
                >
                  {t('household.manageShort')}
                </button>
              ) : null
            }
          />
        </ul>
      ) : null}
      {children}
      <Sheet
        open={person !== undefined}
        label={person?.name ?? ''}
        onClose={() => setManaging(null)}
      >
        {person ? (
          <MemberSheet
            householdId={householdId}
            person={person}
            onClose={() => setManaging(null)}
            onTransfer={() => setTransferTo(person.userId)}
          />
        ) : null}
      </Sheet>
      <Dialog
        open={target !== undefined}
        title={t('household.transferTitle')}
        onClose={() => setTransferTo(null)}
      >
        <p>{t('household.transferBody', { name: target?.name ?? '' })}</p>
        <div className="acts">
          <Button
            disabled={busy}
            onClick={() =>
              void run(async () => {
                if (transferTo) await households.transferOwnership(householdId, transferTo);
                setTransferTo(null);
                setManaging(null);
                await client.invalidateQueries({ queryKey: ['members', householdId] });
              })
            }
          >
            {t('household.transferConfirm')}
          </Button>
          <Button variant="secondary" onClick={() => setTransferTo(null)}>
            {t('household.cancel')}
          </Button>
        </div>
      </Dialog>
    </Card>
  );
}
