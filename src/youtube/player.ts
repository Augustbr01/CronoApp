import { loadYouTubeIframeApi } from './api-loader'
import { PLAYER_ERROR, describePlayerError } from './errors'
import type { PlayerErrorInfo } from './errors'
import { PLAYER_STATE } from './types'
import type {
  PlayerOptions,
  PlayerStateCode,
  PlayerVars,
  YouTubePlayerInstance,
} from './types'

/**
 * Wrapper do player do YouTube — a interface própria do CronoApp por cima do
 * iframe deles (ADR 0002).
 *
 * Duas coisas justificam o wrapper existir, além de trocar o `react-player`:
 *
 * 1. **Escala de volume.** O YouTube pensa em 0–100; o motor de áudio pensa em
 *    0–1. A conversão mora aqui, num lugar só, para o motor nunca precisar
 *    lembrar disso.
 * 2. **Silêncio vira erro.** Se o operador dá play e o som não começa, o YouTube
 *    não reclama — fica bufferizando calado. Ao vivo isso é o pior caso: o
 *    operador olhando uma tela que diz "tocando" e a igreja em silêncio. Aqui um
 *    cronômetro transforma esse silêncio em erro visível em 5 segundos.
 */

/**
 * Quanto tempo o operador espera, depois do play, antes de o silêncio virar
 * erro. Vale também para o player ficar pronto: se a API ainda estiver
 * carregando quando o play acontecer, essa espera cabe dentro deste mesmo
 * orçamento — do ponto de vista do operador, é tudo "dei play e não saiu som".
 */
export const PLAYBACK_TIMEOUT_MS = 5_000

/** Ajustes do iframe: sem controles, sem sugestões, sem marca — é uma mesa de som. */
const DEFAULT_PLAYER_VARS: PlayerVars = {
  autoplay: 0,
  controls: 0,
  disablekb: 1,
  playsinline: 1,
  rel: 0,
  modestbranding: 1,
}

export interface CreatePlayerOptions {
  /** Elemento da página que o iframe do YouTube vai substituir. */
  host: HTMLElement
  /** Vídeo inicial, opcional — dá para criar o player vazio e carregar depois. */
  videoId?: string
  /** Avisado a cada mudança de estado (tocando, pausado, bufferizando…). */
  onStateChange?: (state: PlayerStateCode) => void
  /** Avisado a cada erro, já traduzido para o operador (RNF-03.3). */
  onError?: (error: PlayerErrorInfo) => void
  /** Sobrescreve o prazo do cronômetro. Existe para os testes. */
  playbackTimeoutMs?: number
  /** Ajustes extras do iframe, mesclados sobre os padrões. */
  playerVars?: PlayerVars
}

/** Um canal de áudio do CronoApp — louvor ou fundo — em cima de um player. */
export interface YouTubeChannel {
  /** Carrega e já começa a tocar. Arma o cronômetro. */
  load(videoId: string, startSeconds?: number): void
  /** Carrega sem tocar (deixa engatilhado). Não arma o cronômetro. */
  cue(videoId: string, startSeconds?: number): void
  play(): void
  pause(): void
  stop(): void
  /** Volume em **0–1**; a conversão para os 0–100 do YouTube acontece aqui. */
  setVolume(level: number): void
  /** Volume atual em **0–1**. */
  getVolume(): number
  getState(): PlayerStateCode
  getCurrentTime(): number
  getDuration(): number
  /** Desmonta o iframe e desarma o cronômetro. */
  destroy(): void
}

/**
 * Cria um canal: carrega a API se preciso, monta o iframe e só resolve quando o
 * player está pronto para receber comandos. Rejeita — em vez de ficar pendurado
 * — se a API não carregar ou se o player não responder no prazo.
 */
