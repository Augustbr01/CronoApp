import { render } from '@testing-library/react'
import type { RenderResult } from '@testing-library/react'
import { StrictMode, act } from 'react'
import App from '../App'
import { PERSIST_KEY, STATE_VERSION, createCronoStore } from '../store'
import type { CronoStore } from '../store'
import { DEFAULT_PREFERENCES } from '../store/types'
import { createFakeChannelFactory } from './fake-channel'
import type { FakeChannelFactory } from './fake-channel'
import { createFakeLocalChannelFactory } from './fake-local-channel'
import type { FakeLocalChannelFactory } from './fake-local-channel'
import { createFakeScheduler } from './fake-scheduler'
import type { FakeScheduler } from './fake-scheduler'
import { createMemoryBlobVault, createMemoryStorage } from './memory-storage'
import type { MemoryBlobVault } from './memory-storage'

/**
 * Monta o painel inteiro sobre dublês.
 *
 * Três coisas trocadas, e é essa troca que faz os testes de interface valerem
 * alguma coisa: o **armazenamento** é memória (sem IndexedDB e sem cofre de
 * áudios), os **players** são de mentira (sem rede, sem iframe e sem `<audio>`)
 * e o **relógio** é do teste (dois segundos de fade passam num piscar). O
 * resto — store, motor, componentes — é o código de produção.
 */

export interface Painel extends RenderResult {
  store: CronoStore
  players: FakeChannelFactory
  /** Os backends de áudio local — nascem sob demanda, no primeiro arquivo. */
  locais: FakeLocalChannelFactory
  /** O cofre de áudios em memória, com as object URLs que ele emitiu. */
  cofre: MemoryBlobVault
  clock: FakeScheduler
  /** Deixa o React e as promessas em dia. */
  flush(): Promise<void>
  /** Simula `ms` de quadros de áudio e deixa o React em dia. */
  advance(ms: number): Promise<void>
  /**
   * Roda algo que mexe no store ou dispara evento de player **por fora** de um
   * clique — arrumar o cenário, o vídeo acabar sozinho. Sem isto o React
   * reclama que a atualização veio de fora do `act`.
   */
  fora(acao: () => void): Promise<void>
}

export interface MontarOptions {
  /** De quanto em quanto tempo o motor pergunta a hora ao player. */
  pollMs?: number
  /**
   * Envolve o painel em `<StrictMode>`, como o `main.tsx` faz.
   *
   * Não é detalhe: o StrictMode monta, desmonta e monta de novo de propósito, e
   * um motor de áudio que não sobrevive a isso deixa o `npm run dev` **sem som
   * nenhum** — enquanto todos os outros testes passam.
   */
  strict?: boolean
  /**
   * Faz as primeiras `quantas` criações de player falharem — o painel que abre
   * sem rede. Dois é o número que derruba os dois canais.
   */
  falharProximas?: number
  /**
   * Monta como **primeiro arranque**, com a tela de boas-vindas por cima.
   *
   * O padrão é o oposto — um app já configurado —, porque é o estado em que o
   * painel passa 99% da vida. Deixar a tela de boas-vindas aparecer em toda
   * montagem faria cada teste de fila, de atalho e de mixer começar tendo que
   * dispensá-la, o que é ruído em cima de coisa que não está sendo testada.
   */
  primeiroArranque?: boolean
}

export async function montarPainel(
  options: MontarOptions = {},
): Promise<Painel> {
  // Semeia o armazenamento em vez de mexer no store depois de montado: é assim
  // que um app já usado chega de verdade — com um registro no disco —, e evita
  // que a hidratação sobrescreva o que o teste acabou de ajustar.
  const { storage } = createMemoryStorage(
    options.primeiroArranque
      ? undefined
      : {
          [PERSIST_KEY]: JSON.stringify({
            state: { preferences: { ...DEFAULT_PREFERENCES, setupDone: true } },
            version: STATE_VERSION,
          }),
        },
  )
  const store = createCronoStore({ storage, legacyStorage: null })
  const players = createFakeChannelFactory()
  const locais = createFakeLocalChannelFactory()
  const cofre = createMemoryBlobVault()
  const clock = createFakeScheduler()

  if (options.falharProximas) {
    players.falharProximas(
      options.falharProximas,
      'Não foi possível carregar o player do YouTube. Verifique a conexão com a internet.',
    )
  }

  const painel = (
    <App
      store={store}
      engineOptions={{
        scheduler: clock,
        createChannel: players.create,
        createLocalChannel: locais.create,
        blobs: cofre.vault,
        resolveBlobUrl: cofre.resolveUrl,
        revokeBlobUrl: cofre.revokeUrl,
        pollMs: options.pollMs ?? 250,
      }}
    />
  )

  const view = render(
    options.strict ? <StrictMode>{painel}</StrictMode> : painel,
  )

  const flush = async (): Promise<void> => {
    await act(async () => {
      await Promise.resolve()
    })
  }

  // Os players nascem numa promessa; sem esperar, nenhum comando chega neles.
  await flush()

  return {
    ...view,
    store,
    players,
    locais,
    cofre,
    clock,
    flush,
    async advance(ms: number) {
      await act(async () => {
        clock.advance(ms)
        await Promise.resolve()
      })
    },
    async fora(acao: () => void) {
      await act(async () => {
        acao()
        await Promise.resolve()
      })
    },
  }
}
