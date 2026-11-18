import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HouseholdError } from '../../application/ports/household-api';
import { createDemoHousehold } from './demo-household';
import type { DemoHouseholdDeps } from './demo-household';

// The demo's household actions are answered from this device (CAP-03): no request, no real invites.
let stored: string | undefined;
let n = 0;
let rename: DemoHouseholdDeps['rename'];
const api = () =>
  createDemoHousehold({
    read: () => Promise.resolve(stored),
    write: (value) => {
      stored = value;
      return Promise.resolve();
    },
    rename,
    now: () => new Date('2026-06-01T10:00:00Z'),
    id: () => `abcdef${String(++n).padStart(6, '0')}`,
    origin: () => 'https://app.test',
  });

beforeEach(() => {
  stored = undefined;
  n = 0;
  rename = vi.fn(() => Promise.resolve());
  vi.stubGlobal('fetch', () => Promise.reject(new Error('the demo must not make requests')));
});

describe('demo household', () => {
  it('starts with the sample people, the demo user as owner', async () => {
    const members = await api().members('h');
    expect(members.map((m) => [m.name, m.role])).toEqual([
      ['Alex (demo)', 'owner'],
      ['Sam', 'caretaker'],
      ['Riya', 'viewer'],
    ]);
    expect(members[0]?.userId).toBe('demo-user');
  });

  it('keeps a role change and a removal on the device', async () => {
    const first = api();
    const sam = (await first.members('h')).find((m) => m.name === 'Sam');
    await first.changeRole('h', sam?.userId ?? '', 'viewer');
    await first.removeMember(
      'h',
      (await first.members('h')).find((m) => m.name === 'Riya')?.userId ?? '',
    );
    const again = await api().members('h');
    expect(again.map((m) => [m.name, m.role])).toEqual([
      ['Alex (demo)', 'owner'],
      ['Sam', 'viewer'],
    ]);
  });

  it('does not change or remove the owner', async () => {
    await expect(api().removeMember('h', 'demo-user')).rejects.toMatchObject({ kind: 'lastOwner' });
    await expect(api().changeRole('h', 'demo-user', 'viewer')).rejects.toBeInstanceOf(
      HouseholdError,
    );
  });

  it('makes invites that are listed without their secrets and can be revoked', async () => {
    const created = await api().createInvite('h', 'viewer');
    expect(created.link).toMatch(/^https:\/\/app\.test\/join#demo-/);
    expect(created.code).toMatch(/^DEMO-/);
    const listed = await api().invites('h');
    expect(listed).toHaveLength(1);
    expect(listed[0]).not.toHaveProperty('link');
    expect(listed[0]).not.toHaveProperty('code');
    await api().revokeInvite('h', created.id);
    expect((await api().invites('h'))[0]?.status).toBe('revoked');
    await expect(api().revokeInvite('h', 'nope')).rejects.toMatchObject({ kind: 'notFound' });
  });

  it('renames through the device and refuses what needs an account', async () => {
    await api().rename('h', 'Home');
    expect(rename).toHaveBeenCalledWith('h', 'Home');
    for (const refused of [
      api().leave('h'),
      api().transferOwnership('h', 'u'),
      api().acceptInvite({ code: 'x' }),
      api().previewInvite({ code: 'x' }),
    ]) {
      await expect(refused).rejects.toMatchObject({ kind: 'forbidden' });
    }
  });
});
