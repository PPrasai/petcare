import { describe, expect, it } from 'vitest';
import { parseTab } from './profile-tabs';

describe('parseTab', () => {
  it('keeps the four tabs', () => {
    for (const tab of ['overview', 'health', 'care', 'files']) expect(parseTab(tab)).toBe(tab);
  });
  it('remaps the legacy values from old links and notifications', () => {
    expect(parseTab('vaccinations')).toBe('health');
    expect(parseTab('medications')).toBe('health');
    expect(parseTab('visits')).toBe('health');
    expect(parseTab('conditions')).toBe('health');
    expect(parseTab('routines')).toBe('care');
    expect(parseTab('documents')).toBe('files');
  });
  it('falls back to the overview for anything else, including the emergency tab', () => {
    expect(parseTab('emergency')).toBe('overview');
    expect(parseTab('nope')).toBe('overview');
    expect(parseTab(undefined)).toBe('overview');
  });
});
