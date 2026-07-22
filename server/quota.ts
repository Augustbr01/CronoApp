/**
 * Contador da cota diária da YouTube Data API.
 *
 * O limite por IP segura o abuso; este segura a **soma** — dez igrejas dentro
 * do limite individual ainda zeram a cota do projeto. A diferença entre os dois
 * aparece no pior momento possível: sem este contador, o teto é descoberto
 * quando o Google devolve `quotaExceeded` no meio do culto, com o operador sem
 * entender o que houve.
 *
 * Aqui ele vira uma frase honesta — "a busca atingiu o limite diário, cole o
 * link do YouTube" — e ainda sobra reserva para o resto do dia.
 *
 * Os custos vêm da tabela oficial: `search.list` custa **100 unidades**,
 * `videos.list` custa **1**, e o oEmbed não é Data API — não custa nada.
 */

/** O que cada chamada da Data API tira da cota. */
export const QUOTA_COST = {
  SEARCH: 100,
  VIDEO_DETAILS: 1,
} as const

/** A cota padrão de um projeto novo no Google Cloud. */
export const DAILY_QUOTA_UNITS = 10_000

/**
 * Quanto guardar para o fim do dia.
 *
 * Bater o teto exato deixaria o app sem nem conseguir ler a duração de um vídeo
 * colado, que custa 1 unidade. A reserva mantém vivo o que é barato depois que
 * o que é caro já acabou.
 */
export const QUOTA_RESERVE_UNITS = 200

export interface QuotaOptions {
  dailyLimit?: number
  reserve?: number
  /** O relógio. Trocado nos testes. */
  now?: () => number
}

export interface QuotaLedger {
  /**
   * Tenta gastar `units`. Devolve `false` — sem gastar nada — quando não cabe.
   * Chamadas baratas (`reservable: false`) podem usar a reserva.
   */
  spend(units: number, options?: { reservable?: boolean }): boolean
  remaining(): number
}

/**
 * O dia da cota, no fuso em que ela vira.
 *
 * A cota do YouTube **não** reinicia à meia-noite daqui: ela reinicia à
 * meia-noite do Pacífico. Contar pelo dia local zeraria o contador quatro ou
 * cinco horas antes da hora — bem no meio da manhã de domingo, que é
 * exatamente quando o app está em uso.
 */
export function quotaDay(at: number): string {
  return new Date(at).toLocaleDateString('en-CA', {
    timeZone: 'America/Los_Angeles',
  })
}

export function createQuotaLedger(options: QuotaOptions = {}): QuotaLedger {
  const {
    dailyLimit = DAILY_QUOTA_UNITS,
    reserve = QUOTA_RESERVE_UNITS,
    now = Date.now,
  } = options

  let dia = quotaDay(now())
  let gasto = 0

  const virarODiaSePreciso = (): void => {
    const hoje = quotaDay(now())
    if (hoje === dia) return
    dia = hoje
    gasto = 0
  }

  return {
    spend(units, spendOptions) {
      virarODiaSePreciso()
      const reservavel = spendOptions?.reservable ?? true
      const teto = reservavel ? dailyLimit - reserve : dailyLimit
      if (gasto + units > teto) return false
      gasto += units
      return true
    },

    remaining() {
      virarODiaSePreciso()
      return Math.max(0, dailyLimit - gasto)
    },
  }
}
