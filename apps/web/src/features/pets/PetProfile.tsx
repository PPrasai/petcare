import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import type { TouchEvent } from 'react';
import { Suspense, useRef } from 'react';
import { t } from '../../i18n/t';
import type { MessageKey } from '../../i18n/en';
import { formatMeasurement } from '../../lib/format';
import { useSessionStore } from '../../state/session';
import { EmptyState, Icon, Tabs, panelId, tabId } from '../../ui';
import type { TabItem } from '../../ui';
import { useHealthList } from '../health/hooks';
import { PetAvatar } from '../shared/PetAvatar';
import { useHouseholdId } from '../shared/permissions';
import { useServices } from '../shared/services-context';
import { FilesPane, HealthPane } from './lazy-panes';
import { CarePane, OverviewPane } from './ProfilePanes';
import { PROFILE_TABS } from './profile-tabs';
import type { ProfileTab } from './profile-tabs';
import { ageText } from './age';
import { usePetPhoto } from './PetPhoto';

export interface StripPet {
  id: string;
  name: string;
  species: string;
  data: Record<string, unknown>;
  dot: 'overdue' | 'today' | 'soon' | 'ok';
}

interface PetProfileProps {
  petId: string;
  tab: ProfileTab;
  onTab: (tab: ProfileTab) => void;
  /** 1 on a pet's own page, 2 where another heading already leads the page. */
  headingLevel: 1 | 2;
  /** Pets to switch between on a phone (most urgent first). */
  strip: StripPet[];
}

const SWIPE_MIN_PX = 60;
const SWIPE_RATIO = 1.5;

/** A pet: header, four tabs that swipe on a phone, and the selected tab's panels. */
export function PetProfile({ petId, tab, onTab, headingLevel, strip }: PetProfileProps) {
  const { pets, measurements } = useServices();
  const householdId = useHouseholdId();
  const prefs = useSessionStore((s) => s.preferences);
  const pet = useQuery({
    queryKey: ['pet', householdId, { id: petId }],
    queryFn: () => pets.get(petId),
    enabled: householdId !== '',
  });
  const weights = useQuery({
    queryKey: ['measurement', householdId, { petId }],
    queryFn: () => measurements.list(householdId, petId),
    enabled: householdId !== '',
  });
  const conditions = useHealthList('condition', petId);
  const start = useRef<{ x: number; y: number } | null>(null);
  const photo = usePetPhoto(pet.data);

  const tabs: TabItem<ProfileTab>[] = PROFILE_TABS.map((id) => ({
    id,
    label: t(`profile.tab.${id}`),
  }));

  const onTouchStart = (event: TouchEvent) => {
    const touch = event.touches[0];
    start.current = touch ? { x: touch.clientX, y: touch.clientY } : null;
  };
  const onTouchEnd = (event: TouchEvent) => {
    const from = start.current;
    const touch = event.changedTouches[0];
    start.current = null;
    if (!from || !touch) return;
    const dx = touch.clientX - from.x;
    const dy = touch.clientY - from.y;
    if (Math.abs(dx) < SWIPE_MIN_PX || Math.abs(dx) < Math.abs(dy) * SWIPE_RATIO) return;
    const next = PROFILE_TABS[PROFILE_TABS.indexOf(tab) + (dx < 0 ? 1 : -1)];
    if (next) onTab(next);
  };

  if (pet.isSuccess && !pet.data) {
    return (
      <div className="detail">
        <p>{t('pets.notFound')}</p>
      </div>
    );
  }
  if (!pet.data) return <div className="detail" />;

  const record = pet.data;
  const name = String(record.data.name);
  const latestWeight = (weights.data ?? []).filter((m) => m.data.kind === 'weight').at(-1);
  const facts = [
    String(record.data.breed ?? '') ||
      t(`pets.species.${String(record.data.species)}` as MessageKey),
    typeof record.data.birthDate === 'string' ? ageText(record.data.birthDate, new Date()) : '',
    latestWeight ? formatMeasurement('weight', Number(latestWeight.data.value), prefs) : '',
  ].filter(Boolean);
  const active = (conditions.data ?? []).filter((c) => typeof c.data.resolvedOn !== 'string');
  const Heading = headingLevel === 1 ? 'h1' : 'h2';

  return (
    <div className="detail">
      <Link to="/" className="back">
        <Icon name="back" /> {t('pets.back')}
      </Link>
      {strip.length > 1 ? (
        <nav className="strip" aria-label={t('profile.switchPet')}>
          {strip.map((p) => (
            <Link
              key={p.id}
              to="/pets/$petId"
              params={{ petId: p.id }}
              search={{ tab: 'overview' }}
              aria-current={p.id === petId}
            >
              <PetAvatar pet={p} size={44} dot={p.dot} />
              {p.name}
            </Link>
          ))}
        </nav>
      ) : null}
      <div className="ph">
        <PetAvatar pet={record} size={96} badge={photo.badge} />
        <div className="meta">
          <Heading>{name}</Heading>
          <p className="muted">{facts.join(' · ')}</p>
          {active.length > 0 ? (
            <div className="tags">
              {active.map((c) => (
                <span key={c.id} className="tag">
                  {String(c.data.name)}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </div>
      <div className="acts">
        {photo.fileInput}
        {photo.addButton}
        <Link to="/emergency" search={{ pet: petId }} className="btn">
          <Icon name="shield" /> {t('profile.emergencyCard')}
        </Link>
      </div>
      <Tabs tabs={tabs} value={tab} label={t('pets.tabs')} onChange={onTab} />
      <div
        role="tabpanel"
        id={panelId(tab)}
        aria-labelledby={tabId(tab)}
        className="tabpane"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {tab === 'overview' ? <OverviewPane pet={record} /> : null}
        <Suspense fallback={<EmptyState busy>{t('ui.loading')}</EmptyState>}>
          {tab === 'health' ? <HealthPane pet={record} /> : null}
          {tab === 'files' ? <FilesPane pet={record} /> : null}
        </Suspense>
        {tab === 'care' ? <CarePane pet={record} /> : null}
      </div>
    </div>
  );
}
