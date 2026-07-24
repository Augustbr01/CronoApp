import type { StateCreator } from 'zustand'
import { createId } from '../ids'
import { HISTORY_LIMIT } from '../types'
import type { HistoryEntry, QueueItem } from '../types'
import type { StoreState } from '../types-store'

/**
 * O histórico — "Já cantaram" (RF-06).
 *
 * O protótipo guardava as últimas 8 entradas, limite imposto pelo localStorage.
 * Com o IndexedDB isso deixa de ser um problema: guardamos até 500 e as
 * agrupamos **por culto** (RF-06.2), que é como o operador pensa — "o que
 * cantaram no domingo passado", não "as últimas oito músicas".
 */

/** Um culto: as músicas de uma sessão, da mais recente para a mais antiga. */
export interface HistorySession {
  sessionId: string
  /** Quando a primeira música daquele culto terminou. */
  startedAt: number
  entries: HistoryEntry[]
}

export interface HistorySlice {
  history: HistoryEntry[]
  /** O culto corrente. Todo item que termina é carimbado com ele. */
  sessionId: string
  /** Move um item da fila para o histórico. Chamado pelo `finish()`. */
  pushHistory(item: QueueItem): void
  removeFromHistory(id: string): void
  clearHistory(): void
  /** Começa um culto novo — o histórico anterior fica guardado e agrupado. */
  startNewSession(): void
  /** O histórico agrupado por culto, do mais recente para o mais antigo. */
  historyBySession(): HistorySession[]
}

export const createHistorySlice: StateCreator<
  StoreState,
  [],
  [],
  HistorySlice
> = (set, get) => ({
  history: [],
  sessionId: createId('s'),

  pushHistory(item) {
    const entry: HistoryEntry = {
      id: createId('h'),
      name: item.name,
      title: item.title,
      // O histórico é só nome/título/horário; um item local não tem vídeo, e o
      // campo (mantido por compatibilidade) fica vazio.
      videoId: item.kind === 'youtube' ? item.videoId : '',
      finishedAt: Date.now(),
      sessionId: get().sessionId,
    }
    // Mais recente primeiro, e o excedente cai pelo fim.
    set((state) => ({
      history: [entry, ...state.history].slice(0, HISTORY_LIMIT),
    }))
  },

  removeFromHistory(id) {
    set((state) => ({
      history: state.history.filter((entry) => entry.id !== id),
    }))
  },

  clearHistory() {
    set({ history: [] })
  },

  startNewSession() {
    set({ sessionId: createId('s') })
  },

  historyBySession() {
    const sessions = new Map<string, HistorySession>()

    for (const entry of get().history) {
      const session = sessions.get(entry.sessionId)
      if (session) {
        session.entries.push(entry)
        session.startedAt = Math.min(session.startedAt, entry.finishedAt)
      } else {
        sessions.set(entry.sessionId, {
          sessionId: entry.sessionId,
          startedAt: entry.finishedAt,
          entries: [entry],
        })
      }
    }

    return [...sessions.values()].sort((a, b) => b.startedAt - a.startedAt)
  },
})
