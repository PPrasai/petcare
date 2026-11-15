// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import { cleanup, render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import type { HouseholdActivityEntry } from '../../../application/household-activity';
import type { Services } from '../../../application/services';
import type { TodayItem } from '../../../application/today';
import { ServicesProvider } from '../../shared/services-context';
import { RecentCareList } from '../RecentCare';
import { WeekAhead } from '../WeekAhead';
import type { HomePet } from '../use-home-data';

afterEach(cleanup);

const pet = (id: string, name: string): HomePet => ({
  id,
  name,
  archived: false,
  record: { id, data: { name, species: 'dog' } } as unknown as HomePet['record'],
});
const pets = new Map([['p1', pet('p1', 'Momo')]]);

const services = { files: { open: async () => null } } as unknown as Services;

/** Renders inside the providers the panels need, with a router for their links. */
async function mount(ui: ReactNode) {
  const root = createRootRoute({ component: () => <>{ui}</> });
  const household = createRoute({ getParentRoute: () => root, path: '/household' });
  const router = createRouter({
    routeTree: root.addChildren([household]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  });
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ServicesProvider value={services}>
        <RouterProvider router={router} />
      </ServicesProvider>
    </QueryClientProvider>,
  );
  await screen.findByRole('heading', { level: 2 });
}

const item = (n: number): TodayItem => ({
  key: `k${n}`,
  sourceType: 'reminder',
  sourceId: `s${n}`,
  petId: 'p1',
  petName: 'Momo',
  title: `Task ${n}`,
  occurrenceAt: `2026-06-1${n}T09:00:00Z`,
  skipped: false,
  doneBy: null,
  snoozedUntil: null,
});

describe('WeekAhead', () => {
  it('lists what is due with the pet and the day, and counts the rest', async () => {
    await mount(<WeekAhead week={{ items: [item(1), item(2)], more: 3 }} pets={pets} tz="UTC" />);
    expect(screen.getByRole('heading', { level: 2, name: 'This week' })).toBeTruthy();
    const rows = screen.getAllByTestId('week-row') as [HTMLElement, HTMLElement];
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByText('Task 1')).toBeTruthy();
    expect(within(rows[0]).getByText(/^Momo · /)).toBeTruthy();
    expect(screen.getByText('+3 more')).toBeTruthy();
  });

  it('says so when nothing is due', async () => {
    await mount(<WeekAhead week={{ items: [], more: 0 }} pets={pets} tz="UTC" />);
    expect(screen.getByText('Nothing due in the next 7 days.')).toBeTruthy();
    expect(screen.queryByTestId('week-row')).toBeNull();
  });
});

describe('RecentCareList', () => {
  const entry: HouseholdActivityEntry = {
    key: 'a1',
    kind: 'note',
    text: 'Skipped dinner',
    at: '2026-06-15T08:00:00Z',
    by: 'u1',
    petId: 'p1',
  } as HouseholdActivityEntry;

  it('shows each entry with the pet, who and when, and a link to Household', async () => {
    await mount(
      <RecentCareList
        entries={[entry]}
        pets={pets}
        who={() => 'You'}
        tz="UTC"
        now={new Date('2026-06-15T12:00:00Z')}
      />,
    );
    const row = screen.getByTestId('recent-row');
    expect(within(row).getByText('Skipped dinner')).toBeTruthy();
    expect(within(row).getByText(/^Momo · You · /)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'See all' }).getAttribute('href')).toBe('/household');
  });

  it('says so when nothing is logged', async () => {
    await mount(
      <RecentCareList entries={[]} pets={pets} who={() => ''} tz="UTC" now={new Date()} />,
    );
    expect(screen.getByText(/^Nothing logged yet/)).toBeTruthy();
  });
});
