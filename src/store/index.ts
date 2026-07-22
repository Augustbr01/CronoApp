import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type { StateStorage } from 'zustand/middleware'
import { createIdbStorage } from './idb-storage'
import { markLegacyImported, readLegacyState } from './legacy'
import { normalizePersistedState } from './normalize'
import { createBackgroundSlice } from './slices/backgrounds'
import { createDataSlice } from './slices/data'
import { createHistorySlice } from './slices/history'
import { createPlaybackSlice } from './slices/playback'
import { createPreferencesSlice } from './slices/preferences'
import { createQueueSlice } from './slices/queue'
import type { PersistedState } from './types'
import type { StoreState } from './types-store'

/**
 * O store do CronoApp — as cinco fatias de domínio, persistidas em IndexedDB.
 *
 * O que **não** é persistido é tão importante quanto o que é: `mode` e
 * `currentId` ficam de fora de propósito. Se o notebook da mesa de som
 * reiniciar no meio do culto, o app deve voltar em **standby**, e não achar que
 * ainda tem louvor no ar — o que faria a topbar anunciar "NO AR" com silêncio
 * na caixa.
 */

/** Versão do schema. O protótipo parou na 4; a reescrita começa na 5. */
export const STATE_VERSION = 5

/** A chave do registro no IndexedDB. */
export const PERSIST_KEY = 'cronoapp-state'

export interface CreateStoreOptions {
  /** Trocado nos testes por um armazenamento de memória. */
  storage?: StateStorage
  /** De onde resgatar os dados do protótipo (RF-09.3). */
  legacyStorage?: Storage | null
}

function selectPersisted(state: StoreState): PersistedState {
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
}

export function createCronoStore(options: CreateStoreOptions = {}) {
  const { storage = createIdbStorage(), legacyStorage } = options

  return create<StoreState>()(
    persist(
      (...args) => ({
        ...createQueueSlice(...args),
        ...createBackgroundSlice(...args),
        ...createPlaybackSlice(...args),
        ...createHistorySlice(...args),
        ...createPreferencesSlice(...args),
        ...createDataSlice(...args),
      }),
      {
        name: PERSIST_KEY,
        version: STATE_VERSION,
        storage: createJSONStorage(() => storage),
        partialize: selectPersisted,

        /**
         * Migração de schema (RF-09.2).
         *
         * Em vez de uma escada de transformações versão a versão, normalizamos:
         * qualquer estado antigo passa pelo mesmo filtro defensivo, que
         * preenche o que falta e descarta o que está corrompido. É mais robusto
         * porque também cobre o caso de um arquivo adulterado à mão — e é o
         * único caminho honesto para as versões 1 a 4, que vieram do protótipo
         * e cujo formato exato não temos como conferir daqui.
         */
        migrate: (persisted) => normalizePersistedState(persisted),

        merge: (persisted, current) => ({
          ...current,
          ...normalizePersistedState(persisted),
        }),

        onRehydrateStorage: () => (state) => {
          if (!state) return
          // `null` desliga o resgate (usado nos testes que não o estão testando).
          if (legacyStorage === null) return

          // Primeiro arranque sobre uma instalação do protótipo: traz fila,
          // fundos e histórico do localStorage (RF-09.3).
          const target = legacyStorage ?? globalThis.localStorage
          const legacy = readLegacyState(target)
          if (!legacy) return

          const vazio =
            state.queue.length === 0 &&
            state.backgrounds.length === 0 &&
            state.history.length === 0

          // Só resgata sobre um app ainda vazio: se já há dados novos, o
          // usuário seguiu em frente e sobrescrever seria destruir trabalho.
          if (vazio) state.importState(legacy)
          markLegacyImported(target)
        },
      },
    ),
  )
}

/** O store da aplicação. */
export const useCronoStore = createCronoStore()

export type CronoStore = ReturnType<typeof createCronoStore>
export { selectPersisted }
