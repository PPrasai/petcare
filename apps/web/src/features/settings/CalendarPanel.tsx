import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { CalendarLink } from '../../application/ports/account-api';
import { t } from '../../i18n/t';
import { formatDate } from '../../lib/format';
import { useSessionStore } from '../../state/session';
import { Banner, Button } from '../../ui';
import { useDemo } from '../shared/demo';
import { useServices } from '../shared/services-context';

/** The secret calendar feed address (CAP-08). Shown once; creating a new one revokes the old. */
export function CalendarPanel() {
  const { account } = useServices();
  const demo = useDemo();
  const prefs = useSessionStore((s) => s.preferences);
  const client = useQueryClient();
  const state = useQuery({
    queryKey: ['calendar-link'],
    queryFn: () => account.calendarLink(),
    enabled: !demo,
    retry: false,
  });
  const [created, setCreated] = useState<CalendarLink | null>(null);
  const [failed, setFailed] = useState(false);
  const reload = () => client.invalidateQueries({ queryKey: ['calendar-link'] });
  const run = async (action: () => Promise<void>) => {
    setFailed(false);
    try {
      await action();
      await reload();
    } catch {
      setFailed(true);
    }
  };

  return (
    <section aria-labelledby="calendar-title" className="flex flex-col gap-3">
      <h2 id="calendar-title" className="text-xl font-semibold">
        {t('settings.calendar.title')}
      </h2>
      <p>{t('settings.calendar.help')}</p>
      {demo ? <Banner tone="info">{t('settings.demo')}</Banner> : null}
      {failed ? <Banner tone="warn">{t('settings.calendar.failed')}</Banner> : null}
      {created ? (
        <div className="flex flex-col gap-1" role="status">
          <p className="font-medium">{t('settings.calendar.once')}</p>
          <input
            readOnly
            aria-label={t('settings.calendar.address')}
            value={created.url}
            className="min-h-11 rounded-lg border border-line bg-card px-3"
            onFocus={(e) => e.currentTarget.select()}
          />
        </div>
      ) : null}
      {state.data?.exists && state.data.createdAt ? (
        <p>{t('settings.calendar.since', { date: formatDate(state.data.createdAt, prefs) })}</p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={demo}
          onClick={() =>
            void run(async () => {
              setCreated(await account.createCalendarLink());
            })
          }
        >
          {t(state.data?.exists ? 'settings.calendar.replace' : 'settings.calendar.create')}
        </Button>
        {state.data?.exists ? (
          <Button
            variant="danger"
            onClick={() =>
              void run(async () => {
                setCreated(null);
                await account.revokeCalendarLink();
              })
            }
          >
            {t('settings.calendar.revoke')}
          </Button>
        ) : null}
      </div>
    </section>
  );
}
