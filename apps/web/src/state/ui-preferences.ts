import { create } from 'zustand';

export type Theme = 'system' | 'light' | 'dark';

const KEY = 'petcare-theme';

function stored(): Theme {
  try {
    const value = localStorage.getItem(KEY);
    return value === 'light' || value === 'dark' ? value : 'system';
  } catch {
    return 'system';
  }
}

interface UiPreferencesState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

export const useUiPreferences = create<UiPreferencesState>()((set) => ({
  theme: stored(),
  setTheme(theme) {
    try {
      localStorage.setItem(KEY, theme);
    } catch {
      // Private mode: the choice lasts for this visit only.
    }
    set({ theme });
  },
}));
