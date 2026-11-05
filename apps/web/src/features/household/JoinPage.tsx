import { Link, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import type { InvitePreview, InviteSecret } from '../../application/ports/household-api';
import { t } from '../../i18n/t';
import type { MessageKey } from '../../i18n/en';
import { clearPendingInvite, pendingInvite, savePendingInvite } from '../../lib/pending-invite';
import { useSessionStore } from '../../state/session';
import { Banner, Button, TextField } from '../../ui';
import { useServices } from '../shared/services-context';
import { useHouseholdAction } from './useHouseholdAction';

const TOKEN = /^[A-Za-z0-9_-]{43}$/;

/** Reads the token from `/join#<token>` once and keeps it (the address bar is cleaned). */
function takeTokenFromLink(): string | null {
  const fromHash = window.location.hash.replace(/^#/, '');
  if (TOKEN.test(fromHash)) {
    savePendingInvite(fromHash);
    window.history.replaceState(null, '', window.location.pathname);
  }
  return pendingInvite();
}

/** Accepting an invite: from a link (token) or a code typed by hand (CAP-11). */
export function JoinPage() {
  const { households } = useServices();
  const signedIn = useSessionStore((s) => s.status === 'signedIn');
  const setActive = useSessionStore((s) => s.setActiveHousehold);
  const navigate = useNavigate();
  const { run, error, busy } = useHouseholdAction();
  const [token] = useState(takeTokenFromLink);
  const [code, setCode] = useState('');
  const [preview, setPreview] = useState<{ info: InvitePreview; secret: InviteSecret } | null>(
    null,
  );

  const look = (secret: InviteSecret) =>
    run(async () => setPreview({ info: await households.preview(secret), secret }));

  const accept = () =>
    run(async () => {
      if (!preview) return;
      const joined = await households.join(preview.secret);
      clearPendingInvite();
      setActive(joined.id);
      await navigate({ to: '/' });
    });

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 p-5">
      <h1 className="text-2xl font-semibold">{t('join.title')}</h1>
      {!signedIn ? (
        <>
          <p>{token ? t('join.signInFirst') : t('join.needAccount')}</p>
          <div className="flex gap-3">
            <Link to="/sign-in" className="underline">
              {t('auth.signIn.title')}
            </Link>
            <Link to="/sign-up" className="underline">
              {t('auth.signUp.title')}
            </Link>
          </div>
        </>
      ) : preview ? (
        <>
          <p>
            {t('join.offer', {
              name: preview.info.householdName,
              role: t(`household.role.${preview.info.role}` as MessageKey),
            })}
          </p>
          {error ? <Banner tone="warn">{error}</Banner> : null}
          <Button disabled={busy} onClick={() => void accept()}>
            {t('join.accept')}
          </Button>
        </>
      ) : (
        <>
          {error ? <Banner tone="warn">{error}</Banner> : null}
          {token ? (
            <Button disabled={busy} onClick={() => void look({ token })}>
              {t('join.lookUpLink')}
            </Button>
          ) : null}
          <form
            aria-label={t('join.byCode')}
            className="flex items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (code.trim() !== '') void look({ code: code.trim() });
            }}
          >
            <TextField
              label={t('join.code')}
              value={code}
              autoComplete="off"
              onChange={(e) => setCode(e.target.value)}
            />
            <Button type="submit" disabled={busy}>
              {t('join.lookUp')}
            </Button>
          </form>
        </>
      )}
    </main>
  );
}
