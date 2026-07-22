import { DEFAULT_FADE_MS, createChannel } from './channel'
import type { Channel, ChannelFade, ChannelPhase } from './channel'
import { createRafScheduler } from './scheduler'
import type { FrameScheduler } from './scheduler'

/**
 * O motor de mixagem — os dois canais tocando juntos.
 *
 * A Parte 5a fez um canal saber o próprio volume. Esta parte faz **louvor e
 * fundo conversarem**: o fundo desce enquanto o louvor sobe (crossfade), o
 * fundo volta sozinho quando o louvor acaba, e um laço por quadro mantém tudo
 * andando — dormindo quando não há nada a fazer.
 *
 * O mixer **não conhece o YouTube**. Ele não chama o player: ele **anuncia
 * intenções** ("toque o canal do louvor", "o volume do fundo agora é 0,42") e
 * quem estiver ligando os fios (Etapa 3/4) traduz isso para o wrapper da Parte
 * 2.4. É isso que mantém `audio/` sem depender de `youtube/`.
 */

/** Os três modos exclusivos do RF-04.1. */
export type MixerMode = 'main' | 'background' | 'silence'

/** Qual dos dois canais. */
export type ChannelName = 'main' | 'background'

/** O que o mixer pede ao player. */
export type TransportAction = 'play' | 'pause'

export interface MixerOptions {
  /** Duração do fade do louvor, em ms (RF-04.12). */
  mainFadeMs?: number
  /** Duração do fade do fundo, em ms (RF-04.12). */
  backgroundFadeMs?: number
  /** Posição inicial dos faders, escala 0–100. */
  mainFader?: number
  backgroundFader?: number
  /** O fundo volta sozinho quando o louvor sai? Desligável (RF-04.11). */
  autoReturnBackground?: boolean
  /** Volume final de um canal mudou — mande ao player. */
  onVolume?: (channel: ChannelName, volume: number) => void
  /** Toque ou pause um canal. */
  onTransport?: (channel: ChannelName, action: TransportAction) => void
  /** O modo mudou — é o NO AR / STANDBY da topbar. */
  onModeChange?: (mode: MixerMode) => void
  /** O relógio. Trocado nos testes por um de mentira. */
  scheduler?: FrameScheduler
}

export interface Mixer {
  getMode(): MixerMode
  getPhase(channel: ChannelName): ChannelPhase
  getVolume(channel: ChannelName): number
  /** O fade em andamento num canal, ou `null` — alimenta o aviso do RF-05.5. */
  getFade(channel: ChannelName): ChannelFade | null
  /** Louvor entra no ar. Com o fundo tocando, vira crossfade (RF-04.5). */
  playMain(): void
  /**
   * Louvor sai do ar com fade; o fundo volta sozinho se estiver ligado.
   *
   * `onSilent` roda quando a rampa chega ao fim — **não** no instante do
   * comando. É o que faz a tela só anunciar a mudança quando o som de fato
   * saiu, como no protótipo. Um cancelamento (`playMain`) descarta o callback.
   */
  stopMain(onSilent?: () => void): void
  /**
   * Pausa o louvor: sai com fade e **nada** entra no lugar. É diferente do
   * `stopMain`, que devolve o fundo — quem pausa quer segurar tudo onde está.
   */
  pauseMain(onSilent?: () => void): void
  /**
   * Troca o que um canal está tocando sem corte seco (RF-04.4): o canal sai com
   * fade, `whenSilent` roda no fundo do poço — é onde quem chama carrega o
   * próximo vídeo — e o canal volta a subir com fade.
   *
   * É genérico de propósito (RNF-01.2): serve tanto para trocar a música da
   * fila quanto para o "Mix agora" do fundo. Com o canal já em silêncio não há
   * o que desmanchar: `whenSilent` roda na hora e nada mais acontece.
   */
  swap(channel: ChannelName, whenSilent: () => void): void
  /**
   * Recomeça o canal do zero: corta para o silêncio e sobe de novo com fade.
   * É o que dá entrada suave à faixa seguinte quando a anterior **terminou
   * sozinha** (RF-03.5) — aí não há o que abaixar, só o que subir.
   */
  restart(channel: ChannelName): void
  /** O vídeo do louvor acabou por conta própria. */
  mainEnded(): void
  /** Fundo entra no ar — também é o botão manual de voltar (RF-04.11). */
  playBackground(): void
  /** Fundo sai do ar; `onSilent` roda quando a rampa termina. */
  stopBackground(onSilent?: () => void): void
  /** Standby: tudo sai do ar, e o fundo **não** volta sozinho. */
  silence(): void
  setFader(channel: ChannelName, value: number): void
  getFader(channel: ChannelName): number
  /** Troca a duração do fade de um canal em tempo real (RF-04.12). */
  setFadeMs(channel: ChannelName, ms: number): void
  getFadeMs(channel: ChannelName): number
  setMuted(channel: ChannelName, muted: boolean): void
  setAutoReturnBackground(enabled: boolean): void
  isAutoReturnBackgroundEnabled(): boolean
  /** Desliga o laço e solta o quadro agendado (RNF-04.2). */
  destroy(): void
}

