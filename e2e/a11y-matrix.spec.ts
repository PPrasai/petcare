import AxeBuilder from '@axe-core/playwright';
import { forEachCell, walkScreens } from './support/matrix';

// QA-39 (and the per-screen part of QA-09): axe on every screen state in support/screens.ts, at
// 390 and 1280 px, in light and dark. A failure names its cell, for example `S-18@390/dark`.
// The routed page, open sheets and dialogs, the account pages and the app chrome.
const SCOPE = [
  'main',
  'dialog[open]',
  '.authwrap',
  '.public',
  '.demo',
  '.nav',
  '.topbar',
  '.toast',
];

forEachCell('axe', (cell, browser) =>
  walkScreens(cell, browser, async (page) => {
    const results = await new AxeBuilder({ page })
      .include(SCOPE)
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    return results.violations
      .filter((v) => v.impact === 'serious' || v.impact === 'critical')
      .map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`);
  }),
);
