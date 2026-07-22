import { createContext, useContext, useSyncExternalStore } from 'react'
import { useStore } from 'zustand'
import type { AudioEngine, EngineSnapshot } from './engine'
import type { CronoStore } from '../../store'
import type { StoreState } from '../../store/types-store'

/**
 * As três formas de consumir o painel — e por que são três.
 *
 * - `useCrono(seletor)` — o **domínio**: fila, fundos, preferências, modo.
 *   Muda quando o operador faz alguma coisa.
 * - `useEngineValue(seletor)` — o **instrumento**: volume por quadro, tempo
 *   decorrido, fade em andamento. Muda dezenas de vezes por segundo.
 * - `useEngine()` — as **ações**. Nunca muda.
 *
 * A separação entre os dois primeiros é o que cumpre o RNF-04.3: o VU-meter
 * repinta 60 vezes por segundo sem que a lista da fila saiba disso. Cada
 * componente assina só o valor de que precisa, e valor igual não re-renderiza
 * ninguém.
 *
 * Vive num arquivo separado do provedor porque o Fast Refresh do Vite só
 * funciona quando um módulo exporta **ou** componentes **ou** outras coisas.
 */

export const StoreContext = createContext<CronoStore | null>(null)
export const EngineContext = createContext<AudioEngine | null>(null)

/** Lê um pedaço do domínio. Re-renderiza só quando aquele pedaço muda. */
export function useCrono<T>(selector: (state: StoreState) => T): T {
  const store = useContext(StoreContext)
  if (!store)
    throw new Error('useCrono precisa estar dentro de <CronoProvider>')
  return useStore(store, selector)
}

/** As ações do motor. A referência nunca muda. */
export function useEngine(): AudioEngine {
  const engine = useContext(EngineContext)
  if (!engine)
    throw new Error('useEngine precisa estar dentro de <CronoProvider>')
  return engine
}

/**
 * Lê um valor de instrumento (volume, tempo, fade).
 *
 * O seletor deve devolver um **número, texto ou booleano**: a comparação é por
 * identidade, e um objeto novo a cada quadro re-renderizaria o componente 60
 * vezes por segundo sem necessidade.
 */
export function useEngineValue<T>(
  selector: (snapshot: EngineSnapshot) => T,
): T {
  const engine = useEngine()
  return useSyncExternalStore(engine.subscribe, () =>
    selector(engine.getSnapshot()),
  )
}
