// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Switch } from '../Switch';
import { ToggleRow } from '../ToggleRow';

afterEach(cleanup);

describe('Switch', () => {
  it('is a named switch that reports its state and asks for the opposite on click', () => {
    const onChange = vi.fn();
    render(<Switch checked={false} onChange={onChange} label="Push reminders" />);
    const sw = screen.getByRole('switch', { name: 'Push reminders' });
    expect(sw.getAttribute('aria-checked')).toBe('false');
    fireEvent.click(sw);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('does nothing while disabled and shows busy', () => {
    const onChange = vi.fn();
    render(<Switch checked disabled busy onChange={onChange} label="Calendar feed" />);
    const sw = screen.getByRole('switch', { name: 'Calendar feed' });
    expect(sw.getAttribute('aria-checked')).toBe('true');
    expect(sw.getAttribute('aria-busy')).toBe('true');
    fireEvent.click(sw);
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('ToggleRow', () => {
  it('shows the title, the hint and the status next to the control', () => {
    render(
      <ToggleRow
        id="push"
        title="Push reminders"
        hint="On this device"
        control={<Switch checked onChange={() => {}} label="Push" describedBy="push-h" />}
        status={<p role="status">On</p>}
      />,
    );
    expect(screen.getByText('Push reminders').id).toBe('push-t');
    expect(screen.getByRole('switch').getAttribute('aria-describedby')).toBe('push-h');
    expect(document.getElementById('push-h')?.textContent).toBe('On this device');
    expect(screen.getByRole('status').textContent).toBe('On');
  });
});
