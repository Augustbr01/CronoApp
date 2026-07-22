import { PLAYER_STATE } from '../youtube/types'
import type {
  PlayerOptions,
  YouTubeApi,
  YouTubePlayerInstance,
} from '../youtube/types'

/**
 * Dublê da IFrame API do YouTube para os testes.
 *
 * Nenhum teste pode depender de rede, de iframe ou do YouTube estar no ar — o
 * dublê põe o **controle do tempo na mão do teste**: é ele que decide quando o
 * player fica pronto, quando começa a tocar e quando dá erro. É isso que permite
 * testar o cronômetro de silêncio, que só se observa quando **nada** acontece.
 */

/** Um player de mentira: registra o que mandaram fazer e emite eventos sob comando. */
export class FakeYouTubePlayer implements YouTubePlayerInstance {
  /** Volume na escala do YouTube (0–100), como no player de verdade. */
  volume = 100
  destroyed = false
  currentTime = 0
  duration = 0

  /** Chamadas recebidas, na ordem, para o teste conferir. */
  readonly loadCalls: { videoId: string; startSeconds?: number }[] = []
  readonly cueCalls: { videoId: string; startSeconds?: number }[] = []
  readonly commands: string[] = []

  /** As opções que o wrapper passou ao construtor (videoId, playerVars…). */
  readonly options: PlayerOptions
  /** O elemento que o iframe teria substituído. */
  readonly host: HTMLElement | string

  private state: number = PLAYER_STATE.UNSTARTED
  private readonly events: PlayerOptions['events']

  constructor(host: HTMLElement | string, options: PlayerOptions) {
    // A API de verdade valida a **presença da chave**, não o valor: com
    // `videoId: undefined` explícito ela lança `Invalid video id` e o player
    // não nasce. Foi assim que o painel inteiro ficou mudo uma vez, com a
    // topbar anunciando NO AR. Conferido num Chrome de verdade; o dublê
    // reproduz para que o teste veja.
    if ('videoId' in options && options.videoId === undefined) {
      throw new Error('Invalid video id')
    }

    this.host = host
    this.options = options
    this.events = options.events
  }

  loadVideoById(videoId: string, startSeconds?: number): void {
    this.loadCalls.push({ videoId, startSeconds })
    this.commands.push('load')
  }

  cueVideoById(videoId: string, startSeconds?: number): void {
    this.cueCalls.push({ videoId, startSeconds })
    this.commands.push('cue')
  }

  playVideo(): void {
    this.commands.push('play')
  }

  pauseVideo(): void {
    this.commands.push('pause')
  }

  stopVideo(): void {
    this.commands.push('stop')
  }

  seekTo(seconds: number): void {
    this.currentTime = seconds
    this.commands.push('seek')
  }

  setVolume(volume: number): void {
    this.volume = volume
  }

  getVolume(): number {
    return this.volume
  }

  getPlayerState(): number {
    return this.state
  }

  getCurrentTime(): number {
    return this.currentTime
  }

  getDuration(): number {
    return this.duration
  }

  destroy(): void {
    this.destroyed = true
  }

  // --- gatilhos que só os testes usam ---------------------------------------

  /** O player ficou pronto para receber comandos. */
  emitReady(): void {
    this.events?.onReady?.({ target: this })
  }

  /** Mudou de estado — use os códigos de `PLAYER_STATE`. */
  emitStateChange(state: number): void {
    this.state = state
    this.events?.onStateChange?.({ target: this, data: state })
  }

  /** O YouTube reclamou (2, 5, 100, 101, 150). */
  emitError(code: number): void {
    this.events?.onError?.({ target: this, data: code })
  }
}

export interface FakeYouTubeApi {
  /** O que entra no lugar de `window.YT`. */
  api: YouTubeApi
  /** Todos os players criados, na ordem. */
  players: FakeYouTubePlayer[]
  /** O último player criado — falha se não houver nenhum. */
  last(): FakeYouTubePlayer
}

/** Monta uma API falsa que registra cada player criado. */
export function createFakeYouTubeApi(): FakeYouTubeApi {
  const players: FakeYouTubePlayer[] = []

  class TrackedPlayer extends FakeYouTubePlayer {
    constructor(host: HTMLElement | string, options: PlayerOptions) {
      super(host, options)
      players.push(this)
    }
  }

  return {
    api: { Player: TrackedPlayer },
    players,
    last(): FakeYouTubePlayer {
      const player = players.at(-1)
      if (!player) throw new Error('nenhum player foi criado ainda')
      return player
    },
  }
}
