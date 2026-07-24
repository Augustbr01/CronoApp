import { PLAYER_ERROR, describePlayerError } from '../youtube/errors'
import { PLAYER_STATE } from '../youtube/types'
import type { PlayerStateCode } from '../youtube/types'
import type { CreatePlayerOptions, MediaChannel } from '../youtube/player'

/**
 * Um canal do YouTube de mentira, no nível do **wrapper** — não da IFrame API.
 *
 * O dublê de `fake-youtube.ts` finge ser o `window.YT`; este finge ser o
 * `MediaChannel` que a Parte 2.4 devolve. É o degrau certo para testar a
 * costura da Etapa 4: o que interessa é "o motor mandou carregar o vídeo X e
 * pôs o volume em 0,42", não como o iframe faz isso.
 *
 * O tempo é do teste: nada acontece sozinho. O vídeo só "acaba" quando o teste
 * chama `emitEnded()`, e o erro só aparece quando ele chama `emitError()`.
 */
export class FakeYouTubeChannel implements MediaChannel {
  /** O que mandaram carregar **já tocando**, na ordem. */
  readonly loads: string[] = []
  /** O que mandaram apenas engatilhar, na ordem. */
  readonly cues: string[] = []
  readonly commands: string[] = []
  /** Volume em 0–1, na escala do motor. */
  volume = 1
  destroyed = false
  currentTime = 0
  duration = 0

  private state: PlayerStateCode = PLAYER_STATE.UNSTARTED
  /**
   * Vídeo que foi engatilhado e ainda não recebeu ordem de carregar.
   *
   * Existe para o dublê **errar como a API de verdade erra**: `cueVideoById`
   * seguido de `playVideo` no mesmo tique não toca. Os dois comandos viajam por
   * `postMessage` até o iframe, e o play chega enquanto o cue ainda está
   * buscando o vídeo — o player fica sem vídeo registrado e responde com o erro
   * 2. Conferido num Chrome de verdade: o "Mix agora" parava o fundo e não
   * iniciava a faixa seguinte, e "voltar fundo" acusava link inválido.
   *
   * Sem isto o dublê mente, e a corrida passa por todos os testes até chegar ao
   * domingo.
   */
  private engatilhado: string | null = null
  private readonly options: CreatePlayerOptions

  constructor(options: CreatePlayerOptions) {
    this.options = options
  }

  /** O elemento que o iframe teria substituído. */
  get host(): HTMLElement {
    return this.options.host
  }

  load(videoId: string): void {
    this.loads.push(videoId)
    this.commands.push(`load:${videoId}`)
    this.currentTime = 0
    // Carregar e tocar é um comando só: não há corrida para perder.
    this.engatilhado = null
    this.emitState(PLAYER_STATE.PLAYING)
  }

  cue(videoId: string): void {
    this.cues.push(videoId)
    this.commands.push(`cue:${videoId}`)
    this.currentTime = 0
    this.engatilhado = videoId
  }

  /**
   * Todo vídeo que passou por este player, engatilhado ou tocando, na ordem.
   *
   * É o que a maioria dos testes quer saber ("o motor pôs a faixa certa no
   * player do fundo?"). Quem está conferindo **como** ele entrou — se saiu som
   * ou não — olha `loads` e `cues` separados.
   */
  get videos(): string[] {
    return this.commands
      .filter((c) => c.startsWith('load:') || c.startsWith('cue:'))
      .map((c) => c.slice(c.indexOf(':') + 1))
  }

  play(): void {
    this.commands.push('play')
    if (this.engatilhado !== null) {
      // Ver `engatilhado`: é assim que a API de verdade responde.
      this.options.onError?.(
        describePlayerError(PLAYER_ERROR.INVALID_PARAMETER),
      )
      return
    }
    this.emitState(PLAYER_STATE.PLAYING)
  }

  pause(): void {
    this.commands.push('pause')
    this.emitState(PLAYER_STATE.PAUSED)
  }

  stop(): void {
    this.commands.push('stop')
  }

  setVolume(level: number): void {
    this.volume = level
  }

  getVolume(): number {
    return this.volume
  }

  getState(): PlayerStateCode {
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

  emitState(state: PlayerStateCode): void {
    this.state = state
    this.options.onStateChange?.(state)
  }

  /** O vídeo chegou ao fim sozinho. */
  emitEnded(): void {
    this.emitState(PLAYER_STATE.ENDED)
  }

  emitError(code: number, message = 'deu ruim'): void {
    this.options.onError?.({ code, message, fatal: false })
  }
}

export interface FakeChannelFactory {
  /** Entra no lugar de `createYouTubeChannel`. */
  create: (
    options: CreatePlayerOptions,
    channel: 'main' | 'background',
  ) => Promise<MediaChannel>
  channels: FakeYouTubeChannel[]
  /** O player da pré-escuta — o mais recente, se houve nova tentativa. */
  main(): FakeYouTubeChannel
  /** O player escondido do fundo. */
  background(): FakeYouTubeChannel
  /**
   * Faz as próximas `quantas` criações falharem — a API do YouTube que não
   * chega (sem rede) ou o player que não responde no prazo. É o cenário em que
   * o painel abre sem som nenhum, e o único que exercita a nova tentativa.
   */
  falharProximas(quantas: number, message?: string): void
}

/**
 * A fábrica que o motor recebe no lugar do `createYouTubeChannel`.
 *
 * Quem é quem vem do argumento que o motor passa, não da ordem de montagem: a
 * árvore pode mudar de forma sem quebrar os testes.
 */
export function createFakeChannelFactory(): FakeChannelFactory {
  const channels: FakeYouTubeChannel[] = []
  const porCanal = new Map<string, FakeYouTubeChannel>()
  let falhasPendentes = 0
  let mensagemDaFalha = 'O player do YouTube não respondeu.'

  const pegar = (role: string): FakeYouTubeChannel => {
    const found = porCanal.get(role)
    if (!found) throw new Error(`nenhum canal "${role}" foi criado`)
    return found
  }

  return {
    create(options, channel) {
      if (falhasPendentes > 0) {
        falhasPendentes -= 1
        return Promise.reject(new Error(mensagemDaFalha))
      }
      const fake = new FakeYouTubeChannel(options)
      channels.push(fake)
      porCanal.set(channel, fake)
      return Promise.resolve(fake)
    },
    channels,
    main: () => pegar('main'),
    background: () => pegar('background'),
    falharProximas(quantas, message) {
      falhasPendentes = quantas
      if (message !== undefined) mensagemDaFalha = message
    },
  }
}
