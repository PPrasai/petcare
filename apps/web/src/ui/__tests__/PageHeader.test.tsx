// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { PageHeader } from '../PageHeader';

afterEach(cleanup);

describe('PageHeader', () => {
  it('renders one h1 with its lede and actions', () => {
    render(<PageHeader title="Expenses" lede="November so far." actions={<button>Go</button>} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Expenses' })).toBeTruthy();
    expect(screen.getByText('November so far.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Go' })).toBeTruthy();
  });

  it('can render an h2 and a label, and omits what is not given', () => {
    const { container } = render(<PageHeader title="Card" level={2} label="Today" />);
    expect(screen.getByRole('heading', { level: 2, name: 'Card' })).toBeTruthy();
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
    expect(container.querySelector('.lede')).toBeNull();
    expect(container.querySelector('.acts')).toBeNull();
    expect(container.querySelector('.label')?.textContent).toBe('Today');
  });
});
