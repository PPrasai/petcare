// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Dialog } from '../Dialog';
import { Sheet } from '../Sheet';

// jsdom has no <dialog> modal API; this stands in for it.
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function close() {
    this.removeAttribute('open');
  };
});
afterEach(cleanup);

describe('Sheet and Dialog placement (SPEC-petcare-004 5.6)', () => {
  it('is a labelled drawer by default and carries the variant it was given', () => {
    const { rerender } = render(
      <Sheet open label="Add expense" onClose={() => {}}>
        <p>body</p>
      </Sheet>,
    );
    const drawer = screen.getByRole('dialog', { name: 'Add expense' });
    expect(drawer.getAttribute('data-variant')).toBe('drawer');
    rerender(
      <Sheet open label="Log something" variant="wide" onClose={() => {}}>
        <p>body</p>
      </Sheet>,
    );
    expect(screen.getByRole('dialog', { name: 'Log something' }).getAttribute('data-variant')).toBe(
      'wide',
    );
  });

  it('keeps its body out of the page while closed', () => {
    render(
      <Sheet open={false} label="Closed" variant="dialog" onClose={() => {}}>
        <p>body</p>
      </Sheet>,
    );
    expect(screen.queryByText('body')).toBeNull();
  });

  it('gives a confirmation its title as its name, and `mid` as its size', () => {
    render(
      <Dialog open title="Receipt" size="mid" onClose={() => {}}>
        <p>image</p>
      </Dialog>,
    );
    const dialog = screen.getByRole('dialog', { name: 'Receipt' });
    expect(dialog.getAttribute('data-size')).toBe('mid');
  });
});
