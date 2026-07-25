import type { StateStorage } from 'zustand/middleware'
import { PERSIST_KEY, STATE_VERSION, createCronoStore } from './index'
import { DB_NAME, createIdbStorage, resetIdbConnection } from './idb-storage'
import { deleteBlob, getBlob, listBlobIds, putBlob } from './blob-storage'
import { LEGACY_IMPORTED_KEY, LEGACY_STORAGE_KEY } from './legacy'
import {
  createFakeLocalStorage,
  createMemoryStorage,
} from '../test/memory-storage'

/**
 * A persistência de verdade: IndexedDB, migração de schema e o resgate dos
 * dados do protótipo.
 *
 * Estes testes rodam sobre um IndexedDB real (em memória, via `fake-indexeddb`),
 * não sobre um dublê — abrem banco, gravam, fecham e reabrem. É a única forma de
 * o "os dados sobrevivem a fechar o app" significar alguma coisa.
 */

async function apagarBanco(): Promise<void> {
  // Fechar antes de apagar: conexão aberta bloqueia o `deleteDatabase`, e o
  // `open` seguinte fica na fila atrás dele — trava tudo.
  await resetIdbConnection()
  await new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase(DB_NAME)
    request.onsuccess = () => resolve()
    request.onerror = () => resolve()
    request.onblocked = () => resolve()
  })
}

beforeEach(async () => {
  await apagarBanco()
})

afterEach(async () => {
  await apagarBanco()
})

/** Espera o `persist` terminar de gravar o que foi pedido. */
async function esperarGravacao(
  storage: StateStorage,
  contem: (raw: string) => boolean,
): Promise<void> {
  await vi.waitFor(async () => {
    const raw = await storage.getItem(PERSIST_KEY)
    if (!raw || !contem(raw)) throw new Error('ainda não gravou')
  })
}

describe('IndexedDB (RF-09.1)', () => {
  it('grava e lê de volta', async () => {
    const storage = createIdbStorage()

    await storage.setItem(PERSIST_KEY, '{"oi":1}')

    expect(await storage.getItem(PERSIST_KEY)).toBe('{"oi":1}')
  })

  it('devolve null para chave que não existe', async () => {
    const storage = createIdbStorage()

    expect(await storage.getItem('nao-existe')).toBeNull()
  })

  it('apaga', async () => {
    const storage = createIdbStorage()
    await storage.setItem(PERSIST_KEY, 'x')

    await storage.removeItem(PERSIST_KEY)

    expect(await storage.getItem(PERSIST_KEY)).toBeNull()
  })

  it('os dados sobrevivem a fechar e reabrir o app', async () => {
    const storage = createIdbStorage()
    const primeiro = createCronoStore({ storage, legacyStorage: null })
    await primeiro.persist.rehydrate()

    primeiro.getState().addToQueue({
      kind: 'youtube',
      name: 'Ana',
      videoId: 'v1',
      title: 'Ana canta',
    })
    primeiro
      .getState()
      .addBackground({ kind: 'youtube', videoId: 'bg1', title: 'Piano' })
    primeiro.getState().setAccent('#4f8df7')
    await esperarGravacao(storage, (raw) => raw.includes('Ana'))

    // Fecha e reabre: conexão nova, store novo, os mesmos dados.
    await resetIdbConnection()
    const segundo = createCronoStore({
      storage: createIdbStorage(),
      legacyStorage: null,
    })
    await segundo.persist.rehydrate()

    expect(segundo.getState().queue.map((i) => i.name)).toEqual(['Ana'])
    expect(segundo.getState().backgrounds).toHaveLength(1)
    expect(segundo.getState().preferences.accent).toBe('#4f8df7')
  })
})

describe('o que NÃO se persiste', () => {
  it('o app volta em standby, não "no ar", depois de reiniciar', async () => {
    const { storage } = createMemoryStorage()
    const primeiro = createCronoStore({ storage, legacyStorage: null })
    await primeiro.persist.rehydrate()

    const ana = primeiro.getState().addToQueue({
      kind: 'youtube',
      name: 'Ana',
      videoId: 'v1',
      title: 'Ana canta',
    })
    primeiro.getState().play(ana)
    expect(primeiro.getState().mode).toBe('main')
    await esperarGravacao(storage, (raw) => raw.includes('Ana'))

    const segundo = createCronoStore({ storage, legacyStorage: null })
    await segundo.persist.rehydrate()

    // A fila voltou; o "no ar" não. Um notebook que reinicia no meio do culto
    // não pode voltar anunciando NO AR com silêncio na caixa.
    expect(segundo.getState().queue).toHaveLength(1)
    expect(segundo.getState().mode).toBe('silence')
    expect(segundo.getState().currentId).toBeNull()
  })

  it('não grava o modo nem o item no ar', async () => {
    const { storage, map } = createMemoryStorage()
    const store = createCronoStore({ storage, legacyStorage: null })
    await store.persist.rehydrate()

    const ana = store.getState().addToQueue({
      kind: 'youtube',
      name: 'Ana',
      videoId: 'v1',
      title: 'Ana canta',
    })
    store.getState().play(ana)
    await esperarGravacao(storage, (raw) => raw.includes('Ana'))

    const raw = map.get(PERSIST_KEY) ?? ''
    const gravado = JSON.parse(raw) as { state: Record<string, unknown> }
    expect(Object.keys(gravado.state)).not.toContain('mode')
    expect(Object.keys(gravado.state)).not.toContain('currentId')
  })
})

