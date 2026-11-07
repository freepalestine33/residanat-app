import { create } from 'zustand';
import { queueSettingsSync } from '../lib/syncEvents';

type Theme = 'dark' | 'light';

interface SettingsState {
  soundEnabled: boolean;
  speechEnabled: boolean;
  theme: Theme;
  headerCollapsed: boolean;
  toggleSound: () => void;
  toggleSpeech: () => void;
  setTheme: (theme: Theme) => void;
  toggleHeader: () => void;
  loadSettings: () => void;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  soundEnabled: true,
  speechEnabled: false,
  theme: 'dark',
  headerCollapsed: false,

  loadSettings: () => {
    try {
      const stored = localStorage.getItem('sa_settings_v1');
      if (stored) {
        const settings = JSON.parse(stored);
        set({
          soundEnabled: settings.soundEnabled ?? true,
          speechEnabled: settings.speechEnabled ?? false,
          theme: settings.theme ?? 'dark',
          headerCollapsed: settings.headerCollapsed ?? false,
        });
      }
    } catch (err) {
      console.error('Failed to load settings:', err);
    }
  },

  toggleSound: () => {
    set(state => {
      const newValue = !state.soundEnabled;
      const settings = {
        soundEnabled: newValue,
        speechEnabled: state.speechEnabled,
        theme: state.theme,
        headerCollapsed: state.headerCollapsed,
      };
      localStorage.setItem('sa_settings_v1', JSON.stringify(settings));
      void queueSettingsSync(settings).catch((err: unknown) => console.error('Could not queue settings sync.', err));
      return { soundEnabled: newValue };
    });
  },

  toggleSpeech: () => {
    set(state => {
      const newValue = !state.speechEnabled;
      const settings = {
        soundEnabled: state.soundEnabled,
        speechEnabled: newValue,
        theme: state.theme,
        headerCollapsed: state.headerCollapsed,
      };
      localStorage.setItem('sa_settings_v1', JSON.stringify(settings));
      void queueSettingsSync(settings).catch((err: unknown) => console.error('Could not queue settings sync.', err));
      return { speechEnabled: newValue };
    });
  },

  setTheme: (theme) => {
    set(state => {
      const settings = {
        soundEnabled: state.soundEnabled,
        speechEnabled: state.speechEnabled,
        theme,
        headerCollapsed: state.headerCollapsed,
      };
      localStorage.setItem('sa_settings_v1', JSON.stringify(settings));
      void queueSettingsSync(settings).catch((err: unknown) => console.error('Could not queue settings sync.', err));
      return { theme };
    });
  },

  toggleHeader: () => {
    set(state => {
      const newValue = !state.headerCollapsed;
      const settings = {
        soundEnabled: state.soundEnabled,
        speechEnabled: state.speechEnabled,
        theme: state.theme,
        headerCollapsed: newValue,
      };
      localStorage.setItem('sa_settings_v1', JSON.stringify(settings));
      void queueSettingsSync(settings).catch((err: unknown) => console.error('Could not queue settings sync.', err));
      return { headerCollapsed: newValue };
    });
  },
}));
