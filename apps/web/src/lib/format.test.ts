import { describe, expect, it } from 'vitest';
import { formatDate, formatMeasurement, toDisplay, toStored } from './format';

const metric = { weightUnit: 'kg', lengthUnit: 'cm', temperatureUnit: 'c' } as const;
const imperial = { weightUnit: 'lb', lengthUnit: 'in', temperatureUnit: 'f' } as const;

describe('measurement units', () => {
  it('shows stored SI values in the preferred unit', () => {
    expect(formatMeasurement('weight', 10, metric)).toBe('10 kg');
    expect(formatMeasurement('weight', 10, imperial)).toBe('22.05 lb');
    expect(formatMeasurement('height', 25.4, imperial)).toBe('10 in');
    expect(formatMeasurement('temperature', 38.5, imperial)).toBe('101.3 °F');
    expect(formatMeasurement('bodyCondition', 5, imperial)).toBe('5 /9');
  });

  it('converts typed values back to SI and round-trips', () => {
    for (const kind of ['weight', 'height', 'temperature'] as const) {
      const stored = toStored(kind, 42, imperial);
      expect(toDisplay(kind, stored, imperial)).toBeCloseTo(42, 9);
    }
    expect(toStored('weight', 24, imperial)).toBeCloseTo(10.886, 3);
    expect(toStored('weight', 24, metric)).toBe(24);
  });
});

describe('formatDate', () => {
  const base = { timeZone: 'UTC' } as const;
  it('uses the chosen format', () => {
    expect(formatDate('2026-02-10', { ...base, dateFormat: 'iso' })).toBe('2026-02-10');
    expect(formatDate('2026-02-10', { ...base, dateFormat: 'dmy' })).toBe('10/02/2026');
    expect(formatDate('2026-02-10', { ...base, dateFormat: 'mdy' })).toBe('02/10/2026');
  });

  it('puts an instant on the calendar day of the user zone', () => {
    const instant = '2026-02-10T23:30:00Z';
    expect(formatDate(instant, { timeZone: 'UTC', dateFormat: 'iso' })).toBe('2026-02-10');
    expect(formatDate(instant, { timeZone: 'Asia/Kathmandu', dateFormat: 'iso' })).toBe(
      '2026-02-11',
    );
  });
});
