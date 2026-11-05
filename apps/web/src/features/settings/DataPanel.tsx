import { useState } from 'react';
import { AccountError } from '../../application/ports/account-api';
import { t } from '../../i18n/t';
import { Banner, Button, TextField } from '../../ui';
import { useDemo } from '../shared/demo';
import { useServices } from '../shared/services-context';

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

/** Export everything as a ZIP, or delete the account (CAP-20). */
export function DataPanel() {
  const { account, session } = useServices();
  const demo = useDemo();
  const [note, setNote] = useState<{ tone: 'info' | 'warn'; text: string } | null>(null);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);

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
      failure(error, 'settings.data.deleteFailed');
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby="data-title" className="flex flex-col gap-3">
      <h2 id="data-title" className="text-xl font-semibold">
        {t('settings.data.title')}
      </h2>
      {demo ? <Banner tone="info">{t('settings.demo')}</Banner> : null}
      {note ? <Banner tone={note.tone}>{note.text}</Banner> : null}
      <p>{t('settings.data.exportHelp')}</p>
      <div>
        <Button variant="secondary" disabled={busy || demo} onClick={() => void exportAll()}>
          {t('settings.data.export')}
        </Button>
      </div>
      <h3 className="font-semibold">{t('settings.data.deleteTitle')}</h3>
      <p>{t('settings.data.deleteHelp')}</p>
      <TextField
        label={t('settings.data.deleteConfirm', { phrase: DELETE_PHRASE })}
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
        autoComplete="off"
      />
      <div>
        <Button
          variant="danger"
          disabled={busy || demo || typed !== DELETE_PHRASE}
          onClick={() => void remove()}
        >
          {t('settings.data.delete')}
        </Button>
      </div>
    </section>
  );
}
