/**
 * Limite de chamadas por IP, em janela deslizante (RF-10.5).
 *
 * O endpoint é público e a cota do YouTube é diária e pequena: sem limite, um
 * laço bobo — ou alguém mal-intencionado — drena as 10.000 unidades em minutos
 * e o culto de domingo fica sem busca.
 *
 * Janela **deslizante**, e não fixa por relógio: com janela fixa, quem gasta o
 * balde inteiro no fim de um minuto e de novo no começo do seguinte passa o
 * dobro do limite em segundos. Aqui cada chamada carrega seu horário e sai da
 * conta exatamente quando envelhece.
 *
 * Vale a mesma ressalva do cache: em serverless a contagem vive na instância.
 * Segura o acidente e o abuso ingênuo; contra ataque distribuído de verdade,
 * quem responde é a borda.
 */

export interface RateLimitOptions {
  /** Quantas chamadas cabem na janela. */
  limit: number
  /** O tamanho da janela, em milissegundos. */
  windowMs: number
  /** Teto de chaves vigiadas, para a memória não crescer sem fim. */
  maxKeys?: number
  /** O relógio. Trocado nos testes. */
  now?: () => number
}

export interface RateLimitResult {
  allowed: boolean
  /** Quanto falta para caber de novo, em ms. Zero quando passou. */
  retryAfterMs: number
}

export interface RateLimiter {
  /** Registra uma chamada e diz se ela cabe no limite. */
  take(key: string): RateLimitResult
}

export function createRateLimiter(options: RateLimitOptions): RateLimiter {
  const { limit, windowMs, maxKeys = 5_000, now = Date.now } = options
  const hits = new Map<string, number[]>()

  return {
    take(key) {
      const agora = now()
      const inicioDaJanela = agora - windowMs
      const recentes = (hits.get(key) ?? []).filter(
        (quando) => quando > inicioDaJanela,
      )

      if (recentes.length >= limit) {
        hits.set(key, recentes)
        // O mais antigo da janela é o que vai liberar a próxima vaga.
        const maisAntigo = recentes[0] ?? agora
        return {
          allowed: false,
          retryAfterMs: Math.max(0, maisAntigo + windowMs - agora),
        }
      }

      recentes.push(agora)
      hits.set(key, recentes)

      // Faxina preguiçosa: sem isto, cada IP que passa por aqui uma vez fica
      // ocupando memória para sempre.
      if (hits.size > maxKeys) {
        for (const [outraChave, quando] of hits) {
          const ultimo = quando.at(-1) ?? 0
          if (ultimo <= inicioDaJanela) hits.delete(outraChave)
        }
      }

      return { allowed: true, retryAfterMs: 0 }
    },
  }
}
