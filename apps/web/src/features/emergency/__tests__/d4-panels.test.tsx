// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { Services } from '../../../application/services';
import type { StoredRecord } from '../../../application/ports/record-store';
import { AuthSide } from '../../auth/AuthSide';
import { WizardSteps } from '../../pets/WizardSteps';
import { ServicesProvider } from '../../shared/services-context';
import { FinderPreview } from '../FinderPreview';

afterEach(cleanup);

describe('AuthSide (S-01)', () => {
  it('names the product, lists three benefits and the offline note', () => {
    render(<AuthSide />);
    expect(screen.getByRole('heading', { level: 2 }).textContent).toMatch(/care, in one place/);
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    expect(screen.getByText(/Works offline/)).toBeTruthy();
  });
});

describe('WizardSteps (S-16)', () => {
  it('marks the current step and the done ones, and previews the pet', () => {
    render(<WizardSteps step={2} name="Momo" species="dog" meta="Dog · Beagle" photoUrl={null} />);
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(items[1]?.getAttribute('aria-current')).toBe('step');
    expect(items[0]?.className).toBe('done');
    expect(screen.getByRole('heading', { name: 'Momo' })).toBeTruthy();
    expect(screen.getByText('Dog · Beagle')).toBeTruthy();
  });
});

describe('FinderPreview (S-33)', () => {
  const pet = {
    id: 'p1',
    data: { name: 'Momo', species: 'dog', breed: 'Beagle', colour: 'Tan', microchipId: '123' },
  } as unknown as StoredRecord;
  const mount = (fields: string[], extra = {}) =>
    render(
      <QueryClientProvider client={new QueryClient()}>
        <ServicesProvider value={{ files: { open: async () => null } } as unknown as Services}>
          <FinderPreview
            pet={pet}
            card={{ visibleFields: fields, ownerPhone: '555', ...extra } as StoredRecord['data']}
          />
        </ServicesProvider>
      </QueryClientProvider>,
    );

  it('shows only the fields the card switched on', () => {
    const { container } = mount(['name', 'breed', 'colour', 'ownerPhone']);
    const view = within(container);
    expect(view.getByText('Momo')).toBeTruthy();
    expect(view.getByText('Beagle')).toBeTruthy();
    expect(view.getByText('Tan')).toBeTruthy();
    expect(view.queryByText('123')).toBeNull();
    expect(view.getByText('555')).toBeTruthy();
  });

  it('shows the lost banner in lost mode', () => {
    const { container } = mount(['name'], { isLost: true });
    expect(within(container).getByText('This pet is lost')).toBeTruthy();
  });
});
