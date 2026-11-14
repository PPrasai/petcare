import { lazy } from 'react';

// The Health and Files tabs are separate chunks, so the first paint does not wait for them. The
// service worker precaches them and the app preloads them once it has loaded, so both open offline
// (QA-36, DIS-petcare-006).
const loadHealth = () => import('./HealthPane').then((m) => ({ default: m.HealthPane }));
const loadFiles = () => import('./FilesPane').then((m) => ({ default: m.FilesPane }));

export const HealthPane = lazy(loadHealth);
export const FilesPane = lazy(loadFiles);

/** Fetches both tab chunks ahead of use. */
export const preloadProfilePanes = () => {
  for (const load of [loadHealth, loadFiles]) void load().catch(() => undefined);
};
