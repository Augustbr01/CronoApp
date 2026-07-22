/**
 * O cliente de busca — **uma implementação só, parametrizada** (RNF-01.3).
 *
 * No protótipo havia dois blocos idênticos, `searchYouTube` e `searchBgYouTube`,
 * separados só porque o segundo mandava `duration=long`. A diferença entre
 * "buscar uma música" e "buscar um fundo de 3 horas" é **um parâmetro**, e é
 * assim que ela aparece aqui.
 *
 * A chave da API nunca chega ao cliente (RNF-06.4): quem fala com o YouTube é o
 * endpoint `/api/youtube/search`, que é a **Etapa 5**. Enquanto ele não existe,
 * a busca falha — e falha com uma frase que o operador entende, em vez de um
 * `SyntaxError` de JSON no console (RNF-03.3).
 */

/** Onde o backend responde (RF-10.1). */
export const SEARCH_ENDPOINT = '/api/youtube/search'

/** Quanto o operador espera antes de a busca desistir sozinha. */
export const SEARCH_TIMEOUT_MS = 10_000

/**
 * O filtro de duração do YouTube. `long` (> 20 min) é o que serve à biblioteca
 * de fundos, feita de coletâneas de 1 a 3 horas (RF-03.1).
 */
export type SearchDuration = 'any' | 'short' | 'medium' | 'long'

/** Um resultado, já do jeito que a lista da tela precisa. */
export interface SearchResult {
  videoId: string
  title: string
  channelTitle: string
  thumbnailUrl?: string
  /** Duração em segundos; 0 quando o backend não sabe. */
  durationSec: number
}

export interface SearchOptions {
  query: string
  /** `long` para a aba Fundos; omitido na busca de músicas. */
  duration?: SearchDuration
  /** Permite cancelar a busca quando o operador digita de novo. */
  signal?: AbortSignal
  /** Trocado nos testes; no app é o `fetch` do navegador. */
  fetchImpl?: typeof fetch
  timeoutMs?: number
}

/**
 * Erro de busca já mastigado para a tela.
 *
 * Existe como classe para a UI poder distinguir "o operador cancelou" de "deu
 * ruim" sem comparar strings de mensagem.
 */
export class SearchError extends Error {
  readonly status?: number

  constructor(message: string, status?: number) {
    super(message)
    this.name = 'SearchError'
    this.status = status
  }
}

/** Frases por código de resposta, na linguagem de quem está na mesa de som. */
function messageForStatus(status: number): string {
  if (status === 400) return 'Busca inválida. Tente outras palavras.'
  if (status === 404)
    return 'A busca ainda não está disponível neste servidor. Cole o link do YouTube na aba Fila.'
  if (status === 429)
    return 'Muitas buscas seguidas. Espere alguns segundos e tente de novo.'
  if (status === 503)
    return 'A busca está sem configuração no servidor. Avise quem cuida da instalação.'
  if (status >= 500)
    return 'O YouTube não respondeu à busca. Tente de novo em instantes.'
  return 'Não foi possível buscar no YouTube.'
}

/**
 * Busca vídeos. Devolve no máximo 10 resultados incorporáveis (RF-02.1/02.2 —
 * quem aplica esses dois limites é o backend, que conhece a API do YouTube).
 *
 * Lança `SearchError` com mensagem em pt-BR quando não dá — nunca devolve lista
 * vazia disfarçando um erro, porque "nada encontrado" e "a busca quebrou" pedem
 * reações diferentes do operador.
 */
export async function searchYouTube(
  options: SearchOptions,
): Promise<SearchResult[]> {
  const {
    query,
    duration,
    signal,
    fetchImpl = globalThis.fetch,
    timeoutMs = SEARCH_TIMEOUT_MS,
  } = options

  const termo = query.trim()
  if (!termo) return []

  const params = new URLSearchParams({ q: termo })
  if (duration && duration !== 'any') params.set('duration', duration)

  const controller = new AbortController()
  // Bandeira própria em vez de inspecionar o erro: `fetch` cancelado rejeita
  // com um `DOMException`, cuja identidade varia entre navegador e ambiente de
  // teste. Saber que **nós** desistimos é mais confiável do que adivinhar.
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)
  // Um cancelamento vindo de fora (o operador buscou outra coisa) também
  // aborta esta chamada.
  const forwardAbort = (): void => controller.abort()
  signal?.addEventListener('abort', forwardAbort)

  try {
    const response = await fetchImpl(`${SEARCH_ENDPOINT}?${params}`, {
      signal: controller.signal,
      headers: { accept: 'application/json' },
    })

    const payload = await readJson(response)

    if (!response.ok) {
      const doServidor =
        typeof payload?.error === 'string' ? payload.error : null
      throw new SearchError(
        doServidor ?? messageForStatus(response.status),
        response.status,
      )
    }

    return toResults(payload?.items)
  } catch (error) {
    if (error instanceof SearchError) throw error
    // Cancelamento pedido de fora não é falha: quem cancelou sabe o que fez.
    if (signal?.aborted) throw error
    if (timedOut) {
      throw new SearchError(
        'A busca demorou demais. Verifique a conexão e tente de novo.',
      )
    }
    throw new SearchError(
      'Não foi possível falar com o servidor de busca. Verifique a conexão.',
    )
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', forwardAbort)
  }
}

interface RawPayload {
  items?: unknown
  error?: unknown
}

/**
 * Lê o corpo como JSON sem explodir.
 *
 * Enquanto o endpoint da Etapa 5 não existe, a resposta é o `index.html` do SPA
 * — HTML, não JSON. Deixar o `SyntaxError` subir daria ao operador um erro que
 * não diz nada; aqui ele vira `null` e a mensagem de status assume.
 */
async function readJson(response: Response): Promise<RawPayload | null> {
  try {
    const value: unknown = await response.json()
    return typeof value === 'object' && value !== null
      ? (value as RawPayload)
      : null
  } catch {
    return null
  }
}

/** Converte o que veio do servidor, descartando entrada sem vídeo. */
function toResults(items: unknown): SearchResult[] {
  if (!Array.isArray(items)) return []

  return items.flatMap((item): SearchResult[] => {
    if (typeof item !== 'object' || item === null) return []
    const raw = item as Record<string, unknown>
    const videoId = typeof raw.id === 'string' ? raw.id : ''
    if (!videoId) return []

    return [
      {
        videoId,
        title: typeof raw.title === 'string' ? raw.title : 'Vídeo do YouTube',
        channelTitle: typeof raw.channel === 'string' ? raw.channel : '',
        thumbnailUrl:
          typeof raw.thumbnail === 'string' && raw.thumbnail
            ? raw.thumbnail
            : undefined,
        durationSec:
          typeof raw.duration === 'number' && Number.isFinite(raw.duration)
            ? raw.duration
            : 0,
      },
    ]
  })
}
