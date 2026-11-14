import { describe, expect, it } from 'vitest';
import { relativeTime } from './when';

const now = new Date('2026-11-13T12:00:00Z');
const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();

describe('relativeTime', () => {
  it('says how long ago, in the largest whole unit', () => {
    expect(relativeTime(ago(20_000), now)).toBe('Just now');
    expect(relativeTime(ago(5 * 60_000), now)).toBe('5 min ago');
    expect(relativeTime(ago(3 * 3_600_000), now)).toBe('3 h ago');
    expect(relativeTime(ago(2 * 86_400_000), now)).toBe('2 days ago');
  });

  it('treats a time slightly in the future as just now', () => {
    expect(relativeTime(ago(-30_000), now)).toBe('Just now');
  });
});
