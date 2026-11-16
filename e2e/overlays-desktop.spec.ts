import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { walkScreens } from './support/matrix';
import type { Cell } from './support/matrix';

// QA-44: every sheet and dialog is placed per SPEC-petcare-004 5.6 at 1280 and 900 (a right drawer,
// a centred dialog, the wide Log dialog), is labelled, traps focus, closes on Escape and gives the
// focus back to the page. At 390 it is still today's bottom sheet.
const WIDE = ['S-09'];
const DIALOGS = [
  'S-22 transfer dialog',
  'S-23 leave dialog',
  'S-23 last owner',
  'S-28 link sheet',
  'S-28 turn-off dialog',
  'S-30 delete dialog',
  'S-31',
  'S-39',
  'S-47',
];
const kindOf = (id: string): 'wide' | 'dialog' | 'drawer' =>
  WIDE.includes(id.split(' ')[0] ?? '')
    ? 'wide'
    : DIALOGS.some((d) => id === d || id.startsWith(`${d} `))
      ? 'dialog'
      : 'drawer';

const include = (screen: { id: string; kind?: string }) =>
  screen.kind === 'overlay' || screen.id.startsWith('S-16 step 3, reminder');

const cell = (w: number, h: number, touch = false): Cell => ({
  width: { w, h, touch },
  theme: 'light',
  label: `${w}x${h}/light`,
});

interface Placement {
  found: boolean;
  labelled: boolean;
  variant: string | null;
  size: string | null;
  box: { left: number; right: number; top: number; bottom: number; width: number; height: number };
  innerWidth: number;
  innerHeight: number;
  isSheet: boolean;
}

/** The open <dialog> and the box that is the visible panel (`.sheet` inside a Sheet, else itself). */
const placement = (page: Page): Promise<Placement> =>
  page.evaluate(() => {
    const dialog = document.querySelector('dialog[open]');
    const empty = { left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0 };
    if (!dialog) {
      return {
        found: false,
        labelled: false,
        variant: null,
        size: null,
        box: empty,
        innerWidth,
        innerHeight,
        isSheet: false,
      };
    }
    const isSheet = dialog.classList.contains('sheetdlg');
    const r = (
      isSheet ? (dialog.querySelector('.sheet') ?? dialog) : dialog
    ).getBoundingClientRect();
    return {
      found: true,
      labelled: Boolean(
        dialog.getAttribute('aria-label') || dialog.getAttribute('aria-labelledby'),
      ),
      variant: dialog.getAttribute('data-variant'),
      size: dialog.getAttribute('data-size'),
      box: {
        left: r.left,
        right: r.right,
        top: r.top,
        bottom: r.bottom,
        width: r.width,
        height: r.height,
      },
      innerWidth,
      innerHeight,
      isSheet,
    };
  });

const near = (a: number, b: number, tol = 1) => Math.abs(a - b) <= tol;

for (const [w, h] of [
  [1280, 720],
  [900, 720],
] as const) {
  test(`overlays are placed per 5.6, trap focus and close on Escape @${w}x${h}`, async ({
    browser,
  }) => {
    test.setTimeout(900_000);
    await walkScreens(
      cell(w, h),
      browser,
      async (page, screen) => {
        const problems: string[] = [];
        const p = await placement(page);
        if (!p.found) return ['no dialog is open'];
        if (!p.labelled) problems.push('the dialog has no accessible name');
        const kind = kindOf(screen.id);
        const b = p.box;
        if (kind === 'drawer') {
          if (p.variant !== 'drawer') problems.push(`variant is ${String(p.variant)}, want drawer`);
          if (!near(b.right, p.innerWidth)) problems.push(`drawer right ${b.right} != ${w}`);
          if (!near(b.height, p.innerHeight)) problems.push(`drawer height ${b.height} != ${h}`);
          if (!near(b.width, Math.min(460, p.innerWidth))) problems.push(`drawer width ${b.width}`);
        } else if (kind === 'dialog') {
          if (p.isSheet && p.variant !== 'dialog')
            problems.push(`variant is ${String(p.variant)}, want dialog`);
          if (!near(b.left, p.innerWidth - b.right, 2)) problems.push('dialog is not centred');
          const want = p.size === 'mid' ? 620 : 460;
          if (!near(b.width, Math.min(want, p.innerWidth - 48)))
            problems.push(`dialog width ${b.width}, want ${want}`);
          if (b.height > p.innerHeight - 48 + 1) problems.push('dialog is taller than the window');
        } else {
          if (p.variant !== 'wide') problems.push(`variant is ${String(p.variant)}, want wide`);
          if (!near(b.width, Math.min(880, p.innerWidth - 48)))
            problems.push(`wide width ${b.width}`);
          if (!near(b.left, p.innerWidth - b.right, 2)) problems.push('wide dialog is not centred');
          const kinds = await page.locator('dialog[open] nav[aria-label="Kinds"] button').count();
          if (kinds !== 9) problems.push(`the rail has ${kinds} kinds, want 9`);
        }

        // Tab stays inside, Escape closes, and the page behind gets the focus back.
        for (let i = 0; i < 10; i++) {
          await page.keyboard.press('Tab');
          const inside = await page.evaluate(
            () => document.querySelector('dialog[open]')?.contains(document.activeElement) ?? false,
          );
          if (!inside) {
            problems.push('focus left the dialog');
            break;
          }
        }
        await page.keyboard.press('Escape');
        if ((await page.locator('dialog[open]').count()) !== 0)
          problems.push('Escape did not close it');
        else if (await page.evaluate(() => document.activeElement === document.body))
          problems.push('focus was not returned to the page');
        return problems;
      },
      { include },
    );
  });
}

// At 390 a sheet is still a bottom sheet, and a confirmation is still centred.
test('overlays are unchanged on a phone @390x844', async ({ browser }) => {
  test.setTimeout(900_000);
  await walkScreens(
    cell(390, 844, true),
    browser,
    async (page) => {
      const p = await placement(page);
      if (!p.found) return ['no dialog is open'];
      if (!p.isSheet) return [];
      return near(p.box.bottom, p.innerHeight) && p.box.width >= p.innerWidth - 1
        ? []
        : [`not a bottom sheet: bottom ${p.box.bottom}, width ${p.box.width}`];
    },
    { include: (s) => include(s) && (s.widths ?? [390, 900, 1280]).includes(390) },
  );
});

// Focus goes back to the control that opened a drawer, not just to the page.
test('a drawer gives the focus back to the button that opened it @1280x720', async ({
  browser,
}) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  try {
    await page.goto('/sign-in');
    await page.getByRole('button', { name: 'Try the demo' }).click();
    await page.getByRole('link', { name: 'Emergency', exact: true }).click();
    const edit = page.getByRole('button', { name: 'Edit card' }).first();
    await edit.click();
    const drawer = page.getByRole('dialog', { name: 'What a finder sees' });
    await expect(drawer).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(drawer).toHaveCount(0);
    await expect(edit).toBeFocused();
  } finally {
    await context.close();
  }
});
