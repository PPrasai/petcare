import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { t } from '../../i18n/t';
import { Banner, Button, Dialog } from '../../ui';
import { useServices } from '../shared/services-context';

/**
 * Signs out. With unsynced changes it first offers to sync or to discard them (QA-16);
 * signing out always wipes this device's copy of the data (QA-22).
 */
export function SignOutButton() {
  const { session, sync } = useServices();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(0);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);

  const finish = async () => {
    await session.signOut();
    setOpen(false);
    await navigate({ to: '/sign-in' });
  };

  const start = async () => {
    const count = await sync.pendingCount();
    if (count === 0) return finish();
    setPending(count);
    setFailed(false);
    setOpen(true);
  };

  const syncThenSignOut = async () => {
    setBusy(true);
    const error = await sync.syncNow();
    const left = await sync.pendingCount();
    setBusy(false);
    if (error === null && left === 0) return finish();
    setPending(left);
    setFailed(true);
  };

  return (
    <>
      <Button variant="secondary" className="wide" onClick={() => void start()}>
        {t('auth.signOut')}
      </Button>
      <Dialog open={open} title={t('signOut.title')} onClose={() => setOpen(false)}>
        <p>{t('signOut.body', { count: pending })}</p>
        {failed ? <Banner tone="warn">{t('signOut.syncFailed')}</Banner> : null}
        <div className="stackbtns">
          <Button disabled={busy} onClick={() => void syncThenSignOut()}>
            {t('signOut.sync')}
          </Button>
          <Button variant="danger" disabled={busy} onClick={() => void finish()}>
            {t('signOut.discard')}
          </Button>
          <Button variant="secondary" onClick={() => setOpen(false)}>
            {t('signOut.cancel')}
          </Button>
        </div>
      </Dialog>
    </>
  );
}
