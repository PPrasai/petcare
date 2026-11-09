import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { useCallback, useMemo, useState } from 'react';
import { VACCINE_SOON_DAYS, rankPets, summarize } from '../../application/ranking';
import type { HomeSummary, RankedItem } from '../../application/ranking';
import type { StoredRecord } from '../../application/ports/record-store';
import type { TodayView } from '../../application/today';
import { t } from '../../i18n/t';
import { useSessionStore } from '../../state/session';
import { Disclosure, Icon } from '../../ui';
import { PetProfile } from '../pets/PetProfile';
import type { StripPet } from '../pets/PetProfile';
import type { ProfileTab } from '../pets/profile-tabs';
import { useCan, useHouseholdId } from '../shared/permissions';
import { useServices } from '../shared/services-context';
import { useToastStore } from '../shared/toast';
import { useNow } from '../shared/use-now';
import { useWideScreen } from '../shared/use-wide-screen';
import { PetRow } from './PetRow';

export interface HomePet {
  id: string;
  name: string;
  archived: boolean;
  record: StoredRecord;
}

const NOTHING: TodayView = { overdue: [], today: [], upcoming: [], snoozed: [], done: [] };

const hourIn = (now: Date, tz: string) =>
  Number(now.toLocaleString('en-GB', { timeZone: tz, hour: 'numeric', hour12: false })) % 24;

function Lede({ summary }: { summary: HomeSummary }) {
  if (summary.kind === 'overdue') {
    const { item, more } = summary;
    const rest =
      more > 0
        ? ` ${t(more === 1 ? 'home.ledeMoreOne' : 'home.ledeMoreMany', { count: more })}`
        : '';
    return (
      <>
        <b>{t('home.ledeSubject', { pet: item.petName ?? '', task: item.title.toLowerCase() })}</b>{' '}
        {t('home.ledeOverdue')}
        {rest}
      </>
    );
  }
  if (summary.kind === 'today') {
    const { item, count } = summary;
    return (
      <>
        {t(count === 1 ? 'home.ledeLeftOne' : 'home.ledeLeftMany', { count })}
        <b>{item.title.toLowerCase()}</b>
        {t('home.ledeFor', { pet: item.petName ?? '' })}
      </>
    );
  }
  return <>{t('home.ledeClear')}</>;
}

/** What the order is held on while the Undo toast is open (PO-petcare-002 Q-01). */
interface Hold {
  /** The tasks as they were before the first tick, so rows do not jump under the finger. */
  view: TodayView;
  /** Ticked task keys and the completion each one wrote, for Undo. */
  done: Map<string, StoredRecord>;
  /** The toast that holds the order; the hold ends when it closes or is replaced. */
  toast: number;
}

/**
 * Home: the household's pets, most urgent first. On a phone a row opens the profile; from 860 px
 * the profile sits beside the list, with the most urgent pet selected until another is chosen.
 */
