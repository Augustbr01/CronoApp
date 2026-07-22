import { fadeGain, fadeProgress, fadeProgressForGain } from './fade'
import type { FadeDirection } from './fade'
import { approach, normalizeFader } from './smoothing'
import { composeVolume, snapToMute } from './volume'

/**
 * Motor de um canal de áudio.
 *
 * Junta as três peças puras das partes anteriores num objeto só que sabe
 * responder, a qualquer instante: **que volume este canal deve estar tocando
 * agora?**
 *
 *   fader do operador ──(snap-to-mute, suavização)──┐
 *                                                   ├─→ volume final (0–1)
 *   fade em andamento ──(curva de potência)─────────┘
 *
 * Duas regras de ouro herdadas do CLAUDE.md:
 *
 * - **É genérico** (RNF-01.2). O mesmo código serve ao louvor e ao fundo; o que
 *   muda é a configuração. O protótipo tinha dois blocos quase idênticos.
 * - **Não tem relógio próprio** (RNF-01.1). Quem chama passa o instante em
 *   `tick(agora)`. Sem `setTimeout`, sem `requestAnimationFrame`, sem DOM — o
 *   canal inteiro é testável com números. O laço por quadro entra na Parte 2.5b,
 *   junto com o crossfade.
 */

/** Duração de fade padrão, em ms (RF-04.12: configurável de 0 a 8 s). */
export const DEFAULT_FADE_MS = 2_000

/** O que o operador vê como estado do canal. */
export type ChannelPhase = 'silent' | 'fading-in' | 'on-air' | 'fading-out'

/**
 * O fade em andamento, do jeito que o aviso flutuante precisa ver (RF-05.5).
 *
 * `remainingMs` é o que vira a contagem regressiva e `durationMs` é o que vira a
 * barra de progresso. Os dois saem da **corrida atual**, não da preferência do
 * operador: uma reversão no meio do caminho (RF-04.10) é mais curta que o fade
 * cheio, e o aviso tem que contar o tempo que realmente falta.
 */
export interface ChannelFade {
  direction: FadeDirection
  remainingMs: number
  durationMs: number
}

export interface ChannelOptions {
  /** Duração do fade de entrada, em ms. */
  fadeInMs?: number
  /** Duração do fade de saída, em ms. */
  fadeOutMs?: number
  /** Posição inicial do fader, escala 0–100. */
  fader?: number
  /** Avisado quando o volume final muda — é quem manda o número ao player. */
  onVolume?: (volume: number) => void
  /** Avisado quando um fade termina; `'out'` é a deixa para pausar o player. */
  onFadeEnd?: (direction: FadeDirection) => void
}

export interface Channel {
  /** Move o fader do operador (0–100). Aplica o snap-to-mute (RF-04.9). */
  setFader(value: number): void
  getFader(): number
  /**
   * Troca a duração dos fades (RF-04.12), sem interromper o que já está
   * correndo — mudar o ajuste no meio de uma rampa não deve dar tranco.
   */
  setFadeMs(ms: number): void
  getFadeMs(): number
  /** Mudo binário: garante silêncio na hora, sem esperar a suavização. */
  setMuted(muted: boolean): void
  isMuted(): boolean
  /** Começa a entrar no ar (RF-04.3). Reverte um fade-out em andamento. */
  fadeIn(now: number): void
  /** Começa a sair do ar (RF-04.4). Reverte um fade-in em andamento. */
  fadeOut(now: number): void
  /**
   * Sai do ar **na hora**, sem fade e sem anunciar fim de fade.
   *
   * Não é atalho para o `fadeOut` — é para quando o áudio já acabou sozinho (o
   * vídeo chegou ao fim). Fazer fade de um som que não existe mais só atrasaria
   * o retorno do fundo.
   */
  cut(): void
  /** Avança o canal até o instante `now` e devolve o volume final (0–1). */
  tick(now: number): number
  getVolume(): number
  getPhase(): ChannelPhase
  /** O fade em andamento, ou `null` — é o que alimenta o aviso do RF-05.5. */
  getFade(): ChannelFade | null
  /** `true` quando não há mais nada a fazer — o laço por quadro pode dormir. */
  isIdle(): boolean
}

interface FadeRun {
  direction: FadeDirection
  startedAt: number
  durationMs: number
  /** De onde a curva parte — não é sempre 0 (ver `reverse`, RF-04.10). */
  startProgress: number
}

