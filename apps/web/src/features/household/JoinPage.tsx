import { Link, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import type { InvitePreview, InviteSecret } from '../../application/ports/household-api';
import { t } from '../../i18n/t';
import type { MessageKey } from '../../i18n/en';
import { clearPendingInvite, pendingInvite, savePendingInvite } from '../../lib/pending-invite';
import { useSessionStore } from '../../state/session';
import { Banner, Button, Icon, Line, TextField } from '../../ui';
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
    <main className="authwrap">
      <div className="greet authbrand">
        <span className="brand">
          <span className="logo">
            <Icon name="paw" />
          </span>
          {t('app.name')}
        </span>
      </div>
      <div className="card pad authcard">
        <h1>{t('join.title')}</h1>
        <p className="muted">{t('join.lede')}</p>
        {!signedIn ? (
          <>
            <p>{token ? t('join.signInFirst') : t('join.needAccount')}</p>
            <Link to="/sign-in" className="btn primary">
              {t('auth.signIn.title')}
            </Link>
            <Link to="/sign-up" className="btn">
              {t('auth.signUp.title')}
            </Link>
          </>
        ) : (
          <>
            {error ? <Banner tone="warn">{error}</Banner> : null}
            {preview ? (
              <Line
                as="div"
                title={t('join.offer', {
                  name: preview.info.householdName,
                  role: t(`household.role.${preview.info.role}` as MessageKey),
                })}
                actions={
                  <Button disabled={busy} onClick={() => void accept()}>
                    {t('join.accept')}
                  </Button>
                }
              />
            ) : token ? (
              <Button disabled={busy} onClick={() => void look({ token })}>
                {t('join.lookUpLink')}
              </Button>
            ) : null}
            {preview || token ? <div className="divider">{t('auth.or')}</div> : null}
            <form
              aria-label={t('join.byCode')}
              onSubmit={(e) => {
                e.preventDefault();
                if (code.trim() !== '') void look({ code: code.trim() });
              }}
            >
              <h2>{t('join.byCode')}</h2>
              <TextField
                label={t('join.code')}
                value={code}
                autoComplete="off"
                onChange={(e) => setCode(e.target.value)}
              />
              <Button type="submit" variant="secondary" disabled={busy}>
                {t('join.lookUp')}
              </Button>
            </form>
          </>
        )}
      </div>
    </main>
  );
}
