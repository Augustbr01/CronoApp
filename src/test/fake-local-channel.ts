import { LOCAL_ERROR, describeLocalError } from '../localaudio/errors'
import type { CreateLocalChannelOptions } from '../localaudio/player'
import type { MediaChannel } from '../youtube/player'
import { PLAYER_STATE } from '../youtube/types'
import type { PlayerStateCode } from '../youtube/types'

/**
 * O backend de áudio local de mentira — o irmão de `fake-channel.ts`.
 *
 * Existe pelo mesmo motivo daquele: testar a costura no nível certo. O que
 * interessa é "o motor mandou este `<audio>` tocar esta URL e pôs o volume em
 * 0,42", não como o elemento faz isso — o `<audio>` de verdade tem os seus
 * próprios testes, em `localaudio/player.test.ts`.
 *
 * A diferença que importa em relação ao dublê do YouTube é o que ele **não**
 * erra: aqui `cue` seguido de `play` toca, porque não há `postMessage` para
 * perder a corrida. Um dublê local que copiasse aquela falha estaria inventando
 * um defeito que o backend real não tem — e faria o motor ser escrito para
 * contorná-lo.
 */
export class FakeLocalChannel implements MediaChannel {
  /** As URLs que mandaram carregar **já tocando**, na ordem. */
  readonly loads: string[] = []
  /** As que mandaram apenas engatilhar, na ordem. */
  readonly cues: string[] = []
  readonly commands: string[] = []
  /** Volume em 0–1, na escala do motor. */
  volume = 1
  destroyed = false
  currentTime = 0
  duration = 0

  private state: PlayerStateCode = PLAYER_STATE.UNSTARTED
  private readonly options: CreateLocalChannelOptions

  constructor(options: CreateLocalChannelOptions) {
    this.options = options
  }

  /**
   * Carregar sem URL é o item cujo blob sumiu do cofre: o backend de verdade
   * responde com o erro do `NO_SOURCE`, e o dublê responde igual — senão o
   * caminho do arquivo perdido (RF-11.5) passaria nos testes sem nunca ter sido
   * exercitado.
   */
  private aponta(url: string): boolean {
    if (!url) {
      this.options.onError?.(describeLocalError(LOCAL_ERROR.NO_SOURCE))
      return false
    }
    return true
  }

  load(url: string): void {
    this.commands.push(`load:${url}`)
    if (!this.aponta(url)) return
    this.loads.push(url)
    this.currentTime = 0
    this.emitState(PLAYER_STATE.PLAYING)
  }

  cue(url: string): void {
    this.commands.push(`cue:${url}`)
    if (!this.aponta(url)) return
    this.cues.push(url)
    this.currentTime = 0
  }

  /** Toda URL que passou por este backend, engatilhada ou tocando, na ordem. */
  get faixas(): string[] {
    return this.commands
      .filter((c) => c.startsWith('load:') || c.startsWith('cue:'))
      .map((c) => c.slice(c.indexOf(':') + 1))
  }

  play(): void {
    this.commands.push('play')
    this.emitState(PLAYER_STATE.PLAYING)
  }

  pause(): void {
    this.commands.push('pause')
    this.emitState(PLAYER_STATE.PAUSED)
  }

  stop(): void {
    this.commands.push('stop')
    this.currentTime = 0
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

  /** O arquivo chegou ao fim sozinho. */
  emitEnded(): void {
    this.emitState(PLAYER_STATE.ENDED)
  }
}

export interface FakeLocalChannelFactory {
  /** Entra no lugar de `createLocalAudioChannel`. */
  create: (
    options: CreateLocalChannelOptions,
    channel: 'main' | 'background',
  ) => MediaChannel
  channels: FakeLocalChannel[]
  /**
   * O backend local do louvor. Diferente do YouTube, ele **nasce sob demanda** —
   * um culto sem arquivo nenhum não cria nenhum —, então perguntar por ele antes
   * do primeiro item local é um erro de teste, não um caso a tratar.
   */
  main(): FakeLocalChannel
  background(): FakeLocalChannel
  /** Se o canal já tem backend local — sem estourar quando não tem. */
  existe(channel: 'main' | 'background'): boolean
}

export function createFakeLocalChannelFactory(): FakeLocalChannelFactory {
  const channels: FakeLocalChannel[] = []
  const porCanal = new Map<string, FakeLocalChannel>()

  const pegar = (role: string): FakeLocalChannel => {
    const found = porCanal.get(role)
    if (!found) throw new Error(`nenhum canal local "${role}" foi criado`)
    return found
  }

  return {
    create(options, channel) {
      const fake = new FakeLocalChannel(options)
      channels.push(fake)
      porCanal.set(channel, fake)
      return fake
    },
    channels,
    main: () => pegar('main'),
    background: () => pegar('background'),
    existe: (channel) => porCanal.has(channel),
  }
}
