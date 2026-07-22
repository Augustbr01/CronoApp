import type { StateCreator } from 'zustand'
import { DEFAULT_BACKGROUND_FADER, DEFAULT_MAIN_FADER } from '../types'
import type { PlayerMode } from '../types'
import type { StoreState } from '../types-store'

/**
 * O transporte: o que está no ar e os faders (RF-04.1, RF-05.1).
 *
 * Esta fatia guarda a **intenção** do operador — qual modo deveria estar no ar,
 * onde ele deixou os faders. Quem transforma isso em som é o motor da Etapa 2;
 * o store não conhece o mixer nem o YouTube. Manter essa fronteira é o que faz
 * as regras de culto serem testáveis sem tocar um áudio sequer.
 */

/** Prende o fader à escala do operador. */
function clampFader(value: number): number {
  if (Number.isNaN(value)) return 0
  return Math.max(0, Math.min(100, value))
}

export interface PlaybackSlice {
  mode: PlayerMode
  /** Item da fila que está no ar, ou `null` em standby. */
  currentId: string | null
  mainFader: number
  backgroundFader: number
  mainMuted: boolean
  backgroundMuted: boolean

  /** Põe um item da fila no ar (RF-01.7 — qualquer um, a qualquer momento). */
  play(id: string): void
  /** Toca a primeira da fila que ainda não está no ar (atalho `N`). */
  playNext(): void
  /**
   * Segura o louvor onde está (`Espaço`): sai do ar mas **continua sendo o
   * item corrente**, para o próximo `Espaço` continuar de onde parou. É a
   * diferença entre pausar e parar — parar solta a pessoa de volta na fila.
   */
  pauseMain(): void
  /** Volta a tocar o louvor pausado (`Espaço` de novo). */
  resumeMain(): void
  /** `true` quando há louvor pausado esperando o `Espaço`. */
  isMainPaused(): boolean
  /** Tira o louvor do ar sem marcá-lo como cantado (atalho `S`). */
  stop(): void
  /** A música terminou: sai da fila e vai para o histórico (RF-06.1). */
  finish(): void
  /** Põe o fundo no ar (atalho `B`, botão manual de voltar). */
  playBackground(): void
  /** Tira o fundo do ar. */
  stopBackground(): void
  /** Standby: nada no ar. */
  silence(): void

  setMainFader(value: number): void
  setBackgroundFader(value: number): void
  /** Soma um passo ao fader do fundo — as setas do teclado (RF-07.1). */
  nudgeBackgroundFader(delta: number): void
  /** O mesmo para o master, com `Shift` junto das setas. */
  nudgeMainFader(delta: number): void
  setMainMuted(muted: boolean): void
  setBackgroundMuted(muted: boolean): void
}

export const createPlaybackSlice: StateCreator<
  StoreState,
  [],
  [],
  PlaybackSlice
> = (set, get) => {
  /**
   * Para onde o app vai quando o louvor sai do ar. É a regra do retorno
   * automático (RF-04.11) num lugar só: sem fundo escolhido, ou com o retorno
   * desligado (momento de oração), o destino é o standby.
   */
  const afterMain = (): PlayerMode => {
    const { preferences, selectedBackgroundId } = get()
    if (!preferences.autoReturnBackground) return 'silence'
    return selectedBackgroundId ? 'background' : 'silence'
  }

  return {
    mode: 'silence',
    currentId: null,
    mainFader: DEFAULT_MAIN_FADER,
    backgroundFader: DEFAULT_BACKGROUND_FADER,
    mainMuted: false,
    backgroundMuted: false,

    play(id) {
      // Tocar item que não está na fila não faz sentido e deixaria a topbar
      // apontando para o vazio.
      if (!get().findQueueItem(id)) return
      set({ currentId: id, mode: 'main' })
    },

    playNext() {
      const next = get().nextInQueue()
      if (next) get().play(next.id)
    },

    pauseMain() {
      if (get().mode !== 'main') return
      // O `currentId` fica: é ele que distingue "pausado" de "standby".
      set({ mode: 'silence' })
    },

    resumeMain() {
      if (!get().currentId) return
      set({ mode: 'main' })
    },

    isMainPaused() {
      const { mode, currentId } = get()
      return mode === 'silence' && currentId !== null
    },

    stop() {
      set({ currentId: null, mode: afterMain() })
    },

    finish() {
      const { currentId } = get()
      const item = currentId ? get().findQueueItem(currentId) : null

      if (item) {
        get().pushHistory(item)
        set((state) => ({
          queue: state.queue.filter((entry) => entry.id !== item.id),
        }))
      }

      set({ currentId: null, mode: afterMain() })
    },

    playBackground() {
      if (!get().selectedBackgroundId) return
      set((state) => ({
        mode: 'background',
        currentId: null,
        backgroundCue: state.backgroundCue + 1,
      }))
    },

    stopBackground() {
      if (get().mode === 'background') set({ mode: 'silence' })
    },

    silence() {
      set({ mode: 'silence', currentId: null })
    },

    setMainFader(value) {
      set({ mainFader: clampFader(value) })
    },

    setBackgroundFader(value) {
      set({ backgroundFader: clampFader(value) })
    },

    nudgeBackgroundFader(delta) {
      set((state) => ({
        backgroundFader: clampFader(state.backgroundFader + delta),
      }))
    },

    nudgeMainFader(delta) {
      set((state) => ({
        mainFader: clampFader(state.mainFader + delta),
      }))
    },

    setMainMuted(muted) {
      set({ mainMuted: muted })
    },

    setBackgroundMuted(muted) {
      set({ backgroundMuted: muted })
    },
  }
}
