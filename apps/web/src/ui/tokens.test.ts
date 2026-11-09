import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// QA-24: every declared text/background, pill and control-border token pair, in light and dark,
// through the WCAG luminance formula.
const css = readFileSync(new URL('./tokens.css', import.meta.url), 'utf8');

type Tokens = Record<string, string>;

/** The custom properties declared in the first rule whose selector contains `selector`. */
function declared(selector: string): Tokens {
  const start = css.indexOf(selector);
  if (start < 0) throw new Error(`no ${selector} rule`);
  const open = css.indexOf('{', start);
  const close = css.indexOf('}', open);
  const out: Tokens = {};
  for (const m of css.slice(open + 1, close).matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) {
    out[m[1] ?? ''] = (m[2] ?? '').toLowerCase();
  }
  return out;
}

const light = declared(':root {');
const dark = declared(":root[data-theme='dark']");
const darkAuto = declared(":root:not([data-theme='light'])");

type Rgb = [number, number, number];
const rgb = (hex: string): Rgb => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as Rgb;
const channel = (v: number) => {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const luminance = ([r, g, b]: Rgb) =>
  0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
const ratio = (a: Rgb, b: Rgb) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05);
};
/** color-mix(in srgb, fg pct%, bg), as the pills and tags use it. */
const mix = (fg: Rgb, bg: Rgb, pct: number): Rgb =>
  fg.map((v, i) => v * pct + (bg[i] ?? 0) * (1 - pct)) as Rgb;

for (const [name, tokens] of [
  ['light', light],
  ['dark', dark],
] as const) {
  describe(`${name} theme`, () => {
    const c = (key: string): Rgb => {
      const hex = tokens[key];
      if (!hex) throw new Error(`token --${key} missing in ${name}`);
      return rgb(hex);
    };

    // [foreground, background, minimum ratio]
    const text: [string, string, number][] = [
      ['ink', 'bg', 4.5],
      ['ink', 'surface', 4.5],
      ['muted', 'bg', 4.5],
      ['muted', 'surface', 4.5],
      ['accent', 'bg', 4.5],
      ['accent', 'surface', 4.5],
      ['on-accent', 'accent', 4.5],
      ['ok', 'surface', 4.5],
      ['warn', 'surface', 4.5],
      ['bad', 'surface', 4.5],
      ['bad', 'bg', 4.5],
    ];
    for (const [fg, bg, min] of text) {
      it(`${fg} on ${bg} is at least ${min}:1`, () => {
        expect(ratio(c(fg), c(bg))).toBeGreaterThanOrEqual(min);
      });
    }

    for (const tone of ['ok', 'warn', 'bad', 'accent']) {
      it(`${tone} text on its 14% pill tint is at least 4.5:1`, () => {
        expect(ratio(c(tone), mix(c(tone), c('surface'), 0.14))).toBeGreaterThanOrEqual(4.5);
      });
    }
    it('ink on the accent tags and active nav tint is at least 4.5:1', () => {
      expect(ratio(c('ink'), mix(c('accent'), c('surface'), 0.12))).toBeGreaterThanOrEqual(4.5);
      expect(ratio(c('accent'), mix(c('accent'), c('surface'), 0.12))).toBeGreaterThanOrEqual(4.5);
    });
    it('ink on the alert tint is at least 4.5:1', () => {
      expect(ratio(c('ink'), mix(c('bad'), c('surface'), 0.12))).toBeGreaterThanOrEqual(4.5);
    });

    for (const bg of ['bg', 'surface']) {
      it(`control borders (line-strong) on ${bg} are at least 3:1`, () => {
        expect(ratio(c('line-strong'), c(bg))).toBeGreaterThanOrEqual(3);
      });
    }
    it('the switch track (line-strong) against its knob (surface) is at least 3:1', () => {
      expect(ratio(c('line-strong'), c('surface'))).toBeGreaterThanOrEqual(3);
    });
    it('the focus ring (accent) on bg is at least 3:1', () => {
      expect(ratio(c('accent'), c('bg'))).toBeGreaterThanOrEqual(3);
    });
  });
}

describe('theme blocks', () => {
  it('the prefers-color-scheme dark block matches the explicit dark theme', () => {
    expect(darkAuto).toEqual(dark);
  });
  it('declares the same tokens in both themes', () => {
    for (const key of Object.keys(dark)) expect(light).toHaveProperty(key);
  });
});
