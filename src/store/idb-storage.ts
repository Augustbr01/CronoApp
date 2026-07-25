import { openDB } from 'idb'
import type { IDBPDatabase } from 'idb'
import type { StateStorage } from 'zustand/middleware'

/**
 * O backend de persistência: IndexedDB (RF-09.1, ADR 0003).
 *
 * O `persist` do Zustand fala em texto — `getItem`/`setItem`/`removeItem`, a
 * mesma cara do localStorage. Este arquivo entrega essa interface guardando os
 * dados no IndexedDB, que é o que comporta histórico longo (RF-06.2) e os bytes
 * dos áudios locais (RF-11), guardados à parte em `blob-storage.ts`.
 *
 * O IndexedDB é assíncrono, e o `persist` sabe lidar com isso — a hidratação do
 * store acontece um instante depois do primeiro render. Quem depende de estado
 * carregado deve esperar `hasHydrated` (ver `index.ts`).
 */

export const DB_NAME = 'cronoapp'
/**
 * Versão 2: acrescentou o store `audio-blobs` para os bytes dos áudios locais
 * (RF-11). O store `state` do JSON do `persist` não mudou — os dois convivem no
 * mesmo banco, atualizados pelo mesmo `upgrade`.
 */
export const DB_VERSION = 2
export const STORE_NAME = 'state'
/** Onde vivem os bytes dos áudios importados do PC (RF-11) — fora do JSON. */
export const BLOB_STORE_NAME = 'audio-blobs'

let dbPromise: Promise<IDBPDatabase> | null = null

/**
 * A conexão única com o banco, compartilhada por quem guarda estado
 * (`createIdbStorage`) e por quem guarda blobs (`blob-storage.ts`). Um banco só,
 * uma conexão só: abrir uma segunda entraria em disputa de versão com a primeira.
 */
export function getDb(): Promise<IDBPDatabase> {
  dbPromise ??= openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      // Idempotente: cria o que faltar. Um banco v1 já tem `state` e ganha só o
      // `audio-blobs`; um banco novo ganha os dois.
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME)
      }
      if (!db.objectStoreNames.contains(BLOB_STORE_NAME)) {
        db.createObjectStore(BLOB_STORE_NAME)
      }
    },
  })
  return dbPromise
}

/**
 * **Fecha** a conexão aberta e esquece a referência. Só os testes precisam
 * disto.
 *
 * Fechar de verdade importa: enquanto houver conexão aberta, um
 * `deleteDatabase` fica bloqueado esperando — e qualquer `open` seguinte entra
 * na fila atrás dele. O resultado é um travamento em que ninguém avança.
 */
export async function resetIdbConnection(): Promise<void> {
  const pending = dbPromise
  dbPromise = null
  if (!pending) return
  try {
    const db = await pending
    db.close()
  } catch {
    // Conexão que nunca abriu não precisa ser fechada.
  }
}

/**
 * O armazenamento que o `persist` usa.
 *
 * Falha de leitura devolve `null` (o app abre com os padrões, em vez de não
 * abrir); falha de escrita é relançada, para a camada de cima poder avisar o
 * operador de que o culto não está sendo salvo — silenciar seria perder dados
 * sem ninguém saber (RNF-03.3).
 */
export function createIdbStorage(): StateStorage {
  return {
    async getItem(name) {
      try {
        const db = await getDb()
        const value: unknown = await db.get(STORE_NAME, name)
        return typeof value === 'string' ? value : null
      } catch {
        return null
      }
    },

    async setItem(name, value) {
      const db = await getDb()
      await db.put(STORE_NAME, value, name)
    },

    async removeItem(name) {
      const db = await getDb()
      await db.delete(STORE_NAME, name)
    },
  }
}
