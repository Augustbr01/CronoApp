/**
 * O modelo de domínio do CronoApp.
 *
 * É o vocabulário do culto traduzido em tipos: quem vai cantar (a fila), o que
 * já cantou (o histórico), a trilha de fundo (a biblioteca) e como o operador
 * gosta das coisas (as preferências). Nada aqui sabe de React, de IndexedDB ou
 * do YouTube — são só os dados.
 */

/** Os três modos exclusivos do RF-04.1. */
export type PlayerMode = 'main' | 'background' | 'silence'

/**
 * As quatro cores de destaque do RF-08.1, **em hexadecimal**.
 *
 * São exatamente as quatro do protótipo, e são guardadas como cor e não como
 * nome ("amber", "violet") por um motivo prático: o valor cai direto na
 * custom property `--accent` do CSS. Um nome exigiria uma tabela de tradução no
 * meio do caminho, que é mais uma coisa para sair do lugar — e quebraria o
 * resgate dos dados de quem já usa o protótipo, que grava o hexadecimal.
 */
export const ACCENT_COLORS = [
  '#e8b64c',
  '#1fce6d',
  '#4f8df7',
  '#c084fc',
] as const
export type AccentColor = (typeof ACCENT_COLORS)[number]

export type ThemeName = 'dark' | 'light'

/** Um participante na fila — alguém que vai cantar (RF-01). */
export interface QueueItem {
  id: string
  /** Nome de quem vai cantar. Vazio vira "Convidado" na borda (RF-02.3). */
  name: string
  videoId: string
  /** Título do vídeo, vindo do oEmbed ou da busca (RF-01.2). */
  title: string
  /** Duração em segundos, quando conhecida. */
  durationSec?: number
  thumbnailUrl?: string
  /**
   * O dono do vídeo bloqueou reprodução fora do YouTube, detectado na hora de
   * adicionar (RF-01.3). Serve para avisar **antes** do culto.
   */
  embedBlocked?: boolean
  addedAt: number
}

/** Uma música que já foi cantada (RF-06.1). */
export interface HistoryEntry {
  id: string
  name: string
  title: string
  videoId: string
  /** Quando saiu do ar. */
  finishedAt: number
  /** A qual culto pertence — é o que agrupa o histórico (RF-06.2). */
  sessionId: string
}

/** Uma faixa da biblioteca de fundos (RF-03). */
export interface Background {
  id: string
  videoId: string
  title: string
  channelTitle?: string
  thumbnailUrl?: string
  durationSec?: number
  addedAt: number
}

/** Preferências do operador, todas persistidas (RF-08.3). */
export interface Preferences {
  /** Duração do fade do louvor, em ms. 0 a 8000 (RF-04.12). */
  mainFadeMs: number
  /** Duração do fade do fundo, em ms. 0 a 8000 (RF-04.12). */
  backgroundFadeMs: number
  accent: AccentColor
  theme: ThemeName
  /** O fundo volta sozinho quando o louvor sai? Desligável (RF-04.11). */
  autoReturnBackground: boolean
  /**
   * O nome da igreja, mostrado ao lado da marca na topbar.
   *
   * Vazio quer dizer duas coisas ao mesmo tempo: não há nome a mostrar **e** o
   * app ainda não foi apresentado a ninguém — é o que dispara a tela de
   * boas-vindas. Continua opcional depois disso: quem pular opera igual.
   */
  churchName: string
  /**
   * A tela de boas-vindas já foi mostrada?
   *
   * Precisa ser um campo próprio, e não `churchName !== ''`, porque pular é uma
   * resposta legítima: quem escolheu não dar nome não pode ser perguntado de
   * novo toda vez que abre o painel.
   */
  setupDone: boolean
}

/** Teto do nome da igreja, para ele não empurrar a topbar inteira. */
export const MAX_CHURCH_NAME = 40

/** Limites do RF-04.12, em ms. */
export const MIN_FADE_MS = 0
export const MAX_FADE_MS = 8_000
export const DEFAULT_FADE_MS = 2_000

/**
 * Onde os faders começam, na escala 0–100 do operador.
 *
 * São os valores do protótipo, e não 100/100: o louvor entra com folga para o
 * operador subir se a pessoa cantar baixo, e o fundo entra **abaixo** dele
 * porque fundo é fundo — se chegasse em 100 o primeiro culto começaria com a
 * trilha por cima de quem fala.
 */
export const DEFAULT_MAIN_FADER = 80
export const DEFAULT_BACKGROUND_FADER = 40

/**
 * Quantas entradas de histórico guardar. O protótipo guardava 8, preso pelo
 * localStorage; o IndexedDB comporta muito mais (RF-06.2), e um número alto é o
 * que permite olhar cultos anteriores.
 */
export const HISTORY_LIMIT = 500

export const DEFAULT_PREFERENCES: Preferences = {
  mainFadeMs: DEFAULT_FADE_MS,
  backgroundFadeMs: DEFAULT_FADE_MS,
  accent: ACCENT_COLORS[0],
  theme: 'dark',
  autoReturnBackground: true,
  churchName: '',
  setupDone: false,
}

/** Tudo o que o app guarda no dispositivo. */
export interface PersistedState {
  queue: QueueItem[]
  history: HistoryEntry[]
  backgrounds: Background[]
  selectedBackgroundId: string | null
  mainFader: number
  backgroundFader: number
  preferences: Preferences
  sessionId: string
}
