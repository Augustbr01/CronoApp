# `store/` — domínio e persistência

Slices Zustand espelhando o modelo de domínio: `PlayerMode`, fila, histórico,
fundos, volumes, preferências — com `partialize`.

- Persistência em **IndexedDB** via `idb` (RF-09.1).
- Migração de schema versionada (RF-09.2).
- Migração automática de `localStorage` (`cronoapp-sound-panel`) → IndexedDB na
  primeira execução (RF-09.3).
- Export/import JSON (RF-09.4).

## Mapa dos arquivos

| Arquivo                          | O que faz                                                                                |
| -------------------------------- | ---------------------------------------------------------------------------------------- |
| [types.ts](types.ts)             | O vocabulário do culto em tipos: fila, histórico, fundos, preferências.                  |
| [index.ts](index.ts)             | Junta as fatias, liga o `persist` e decide o que **não** se persiste.                    |
| [slices/](slices/)               | Uma fatia por assunto: fila, fundos, transporte, histórico, preferências, import/export. |
| [normalize.ts](normalize.ts)     | A muralha entre o disco e o app: tudo que vem de fora passa por aqui.                    |
| [idb-storage.ts](idb-storage.ts) | O backend IndexedDB, com a cara de `localStorage` que o `persist` espera.                |
| [legacy.ts](legacy.ts)           | O resgate dos dados do protótipo (RF-09.3).                                              |
| [backup.ts](backup.ts)           | Arquivo JSON de backup (RF-09.4).                                                        |

O store guarda **intenção**, não som: quem transforma modo e faders em áudio é o
motor da [Etapa 2](../audio/README.md), costurado pelo
[`features/mixer/engine.ts`](../features/mixer/engine.ts). Nenhuma fatia importa
`audio/` ou `youtube/`.

A única exceção ao isolamento fica no [legacy.ts](legacy.ts), que usa
`parseVideoId` de [`youtube/video-id.ts`](../youtube/video-id.ts) — a fila do
protótipo guarda o **link inteiro** e alguém tem que saber ler um endereço do
YouTube. É função pura, sem DOM e sem rede.

> Preenchido na **Etapa 3**; tradutor do schema v4 do protótipo na **Etapa 4**
> (correção C4).
