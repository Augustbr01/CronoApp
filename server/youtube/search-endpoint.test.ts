import { createCache } from '../cache'
import { createQuotaLedger } from '../quota'
import { createRateLimiter } from '../rate-limit'
import { fakeFetch, fakeRequest, fakeResponse } from '../test/fake-http'
import { cacheKey, createSearchEndpoint } from './search-endpoint'
import type { SearchEndpointDeps } from './search-endpoint'

/**
 * O endpoint de busca, testado sem servidor e sem YouTube.
 *
 * O que estes testes protegem é a **cota**: cada `search.list` custa 100 das
 * 10.000 unidades diárias, então cache que não guarda e limite que não limita
 * não são detalhes de robustez — são o culto de domingo sem busca.
 */

const RESPOSTA_DA_BUSCA = {
  items: [
    {
      id: { videoId: 'v-ana' },
      snippet: {
        title: 'Porque Ele Vive',
        channelTitle: 'Harpa',
        thumbnails: { medium: { url: 'https://i.ytimg.com/v-ana.jpg' } },
      },
    },
  ],
}

const RESPOSTA_DOS_DETALHES = {
  items: [
    {
      id: 'v-ana',
      contentDetails: { duration: 'PT4M13S' },
      status: { embeddable: true },
    },
  ],
}

/** Um endpoint com tudo trocado por dublê — e a chave sempre presente. */
function montar(deps: SearchEndpointDeps = {}) {
  return createSearchEndpoint({
    apiKey: () => 'chave-de-teste',
    fetchImpl: fakeFetch([
      { body: RESPOSTA_DA_BUSCA },
      { body: RESPOSTA_DOS_DETALHES },
    ]),
    ...deps,
  })
}

describe('validação da entrada (RF-10.2, RF-10.4)', () => {
  it('recusa método que não é GET com 405', async () => {
    const response = fakeResponse()

    await montar()(fakeRequest({ method: 'POST' }), response)

    expect(response.statusCode).toBe(405)
    expect(response.json().error).toBe('Método não permitido.')
  })

  it('recusa busca vazia com 400', async () => {
    const response = fakeResponse()

    await montar()(
      fakeRequest({ url: '/api/youtube/search?q=%20%20' }),
      response,
    )

    expect(response.statusCode).toBe(400)
  })

  it('recusa busca acima de 120 caracteres com 400', async () => {
    const response = fakeResponse()
    const gigante = 'a'.repeat(121)

    await montar()(
      fakeRequest({ url: `/api/youtube/search?q=${gigante}` }),
      response,
    )

    expect(response.statusCode).toBe(400)
    expect(response.json().error).toMatch(/120 caracteres/)
  })

  it('recusa filtro de duração que a API não conhece', async () => {
    const response = fakeResponse()

    await montar()(
      fakeRequest({ url: '/api/youtube/search?q=piano&duration=eterno' }),
      response,
    )

    expect(response.statusCode).toBe(400)
  })

  it('sem YOUTUBE_API_KEY responde 503, e diz o nome da variável', async () => {
    const response = fakeResponse()
    const endpoint = createSearchEndpoint({ apiKey: () => undefined })

    await endpoint(
      fakeRequest({ url: '/api/youtube/search?q=piano' }),
      response,
    )

    expect(response.statusCode).toBe(503)
    expect(response.json().error).toMatch(/YOUTUBE_API_KEY/)
  })
})

describe('a busca em si (RF-02.1, RF-02.2)', () => {
  it('devolve os resultados no formato que o cliente consome', async () => {
    const response = fakeResponse()

    await montar()(
      fakeRequest({ url: '/api/youtube/search?q=porque%20ele%20vive' }),
      response,
    )

    expect(response.statusCode).toBe(200)
    expect(response.json<{ items: unknown[] }>().items).toEqual([
      {
        id: 'v-ana',
        title: 'Porque Ele Vive',
        channel: 'Harpa',
        thumbnail: 'https://i.ytimg.com/v-ana.jpg',
        duration: 253,
      },
    ])
  })

  it('pede só vídeo incorporável e no máximo 10 — e busca a duração à parte', async () => {
    const fetchImpl = fakeFetch([
      { body: RESPOSTA_DA_BUSCA },
      { body: RESPOSTA_DOS_DETALHES },
    ])

    await montar({ fetchImpl })(
      fakeRequest({ url: '/api/youtube/search?q=piano' }),
      fakeResponse(),
    )

    expect(fetchImpl.calls[0]).toContain('videoEmbeddable=true')
    expect(fetchImpl.calls[0]).toContain('maxResults=10')
    // A busca não devolve duração: quem devolve é a chamada barata, de 1 unidade.
    expect(fetchImpl.calls[1]).toContain('/videos?')
    expect(fetchImpl.calls[1]).toContain('part=contentDetails%2Cstatus')
  })

  it('repassa o filtro de vídeo longo da aba Fundos (RF-03.1)', async () => {
    const fetchImpl = fakeFetch([
      { body: RESPOSTA_DA_BUSCA },
      { body: RESPOSTA_DOS_DETALHES },
    ])

    await montar({ fetchImpl })(
      fakeRequest({ url: '/api/youtube/search?q=piano&duration=long' }),
      fakeResponse(),
    )

    expect(fetchImpl.calls[0]).toContain('videoDuration=long')
  })

  it('falha do YouTube vira 502, não vaza o erro cru', async () => {
    const response = fakeResponse()
    const fetchImpl = fakeFetch([{ status: 500, body: { erro: 'interno' } }])

    await montar({ fetchImpl })(
      fakeRequest({ url: '/api/youtube/search?q=piano' }),
      response,
    )

    expect(response.statusCode).toBe(502)
    expect(response.json().error).toMatch(/Não foi possível consultar/)
  })

  it('cota estourada no Google vira frase acionável, não "erro 403"', async () => {
    const response = fakeResponse()
    const fetchImpl = fakeFetch([
      {
        status: 403,
        body: { error: { errors: [{ reason: 'quotaExceeded' }] } },
      },
    ])

    await montar({ fetchImpl })(
      fakeRequest({ url: '/api/youtube/search?q=piano' }),
      response,
    )

    expect(response.statusCode).toBe(429)
    // O operador precisa saber o que FAZER, e insistir não é a saída.
    expect(response.json().error).toMatch(/Cole o link/)
  })
})