export async function createYouTubeChannel(
  options: CreatePlayerOptions,
): Promise<YouTubeChannel> {
  const {
    host,
    videoId,
    onStateChange,
    onError,
    playbackTimeoutMs = PLAYBACK_TIMEOUT_MS,
    playerVars,
  } = options

  const api = await loadYouTubeIframeApi()

  let watchdog: ReturnType<typeof setTimeout> | undefined
  let lastState: PlayerStateCode = PLAYER_STATE.UNSTARTED
  let destroyed = false

  const disarm = (): void => {
    if (watchdog !== undefined) clearTimeout(watchdog)
    watchdog = undefined
  }

  const report = (code: number): void => {
    disarm()
    onError?.(describePlayerError(code))
  }

  /**
   * Liga o cronômetro do silêncio. Só uma corrida por vez: rearmar cancela a
   * anterior, e qualquer coisa que "resolva" o play a desarma (RNF-04.2).
   */
  const arm = (): void => {
    disarm()
    watchdog = setTimeout(() => {
      watchdog = undefined
      onError?.(describePlayerError(PLAYER_ERROR.PLAYBACK_TIMEOUT))
    }, playbackTimeoutMs)
  }

  const player = await new Promise<YouTubePlayerInstance>((resolve, reject) => {
    /** Já resolvemos ou desistimos? Depois disso, o player não tem mais dono. */
    let settled = false
    /**
     * O que o construtor devolveu, guardado só para o caso de desistirmos.
     *
     * Um player que fica pronto **depois** do prazo é um iframe órfão: ninguém
     * mais o comanda, mas ele continua na página, carregado — e, se o vídeo
     * inicial veio na configuração, tocando. Guardar a referência é o que
     * permite desmontá-lo nos dois caminhos possíveis (RNF-04.2): o construtor
     * já ter retornado quando o prazo estoura, ou o `onReady` chegar atrasado.
     */
    let created: YouTubePlayerInstance | null = null

    const readyTimer = setTimeout(() => {
      settled = true
      created?.destroy()
      reject(
        new Error(describePlayerError(PLAYER_ERROR.PLAYER_NOT_READY).message),
      )
    }, playbackTimeoutMs)

    /**
     * A IFrame API valida a **presença da chave**, não o valor: passar
     * `videoId: undefined` explicitamente faz o construtor lançar
     * `Invalid video id` e o player nunca nasce. Omitir a chave cria o player
     * vazio, pronto para receber `loadVideoById` depois — que é exatamente como
     * o CronoApp o usa (um player por canal, do começo ao fim do culto).
     *
     * Custou caro descobrir: o sintoma era o painel inteiro em silêncio, com a
     * topbar anunciando NO AR.
     */
    const config: PlayerOptions = {
      playerVars: {
        ...DEFAULT_PLAYER_VARS,
        ...playerVars,
        origin: playerVars?.origin ?? window.location.origin,
      },
      events: {
        onReady: (event) => {
          // Chegou tarde: quem pediu já desistiu e seguiu a vida. Deixar este
          // player de pé seria um iframe tocando sem ninguém no comando.
          if (settled) {
            event.target.destroy()
            return
          }
          settled = true
          clearTimeout(readyTimer)
          resolve(event.target)
        },
        onStateChange: (event) => {
          lastState = toPlayerState(event.data)
          // Som saindo, pausa pedida ou vídeo acabado: a espera terminou, de um
          // jeito ou de outro. Bufferizando NÃO desarma — buffer eterno é
          // exatamente o silêncio que estamos caçando.
          if (
            lastState === PLAYER_STATE.PLAYING ||
            lastState === PLAYER_STATE.PAUSED ||
            lastState === PLAYER_STATE.ENDED
          ) {
            disarm()
          }
          onStateChange?.(lastState)
        },
        onError: (event) => {
          // O YouTube já disse o que houve; o cronômetro não tem mais o que
          // acrescentar (seria um segundo alerta pelo mesmo problema).
          report(event.data)
        },
      },
    }

    // Só entra na configuração quando existe de verdade — ver o comentário
    // acima.
    if (videoId !== undefined) config.videoId = videoId

    // O player chega em `event.target` de propósito: o construtor ainda não
    // retornou quando o `onReady` pode disparar, então usar o valor do evento
    // evita depender dessa ordem. O retorno é guardado à parte, e só serve para
    // desmontar o que ficou para trás quando o prazo estoura.
    created = new api.Player(host, config)
  })

  const guard = (action: (target: YouTubePlayerInstance) => void): void => {
    if (destroyed) return
    action(player)
  }

  return {
    load(id, startSeconds) {
      guard((target) => {
        arm()
        target.loadVideoById(id, startSeconds)
      })
    },
    cue(id, startSeconds) {
      guard((target) => {
        disarm()
        target.cueVideoById(id, startSeconds)
      })
    },
    play() {
      guard((target) => {
        arm()
        target.playVideo()
      })
    },
    pause() {
      guard((target) => {
        disarm()
        target.pauseVideo()
      })
    },
    stop() {
      guard((target) => {
        disarm()
        target.stopVideo()
      })
    },
    setVolume(level) {
      guard((target) => {
        target.setVolume(toYouTubeVolume(level))
      })
    },
    getVolume() {
      if (destroyed) return 0
      return player.getVolume() / 100
    },
    getState() {
      if (destroyed) return PLAYER_STATE.UNSTARTED
      return toPlayerState(player.getPlayerState())
    },
    getCurrentTime() {
      return destroyed ? 0 : player.getCurrentTime()
    },
    getDuration() {
      return destroyed ? 0 : player.getDuration()
    },
    destroy() {
      if (destroyed) return
      destroyed = true
      disarm()
      player.destroy()
    },
  }
}

/**
 * Converte o volume do motor (0–1) para o do YouTube (0–100 inteiro), prendendo
 * o que sair da escala. Note que o clamp é feito aqui, na mão, em vez de
 * importar o `clamp01` do motor de áudio: `youtube/` e `audio/` são domínios
 * irmãos e nenhum depende do outro.
 */
export function toYouTubeVolume(level: number): number {
  if (Number.isNaN(level)) return 0
  return Math.round(Math.max(0, Math.min(1, level)) * 100)
}

const KNOWN_STATES: readonly number[] = Object.values(PLAYER_STATE)

function isPlayerState(raw: number): raw is PlayerStateCode {
  return KNOWN_STATES.includes(raw)
}

/** Estado cru do YouTube → um código conhecido. O que não conhecemos vira "parado". */
export function toPlayerState(raw: number): PlayerStateCode {
  return isPlayerState(raw) ? raw : PLAYER_STATE.UNSTARTED
}
