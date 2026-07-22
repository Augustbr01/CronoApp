import type { StateStorage } from 'zustand/middleware'

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
