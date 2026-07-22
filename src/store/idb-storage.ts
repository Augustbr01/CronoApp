import { openDB } from 'idb'
import type { IDBPDatabase } from 'idb'
import type { StateStorage } from 'zustand/middleware'

/**
 * O backend de persistência: IndexedDB (RF-09.1, ADR 0003).
 *
 * O `persist` do Zustand fala em texto — `getItem`/`setItem`/`removeItem`, a
 * mesma cara do localStorage. Este arquivo entrega essa interface guardando os
 * dados no IndexedDB, que é o que comporta histórico longo (RF-06.2) e, no
 * futuro, MP3 de fundo.
 *
 * O IndexedDB é assíncrono, e o `persist` sabe lidar com isso — a hidratação do
 * store acontece um instante depois do primeiro render. Quem depende de estado
 * carregado deve esperar `hasHydrated` (ver `index.ts`).
 */

export const DB_NAME = 'cronoapp'
export const DB_VERSION = 1
export const STORE_NAME = 'state'

let dbPromise: Promise<IDBPDatabase> | null = null

function getDb(): Promise<IDBPDatabase> {
  dbPromise ??= openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME)
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
