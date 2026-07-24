import { LOCAL_ERROR, describeLocalError } from './errors'
import type { PlayerErrorInfo } from '../youtube/errors'
import type { MediaChannel } from '../youtube/player'
import { PLAYER_STATE } from '../youtube/types'
import type { PlayerStateCode } from '../youtube/types'

/**
 * O canal de áudio local — a segunda implementação do `MediaChannel`, ao lado do
 * wrapper do YouTube (RF-11).
 *
 * O motor (`engine.ts`) fala com os dois pela **mesma** interface, sem saber se
 * por baixo há um iframe ou este `<audio>`. Aqui o `id` do `load`/`cue` é uma
 * **object URL** já criada — quem a cria e a revoga é a costura, não este player
 * (RNF-04.2): o domínio `localaudio/` fica sem dependência do store, espelhando o
 * isolamento de `youtube/`.
 *
 * O que **não** existe aqui, e existe no YouTube, é de propósito:
 *
 * - **Sem cronômetro de 5 s.** No streaming o play pode falhar calado —
 *   bufferizando para sempre —, e só um watchdog transforma esse silêncio em
 *   erro. O arquivo local não tem esse modo: o `play()` devolve uma promessa que
 *   **rejeita na hora** se o som não vai sair, e o evento `error` avisa decode e
 *   codec. O navegador fala; não precisamos adivinhar.
 * - **Sem corrida cue/load.** O `cueVideoById`+`playVideo` do iframe viaja por
 *   `postMessage` e perde a corrida; aqui apontar o `src` e chamar `play()` são
 *   chamadas locais e síncronas.
 * - **Sem embed bloqueado.** Ninguém proíbe tocar o próprio arquivo.
 */

export interface CreateLocalChannelOptions {
  /** Avisado a cada mudança de estado (tocando, pausado, fim) — como o do YouTube. */
  onStateChange?: (state: PlayerStateCode) => void
  /** Avisado a cada erro, já traduzido para o operador (RNF-03.3). */
  onError?: (error: PlayerErrorInfo) => void
  /**
   * Como nasce o elemento `<audio>`. Existe para os testes injetarem um dublê
   * com os métodos de mídia stubados (o jsdom não os implementa); em produção o
   * padrão cria um `new Audio()`.
   */
  createElement?: () => HTMLAudioElement
}

/**
 * Cria um canal de áudio local sobre um `HTMLAudioElement`. Diferente do canal do
 * YouTube, é **síncrono**: não há API externa para carregar nem player para ficar
 * pronto — o elemento nasce pronto para receber comandos.
 */
