// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { EmptyState } from '../EmptyState';

afterEach(cleanup);

describe('EmptyState', () => {
  it('shows its text in a .empty element with no role', () => {
    const { container } = render(<EmptyState>No expenses yet.</EmptyState>);
    const empty = container.querySelector('.empty');
    expect(empty?.textContent).toBe('No expenses yet.');
    expect(empty?.hasAttribute('role')).toBe(false);
  });

  it('renders a heading at the requested level, a hidden icon and an action', () => {
    const { container } = render(
      <EmptyState
        icon="paw"
        title="Page not found"
        headingLevel={1}
        action={<a href="/">Go to Home</a>}
      >
        That page does not exist.
      </EmptyState>,
    );
    expect(screen.getByRole('heading', { level: 1, name: 'Page not found' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Go to Home' })).toBeTruthy();
    expect(container.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('marks a waiting placeholder busy', () => {
    const { container } = render(<EmptyState busy>Loading…</EmptyState>);
    expect(container.querySelector('.empty')?.getAttribute('aria-busy')).toBe('true');
  });
});
