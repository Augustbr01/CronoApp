import type { StateCreator } from 'zustand'
import { createId } from '../ids'
import type { QueueItem } from '../types'
import type { StoreState } from '../types-store'

/**
 * A fila de participantes (RF-01).
 *
 * O requisito central do produto: a fila é um **pool**, não uma sequência. O
 * operador toca qualquer item a qualquer momento, porque culto é improviso
 * (RF-01.7). Por isso não existe "próximo" implícito na posição — existe "o
 * primeiro que ainda não cantou", que é coisa diferente.
 */

/** O que se informa ao adicionar; o resto o store preenche. */
export type NewQueueItem = Omit<QueueItem, 'id' | 'addedAt'>

export interface QueueSlice {
  queue: QueueItem[]
  /** Adiciona ao fim da fila e devolve o id criado. */
  addToQueue(item: NewQueueItem): string
  removeFromQueue(id: string): void
  /** Renomeia quem vai cantar (RF-01.5). Nome vazio é ignorado. */
  renameQueueItem(id: string, name: string): void
  /** Move um item de posição, para o arrastar e soltar (RF-01.4). */
  reorderQueue(from: number, to: number): void
  /**
   * Anota a duração que o player descobriu ao carregar o vídeo. Até a Etapa 5
   * (oEmbed no momento de colar o link) é a única fonte real desse número.
   */
  setQueueItemDuration(id: string, durationSec: number): void
  clearQueue(): void
  /** O primeiro item da fila — o que o atalho "próxima" toca (RF-07.1). */
  nextInQueue(): QueueItem | null
  findQueueItem(id: string): QueueItem | null
}

export const createQueueSlice: StateCreator<StoreState, [], [], QueueSlice> = (
  set,
  get,
) => ({
  queue: [],

  addToQueue(item) {
    const id = createId('q')
    const entry: QueueItem = {
      ...item,
      id,
      name: item.name.trim() || 'Convidado',
      addedAt: Date.now(),
    }
    set((state) => ({ queue: [...state.queue, entry] }))
    return id
  },

  removeFromQueue(id) {
    // Tirar da fila quem está no ar tira do ar também: deixar tocando um item
    // que não existe mais deixaria a topbar mentindo.
    if (get().currentId === id) get().stop()
    set((state) => ({ queue: state.queue.filter((item) => item.id !== id) }))
  },

  renameQueueItem(id, name) {
    const trimmed = name.trim()
    if (!trimmed) return
    set((state) => ({
      queue: state.queue.map((item) =>
        item.id === id ? { ...item, name: trimmed } : item,
      ),
    }))
  },

  reorderQueue(from, to) {
    set((state) => {
      const queue = [...state.queue]
      if (
        from < 0 ||
        to < 0 ||
        from >= queue.length ||
        to >= queue.length ||
        from === to
      ) {
        return {}
      }
      const [moved] = queue.splice(from, 1)
      if (!moved) return {}
      queue.splice(to, 0, moved)
      return { queue }
    })
  },

  setQueueItemDuration(id, durationSec) {
    if (!Number.isFinite(durationSec) || durationSec <= 0) return
    set((state) => ({
      queue: state.queue.map((item) =>
        item.id === id ? { ...item, durationSec } : item,
      ),
    }))
  },

  clearQueue() {
    if (get().currentId !== null) get().stop()
    set({ queue: [] })
  },

  nextInQueue() {
    const { queue, currentId } = get()
    return queue.find((item) => item.id !== currentId) ?? null
  },

  findQueueItem(id) {
    return get().queue.find((item) => item.id === id) ?? null
  },
})
