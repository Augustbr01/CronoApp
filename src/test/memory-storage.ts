import type { StateStorage } from 'zustand/middleware'
import type { BlobVault } from '../store/blob-storage'

/**
 * Armazenamento de memória para os testes de domínio.
 *
 * Os testes de **regra de culto** (fila, fundos, histórico) não têm nada a ver
 * com IndexedDB — usar o banco de verdade neles só traria assincronia e lentidão
 * sem testar nada a mais. O IndexedDB tem os seus próprios testes, em
 * `persistence.test.ts`.
 */
export function createMemoryStorage(initial?: Record<string, string>) {
  const map = new Map<string, string>(Object.entries(initial ?? {}))

  const storage: StateStorage = {
    getItem: (name) => map.get(name) ?? null,
    setItem: (name, value) => {
      map.set(name, value)
    },
    removeItem: (name) => {
      map.delete(name)
    },
  }

  return { storage, map }
}

export interface MemoryBlobVault {
  /** Entra no lugar do cofre de verdade (`blobs` do motor). */
  vault: BlobVault
  /** Os bytes guardados, por id — é o que o teste inspeciona. */
  guardados: Map<string, Blob>
  /** Entra no lugar do `resolveBlobUrl` do motor. */
  resolveUrl(blobId: string): Promise<string | null>
  /** Entra no lugar do `revokeBlobUrl`. */
  revokeUrl(url: string): void
  /**
   * As object URLs criadas e ainda **não** revogadas.
   *
   * É a régua do RNF-04.2 nos testes: se sobra URL viva depois de trocar de
   * faixa ou de desmontar o motor, aquilo é um vazamento — só que invisível,
   * porque o app continua funcionando normalmente enquanto a memória sobe.
   */
  urlsVivas(): string[]
  /** Faz a próxima gravação falhar — a quota do dispositivo estourada. */
  falharProximaGravacao(error: unknown): void
  /**
   * Segura a **listagem** até o teste soltar, devolvendo quem solta.
   *
   * É o que permite reproduzir a janela de verdade da varredura de órfãos: em
   * produção ela espera a hidratação do IndexedDB, que pode terminar bem depois
   * de o operador já ter clicado em importar. Sem poder atrasar o `list()`, o
   * teste nunca vê essa sobreposição — a varredura sempre lista antes de
   * qualquer byte ser gravado, e a proteção passaria despercebida.
   */
  travarListagem(): () => void
  /**
   * O mesmo para a **gravação**: os bytes entram no cofre na hora (como o
   * IndexedDB faz), mas a promessa só resolve quando o teste soltar — deixando
   * o item por criar durante a janela.
   */
  travarGravacao(): () => void
}

/**
 * O cofre de áudios em memória.
 *
 * Os testes de costura não têm nada a ver com IndexedDB — o cofre de verdade
 * tem os seus próprios testes, em `persistence.test.ts`. Aqui interessa só o
 * contrato: gravou, leu de volta, apagou, listou.
 */
export function createMemoryBlobVault(): MemoryBlobVault {
  const guardados = new Map<string, Blob>()
  const vivas = new Set<string>()
  let falhaPendente: unknown = null
  let contador = 0
  let portaoListagem: Promise<void> | null = null
  let portaoGravacao: Promise<void> | null = null

  /** Cria um portão fechado e devolve a chave que o abre. */
  function travar(fechar: (portao: Promise<void>) => void): () => void {
    let abrir = (): void => undefined
    fechar(
      new Promise<void>((resolve) => {
        abrir = resolve
      }),
    )
    return () => abrir()
  }

  return {
    guardados,
    vault: {
      async put(id, blob) {
        if (falhaPendente !== null) {
          const erro = falhaPendente
          falhaPendente = null
          throw erro
        }
        // Grava na hora e só então espera o portão: é assim que o IndexedDB se
        // comporta do ponto de vista de quem lista depois.
        guardados.set(id, blob)
        if (portaoGravacao) await portaoGravacao
      },
      get: (id) => Promise.resolve(guardados.get(id) ?? null),
      delete(id) {
        guardados.delete(id)
        return Promise.resolve()
      },
      async list() {
        if (portaoListagem) await portaoListagem
        // A fotografia das chaves é tirada **depois** do portão, senão o atraso
        // não mudaria nada: o teste veria sempre o cofre do instante da chamada.
        return [...guardados.keys()]
      },
    },
    resolveUrl(blobId) {
      if (!guardados.has(blobId)) return Promise.resolve(null)
      // O contador deixa cada resolução distinguível: duas cargas do mesmo
      // arquivo geram URLs diferentes, como no navegador.
      contador += 1
      const url = `blob:local/${blobId}#${contador}`
      vivas.add(url)
      return Promise.resolve(url)
    },
    revokeUrl(url) {
      vivas.delete(url)
    },
    urlsVivas: () => [...vivas],
    falharProximaGravacao(error) {
      falhaPendente = error
    },
    travarListagem() {
      const soltar = travar((portao) => {
        portaoListagem = portao
      })
      return () => {
        portaoListagem = null
        soltar()
      }
    },
    travarGravacao() {
      const soltar = travar((portao) => {
        portaoGravacao = portao
      })
      return () => {
        portaoGravacao = null
        soltar()
      }
    },
  }
}

/** Um `localStorage` de mentira, para os testes do resgate do protótipo. */
export function createFakeLocalStorage(
  initial: Record<string, string> = {},
): Storage {
  const map = new Map<string, string>(Object.entries(initial))

  return {
    get length() {
      return map.size
    },
    clear: () => map.clear(),
    getItem: (key) => map.get(key) ?? null,
    key: (index) => [...map.keys()][index] ?? null,
    removeItem: (key) => {
      map.delete(key)
    },
    setItem: (key, value) => {
      map.set(key, value)
    },
  }
}
