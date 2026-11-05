import { cToF, cmToIn, fToC, inToCm, kgToLb, lbToKg } from '@petcare/domain';
import type { Preferences } from '@petcare/domain';

export type MeasurementKind =
  | 'weight'
  | 'height'
  | 'length'
  | 'temperature'
  | 'heartRate'
  | 'respiratoryRate'
  | 'bodyCondition';

type UnitPrefs = Pick<Preferences, 'weightUnit' | 'lengthUnit' | 'temperatureUnit'>;

/** The unit label a measurement is shown in, per the user's preferences. */
export function unitLabel(kind: MeasurementKind, prefs: UnitPrefs): string {
  switch (kind) {
    case 'weight':
      return prefs.weightUnit;
    case 'height':
    case 'length':
      return prefs.lengthUnit;
    case 'temperature':
      return prefs.temperatureUnit === 'f' ? '°F' : '°C';
    case 'heartRate':
      return 'bpm';
    case 'respiratoryRate':
      return 'breaths/min';
    case 'bodyCondition':
      return '/9';
  }
}

/** Stored (SI) value to the number shown to the user. */
export function toDisplay(kind: MeasurementKind, stored: number, prefs: UnitPrefs): number {
  switch (kind) {
    case 'weight':
      return prefs.weightUnit === 'lb' ? kgToLb(stored) : stored;
    case 'height':
    case 'length':
      return prefs.lengthUnit === 'in' ? cmToIn(stored) : stored;
    case 'temperature':
      return prefs.temperatureUnit === 'f' ? cToF(stored) : stored;
    default:
      return stored;
  }
}

/** The number the user typed, back to the stored (SI) value. */
export function toStored(kind: MeasurementKind, shown: number, prefs: UnitPrefs): number {
  switch (kind) {
    case 'weight':
      return prefs.weightUnit === 'lb' ? lbToKg(shown) : shown;
    case 'height':
    case 'length':
      return prefs.lengthUnit === 'in' ? inToCm(shown) : shown;
    case 'temperature':
      return prefs.temperatureUnit === 'f' ? fToC(shown) : shown;
    default:
      return shown;
  }
}

/** "12.3 kg": the value rounded to at most two decimals, with its unit. */
export function formatMeasurement(kind: MeasurementKind, stored: number, prefs: UnitPrefs): string {
  const shown = Math.round(toDisplay(kind, stored, prefs) * 100) / 100;
  return `${shown} ${unitLabel(kind, prefs)}`;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** A calendar date (YYYY-MM-DD) or instant in the user's chosen date format and zone. */
export function formatDate(
  value: string,
  prefs: Pick<Preferences, 'dateFormat' | 'timeZone'>,
): string {
  const date = new Date(value);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: /^\d{4}-\d{2}-\d{2}$/.test(value) ? 'UTC' : prefs.timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  const [y, m, d] = [get('year'), get('month'), get('day')];
  if (prefs.dateFormat === 'dmy') return `${pad(Number(d))}/${pad(Number(m))}/${y}`;
  if (prefs.dateFormat === 'mdy') return `${pad(Number(m))}/${pad(Number(d))}/${y}`;
  return `${y}-${m}-${d}`;
}
