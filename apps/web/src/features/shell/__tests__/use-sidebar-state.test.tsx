// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SIDEBAR_KEY, useSidebarState } from '../use-sidebar-state';

/** A matchMedia whose "(min-width: 1280px)" answer the test controls. */
let wide = true;
const listeners = new Set<() => void>();
beforeEach(() => {
  wide = true;
  listeners.clear();
  localStorage.clear();
  vi.stubGlobal('matchMedia', () => ({
    get matches() {
      return wide;
    },
    addEventListener: (_: string, fn: () => void) => listeners.add(fn),
    removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
  }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const resize = (to: boolean) =>
  act(() => {
    wide = to;
    listeners.forEach((fn) => fn());
  });

describe('useSidebarState (SPEC-petcare-004 5.4)', () => {
  it('is open from 1280 px and a rail below, and follows a resize while nothing is stored', () => {
    const { result } = renderHook(() => useSidebarState());
    expect(result.current.collapsed).toBe(false);
    resize(false);
    expect(result.current.collapsed).toBe(true);
    resize(true);
    expect(result.current.collapsed).toBe(false);
  });

  it('stores the choice, which then wins at every width', () => {
    const { result } = renderHook(() => useSidebarState());
    act(() => result.current.toggle());
    expect(result.current.collapsed).toBe(true);
    expect(localStorage.getItem(SIDEBAR_KEY)).toBe('collapsed');
    resize(false);
    act(() => result.current.toggle());
    expect(localStorage.getItem(SIDEBAR_KEY)).toBe('expanded');
    resize(false);
    expect(result.current.collapsed).toBe(false);
  });

  it('starts from the stored choice', () => {
    localStorage.setItem(SIDEBAR_KEY, 'expanded');
    wide = false;
    const { result } = renderHook(() => useSidebarState());
    expect(result.current.collapsed).toBe(false);
  });

  it('uses the default and still toggles when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    wide = false;
    const { result } = renderHook(() => useSidebarState());
    expect(result.current.collapsed).toBe(true);
    act(() => result.current.toggle());
    expect(result.current.collapsed).toBe(false);
    vi.restoreAllMocks();
  });
});