describe('cache (RF-10.3)', () => {
  it('a segunda busca idêntica não chama o YouTube', async () => {
    const fetchImpl = fakeFetch([
      { body: RESPOSTA_DA_BUSCA },
      { body: RESPOSTA_DOS_DETALHES },
    ])
    const endpoint = montar({ fetchImpl })
    const primeira = fakeResponse()
    const segunda = fakeResponse()

    await endpoint(
      fakeRequest({ url: '/api/youtube/search?q=piano' }),
      primeira,
    )
    await endpoint(fakeRequest({ url: '/api/youtube/search?q=piano' }), segunda)

    // Duas chamadas ao Google na primeira busca, nenhuma na segunda: é isso que
    // faz 100 unidades virarem zero.
    expect(fetchImpl.calls).toHaveLength(2)
    expect(primeira.header('X-Cache')).toBe('MISS')
    expect(segunda.header('X-Cache')).toBe('HIT')
    expect(segunda.body).toBe(primeira.body)
  })

  it('a chave ignora caixa e espaço repetido, para o cache ser compartilhado', () => {
    expect(cacheKey('Piano  Worship ', '')).toBe(cacheKey('piano worship', ''))
    // Mas duração diferente é busca diferente.
    expect(cacheKey('piano', 'long')).not.toBe(cacheKey('piano', ''))
  })

  it('busca guardada responde mesmo sem chave de API configurada', async () => {
    const cache = createCache<string>({ ttlMs: 10_000, maxEntries: 10 })
    const response = fakeResponse()
    await montar({ cache })(
      fakeRequest({ url: '/api/youtube/search?q=piano' }),
      fakeResponse(),
    )

    // A chave sumiu do ambiente, mas a resposta já está guardada.
    const semChave = createSearchEndpoint({ cache, apiKey: () => undefined })
    await semChave(
      fakeRequest({ url: '/api/youtube/search?q=piano' }),
      response,
    )

    expect(response.statusCode).toBe(200)
  })
})

describe('limite por IP (RF-10.5)', () => {
  it('barra o excesso com 429 e diz quando voltar', async () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000 })
    const endpoint = montar({
      limiter,
      fetchImpl: fakeFetch([
        { body: RESPOSTA_DA_BUSCA },
        { body: RESPOSTA_DOS_DETALHES },
      ]),
    })
    await endpoint(
      fakeRequest({ url: '/api/youtube/search?q=piano', ip: '9.9.9.9' }),
      fakeResponse(),
    )

    const response = fakeResponse()
    await endpoint(
      fakeRequest({ url: '/api/youtube/search?q=harpa', ip: '9.9.9.9' }),
      response,
    )

    expect(response.statusCode).toBe(429)
    expect(Number(response.header('Retry-After'))).toBeGreaterThan(0)
  })

  it('repetir a MESMA busca não gasta o limite — ela sai do cache', async () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000 })
    const endpoint = montar({ limiter })
    await endpoint(
      fakeRequest({ url: '/api/youtube/search?q=piano', ip: '9.9.9.9' }),
      fakeResponse(),
    )

    // O operador clicando o mesmo chip de categoria de novo. Se isto fosse
    // barrado, o limite estaria punindo o uso normal em vez do abuso.
    const response = fakeResponse()
    await endpoint(
      fakeRequest({ url: '/api/youtube/search?q=piano', ip: '9.9.9.9' }),
      response,
    )

    expect(response.statusCode).toBe(200)
  })

  it('o limite é por IP: uma igreja não cala a outra', async () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000 })
    const endpoint = montar({
      limiter,
      fetchImpl: fakeFetch([
        { body: RESPOSTA_DA_BUSCA },
        { body: RESPOSTA_DOS_DETALHES },
        { body: RESPOSTA_DA_BUSCA },
        { body: RESPOSTA_DOS_DETALHES },
      ]),
    })
    await endpoint(
      fakeRequest({ url: '/api/youtube/search?q=piano', ip: '1.1.1.1' }),
      fakeResponse(),
    )

    const response = fakeResponse()
    await endpoint(
      fakeRequest({ url: '/api/youtube/search?q=harpa', ip: '2.2.2.2' }),
      response,
    )

    expect(response.statusCode).toBe(200)
  })
})

describe('cota diária do projeto', () => {
  it('para de buscar antes de o Google recusar, e explica a saída', async () => {
    // Cabe uma busca (101 unidades) e mais nada.
    const ledger = createQuotaLedger({ dailyLimit: 150, reserve: 0 })
    const endpoint = montar({ ledger })
    await endpoint(
      fakeRequest({ url: '/api/youtube/search?q=piano' }),
      fakeResponse(),
    )

    const response = fakeResponse()
    await endpoint(
      fakeRequest({ url: '/api/youtube/search?q=harpa' }),
      response,
    )

    expect(response.statusCode).toBe(429)
    expect(response.json().error).toMatch(/limite diário/)
    // E o operador tem o que fazer, em vez de ficar olhando pra tela.
    expect(response.json().error).toMatch(/Cole o link/)
  })
})