export function createLocalAudioChannel(
  options: CreateLocalChannelOptions = {},
): MediaChannel {
  const { onStateChange, onError, createElement = () => new Audio() } = options

  const audio = createElement()
  // 'auto': o arquivo já está no dispositivo, então baixar tudo é de graça — e
  // deixa a faixa engatilhada (cue) pronta para entrar sem atraso no crossfade.
  audio.preload = 'auto'

  let destroyed = false
  let lastState: PlayerStateCode = PLAYER_STATE.UNSTARTED
  /** Posição a aplicar quando os metadados chegarem — o seek do `startSeconds`. */
  let pendingSeek: number | null = null

  const emit = (state: PlayerStateCode): void => {
    lastState = state
    onStateChange?.(state)
  }

  // --- eventos do elemento -------------------------------------------------

  const onPlaying = (): void => emit(PLAYER_STATE.PLAYING)
  const onPause = (): void => emit(PLAYER_STATE.PAUSED)
  const onWaiting = (): void => emit(PLAYER_STATE.BUFFERING)
  /** O fim do arquivo reusa o `handleState` do motor sem alteração (RF-11). */
  const onEnded = (): void => emit(PLAYER_STATE.ENDED)

  const onLoadedMetadata = (): void => {
    if (pendingSeek === null) return
    // Só agora o navegador aceita o seek; antes dos metadados ele o ignoraria.
    audio.currentTime = pendingSeek
    pendingSeek = null
  }

  const onErrorEvent = (): void => {
    // O `MediaError` traz o motivo (decode, codec, leitura); sem ele, tratamos
    // como decode, o modo de falha mais comum de um arquivo local.
    onError?.(describeLocalError(audio.error?.code ?? LOCAL_ERROR.DECODE))
  }

  audio.addEventListener('playing', onPlaying)
  audio.addEventListener('pause', onPause)
  audio.addEventListener('waiting', onWaiting)
  audio.addEventListener('ended', onEnded)
  audio.addEventListener('loadedmetadata', onLoadedMetadata)
  audio.addEventListener('error', onErrorEvent)

  // --- comandos ------------------------------------------------------------

  /**
   * Aponta o elemento para o arquivo. Devolve `false` quando não há URL — o item
   * local cujo blob sumiu do cofre: sem arquivo, não há o que tocar, e o operador
   * ouve o erro em vez de um silêncio inexplicado (RF-11.5).
   */
  const setSource = (url: string, startSeconds?: number): boolean => {
    // Zera o seek pendente sempre: uma fonte nova não herda o alvo da anterior,
    // nem quando a troca falha por falta de arquivo.
    pendingSeek = null
    if (!url) {
      onError?.(describeLocalError(LOCAL_ERROR.NO_SOURCE))
      return false
    }
    if (startSeconds !== undefined && startSeconds > 0)
      pendingSeek = startSeconds
    audio.src = url
    return true
  }

  /**
   * Pede o play e cuida da promessa que ele devolve. Uma rejeição tem três
   * origens, e só uma é erro de verdade:
   *
   * - **Interrupção** (`AbortError`): o navegador aborta o play pendente quando
   *   vem um `pause()` ou uma nova troca de `src` — o corriqueiro de uma mesa de
   *   som, não falha. `audio.error` fica `null`, então é preciso reconhecê-la
   *   pelo nome para não gritar um alarme falso ("a tela não pode mentir").
   * - **Falha de mídia** (decode/codec): o evento `error` já reportou e
   *   `audio.error` está preenchido — não duplicamos o alarme.
   * - **Bloqueio** (`NotAllowedError` e afins): o navegador recusou o som
   *   (autoplay/permissão). Este sim é visível ao operador (RNF-03.3).
   *
   * O `.catch` é assíncrono e não passa pelo `guard`, então checa `destroyed` na
   * mão: um play abortado pelo próprio `destroy` não pode reportar num canal que
   * já saiu de cena (RNF-04.2).
   */
  const startPlayback = (): void => {
    const result: unknown = audio.play()
    if (result instanceof Promise) {
      void result.catch((reason: unknown) => {
        if (destroyed) return
        if (reason instanceof DOMException && reason.name === 'AbortError')
          return
        if (audio.error) return
        onError?.(describeLocalError(LOCAL_ERROR.PLAYBACK_BLOCKED))
      })
    }
  }

  const guard = (action: () => void): void => {
    if (destroyed) return
    action()
  }

  return {
    load(url, startSeconds) {
      guard(() => {
        if (setSource(url, startSeconds)) startPlayback()
      })
    },
    cue(url, startSeconds) {
      // Engatilhar: aponta o arquivo e deixa o `preload` bufferizar, sem tocar.
      guard(() => {
        setSource(url, startSeconds)
      })
    },
    play() {
      guard(startPlayback)
    },
    pause() {
      guard(() => audio.pause())
    },
    stop() {
      guard(() => {
        audio.pause()
        audio.currentTime = 0
      })
    },
    setVolume(level) {
      guard(() => {
        audio.volume = clamp01(level)
      })
    },
    getVolume() {
      return destroyed ? 0 : audio.volume
    },
    getState() {
      return destroyed ? PLAYER_STATE.UNSTARTED : lastState
    },
    getCurrentTime() {
      return destroyed ? 0 : audio.currentTime
    },
    getDuration() {
      // `duration` é `NaN` antes dos metadados e pode vir `Infinity`; o motor só
      // quer um número > 0 para anotar, então o resto vira 0.
      if (destroyed) return 0
      return Number.isFinite(audio.duration) ? audio.duration : 0
    },
    destroy() {
      if (destroyed) return
      destroyed = true
      audio.removeEventListener('playing', onPlaying)
      audio.removeEventListener('pause', onPause)
      audio.removeEventListener('waiting', onWaiting)
      audio.removeEventListener('ended', onEnded)
      audio.removeEventListener('loadedmetadata', onLoadedMetadata)
      audio.removeEventListener('error', onErrorEvent)
      audio.pause()
      // Larga a referência ao arquivo. A object URL é da costura, que a revoga —
      // o player só solta o `src` (RNF-04.2).
      audio.removeAttribute('src')
      lastState = PLAYER_STATE.UNSTARTED
    },
  }
}

/** Prende o volume em 0–1; `NaN` vira 0, igual ao wrapper do YouTube. */
export function clamp01(level: number): number {
  if (Number.isNaN(level)) return 0
  return Math.max(0, Math.min(1, level))
}
