import type { StateCreator } from 'zustand'
import { DEFAULT_PREFERENCES, MAX_FADE_MS, MIN_FADE_MS } from '../types'
import type { AccentColor, Preferences, ThemeName } from '../types'
import type { StoreState } from '../types-store'

/**
 * As preferências do operador (RF-08), todas persistidas no dispositivo.
 *
 * As durações de fade são presas entre 0 e 8 s (RF-04.12) **aqui**, na entrada,
 * e não na hora de usar: um valor absurdo vindo de um arquivo de importação ou
 * de uma versão antiga do app não deve chegar ao motor de áudio.
 */

export function clampFadeMs(value: number): number {
  if (Number.isNaN(value)) return DEFAULT_PREFERENCES.mainFadeMs
  return Math.max(MIN_FADE_MS, Math.min(MAX_FADE_MS, Math.round(value)))
}

export interface PreferencesSlice {
  preferences: Preferences
  setMainFadeMs(value: number): void
  setBackgroundFadeMs(value: number): void
  setAccent(accent: AccentColor): void
  setTheme(theme: ThemeName): void
  toggleTheme(): void
  setAutoReturnBackground(enabled: boolean): void
  resetPreferences(): void
}

export const createPreferencesSlice: StateCreator<
  StoreState,
  [],
  [],
  PreferencesSlice
> = (set) => {
  const patch = (changes: Partial<Preferences>): void => {
    set((state) => ({ preferences: { ...state.preferences, ...changes } }))
  }

  return {
    preferences: { ...DEFAULT_PREFERENCES },

    setMainFadeMs(value) {
      patch({ mainFadeMs: clampFadeMs(value) })
    },

    setBackgroundFadeMs(value) {
      patch({ backgroundFadeMs: clampFadeMs(value) })
    },

    setAccent(accent) {
      patch({ accent })
    },

    setTheme(theme) {
      patch({ theme })
    },

    toggleTheme() {
      set((state) => ({
        preferences: {
          ...state.preferences,
          theme: state.preferences.theme === 'dark' ? 'light' : 'dark',
        },
      }))
    },

    setAutoReturnBackground(enabled) {
      patch({ autoReturnBackground: enabled })
    },

    resetPreferences() {
      set({ preferences: { ...DEFAULT_PREFERENCES } })
    },
  }
}
