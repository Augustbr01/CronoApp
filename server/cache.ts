/**
 * Cache de respostas com prazo de validade e teto de tamanho (RF-10.3).
 *
 * Existe por causa de um número: a cota diária da YouTube Data API é de 10.000
 * unidades e **cada `search.list` custa 100** — dá menos de cem buscas por dia
 * no projeto inteiro. Repetir a mesma consulta dentro do prazo (o operador
 * clicando os chips de categoria, duas igrejas procurando o mesmo louvor)
 * responde de graça.
 *
 * Duas honestidades sobre o alcance disto:
 *
 * 1. **Em serverless o cache vive só enquanto a instância viver.** É
 *    melhor-esforço, não garantia. Um cache de verdade, compartilhado entre
 *    instâncias, é o passo seguinte — e o que essa interface permite trocar sem
 *    mexer no endpoint.
 * 2. **Os termos do YouTube limitam a 30 dias** o armazenamento de resposta da
 *    API. O prazo padrão daqui é de horas, bem dentro disso.
 */

export interface CacheOptions {
  /** Por quanto tempo uma entrada continua valendo. */
  ttlMs: number
  /** Teto de entradas; ao estourar, a menos usada recentemente sai. */
  maxEntries: number
  /** O relógio. Trocado nos testes. */
  now?: () => number
}

export interface Cache<T> {
  get(key: string): T | undefined
  set(key: string, value: T): void
  size(): number
  clear(): void
}

interface Entry<T> {
  at: number
  value: T
}

export function createCache<T>(options: CacheOptions): Cache<T> {
  const { ttlMs, maxEntries, now = Date.now } = options
  const entries = new Map<string, Entry<T>>()

  return {
    get(key) {
      const entry = entries.get(key)
      if (!entry) return undefined

      if (now() - entry.at >= ttlMs) {
        entries.delete(key)
        return undefined
      }

      // Reinserir põe a chave no fim da ordem do `Map`, que é a ordem de
      // inserção — é assim que "usada agora" vira "a última a ser descartada".
      // Sem isto o descarte seria por idade de entrada, e a busca mais popular
      // seria expulsa pela mais recente só por ter chegado antes.
      entries.delete(key)
      entries.set(key, entry)
      return entry.value
    },

    set(key, value) {
      entries.delete(key)
      entries.set(key, { at: now(), value })

      while (entries.size > maxEntries) {
        const menosUsada = entries.keys().next().value
        if (menosUsada === undefined) break
        entries.delete(menosUsada)
      }
    },

    size: () => entries.size,
    clear: () => entries.clear(),
  }
}
