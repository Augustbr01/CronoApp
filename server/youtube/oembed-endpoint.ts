import { createCache } from '../cache.js'
import type { Cache } from '../cache.js'
import { clientIp, readUrl, sendJson } from '../http.js'
import type { HttpRequest, HttpResponse } from '../http.js'
import { QUOTA_COST, createQuotaLedger } from '../quota.js'
import type { QuotaLedger } from '../quota.js'
import { createRateLimiter } from '../rate-limit.js'
import type { RateLimiter } from '../rate-limit.js'
import { fetchVideoDetails } from './data-api.js'
import {
  EmbedBlockedError,
  OembedError,
  VideoNotFoundError,
  fetchOembed,
} from './oembed.js'

/**
 * `GET /api/youtube/oembed?id=` — o título e a duração de um link colado
 * (RF-01.2), e o aviso de embed bloqueado antes do culto (RF-01.3).
 *
 * Hoje o operador cola um link e a fila mostra "Vídeo do YouTube" para todo
 * mundo — no domingo, com oito nomes na lista, isso é oito linhas iguais.
 *
 * A montagem em **duas fontes** é o ponto deste arquivo:
 *
 * - o **oEmbed** dá título, canal e thumbnail, de graça e sem chave;
 * - o **`videos.list`** dá duração e `embeddable`, por 1 unidade de cota.
 *
 * A segunda é opcional de propósito. Sem chave configurada, ou com a cota do
 * dia no fim, o endpoint ainda responde com o título — que já resolve a queixa
 * principal. Degradar é melhor do que recusar.
 */

const VIDEO_ID = /^[\w-]{11}$/

/** Título de vídeo muda pouco; pode ficar guardado bem mais do que uma busca. */
export const CACHE_TTL_MS = 24 * 60 * 60 * 1000
export const CACHE_MAX_ENTRIES = 500

/** Mais folgado que o da busca: colar dez links seguidos é uso normal. */
export const RATE_LIMIT = 30
export const RATE_WINDOW_MS = 60 * 1000

/** O que a tela recebe sobre um vídeo colado. */
export interface OembedResponse {
  id: string
  title: string
  channel: string
  thumbnail?: string
  /** Segundos; 0 quando não foi possível descobrir. */
  duration: number
  /**
   * `false` só quando o YouTube **afirmou** que o vídeo não pode ser
   * incorporado. Na dúvida vale `true`: esconder vídeo bom por falta de
   * informação seria pior do que deixar o operador descobrir na pré-escuta.
   */
  embeddable: boolean
}

export interface OembedEndpointDeps {
  cache?: Cache<OembedResponse>
  limiter?: RateLimiter
  ledger?: QuotaLedger
  apiKey?: () => string | undefined
  fetchImpl?: typeof fetch
  timeoutMs?: number
}

export function createOembedEndpoint(deps: OembedEndpointDeps = {}) {
  const {
    cache = createCache<OembedResponse>({
      ttlMs: CACHE_TTL_MS,
      maxEntries: CACHE_MAX_ENTRIES,
    }),
    limiter = createRateLimiter({
      limit: RATE_LIMIT,
      windowMs: RATE_WINDOW_MS,
    }),
    ledger = createQuotaLedger(),
    apiKey = () => process.env.YOUTUBE_API_KEY,
    fetchImpl,
    timeoutMs,
  } = deps

  return async function handler(
    request: HttpRequest,
    response: HttpResponse,
  ): Promise<void> {
    if (request.method !== 'GET') {
      sendJson(response, 405, { error: 'Método não permitido.' })
      return
    }

    const id = readUrl(request).searchParams.get('id')?.trim() ?? ''
    if (!VIDEO_ID.test(id)) {
      sendJson(response, 400, { error: 'Informe um id de vídeo do YouTube.' })
      return
    }

    const guardado = cache.get(id)
    if (guardado) {
      response.setHeader('X-Cache', 'HIT')
      sendJson(response, 200, guardado)
      return
    }
    response.setHeader('X-Cache', 'MISS')

    const limite = limiter.take(clientIp(request))
    if (!limite.allowed) {
      response.setHeader(
        'Retry-After',
        String(Math.max(1, Math.ceil(limite.retryAfterMs / 1000))),
      )
      sendJson(response, 429, {
        error: 'Muitos links seguidos. Espere alguns segundos.',
      })
      return
    }

    try {
      const info = await fetchOembed({ videoId: id, fetchImpl, timeoutMs })
      const extra = await lerDetalhes(id)

      const payload: OembedResponse = {
        id,
        title: info.title,
        channel: info.channel,
        thumbnail: info.thumbnail,
        duration: extra?.durationSec ?? 0,
        embeddable: extra?.embeddable ?? true,
      }
      cache.set(id, payload)
      sendJson(response, 200, payload)
    } catch (error) {
      if (
        error instanceof VideoNotFoundError ||
        error instanceof EmbedBlockedError
      ) {
        sendJson(response, 404, { error: error.message })
        return
      }
      console.error('Falha no oEmbed do YouTube:', error)
      sendJson(response, 502, {
        error: 'Não foi possível ler os dados do vídeo agora.',
      })
    }
  }

  /**
   * A parte opcional: duração e `embeddable`.
   *
   * Qualquer tropeço aqui devolve `null` e o endpoint segue com o título. É o
   * único ponto do projeto onde engolir um erro é a decisão certa — porque o
   * que ele acrescenta é enfeite, e o que ele ameaça derrubar não é.
   *
   * `reservable: false` deixa esta chamada usar a reserva do contador: ela
   * custa 1 unidade, e é o que continua funcionando depois que as buscas de 100
   * já esgotaram o dia.
   */
  async function lerDetalhes(id: string) {
    const key = apiKey()
    if (!key) return null
    if (!ledger.spend(QUOTA_COST.VIDEO_DETAILS, { reservable: false })) {
      return null
    }

    try {
      const detalhes = await fetchVideoDetails({
        apiKey: key,
        ids: [id],
        fetchImpl,
        timeoutMs,
      })
      return detalhes.get(id) ?? null
    } catch (error) {
      if (error instanceof OembedError) throw error
      console.warn('Duração indisponível para', id, error)
      return null
    }
  }
}
