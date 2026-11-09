// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Line } from '../Line';

afterEach(cleanup);

describe('Line', () => {
  it('is a list item with title, sub line, aside and actions in one row', () => {
    render(
      <ul>
        <Line title="Thyroid bloodwork" sub="7 Nov" aside={<span>$96</span>} testId="row" />
      </ul>,
    );
    const item = screen.getByRole('listitem');
    expect(item.className).toBe('line');
    expect(item.getAttribute('data-testid')).toBe('row');
    expect(item.textContent).toBe('Thyroid bloodwork7 Nov$96');
  });

  it('can be a div, and leaves out an empty sub line', () => {
    const { container } = render(<Line as="div" title="Owner" />);
    expect(container.querySelector('div.line')).not.toBeNull();
    expect(container.querySelector('.l span')).toBeNull();
  });
});
