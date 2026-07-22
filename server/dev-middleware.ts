import type { IncomingMessage, ServerResponse } from 'node:http'
import { loadEnv } from 'vite'
import type { Connect, Plugin, ViteDevServer } from 'vite'

/**
 * Serve `/api/*` durante o `npm run dev`.
 *
 * Em produção quem roteia `api/` é a Vercel. No desenvolvimento não existe
 * ninguém fazendo isso, e sem este plugin o `fetch('/api/youtube/search')` cai
 * no `index.html` do SPA — o operador vê "a busca ainda não está disponível
 * neste servidor" numa máquina onde ela está.
 *
 * Os handlers são carregados pelo `ssrLoadModule` do Vite, e não por `import`
 * comum, para pegarem recarga a quente: editar o endpoint vale na requisição
 * seguinte, sem reiniciar o servidor.
 */

/** Caminho da URL → módulo que responde por ele. */
const ROTAS: Record<string, string> = {
  '/api/youtube/search': '/api/youtube/search.ts',
  '/api/youtube/oembed': '/api/youtube/oembed.ts',
}

/**
 * Os objetos do Node entram direto: eles satisfazem por estrutura o
 * `HttpRequest`/`HttpResponse` que os endpoints declaram — que é exatamente o
 * motivo de aquelas interfaces existirem.
 */
type Handler = (
  request: IncomingMessage,
  response: ServerResponse,
) => void | Promise<void>

export function apiDevServer(): Plugin {
  return {
    name: 'cronoapp:api-dev-server',
    apply: 'serve',

    /**
     * Põe o `.env` no `process.env` do processo do servidor.
     *
     * O Vite lê o `.env`, mas só entrega ao **cliente** o que tem prefixo
     * `VITE_` — e não popula o `process.env` de quem roda o dev server. Como os
     * endpoints leem `process.env.YOUTUBE_API_KEY` (que é como a Vercel entrega
     * em produção), sem esta ponte a busca responde 503 numa máquina com a
     * chave configurada, e o sintoma acusa a chave em vez do encanamento.
     *
     * O prefixo vazio carrega tudo, e isso é seguro **aqui** porque nada disto
     * passa por `define`: fica no processo Node, longe do bundle (RNF-06.4). O
     * `??=` deixa o ambiente de verdade ganhar do arquivo.
     */
    config(_config, { mode }) {
      for (const [chave, valor] of Object.entries(
        loadEnv(mode, process.cwd(), ''),
      )) {
        process.env[chave] ??= valor
      }
    },

    configureServer(server: ViteDevServer) {
      server.middlewares.use(
        (request, response, next: Connect.NextFunction) => {
          const caminho = (request.url ?? '').split('?')[0] ?? ''
          const modulo = ROTAS[caminho]
          if (!modulo) {
            next()
            return
          }

          void (async () => {
            try {
              const carregado: unknown = await server.ssrLoadModule(modulo)
              const handler = (carregado as { default?: Handler }).default
              if (typeof handler !== 'function') {
                throw new Error(`${modulo} não exporta um handler padrão.`)
              }
              await handler(request, response)
            } catch (error) {
              // Em desenvolvimento o erro é para **você**, não para o operador:
              // aparece inteiro no terminal e volta como JSON legível na aba de
              // rede, em vez de virar um 500 mudo.
              server.config.logger.error(
                `[api] falha em ${caminho}: ${String(error)}`,
              )
              response.statusCode = 500
              response.setHeader(
                'Content-Type',
                'application/json; charset=utf-8',
              )
              response.end(JSON.stringify({ error: String(error) }))
            }
          })()
        },
      )
    },
  }
}
