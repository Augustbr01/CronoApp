# 0004 — Alvo desktop-first e implantação na Vercel

- **Status:** Aceito
- **Data:** 2026-07-20

## Contexto

O operador usa o notebook da mesa de som — uma tela larga, teclado disponível
para atalhos. Tablet aparece como cenário secundário e não pode quebrar, mas não
é o alvo. O app precisa de um único endpoint de servidor, apenas para esconder a
`YOUTUBE_API_KEY` e cachear buscas; um framework de backend seria peso morto.

## Decisão

Projetar **desktop-first** (layout íntegro de 1280 px para cima, tablet sem
quebras) e implantar na **Vercel**: a SPA como estática com fallback, mais uma
função serverless única em `api/youtube/` (Node puro, formato Vercel).

## Consequências

- Layout otimizado para tela larga com teclado (atalhos — RF-07); responsivo o
  bastante para não quebrar em tablet (RNF-06.2).
- A `YOUTUBE_API_KEY` vive **só no servidor**, nunca sob prefixo `VITE_`
  (RNF-06.4). Ver [`.env.example`](../.env.example).
- O SPA fallback da Vercel precisa preservar as rotas `/api/*` (RNF-06.3).
- Sem Express/Fastify: a lógica de busca cabe numa função só, com cache em
  memória e rate limiting por IP (RF-10).
