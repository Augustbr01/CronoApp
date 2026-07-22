import { clampFadeMs } from './slices/preferences'
import { createId } from './ids'
import {
  ACCENT_COLORS,
  DEFAULT_BACKGROUND_FADER,
  DEFAULT_MAIN_FADER,
  DEFAULT_PREFERENCES,
  HISTORY_LIMIT,
  type AccentColor,
  type Background,
  type HistoryEntry,
  type PersistedState,
  type Preferences,
  type QueueItem,
  type ThemeName,
} from './types'

/**
 * Normalização defensiva dos dados que chegam de fora.
 *
 * Tudo que vem de disco é **desconhecido**: pode ser de uma versão antiga do
 * app, de um arquivo de importação editado à mão, ou de um localStorage do
 * protótipo. A regra aqui é uma só: **nunca lançar erro e nunca deixar passar
 * lixo.** Campo que falta vira padrão; item malformado é descartado; o app
 * abre.
 *
 * O contrário — deixar um `undefined` entrar no store — só apareceria no meio
 * do culto, como uma tela branca. Perder um item corrompido é muito melhor do
 * que isso.
 */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function asOptionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value : undefined
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

/** Um item de fila só sobrevive se tiver vídeo — sem isso não há o que tocar. */
function normalizeQueueItem(value: unknown): QueueItem | null {
  if (!isRecord(value)) return null
  const videoId = asString(value.videoId)
  if (!videoId) return null

  return {
    id: asString(value.id) || createId('q'),
    name: asString(value.name).trim() || 'Convidado',
    videoId,
    title: asString(value.title) || 'Vídeo do YouTube',
    durationSec: asOptionalNumber(value.durationSec),
    thumbnailUrl: asOptionalString(value.thumbnailUrl),
    embedBlocked:
      typeof value.embedBlocked === 'boolean' ? value.embedBlocked : undefined,
    addedAt: asNumber(value.addedAt, Date.now()),
  }
}

function normalizeBackground(value: unknown): Background | null {
  if (!isRecord(value)) return null
  const videoId = asString(value.videoId)
  if (!videoId) return null

  return {
    id: asString(value.id) || createId('bg'),
    videoId,
    title: asString(value.title) || 'Fundo musical',
    channelTitle: asOptionalString(value.channelTitle),
    thumbnailUrl: asOptionalString(value.thumbnailUrl),
    durationSec: asOptionalNumber(value.durationSec),
    addedAt: asNumber(value.addedAt, Date.now()),
  }
}

function normalizeHistoryEntry(
  value: unknown,
  fallbackSession: string,
): HistoryEntry | null {
  if (!isRecord(value)) return null
  const title = asString(value.title)
  const name = asString(value.name)
  if (!title && !name) return null

  return {
    id: asString(value.id) || createId('h'),
    name: name || 'Convidado',
    title: title || 'Vídeo do YouTube',
    videoId: asString(value.videoId),
    finishedAt: asNumber(value.finishedAt, Date.now()),
    // Histórico do protótipo não tinha sessão: tudo dele vira um culto só.
    sessionId: asString(value.sessionId) || fallbackSession,
  }
}

function normalizeAccent(value: unknown): AccentColor {
  const accent = ACCENT_COLORS.find((option) => option === value)
  return accent ?? DEFAULT_PREFERENCES.accent
}

function normalizeTheme(value: unknown): ThemeName {
  return value === 'light' || value === 'dark'
    ? value
    : DEFAULT_PREFERENCES.theme
}

export function normalizePreferences(value: unknown): Preferences {
  if (!isRecord(value)) return { ...DEFAULT_PREFERENCES }

  return {
    mainFadeMs: clampFadeMs(
      asNumber(value.mainFadeMs, DEFAULT_PREFERENCES.mainFadeMs),
    ),
    backgroundFadeMs: clampFadeMs(
      asNumber(value.backgroundFadeMs, DEFAULT_PREFERENCES.backgroundFadeMs),
    ),
    accent: normalizeAccent(value.accent),
    theme: normalizeTheme(value.theme),
    autoReturnBackground: asBoolean(
      value.autoReturnBackground,
      DEFAULT_PREFERENCES.autoReturnBackground,
    ),
  }
}

function clampFader(value: unknown, fallback: number): number {
  return Math.max(0, Math.min(100, asNumber(value, fallback)))
}

/** Transforma qualquer coisa num estado válido do app. */
export function normalizePersistedState(value: unknown): PersistedState {
  const source = isRecord(value) ? value : {}
  const sessionId = asString(source.sessionId) || createId('s')

  const queue = asArray(source.queue)
    .map(normalizeQueueItem)
    .filter((item): item is QueueItem => item !== null)

  const backgrounds = asArray(source.backgrounds)
    .map(normalizeBackground)
    .filter((item): item is Background => item !== null)

  const history = asArray(source.history)
    .map((entry) => normalizeHistoryEntry(entry, sessionId))
    .filter((entry): entry is HistoryEntry => entry !== null)
    .slice(0, HISTORY_LIMIT)

  // Um id selecionado que não existe mais na biblioteca é pior que nenhum:
  // o app tentaria tocar um fundo fantasma.
  const selected = asString(source.selectedBackgroundId)
  const selectedBackgroundId =
    backgrounds.find((item) => item.id === selected)?.id ??
    backgrounds[0]?.id ??
    null

  return {
    queue,
    history,
    backgrounds,
    selectedBackgroundId,
    mainFader: clampFader(source.mainFader, DEFAULT_MAIN_FADER),
    backgroundFader: clampFader(
      source.backgroundFader,
      DEFAULT_BACKGROUND_FADER,
    ),
    preferences: normalizePreferences(source.preferences),
    sessionId,
  }
}
