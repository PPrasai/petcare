// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SegmentedControl } from '../SegmentedControl';

afterEach(cleanup);

const options = [
  { value: 'month', label: 'This month' },
  { value: 'year', label: 'This year' },
];

describe('SegmentedControl', () => {
  it('is a named group whose pressed button is announced', () => {
    render(<SegmentedControl label="Period" options={options} value="year" onChange={() => {}} />);
    const group = screen.getByRole('group', { name: 'Period' });
    expect(group.className).toBe('seg');
    expect(screen.getByRole('button', { name: 'This year' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(screen.getByRole('button', { name: 'This month' }).getAttribute('aria-pressed')).toBe(
      'false',
    );
  });

  it('reports a choice on click and moves focus with the arrow keys', () => {
    const onChange = vi.fn();
    render(<SegmentedControl label="Period" options={options} value="month" onChange={onChange} />);
    const month = screen.getByRole('button', { name: 'This month' });
    const year = screen.getByRole('button', { name: 'This year' });
    fireEvent.click(year);
    expect(onChange).toHaveBeenCalledWith('year');
    month.focus();
    fireEvent.keyDown(month, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(year);
    fireEvent.keyDown(year, { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(month);
  });
});
