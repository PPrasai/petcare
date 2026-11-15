import type { MessageKey } from '../../i18n/en';
import type { IconName } from '../../ui';

export interface Destination {
  to: '/' | '/expenses' | '/emergency' | '/household' | '/contacts' | '/settings' | '/more';
  icon: IconName;
  label: MessageKey;
  /** Paths that belong to this destination besides its own. */
  also: string[];
}

export const HOME: Destination = { to: '/', icon: 'home', label: 'nav.home', also: ['/pets'] };
export const EXPENSES: Destination = {
  to: '/expenses',
  icon: 'wallet',
  label: 'nav.expenses',
  also: [],
};
export const EMERGENCY: Destination = {
  to: '/emergency',
  icon: 'shield',
  label: 'nav.emergency',
  also: [],
};
export const HOUSEHOLD: Destination = {
  to: '/household',
  icon: 'users',
  label: 'nav.household',
  also: [],
};
/** Desktop only: the phone reaches Contacts through More. */
export const CONTACTS: Destination = {
  to: '/contacts',
  icon: 'book',
  label: 'contacts.title',
  also: [],
};
export const SETTINGS: Destination = {
  to: '/settings',
  icon: 'sliders',
  label: 'nav.settings',
  also: ['/sync'],
};
/** The phone's Settings is reached through More, whose own list holds Contacts and Sync. */
export const MORE: Destination = {
  to: '/more',
  icon: 'more',
  label: 'nav.more',
  also: ['/household', '/settings', '/contacts', '/sync'],
};

/** The pet whose page is open, so Log starts with that pet rather than the first one. */
export const openPetId = (pathname: string): string | undefined => {
  const id = pathname.startsWith('/pets/') ? pathname.split('/')[2] : undefined;
  return id && id !== 'new' ? id : undefined;
};

export const isCurrent = (dest: Destination, pathname: string) =>
  dest.to === '/'
    ? pathname === '/' || dest.also.some((p) => pathname.startsWith(p))
    : pathname === dest.to || dest.also.some((p) => pathname.startsWith(p));
