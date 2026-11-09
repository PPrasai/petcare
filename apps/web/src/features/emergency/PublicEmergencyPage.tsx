import { useQuery } from '@tanstack/react-query';
import type { PublicEmergencyCard } from '../../application/ports/emergency-api';
import { t } from '../../i18n/t';
import { en } from '../../i18n/en';
import type { MessageKey } from '../../i18n/en';
import { formatDate } from '../../lib/format';
import { Avatar, Banner, Button, EmptyState, Icon, Line } from '../../ui';
import { useServices } from '../shared/services-context';

const FACTS = ['colour', 'markings', 'microchipId'] as const;
const LISTS = ['allergies', 'conditions', 'medications'] as const;

/** The species names the app knows; any other value is shown as the owner typed it. */
const species = (id: string) => {
  const key = `pets.species.${id}`;
  return key in en ? t(key as MessageKey) : id;
};

function CallButton({ phone, className }: { phone: string; className?: string }) {
  return (
    <a href={`tel:${phone.replace(/[^+\d]/g, '')}`} className={`btn primary ${className ?? ''}`}>
      <Icon name="phone" />
      {t('public.call', { phone })}
    </a>
  );
}

function CardView({ card, token }: { card: PublicEmergencyCard; token: string }) {
  const own = { dateFormat: 'iso', timeZone: 'UTC' } as const;
  const subtitle = [card.breed, card.species ? species(card.species) : null]
    .filter(Boolean)
    .join(' · ');
  const facts = FACTS.filter((key) => card[key]);
  const lists = LISTS.filter((key) => card[key]?.length);
  const hasContact = Boolean(card.ownerDisplayName || card.ownerPhone || card.notes);
  return (
    <main className="public">
      {card.isLost ? (
        <div role="alert" className="alert">
          <b>{t('public.lost')}</b>
          {card.lostSince ? (
            <span>{t('public.lostSince', { date: formatDate(card.lostSince, own) })}</span>
          ) : null}
          {card.lostMessage ? (
            <span>
              <q>{card.lostMessage}</q>
            </span>
          ) : null}
          {card.ownerPhone ? <CallButton phone={card.ownerPhone} /> : null}
        </div>
      ) : null}
      <div className="card pad hero">
        <div className="who">
          <Avatar
            petId={token}
            species={card.species ?? 'other'}
            size={96}
            photoUrl={card.hasPhoto ? `/api/public/emergency/${token}/photo` : null}
            photoAlt={t('public.photoAlt')}
          />
          <div className="meta">
            <h1>{card.name ?? t('public.title')}</h1>
            {subtitle ? <span className="muted">{subtitle}</span> : null}
          </div>
        </div>
        {facts.length > 0 ? (
          <dl className="facts">
            {facts.map((key) => (
              <div key={key}>
                <dt className="label">{t(`public.${key}` as MessageKey)}</dt>
                <dd>{String(card[key])}</dd>
              </div>
            ))}
          </dl>
        ) : null}
      </div>
      {lists.length > 0 ? (
        <div className="card pad">
          <div className="sech">
            <h2>{t('public.medical')}</h2>
          </div>
          {lists.map((key) => (
            <div key={key}>
              <h3>{t(`public.${key}` as MessageKey)}</h3>
              <div className="tags">
                {(card[key] ?? []).map((value) => (
                  <span key={value} className="tag">
                    {value}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : null}
      {hasContact ? (
        <div className="card pad">
          <div className="sech">
            <h2>{t('public.ifFound')}</h2>
          </div>
          {card.ownerDisplayName || card.ownerPhone ? (
            <Line
              as="div"
              title={card.ownerDisplayName ?? t('public.ownerDisplayName')}
              sub={card.ownerDisplayName ? t('public.ownerDisplayName') : undefined}
              aside={card.ownerPhone ? <span>{card.ownerPhone}</span> : undefined}
            />
          ) : null}
          {card.notes ? <p className="notes">{card.notes}</p> : null}
          {card.ownerPhone && !card.isLost ? (
            <CallButton phone={card.ownerPhone} className="call" />
          ) : null}
        </div>
      ) : null}
      <footer className="stack">
        <p className="muted">{t('public.footer')}</p>
      </footer>
    </main>
  );
}

/** The public page behind an emergency QR code: no account, only what the owner switched on. */
export function PublicEmergencyPage({ token }: { token: string }) {
  const { emergency } = useServices();
  const card = useQuery({
    queryKey: ['publicEmergency', token],
    queryFn: () => emergency.publicCard(token),
    retry: false,
    gcTime: 0,
  });
  if (card.isPending) {
    return (
      <main className="public">
        <EmptyState busy>{t('public.loading')}</EmptyState>
      </main>
    );
  }
  if (card.isError) {
    return (
      <main className="public">
        <Banner tone="warn">{t('ui.loadFailed')}</Banner>
        <div className="acts">
          <Button variant="secondary" onClick={() => void card.refetch()}>
            {t('ui.retry')}
          </Button>
        </div>
      </main>
    );
  }
  if (!card.data) {
    return (
      <main className="public">
        <EmptyState title={t('public.title')} headingLevel={1}>
          {t('public.gone')}
        </EmptyState>
      </main>
    );
  }
  return <CardView card={card.data} token={token} />;
}
