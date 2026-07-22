# `features/search/` — busca de músicas

UI da busca no YouTube (RF-02): termo livre, até 10 resultados incorporáveis,
adicionar direto à fila. Estados de carregamento e erro em pt-BR.

| Arquivo                                    | O que faz                                                 |
| ------------------------------------------ | --------------------------------------------------------- |
| [SearchTab.tsx](SearchTab.tsx)             | A aba Buscar música.                                      |
| [useYouTubeSearch.ts](useYouTubeSearch.ts) | **Um hook só, parametrizado** — a aba Fundos usa o mesmo. |

`useYouTubeSearch` é o lado de UI do RNF-01.3: a diferença entre buscar música e
buscar fundo é o parâmetro `duration: 'long'`, e nada mais. O cliente HTTP em si
está em [`youtube/search.ts`](../../youtube/search.ts).

> Preenchido na **Etapa 4**; o endpoint que ele consome é a **Etapa 5**.
