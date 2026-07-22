import { durationToSeconds } from './duration'

/**
 * O cliente da YouTube Data API v3 — o único lugar do projeto que fala com o
 * Google.
 *
 * Mora no servidor porque a chave mora no servidor (RNF-06.4): ela nunca pode
 * chegar ao navegador, onde qualquer um a copia e drena a cota alheia.
 *
 * A rede entra por parâmetro (`fetchImpl`) pelo mesmo motivo que o player entra
 * por parâmetro no motor de áudio: teste que depende do YouTube estar no ar não
 * é teste.
 */

/** A busca e os detalhes têm o mesmo endereço-base. */
const API_BASE = 'https://www.googleapis.com/youtube/v3'

/** Quanto esperar o Google antes de desistir (RF-10.2). */
export const YOUTUBE_TIMEOUT_MS = 8_000

/** O filtro de duração aceito pela API — `long` é > 20 min (RF-03.1). */
export type VideoDuration = 'any' | 'short' | 'medium' | 'long'

/** Um vídeo, já no formato que o cliente do navegador consome. */
export interface VideoResult {
  id: string
  title: string
  channel: string
  thumbnail?: string
  /** Segundos; 0 quando a API não informou. */
  duration: number
}

/** O que os detalhes acrescentam a um vídeo já encontrado. */
export interface VideoDetails {
  durationSec: number
  /**
   * O dono permite tocar fora do YouTube?
   *
   * É o que separa "vídeo que vai funcionar no culto" de "vídeo que vai dar
   * erro 101 na frente de todo mundo" (RF-01.3).
   */
  embeddable: boolean
}

/**
 * Falha vinda do Google, com o bastante para o endpoint escolher o status.
 *
 * `quotaExceeded` merece campo próprio porque pede uma frase diferente das
 * outras: não adianta o operador tentar de novo em dez segundos — a cota só
 * volta no dia seguinte, e a saída dele é colar o link.
 */
export class YouTubeApiError extends Error {
  readonly status: number
  readonly quotaExceeded: boolean

  constructor(message: string, status: number, quotaExceeded = false) {
    super(message)
    this.name = 'YouTubeApiError'
    this.status = status
    this.quotaExceeded = quotaExceeded
  }
}

export interface DataApiOptions {
  apiKey: string
  /** Trocado nos testes; em produção é o `fetch` do Node. */
  fetchImpl?: typeof fetch
  timeoutMs?: number
}

interface SearchItem {
  id?: { videoId?: string }
  snippet?: {
    title?: string
    channelTitle?: string
    thumbnails?: {
      medium?: { url?: string }
      default?: { url?: string }
    }
  }
}

interface DetailsItem {
  id?: string
  contentDetails?: { duration?: string }
  status?: { embeddable?: boolean }
}

/**
 * Busca vídeos incorporáveis (RF-02.1, RF-02.2).
 *
 * `videoEmbeddable=true` é filtro do lado do Google: vídeo que não pode ser
 * incorporado nem aparece na lista. Sem ele, o operador escolheria no sábado um
 * vídeo que só falha no domingo.
 *
 * Custa **100 unidades** de cota por chamada — é a chamada cara do projeto, e a
 * razão de existirem o cache e o contador.
 */
export async function searchVideos(
  options: DataApiOptions & { query: string; duration?: VideoDuration },
): Promise<VideoResult[]> {
  const { apiKey, query, duration, fetchImpl, timeoutMs } = options

  const params = new URLSearchParams({
    key: apiKey,
    part: 'snippet',
    type: 'video',
    videoEmbeddable: 'true',
    maxResults: '10',
    q: query,
  })
  if (duration && duration !== 'any') params.set('videoDuration', duration)

  const payload = await getJson<{ items?: SearchItem[] }>(
    `${API_BASE}/search?${params}`,
    { fetchImpl, timeoutMs },
  )

  return (payload.items ?? []).flatMap((item): VideoResult[] => {
    const id = item.id?.videoId
    if (!id) return []
    return [
      {
        id,
        title: item.snippet?.title ?? 'Vídeo do YouTube',
        channel: item.snippet?.channelTitle ?? '',
        thumbnail:
          item.snippet?.thumbnails?.medium?.url ??
          item.snippet?.thumbnails?.default?.url,
        duration: 0,
      },
    ]
  })
}

/**
 * Duração e permissão de incorporar, de até 50 vídeos de uma vez.
 *
 * A busca não devolve nenhum dos dois, então é preciso uma segunda chamada —
 * mas ela custa **1 unidade** para o lote inteiro, contra as 100 da busca. É a
 * chamada barata, e é ela que responde tanto o RF-01.2 (duração ao colar link)
 * quanto o RF-01.3 (avisar do embed bloqueado antes do culto).
 */
export async function fetchVideoDetails(
  options: DataApiOptions & { ids: readonly string[] },
): Promise<Map<string, VideoDetails>> {
  const { apiKey, ids, fetchImpl, timeoutMs } = options
  const detalhes = new Map<string, VideoDetails>()
  if (ids.length === 0) return detalhes

  const params = new URLSearchParams({
    key: apiKey,
    part: 'contentDetails,status',
    id: ids.join(','),
  })

  const payload = await getJson<{ items?: DetailsItem[] }>(
    `${API_BASE}/videos?${params}`,
    { fetchImpl, timeoutMs },
  )

  for (const item of payload.items ?? []) {
    if (!item.id) continue
    detalhes.set(item.id, {
      durationSec: durationToSeconds(item.contentDetails?.duration),
      // Ausência de resposta é tratada como "pode": recusar por omissão faria o
      // app esconder vídeo bom.
      embeddable: item.status?.embeddable !== false,
    })
  }

  return detalhes
}

/** Junta o resultado da busca com a duração de cada vídeo. */
export function withDurations(
  results: readonly VideoResult[],
  detalhes: ReadonlyMap<string, VideoDetails>,
): VideoResult[] {
  return results.map((result) => ({
    ...result,
    duration: detalhes.get(result.id)?.durationSec ?? 0,
  }))
}

/**
 * Uma chamada GET à API, com prazo e com erro tipado.
 *
 * O `403 quotaExceeded` é separado dos outros aqui porque o Google o entrega
 * como um 403 comum — quem não olhar o corpo confunde "acabou a cota do dia"
 * com "chave inválida", que pedem reações opostas.
 */
async function getJson<T>(
  url: string,
  options: { fetchImpl?: typeof fetch; timeoutMs?: number },
): Promise<T> {
  const { fetchImpl = globalThis.fetch, timeoutMs = YOUTUBE_TIMEOUT_MS } =
    options

  let response: Response
  try {
    response = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs) })
  } catch {
    throw new YouTubeApiError('O YouTube não respondeu a tempo.', 504)
  }

  if (!response.ok) {
    const motivo = await readErrorReason(response)
    if (motivo === 'quotaExceeded' || motivo === 'dailyLimitExceeded') {
      throw new YouTubeApiError(
        'A cota diária de busca do YouTube acabou.',
        response.status,
        true,
      )
    }
    throw new YouTubeApiError(
      `O YouTube respondeu com ${response.status}.`,
      response.status,
    )
  }

  return (await response.json()) as T
}

/** Lê o `reason` do erro do Google sem explodir se o corpo não for o esperado. */
async function readErrorReason(response: Response): Promise<string | null> {
  try {
    const corpo = (await response.json()) as {
      error?: { errors?: { reason?: string }[] }
    }
    return corpo.error?.errors?.[0]?.reason ?? null
  } catch {
    return null
  }
}
