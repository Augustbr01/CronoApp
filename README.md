# CronoApp

Painel de operação de som para culto ao vivo. O operador mantém uma **fila** de
quem vai cantar (com link do YouTube) e uma **trilha de fundo** que entra e sai
sozinha com fade — sem corte seco, sem silêncio abrupto e, rodando no perfil do
Chrome com YouTube Premium logado, sem anúncio no meio do culto.

Esta é a reescrita v1, que mantém o comportamento validado pelo protótipo e
reconstrói a fundação com testes, documentação e uma arquitetura por domínio.

## Stack

- **Vite + React 19 + TypeScript estrito** (`strict: true`, zero `any`)
- **Zustand** para estado de domínio, persistido em **IndexedDB** (via `idb`)
- **YouTube IFrame Player API** direta (sem `react-player` — corta ~1,4 MB de
  HLS/DASH nunca usados)
- CSS artesanal com custom properties (sem framework de utilitários)
- **Vitest + Testing Library + Playwright** para testes; **ESLint + Prettier**

## Requisitos

- Node.js 22+
- npm 10+

## Instalação

```bash
npm install
cp .env.example .env   # preencha YOUTUBE_API_KEY (ver abaixo)
npm run dev
```

## Variáveis de ambiente

| Variável          | Onde é lida | Descrição                                                   |
| ----------------- | ----------- | ----------------------------------------------------------- |
| `YOUTUBE_API_KEY` | Só servidor | Chave da YouTube Data API v3 para o endpoint `/api/youtube` |



## Scripts

| Comando                 | O que faz                                     |
| ----------------------- | --------------------------------------------- |
| `npm run dev`           | Servidor de desenvolvimento (Vite)            |
| `npm run build`         | Typecheck + build de produção                 |
| `npm run preview`       | Serve o build de produção localmente          |
| `npm run typecheck`     | Verificação de tipos (sem emitir)             |
| `npm run lint`          | ESLint                                        |
| `npm run format`        | Prettier (escreve)                            |
| `npm run format:check`  | Prettier (só verifica)                        |
| `npm run test`          | Testes unitários/componente (Vitest, uma vez) |
| `npm run test:watch`    | Vitest em modo watch                          |
| `npm run test:coverage` | Vitest com cobertura                          |
| `npm run test:e2e`      | Testes end-to-end (Playwright)                |

## Arquitetura

Estrutura por domínio 

```
src/
  audio/       motor de mixagem — fade, crossfade, composição de volume
  youtube/     cliente de busca, wrapper da IFrame API, oEmbed
  store/       slices Zustand + persistência IndexedDB + migrações
  features/    queue · search · backgrounds · mixer
  shared/      componentes de UI, hooks, utilitários
```

## Estado do desenvolvimento

- [x] **Etapa 1 — Fundação**: scaffold, TS estrito, ESLint + Prettier, Vitest +
      Testing Library + Playwright, CI, estrutura por domínio, documentação.
- [ ] Etapa 2 — Motor de áudio isolado e testado
- [ ] Etapa 3 — Domínio e persistência (IndexedDB)
- [ ] Etapa 4 — Interface
- [ ] Etapa 5 — Backend de busca
- [ ] Etapa 6 — Endurecimento e entrega
