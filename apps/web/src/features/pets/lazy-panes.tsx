import { lazy } from 'react';
import type { ComponentType } from 'react';
import type { StoredRecord } from '../../application/ports/record-store';

// The Health and Files tabs are separate chunks, so the first paint does not wait for them. The
// service worker precaches them and the app preloads them once it has loaded, so both open offline
// (QA-36, DIS-petcare-006).

type Pane = ComponentType<{ pet: StoredRecord }>;

/**
 * A pane that renders straight away once its chunk is in. `React.lazy` suspends on its first
 * render even when the module was already fetched, and the loading placeholder in between
 * collapses the page and moves the scroll position; after the preload it is not needed.
 */
const pane = (load: () => Promise<Pane>) => {
  let loaded: Pane | undefined;
  const fetch = () =>
    load().then((component) => {
      loaded = component;
      return { default: component };
    });
  const Lazy = lazy(fetch);
  const Ready: Pane = (props) => {
    const Component = loaded ?? Lazy;
    return <Component {...props} />;
  };
  return { Ready, fetch };
};

const health = pane(() => import('./HealthPane').then((m) => m.HealthPane));
const files = pane(() => import('./FilesPane').then((m) => m.FilesPane));

export const HealthPane = health.Ready;
export const FilesPane = files.Ready;

/** Fetches both tab chunks ahead of use. */
export const preloadProfilePanes = () => {
  for (const { fetch } of [health, files]) void fetch().catch(() => undefined);
};
