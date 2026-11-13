import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { AccountError } from '../../application/ports/account-api';
import { t } from '../../i18n/t';
import { useSessionStore } from '../../state/session';
import {
  Banner,
  Button,
  Card,
  Line,
  Pill,
  SectionHeader,
  Sheet,
  SheetHead,
  TextField,
} from '../../ui';
import { useDemo } from '../shared/demo';
import { useServices } from '../shared/services-context';
import { useToastStore } from '../shared/toast';

const MIN_PASSWORD = 8;
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Sign-in methods: the password (set / change in a sheet) and linked providers (CAP-02). */
export function SignInCard({ demoNoteId }: { demoNoteId: string }) {
  const { account } = useServices();
  const demo = useDemo();
  const available = useSessionStore((s) => s.config?.providers ?? []);
  const client = useQueryClient();
  const showToast = useToastStore((s) => s.show);
  const accounts = useQuery({
    queryKey: ['linked-accounts'],
    queryFn: () => account.linkedAccounts(),
    enabled: !demo,
    retry: false,
  });
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [note, setNote] = useState('');
  const [sheetNote, setSheetNote] = useState('');
  const hasPassword = accounts.data?.hasPassword ?? false;
  const linked = accounts.data?.providers ?? [];
  const describedBy = demo ? demoNoteId : undefined;

  const failure = (error: unknown) => {
    const kind = error instanceof AccountError ? error.kind : 'other';
    return t(
      kind === 'offline'
        ? 'settings.offline'
        : kind === 'rateLimited'
          ? 'settings.accounts.rateLimited'
          : 'settings.accounts.failed',
    );
  };

  const run = async (action: () => Promise<void>) => {
    setNote('');
    try {
      await action();
      await client.invalidateQueries({ queryKey: ['linked-accounts'] });
    } catch (error) {
      setNote(failure(error));
    }
  };

  const openSheet = () => {
    setCurrent('');
    setNext('');
    setSheetNote('');
    setOpen(true);
  };

  const submitPassword = async (event: FormEvent) => {
    event.preventDefault();
    setSheetNote('');
    if (next.length < MIN_PASSWORD) {
      setSheetNote(t('settings.accounts.short', { min: MIN_PASSWORD }));
      return;
    }
    try {
      if (hasPassword) await account.changePassword(current, next);
      else await account.setPassword(next);
      await client.invalidateQueries({ queryKey: ['linked-accounts'] });
      setOpen(false);
      showToast(t('settings.accounts.passwordSaved'));
    } catch (error) {
      setSheetNote(failure(error));
    }
  };

  const passwordLabel = t(
    hasPassword ? 'settings.accounts.changePassword' : 'settings.accounts.setPassword',
  );

  return (
    <Card>
      <SectionHeader title={t('settings.signIn.title')} />
      {note ? <Banner tone="warn">{note}</Banner> : null}
      <ul>
        <Line
          title={t('settings.signIn.password')}
          {...(hasPassword ? { aside: <Pill tone="ok">{t('settings.signIn.on')}</Pill> } : {})}
          actions={
            <button
              type="button"
              className="linkbtn"
              disabled={demo}
              aria-describedby={describedBy}
              onClick={openSheet}
            >
              {passwordLabel}
            </button>
          }
        />
        {available.map((provider) => {
          const isLinked = linked.includes(provider);
          const name = capitalize(provider);
          // A sign-in method must remain: do not offer to unlink the last one.
          const canUnlink = hasPassword || linked.length > 1;
          return (
            <Line
              key={provider}
              title={name}
              {...(isLinked
                ? { aside: <Pill tone="ok">{t('settings.signIn.connected')}</Pill> }
                : {})}
              actions={
                isLinked ? (
                  <button
                    type="button"
                    className="linkbtn"
                    disabled={demo || !canUnlink}
                    aria-describedby={describedBy}
                    aria-label={t('settings.signIn.unlinkLabel', { provider: name })}
                    onClick={() => void run(() => account.unlinkProvider(provider))}
                  >
                    {t('settings.accounts.unlink')}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="linkbtn"
                    disabled={demo}
                    aria-describedby={describedBy}
                    aria-label={t('settings.signIn.connectLabel', { provider: name })}
                    onClick={() =>
                      void run(async () => {
                        window.location.assign(await account.linkProvider(provider));
                      })
                    }
                  >
                    {t('settings.signIn.connect')}
                  </button>
                )
              }
            />
          );
        })}
      </ul>
      <Sheet open={open} label={passwordLabel} onClose={() => setOpen(false)}>
        <SheetHead title={passwordLabel} onClose={() => setOpen(false)} />
        <form aria-label={passwordLabel} onSubmit={(e) => void submitPassword(e)}>
          {sheetNote ? <Banner tone="warn">{sheetNote}</Banner> : null}
          {hasPassword ? (
            <TextField
              type="password"
              autoComplete="current-password"
              label={t('settings.accounts.current')}
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
            />
          ) : null}
          <TextField
            type="password"
            autoComplete="new-password"
            label={t('settings.accounts.new')}
            value={next}
            onChange={(e) => setNext(e.target.value)}
          />
          <Button type="submit">{t('settings.accounts.savePassword')}</Button>
        </form>
      </Sheet>
    </Card>
  );
}
