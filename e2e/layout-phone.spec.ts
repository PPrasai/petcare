import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { addPet, signUp } from './support/app';

// QA-33: on a phone there is no horizontal overflow, no visible scrollbar, five bottom-bar items,
// and the profile tabs change by swiping as well as by tapping.
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

const overflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

/**
 * WebKit has no CDP and no touch input in Playwright, so there the gesture is dispatched as the
 * same touchstart and touchend events at the panel; the page's handler reads only their points.
 */
async function swipeByEvents(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
) {
  await page.evaluate(
    ({ from, to }) => {
      const panel = document.querySelector('[role="tabpanel"]');
      if (!panel) throw new Error('no tab panel');
      const fire = (type: string, point: { x: number; y: number }) => {
        const event = new Event(type, { bubbles: true, cancelable: true });
        const touch = { clientX: point.x, clientY: point.y };
        Object.defineProperty(event, 'touches', { value: type === 'touchend' ? [] : [touch] });
        Object.defineProperty(event, 'changedTouches', { value: [touch] });
        panel.dispatchEvent(event);
      };
      fire('touchstart', from);
      fire('touchend', to);
    },
    { from, to },
  );
}

async function swipe(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  if (page.context().browser()?.browserType().name() !== 'chromium') {
    await swipeByEvents(page, from, to);
    return;
  }
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: from.x, y: from.y }],
  });
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [{ x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 }],
  });
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [{ x: to.x, y: to.y }],
  });
  await cdp.detach();
}

test('the phone layout has five bottom-bar items, no overflow and no scrollbars', async ({
  page,
}) => {
  await signUp(page, 'phone');
  await addPet(page, 'Momo');

  const nav = page.getByRole('navigation', { name: 'Main' });
  await expect(nav.locator('.lnk')).toHaveCount(5);
  await expect(nav.getByRole('link', { name: 'Home' })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Expenses' })).toBeVisible();
  await expect(nav.getByTestId('log-open')).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Emergency' })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'More' })).toBeVisible();

  for (const path of ['/', '/expenses', '/emergency', '/more']) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    expect(await overflow(page), `${path} overflows horizontally`).toBeLessThanOrEqual(0);
  }

  // The tab strip scrolls sideways without showing a scrollbar.
  await page.goto('/');
  await page.getByTestId('pet-row').first().click();
  const bar = await page.getByRole('tablist').evaluate((el) => ({
    scrollbar: getComputedStyle(el).scrollbarWidth,
  }));
  expect(bar.scrollbar).toBe('none');
  expect(await overflow(page)).toBeLessThanOrEqual(0);
});

test('swiping the profile changes the tab, and the tabs work from the keyboard', async ({
  page,
}) => {
  await signUp(page, 'swipe');
  await addPet(page, 'Momo');

  const tab = (name: string) => page.getByRole('tab', { name, exact: true });
  await expect(tab('Overview')).toHaveAttribute('aria-selected', 'true');

  const box = await page.getByRole('tabpanel').boundingBox();
  if (!box) throw new Error('the tab panel has no box');
  const y = box.y + 80;
  await swipe(page, { x: 330, y }, { x: 60, y });
  await expect(tab('Health')).toHaveAttribute('aria-selected', 'true');
  await swipe(page, { x: 330, y }, { x: 60, y });
  await expect(tab('Care')).toHaveAttribute('aria-selected', 'true');
  await swipe(page, { x: 60, y }, { x: 330, y });
  await expect(tab('Health')).toHaveAttribute('aria-selected', 'true');

  // A mostly vertical drag does not change the tab.
  await swipe(page, { x: 200, y }, { x: 140, y: y + 200 });
  await expect(tab('Health')).toHaveAttribute('aria-selected', 'true');

  // Keyboard: arrows move between tabs, Home and End jump.
  await tab('Health').focus();
  await page.keyboard.press('ArrowRight');
  await expect(tab('Care')).toHaveAttribute('aria-selected', 'true');
  await expect(tab('Care')).toBeFocused();
  await page.keyboard.press('End');
  await expect(tab('Files')).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Home');
  await expect(tab('Overview')).toHaveAttribute('aria-selected', 'true');
});

// PO-002 Q-04 (P8): the phone header is 72 px, conditions stay on one line, and the header
// collapses to the name and the tabs once it has scrolled away.
test('the phone profile header is 72 px and collapses to name and tabs on scroll', async ({
  page,
}) => {
  await signUp(page, 'header');
  await addPet(page, 'Momo');
  const av = page.locator('.ph .av');
  const box = await av.boundingBox();
  expect(Math.round(box?.height ?? 0)).toBe(72);
  expect(Math.round(box?.width ?? 0)).toBe(72);

  const tabs = page.getByRole('tablist');
  const caption = () => tabs.evaluate((el) => getComputedStyle(el, '::before').content);
  expect(await caption()).toBe('none');

  // Make the page long enough to scroll, then scroll the header out of view.
  await page.evaluate(() => {
    const pane = document.querySelector('.tabpane');
    if (pane) (pane as HTMLElement).style.minHeight = '2400px';
  });
  await page.evaluate(() => window.scrollTo(0, 600));
  await expect(page.locator('.detail')).toHaveAttribute('data-collapsed', 'true');
  expect(await caption()).toContain('Momo');
  const top = await tabs.evaluate((el) => Math.round(el.getBoundingClientRect().top));
  expect(top).toBeLessThanOrEqual(1);
  await expect(page.getByRole('tab', { name: 'Health' })).toBeVisible();

  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(page.locator('.detail')).toHaveAttribute('data-collapsed', 'false');
});
