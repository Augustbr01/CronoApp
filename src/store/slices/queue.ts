import type { StateCreator } from 'zustand'
import { createId } from '../ids'
import type { QueueItem, QueueMediaSource } from '../types'
import type { StoreState } from '../types-store'

/**
 * A fila de participantes (RF-01).
 *
 * O requisito central do produto: a fila é um **pool**, não uma sequência. O
 * operador toca qualquer item a qualquer momento, porque culto é improviso
 * (RF-01.7). Por isso não existe "próximo" implícito na posição — existe "o
 * primeiro que ainda não cantou", que é coisa diferente.
 */

/**
 * O que se informa ao adicionar; o resto o store preenche.
 *
 * Carrega a mesma union de `QueueItem` (`kind:'youtube'` ou `kind:'local'`) —
 * daí não ser um `Omit`: `Omit` sobre uma union discriminada colapsa nos campos
 * comuns e perde `videoId`/`blobId`. Compondo a partir de `QueueMediaSource`,
 * cada variante mantém os seus.
 */
export type NewQueueItem = {
  name: string
  title: string
  durationSec?: number
} & QueueMediaSource

/** O que o oEmbed descobre sobre um item que já está na fila (RF-01.2). */
export interface QueueItemInfo {
  title?: string
  durationSec?: number
  thumbnailUrl?: string
  embedBlocked?: boolean
}

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
   * Anota a duração que o player descobriu ao carregar o vídeo. É a fonte de
   * quem foi adicionado pela busca; para quem foi colado, o oEmbed já traz o
   * número antes de tocar (RF-01.2).
   */
  setQueueItemDuration(id: string, durationSec: number): void
  /**
   * Preenche o que o oEmbed descobriu depois que o item já entrou na fila
   * (RF-01.2 e RF-01.3).
   *
   * Chega **depois** de propósito: o item aparece na hora em que o operador
   * aperta Adicionar, e o título desce por cima quando a rede responder. Se não
   * responder, fica o rótulo genérico e nada quebra.
   *
   * Não mexe no `name`: aquele é do operador, e sobrescrever o que ele digitou
   * seria o app achando que sabe mais do que ele.
   */
  describeQueueItem(id: string, info: QueueItemInfo): void
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

  describeQueueItem(id, info) {
    set((state) => ({
      queue: state.queue.map((item) => {
        if (item.id !== id) return item

        // Campo a campo, e só o que veio de verdade: uma resposta parcial não
        // pode apagar o que já se sabia. Título vazio, em especial, deixaria a
        // linha da fila sem rótulo nenhum.
        const title = info.title?.trim()
        const durationSec =
          typeof info.durationSec === 'number' &&
          Number.isFinite(info.durationSec) &&
          info.durationSec > 0
            ? info.durationSec
            : item.durationSec

        // `thumbnailUrl`/`embedBlocked` são do oEmbed, que só existe para
        // YouTube — um item local ignora esses campos (nem os tem no tipo).
        if (item.kind === 'youtube') {
          return {
            ...item,
            title: title || item.title,
            durationSec,
            thumbnailUrl: info.thumbnailUrl ?? item.thumbnailUrl,
            embedBlocked:
              info.embedBlocked !== undefined
                ? info.embedBlocked
                : item.embedBlocked,
          }
        }
        return { ...item, title: title || item.title, durationSec }
      }),
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
