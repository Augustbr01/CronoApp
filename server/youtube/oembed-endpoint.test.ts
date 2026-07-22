import { createQuotaLedger } from '../quota'
import { fakeFetch, fakeRequest, fakeResponse } from '../test/fake-http'
import { createOembedEndpoint } from './oembed-endpoint'
import type { OembedEndpointDeps, OembedResponse } from './oembed-endpoint'

/**
 * O endpoint que preenche o título do link colado (RF-01.2).
 *
 * O teste que mais importa aqui é o da degradação: sem chave da Data API, ou
 * com a cota do dia no fim, ele ainda tem que responder o título. Recusar
 * porque falta o enfeite seria trocar "Vídeo do YouTube" por nada.
 */

const OEMBED = {
  title: 'Porque Ele Vive - Harpa Cristã',
  author_name: 'Canal do Louvor',
  thumbnail_url: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
}

const DETALHES = {
  items: [
    {
      id: 'dQw4w9WgXcQ',
      contentDetails: { duration: 'PT4M13S' },
      status: { embeddable: true },
    },
  ],
}

const URL_VALIDA = '/api/youtube/oembed?id=dQw4w9WgXcQ'

function montar(deps: OembedEndpointDeps = {}) {
  return createOembedEndpoint({
    apiKey: () => 'chave-de-teste',
    fetchImpl: fakeFetch([{ body: OEMBED }, { body: DETALHES }]),
    ...deps,
  })
}

describe('validação', () => {
  it('recusa método que não é GET', async () => {
    const response = fakeResponse()

    await montar()(fakeRequest({ method: 'POST', url: URL_VALIDA }), response)

    expect(response.statusCode).toBe(405)
  })

  it.each([
    ['vazio', ''],
    ['curto demais', 'abc'],
    ['longo demais', 'dQw4w9WgXcQextra'],
    ['com caractere que id do YouTube não tem', 'dQw4w9WgX!Q'],
    ['uma URL inteira, que é o que o cliente NÃO deve mandar', 'https://y'],
  ])('recusa id %s', async (_caso, id) => {
    const response = fakeResponse()

    await montar()(
      fakeRequest({ url: `/api/youtube/oembed?id=${encodeURIComponent(id)}` }),
      response,
    )

    expect(response.statusCode).toBe(400)
  })
})

describe('o link colado vira título e duração (RF-01.2)', () => {
  it('junta o oEmbed com os detalhes da Data API', async () => {
    const response = fakeResponse()

    await montar()(fakeRequest({ url: URL_VALIDA }), response)

    expect(response.statusCode).toBe(200)
    expect(response.json<OembedResponse>()).toEqual({
      id: 'dQw4w9WgXcQ',
      title: 'Porque Ele Vive - Harpa Cristã',
      channel: 'Canal do Louvor',
      thumbnail: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
      duration: 253,
      embeddable: true,
    })
  })

  it('avisa quando o dono bloqueou a reprodução fora do YouTube (RF-01.3)', async () => {
    const response = fakeResponse()
    const bloqueado = {
      items: [
        {
          id: 'dQw4w9WgXcQ',
          contentDetails: { duration: 'PT4M13S' },
          status: { embeddable: false },
        },
      ],
    }

    await montar({
      fetchImpl: fakeFetch([{ body: OEMBED }, { body: bloqueado }]),
    })(fakeRequest({ url: URL_VALIDA }), response)

    // Descobrir isto no sábado é muito melhor do que descobrir no domingo, com
    // o erro 101 na frente de todo mundo.
    expect(response.json<OembedResponse>().embeddable).toBe(false)
  })

  it.each([
    // 400 é o que o YouTube devolve de verdade para id inexistente —
    // conferido com curl. A suposição óbvia (404) fazia "vídeo removido" cair
    // no 502 genérico, e o operador não descobria que era só trocar de link.
    ['400, o caso real de id inexistente', 400],
    ['401, vídeo privado', 401],
    ['404', 404],
  ])(
    'vídeo indisponível (%s) vira 404 com frase, não 502',
    async (_c, status) => {
      const response = fakeResponse()

      await montar({ fetchImpl: fakeFetch([{ status, body: {} }]) })(
        fakeRequest({ url: URL_VALIDA }),
        response,
      )

      expect(response.statusCode).toBe(404)
      expect(response.json().error).toMatch(/removido|privado/)
    },
  )

  it('embed desligado pelo dono tem frase própria (RF-01.3)', async () => {
    const response = fakeResponse()

    await montar({ fetchImpl: fakeFetch([{ status: 403, body: {} }]) })(
      fakeRequest({ url: URL_VALIDA }),
      response,
    )

    // O vídeo existe; a saída é outra versão da música, não outro link.
    expect(response.json().error).toMatch(/não permite reprodução/)
  })
})

describe('degradação — o título é o que não pode faltar', () => {
  it('sem YOUTUBE_API_KEY ainda responde o título, com duração zero', async () => {
    const response = fakeResponse()

    // Só uma resposta enfileirada: se ele tentasse a Data API, estouraria.
    await montar({
      apiKey: () => undefined,
      fetchImpl: fakeFetch([{ body: OEMBED }]),
    })(fakeRequest({ url: URL_VALIDA }), response)

    expect(response.statusCode).toBe(200)
    expect(response.json<OembedResponse>().title).toBe(
      'Porque Ele Vive - Harpa Cristã',
    )
    expect(response.json<OembedResponse>().duration).toBe(0)
    expect(response.json<OembedResponse>().embeddable).toBe(true)
  })

  it('com a cota do dia no fim, o título continua vindo', async () => {
    const response = fakeResponse()
    const ledger = createQuotaLedger({ dailyLimit: 0, reserve: 0 })

    await montar({ ledger, fetchImpl: fakeFetch([{ body: OEMBED }]) })(
      fakeRequest({ url: URL_VALIDA }),
      response,
    )

    expect(response.statusCode).toBe(200)
    expect(response.json<OembedResponse>().duration).toBe(0)
  })

  it('falha só na chamada de duração não derruba a resposta', async () => {
    const response = fakeResponse()

    await montar({
      fetchImpl: fakeFetch([{ body: OEMBED }, { status: 500, body: {} }]),
    })(fakeRequest({ url: URL_VALIDA }), response)

    expect(response.statusCode).toBe(200)
    expect(response.json<OembedResponse>().title).toBe(
      'Porque Ele Vive - Harpa Cristã',
    )
    expect(response.json<OembedResponse>().duration).toBe(0)
  })

  it('a chamada barata usa a reserva que a busca não pode tocar', async () => {
    // 100 unidades no total, 100 reservadas: nenhuma busca cabe, mas ler a
    // duração de um link colado (1 unidade) ainda passa.
    const ledger = createQuotaLedger({ dailyLimit: 100, reserve: 100 })
    const response = fakeResponse()

    await montar({ ledger })(fakeRequest({ url: URL_VALIDA }), response)

    expect(response.json<OembedResponse>().duration).toBe(253)
  })
})

describe('cache', () => {
  it('o mesmo vídeo colado de novo não chama o YouTube', async () => {
    const fetchImpl = fakeFetch([{ body: OEMBED }, { body: DETALHES }])
    const endpoint = montar({ fetchImpl })
    await endpoint(fakeRequest({ url: URL_VALIDA }), fakeResponse())

    const response = fakeResponse()
    await endpoint(fakeRequest({ url: URL_VALIDA }), response)

    expect(fetchImpl.calls).toHaveLength(2)
    expect(response.header('X-Cache')).toBe('HIT')
    expect(response.json<OembedResponse>().duration).toBe(253)
  })
})
