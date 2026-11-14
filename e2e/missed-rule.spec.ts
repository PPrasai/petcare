import { expect, test } from '@playwright/test';
import { addPet, addReminder, pushRoutine, signUp } from './support/app';

// PO-002 Q-03 (CON-003 2.6, SPEC-petcare-002 P8): a missed daily occurrence drops off when the
// next one has started, so the list shows one item and not a pile. A once reminder stays overdue.
test('a daily routine missed for three days is listed once; a once reminder stays', async ({
  page,
}) => {
  await signUp(page, 'missed');
  await addPet(page, 'Momo');
  await pushRoutine(page, { title: 'Evening walk', kind: 'walk', startDaysAgo: 3 });
  await page.getByRole('tab', { name: 'Care' }).click();
  await addReminder(page, { title: 'Vet forms', repeat: 'Once', daysAgo: 3, time: '00:01' });

  const rows = page.locator('.task');
  await expect(rows.filter({ hasText: 'Vet forms' })).toHaveCount(1);
  await expect(rows.filter({ hasText: 'Evening walk' })).toHaveCount(1);
  await expect(page.locator('.task').filter({ hasText: 'Vet forms' })).toContainText('Overdue');
});
