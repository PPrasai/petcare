import { DEFAULT_PREFERENCES } from '@petcare/domain';
import { describe, expect, it, vi } from 'vitest';
import { AccountService } from './account-service';
import type { AccountApi } from './ports/account-api';

function setup() {
  const savePreferences = vi.fn(async (p) => p);
  const applied = vi.fn();
  const api = { savePreferences } as unknown as AccountApi;
  return { service: new AccountService(api, applied), savePreferences, applied };
}

describe('AccountService.savePreferences', () => {
  it('saves to the server, then applies the saved copy on the device', async () => {
    const { service, savePreferences, applied } = setup();
    const next = { ...DEFAULT_PREFERENCES, weightUnit: 'lb' as const, theme: 'dark' as const };
    await service.savePreferences(next);
    expect(savePreferences).toHaveBeenCalledWith(next);
    expect(applied).toHaveBeenCalledWith(next);
  });

  it('rejects invalid preferences without calling the server', async () => {
    const { service, savePreferences, applied } = setup();
    await expect(
      service.savePreferences({ ...DEFAULT_PREFERENCES, currency: 'usd' }),
    ).rejects.toThrow();
    expect(savePreferences).not.toHaveBeenCalled();
    expect(applied).not.toHaveBeenCalled();
  });

  it('does not apply anything when the server refuses', async () => {
    const savePreferences = vi.fn().mockRejectedValue(new Error('offline'));
    const applied = vi.fn();
    const service = new AccountService({ savePreferences } as unknown as AccountApi, applied);
    await expect(service.savePreferences(DEFAULT_PREFERENCES)).rejects.toThrow('offline');
    expect(applied).not.toHaveBeenCalled();
  });
});
