/** The four profile tabs (AS-petcare-002 3.1). */
export const PROFILE_TABS = ['overview', 'health', 'care', 'files'] as const;
export type ProfileTab = (typeof PROFILE_TABS)[number];

/** Old `?tab=` values, from links and push notifications already out in the world, map onto the new tabs. */
const LEGACY: Record<string, ProfileTab> = {
  vaccinations: 'health',
  medications: 'health',
  visits: 'health',
  conditions: 'health',
  routines: 'care',
  documents: 'files',
};

export const isProfileTab = (value: unknown): value is ProfileTab =>
  PROFILE_TABS.includes(value as ProfileTab);

export const parseTab = (value: unknown): ProfileTab =>
  isProfileTab(value)
    ? value
    : typeof value === 'string'
      ? (LEGACY[value] ?? 'overview')
      : 'overview';