describe('migração de schema (RF-09.2)', () => {
  it('abre dados de uma versão anterior preenchendo o que falta', async () => {
    const antigo = JSON.stringify({
      version: 4,
      state: {
        queue: [{ id: 'q1', name: 'Ana', videoId: 'v1', title: 'Ana canta' }],
        backgrounds: [{ id: 'bg1', videoId: 'bgv', title: 'Piano' }],
        // Sem preferências, sem faders, sem sessionId — a versão antiga não os
        // tinha nesse formato.
      },
    })
    const { storage } = createMemoryStorage({ [PERSIST_KEY]: antigo })

    const store = createCronoStore({ storage, legacyStorage: null })
    await store.persist.rehydrate()

    const state = store.getState()
    expect(state.queue).toHaveLength(1)
    expect(state.queue[0]?.name).toBe('Ana')
    expect(state.backgrounds).toHaveLength(1)
    // O que faltava veio com padrão, em vez de `undefined` vazando pelo app.
    expect(state.preferences.mainFadeMs).toBe(2000)
    expect(state.mainFader).toBe(80)
    expect(state.sessionId).toBeTruthy()
  })

  it('descarta item corrompido em vez de recusar abrir', async () => {
    const sujo = JSON.stringify({
      version: STATE_VERSION,
      state: {
        queue: [
          { id: 'q1', name: 'Ana', videoId: 'v1', title: 'Ana canta' },
          { id: 'q2', name: 'Sem vídeo' },
          null,
          'isto não é um item',
        ],
      },
    })
    const { storage } = createMemoryStorage({ [PERSIST_KEY]: sujo })

    const store = createCronoStore({ storage, legacyStorage: null })
    await store.persist.rehydrate()

    // Um item bom entra; o lixo fica de fora; o app abre.
    expect(store.getState().queue.map((i) => i.name)).toEqual(['Ana'])
  })

  it('abre com os padrões quando o registro é ilegível', async () => {
    const { storage } = createMemoryStorage({ [PERSIST_KEY]: 'não é json {{' })

    const store = createCronoStore({ storage, legacyStorage: null })
    await store.persist.rehydrate()

    expect(store.getState().queue).toEqual([])
    expect(store.getState().preferences.theme).toBe('dark')
  })
})

