import { expectedTracks } from './support/desktop-layouts';
import { forEachCell, walkScreens } from './support/matrix';

// QA-40: every screen state is built from the Pebble kit and fits its width. The six rules are
// SPEC-petcare-003 §6.1. Sheets and dialogs (kind `overlay`) have no page structure, so they are
// held to the rules that are about the box, the fonts and the touch targets.
const BLOCKS = [
  '.greet',
  '.card',
  '.disc',
  '.two',
  '.stack',
  '.empty',
  '.banner',
  '.alert',
  '.seg',
  '.strip',
  '.tabs',
  '.tabpane',
  '.acts',
  'form',
  // The pet chips of the Emergency hub, built in P1 and not a card.
  '.tags',
  '.sheetdlg',
  // Home and the profile header, built in P1 from the mock. SPEC-petcare-003 §6.1 rule 3 omits them
  // (DIS-petcare-005), so they are accepted here, as the h1 holder `.ph` is below.
  '.plist',
  '.back',
  '.ph',
];

/** The expected track count by (rounded) content width, for every width the shell can give main. */
function tracksTable(layout: string | undefined): Record<number, number> {
  const table: Record<number, number> = {};
  if (!layout) return table;
  for (let w = 300; w <= 2000; w++) table[w] = expectedTracks(layout, w);
  return table;
}

forEachCell('layout', (cell, browser) =>
  walkScreens(cell, browser, async (page, screen) => {
    const overlay = screen.kind === 'overlay';
    return page.evaluate(
      ({ blocks, overlay, two, narrow, desk, fine, tracksFor }) => {
        const problems: string[] = [];
        const visible = (el: Element) => {
          const r = el.getBoundingClientRect();
          const s = getComputedStyle(el);
          return r.width > 0 && r.height > 0 && s.visibility !== 'hidden';
        };

        // 1. no horizontal overflow
        const doc = document.documentElement;
        if (doc.scrollWidth - doc.clientWidth > 0) {
          problems.push(`horizontal overflow of ${doc.scrollWidth - doc.clientWidth}px`);
        }

        if (!overlay) {
          // 2. exactly one h1, inside a Pebble title holder
          const h1s = [...document.querySelectorAll('h1')].filter(visible);
          if (h1s.length !== 1) problems.push(`${h1s.length} h1 elements, expected 1`);
          else if (!h1s[0]?.closest('.greet, .authcard, .public, .empty, .ph')) {
            problems.push('the h1 is not inside .greet, .authcard, .public, .empty or .ph');
          }

          // 3. every direct child of the content root is a Pebble block
          const roots = document.querySelector('.authwrap, .public')
            ? [document.querySelector('.authwrap, .public')]
            : document.querySelector('main .split')
              ? [...document.querySelectorAll('main .listcol, main .detail')]
              : [document.querySelector('main')];
          for (const root of roots) {
            for (const child of root?.children ?? []) {
              if (!child.matches(blocks.join(','))) {
                problems.push(
                  `<${child.tagName.toLowerCase()} class="${child.className}"> is not a Pebble block`,
                );
              }
            }
          }

          // 4. two-column screens; from 860 px a panel grid has the tracks of its tier (SPEC-petcare-004 5.5)
          if (desk && !narrow) {
            const main = document.querySelector('main');
            const grid = document.querySelector('main .two[data-layout]');
            const box = main ? getComputedStyle(main) : null;
            const content = box
              ? (main as HTMLElement).clientWidth -
                parseFloat(box.paddingLeft) -
                parseFloat(box.paddingRight)
              : 0;
            const tracks = grid
              ? getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean).length
              : 0;
            const expected = tracksFor[Math.round(content)] ?? 1;
            if (grid?.getAttribute('data-layout') !== desk)
              problems.push(
                `the panel grid is ${grid?.getAttribute('data-layout')}, expected ${desk}`,
              );
            // A flowing grid has one track per column that has a panel, so fewer when a panel is absent.
            else if (
              grid.hasAttribute('data-flow') ? tracks < 1 || tracks > expected : tracks !== expected
            )
              problems.push(
                `.two[data-layout=${desk}] has ${tracks} columns in a ${Math.round(content)} px column, expected ${expected}`,
              );
          } else if (two) {
            const grid = document.querySelector('.two');
            const tracks = grid
              ? getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean).length
              : 0;
            const expected = narrow ? 1 : 2;
            if (tracks !== expected)
              problems.push(`.two has ${tracks} columns, expected ${expected}`);
          }
        }

        // 5. hit areas in .sech, .line and .tog: 44 px, or 32 px from 860 px with a fine pointer
        const min = fine ? 31.5 : 43.5;
        const controls = 'a, button, input:not([type=hidden]), select, textarea, summary';
        for (const holder of document.querySelectorAll('.sech, .line, .tog')) {
          for (const el of holder.querySelectorAll(controls)) {
            if (!visible(el)) continue;
            const r = el.getBoundingClientRect();
            if (r.width < min || r.height < min) {
              problems.push(
                `${el.tagName.toLowerCase()} "${(el.textContent ?? '').trim().slice(0, 24)}" is ${Math.round(r.width)}x${Math.round(r.height)}`,
              );
            }
          }
        }

        // 6. the vendored faces
        const family = (value: string) => value.split(',')[0]?.trim().replace(/["']/g, '');
        const root = getComputedStyle(doc);
        const body = family(getComputedStyle(document.body).fontFamily);
        if (body !== family(root.getPropertyValue('--fb'))) problems.push(`body font is ${body}`);
        for (const h of document.querySelectorAll('h1, h2')) {
          if (!visible(h)) continue;
          const face = family(getComputedStyle(h).fontFamily);
          if (face !== family(root.getPropertyValue('--fd')))
            problems.push(`${h.tagName} font is ${face}`);
        }
        return problems;
      },
      {
        blocks: BLOCKS,
        overlay,
        two: screen.two === true,
        narrow: cell.width.w < 860,
        desk: screen.desk?.layout ?? '',
        fine: cell.width.w >= 860 && !cell.width.touch,
        // The tracks a layout has at each content width this page could have: filled below.
        tracksFor: tracksTable(screen.desk?.layout),
      },
    );
  }),
);
