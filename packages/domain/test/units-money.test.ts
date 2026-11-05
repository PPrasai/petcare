import { describe, expect, it } from 'vitest';
import {
  cToF,
  changedKeys,
  applyFields,
  fToC,
  formatMoney,
  fromMinor,
  kgToLb,
  lbToKg,
  minorDigits,
  toMinor,
  totalsByCurrency,
  vaccineSuggestions,
  weightFromKg,
  cmToIn,
  inToCm,
} from '../src';

describe('units', () => {
  it('converts weight both ways', () => {
    expect(kgToLb(10)).toBeCloseTo(22.0462262, 6);
    expect(lbToKg(kgToLb(7.3))).toBeCloseTo(7.3, 9);
    expect(weightFromKg(5, 'kg')).toBe(5);
    expect(weightFromKg(5, 'lb')).toBeCloseTo(11.0231131, 6);
  });
  it('converts length and temperature', () => {
    expect(cmToIn(2.54)).toBeCloseTo(1, 9);
    expect(inToCm(10)).toBeCloseTo(25.4, 9);
    expect(cToF(38.5)).toBeCloseTo(101.3, 9);
    expect(fToC(cToF(38.5))).toBeCloseTo(38.5, 9);
  });
});

describe('money', () => {
  it('knows minor-unit digits per currency', () => {
    expect(minorDigits('USD')).toBe(2);
    expect(minorDigits('JPY')).toBe(0);
    expect(minorDigits('KWD')).toBe(3);
  });
  it('converts to and from minor units without float drift', () => {
    expect(toMinor(19.99, 'USD')).toBe(1999);
    expect(toMinor(0.1 + 0.2, 'USD')).toBe(30);
    expect(toMinor(500, 'JPY')).toBe(500);
    expect(fromMinor(1999, 'USD')).toBe(19.99);
  });
  it('formats money', () => {
    expect(formatMoney(123456, 'USD', 'en-US')).toBe('$1,234.56');
  });
  it('never sums across currencies', () => {
    const totals = totalsByCurrency([
      { amountMinor: 1000, currency: 'USD' },
      { amountMinor: 250, currency: 'USD' },
      { amountMinor: 5000, currency: 'NPR' },
    ]);
    expect(totals.get('USD')).toBe(1250);
    expect(totals.get('NPR')).toBe(5000);
    expect(totals.size).toBe(2);
  });
});

describe('merge helpers', () => {
  it('reports only keys whose value really changes', () => {
    const current = { a: 1, b: { x: 1 }, c: null };
    expect(changedKeys(current, { a: 1, b: { x: 2 }, c: null })).toEqual(['b']);
    expect(applyFields(current, { a: 2 })).toEqual({ a: 2, b: { x: 1 }, c: null });
  });
});

describe('vaccine suggestions', () => {
  it('lists the fixture per species and nothing for others', () => {
    expect(vaccineSuggestions('dog').map((v) => v.name)).toEqual([
      'Rabies',
      'DHPP',
      'Leptospirosis',
      'Bordetella',
      'Canine influenza',
    ]);
    expect(vaccineSuggestions('cat').map((v) => v.name)).toEqual(['Rabies', 'FVRCP', 'FeLV']);
    expect(vaccineSuggestions('rabbit').map((v) => v.name)).toEqual(['RHDV2', 'Myxomatosis']);
    expect(vaccineSuggestions('hamster')).toEqual([]);
  });
});
