// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRouter,
} from '@tanstack/react-router';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { rankPets } from '../../../application/ranking';
import type { RankedItem } from '../../../application/ranking';
import type { Services } from '../../../application/services';
import type { TodayItem, TodayView } from '../../../application/today';
import { useSessionStore } from '../../../state/session';
import { ServicesProvider } from '../../shared/services-context';
import { Sidebar } from '../../shell/Sidebar';
import { HomeDashboard } from '../HomeDashboard';
import type { HomePet } from '../use-home-data';

const NOW = new Date('2026-06-15T12:00:00Z');
const record = (id: string, name: string) =>
  ({ id, data: { name, species: 'dog' } }) as HomePet['record'];
const pets: HomePet[] = [
  { id: 'p1', name: 'Momo', archived: false, record: record('p1', 'Momo') },
  { id: 'p2', name: 'Biralo', archived: false, record: record('p2', 'Biralo') },
];
const item = (
  key: string,
  petId: string,
  petName: string,
  title: string,
  at: string,
): TodayItem => ({
  key,
  sourceType: 'reminder',
  sourceId: key,
  petId,
  petName,
  title,
  occurrenceAt: at,
  skipped: false,
  doneBy: null,
  snoozedUntil: null,
});
const view: TodayView = {
  overdue: [item('o1', 'p1', 'Momo', 'Flea treatment', '2026-06-13T09:00:00Z')],
  today: [item('t1', 'p1', 'Momo', 'Evening walk', '2026-06-15T18:00:00Z')],
  upcoming: [item('u1', 'p2', 'Biralo', 'Thyroid tablet', '2026-06-17T09:00:00Z')],
  snoozed: [],
  done: [
    { ...item('d1', 'p2', 'Biralo', 'Brushing', '2026-06-15T08:00:00Z'), doneBy: 'me' as const },
  ],
};

const services = {
  files: { open: async () => null },
  log: { householdActivity: async () => [] },
  households: { members: async () => [] },
  pets: { list: async () => pets.map((p) => p.record) },
  today: { view: async () => view },
} as unknown as Services;

beforeEach(() => {
  useSessionStore
    .getState()
    .setSignedIn(
      { id: 'u1', name: 'Alex Rivera', email: 'a@example.test' },
      [{ id: 'h1', name: 'Rivera home', role: 'owner' }],
      useSessionStore.getState().preferences,
    );
});
afterEach(cleanup);

async function mount(ui: React.ReactNode) {
  const root = createRootRoute({ component: () => <>{ui}</> });
  const router = createRouter({
    routeTree: root,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  });
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ServicesProvider value={services}>
        <RouterProvider router={router} />
      </ServicesProvider>
    </QueryClientProvider>,
  );
}

describe('HomeDashboard', () => {
  const ranked = rankPets(pets, view, NOW);
  const props = (onCheck = vi.fn(), held: string[] = []) => ({
    ranked,
    view,
    pets,
    householdId: 'h1',
    now: NOW,
    tz: 'UTC',
    label: 'Monday, June 15',
    greeting: 'Good afternoon, Alex',
    lede: 'Momo’s flea treatment is overdue.',
    firstRun: false,
    held: new Set(held),
    onCheck,
  });

  it('has one h1, the four panels and the grouped Today rows', async () => {
    await mount(<HomeDashboard {...props()} />);
    expect(await screen.findAllByRole('heading', { level: 1 })).toHaveLength(1);
    for (const name of ['Your pets', 'Today', 'This week', 'Recent care']) {
      expect(screen.getByRole('heading', { level: 2, name })).toBeTruthy();
    }
    expect(screen.getAllByTestId('pet-row')).toHaveLength(2);
    expect(screen.getByRole('region', { name: 'Overdue' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Coming up' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Done today' })).toBeTruthy();
    expect(screen.getByText('1 of 3 done')).toBeTruthy();
    // The week panel lists only what is ahead (not today's).
    expect(within(screen.getByTestId('week-row')).getByText('Thyroid tablet')).toBeTruthy();
    // The header action and the add row in Your pets.
    expect(screen.getAllByRole('link', { name: 'Add a pet' })).toHaveLength(2);
  });

  it('ticks a Today row through the shared check, and shows a held tick as pressed', async () => {
    const onCheck = vi.fn();
    await mount(<HomeDashboard {...props(onCheck, ['t1'])} />);
    const checks = await screen.findAllByTestId('today-check');
    const walk = checks.find((c) => c.getAttribute('aria-label')?.includes('Evening walk'))!;
    expect(walk.getAttribute('aria-pressed')).toBe('true');
    const flea = checks.find((c) => c.getAttribute('aria-label')?.includes('Flea treatment'))!;
    expect(flea.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(flea);
    expect(onCheck).toHaveBeenCalledTimes(1);
    expect((onCheck.mock.calls[0]![0] as RankedItem).key).toBe('o1');
    expect(onCheck.mock.calls[0]![1]).toBe('Momo');
    expect(onCheck.mock.calls[0]![2]).toBe(false);
  });

  it('is one panel with the invitation on a first run', async () => {
    await mount(
      <HomeDashboard {...props()} firstRun ranked={[]} view={{ ...view, overdue: [] }} />,
    );
    expect(await screen.findByText('Welcome to PetCare')).toBeTruthy();
    expect(screen.queryByTestId('today-check')).toBeNull();
    expect(document.querySelector('.two')?.getAttribute('data-layout')).toBe('single');
  });
});

describe('Sidebar', () => {
  it('names its controls, lists the destinations and pets, and toggles by keyboard-reachable button', async () => {
    const onToggle = vi.fn();
    await mount(<Sidebar collapsed={false} onToggle={onToggle} />);
    const aside = await screen.findByRole('complementary', { name: 'Sidebar' });
    const nav = within(aside).getByRole('navigation', { name: 'Main' });
    expect(
      within(nav)
        .getAllByRole('link')
        .map((l) => l.textContent?.replace(/\d+$/, '')),
    ).toEqual(['Home', 'Expenses', 'Emergency', 'Household', 'Contacts', 'Settings']);
    const log = within(aside).getByTestId('log-open');
    expect(log.getAttribute('aria-label')).toBe('Log something');
    const toggle = within(aside).getByRole('button', { name: 'Collapse sidebar' });
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(toggle.getAttribute('aria-controls')).toBe('sidebar');
    fireEvent.click(toggle);
    expect(onToggle).toHaveBeenCalled();
    const side = await within(aside).findAllByTestId('side-pet');
    expect(side.map((s) => s.querySelector('b')?.textContent)).toEqual(['Momo', 'Biralo']);
    expect(within(aside).getByRole('link', { name: 'Add a pet' })).toBeTruthy();
    expect(within(aside).getByText('Alex Rivera')).toBeTruthy();
  });

  it('keeps the names as text in the rail and says Expand', async () => {
    await mount(<Sidebar collapsed onToggle={() => undefined} />);
    const aside = await screen.findByRole('complementary', { name: 'Sidebar' });
    expect(within(aside).getByRole('button', { name: 'Expand sidebar' })).toBeTruthy();
    expect(within(aside).getByRole('link', { name: 'Expenses' })).toBeTruthy();
    expect(within(aside).getByRole('button', { name: 'Log something' })).toBeTruthy();
  });
});
