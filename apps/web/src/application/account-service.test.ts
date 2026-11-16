import { DEFAULT_PREFERENCES } from '@petcare/domain';
import type { Preferences } from '@petcare/domain';
import { describe, expect, it, vi } from 'vitest';
import { AccountService } from './account-service';
import { AccountError } from './ports/account-api';
import type { AccountApi } from './ports/account-api';
import type { PreferenceDevice } from './ports/preference-device';

/** An in-memory device: what was written, and what still waits for the server. */
function fakeDevice(localOnly = false) {
  let current: Preferences | null = null;
  let waiting: Preferences | null = null;
  const device: PreferenceDevice = {
    localOnly: () => localOnly,
    write: async (p, pending) => {
      current = p;
      waiting = pending ? p : waiting;
    },
    pending: async () => waiting,
    settle: async (sent) => {
      if (waiting && JSON.stringify(waiting) === JSON.stringify(sent)) waiting = null;
    },
  };
  return { device, current: () => current, waiting: () => waiting };
}

function setup(save: AccountApi['savePreferences'] = async (p) => p, localOnly = false) {
  const savePreferences = vi.fn(save);
  const applied = vi.fn();
  const fake = fakeDevice(localOnly);
  const api = { savePreferences } as unknown as AccountApi;
  const service = new AccountService(api, applied, fake.device);
  return { service, savePreferences, applied, fake };
}

const next = { ...DEFAULT_PREFERENCES, weightUnit: 'lb' as const, theme: 'dark' as const };

describe('AccountService.savePreferences', () => {
  it('writes to the device and applies first, then sends to the server', async () => {
    const { service, savePreferences, applied, fake } = setup();
    const saved = await service.savePreferences(next);
    expect(applied).toHaveBeenCalledWith(next);
    expect(fake.current()).toEqual(next);
    expect(savePreferences).toHaveBeenCalledWith(next);
    expect(saved).toEqual({ preferences: next, pending: false });
    expect(fake.waiting()).toBeNull();
  });

  it('keeps the change and reports it pending when the server cannot be reached', async () => {
    const { service, applied, fake } = setup(async () => {
      throw new AccountError('offline');
    });
    const saved = await service.savePreferences(next);
    expect(saved.pending).toBe(true);
    expect(applied).toHaveBeenCalledWith(next);
    expect(fake.waiting()).toEqual(next);
  });

  it('retries a waiting save with flush and clears it on success', async () => {
    let online = false;
    const { service, savePreferences, fake } = setup(async (p) => {
      if (!online) throw new AccountError('offline');
      return p;
    });
    await service.savePreferences(next);
    online = true;
    expect(await service.flush()).toBe(true);
    expect(savePreferences).toHaveBeenCalledTimes(2);
    expect(fake.waiting()).toBeNull();
    expect(await service.flush()).toBe(true);
    expect(savePreferences).toHaveBeenCalledTimes(2);
  });

  it('keeps retrying after server trouble but drops values the server refuses', async () => {
    const trouble = setup(async () => {
      throw new AccountError('other');
    });
    expect((await trouble.service.savePreferences(next)).pending).toBe(true);
    const refused = setup(async () => {
      throw new AccountError('invalid');
    });
    await expect(refused.service.savePreferences(next)).rejects.toThrow();
    expect(refused.fake.waiting()).toBeNull();
  });

  it('in the demo stays on the device and sends nothing', async () => {
    const { service, savePreferences, fake } = setup(undefined, true);
    const saved = await service.savePreferences(next);
    expect(saved.pending).toBe(false);
    expect(fake.current()).toEqual(next);
    expect(savePreferences).not.toHaveBeenCalled();
  });

  it('rejects invalid preferences and unknown time zones before anything is written', async () => {
    const { service, savePreferences, applied, fake } = setup();
    await expect(
      service.savePreferences({ ...DEFAULT_PREFERENCES, currency: 'usd' }),
    ).rejects.toThrow();
    await expect(
      service.savePreferences({ ...DEFAULT_PREFERENCES, timeZone: 'Mars/Olympus' }),
    ).rejects.toThrow();
    expect(savePreferences).not.toHaveBeenCalled();
    expect(applied).not.toHaveBeenCalled();
    expect(fake.current()).toBeNull();
  });
});
