// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Initials } from '../Initials';

afterEach(cleanup);

describe('Initials', () => {
  it('shows the first letters of the first two words, hidden from screen readers', () => {
    const { container } = render(<Initials name="maya chen patel" seed="u1" />);
    const ini = container.querySelector('span.ini');
    expect(ini?.textContent).toBe('MC');
    expect(ini?.getAttribute('aria-hidden')).toBe('true');
  });

  it('takes the same colour for the same seed', () => {
    const colour = (seed: string) =>
      render(<Initials name="Sam" seed={seed} />).container.querySelector<HTMLElement>('.ini')
        ?.style.cssText;
    expect(colour('same')).toBe(colour('same'));
    expect(colour('same')).toContain('--c');
  });
});
