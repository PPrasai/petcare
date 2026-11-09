// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SectionHeader } from '../SectionHeader';

afterEach(cleanup);

describe('SectionHeader', () => {
  it('renders an h2 and an action whose name starts with its visible text', () => {
    const onClick = vi.fn();
    render(
      <SectionHeader
        title="Transactions"
        action={{ label: 'Add', ariaLabel: 'Add an expense', onClick }}
      />,
    );
    expect(screen.getByRole('heading', { level: 2, name: 'Transactions' })).toBeTruthy();
    const button = screen.getByRole('button', { name: 'Add an expense' });
    expect(button.textContent).toBe('Add');
    expect('Add an expense'.startsWith(button.textContent ?? '')).toBe(true);
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('renders an h3 and no button without an action', () => {
    render(<SectionHeader title="Sub" level={3} />);
    expect(screen.getByRole('heading', { level: 3, name: 'Sub' })).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });
});
