import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { AccountError } from '../../application/ports/account-api';
import { t } from '../../i18n/t';
import { useSessionStore } from '../../state/session';
import { Banner, Button, TextField } from '../../ui';
import { useDemo } from '../shared/demo';
import { useServices } from '../shared/services-context';

const MIN_PASSWORD = 8;
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Sign-in methods: linked providers (link / unlink) and the password (set / change) (CAP-02). */
export function AccountsPanel() {
  const { account } = useServices();
  const demo = useDemo();
  const available = useSessionStore((s) => s.config?.providers ?? []);
  const client = useQueryClient();
  const accounts = useQuery({
    queryKey: ['linked-accounts'],
    queryFn: () => account.linkedAccounts(),
    enabled: !demo,
    retry: false,
  });
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [note, setNote] = useState<{ tone: 'info' | 'warn'; text: string } | null>(null);
  const hasPassword = accounts.data?.hasPassword ?? false;
  const linked = accounts.data?.providers ?? [];

  const run = async (action: () => Promise<void>, done?: string) => {
    setNote(null);
    try {
      await action();
      await client.invalidateQueries({ queryKey: ['linked-accounts'] });
      if (done) setNote({ tone: 'info', text: done });
    } catch (error) {
      const kind = error instanceof AccountError ? error.kind : 'other';
      const key =
        kind === 'offline'
          ? 'settings.offline'
          : kind === 'rateLimited'
            ? 'settings.accounts.rateLimited'
            : 'settings.accounts.failed';
      setNote({ tone: 'warn', text: t(key) });
    }
  };

  const submitPassword = (event: FormEvent) => {
    event.preventDefault();
    if (next.length < MIN_PASSWORD) {
      setNote({ tone: 'warn', text: t('settings.accounts.short', { min: MIN_PASSWORD }) });
      return;
    }
    void run(async () => {
      if (hasPassword) await account.changePassword(current, next);
      else await account.setPassword(next);
      setCurrent('');
      setNext('');
    }, t('settings.accounts.passwordSaved'));
  };

  return (
    <section aria-labelledby="accounts-title" className="flex flex-col gap-3">
      <h2 id="accounts-title" className="text-xl font-semibold">
        {t('settings.accounts.title')}
      </h2>
      {demo ? <Banner tone="info">{t('settings.demo')}</Banner> : null}
      {note ? <Banner tone={note.tone}>{note.text}</Banner> : null}
      <ul className="flex flex-col gap-2">
        {available.map((provider) => {
          const isLinked = linked.includes(provider);
          // A sign-in method must remain: do not offer to unlink the last one.
          const canUnlink = hasPassword || linked.length > 1;
          return (
            <li key={provider} className="flex flex-wrap items-center justify-between gap-2">
              <span>
                {capitalize(provider)}
                {isLinked ? ` — ${t('settings.accounts.linked')}` : ''}
              </span>
              {isLinked ? (
                <Button
                  variant="secondary"
                  disabled={demo || !canUnlink}
                  onClick={() => void run(() => account.unlinkProvider(provider))}
                >
                  {t('settings.accounts.unlink')}
                </Button>
              ) : (
                <Button
                  variant="secondary"
                  disabled={demo}
                  onClick={() =>
                    void run(async () => {
                      window.location.assign(await account.linkProvider(provider));
                    })
                  }
                >
                  {t('settings.accounts.link')}
                </Button>
              )}
            </li>
          );
        })}
      </ul>
      <form onSubmit={submitPassword} className="flex flex-col gap-3">
        <h3 className="font-semibold">
          {t(hasPassword ? 'settings.accounts.changePassword' : 'settings.accounts.setPassword')}
        </h3>
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
        <Button type="submit" disabled={demo}>
          {t('settings.accounts.savePassword')}
        </Button>
      </form>
    </section>
  );
}
