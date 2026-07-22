import { parseVideoId } from '../youtube/video-id'
import { createId } from './ids'
import { normalizePersistedState } from './normalize'
import type { PersistedState } from './types'

/**
 * Resgate dos dados do protótipo (RF-09.3).
 *
 * Quem já usa o CronoApp tem a fila e a biblioteca de fundos gravadas no
 * `localStorage`, na chave `cronoapp-sound-panel`. Ao abrir a versão nova pela
 * primeira vez, esses dados têm que **aparecer** — perder a biblioteca de fundos
 * de alguém porque trocamos de banco seria inaceitável, e ele só descobriria no
 * domingo.
 *
 * O resgate acontece uma vez: depois de importado, deixamos uma marca e o
 * `localStorage` antigo é **preservado** (não apagamos nada) — se algo der
 * errado na versão nova, os dados originais continuam lá.
 *
 * ## O tradutor (correção C4)
 *
 * O protótipo e a reescrita usam nomes diferentes para as mesmas coisas. Não é
 * detalhe cosmético: sem traduzir, **todo item da fila seria descartado em
 * silêncio**, porque a fila do protótipo guarda `url` (o link inteiro) e a nossa
 * guarda `videoId` — e item sem `videoId` não sobrevive à normalização. O
 * operador abriria o app novo com a fila vazia e nenhuma mensagem de erro.
 *
 * | Protótipo (v4)          | Aqui                          | Pegadinha                       |
 * | ----------------------- | ----------------------------- | ------------------------------- |
 * | `queue[].singer`        | `name`                        |                                 |
 * | `queue[].url`           | `videoId`                     | é a URL inteira                 |
 * | `queue[].duration`      | `durationSec`                 |                                 |
 * | `backgrounds[].id`      | `videoId`                     | o `id` deles **é** o id do vídeo |
 * | `backgrounds[].playlist`| —                             | rótulo (`'YouTube'`), não id    |
 * | `history[].playedAt`    | `finishedAt`                  | string `"HH:MM"`, não timestamp |
 * | `masterVolume`          | `mainFader`                   |                                 |
 * | `backgroundVolume`      | `backgroundFader`             |                                 |
 * | `mainFadeSeconds`       | `preferences.mainFadeMs`      | segundos → ms                   |
 * | `backgroundFadeSeconds` | `preferences.backgroundFadeMs`| segundos → ms                   |
 * | `autoReturn`            | `preferences.autoReturnBackground` |                            |
 * | `theme` (raiz)          | `preferences.theme`           |                                 |
 * | `accent`                | `preferences.accent`          | hexadecimal                     |
 * | `backgroundIndex`       | `selectedBackgroundId`        | índice, não id                  |
 */

/** Onde o protótipo grava. */
export const LEGACY_STORAGE_KEY = 'cronoapp-sound-panel'

/** Marca de que o resgate já foi feito. */
export const LEGACY_IMPORTED_KEY = 'cronoapp-legacy-imported'

/**
 * A partir desta versão do protótipo a biblioteca de fundos passou a ser real.
 * Antes dela vinham fundos de exemplo fixos que nunca tocavam áudio nenhum — a
 * própria migração do protótipo os descartava, e nós fazemos o mesmo.
 */
const FIRST_REAL_BACKGROUNDS_VERSION = 3

/** Um dia em ms — usado para decidir se o horário do histórico é de ontem. */
const ONE_DAY_MS = 24 * 60 * 60 * 1000

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

/**
 * `"HH:MM"` → um instante de verdade.
 *
 * O protótipo só guardava a hora do relógio, sem data — não dá para recuperar o
 * dia. Assumimos **hoje**; se a hora ainda não chegou (são 9h e a entrada diz
 * 22h), foi no culto de ontem. É a leitura mais provável, e o campo só serve
 * para exibir a hora ao lado do nome.
 */
export function parsePlayedAt(
  value: unknown,
  now: number = Date.now(),
): number {
  if (typeof value !== 'string') return now
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim())
  if (!match) return now

  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours > 23 || minutes > 59) return now

  const date = new Date(now)
  date.setHours(hours, minutes, 0, 0)
  const stamp = date.getTime()
  return stamp > now ? stamp - ONE_DAY_MS : stamp
}

/**
 * Traduz o estado do protótipo para o formato daqui.
 *
 * Só renomeia e converte unidades — validar é trabalho do `normalize`, que roda
 * logo depois. O que não for reconhecível é deixado como está para ele
 * descartar: dois filtros no mesmo lugar seria um a mais para manter.
 */
