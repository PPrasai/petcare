import type { ReactNode } from 'react';
import type { IconName } from '../../ui';
import { Avatar, Icon } from '../../ui';
import { t } from '../../i18n/t';
import { useWideScreen } from '../shared/use-wide-screen';

export function Brand() {
  return (
    <span className="brand">
      <span className="logo">
        <Icon name="paw" />
      </span>
      {t('app.name')}
    </span>
  );
}

const SPECIES = ['dog', 'cat', 'rabbit', 'bird'];
const BENEFITS = [
  ['check', 'b1t', 'b1'],
  ['users', 'b2t', 'b2'],
  ['shield', 'b3t', 'b3'],
] as const satisfies readonly (readonly [IconName, string, string])[];

/** The brand panel beside the sign-in, sign-up and join cards (S-01 to S-03, from 860 px). */
export function AuthSide() {
  return (
    <div className="authside">
      <Brand />
      <div>
        <h2>{t('auth.tagline')}</h2>
        <div className="pets" aria-hidden="true">
          {SPECIES.map((s) => (
            <Avatar key={s} petId={s} species={s} size={64} />
          ))}
        </div>
        <ul>
          {BENEFITS.map(([icon, title, text]) => (
            <li key={title}>
              <Icon name={icon} />
              <span>
                <b>{t(`auth.side.${title}`)}</b>
                <span className="muted">{t(`auth.side.${text}`)}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
      <p className="muted">{t('auth.side.offline')}</p>
    </div>
  );
}

/** The page body of the account pages: the brand side with the cards, or the brand above them. */
export function AuthFrame({ tagline, children }: { tagline?: boolean; children: ReactNode }) {
  return useWideScreen() ? (
    <div className="two" data-layout="auth">
      <AuthSide />
      <div className="stack">{children}</div>
    </div>
  ) : (
    <>
      <div className="greet authbrand">
        <Brand />
        {tagline ? <p className="lede">{t('auth.tagline')}</p> : null}
      </div>
      {children}
    </>
  );
}