describe('resgate dos dados do protótipo (RF-09.3)', () => {
  // O formato **real** do protótipo (schema v4), com os nomes de campo dele.
  const dadosDoProtótipo = JSON.stringify({
    version: 4,
    state: {
      queue: [
        {
          id: 'q1',
          singer: 'Ana',
          title: 'Ana canta',
          duration: 212,
          url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        },
      ],
      backgrounds: [
        {
          id: 'kXYiU_JCYtU',
          title: 'Piano worship',
          playlist: 'YouTube',
          duration: 7200,
        },
      ],
      history: [{ singer: 'Bruno', title: 'Bruno cantou', playedAt: '19:42' }],
    },
  })

  it('traz fila, fundos e histórico do localStorage na primeira abertura', async () => {
    const { storage } = createMemoryStorage()
    const legacyStorage = createFakeLocalStorage({
      [LEGACY_STORAGE_KEY]: dadosDoProtótipo,
    })

    const store = createCronoStore({ storage, legacyStorage })
    await store.persist.rehydrate()

    expect(store.getState().queue.map((i) => i.name)).toEqual(['Ana'])
    expect(store.getState().backgrounds).toHaveLength(1)
    expect(store.getState().history.map((h) => h.name)).toEqual(['Bruno'])
  })

  it('não apaga o localStorage do protótipo — ele fica como rede de segurança', async () => {
    const { storage } = createMemoryStorage()
    const legacyStorage = createFakeLocalStorage({
      [LEGACY_STORAGE_KEY]: dadosDoProtótipo,
    })

    const store = createCronoStore({ storage, legacyStorage })
    await store.persist.rehydrate()

    expect(legacyStorage.getItem(LEGACY_STORAGE_KEY)).toBe(dadosDoProtótipo)
    expect(legacyStorage.getItem(LEGACY_IMPORTED_KEY)).toBeTruthy()
  })

  it('resgata uma vez só, não a cada abertura', async () => {
    const legacyStorage = createFakeLocalStorage({
      [LEGACY_STORAGE_KEY]: dadosDoProtótipo,
    })

    const primeiro = createCronoStore({
      storage: createMemoryStorage().storage,
      legacyStorage,
    })
    await primeiro.persist.rehydrate()
    expect(primeiro.getState().queue).toHaveLength(1)

    // Segunda abertura, com o app já vazio de novo (o operador apagou a fila):
    // o resgate não pode ressuscitar o que ele apagou.
    const segundo = createCronoStore({
      storage: createMemoryStorage().storage,
      legacyStorage,
    })
    await segundo.persist.rehydrate()

    expect(segundo.getState().queue).toHaveLength(0)
  })

  it('não sobrescreve dados que o operador já criou na versão nova', async () => {
    const { storage } = createMemoryStorage()
    const legacyStorage = createFakeLocalStorage({
      [LEGACY_STORAGE_KEY]: dadosDoProtótipo,
    })

    const primeiro = createCronoStore({ storage, legacyStorage: null })
    await primeiro.persist.rehydrate()
    primeiro.getState().addToQueue({
      kind: 'youtube',
      name: 'Carla',
      videoId: 'v9',
      title: 'Carla canta',
    })
    await esperarGravacao(storage, (raw) => raw.includes('Carla'))

    const segundo = createCronoStore({ storage, legacyStorage })
    await segundo.persist.rehydrate()

    expect(segundo.getState().queue.map((i) => i.name)).toEqual(['Carla'])
  })

  it('segue em frente quando não há nada do protótipo', async () => {
    const { storage } = createMemoryStorage()
    const legacyStorage = createFakeLocalStorage()

    const store = createCronoStore({ storage, legacyStorage })
    await store.persist.rehydrate()

    expect(store.getState().queue).toEqual([])
    // Sem nada para resgatar, nem a marca é gravada — se o operador restaurar um
    // backup do protótipo amanhã, o resgate ainda acontece.
    expect(legacyStorage.getItem(LEGACY_IMPORTED_KEY)).toBeNull()
  })

  it('segue em frente quando o localStorage do protótipo está corrompido', async () => {
    const { storage } = createMemoryStorage()
    const legacyStorage = createFakeLocalStorage({
      [LEGACY_STORAGE_KEY]: '{quebrado',
    })

    const store = createCronoStore({ storage, legacyStorage })
    await store.persist.rehydrate()

    expect(store.getState().queue).toEqual([])
  })
})

/**
 * Os bytes dos áudios locais (RF-11), no store `audio-blobs` do mesmo banco.
 *
 * Moram aqui, e não num arquivo próprio, de propósito: é a mesma camada de
 * IndexedDB destes testes, e reusam o `apagarBanco` dos hooks acima. Um arquivo
 * de teste **a mais** ainda reacende a corrida C1 do jest-dom sob `isolate:
 * false` (o registro dos matchers perde a corrida em alguns workers, conforme o
 * escalonamento) — mantê-los aqui evita essa fragilidade de infra sem mascará-la
 * como se fosse falha destes testes.
 */
describe('blob-storage: bytes dos áudios locais (RF-11)', () => {
  const fakeAudio = (texto = 'bytes de áudio'): Blob =>
    new Blob([texto], { type: 'audio/mpeg' })

  it('grava e lê os bytes de volta, com o tipo', async () => {
    await putBlob('a1', fakeAudio('louvor'))

    const lido = await getBlob('a1')
    expect(lido).not.toBeNull()
    expect(await lido?.text()).toBe('louvor')
    expect(lido?.type).toBe('audio/mpeg')
  })

  it('devolve null para um id que não existe', async () => {
    expect(await getBlob('nao-existe')).toBeNull()
  })

  it('apaga os bytes', async () => {
    await putBlob('a1', fakeAudio())

    await deleteBlob('a1')

    expect(await getBlob('a1')).toBeNull()
  })

  it('substitui os bytes ao gravar o mesmo id de novo', async () => {
    await putBlob('a1', fakeAudio('primeiro'))
    await putBlob('a1', fakeAudio('segundo'))

    expect(await getBlob('a1').then((b) => b?.text())).toBe('segundo')
  })

  it('lista os ids guardados', async () => {
    await putBlob('a1', fakeAudio())
    await putBlob('a2', fakeAudio())

    expect((await listBlobIds()).sort()).toEqual(['a1', 'a2'])
  })

  it('os bytes sobrevivem a fechar e reabrir o banco', async () => {
    await putBlob('a1', fakeAudio('coletânea'))

    // Fecha a conexão: a próxima leitura abre uma nova, como faria o app ao
    // reiniciar no meio do culto.
    await resetIdbConnection()

    expect(await getBlob('a1').then((b) => b?.text())).toBe('coletânea')
  })
})
