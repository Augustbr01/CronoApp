/**
 * O mínimo de HTTP que os endpoints precisam.
 *
 * Em vez de receber `IncomingMessage`/`ServerResponse` do Node, os handlers
 * recebem estas duas interfaces — **só o pedaço que eles de fato usam**. É a
 * mesma escolha do [`src/youtube/types.ts`](../src/youtube/types.ts) diante do
 * `window.YT`, e ela compra duas coisas:
 *
 * 1. Os tipos do Node satisfazem estas interfaces por estrutura, então o
 *    entrypoint da Vercel entrega o request de verdade sem cast nenhum.
 * 2. O teste monta um objeto literal de três campos, sem subir servidor e sem
 *    `any` (RNF-02.1).
 */

/** O que um endpoint lê da requisição. */
export interface HttpRequest {
  method?: string | undefined
  url?: string | undefined
  headers: Record<string, string | string[] | undefined>
  socket?: { remoteAddress?: string | undefined }
}

/** O que um endpoint escreve na resposta. */
export interface HttpResponse {
  statusCode: number
  setHeader(name: string, value: string): unknown
  end(body: string): unknown
}

/**
 * Monta a URL da requisição.
 *
 * `request.url` no Node é só o caminho (`/api/…?q=x`), sem esquema nem host — a
 * `URL` não aceita isso sozinha. O host da requisição completa o endereço; o
 * `localhost` cobre o caso de ele não vir.
 */
export function readUrl(request: HttpRequest): URL {
  const host = request.headers.host
  const base = typeof host === 'string' && host ? host : 'localhost'
  return new URL(request.url ?? '/', `http://${base}`)
}

/** Responde JSON, sempre com charset — acento em mensagem de erro é regra aqui. */
export function sendJson(
  response: HttpResponse,
  status: number,
  payload: unknown,
): void {
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.statusCode = status
  response.end(JSON.stringify(payload))
}

/**
 * Quem está chamando, para efeito de limite por IP.
 *
 * Atrás de proxy — que é o caso da Vercel — o endereço do socket é o do proxy,
 * igual para todo mundo; o IP de verdade vem no `x-forwarded-for`, cujo
 * **primeiro** item é o cliente original (os seguintes são os proxies do
 * caminho). Sem nenhum dos dois, todo mundo cai no mesmo balde `desconhecido`,
 * que é o lado seguro de errar: limita demais em vez de não limitar nada.
 */
export function clientIp(request: HttpRequest): string {
  const forwarded = request.headers['x-forwarded-for']
  const primeiro = Array.isArray(forwarded) ? forwarded[0] : forwarded
  const candidato = primeiro?.split(',')[0]?.trim()
  if (candidato) return candidato
  return request.socket?.remoteAddress ?? 'desconhecido'
}