export function createMixer(options: MixerOptions = {}): Mixer {
  const {
    mainFadeMs = DEFAULT_FADE_MS,
    backgroundFadeMs = DEFAULT_FADE_MS,
    mainFader = 100,
    backgroundFader = 100,
    autoReturnBackground = true,
    onVolume,
    onTransport,
    onModeChange,
    scheduler = createRafScheduler(),
  } = options

  let mode: MixerMode = 'silence'
  let autoReturn = autoReturnBackground
  let destroyed = false
  let frame: number | null = null

  /**
   * O que fazer quando o fade-out do louvor terminar. Guardado no momento em que
   * a saída é pedida, e não consultado no fim: se o operador desligar o retorno
   * automático **durante** o fade, vale o que ele quis quando mandou parar.
   * Um cancelamento (RF-04.10) limpa isso.
   */
  let afterMainFadeOut: MixerMode | null = null

  /**
   * O que roda quando um canal chega ao silêncio — e se ele volta a subir
   * depois.
   *
   * É o coração da regra "o efeito só acontece quando o som acaba de sair", que
   * o protótipo aplicava a **toda** parada: trocar de música, pausar, parar,
   * desligar o fundo. Enquanto a rampa desce, nada mudou ainda; quem chama
   * decide o que acontece no fundo do poço.
   *
   * `resume: true` é a troca de faixa (o canal volta a subir com o vídeo novo);
   * `false` é a saída de cena (ele fica em silêncio).
   */
  interface AtSilence {
    run: () => void
    resume: boolean
  }

  const pendingAtSilence: Record<ChannelName, AtSilence | null> = {
    main: null,
    background: null,
  }

  /**
   * O fim de um fade-out, tratado igual nos dois canais (RNF-01.2).
   *
   * O player só pausa aqui, no fundo do poço — durante o crossfade ele continua
   * tocando, senão o fundo sumiria de uma vez em vez de descer por baixo do
   * louvor (RF-04.5).
   */
  const handleFadeOutEnd = (name: ChannelName): void => {
    onTransport?.(name, 'pause')

    const pending = pendingAtSilence[name]
    pendingAtSilence[name] = null
    pending?.run()

    if (pending?.resume) {
      onTransport?.(name, 'play')
      channels[name].fadeIn(scheduler.now())
      schedule()
      return
    }

    if (name !== 'main') return
    const next = afterMainFadeOut
    afterMainFadeOut = null
    if (next === 'background') enterBackground()
  }

  const main: Channel = createChannel({
    fader: mainFader,
    fadeInMs: mainFadeMs,
    fadeOutMs: mainFadeMs,
    onVolume: (volume) => onVolume?.('main', volume),
    onFadeEnd: (direction) => {
      if (direction === 'out') handleFadeOutEnd('main')
    },
  })

  const background: Channel = createChannel({
    fader: backgroundFader,
    fadeInMs: backgroundFadeMs,
    fadeOutMs: backgroundFadeMs,
    onVolume: (volume) => onVolume?.('background', volume),
    onFadeEnd: (direction) => {
      if (direction === 'out') handleFadeOutEnd('background')
    },
  })

  const channels: Record<ChannelName, Channel> = { main, background }

  const setMode = (next: MixerMode): void => {
    if (next === mode) return
    mode = next
    onModeChange?.(next)
  }

  const tick = (now: number): void => {
    frame = null
    main.tick(now)
    background.tick(now)
    // Só continua girando enquanto houver rampa em andamento (RNF-04.3).
    if (!main.isIdle() || !background.isIdle()) schedule()
  }

  const schedule = (): void => {
    if (destroyed || frame !== null) return
    frame = scheduler.request(tick)
  }

  /** Acorda o laço adormecido e devolve o instante em que o comando chegou. */
  const wake = (): number => {
    const now = scheduler.now()
    schedule()
    return now
  }

  const enterBackground = (): void => {
    const now = scheduler.now()
    pendingAtSilence.background = null
    if (background.getPhase() === 'silent') onTransport?.('background', 'play')
    background.fadeIn(now)
    setMode('background')
    schedule()
  }

  return {
    getMode: () => mode,
    getPhase: (channel) => channels[channel].getPhase(),
    getVolume: (channel) => channels[channel].getVolume(),
    getFade: (channel) => channels[channel].getFade(),

    playMain() {
      const now = wake()
      // Cancelar uma saída em andamento: o louvor volta e nada mais acontece
      // depois (nem pausa, nem retorno do fundo, nem a troca de faixa que
      // estivesse engatilhada) — RF-04.10.
      afterMainFadeOut = null
      pendingAtSilence.main = null
      if (main.getPhase() === 'silent') onTransport?.('main', 'play')
      main.fadeIn(now)
      // Crossfade: o fundo desce EM PARALELO, sem esperar o louvor (RF-04.5).
      if (background.getPhase() !== 'silent') background.fadeOut(now)
      setMode('main')
    },

    stopMain(onSilent) {
      const now = wake()
      const destino: MixerMode = autoReturn ? 'background' : 'silence'

      // Louvor já em silêncio (o operador tinha pausado antes de parar): não há
      // rampa para esperar, então o efeito vale agora — senão ele nunca rodaria,
      // e o fundo não voltaria.
      if (main.getPhase() === 'silent') {
        pendingAtSilence.main = null
        afterMainFadeOut = null
        onSilent?.()
        setMode(destino)
        if (destino === 'background') enterBackground()
        return
      }

      pendingAtSilence.main = onSilent ? { run: onSilent, resume: false } : null
      afterMainFadeOut = destino
      main.fadeOut(now)
      setMode(destino)
    },

    pauseMain(onSilent) {
      const now = wake()
      if (main.getPhase() === 'silent') {
        pendingAtSilence.main = null
        afterMainFadeOut = null
        onSilent?.()
        setMode('silence')
        return
      }

      pendingAtSilence.main = onSilent ? { run: onSilent, resume: false } : null
      // Pausar não é parar: o fundo **não** entra no lugar. É o que faz o
      // "segura aí" do operador soar como silêncio, e não como troca de trilha.
      afterMainFadeOut = 'silence'
      main.fadeOut(now)
      setMode('silence')
    },

    swap(channel, whenSilent) {
      const ch = channels[channel]
      // Canal já em silêncio: não há o que descer, e subir sozinho seria
      // ligar um áudio que ninguém pediu. Só troca o que está engatilhado.
      if (ch.getPhase() === 'silent') {
        whenSilent()
        return
      }
      const now = wake()
      if (channel === 'main') afterMainFadeOut = null
      pendingAtSilence[channel] = { run: whenSilent, resume: true }
      ch.fadeOut(now)
    },

    restart(channel) {
      const now = wake()
      pendingAtSilence[channel] = null
      channels[channel].cut()
      onTransport?.(channel, 'play')
      channels[channel].fadeIn(now)
    },

    mainEnded() {
      // O som já acabou sozinho: fazer fade de silêncio só atrasaria o fundo.
      main.cut()
      onTransport?.('main', 'pause')
      afterMainFadeOut = null
      pendingAtSilence.main = null
      if (autoReturn) enterBackground()
      else setMode('silence')
    },

    playBackground() {
      const now = wake()
      if (main.getPhase() !== 'silent') {
        // Trocar louvor por fundo é sequencial, não crossfade: o fundo entra
        // quando o louvor termina de sair (ver a revisão da Parte 5b).
        pendingAtSilence.main = null
        afterMainFadeOut = 'background'
        main.fadeOut(now)
        setMode('background')
        return
      }
      enterBackground()
    },

    stopBackground(onSilent) {
      const now = wake()
      if (background.getPhase() === 'silent') {
        pendingAtSilence.background = null
        onSilent?.()
        if (mode === 'background') setMode('silence')
        return
      }

      pendingAtSilence.background = onSilent
        ? { run: onSilent, resume: false }
        : null
      background.fadeOut(now)
      if (mode === 'background') setMode('silence')
    },

    silence() {
      const now = wake()
      // Standby é explícito: o fundo não volta sozinho depois disso.
      afterMainFadeOut = 'silence'
      pendingAtSilence.main = null
      pendingAtSilence.background = null
      main.fadeOut(now)
      background.fadeOut(now)
      setMode('silence')
    },

    setFader(channel, value) {
      channels[channel].setFader(value)
      schedule()
    },

    getFader: (channel) => channels[channel].getFader(),

    setFadeMs(channel, ms) {
      channels[channel].setFadeMs(ms)
    },

    getFadeMs: (channel) => channels[channel].getFadeMs(),

    setMuted(channel, muted) {
      channels[channel].setMuted(muted)
      schedule()
    },

    setAutoReturnBackground(enabled) {
      autoReturn = enabled
    },

    isAutoReturnBackgroundEnabled: () => autoReturn,

    destroy() {
      destroyed = true
      if (frame !== null) scheduler.cancel(frame)
      frame = null
    },
  }
}
