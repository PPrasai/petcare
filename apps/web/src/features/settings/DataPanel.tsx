import { useState } from 'react';
import { AccountError } from '../../application/ports/account-api';
import { t } from '../../i18n/t';
import { Banner, Button, Card, Dialog, Line, SectionHeader, TextField } from '../../ui';
import { useDemo } from '../shared/demo';
import { useServices } from '../shared/services-context';
import { LastSyncedLine } from '../sync/LastSyncedLine';

export const DELETE_PHRASE = 'DELETE MY ACCOUNT';

function download(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Export everything as a ZIP, last sync, or delete the account (CAP-20). */
export function DataCard({ demoNoteId }: { demoNoteId: string }) {
  const { account, session } = useServices();
  const demo = useDemo();
  const [note, setNote] = useState<{ tone: 'info' | 'warn'; text: string } | null>(null);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const describedBy = demo ? demoNoteId : undefined;

  const failure = (error: unknown, fallback: Parameters<typeof t>[0]) => {
    const kind = error instanceof AccountError ? error.kind : 'other';
    const key =
      kind === 'offline'
        ? 'settings.offline'
        : kind === 'soleOwner'
          ? 'settings.data.soleOwner'
          : fallback;
    setNote({ tone: 'warn', text: t(key) });
  };

  const exportAll = async () => {
    setBusy(true);
    setNote(null);
    try {
      download(await account.exportData(), 'petcare-export.zip');
      setNote({ tone: 'info', text: t('settings.data.exported') });
    } catch (error) {
      failure(error, 'settings.data.exportFailed');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    setNote(null);
    try {
      await account.deleteAccount();
      await session.signOut();
      window.location.assign('/sign-in');
    } catch (error) {
      setConfirming(false);
      failure(error, 'settings.data.deleteFailed');
      setBusy(false);
    }
  };

  return (
    <Card>
      <SectionHeader title={t('settings.data.title')} />
      {note ? <Banner tone={note.tone}>{note.text}</Banner> : null}
      <ul>
        <Line
          title={t('settings.data.exportTitle')}
          sub={t('settings.data.exportHint')}
          actions={
            <Button
              variant="secondary"
              disabled={busy || demo}
              aria-describedby={describedBy}
              onClick={() => void exportAll()}
            >
              {t('settings.data.export')}
            </Button>
          }
        />
      </ul>
      <LastSyncedLine />
      <div className="danger-zone">
        <Line
          as="div"
          title={t('settings.data.deleteTitle')}
          sub={t('settings.data.deleteHint')}
          actions={
            <Button
              variant="danger"
              disabled={busy || demo}
              aria-describedby={describedBy}
              onClick={() => {
                setTyped('');
                setConfirming(true);
              }}
            >
              {t('settings.data.deleteTitle')}
            </Button>
          }
        />
      </div>
      <Dialog
        open={confirming}
        title={t('settings.data.deleteDialog')}
        onClose={() => setConfirming(false)}
      >
        <p>{t('settings.data.deleteHelp')}</p>
        <TextField
          label={t('settings.data.deleteConfirm', { phrase: DELETE_PHRASE })}
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          autoComplete="off"
        />
        <div className="acts">
          <Button
            variant="danger"
            disabled={busy || typed !== DELETE_PHRASE}
            onClick={() => void remove()}
          >
            {t('settings.data.delete')}
          </Button>
          <Button variant="secondary" onClick={() => setConfirming(false)}>
            {t('ui.cancel')}
          </Button>
        </div>
      </Dialog>
    </Card>
  );
}
