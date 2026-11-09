import { t } from '../../i18n/t';

/** "4 yrs", "7 mo" or "New" from a birth date (YYYY-MM-DD). */
export function ageText(birthDate: string, now: Date): string {
  const born = new Date(`${birthDate}T00:00:00`);
  if (Number.isNaN(born.getTime())) return '';
  let months = (now.getFullYear() - born.getFullYear()) * 12 + now.getMonth() - born.getMonth();
  if (now.getDate() < born.getDate()) months -= 1;
  if (months < 0) return '';
  return months >= 12
    ? t('pet.age.years', { count: Math.floor(months / 12) })
    : t('pet.age.months', { count: months });
}
