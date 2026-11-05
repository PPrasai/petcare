import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { t } from '../../i18n/t';
import type { MessageKey } from '../../i18n/en';
import { useSessionStore } from '../../state/session';
import { Banner, Button, Dialog, SelectField } from '../../ui';
import { useServices } from '../shared/services-context';
import { useHouseholdAction } from './useHouseholdAction';

interface Props {
  householdId: string;
  isOwner: boolean;
}

/** Members of the household, with role changes, removal and ownership transfer for the owner. */
export function MembersPanel({ householdId, isOwner }: Props) {
  const { households } = useServices();
  const me = useSessionStore((s) => s.user?.id ?? '');
  const client = useQueryClient();
  const members = useQuery({
    queryKey: ['members', householdId],
    queryFn: () => households.members(householdId),
    enabled: householdId !== '',
    retry: false,
  });
  const { run, error, busy } = useHouseholdAction();
  const [transferTo, setTransferTo] = useState<string | null>(null);
  const reload = () => client.invalidateQueries({ queryKey: ['members', householdId] });

  const target = members.data?.find((m) => m.userId === transferTo);
  return (
    <section aria-labelledby="members-title" className="flex flex-col gap-3">
      <h2 id="members-title" className="text-xl font-semibold">
        {t('household.members')}
      </h2>
      {members.isError ? <Banner tone="warn">{t('household.error.offline')}</Banner> : null}
      {error ? <Banner tone="warn">{error}</Banner> : null}
      <ul className="flex flex-col gap-2">
        {(members.data ?? []).map((m) => {
          const self = m.userId === me;
          const editable = isOwner && !self && m.role !== 'owner';
          return (
            <li
              key={m.userId}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-card p-3"
            >
              <div>
                <strong>{m.name}</strong>
                {self ? ` (${t('household.you')})` : ''}
                <p className="text-sm">{t(`household.role.${m.role}` as MessageKey)}</p>
              </div>
              {editable ? (
                <div className="flex flex-wrap items-end gap-2">
                  <SelectField
                    label={t('household.roleOf', { name: m.name })}
                    value={m.role}
                    options={(['caretaker', 'viewer'] as const).map((r) => ({
                      value: r,
                      label: t(`household.role.${r}` as MessageKey),
                    }))}
                    disabled={busy}
                    onChange={(e) =>
                      void run(async () => {
                        await households.changeRole(
                          householdId,
                          m.userId,
                          e.target.value === 'viewer' ? 'viewer' : 'caretaker',
                        );
                        await reload();
                      })
                    }
                  />
                  <Button
                    variant="secondary"
                    disabled={busy}
                    onClick={() => setTransferTo(m.userId)}
                  >
                    {t('household.makeOwner', { name: m.name })}
                  </Button>
                  <Button
                    variant="danger"
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        await households.removeMember(householdId, m.userId);
                        await reload();
                      })
                    }
                  >
                    {t('household.remove', { name: m.name })}
                  </Button>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
      <Dialog
        open={target !== undefined}
        title={t('household.transferTitle')}
        onClose={() => setTransferTo(null)}
      >
        <p className="mb-3">{t('household.transferBody', { name: target?.name ?? '' })}</p>
        <div className="flex gap-2">
          <Button
            onClick={() =>
              void run(async () => {
                if (transferTo) await households.transferOwnership(householdId, transferTo);
                setTransferTo(null);
                await reload();
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
    </section>
  );
}
