import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { CalendarLink } from '../../application/ports/account-api';
import { t } from '../../i18n/t';
import { formatDate } from '../../lib/format';
import { useSessionStore } from '../../state/session';
import {
  Banner,
  Button,
  CopyButton,
  Dialog,
  Sheet,
  SheetHead,
  Switch,
  TextField,
  ToggleRow,
} from '../../ui';
import { useDemo } from '../shared/demo';
import { useServices } from '../shared/services-context';
import { useToastStore } from '../shared/toast';

/**
 * The secret calendar feed (CAP-08) as a switch. The address is shown once, in a sheet; creating
 * a new one revokes the old, and turning it off asks first.
 */
export function CalendarRow({ demoNoteId }: { demoNoteId: string }) {
  const { account } = useServices();
  const demo = useDemo();
  const prefs = useSessionStore((s) => s.preferences);
  const client = useQueryClient();
  const showToast = useToastStore((s) => s.show);
  const state = useQuery({
    queryKey: ['calendar-link'],
    queryFn: () => account.calendarLink(),
    enabled: !demo,
    retry: false,
  });
  const [created, setCreated] = useState<CalendarLink | null>(null);
  const [sheet, setSheet] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const exists = state.data?.exists === true || created !== null;

  const run = async (action: () => Promise<void>) => {
    setFailed(false);
    setBusy(true);
    try {
      await action();
      await client.invalidateQueries({ queryKey: ['calendar-link'] });
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };
  const create = () =>
    run(async () => {
      setCreated(await account.createCalendarLink());
      setSheet(true);
    });
  const revoke = async () => {
    setConfirming(false);
    await run(async () => {
      await account.revokeCalendarLink();
      setCreated(null);
    });
  };

  return (
    <>
      <ToggleRow
        id="cal"
        title={t('settings.calendar.toggle')}
        hint={t('settings.calendar.hint')}
        control={
          <Switch
            checked={exists}
            label={t('settings.calendar.toggle')}
            describedBy={demo ? `${demoNoteId} cal-h` : 'cal-h'}
            disabled={demo || busy}
            busy={busy}
            onChange={(next) => (next ? void create() : setConfirming(true))}
          />
        }
        status={
          <>
            {failed ? <Banner tone="warn">{t('settings.calendar.failed')}</Banner> : null}
            {exists && state.data?.createdAt ? (
              <p role="status">
                {t('settings.calendar.since', { date: formatDate(state.data.createdAt, prefs) })}
              </p>
            ) : null}
            {exists ? (
              <button
                type="button"
                className="linkbtn"
                disabled={busy}
                onClick={() => void create()}
              >
                {t('settings.calendar.replace')}
              </button>
            ) : null}
          </>
        }
      />
      <Sheet open={sheet} label={t('settings.calendar.title')} onClose={() => setSheet(false)}>
        <SheetHead title={t('settings.calendar.title')} onClose={() => setSheet(false)} />
        <p>{t('settings.calendar.once')}</p>
        {created ? (
          <TextField
            readOnly
            label={t('settings.calendar.address')}
            value={created.url}
            onFocus={(e) => e.currentTarget.select()}
          />
        ) : null}
        <div className="acts">
          {created ? (
            <CopyButton
              value={created.url}
              label={t('ui.copyLink')}
              copiedToast={t('ui.linkCopied')}
              onNotify={showToast}
            />
          ) : null}
          <Button onClick={() => setSheet(false)}>{t('ui.done')}</Button>
        </div>
      </Sheet>
      <Dialog
        open={confirming}
        title={t('settings.calendar.revokeTitle')}
        onClose={() => setConfirming(false)}
      >
        <p>{t('settings.calendar.revokeBody')}</p>
        <div className="acts">
          <Button variant="danger" onClick={() => void revoke()}>
            {t('settings.calendar.revoke')}
          </Button>
          <Button variant="secondary" onClick={() => setConfirming(false)}>
            {t('ui.cancel')}
          </Button>
        </div>
      </Dialog>
    </>
  );
}
