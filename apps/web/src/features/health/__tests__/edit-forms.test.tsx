// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_PREFERENCES } from '@petcare/domain';
import { InvalidInput } from '../../../application/pet-service';
import type { StoredRecord } from '../../../application/ports/record-store';
import type { Services } from '../../../application/services';
import { useSessionStore } from '../../../state/session';
import { ServicesProvider } from '../../shared/services-context';
import { useToastStore } from '../../shared/toast';
import { VaccinationsPanel } from '../VaccinationsPanel';

// jsdom has no <dialog> modal API; this stands in for it.
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function close() {
    this.removeAttribute('open');
  };
});
afterEach(cleanup);

const rabies: StoredRecord = {
  id: 'v1',
  type: 'vaccination',
  householdId: 'h1',
  version: 2,
  createdBy: 'u1',
  updatedAt: '2026-05-01T00:00:00Z',
  deletedAt: null,
  pending: false,
  data: {
    petId: 'p1',
    vaccineName: 'Rabies',
    givenOn: '2026-05-01',
    batchNumber: 'B-1',
    note: 'left leg',
  },
};

const edit = vi.fn();
const services = {
  health: { list: () => Promise.resolve([rabies]), edit },
  contacts: { list: () => Promise.resolve([]) },
  removal: {},
} as unknown as Services;

function mount() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ServicesProvider value={services}>
        <VaccinationsPanel petId="p1" species="dog" />
      </ServicesProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  // A wide screen: the rows have an Edit button (a phone has none, the title is the target).
  vi.stubGlobal('matchMedia', () => ({
    matches: true,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
  edit.mockReset();
  useToastStore.getState().dismiss();
  useSessionStore
    .getState()
    .setSignedIn(
      { id: 'u1', name: 'Alex', email: 'a@example.test' },
      [{ id: 'h1', name: 'Home', role: 'owner' }],
      DEFAULT_PREFERENCES,
    );
  useSessionStore.getState().setActiveHousehold('h1');
});

const openEdit = async () => {
  fireEvent.click(await screen.findByRole('button', { name: 'Edit Rabies' }));
  return screen.getByRole('dialog', { name: 'Edit vaccination' });
};

describe('editing a vaccination', () => {
  it('opens a labelled sheet filled with the record, and saves the form values', async () => {
    edit.mockResolvedValue(rabies);
    mount();
    const dialog = await openEdit();
    expect(within(dialog).getByLabelText('Vaccine')).toHaveProperty('value', 'Rabies');
    expect(within(dialog).getByLabelText('Batch number')).toHaveProperty('value', 'B-1');

    fireEvent.change(within(dialog).getByLabelText('Vaccine'), {
      target: { value: 'Rabies booster' },
    });
    fireEvent.change(within(dialog).getByLabelText('Batch number'), { target: { value: '' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(edit).toHaveBeenCalledTimes(1));
    expect(edit).toHaveBeenCalledWith(
      'vaccination',
      'v1',
      expect.objectContaining({ vaccineName: 'Rabies booster', batchNumber: '', note: 'left leg' }),
    );
    await waitFor(() => expect(useToastStore.getState().message).toBe('Saved Rabies booster'));
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Edit vaccination' })).toBeNull(),
    );
  });

  it('says "Couldn\'t save" and stays open when saving fails for a reason the user cannot fix', async () => {
    edit.mockRejectedValue(new Error('disk full'));
    mount();
    const dialog = await openEdit();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }));
    expect(await within(dialog).findByRole('alert')).toHaveProperty(
      'textContent',
      "Couldn't save. Try again.",
    );
    expect(screen.getByRole('dialog', { name: 'Edit vaccination' })).toBeTruthy();
    expect(useToastStore.getState().message).toBeNull();
  });

  it('flags the field the check names and keeps the sheet open', async () => {
    edit.mockRejectedValue(new InvalidInput('vaccineName'));
    mount();
    const dialog = await openEdit();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }));
    expect(await within(dialog).findByText('Check this value.')).toBeTruthy();
  });

  it('offers no Edit to a viewer', async () => {
    useSessionStore
      .getState()
      .setSignedIn(
        { id: 'u2', name: 'Riya', email: 'r@example.test' },
        [{ id: 'h1', name: 'Home', role: 'viewer' }],
        DEFAULT_PREFERENCES,
      );
    useSessionStore.getState().setActiveHousehold('h1');
    mount();
    await screen.findByText('Rabies');
    expect(screen.queryByRole('button', { name: 'Edit Rabies' })).toBeNull();
  });
});
