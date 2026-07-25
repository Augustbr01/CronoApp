import type { StateCreator } from 'zustand'
import { createId } from '../ids'
import type { Background, BackgroundMediaSource } from '../types'
import type { StoreState } from '../types-store'

/**
 * A biblioteca de fundos (RF-03).
 *
 * Duas regras daqui foram validadas no protótipo e são fáceis de quebrar sem
 * querer, por isso estão testadas uma a uma:
 *
 * - **A primeira faixa da biblioteca vazia já entra tocando** (RF-03.4) — o
 *   operador acabou de montar o culto e não deveria precisar de um segundo
 *   clique. Mas **não** se houver louvor no ar: nada atropela o louvor.
 * - **Com uma faixa só, "mixar" reinicia a mesma** (RF-03.6) em vez de tentar
 *   avançar para um vizinho que não existe.
 */

/**
 * O que se informa ao guardar uma faixa; o resto o store preenche.
 *
 * Composto a partir de `BackgroundMediaSource` (e não `Omit<Background, …>`)
 * pelo mesmo motivo do `NewQueueItem`: `Omit` sobre uma union discriminada
 * perderia o `videoId`/`blobId` de cada variante.
 */
export type NewBackground = {
  title: string
  durationSec?: number
} & BackgroundMediaSource

export interface BackgroundSlice {
  backgrounds: Background[]
  selectedBackgroundId: string | null
  /**
   * Sobe de 1 a cada pedido de tocar o fundo do começo. É o sinal que faz a
   * faixa **reiniciar** quando ela é a única da biblioteca (RF-03.6): o id
   * selecionado não muda, então sem este contador ninguém saberia que houve um
   * pedido novo.
   */
  backgroundCue: number
  addBackground(background: NewBackground): string
  removeBackground(id: string): void
  selectBackground(id: string): void
  /** Avança para a próxima faixa; com uma só, reinicia (RF-03.5 e RF-03.6). */
  nextBackground(): void
  /** Anota a duração que o player descobriu ao carregar a faixa. */
  setBackgroundDuration(id: string, durationSec: number): void
  selectedBackground(): Background | null
}

export const createBackgroundSlice: StateCreator<
  StoreState,
  [],
  [],
  BackgroundSlice
> = (set, get) => ({
  backgrounds: [],
  selectedBackgroundId: null,
  backgroundCue: 0,

  addBackground(background) {
    const id = createId('bg')
    const entry: Background = { ...background, id, addedAt: Date.now() }
    const wasEmpty = get().backgrounds.length === 0
    const mainOnAir = get().mode === 'main'

    set((state) => ({
      backgrounds: [...state.backgrounds, entry],
      // Primeira faixa da biblioteca vazia: entra selecionada (RF-03.4).
      selectedBackgroundId: wasEmpty ? id : state.selectedBackgroundId,
    }))

    // ...e já toca, a menos que o louvor esteja no ar.
    if (wasEmpty && !mainOnAir) get().playBackground()

    return id
  },

  removeBackground(id) {
    const { backgrounds, selectedBackgroundId } = get()
    const remaining = backgrounds.filter((item) => item.id !== id)

    if (selectedBackgroundId !== id) {
      set({ backgrounds: remaining })
      return
    }

    // Saiu a faixa que estava selecionada: assume a seguinte da lista — ou a
    // anterior, se ela era a última.
    const removedIndex = backgrounds.findIndex((item) => item.id === id)
    const next = remaining[removedIndex] ?? remaining[remaining.length - 1]

    set({
      backgrounds: remaining,
      selectedBackgroundId: next?.id ?? null,
    })

    if (!next) {
      // Biblioteca vazia: não há o que tocar de fundo. Se ele estava no ar,
      // o app cai para standby em vez de fingir que ainda tem trilha.
      if (get().mode === 'background') set({ mode: 'silence' })
      return
    }

    if (get().mode === 'background')
      set((s) => ({ backgroundCue: s.backgroundCue + 1 }))
  },

  selectBackground(id) {
    if (!get().backgrounds.some((item) => item.id === id)) return
    set((state) => ({
      selectedBackgroundId: id,
      backgroundCue: state.backgroundCue + 1,
    }))
  },

  nextBackground() {
    const { backgrounds, selectedBackgroundId } = get()
    if (backgrounds.length === 0) return

    const current = backgrounds.findIndex(
      (item) => item.id === selectedBackgroundId,
    )
    // Com uma faixa só, o próximo é ela mesma — o cue é o que a reinicia.
    const next = backgrounds[(current + 1) % backgrounds.length]
    if (!next) return

    set((state) => ({
      selectedBackgroundId: next.id,
      backgroundCue: state.backgroundCue + 1,
    }))
  },

  setBackgroundDuration(id, durationSec) {
    if (!Number.isFinite(durationSec) || durationSec <= 0) return
    set((state) => ({
      backgrounds: state.backgrounds.map((item) =>
        item.id === id ? { ...item, durationSec } : item,
      ),
    }))
  },

  selectedBackground() {
    const { backgrounds, selectedBackgroundId } = get()
    return backgrounds.find((item) => item.id === selectedBackgroundId) ?? null
  },
})
