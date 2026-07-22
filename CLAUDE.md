# CLAUDE.md

Guia de arquitetura, decisões e limitações do CronoApp para agentes e humanos.

## O que é

Painel de operação de som para culto ao vivo. Um operador na mesa de som mantém
uma fila de participantes (cada um com um vídeo do YouTube) e uma trilha de
fundo. O motor de áudio faz o louvor entrar e sair com fade e o fundo retornar
sozinho, sem corte seco. Roda como PWA no Chrome, onde o YouTube Premium já está
logado — é isso que garante ausência de anúncios durante o culto.

## Princípios de arquitetura

Estrutura **por domínio**, não por tipo de arquivo. A regra que orienta tudo:

1. **O motor de áudio (`src/audio/`) não conhece React, store nem UI.** É lógica
   pura sobre tempo e valores, testável com timers falsos e sem DOM (RNF-01.1).
2. **Fade é genérico por canal.** Nada de duplicar a rampa de `main` e `bg`
   (RNF-01.2).
3. **Busca no YouTube tem uma implementação só, parametrizada** (RNF-01.3).
4. **Nenhum componente concentra UI + regra de negócio** como o `App.tsx` de 721
   linhas do protótipo (RNF-01.4).

```
src/
  audio/       motor de mixagem — fade, crossfade, composição de volume
  youtube/     cliente de busca, wrapper da IFrame API, oEmbed
  store/       slices Zustand + persistência IndexedDB + migrações
  features/
    queue/       fila e histórico
    search/      busca de músicas
    backgrounds/ biblioteca de fundos
    mixer/       faders, meters, transporte
  shared/      componentes de UI, hooks, utilitários

server/        backend de busca — cache, limite por IP, cota, Data API, oEmbed
api/           entrypoints da Vercel: cinco linhas cada, apontando pra server/
e2e/           Playwright sobre o app construído — fluxo crítico, a11y, layout
scripts/       verificações de entrega (orçamento de bundle)
```

Fluxo de dependência: `features/*` e a UI dependem de `audio/`, `youtube/` e
`store/`; nunca o contrário. `audio/` não importa nada dos outros três.

`server/` e `src/` não se importam **em nenhuma direção**. A fronteira entre os
dois é HTTP, e é ela que mantém a `YOUTUBE_API_KEY` fora do bundle (RNF-06.4) —
confira com `npm run build` e um `grep` em `dist/assets`.

## Convenções

- TypeScript `strict: true`, **zero `any`** (RNF-02.1). Padrão herdado do
  protótipo — preservá-lo é regra, não meta.
- Todo `setTimeout`/`setInterval`/`requestAnimationFrame` precisa de limpeza
  correta (RNF-04.2).
- Erros do player são visíveis ao operador, nunca silenciados com
  `.catch(() => {})` (RNF-03.3).
- Prettier formata; ESLint (com `eslint-config-prettier`) não briga com ele.

## Comandos

`npm run typecheck && npm run lint && npm run test` devem passar limpos ao fim de
cada etapa. Ver a tabela de scripts no [README](README.md).

## Decisões de arquitetura (ADRs)

As quatro decisões já fechadas estão registradas em [`adr/`](adr/):

1. [PWA no Chrome, não Electron/Tauri](adr/0001-pwa-no-chrome.md)
2. [YouTube IFrame API no lugar do react-player](adr/0002-youtube-iframe-api.md)
3. [Persistência local em IndexedDB](adr/0003-persistencia-indexeddb.md)
4. [Alvo desktop-first e implantação na Vercel](adr/0004-alvo-e-implantacao.md)
5. [PWA instalável, mas sem service worker](adr/0005-sem-service-worker.md)

## Limitações conhecidas

- **Depende de internet** — é streaming do YouTube. O plano B do operador é o
  hotspot do celular; a perda de conexão deve ser detectada e comunicada
  (RNF-03.4). O app instala como PWA mas **não abre offline**, e isso é decisão,
  não pendência: uma casca que abre sem poder tocar mentiria no pior momento
  (ADR [0005](adr/0005-sem-service-worker.md)).
- **Sem contas e sem nuvem.** Os dados vivem no dispositivo (IndexedDB).
  Backup/portabilidade é feito por export/import JSON (RF-09.4).
- **O iframe do YouTube não permite `setSinkId`** — não há seleção real de saída
  de áudio na v1. Só se torna possível com fundo por MP3 local (roadmap pós-v1).
- **Alvo é Chrome desktop.** Tablet não pode quebrar, mas não é o alvo primário
  (RNF-06.2).

## Etapas

Reescrita em 6 etapas (plano completo em `docs/`, mantido fora do git), todas
entregues: fundação, motor de áudio, domínio e persistência, interface, backend
de busca e endurecimento. As pastas de domínio trazem um `README.md` dizendo o
que mora ali.

Falta o **ensaio real**: rodar um culto inteiro em paralelo com o método atual
antes de aposentar o protótipo. Nenhuma suíte substitui isso.

O que o CI verifica a cada push, além de typecheck, lint e formato: 397 testes
unitários e de componente, 13 end-to-end sobre o app **construído** (fluxo
crítico, acessibilidade nos dois temas e integridade do layout) e o orçamento de
bundle do RNF-04.1.
