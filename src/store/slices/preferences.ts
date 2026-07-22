import type { StateCreator } from 'zustand'
import {
  DEFAULT_PREFERENCES,
  MAX_CHURCH_NAME,
  MAX_FADE_MS,
  MIN_FADE_MS,
} from '../types'
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

/**
 * Arruma o nome da igreja: sem espaço sobrando nas pontas, sem quebra de linha
 * e dentro do teto.
 *
 * O corte importa porque o nome mora na topbar, que é uma linha só disputada
 * com o NO AR, o relógio e o transporte — um nome colado de outro lugar, com 200
 * caracteres, empurraria tudo.
 */
export function cleanChurchName(value: string): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, MAX_CHURCH_NAME)
}

export interface PreferencesSlice {
  preferences: Preferences
  setMainFadeMs(value: number): void
  setBackgroundFadeMs(value: number): void
  setAccent(accent: AccentColor): void
  setTheme(theme: ThemeName): void
  toggleTheme(): void
  setAutoReturnBackground(enabled: boolean): void
  /**
   * Guarda o nome da igreja (vazio some da topbar e é um pedido válido).
   *
   * Aceitar o vazio é o que permite apagar depois de ter posto — sem isso, quem
   * digitasse errado ficaria com o erro na tela para sempre.
   */
  setChurchName(name: string): void
  /** Fecha a tela de boas-vindas, com nome ou sem — pular é resposta. */
  completeSetup(name: string): void
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

    setChurchName(name) {
      patch({ churchName: cleanChurchName(name) })
    },

    completeSetup(name) {
      patch({ churchName: cleanChurchName(name), setupDone: true })
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
      // O nome da igreja e o "já me apresentei" sobrevivem: restaurar padrões é
      // sobre como o app **opera** (fades, tema, cor), não sobre esquecer de
      // quem ele é. Zerá-los faria a tela de boas-vindas ressurgir do nada
      // depois de um clique em "restaurar".
      set((state) => ({
        preferences: {
          ...DEFAULT_PREFERENCES,
          churchName: state.preferences.churchName,
          setupDone: state.preferences.setupDone,
        },
      }))
    },
  }
}
