import { test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { inDesktopScope } from './support/desktop-scope';
import { walkScreens } from './support/matrix';
import type { Cell } from './support/matrix';

// QA-42: on a converted screen the page fits the window (SPEC-petcare-004 5.1): the document, main
// and the sidebar do not scroll, only panels and the sidebar pet list do, and no panel is squashed.
// Cells are 900 x 720, 1280 x 720 and 1920 x 1080, in the demo and in an account, light theme,
// with the sidebar at its width default.
const CELLS: Cell['width'][] = [
  { w: 900, h: 720, touch: false },
  { w: 1280, h: 720, touch: false },
  { w: 1920, h: 1080, touch: false },
];

const cell = (width: Cell['width']): Cell => ({
  width,
  theme: 'light',
  label: `${width.w}x${width.h}/light`,
});

const include = (screen: { id: string; session: string; kind?: string }) =>
  screen.session !== 'none' && screen.kind !== 'overlay' && inDesktopScope(screen.id);

/** What may scroll inside the locked page (SPEC-petcare-004 5.8, QA-42 c). */
const MAY_SCROLL =
  '.two[data-layout] .card, .two[data-layout] [data-scroll], .sbpets, dialog[open] *';

async function measure(page: Page, panelRule: boolean, fallback: boolean): Promise<string[]> {
  return page.evaluate(
    ({ mayScroll, panelRule, fallback }) => {
      const problems: string[] = [];
      const fits = (el: Element, name: string, vertical = true) => {
        if (vertical && el.scrollHeight > el.clientHeight)
          problems.push(`${name} scrolls vertically (${el.scrollHeight} > ${el.clientHeight})`);
        if (el.scrollWidth > el.clientWidth)
          problems.push(`${name} scrolls horizontally (${el.scrollWidth} > ${el.clientWidth})`);
      };
      const root = document.scrollingElement ?? document.documentElement;
      fits(root, 'the document');
      const main = document.querySelector('main');
      const side = document.querySelector('.side');
      // In the page-scroll fallback the content column may scroll; nothing else may.
      if (main) fits(main, 'main', !fallback);
      if (side) fits(side, '.side');

      for (const el of document.querySelectorAll('*')) {
        if (el === root || el === main || el === document.body) continue;
        const style = getComputedStyle(el);
        const scrolls = ['auto', 'scroll'].includes(style.overflowY);
        if (scrolls && el.scrollHeight > el.clientHeight + 1 && !el.matches(mayScroll)) {
          problems.push(
            `<${el.tagName.toLowerCase()} class="${el.className}"> scrolls and is not a panel`,
          );
        }
      }

      // A panel keeps its header and at least 96 px of body, whatever the window.
      for (const card of document.querySelectorAll('.two[data-layout] > .card')) {
        const r = card.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        const sech = card.querySelector('.sech');
        const need = (sech instanceof HTMLElement ? sech.offsetHeight : 0) + 96;
        if (r.height < need - 0.5 && (panelRule || fallback)) {
          problems.push(
            `panel "${card.getAttribute('data-area')}" is ${Math.round(r.height)} px tall, needs ${need}`,
          );
        }
      }
      return problems;
    },
    { mayScroll: MAY_SCROLL, panelRule, fallback },
  );
}

for (const width of CELLS) {
  test(`fit @${width.w}x${width.h}`, async ({ browser }) => {
    test.setTimeout(600_000);
    await walkScreens(cell(width), browser, async (page) => measure(page, width.h === 720, false), {
      include,
    });
  });
}

// Short window: the content column may scroll, the document may not, and no panel is squashed.
test('fit @1280x600 (the page-scroll fallback)', async ({ browser }) => {
  test.setTimeout(600_000);
  await walkScreens(
    cell({ w: 1280, h: 600, touch: false }),
    browser,
    async (page) => measure(page, false, true),
    { include },
  );
});
