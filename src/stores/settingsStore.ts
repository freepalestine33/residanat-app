import { create } from 'zustand';
import { queueSettingsSync } from '../lib/syncEvents';

type Theme = 'dark' | 'light';
export type StudyTrack = 'residency' | 'fifth-year';

interface SettingsState {
  soundEnabled: boolean;
  speechEnabled: boolean;
  theme: Theme;
  headerCollapsed: boolean;
  studyTrack: StudyTrack;
  toggleSound: () => void;
  toggleSpeech: () => void;
  setTheme: (theme: Theme) => void;
  toggleHeader: () => void;
  setStudyTrack: (studyTrack: StudyTrack) => void;
  loadSettings: () => void;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  soundEnabled: true,
  speechEnabled: false,
  theme: 'light',
  headerCollapsed: false,
  studyTrack: 'residency',

  loadSettings: () => {
    try {
      const stored = localStorage.getItem('sa_settings_v1');
      if (stored) {
        const settings = JSON.parse(stored);
        set({
          soundEnabled: settings.soundEnabled ?? true,
          speechEnabled: settings.speechEnabled ?? false,
          theme: settings.theme ?? 'light',
          headerCollapsed: settings.headerCollapsed ?? false,
          studyTrack: settings.studyTrack === 'fifth-year' ? 'fifth-year' : 'residency',
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
        studyTrack: state.studyTrack,
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
        studyTrack: state.studyTrack,
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
        studyTrack: state.studyTrack,
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
        studyTrack: state.studyTrack,
      };
      localStorage.setItem('sa_settings_v1', JSON.stringify(settings));
      void queueSettingsSync(settings).catch((err: unknown) => console.error('Could not queue settings sync.', err));
      return { headerCollapsed: newValue };
    });
  },

  setStudyTrack: (studyTrack) => {
    set((state) => {
      const settings = {
        soundEnabled: state.soundEnabled,
        speechEnabled: state.speechEnabled,
        theme: state.theme,
        headerCollapsed: state.headerCollapsed,
        studyTrack,
      };
      localStorage.setItem('sa_settings_v1', JSON.stringify(settings));
      void queueSettingsSync(settings).catch((err: unknown) => console.error('Could not queue settings sync.', err));
      return { studyTrack };
    });
  },
}));
