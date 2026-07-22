import type { StateCreator } from 'zustand'
import { createId } from '../ids'
import {
  DEFAULT_BACKGROUND_FADER,
  DEFAULT_MAIN_FADER,
  DEFAULT_PREFERENCES,
} from '../types'
import type { PersistedState } from '../types'
import type { StoreState } from '../types-store'

/**
 * Entrada e saída dos dados inteiros (RF-09.3 e RF-09.4).
 *
 * Importar um backup e resgatar os dados do protótipo são a mesma operação por
 * baixo: **trocar o estado persistido inteiro**. E as duas têm a mesma regra de
 * segurança — o que está no ar sai do ar. Importar dados novos enquanto o app
 * acha que está tocando o item 3 da fila antiga é receita de tela mentindo.
 */

export interface DataSlice {
  /** Substitui todo o estado persistido pelo que veio de fora. */
  importState(state: PersistedState): void
  /** O estado atual, pronto para virar arquivo. */
  exportState(): PersistedState
  /** Apaga tudo e volta aos padrões de fábrica. */
  resetAll(): void
}

export const createDataSlice: StateCreator<StoreState, [], [], DataSlice> = (
  set,
  get,
) => ({
  importState(state) {
    set({
      queue: state.queue,
      history: state.history,
      backgrounds: state.backgrounds,
      selectedBackgroundId: state.selectedBackgroundId,
      mainFader: state.mainFader,
      backgroundFader: state.backgroundFader,
      preferences: state.preferences,
      sessionId: state.sessionId,
      // Estado do momento não vem de arquivo: o app volta para standby.
      mode: 'silence',
      currentId: null,
      mainMuted: false,
      backgroundMuted: false,
    })
  },

  exportState() {
    const state = get()
    return {
      queue: state.queue,
      history: state.history,
      backgrounds: state.backgrounds,
      selectedBackgroundId: state.selectedBackgroundId,
      mainFader: state.mainFader,
      backgroundFader: state.backgroundFader,
      preferences: state.preferences,
      sessionId: state.sessionId,
    }
  },

  resetAll() {
    set({
      queue: [],
      history: [],
      backgrounds: [],
      selectedBackgroundId: null,
      mainFader: DEFAULT_MAIN_FADER,
      backgroundFader: DEFAULT_BACKGROUND_FADER,
      preferences: { ...DEFAULT_PREFERENCES },
      sessionId: createId('s'),
      mode: 'silence',
      currentId: null,
      mainMuted: false,
      backgroundMuted: false,
      backgroundCue: 0,
    })
  },
})
