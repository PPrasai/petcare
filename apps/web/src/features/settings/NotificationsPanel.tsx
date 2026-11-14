import { useEffect, useState } from 'react';
import type { PushState } from '../../application/ports/push-control';
import { t } from '../../i18n/t';
import { useSessionStore } from '../../state/session';
import { Switch, ToggleRow } from '../../ui';
import { useDemo } from '../shared/demo';
import { useServices } from '../shared/services-context';

/**
 * This device's push subscription as a switch (CAP-07). The account-level push preferences are in
 * Preferences, under "Reminder timing".
 */
export function PushRow({ demoNoteId }: { demoNoteId: string }) {
  const { push } = useServices();
  const demo = useDemo();
  const key = useSessionStore((s) => s.config?.vapidPublicKey ?? null);
  const support = push.support(key);
  const [state, setState] = useState<PushState | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (support !== 'ready' || demo) return;
    void push.state().then(setState);
  }, [push, support, demo]);

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

  const toggle = (next: boolean) =>
    run(async () => {
      if (next) {
        if (!key) return null;
        const result = await push.enable(key);
        setState(result);
        return result === 'denied' ? t('notifications.denied') : null;
      }
      await push.disable();
      setState(await push.state());
      return null;
    });
  const test = () =>
    run(async () => {
      const result = await push.sendTest();
      return t(`notifications.test.${result}`);
    });

  const usable = support === 'ready' && !demo;
  const on = state === 'subscribed';
  const status = demo
    ? t('demo.pushDisabled')
    : support === 'needsInstall'
      ? t('notifications.needsInstall')
      : support === 'unsupported'
        ? t('notifications.unsupported')
        : support === 'notConfigured'
          ? t('notifications.notConfigured')
          : state === 'denied'
            ? t('notifications.blocked')
            : on
              ? t('notifications.on')
              : state === null
                ? ''
                : t('notifications.off');

  return (
    <ToggleRow
      id="push"
      title={t('settings.push.title')}
      hint={t('settings.push.hint')}
      control={
        <Switch
          checked={on}
          label={t('settings.push.title')}
          describedBy={demo ? `${demoNoteId} push-h` : 'push-h'}
          disabled={!usable || state === null || state === 'denied' || busy}
          busy={busy}
          onChange={(next) => void toggle(next)}
        />
      }
      status={
        <>
          <p role="status">{status}</p>
          {on && usable ? (
            <button type="button" className="linkbtn" disabled={busy} onClick={() => void test()}>
              {t('notifications.test')}
            </button>
          ) : null}
          {note ? <p role="status">{note}</p> : null}
        </>
      }
    />
  );
}
