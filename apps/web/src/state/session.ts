import { DEFAULT_PREFERENCES } from '@petcare/domain';
import type { Preferences } from '@petcare/domain';
import { create } from 'zustand';

export interface SessionUser {
  id: string;
  name: string;
  email: string;
}

export interface SessionHousehold {
  id: string;
  name: string;
  role: 'owner' | 'caretaker' | 'viewer';
}

export interface PublicConfig {
  providers: string[];
  emailPasswordEnabled: boolean;
  vapidPublicKey: string | null;
  maxFileBytes: number;
  householdQuotaBytes: number;
}

export type SessionStatus = 'loading' | 'signedOut' | 'signedIn';

interface SessionState {
  status: SessionStatus;
  /** True while the on-device demo is open: nothing is sent to the server. */
  demo: boolean;
  user: SessionUser | null;
  households: SessionHousehold[];
  /** The household being shown; null means the first one. */
  activeHouseholdId: string | null;
  preferences: Preferences;
  /** Sign-in options from /api/config; null until loaded (or when offline). */
  config: PublicConfig | null;
  setSignedIn: (
    user: SessionUser,
    households: SessionHousehold[],
    preferences: Preferences,
    demo?: boolean,
  ) => void;
  setSignedOut: () => void;
  setHouseholds: (households: SessionHousehold[]) => void;
  setActiveHousehold: (id: string) => void;
  setConfig: (config: PublicConfig | null) => void;
}

const ACTIVE_KEY = 'petcare-active-household';

function remembered(): string | null {
  try {
    return localStorage.getItem(ACTIVE_KEY);
  } catch {
    return null;
  }
}

export const useSessionStore = create<SessionState>()((set) => ({
  status: 'loading',
  demo: false,
  user: null,
  households: [],
  activeHouseholdId: null,
  preferences: DEFAULT_PREFERENCES,
  config: null,
  setSignedIn: (user, households, preferences, demo = false) =>
    set({
      status: 'signedIn',
      demo,
      user,
      households,
      activeHouseholdId: demo ? null : remembered(),
      preferences,
    }),
  setSignedOut: () =>
    set({
      status: 'signedOut',
      demo: false,
      user: null,
      households: [],
      activeHouseholdId: null,
      preferences: DEFAULT_PREFERENCES,
    }),
  setHouseholds: (households) => set({ households }),
  setActiveHousehold: (id) => {
    try {
      localStorage.setItem(ACTIVE_KEY, id);
    } catch {
      // The choice then lasts until the page is closed.
    }
    set({ activeHouseholdId: id });
  },
  setConfig: (config) => set({ config }),
}));

/** The household the app is showing: the chosen one if the user still belongs to it, else the first. */
export function activeHousehold(
  state: Pick<SessionState, 'households' | 'activeHouseholdId'>,
): SessionHousehold | undefined {
  return state.households.find((h) => h.id === state.activeHouseholdId) ?? state.households[0];
}
