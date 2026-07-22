/**
 * O cliente de oEmbed do YouTube.
 *
 * Três coisas o separam da Data API, e as três importam:
 *
 * 1. **Não custa cota.** oEmbed não é a Data API — não tem chave, não tem
 *    unidade, não tem limite diário. Colar um link é de graça, e é por isso que
 *    ele é o caminho a incentivar quando a busca acabar (ver `quota.ts`).
 * 2. **Não precisa de configuração.** Um deploy sem `YOUTUBE_API_KEY` continua
 *    preenchendo o título de quem cola link — o app degrada, não quebra.
 * 3. **Precisa passar pelo servidor mesmo assim.** O endereço do oEmbed não
 *    manda cabeçalho de CORS permissivo, então o navegador não consegue chamá-lo
 *    direto. Aqui ele é proxy, não guardião de segredo.
 *
 * O que ele **não** dá é duração — isso só vem do `videos.list`.
 */

const OEMBED_URL = 'https://www.youtube.com/oembed'

export const OEMBED_TIMEOUT_MS = 6_000

/** O que o oEmbed sabe sobre um vídeo. */
export interface OembedInfo {
  title: string
  channel: string
  thumbnail?: string
}

/** O vídeo não existe, está privado ou foi removido. */
export class VideoNotFoundError extends Error {
  constructor() {
    super('Vídeo não encontrado — pode ter sido removido ou está privado.')
    this.name = 'VideoNotFoundError'
  }
}

/** O dono desligou a incorporação — o vídeo existe, mas não toca aqui. */
export class EmbedBlockedError extends Error {
  constructor() {
    super(
      'O dono deste vídeo não permite reprodução fora do YouTube. Escolha outra versão.',
    )
    this.name = 'EmbedBlockedError'
  }
}

/** Falha de rede ou do próprio oEmbed. */
export class OembedError extends Error {}

interface OembedPayload {
  title?: unknown
  author_name?: unknown
  thumbnail_url?: unknown
}

export async function fetchOembed(options: {
  videoId: string
  fetchImpl?: typeof fetch
  timeoutMs?: number
}): Promise<OembedInfo> {
  const {
    videoId,
    fetchImpl = globalThis.fetch,
    timeoutMs = OEMBED_TIMEOUT_MS,
  } = options

  const params = new URLSearchParams({
    url: `https://www.youtube.com/watch?v=${videoId}`,
    format: 'json',
  })

  let response: Response
  try {
    response = await fetchImpl(`${OEMBED_URL}?${params}`, {
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch {
    throw new OembedError('O YouTube não respondeu a tempo.')
  }

  // **400**, e não 404, é o que o oEmbed devolve para um id que não existe —
  // conferido contra o YouTube de verdade, porque a suposição óbvia (404)
  // estava errada e transformava "vídeo removido" num 502 genérico. Como o id
  // já chega validado no formato, um 400 aqui só pode significar que não há
  // vídeo do outro lado.
  //
  // 401 é vídeo privado e 404 aparece em alguns casos: as três respostas pedem
  // a mesma frase — procure outro vídeo.
  if ([400, 401, 404].includes(response.status)) {
    throw new VideoNotFoundError()
  }
  // 403 é o caso em que o vídeo existe e o dono desligou a incorporação. Merece
  // frase própria: a saída do operador é trocar de versão da música, não de
  // link (RF-01.3).
  if (response.status === 403) {
    throw new EmbedBlockedError()
  }
  if (!response.ok) {
    throw new OembedError(`O YouTube respondeu com ${response.status}.`)
  }

  const payload = (await response.json()) as OembedPayload
  return {
    title:
      typeof payload.title === 'string' && payload.title
        ? payload.title
        : 'Vídeo do YouTube',
    channel: typeof payload.author_name === 'string' ? payload.author_name : '',
    thumbnail:
      typeof payload.thumbnail_url === 'string' && payload.thumbnail_url
        ? payload.thumbnail_url
        : undefined,
  }
}
