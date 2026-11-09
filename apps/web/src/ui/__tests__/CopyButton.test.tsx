// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { en } from '../../i18n/en';
import { CopyButton } from '../CopyButton';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const clipboard = (writeText: (value: string) => Promise<void>) =>
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });

describe('CopyButton', () => {
  it('copies the value and announces the success text', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    clipboard(writeText);
    const notify = vi.fn();
    render(
      <CopyButton value="https://x/e/1" label="Copy link" copiedToast="Copied" onNotify={notify} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Copy link' }));
    await waitFor(() => expect(notify).toHaveBeenCalledWith('Copied'));
    expect(writeText).toHaveBeenCalledWith('https://x/e/1');
  });

  it('selects the adjacent code and says copying failed when the clipboard refuses', async () => {
    clipboard(() => Promise.reject(new Error('denied')));
    const notify = vi.fn();
    render(
      <p>
        <code>https://x/e/1</code>
        <CopyButton
          value="https://x/e/1"
          label="Copy link"
          copiedToast="Copied"
          onNotify={notify}
          variant="link"
        />
      </p>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Copy link' }));
    await waitFor(() => expect(notify).toHaveBeenCalledWith(en['ui.copyFailed']));
    expect(window.getSelection()?.toString()).toBe('https://x/e/1');
  });
});
