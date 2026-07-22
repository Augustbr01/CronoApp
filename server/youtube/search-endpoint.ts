import { createCache } from '../cache.js'
import type { Cache } from '../cache.js'
import { clientIp, readUrl, sendJson } from '../http.js'
import type { HttpRequest, HttpResponse } from '../http.js'
import { QUOTA_COST, createQuotaLedger } from '../quota.js'
import type { QuotaLedger } from '../quota.js'
import { createRateLimiter } from '../rate-limit.js'
import type { RateLimiter } from '../rate-limit.js'
import {
  YouTubeApiError,
  fetchVideoDetails,
  searchVideos,
  withDurations,
} from './data-api.js'
import type { VideoDuration, VideoResult } from './data-api.js'

/**
 * `GET /api/youtube/search?q=&duration=` — o endpoint que o RF-10 descreve.
 *
 * **A ordem das checagens é a decisão de projeto deste arquivo**, e ela não é
 * a óbvia:
 *
 * 1. método e query — recusar lixo antes de gastar qualquer coisa;
 * 2. **cache** — resposta repetida sai de graça;
 * 3. chave da API — sem ela não há o que tentar;
 * 4. limite por IP;
 * 5. cota diária do projeto;
 * 6. só então o Google.
 *
 * O cache vem **antes** do limite de propósito. Limitar quem repete a mesma
 * busca não protege cota nenhuma (a resposta já está guardada) e castigaria
 * justamente o uso normal: o operador clicando os quatro chips de categoria
 * enquanto monta a lista. O que precisa de freio é a busca **nova**, que é a
 * que paga 100 unidades.
 */

/** Teto do termo de busca (RF-10.2). */
export const MAX_QUERY_LENGTH = 120

/** Prazo de validade da resposta guardada (RF-10.3). */
export const CACHE_TTL_MS = 6 * 60 * 60 * 1000
export const CACHE_MAX_ENTRIES = 100

/**
 * O freio por IP.
 *
 * Doze buscas novas por minuto é bem mais do que um operador consegue digitar e
 * ler, e bem menos do que um laço acidental faz num piscar. Lembrando que o dia
 * inteiro cabe em menos de cem buscas.
 */
export const RATE_LIMIT = 12
export const RATE_WINDOW_MS = 60 * 1000

const DURACOES: readonly string[] = ['any', 'short', 'medium', 'long']

export interface SearchEndpointDeps {
  cache?: Cache<string>
  limiter?: RateLimiter
  ledger?: QuotaLedger
  /** De onde sai a chave. Função, e não valor, para o "traga a sua" caber depois. */
  apiKey?: () => string | undefined
  fetchImpl?: typeof fetch
  timeoutMs?: number
}

export function createSearchEndpoint(deps: SearchEndpointDeps = {}) {
  const {
    cache = createCache<string>({
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

    const url = readUrl(request)
    const query = url.searchParams.get('q')?.trim() ?? ''
    if (!query || query.length > MAX_QUERY_LENGTH) {
      sendJson(response, 400, {
        error: `Informe uma busca de até ${MAX_QUERY_LENGTH} caracteres.`,
      })
      return
    }

    const duration = url.searchParams.get('duration')?.trim() ?? ''
    if (duration && !DURACOES.includes(duration)) {
      sendJson(response, 400, { error: 'Filtro de duração inválido.' })
      return
    }

    const chave = cacheKey(query, duration)
    const guardada = cache.get(chave)
    if (guardada !== undefined) {
      response.setHeader('X-Cache', 'HIT')
      sendJson(response, 200, JSON.parse(guardada))
      return
    }
    response.setHeader('X-Cache', 'MISS')

    const key = apiKey()
    if (!key) {
      sendJson(response, 503, {
        error: 'A busca está sem configuração no servidor (YOUTUBE_API_KEY).',
      })
      return
    }

    const limite = limiter.take(clientIp(request))
    if (!limite.allowed) {
      response.setHeader(
        'Retry-After',
        String(Math.max(1, Math.ceil(limite.retryAfterMs / 1000))),
      )
      sendJson(response, 429, {
        error:
          'Muitas buscas seguidas. Espere alguns segundos e tente de novo.',
      })
      return
    }

    // Cobrado adiantado, e sem estorno se o Google falhar: no pior caso a conta
    // fica pessimista, o que é o lado certo de errar quando a moeda acaba antes
    // do culto.
    const custo = QUOTA_COST.SEARCH + QUOTA_COST.VIDEO_DETAILS
    if (!ledger.spend(custo)) {
      sendJson(response, 429, {
        error:
          'A busca atingiu o limite diário do YouTube. Cole o link do vídeo na aba Fila.',
      })
      return
    }

    try {
      const encontrados = await searchVideos({
        apiKey: key,
        query,
        duration: (duration || undefined) as VideoDuration | undefined,
        fetchImpl,
        timeoutMs,
      })
      const detalhes = await fetchVideoDetails({
        apiKey: key,
        ids: encontrados.map((item) => item.id),
        fetchImpl,
        timeoutMs,
      })

      const items: VideoResult[] = withDurations(encontrados, detalhes)
      const body = JSON.stringify({ items })
      cache.set(chave, body)
      sendJson(response, 200, { items })
    } catch (error) {
      if (error instanceof YouTubeApiError && error.quotaExceeded) {
        sendJson(response, 429, {
          error:
            'A cota diária de busca do YouTube acabou. Cole o link do vídeo na aba Fila.',
        })
        return
      }
      console.error('Falha na busca do YouTube:', error)
      sendJson(response, 502, {
        error: 'Não foi possível consultar o YouTube agora. Tente novamente.',
      })
    }
  }
}

/**
 * A chave do cache.
 *
 * Normalizar caixa e espaços faz "Piano Worship" e "piano  worship" caírem na
 * mesma entrada — e é isso que transforma uma busca paga em resposta gratuita
 * para as próximas. Não entra identificação de quem chamou de propósito: o
 * valor do cache está justamente em ser compartilhado.
 */
export function cacheKey(query: string, duration: string): string {
  return `${duration}:${query.toLowerCase().replace(/\s+/g, ' ').trim()}`
}
