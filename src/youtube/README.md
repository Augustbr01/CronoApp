# `youtube/` — integração com o YouTube

| Arquivo                        | O que faz                                                                     |
| ------------------------------ | ----------------------------------------------------------------------------- |
| [api-loader.ts](api-loader.ts) | Injeta o script da IFrame API uma vez só, com prazo e falha em voz alta.      |
| [types.ts](types.ts)           | A superfície tipada do `window.YT` — só o pedaço que usamos, sem `any`.       |
| [errors.ts](errors.ts)         | Códigos de erro → frases acionáveis em pt-BR (RNF-03.3).                      |
| [player.ts](player.ts)         | O wrapper: volume em 0–1 e o cronômetro que transforma silêncio em erro.      |
| [search.ts](search.ts)         | Cliente de `GET /api/youtube/search` — **uma implementação parametrizada**.   |
| [video-id.ts](video-id.ts)     | Extrai o id do vídeo do que o operador cola (link curto, `watch?v=`, shorts). |

O wrapper substitui o `react-player` — é aqui que os ~1,4 MB de HLS/DASH
desaparecem (ADR 0002).

`search.ts` é o lado HTTP do RNF-01.3: buscar música e buscar fundo são a mesma
função, com um parâmetro de duração diferente. O **endpoint** que ela chama é a
Etapa 5; até lá a busca falha com uma frase que manda o operador colar o link na
aba Fila.

> Wrapper na **Etapa 2**; cliente de busca e extração de id na **Etapa 4**;
> endpoint e oEmbed (RF-01.2) na **Etapa 5**.
