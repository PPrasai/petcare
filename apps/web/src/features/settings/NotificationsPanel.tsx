import { useEffect, useState } from 'react';
import type { PushState } from '../../application/ports/push-control';
import { t } from '../../i18n/t';
import { useSessionStore } from '../../state/session';
import { useServices } from '../shared/services-context';

/** Device notifications: enable or disable push on this device and send a test (CAP-07). */
export function NotificationsPanel() {
  const { push } = useServices();
  const key = useSessionStore((s) => s.config?.vapidPublicKey ?? null);
  const support = push.support(key);
  const [state, setState] = useState<PushState | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (support !== 'ready') return;
    void push.state().then(setState);
  }, [push, support]);

  const run = async (action: () => Promise<string | null>) => {
    setBusy(true);
    setNote(null);
    try {
      setNote(await action());
    } catch {
      setNote(t('notifications.failed'));
    } finally {
      setBusy(false);
    }
  };

  const enable = () =>
    run(async () => {
      if (!key) return null;
      const next = await push.enable(key);
      setState(next);
      return next === 'denied' ? t('notifications.denied') : t('notifications.enabled');
    });
  const disable = () =>
    run(async () => {
      await push.disable();
      setState(await push.state());
      return t('notifications.disabled');
    });
  const test = () =>
    run(async () => {
      const result = await push.sendTest();
      return t(`notifications.test.${result}`);
    });

  return (
    <section aria-labelledby="notifications-heading" className="flex flex-col gap-2">
      <h2 id="notifications-heading" className="text-lg font-semibold">
        {t('notifications.title')}
      </h2>
      {support === 'needsInstall' && <p>{t('notifications.needsInstall')}</p>}
      {support === 'unsupported' && <p>{t('notifications.unsupported')}</p>}
      {support === 'notConfigured' && <p>{t('notifications.notConfigured')}</p>}
      {support === 'ready' && (
        <>
          <p>
            {state === 'subscribed'
              ? t('notifications.on')
              : state === 'denied'
                ? t('notifications.blocked')
                : t('notifications.off')}
          </p>
          <div className="flex gap-2">
            {state === 'subscribed' ? (
              <>
                <button type="button" disabled={busy} onClick={() => void disable()}>
                  {t('notifications.disable')}
                </button>
                <button type="button" disabled={busy} onClick={() => void test()}>
                  {t('notifications.test')}
                </button>
              </>
            ) : (
              state !== 'denied' && (
                <button type="button" disabled={busy} onClick={() => void enable()}>
                  {t('notifications.enable')}
                </button>
              )
            )}
          </div>
        </>
      )}
      {note && <p role="status">{note}</p>}
    </section>
  );
}
