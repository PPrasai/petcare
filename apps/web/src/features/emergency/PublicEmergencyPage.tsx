import { useQuery } from '@tanstack/react-query';
import type { PublicEmergencyCard } from '../../application/ports/emergency-api';
import { t } from '../../i18n/t';
import type { MessageKey } from '../../i18n/en';
import { formatDate } from '../../lib/format';
import { Banner } from '../../ui';
import { useServices } from '../shared/services-context';

const LINES = ['species', 'breed', 'colour', 'markings', 'microchipId'] as const;
const LISTS = ['allergies', 'conditions', 'medications'] as const;
const TEXT = ['ownerDisplayName', 'notes'] as const;

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-sm font-medium text-muted">{label}</dt>
      <dd className="text-lg">{value}</dd>
    </div>
  );
}

function CardView({ card, token }: { card: PublicEmergencyCard; token: string }) {
  const own = { dateFormat: 'iso', timeZone: 'UTC' } as const;
  return (
    <div className="mx-auto flex max-w-md flex-col gap-4 p-4">
      <h1 className="text-2xl font-semibold">{card.name ?? t('public.title')}</h1>
      {card.isLost ? (
        <div role="alert" className="rounded-lg border-2 border-bad bg-surface p-4">
          <p className="text-xl font-bold text-bad">{t('public.lost')}</p>
          {card.lostSince ? (
            <p>{t('public.lostSince', { date: formatDate(card.lostSince, own) })}</p>
          ) : null}
          {card.lostMessage ? <p className="mt-2 text-lg">{card.lostMessage}</p> : null}
        </div>
      ) : null}
      {card.hasPhoto ? (
        <img
          src={`/api/public/emergency/${token}/photo`}
          alt={t('public.photoAlt')}
          className="max-h-80 w-full rounded-lg object-cover"
        />
      ) : null}
      <dl className="flex flex-col gap-3">
        {LINES.map((key) =>
          card[key] ? (
            <Line key={key} label={t(`public.${key}` as MessageKey)} value={String(card[key])} />
          ) : null,
        )}
        {LISTS.map((key) =>
          card[key]?.length ? (
            <Line key={key} label={t(`public.${key}` as MessageKey)} value={card[key].join(', ')} />
          ) : null,
        )}
        {TEXT.map((key) =>
          card[key] ? (
            <Line key={key} label={t(`public.${key}` as MessageKey)} value={String(card[key])} />
          ) : null,
        )}
      </dl>
      {card.ownerPhone ? (
        <a
          href={`tel:${card.ownerPhone.replace(/[^+\d]/g, '')}`}
          className="inline-flex min-h-11 items-center justify-center rounded-lg bg-accent px-4 py-2 text-lg font-semibold text-white"
        >
          {t('public.call', { phone: card.ownerPhone })}
        </a>
      ) : null}
    </div>
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
  if (card.isPending) return <p className="p-4">{t('public.loading')}</p>;
  if (card.isError || !card.data) {
    return (
      <div className="mx-auto max-w-md p-4">
        <Banner>{t('public.gone')}</Banner>
      </div>
    );
  }
  return <CardView card={card.data} token={token} />;
}
