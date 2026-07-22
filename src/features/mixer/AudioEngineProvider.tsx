import { useEffect, useMemo, useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import { EngineContext, StoreContext } from './context'
import { createAudioEngine } from './engine'
import type { AudioEngine, AudioEngineOptions } from './engine'
import { useCronoStore } from '../../store'
import type { CronoStore } from '../../store'

/**
 * O ponto em que o painel inteiro se liga ao motor e ao store.
 *
 * O store chega por **contexto**, e não importado direto pelos componentes,
 * para o teste poder montar o painel sobre um store limpo e um player de
 * mentira — sem IndexedDB, sem rede e sem YouTube. Em produção o valor padrão é
 * o store da aplicação, e ninguém precisa passar nada.
 *
 * Os hooks de consumo (`useCrono`, `useEngine`, `useEngineValue`) moram em
 * [context.ts](context.ts).
 */

/**
 * Guarda **um** motor vivo e sabe fabricar outro quando o atual é solto.
 *
 * Existe por causa do `StrictMode`, que em desenvolvimento monta, desmonta e
 * monta de novo de propósito, para caçar efeitos mal escritos. Um motor criado
 * com `useMemo` e destruído na limpeza do efeito **não sobrevive a isso**: a
 * limpeza o mata e a remontagem reaproveita o mesmo objeto, agora morto. O
 * sintoma seria brutal e só em `npm run dev` — o painel abre, os botões
 * respondem, e não sai som nenhum.
 *
 * Como observável externo, o problema some: soltar o motor **avisa** quem
 * estiver montado, que pede um novo na hora. Serve tanto para o `StrictMode`
 * quanto para o caso real de a árvore remontar.
 */
function createEngineHolder(factory: () => AudioEngine) {
  let current: AudioEngine | null = null
  const listeners = new Set<() => void>()

  return {
    get: (): AudioEngine => {
      current ??= factory()
      return current
    },
    subscribe: (listener: () => void): (() => void) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    /** Solta o motor informado — se ele ainda for o corrente. */
    release: (engine: AudioEngine): void => {
      if (current !== engine) return
      current = null
      engine.destroy()
      for (const listener of listeners) listener()
    },
  }
}

export interface CronoProviderProps {
  children: ReactNode
  /** Trocado nos testes por um store de memória. */
  store?: CronoStore
  /** Repassado ao motor: relógio e fábrica de players (trocados nos testes). */
  engineOptions?: Omit<AudioEngineOptions, 'store'>
}

export function CronoProvider({
  children,
  store = useCronoStore,
  engineOptions,
}: CronoProviderProps) {
  const holder = useMemo(
    () =>
      createEngineHolder(() => createAudioEngine({ store, ...engineOptions })),
    [store, engineOptions],
  )

  const engine = useSyncExternalStore(holder.subscribe, holder.get)

  // Desmontar sem isto deixaria um iframe tocando e um laço por quadro girando
  // para sempre (RNF-04.2).
  useEffect(() => () => holder.release(engine), [holder, engine])

  return (
    <StoreContext.Provider value={store}>
      <EngineContext.Provider value={engine}>{children}</EngineContext.Provider>
    </StoreContext.Provider>
  )
}
