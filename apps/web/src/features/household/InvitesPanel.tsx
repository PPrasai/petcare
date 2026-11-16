import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import type { CreatedInvite, InviteRole } from '../../application/ports/household-api';
import { t } from '../../i18n/t';
import type { MessageKey } from '../../i18n/en';
import { formatDate } from '../../lib/format';
import { useSessionStore } from '../../state/session';
import {
  Banner,
  Button,
  Card,
  CopyButton,
  EmptyState,
  Line,
  SectionHeader,
  SegmentedControl,
  Sheet,
  SheetHead,
} from '../../ui';
import { LinkQr } from '../shared/LinkQr';
import { useServices } from '../shared/services-context';
import { useToastStore } from '../shared/toast';
import { useHouseholdAction } from './useHouseholdAction';

const roleLabel = (role: InviteRole) => t(`household.role.${role}` as MessageKey);

function InviteForm({
  householdId,
  onClose,
  onCreated,
}: {
  householdId: string;
  onClose: () => void;
  onCreated: (invite: CreatedInvite) => void;
}) {
  const { households } = useServices();
  const client = useQueryClient();
  const { run, error, busy } = useHouseholdAction();
  const [role, setRole] = useState<InviteRole>('caretaker');
  return (
    <>
      <SheetHead title={t('household.inviteTitle')} onClose={onClose} />
      <p>{t('household.inviteBody')}</p>
      {error ? <Banner tone="warn">{error}</Banner> : null}
      <SegmentedControl
        label={t('household.inviteRole')}
        value={role}
        onChange={(v) => setRole(v === 'viewer' ? 'viewer' : 'caretaker')}
        options={(['viewer', 'caretaker'] as const).map((r) => ({
          value: r,
          label: roleLabel(r),
        }))}
      />
      <Button
        disabled={busy}
        onClick={() =>
          void run(async () => {
            const invite = await households.createInvite(householdId, role);
            await client.invalidateQueries({ queryKey: ['invites', householdId] });
            onCreated(invite);
            onClose();
          })
        }
      >
        {t('household.createInvite')}
      </Button>
    </>
  );
}

/** Owner only: pick what the invitee may do, then create the invite (S-21). */
export function InviteSheet({
  householdId,
  open,
  onClose,
  onCreated,
}: {
  householdId: string;
  open: boolean;
  onClose: () => void;
  onCreated: (invite: CreatedInvite) => void;
}) {
  return (
    <Sheet open={open} label={t('household.inviteTitle')} onClose={onClose}>
      <InviteForm householdId={householdId} onClose={onClose} onCreated={onCreated} />
    </Sheet>
  );
}

/** The link, code and QR of a new invite. They are shown once, so the card takes focus. */
export function NewInviteCard({ invite, onHide }: { invite: CreatedInvite; onHide: () => void }) {
  const showToast = useToastStore((s) => s.show);
  const region = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const frame = requestAnimationFrame(() => region.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, []);
  return (
    <Card
      ref={region}
      tabIndex={-1}
      role="region"
      aria-label={t('household.newInvite')}
      className="invcard"
    >
      <LinkQr link={invite.link} label={t('household.qr')} />
      <div className="stack">
        <h2>{t('household.inviteTitle')}</h2>
        <p className="muted">{t('household.shownOnce')}</p>
        <ul>
          <Line
            title={t('household.link')}
            sub={
              <code className="lcode" data-testid="invite-link">
                {invite.link}
              </code>
            }
          />
          <Line
            title={t('household.code')}
            sub={
              <code className="lcode" data-testid="invite-code">
                {invite.code}
              </code>
            }
          />
        </ul>
        <div className="acts">
          <CopyButton
            value={invite.link}
            label={t('ui.copyLink')}
            copiedToast={t('ui.linkCopied')}
            onNotify={showToast}
          />
          <Button variant="secondary" onClick={onHide}>
            {t('household.hide')}
          </Button>
        </div>
      </div>
    </Card>
  );
}

/** Owner only: invites that can still be used, each with a way to revoke it. */
export function OpenInvitesCard({ householdId }: { householdId: string }) {
  const { households } = useServices();
  const prefs = useSessionStore((s) => s.preferences);
  const client = useQueryClient();
  const showToast = useToastStore((s) => s.show);
  const { run, error, busy } = useHouseholdAction();
  const invites = useQuery({
    queryKey: ['invites', householdId],
    queryFn: () => households.invites(householdId),
    enabled: householdId !== '',
    retry: false,
  });
  const rows = invites.data ?? [];
  return (
    <Card>
      <SectionHeader title={t('household.openInvites')} />
      {error ? <Banner tone="warn">{error}</Banner> : null}
      {invites.isSuccess && rows.length === 0 ? (
        <EmptyState>{t('household.noInvites')}</EmptyState>
      ) : null}
      {rows.length > 0 ? (
        <ul>
          {rows.map((i) => (
            <Line
              key={i.id}
              title={roleLabel(i.role)}
              sub={t('household.expires', { date: formatDate(i.expiresAt, prefs) })}
              actions={
                <button
                  type="button"
                  className="linkbtn"
                  disabled={busy}
                  aria-label={t('household.revokeLabel', { role: roleLabel(i.role) })}
                  onClick={() =>
                    void run(async () => {
                      await households.revokeInvite(householdId, i.id);
                      await client.invalidateQueries({ queryKey: ['invites', householdId] });
                      showToast(t('household.inviteRevoked'));
                    })
                  }
                >
                  {t('household.revoke')}
                </button>
              }
            />
          ))}
        </ul>
      ) : null}
    </Card>
  );
}
