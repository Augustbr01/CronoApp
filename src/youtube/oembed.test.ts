import { fetchVideoInfo } from './oembed'

/**
 * O cliente do oEmbed.
 *
 * Quase todo teste aqui confere a mesma coisa por ângulos diferentes: **falhar
 * devolve `null`, nunca lança.** É o contrato que permite ao formulário da fila
 * pedir o título sem nunca arriscar o item que o operador acabou de adicionar.
 */

function respondendo(body: unknown, status = 200): typeof fetch {
  return (() =>
    Promise.resolve(
      new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      }),
    )) as unknown as typeof fetch
}

const RESPOSTA = {
  id: 'dQw4w9WgXcQ',
  title: 'Porque Ele Vive',
  channel: 'Canal do Louvor',
  thumbnail: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
  duration: 253,
  embeddable: true,
}

describe('fetchVideoInfo', () => {
  it('traz o que o servidor descobriu sobre o vídeo', async () => {
    const info = await fetchVideoInfo({
      videoId: 'dQw4w9WgXcQ',
      fetchImpl: respondendo(RESPOSTA),
    })

    expect(info).toEqual({
      videoId: 'dQw4w9WgXcQ',
      title: 'Porque Ele Vive',
      channel: 'Canal do Louvor',
      thumbnailUrl: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
      durationSec: 253,
      embeddable: true,
    })
  })

  it('manda o id na query, e nada mais', async () => {
    let chamada = ''
    const fetchImpl = ((url: string) => {
      chamada = url
      return Promise.resolve(new Response(JSON.stringify(RESPOSTA)))
    }) as unknown as typeof fetch

    await fetchVideoInfo({ videoId: 'dQw4w9WgXcQ', fetchImpl })

    expect(chamada).toBe('/api/youtube/oembed?id=dQw4w9WgXcQ')
  })

  it('repassa o aviso de embed bloqueado (RF-01.3)', async () => {
    const info = await fetchVideoInfo({
      videoId: 'dQw4w9WgXcQ',
      fetchImpl: respondendo({ ...RESPOSTA, embeddable: false }),
    })

    expect(info?.embeddable).toBe(false)
  })

  it('sem o endpoint no servidor, devolve null em vez de explodir', async () => {
    // É o 404 que vira o index.html do SPA num deploy sem a Etapa 5.
    const info = await fetchVideoInfo({
      videoId: 'dQw4w9WgXcQ',
      fetchImpl: respondendo({ error: 'nao existe' }, 404),
    })

    expect(info).toBeNull()
  })

  it('rede caída devolve null, sem lançar', async () => {
    const fetchImpl = (() =>
      Promise.reject(new Error('offline'))) as unknown as typeof fetch

    await expect(
      fetchVideoInfo({ videoId: 'dQw4w9WgXcQ', fetchImpl }),
    ).resolves.toBeNull()
  })

  it('resposta que não é JSON devolve null', async () => {
    const fetchImpl = (() =>
      Promise.resolve(
        new Response('<!doctype html>'),
      )) as unknown as typeof fetch

    await expect(
      fetchVideoInfo({ videoId: 'dQw4w9WgXcQ', fetchImpl }),
    ).resolves.toBeNull()
  })

  it('resposta sem título devolve null — não há o que acrescentar', async () => {
    const info = await fetchVideoInfo({
      videoId: 'dQw4w9WgXcQ',
      fetchImpl: respondendo({ ...RESPOSTA, title: '   ' }),
    })

    // Trocar "Vídeo do YouTube" por uma linha em branco seria piorar.
    expect(info).toBeNull()
  })

  it('desiste sozinho quando o servidor não responde', async () => {
    const fetchImpl = ((_url: string, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () =>
          reject(new Error('abortado')),
        )
      })) as unknown as typeof fetch

    const info = await fetchVideoInfo({
      videoId: 'dQw4w9WgXcQ',
      fetchImpl,
      timeoutMs: 5,
    })

    expect(info).toBeNull()
  })
})
