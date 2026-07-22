/**
 * Superfície tipada da IFrame Player API do YouTube.
 *
 * A API do YouTube é um objeto global (`window.YT`) sem tipos próprios. Em vez
 * de espalhar `any` pelo código — proibido por aqui (RNF-02.1) —, este arquivo
 * declara **só o pedaço que o CronoApp realmente usa**, tipado. É a fronteira:
 * daqui pra dentro, tudo é typescript honesto; daqui pra fora, é a API deles.
 *
 * Declarar à mão em vez de instalar `@types/youtube` é proposital: a superfície
 * é pequena, e uma dependência a menos é uma dependência a menos para auditar.
 */

/**
 * Códigos de estado do player (o `YT.PlayerState` deles).
 *
 * Declaramos os nossos em vez de ler `window.YT.PlayerState` para que o resto
 * do app possa comparar estados sem depender do global estar carregado.
 */
export const PLAYER_STATE = {
  UNSTARTED: -1,
  ENDED: 0,
  PLAYING: 1,
  PAUSED: 2,
  BUFFERING: 3,
  CUED: 5,
} as const

/** Um dos códigos de `PLAYER_STATE`. */
export type PlayerStateCode = (typeof PLAYER_STATE)[keyof typeof PLAYER_STATE]

/** Opções de reprodução passadas ao iframe na criação do player. */
export interface PlayerVars {
  autoplay?: 0 | 1
  controls?: 0 | 1
  disablekb?: 0 | 1
  playsinline?: 0 | 1
  rel?: 0 | 1
  modestbranding?: 0 | 1
  origin?: string
}

/** Evento simples do player — só carrega quem o emitiu. */
export interface PlayerEvent {
  target: YouTubePlayerInstance
}

/** Mudança de estado: `data` é um código de `PLAYER_STATE`. */
export interface PlayerStateChangeEvent extends PlayerEvent {
  data: number
}

/** Erro do player: `data` é um código traduzido em `errors.ts`. */
export interface PlayerErrorEvent extends PlayerEvent {
  data: number
}

/** Opções do construtor `new YT.Player(...)`. */
export interface PlayerOptions {
  videoId?: string
  width?: string | number
  height?: string | number
  playerVars?: PlayerVars
  events?: {
    onReady?: (event: PlayerEvent) => void
    onStateChange?: (event: PlayerStateChangeEvent) => void
    onError?: (event: PlayerErrorEvent) => void
  }
}

/**
 * O player em si. Só os métodos que o motor de áudio precisa — nada de
 * legendas, playlists ou qualidade de vídeo.
 *
 * Atenção à escala: `setVolume`/`getVolume` do YouTube trabalham em **0–100**,
 * enquanto o motor de áudio pensa em 0–1. A conversão acontece no wrapper.
 */
export interface YouTubePlayerInstance {
  loadVideoById(videoId: string, startSeconds?: number): void
  cueVideoById(videoId: string, startSeconds?: number): void
  playVideo(): void
  pauseVideo(): void
  stopVideo(): void
  seekTo(seconds: number, allowSeekAhead: boolean): void
  setVolume(volume: number): void
  getVolume(): number
  getPlayerState(): number
  getCurrentTime(): number
  getDuration(): number
  destroy(): void
}

/** O global `window.YT`, no pedaço que consumimos. */
export interface YouTubeApi {
  Player: new (
    host: HTMLElement | string,
    options: PlayerOptions,
  ) => YouTubePlayerInstance
}

declare global {
  interface Window {
    /** Existe só depois que o script da IFrame API termina de carregar. */
    YT?: YouTubeApi
    /** Callback que o script do YouTube chama quando fica pronto. */
    onYouTubeIframeAPIReady?: () => void
  }
}
