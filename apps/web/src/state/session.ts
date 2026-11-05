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
}

export type SessionStatus = 'loading' | 'signedOut' | 'signedIn';

interface SessionState {
  status: SessionStatus;
  user: SessionUser | null;
  households: SessionHousehold[];
  /** Sign-in options from /api/config; null until loaded (or when offline). */
  config: PublicConfig | null;
  setSignedIn: (user: SessionUser, households: SessionHousehold[]) => void;
  setSignedOut: () => void;
  setHouseholds: (households: SessionHousehold[]) => void;
  setConfig: (config: PublicConfig | null) => void;
}

export const useSessionStore = create<SessionState>()((set) => ({
  status: 'loading',
  user: null,
  households: [],
  config: null,
  setSignedIn: (user, households) => set({ status: 'signedIn', user, households }),
  setSignedOut: () => set({ status: 'signedOut', user: null, households: [] }),
  setHouseholds: (households) => set({ households }),
  setConfig: (config) => set({ config }),
}));
