// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { emptyScheduleForm } from '../../../application/schedule-form';
import type { ScheduleFormValues } from '../../../application/schedule-form';
import { ScheduleFields } from '../ScheduleFields';

afterEach(cleanup);

const seen: ScheduleFormValues[] = [];
const latest = () => seen[seen.length - 1];
function Harness() {
  const [values, setValues] = useState(emptyScheduleForm('2026-01-01'));
  return (
    <ScheduleFields
      values={values}
      onChange={(next) => {
        seen.push(next);
        setValues(next);
      }}
    />
  );
}

describe('ScheduleFields times', () => {
  it('uses native time inputs, adds and removes times', () => {
    render(<Harness />);
    const first = screen.getByLabelText('Time') as HTMLInputElement;
    expect(first.type).toBe('time');
    fireEvent.change(first, { target: { value: '07:45' } });
    expect(latest()?.times).toBe('07:45');

    fireEvent.click(screen.getByRole('button', { name: 'Add another time' }));
    fireEvent.change(screen.getByLabelText('Time 2'), { target: { value: '19:30' } });
    expect(latest()?.times).toBe('07:45, 19:30');

    fireEvent.click(screen.getByRole('button', { name: 'Remove time 1' }));
    expect(latest()?.times).toBe('19:30');
  });
});
