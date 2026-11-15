import type { Page } from '@playwright/test';

/**
 * The structural fingerprint of QA-45: a depth-first list of `tag.class1.class2` (classes sorted)
 * for each visible element under `main`, the phone chrome (`.chrome`, with the bottom bar) and
 * `dialog[open]`. Text, `data-*`, `style`, `id` and `aria-*` are ignored. A run of identical
 * sibling signatures is collapsed to its first entry followed by `+`, so a list that has one pet
 * more or fewer fingerprints the same.
 */
export async function fingerprint(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    const visible = (el: Element) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
    };
    const sig = (el: Element) => [el.tagName.toLowerCase(), ...[...el.classList].sort()].join('.');
    // Elements without a box of their own (`display: contents`) are walked through, not listed.
    const walk = (el: Element, depth: number) => {
      const shown = visible(el);
      if (shown) out.push(`${'  '.repeat(depth)}${sig(el)}`);
      const next = shown ? depth + 1 : depth;
      const kids = [...el.children];
      for (let i = 0; i < kids.length; i++) {
        const child = kids[i] as Element;
        const own = visible(child) ? sig(child) : '';
        const before = out.length;
        walk(child, next);
        if (own === '') continue;
        let last = i;
        while (
          last + 1 < kids.length &&
          visible(kids[last + 1] as Element) &&
          sig(kids[last + 1] as Element) === own
        ) {
          last++;
        }
        if (last > i && out.length > before) out[before] = `${out[before]} +`;
        i = last;
      }
    };
    for (const root of document.querySelectorAll('main, .chrome, dialog[open]')) walk(root, 0);
    return out;
  });
}
