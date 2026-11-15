import { DEFAULT_PREFERENCES } from '@petcare/domain';
import { describe, expect, it } from 'vitest';
import { adoptDeviceTimeZone, deviceTimeZone, isUntouchedDefault } from './time-zone';

describe('time zone adoption', () => {
  it('adopts a valid device zone while the preferences are untouched', () => {
    expect(adoptDeviceTimeZone(DEFAULT_PREFERENCES, 'Europe/Paris')).toEqual({
      ...DEFAULT_PREFERENCES,
      timeZone: 'Europe/Paris',
    });
  });

  it('leaves a changed account, an unknown zone and an unchanged zone alone', () => {
    const changed = { ...DEFAULT_PREFERENCES, theme: 'dark' as const };
    const paris = { ...DEFAULT_PREFERENCES, timeZone: 'Europe/Paris' };
    expect(adoptDeviceTimeZone(changed, 'Europe/Paris')).toBeNull();
    expect(adoptDeviceTimeZone(paris, 'Asia/Tokyo')).toBeNull();
    expect(adoptDeviceTimeZone(DEFAULT_PREFERENCES, 'Not/AZone')).toBeNull();
    expect(adoptDeviceTimeZone(DEFAULT_PREFERENCES, 'UTC')).toBeNull();
    expect(adoptDeviceTimeZone(DEFAULT_PREFERENCES, null)).toBeNull();
  });

  it('knows an untouched default and reads the runtime zone', () => {
    expect(isUntouchedDefault(DEFAULT_PREFERENCES)).toBe(true);
    expect(isUntouchedDefault({ ...DEFAULT_PREFERENCES, currency: 'EUR' })).toBe(false);
    expect(deviceTimeZone()).toEqual(expect.any(String));
  });
});
