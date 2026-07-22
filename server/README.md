# `server/` — o backend de busca

O único lugar do projeto que conhece a `YOUTUBE_API_KEY`. Ela nunca chega ao
navegador (RNF-06.4): quem fala com o Google é daqui.

## Por que existe separado de `api/`

`api/` é a convenção de roteamento da Vercel — cada arquivo lá vira uma função
publicada. Se a regra morasse dentro dele, testá-la exigiria subir servidor.

Então `api/youtube/search.ts` tem cinco linhas e só diz **quem** responde;
`server/` tem a regra inteira, com `HttpRequest`/`HttpResponse` tipando apenas a
superfície que os handlers usam. Os objetos do Node satisfazem essas interfaces
por estrutura, então o entrypoint entrega o request de verdade sem cast — e o
teste monta um objeto literal de três campos.

## Mapa dos arquivos

| Arquivo                                                  | O que faz                                                          |
| -------------------------------------------------------- | ------------------------------------------------------------------ |
| [http.ts](http.ts)                                       | URL, JSON, IP do cliente — e os tipos mínimos de request/response. |
| [cache.ts](cache.ts)                                     | Cache com prazo e teto, descartando a menos usada.                 |
| [rate-limit.ts](rate-limit.ts)                           | Janela deslizante por IP (RF-10.5).                                |
| [quota.ts](quota.ts)                                     | Contador da cota diária, virando o dia no fuso do Pacífico.        |
| [dev-middleware.ts](dev-middleware.ts)                   | Serve `/api/*` no `npm run dev`; inerte no build.                  |
| [youtube/data-api.ts](youtube/data-api.ts)               | `search.list` e `videos.list`, com erro tipado.                    |
| [youtube/duration.ts](youtube/duration.ts)               | Duração ISO 8601 → segundos.                                       |
| [youtube/oembed.ts](youtube/oembed.ts)                   | oEmbed: título e canal, de graça e sem chave.                      |
| [youtube/search-endpoint.ts](youtube/search-endpoint.ts) | `GET /api/youtube/search` (RF-10).                                 |
| [youtube/oembed-endpoint.ts](youtube/oembed-endpoint.ts) | `GET /api/youtube/oembed` (RF-01.2, RF-01.3).                      |

## O número que explica o resto

A cota da YouTube Data API é de **10.000 unidades por dia, por projeto**, e cada
`search.list` custa **100**. São menos de cem buscas por dia — somando todos os
usuários. É desse número que saem as três defesas:

- **cache** antes de tudo, para busca repetida sair de graça;
- **limite por IP**, para um laço acidental não drenar o dia em minutos;
- **contador de cota**, para o teto ser descoberto por uma frase acionável
  ("cole o link do YouTube") e não pelo `quotaExceeded` do Google no meio do
  culto.

A ordem em que essas três aparecem no endpoint de busca não é a óbvia — o cache
vem **antes** do limite, de propósito. Está explicado no cabeçalho do
[search-endpoint.ts](youtube/search-endpoint.ts).

O oEmbed não é a Data API: não tem chave, não tem cota. Por isso um deploy sem
`YOUTUBE_API_KEY` continua preenchendo o título de quem cola link — perde só a
duração. Degradar é melhor do que recusar.

## Conferindo

```bash
npm run dev
curl -i 'http://localhost:5173/api/youtube/oembed?id=dQw4w9WgXcQ'   # 200, X-Cache: MISS
curl -i 'http://localhost:5173/api/youtube/oembed?id=dQw4w9WgXcQ'   # 200, X-Cache: HIT
curl -X POST 'http://localhost:5173/api/youtube/search?q=piano'     # 405
curl 'http://localhost:5173/api/youtube/search?q='                  # 400
curl 'http://localhost:5173/api/youtube/search?q=piano'             # 503 sem a chave
```

> Preenchido na **Etapa 5**.