export function createChannel(options: ChannelOptions = {}): Channel {
  const { fader: initialFader = 100, onVolume, onFadeEnd } = options

  let fadeInMs = options.fadeInMs ?? DEFAULT_FADE_MS
  let fadeOutMs = options.fadeOutMs ?? DEFAULT_FADE_MS

  let faderValue = snapToMute(initialFader)
  let faderTarget = normalizeFader(faderValue)
  // O fader suavizado já começa no alvo: ninguém quer ouvir o volume "subindo
  // sozinho" na primeira vez que o canal entra no ar — quem faz essa subida é o
  // fade, não a suavização.
  let faderSmoothed = faderTarget
  // Mudo do botão, coisa separada do fader estar no zero. Os dois silenciam o
  // canal, e é a composição que junta os dois (RF-04.8).
  let muted = false

  // Ganho do fade. Começa em 0: um canal recém-criado está fora do ar, e o
  // fade-in sempre parte do silêncio (RF-04.3).
  let gain = 0
  let fade: FadeRun | null = null
  let volume = 0
  // Quanto já correu da rampa atual, atualizado a cada `tick`. Guardado aqui
  // porque o canal não tem relógio próprio (RNF-01.1): sem isso, `getFade()`
  // não teria como saber quanto tempo falta sem receber o "agora" de novo.
  let fadeElapsed = 0

  const publish = (next: number): number => {
    if (next !== volume) {
      volume = next
      onVolume?.(next)
    }
    return volume
  }

  const compose = (): number =>
    composeVolume(faderSmoothed, gain, muted || faderValue === 0)

  const durationFor = (direction: FadeDirection): number =>
    direction === 'in' ? fadeInMs : fadeOutMs

  /**
   * Vira a direção do fade **a partir do ganho atual** (RF-04.10).
   *
   * O detalhe que faz isso soar bem: a nova corrida não começa do zero, e sim do
   * ponto da nova curva que vale o ganho de agora. Sem isso, o operador que se
   * arrepende no meio de um fade-out ouviria um salto de volume. O preço é que a
   * volta é mais curta que a ida — o que é o desejado: ele quer o som de volta,
   * não uma subida completa.
   */
  const start = (direction: FadeDirection, now: number): void => {
    const startProgress = fadeProgressForGain(direction, gain)
    fadeElapsed = 0
    fade = {
      direction,
      startedAt: now,
      // O trecho que falta é percorrido na mesma VELOCIDADE do fade cheio:
      // reverter a 90% do caminho leva 10% do tempo, não o tempo inteiro. É o
      // que faz a reversão soar como "voltar", e não como um fade novo.
      durationMs: durationFor(direction) * (1 - startProgress),
      startProgress,
    }
  }

  return {
    setFader(value) {
      faderValue = snapToMute(value)
      faderTarget = normalizeFader(faderValue)
    },

    getFader() {
      return faderValue
    },

    setFadeMs(ms) {
      const safe = Math.max(0, ms)
      fadeInMs = safe
      fadeOutMs = safe
    },

    getFadeMs() {
      return fadeInMs
    },

    setMuted(next) {
      muted = next
    },

    isMuted() {
      return muted || faderValue === 0
    },

    fadeIn(now) {
      if (gain >= 1 && fade === null) return
      start('in', now)
    },

    fadeOut(now) {
      if (gain <= 0 && fade === null) return
      start('out', now)
    },

    cut() {
      fade = null
      fadeElapsed = 0
      gain = 0
      publish(compose())
    },

    tick(now) {
      // 1. O fader persegue suavemente onde o operador o deixou (RF-04.7).
      faderSmoothed = approach(faderSmoothed, faderTarget)

      // 2. O fade avança pela curva de potência constante (RF-04.6).
      if (fade) {
        const elapsed = Math.max(0, now - fade.startedAt)
        fadeElapsed = elapsed
        const ran = fadeProgress(elapsed, fade.durationMs)
        // A corrida cobre só o trecho que falta da curva, por isso o
        // `startProgress`: uma reversão no meio do caminho não recomeça do zero.
        const progress = fade.startProgress + ran * (1 - fade.startProgress)
        gain = fadeGain(fade.direction, progress)

        if (progress >= 1) {
          const { direction } = fade
          fade = null
          fadeElapsed = 0
          gain = direction === 'in' ? 1 : 0
          const result = publish(compose())
          onFadeEnd?.(direction)
          return result
        }
      }

      // 3. Volume final = fader suavizado × ganho, com mudo garantido (RF-04.8).
      return publish(compose())
    },

    getVolume() {
      return volume
    },

    getPhase() {
      if (fade) return fade.direction === 'in' ? 'fading-in' : 'fading-out'
      return gain > 0 ? 'on-air' : 'silent'
    },

    getFade() {
      if (!fade) return null
      return {
        direction: fade.direction,
        remainingMs: Math.max(0, fade.durationMs - fadeElapsed),
        durationMs: fade.durationMs,
      }
    },

    isIdle() {
      // Igualdade exata, e não "perto o bastante": o `approach` gruda no alvo
      // assim que chega perto, então parar antes disso deixaria o volume
      // parado a um passo do lugar — para sempre, já que o laço só acorda com
      // um comando novo.
      return fade === null && faderSmoothed === faderTarget
    },
  }
}