export function HomePage({ petId, tab }: { petId?: string; tab?: ProfileTab }) {
  const { pets, today } = useServices();
  const householdId = useHouseholdId();
  const tz = useSessionStore((s) => s.preferences.timeZone);
  const user = useSessionStore((s) => s.user);
  const canAdd = useCan('create', 'pet');
  const now = useNow();
  const wide = useWideScreen();
  const navigate = useNavigate();
  const [localTab, setLocalTab] = useState<ProfileTab>('overview');
  const [hold, setHold] = useState<Hold | null>(null);
  const showToast = useToastStore((s) => s.show);
  const dismissToast = useToastStore((s) => s.dismiss);
  const toastOpen = useToastStore((s) => s.message !== null);
  const toastSerial = useToastStore((s) => s.serial);

  const list = useQuery({
    queryKey: ['pet', householdId],
    queryFn: () => pets.list(householdId),
    enabled: householdId !== '',
  });
  const view = useQuery({
    queryKey: ['today', householdId, { home: true }],
    queryFn: () =>
      today.view(householdId, {
        now: new Date(),
        tz,
        userId: user?.id ?? '',
        petId: null,
        horizonDays: VACCINE_SOON_DAYS,
      }),
    enabled: householdId !== '',
  });

  const homePets = useMemo<HomePet[]>(
    () =>
      (list.data ?? []).map((record) => ({
        id: record.id,
        name: String(record.data.name),
        archived: Boolean(record.data.archivedAt),
        record,
      })),
    [list.data],
  );
  // The order is held while the toast that offers Undo is the one on screen.
  const holding = hold !== null && toastOpen && toastSerial === hold.toast;
  const active = holding ? hold : null;
  const shown = active ? active.view : (view.data ?? NOTHING);
  const ranked = useMemo(() => rankPets(homePets, shown, now), [homePets, shown, now]);

  const check = useCallback(
    async (item: RankedItem, petName: string, already: boolean) => {
      const earlier = active?.done.get(item.key);
      if (already && earlier) {
        // Ticking a ticked task takes it back.
        await today.undo(earlier);
        const rest = new Map(active?.done);
        rest.delete(item.key);
        if (rest.size === 0) dismissToast();
        else if (active) setHold({ ...active, done: rest });
        return;
      }
      try {
        const completion = await today.complete(householdId, item, false, new Date());
        const done = new Map(active?.done).set(item.key, completion);
        showToast(t('home.checkDone', { task: item.title, pet: petName }), {
          undo: () => void today.undo(completion),
        });
        setHold({
          view: active?.view ?? view.data ?? NOTHING,
          done,
          toast: useToastStore.getState().serial,
        });
      } catch {
        showToast(t('home.checkFailed'));
      }
    },
    [active, today, householdId, view.data, showToast, dismissToast],
  );
  const archived = homePets.filter((p) => p.archived);
  const summary = useMemo(() => summarize(ranked), [ranked]);

  const selectedId = petId ?? (wide ? ranked[0]?.pet.id : undefined);
  const activeTab = petId ? (tab ?? 'overview') : localTab;
  const onTab = (next: ProfileTab) => {
    if (petId) {
      void navigate({
        to: '/pets/$petId',
        params: { petId },
        search: { tab: next },
        replace: true,
      });
    } else {
      setLocalTab(next);
    }
  };

  const strip: StripPet[] = ranked.map((r) => ({
    id: r.pet.id,
    name: r.pet.name,
    species: String(r.pet.record.data.species),
    data: r.pet.record.data,
    dot: r.status === 'clear' ? 'ok' : r.status,
  }));

  const hour = hourIn(now, tz);
  const greeting = t(hour < 12 ? 'home.morning' : hour < 18 ? 'home.afternoon' : 'home.evening', {
    name: (user?.name ?? '').split(' ')[0] ?? '',
  });
  const dateLabel = now.toLocaleDateString(undefined, {
    timeZone: tz,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
  const Greeting = petId ? 'h2' : 'h1';

  return (
    <div className={`split ${petId ? 'open' : ''}`}>
      <div className="listcol">
        <div className="greet">
          <span className="label">{dateLabel}</span>
          <Greeting>{greeting}</Greeting>
          <p className="lede">
            <Lede summary={summary} />
          </p>
        </div>
        <ul className="plist" aria-label={t('home.listLabel')}>
          {ranked.map((r) => (
            <PetRow
              key={r.pet.id}
              ranked={r}
              selected={r.pet.id === selectedId}
              now={now}
              tz={tz}
              checked={holding && r.top !== null && hold.done.has(r.top.key)}
              onCheck={(item, already) => void check(item, r.pet.name, already)}
            />
          ))}
          {canAdd ? (
            <li>
              <Link to="/pets/new" className="addrow">
                <Icon name="plus" /> {t('pets.add')}
              </Link>
            </li>
          ) : null}
        </ul>
        {list.data && homePets.length === 0 ? <p className="empty">{t('pets.empty')}</p> : null}
        {archived.length > 0 ? (
          <Disclosure
            title={t('home.archived')}
            hint={t('home.archivedCount', { count: archived.length })}
          >
            <ul className="plist">
              {archived.map((p) => (
                <li key={p.id} className="line">
                  <Link
                    to="/pets/$petId"
                    params={{ petId: p.id }}
                    search={{ tab: 'overview' }}
                    className="rowmain"
                  >
                    <b>{p.name}</b>
                  </Link>
                </li>
              ))}
            </ul>
          </Disclosure>
        ) : null}
      </div>
      {selectedId ? (
        <PetProfile
          petId={selectedId}
          tab={activeTab}
          onTab={onTab}
          headingLevel={petId ? 1 : 2}
          strip={strip}
        />
      ) : (
        <div className="detail" />
      )}
    </div>
  );
}
