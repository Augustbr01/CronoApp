# `features/queue/` — fila e histórico

Fila de participantes como um **pool** (tocar qualquer item a qualquer momento —
RF-01.7, o requisito central do produto): adicionar, reordenar (drag-and-drop),
renomear inline, remover. Histórico "Já cantaram" agrupado por culto/sessão
(RF-06).

| Arquivo                              | O que faz                                                      |
| ------------------------------------ | -------------------------------------------------------------- |
| [QueueTab.tsx](QueueTab.tsx)         | A aba: lista + formulário de adicionar, com validação do link. |
| [QueueCard.tsx](QueueCard.tsx)       | Um participante: tocar, renomear, remover, arrastar.           |
| [HistoryPanel.tsx](HistoryPanel.tsx) | "Já tocou" — as músicas do culto corrente.                     |

> Preenchido na **Etapa 4**.
