import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { CreatedInvite, InviteRole } from '../../application/ports/household-api';
import { t } from '../../i18n/t';
import type { MessageKey } from '../../i18n/en';
import { formatDate } from '../../lib/format';
import { useSessionStore } from '../../state/session';
import { Banner, Button, SelectField } from '../../ui';
import { LinkQr } from '../shared/LinkQr';
import { useServices } from '../shared/services-context';
import { useHouseholdAction } from './useHouseholdAction';

/** Owner-only: create invites (link, code and QR shown once), list open ones, revoke. */
export function InvitesPanel({ householdId }: { householdId: string }) {
  const { households } = useServices();
  const prefs = useSessionStore((s) => s.preferences);
  const client = useQueryClient();
  const invites = useQuery({
    queryKey: ['invites', householdId],
    queryFn: () => households.invites(householdId),
    enabled: householdId !== '',
    retry: false,
  });
  const { run, error, busy } = useHouseholdAction();
  const [role, setRole] = useState<InviteRole>('caretaker');
  const [created, setCreated] = useState<CreatedInvite | null>(null);
  const reload = () => client.invalidateQueries({ queryKey: ['invites', householdId] });

  return (
    <section aria-labelledby="invites-title" className="flex flex-col gap-3">
      <h2 id="invites-title" className="text-xl font-semibold">
        {t('household.invites')}
      </h2>
      {error ? <Banner tone="warn">{error}</Banner> : null}
      <div className="flex flex-wrap items-end gap-2">
        <SelectField
          label={t('household.inviteRole')}
          value={role}
          options={(['caretaker', 'viewer'] as const).map((r) => ({
            value: r,
            label: t(`household.role.${r}` as MessageKey),
          }))}
          onChange={(e) => setRole(e.target.value === 'viewer' ? 'viewer' : 'caretaker')}
        />
        <Button
          disabled={busy}
          onClick={() =>
            void run(async () => {
              setCreated(await households.createInvite(householdId, role));
              await reload();
            })
          }
        >
          {t('household.createInvite')}
        </Button>
      </div>

      {created ? (
        <div
          role="region"
          aria-label={t('household.newInvite')}
          className="flex flex-col gap-2 rounded-lg border border-line bg-card p-3"
        >
          <p className="text-sm">{t('household.shownOnce')}</p>
          <p>
            {t('household.link')}: <code data-testid="invite-link">{created.link}</code>
          </p>
          <p>
            {t('household.code')}: <code data-testid="invite-code">{created.code}</code>
          </p>
          <LinkQr link={created.link} label={t('household.qr')} />
          <Button variant="secondary" className="self-start" onClick={() => setCreated(null)}>
            {t('household.hide')}
          </Button>
        </div>
      ) : null}

      {(invites.data ?? []).length === 0 ? <Banner>{t('household.noInvites')}</Banner> : null}
      <ul className="flex flex-col gap-2">
        {(invites.data ?? []).map((i) => (
          <li
            key={i.id}
            className="flex items-center justify-between gap-2 rounded-lg border border-line bg-card p-3"
          >
            <span>
              {t(`household.role.${i.role}` as MessageKey)} ·{' '}
              {t('household.expires', { date: formatDate(i.expiresAt, prefs) })}
            </span>
            <Button
              variant="secondary"
              disabled={busy}
              aria-label={t('household.revokeLabel', {
                role: t(`household.role.${i.role}` as MessageKey),
              })}
              onClick={() =>
                void run(async () => {
                  await households.revokeInvite(householdId, i.id);
                  await reload();
                })
              }
            >
              {t('household.revoke')}
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
