import type { BackgroundSlice } from './slices/backgrounds'
import type { DataSlice } from './slices/data'
import type { HistorySlice } from './slices/history'
import type { PlaybackSlice } from './slices/playback'
import type { PreferencesSlice } from './slices/preferences'
import type { QueueSlice } from './slices/queue'

/**
 * O tipo do store inteiro, junção das fatias.
 *
 * Fica num arquivo próprio para as fatias poderem se enxergar sem importar umas
 * às outras — o `finish()` precisa mexer na fila e no histórico, e o fundo
 * precisa saber se o louvor está no ar. Sem este arquivo, seriam imports
 * circulares.
 */
export type StoreState = QueueSlice &
  BackgroundSlice &
  PlaybackSlice &
  HistorySlice &
  PreferencesSlice &
  DataSlice
