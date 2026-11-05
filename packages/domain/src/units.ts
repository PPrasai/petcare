/** Unit conversion. Stored values are SI (kg, cm, degrees C). SPEC section 5.3 factors. */
export type WeightUnit = 'kg' | 'lb';
export type LengthUnit = 'cm' | 'in';
export type TemperatureUnit = 'C' | 'F';

const LB_PER_KG = 2.20462262;
const CM_PER_IN = 2.54;

export const kgToLb = (kg: number): number => kg * LB_PER_KG;
export const lbToKg = (lb: number): number => lb / LB_PER_KG;
export const cmToIn = (cm: number): number => cm / CM_PER_IN;
export const inToCm = (inches: number): number => inches * CM_PER_IN;
export const cToF = (c: number): number => (c * 9) / 5 + 32;
export const fToC = (f: number): number => ((f - 32) * 5) / 9;

export function weightFromKg(kg: number, unit: WeightUnit): number {
  return unit === 'lb' ? kgToLb(kg) : kg;
}
export function weightToKg(value: number, unit: WeightUnit): number {
  return unit === 'lb' ? lbToKg(value) : value;
}
export function lengthFromCm(cm: number, unit: LengthUnit): number {
  return unit === 'in' ? cmToIn(cm) : cm;
}
export function lengthToCm(value: number, unit: LengthUnit): number {
  return unit === 'in' ? inToCm(value) : value;
}
export function temperatureFromC(c: number, unit: TemperatureUnit): number {
  return unit === 'F' ? cToF(c) : c;
}
export function temperatureToC(value: number, unit: TemperatureUnit): number {
  return unit === 'F' ? fToC(value) : value;
}
