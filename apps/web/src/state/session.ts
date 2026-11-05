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
}

export type SessionStatus = 'loading' | 'signedOut' | 'signedIn';

interface SessionState {
  status: SessionStatus;
  user: SessionUser | null;
  households: SessionHousehold[];
  preferences: Preferences;
  /** Sign-in options from /api/config; null until loaded (or when offline). */
  config: PublicConfig | null;
  setSignedIn: (
    user: SessionUser,
    households: SessionHousehold[],
    preferences: Preferences,
  ) => void;
  setSignedOut: () => void;
  setHouseholds: (households: SessionHousehold[]) => void;
  setConfig: (config: PublicConfig | null) => void;
}

export const useSessionStore = create<SessionState>()((set) => ({
  status: 'loading',
  user: null,
  households: [],
  preferences: DEFAULT_PREFERENCES,
  config: null,
  setSignedIn: (user, households, preferences) =>
    set({ status: 'signedIn', user, households, preferences }),
  setSignedOut: () =>
    set({ status: 'signedOut', user: null, households: [], preferences: DEFAULT_PREFERENCES }),
  setHouseholds: (households) => set({ households }),
  setConfig: (config) => set({ config }),
}));