export function fromPrototypeState(raw: unknown, version = 4): unknown {
  if (!isRecord(raw)) return raw

  const sessionId = createId('s')
  const now = Date.now()

  const queue = asArray(raw.queue)
    .filter(isRecord)
    .map((item) => ({
      id: item.id,
      name: item.singer,
      // `url` é o link inteiro que o operador colou; aqui vira o id de 11
      // caracteres. Link que não dá para reconhecer devolve `null` e o item cai
      // fora na normalização — não haveria o que tocar mesmo.
      videoId: typeof item.url === 'string' ? parseVideoId(item.url) : null,
      title: item.title,
      durationSec: item.duration,
    }))

  const backgrounds =
    version < FIRST_REAL_BACKGROUNDS_VERSION
      ? []
      : asArray(raw.backgrounds)
          .filter(isRecord)
          .map((track) => ({
            // O `id` do protótipo **é** o id do vídeo; o nosso é identidade da
            // faixa na biblioteca (a mesma trilha pode entrar duas vezes).
            id: createId('bg'),
            videoId: track.id,
            title: track.title,
            durationSec: track.duration,
          }))

  const history = asArray(raw.history)
    .filter(isRecord)
    .map((entry) => ({
      id: createId('h'),
      name: entry.singer,
      title: entry.title,
      // O protótipo não guardava o vídeo do histórico — só nome e título.
      videoId: '',
      finishedAt: parsePlayedAt(entry.playedAt, now),
      // Nada lá tinha noção de culto: tudo vira uma sessão só.
      sessionId,
    }))

  const index =
    typeof raw.backgroundIndex === 'number' ? raw.backgroundIndex : 0

  return {
    queue,
    backgrounds,
    history,
    // O protótipo escolhia a faixa por posição na lista, não por identidade.
    selectedBackgroundId: backgrounds[index]?.id ?? backgrounds[0]?.id ?? null,
    mainFader: raw.masterVolume,
    backgroundFader: raw.backgroundVolume,
    sessionId,
    preferences: {
      mainFadeMs: toMs(raw.mainFadeSeconds),
      backgroundFadeMs: toMs(raw.backgroundFadeSeconds),
      accent: raw.accent,
      theme: raw.theme,
      autoReturnBackground: raw.autoReturn,
    },
  }
}

/** Segundos do protótipo → milissegundos daqui. */
function toMs(seconds: unknown): unknown {
  return typeof seconds === 'number' && Number.isFinite(seconds)
    ? seconds * 1000
    : seconds
}

/**
 * Lê os dados do protótipo, se houver algo a resgatar.
 *
 * Devolve `null` quando não há nada, quando já foi importado antes, ou quando o
 * conteúdo é ilegível — nenhum desses casos é erro: é só seguir com o app vazio.
 */
export function readLegacyState(
  storage: Storage | undefined = globalThis.localStorage,
): PersistedState | null {
  if (!storage) return null

  try {
    if (storage.getItem(LEGACY_IMPORTED_KEY)) return null

    const raw = storage.getItem(LEGACY_STORAGE_KEY)
    if (!raw) return null

    const parsed: unknown = JSON.parse(raw)
    // O protótipo usa o `persist` do Zustand, que embrulha tudo em `{ state,
    // version }`. Aceitamos as duas formas: com e sem embrulho.
    const wrapped = isRecord(parsed) && 'state' in parsed
    const source = wrapped ? (parsed as { state: unknown }).state : parsed
    const version =
      wrapped && typeof (parsed as { version?: unknown }).version === 'number'
        ? (parsed as { version: number }).version
        : 4

    const state = normalizePersistedState(fromPrototypeState(source, version))
    const vazio =
      state.queue.length === 0 &&
      state.backgrounds.length === 0 &&
      state.history.length === 0
    // Nada de útil lá dentro: não vale marcar como importado nem sobrescrever
    // o que o usuário já tenha feito na versão nova.
    return vazio ? null : state
  } catch {
    return null
  }
}

/** Marca o resgate como feito, para não repetir a cada abertura. */
export function markLegacyImported(
  storage: Storage | undefined = globalThis.localStorage,
): void {
  try {
    storage?.setItem(LEGACY_IMPORTED_KEY, new Date().toISOString())
  } catch {
    // Sem localStorage gravável (aba anônima com cota cheia, por exemplo) o
    // resgate roda de novo na próxima abertura. É repetição inofensiva: os
    // dados são os mesmos.
  }
}
