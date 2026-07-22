/**
 * Extração do id de um vídeo a partir do que o operador cola.
 *
 * O que chega na caixa "Cole o link do YouTube" nunca é um id limpo: é o que o
 * Chrome copiou da barra de endereço, o que o WhatsApp encurtou, ou o que veio
 * do botão "compartilhar" com `?si=` grudado no fim. O CronoApp precisa do id de
 * 11 caracteres — é o que a IFrame API aceita.
 *
 * Não usamos `new URL()` sozinho porque o operador também cola o id puro e
 * links sem `https://`. A função aceita todas as formas e devolve `null` quando
 * não reconhece — quem chama transforma isso em aviso na tela, nunca em erro
 * silencioso.
 */

/** Um id de vídeo do YouTube: 11 caracteres do alfabeto base64url. */
const VIDEO_ID = /^[\w-]{11}$/

/** Hosts que servem vídeo do YouTube, com e sem `www`/`m`. */
const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtube-nocookie.com',
  'www.youtube-nocookie.com',
  'youtu.be',
  'www.youtu.be',
])

/** Caminhos em que o id é o último segmento: `/embed/ID`, `/shorts/ID`, `/v/ID`. */
const PATH_PREFIXES = ['/embed/', '/shorts/', '/v/', '/live/']

/**
 * Devolve o id do vídeo, ou `null` se o texto não for reconhecível.
 *
 * Aceita: id puro, `youtu.be/ID`, `youtube.com/watch?v=ID`, `/embed/ID`,
 * `/shorts/ID`, `/live/ID`, com ou sem protocolo, com qualquer parâmetro extra.
 */
export function parseVideoId(input: string): string | null {
  const text = input.trim()
  if (!text) return null

  // O caso mais simples: o operador colou só o id.
  if (VIDEO_ID.test(text)) return text

  const url = toUrl(text)
  if (!url) return null
  if (!YOUTUBE_HOSTS.has(url.hostname.toLowerCase())) return null

  // youtu.be/ID — o id é o próprio caminho.
  if (url.hostname.toLowerCase().endsWith('youtu.be')) {
    return firstSegment(url.pathname)
  }

  const fromQuery = url.searchParams.get('v')
  if (fromQuery && VIDEO_ID.test(fromQuery)) return fromQuery

  const prefix = PATH_PREFIXES.find((candidate) =>
    url.pathname.startsWith(candidate),
  )
  if (prefix) return firstSegment(url.pathname.slice(prefix.length - 1))

  return null
}

/** `true` quando o texto contém um link/id de vídeo aproveitável. */
export function isVideoUrl(input: string): boolean {
  return parseVideoId(input) !== null
}

/** O endereço público do vídeo — o que se guarda num backup legível. */
export function watchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`
}

function toUrl(text: string): URL | null {
  // Sem protocolo o `URL` não parseia; `youtube.com/watch?v=…` é colagem comum.
  const candidate = /^[a-z][\w+.-]*:\/\//i.test(text) ? text : `https://${text}`
  try {
    return new URL(candidate)
  } catch {
    return null
  }
}

function firstSegment(pathname: string): string | null {
  const segment = pathname.split('/').find(Boolean)
  return segment && VIDEO_ID.test(segment) ? segment : null
}
