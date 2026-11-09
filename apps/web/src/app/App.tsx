import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { useEffect } from 'react';
import { ServicesProvider } from '../features/shared/services-context';
import { useUiPreferences } from '../state/ui-preferences';
import type { Runtime } from './runtime';
import { router } from './router';

/** Providers: services, Query, router, and the theme attribute on <html>. */
export function App({ runtime }: { runtime: Runtime }) {
  const theme = useUiPreferences((s) => s.theme);
  useEffect(() => {
    const root = document.documentElement;
    const dark =
      theme === 'dark' ||
      (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    root.dataset.theme = dark ? 'dark' : 'light';
    // The browser bar follows the theme: the page's own choice, or the system's when there is none.
    const bars = document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]');
    bars.forEach((bar) => {
      bar.dataset.original ??= bar.content;
      bar.content = theme === 'system' ? bar.dataset.original : dark ? '#14161c' : '#f2f1ef';
    });
  }, [theme]);

  return (
    <ServicesProvider value={runtime.services}>
      <QueryClientProvider client={runtime.queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </ServicesProvider>
  );
}
