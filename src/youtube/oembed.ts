/**
 * O cliente do `GET /api/youtube/oembed` — o que preenche o título de um link
 * colado (RF-01.2) e avisa de embed bloqueado antes do culto (RF-01.3).
 *
 * A regra que organiza este arquivo: **descobrir o título não pode atrapalhar
 * adicionar à fila.** O operador cola o link, aperta Adicionar e o item aparece
 * na hora, com o nome que ele digitou; o título chega depois, quando chegar. Se
 * a rede estiver ruim, ou o endpoint não existir naquele servidor, o item
 * continua lá e continua tocando — só com o rótulo genérico de sempre.
 *
 * É por isso que a função abaixo **não lança**: ela devolve `null` e quem chama
 * segue a vida. É o oposto da regra do player (RNF-03.3), e de propósito — lá o
 * silêncio é a falha; aqui a falha é cosmética.
 */

/** Onde o backend responde. */
export const OEMBED_ENDPOINT = '/api/youtube/oembed'

/** Curto: é enfeite chegando por cima de um item que já está na fila. */
export const OEMBED_TIMEOUT_MS = 6_000

/** O que se descobre sobre um vídeo colado. */
export interface VideoInfo {
  videoId: string
  title: string
  channel: string
  thumbnailUrl?: string
  /** Segundos; 0 quando não foi possível descobrir. */
  durationSec: number
  /** `false` só quando o YouTube afirmou que o vídeo não pode ser incorporado. */
  embeddable: boolean
}

export interface FetchVideoInfoOptions {
  videoId: string
  signal?: AbortSignal
  /** Trocado nos testes; no app é o `fetch` do navegador. */
  fetchImpl?: typeof fetch
  timeoutMs?: number
}

/**
 * Busca o que se sabe sobre um vídeo. Devolve `null` em **qualquer** tropeço —
 * endpoint ausente, rede caída, vídeo removido, resposta estranha.
 */
export async function fetchVideoInfo(
  options: FetchVideoInfoOptions,
): Promise<VideoInfo | null> {
  const {
    videoId,
    signal,
    fetchImpl = globalThis.fetch,
    timeoutMs = OEMBED_TIMEOUT_MS,
  } = options

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const forwardAbort = (): void => controller.abort()
  signal?.addEventListener('abort', forwardAbort)

  try {
    const params = new URLSearchParams({ id: videoId })
    const response = await fetchImpl(`${OEMBED_ENDPOINT}?${params}`, {
      signal: controller.signal,
      headers: { accept: 'application/json' },
    })
    if (!response.ok) return null

    const payload: unknown = await response.json()
    return toVideoInfo(videoId, payload)
  } catch {
    return null
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', forwardAbort)
  }
}

/**
 * Converte a resposta do servidor, descartando o que vier torto.
 *
 * Sem título não há informação nenhuma a acrescentar — devolver um objeto com
 * `title: ''` só trocaria "Vídeo do YouTube" por uma linha vazia na fila.
 */
function toVideoInfo(videoId: string, payload: unknown): VideoInfo | null {
  if (typeof payload !== 'object' || payload === null) return null
  const raw = payload as Record<string, unknown>

  const title = typeof raw.title === 'string' ? raw.title.trim() : ''
  if (!title) return null

  return {
    videoId,
    title,
    channel: typeof raw.channel === 'string' ? raw.channel : '',
    thumbnailUrl:
      typeof raw.thumbnail === 'string' && raw.thumbnail
        ? raw.thumbnail
        : undefined,
    durationSec:
      typeof raw.duration === 'number' && Number.isFinite(raw.duration)
        ? raw.duration
        : 0,
    embeddable: raw.embeddable !== false,
  }
}
