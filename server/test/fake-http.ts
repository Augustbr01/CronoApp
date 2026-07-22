import type { HttpRequest, HttpResponse } from '../http'

/**
 * Requisição e resposta de mentira, para testar endpoint sem subir servidor.
 *
 * O que interessa é "que status saiu e com qual frase", não como o Node escreve
 * bytes no socket.
 */

export function fakeRequest(
  options: {
    method?: string
    url?: string
    ip?: string
    headers?: Record<string, string>
  } = {},
): HttpRequest {
  const { method = 'GET', url = '/api/youtube/search', ip, headers } = options
  return {
    method,
    url,
    headers: {
      host: 'cronoapp.test',
      ...(ip ? { 'x-forwarded-for': ip } : {}),
      ...headers,
    },
    socket: { remoteAddress: '127.0.0.1' },
  }
}

export interface FakeResponse extends HttpResponse {
  /** O corpo já desempacotado — é o que o teste quer ler. */
  json<T = Record<string, unknown>>(): T
  header(name: string): string | undefined
  readonly body: string
}

export function fakeResponse(): FakeResponse {
  const headers = new Map<string, string>()
  let body = ''

  return {
    statusCode: 200,
    setHeader(name, value) {
      headers.set(name.toLowerCase(), value)
    },
    end(chunk) {
      body = chunk
    },
    json<T = Record<string, unknown>>(): T {
      return JSON.parse(body) as T
    },
    header: (name) => headers.get(name.toLowerCase()),
    get body() {
      return body
    },
  }
}

/**
 * Um `fetch` de mentira que devolve as respostas na ordem em que foram
 * enfileiradas, guardando as URLs chamadas.
 *
 * A busca faz **duas** chamadas (a cara e a barata), então o teste precisa
 * enfileirar as duas — e conferir a ordem é o que prova que a segunda existe.
 */
export function fakeFetch(
  respostas: { status?: number; body: unknown }[],
): typeof fetch & { calls: string[] } {
  const calls: string[] = []
  const fila = [...respostas]

  const impl = (input: string | URL | Request): Promise<Response> => {
    calls.push(String(input))
    const proxima = fila.shift()
    if (!proxima) throw new Error('fakeFetch: chamada além do enfileirado')
    const { status = 200, body } = proxima
    return Promise.resolve(
      new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      }),
    )
  }

  return Object.assign(impl as unknown as typeof fetch, { calls })
}
