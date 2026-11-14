import type { QuantityUnit } from '@petcare/domain';
import { QUANTITY_UNITS } from '@petcare/domain';
import { en } from '../../i18n/en';
import type { MessageKey } from '../../i18n/en';
import { t } from '../../i18n/t';

/** "pouch" or "pouches", "g" for grams: the unit as it reads next to `quantity`. */
export function unitName(unit: string, quantity: number): string {
  const plural = `qty.unit.${unit}.${quantity === 1 ? 'one' : 'other'}`;
  const key = (plural in en ? plural : `qty.unit.${unit}`) as MessageKey;
  return t(key);
}

/** "300 g", "1 pouch". */
export const amountText = (quantity: number, unit: string): string =>
  t('qty.amount', { value: quantity, unit: unitName(unit, quantity) });

const storageKey = (userId: string) => `petcare.mealUnit.${userId}`;

/** The unit last used for a meal on this device, per user (not synced; AS-002 4.2). */
export function rememberedUnit(userId: string): QuantityUnit {
  try {
    const stored = localStorage.getItem(storageKey(userId));
    return QUANTITY_UNITS.find((u) => u === stored) ?? 'g';
  } catch {
    return 'g';
  }
}

export function rememberUnit(userId: string, unit: QuantityUnit): void {
  try {
    localStorage.setItem(storageKey(userId), unit);
  } catch {
    // Storage may be blocked; the unit just is not remembered.
  }
}
