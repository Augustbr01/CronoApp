import { SEARCH_ENDPOINT, SearchError, searchYouTube } from './search'

/** Uma resposta de mentira, com o corpo que o backend da Etapa 5 vai devolver. */
function respostaJson(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

const ITEM = {
  id: 'dQw4w9WgXcQ',
  title: 'Porque Ele Vive',
  channel: 'Canal Gospel',
  thumbnail: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/default.jpg',
  duration: 254,
}

describe('uma implementação só, parametrizada (RNF-01.3)', () => {
  it('busca música sem filtro de duração', async () => {
    const chamadas: string[] = []
    const fetchImpl = vi.fn((url: string | URL | Request) => {
      chamadas.push(String(url))
      return Promise.resolve(respostaJson({ items: [ITEM] }))
    }) as unknown as typeof fetch

    const results = await searchYouTube({ query: 'porque ele vive', fetchImpl })

    expect(chamadas[0]).toBe(`${SEARCH_ENDPOINT}?q=porque+ele+vive`)
    expect(results).toEqual([
      {
        videoId: 'dQw4w9WgXcQ',
        title: 'Porque Ele Vive',
        channelTitle: 'Canal Gospel',
        thumbnailUrl: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/default.jpg',
        durationSec: 254,
      },
    ])
  })

  it('busca fundo é a MESMA busca com o filtro de vídeo longo (RF-03.1)', async () => {
    const chamadas: string[] = []
    const fetchImpl = vi.fn((url: string | URL | Request) => {
      chamadas.push(String(url))
      return Promise.resolve(respostaJson({ items: [] }))
    }) as unknown as typeof fetch

    await searchYouTube({ query: 'piano worship', duration: 'long', fetchImpl })

    expect(chamadas[0]).toBe(`${SEARCH_ENDPOINT}?q=piano+worship&duration=long`)
  })

  it('não chama o servidor com termo vazio', async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch

    expect(await searchYouTube({ query: '   ', fetchImpl })).toEqual([])
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})

describe('erros com frase de gente (RNF-03.3)', () => {
  it('usa a mensagem que o servidor mandou, quando ele manda uma', async () => {
    const fetchImpl = (() =>
      Promise.resolve(
        respostaJson({ error: 'Consulta muito longa.' }, 400),
      )) as unknown as typeof fetch

    await expect(
      searchYouTube({ query: 'x'.repeat(200), fetchImpl }),
    ).rejects.toThrow('Consulta muito longa.')
  })

  it('o endpoint que ainda não existe (Etapa 5) manda colar o link', async () => {
    // Sem o backend, o SPA responde o index.html: HTML com status 404.
    const fetchImpl = (() =>
      Promise.resolve(
        new Response('<!doctype html>', { status: 404 }),
      )) as unknown as typeof fetch

    await expect(searchYouTube({ query: 'louvor', fetchImpl })).rejects.toThrow(
      /Cole o link do YouTube/,
    )
  })

  it('resposta 200 com HTML no lugar de JSON não vira lista mentirosa', async () => {
    const fetchImpl = (() =>
      Promise.resolve(
        new Response('<!doctype html>', { status: 200 }),
      )) as unknown as typeof fetch

    expect(await searchYouTube({ query: 'louvor', fetchImpl })).toEqual([])
  })

  it('sem rede, avisa da conexão', async () => {
    const fetchImpl = (() =>
      Promise.reject(
        new TypeError('Failed to fetch'),
      )) as unknown as typeof fetch

    await expect(searchYouTube({ query: 'louvor', fetchImpl })).rejects.toThrow(
      /Verifique a conexão/,
    )
  })

  it('desiste sozinha se o servidor não responder', async () => {
    const fetchImpl = ((_url: string, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('Aborted', 'AbortError'))
        })
      })) as unknown as typeof fetch

    await expect(
      searchYouTube({ query: 'louvor', fetchImpl, timeoutMs: 5 }),
    ).rejects.toThrow(/demorou demais/)
  })

  it('o erro carrega o status, para a UI decidir sem ler a frase', async () => {
    const fetchImpl = (() =>
      Promise.resolve(respostaJson({}, 503))) as unknown as typeof fetch

    const erro = await searchYouTube({ query: 'louvor', fetchImpl }).catch(
      (e: unknown) => e,
    )

    expect(erro).toBeInstanceOf(SearchError)
    expect((erro as SearchError).status).toBe(503)
  })
})

describe('resultados sujos', () => {
  it('descarta entrada sem vídeo e preenche o que falta', async () => {
    const fetchImpl = (() =>
      Promise.resolve(
        respostaJson({
          items: [{ title: 'sem id' }, null, { id: 'abc12345678' }, ITEM],
        }),
      )) as unknown as typeof fetch

    const results = await searchYouTube({ query: 'louvor', fetchImpl })

    expect(results.map((r) => r.videoId)).toEqual(['abc12345678', ITEM.id])
    expect(results[0]).toMatchObject({
      title: 'Vídeo do YouTube',
      channelTitle: '',
      durationSec: 0,
      thumbnailUrl: undefined,
    })
  })
})
