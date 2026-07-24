import { clamp01, createLocalAudioChannel } from './player'
import { LOCAL_ERROR, describeLocalError } from './errors'
import { PLAYER_STATE } from '../youtube/types'
import type { PlayerStateCode } from '../youtube/types'
import type { PlayerErrorInfo } from '../youtube/errors'

/**
 * O canal de áudio local sobre um `HTMLAudioElement` do jsdom. O jsdom não
 * implementa os métodos de mídia (`play`/`pause`), então os stubamos; e, como no
 * `fake-channel.ts`, **o tempo é do teste**: o elemento só "toca", "acaba" ou
 * "falha" quando o teste dispara o evento correspondente.
 */

let audio: HTMLAudioElement
let erros: PlayerErrorInfo[]
let estados: PlayerStateCode[]

beforeEach(() => {
  audio = new Audio()
  vi.spyOn(audio, 'play').mockImplementation(() => Promise.resolve())
  vi.spyOn(audio, 'pause').mockImplementation(() => {})
  erros = []
  estados = []
})

afterEach(() => {
  vi.restoreAllMocks()
})

function createChannel(): ReturnType<typeof createLocalAudioChannel> {
  return createLocalAudioChannel({
    createElement: () => audio,
    onError: (erro) => erros.push(erro),
    onStateChange: (estado) => estados.push(estado),
  })
}

/** Fabrica um `MediaError` de mentira e o pendura no elemento, como o navegador faz. */
function comMediaError(code: number): void {
  Object.defineProperty(audio, 'error', { value: { code }, configurable: true })
}

describe('createLocalAudioChannel — comandos', () => {
  it('carrega apontando o src e já toca', () => {
    const channel = createChannel()

    channel.load('blob:abc')

    expect(audio.getAttribute('src')).toBe('blob:abc')
    expect(audio.play).toHaveBeenCalledTimes(1)
  })

  it('engatilha apontando o src, mas sem tocar', () => {
    const channel = createChannel()

    channel.cue('blob:xyz')

    expect(audio.getAttribute('src')).toBe('blob:xyz')
    expect(audio.play).not.toHaveBeenCalled()
  })

  it('play e pause repassam ao elemento', () => {
    const channel = createChannel()

    channel.play()
    channel.pause()

    expect(audio.play).toHaveBeenCalledTimes(1)
    expect(audio.pause).toHaveBeenCalledTimes(1)
  })

  it('stop pausa e volta ao início', () => {
    const channel = createChannel()
    audio.currentTime = 30

    channel.stop()

    expect(audio.pause).toHaveBeenCalled()
    expect(audio.currentTime).toBe(0)
  })
})

describe('volume', () => {
  it('prende o volume na escala 0–1 do motor', () => {
    const channel = createChannel()

    channel.setVolume(0.5)
    expect(audio.volume).toBe(0.5)

    channel.setVolume(1.5)
    expect(audio.volume).toBe(1)

    channel.setVolume(-1)
    expect(audio.volume).toBe(0)
  })

  it('getVolume devolve o volume atual do elemento', () => {
    const channel = createChannel()
    audio.volume = 0.3

    expect(channel.getVolume()).toBeCloseTo(0.3, 10)
  })

  it('clamp01 prende valores fora da escala e trata NaN', () => {
    expect(clamp01(1.5)).toBe(1)
    expect(clamp01(-0.2)).toBe(0)
    expect(clamp01(Number.NaN)).toBe(0)
    expect(clamp01(0.42)).toBe(0.42)
  })
})

describe('estado', () => {
  it('anuncia cada mudança de estado do elemento, traduzida', () => {
    createChannel()

    audio.dispatchEvent(new Event('playing'))
    audio.dispatchEvent(new Event('pause'))
    audio.dispatchEvent(new Event('ended'))

    expect(estados).toEqual([
      PLAYER_STATE.PLAYING,
      PLAYER_STATE.PAUSED,
      PLAYER_STATE.ENDED,
    ])
  })

  it('começa parado e reflete o último estado em getState', () => {
    const channel = createChannel()
    expect(channel.getState()).toBe(PLAYER_STATE.UNSTARTED)

    audio.dispatchEvent(new Event('playing'))
    expect(channel.getState()).toBe(PLAYER_STATE.PLAYING)
  })

  it('o fim do arquivo vira ENDED — é o que o motor reusa (RF-11)', () => {
    createChannel()

    audio.dispatchEvent(new Event('ended'))

    expect(estados).toEqual([PLAYER_STATE.ENDED])
  })

  it('bufferizar vira BUFFERING', () => {
    createChannel()

    audio.dispatchEvent(new Event('waiting'))

    expect(estados).toEqual([PLAYER_STATE.BUFFERING])
  })
})

describe('duração e tempo', () => {
  it('devolve duração 0 antes de os metadados chegarem', () => {
    const channel = createChannel()

    // audio.duration é NaN até o navegador ler os metadados.
    expect(channel.getDuration()).toBe(0)
  })

  it('devolve a duração do elemento quando conhecida', () => {
    const channel = createChannel()
    Object.defineProperty(audio, 'duration', { value: 212, configurable: true })

    expect(channel.getDuration()).toBe(212)
  })

  it('devolve a posição atual', () => {
    const channel = createChannel()
    audio.currentTime = 12

    expect(channel.getCurrentTime()).toBe(12)
  })

  it('aplica o startSeconds quando os metadados chegam', () => {
    const channel = createChannel()

    channel.load('blob:abc', 45)
    // Antes dos metadados, o seek fica pendente e a posição segue no zero.
    expect(audio.currentTime).toBe(0)

    audio.dispatchEvent(new Event('loadedmetadata'))
    expect(audio.currentTime).toBe(45)
  })
})

describe('erros — sem cronômetro, o navegador é quem avisa', () => {
  it('traduz o MediaError de decode do evento error (fatal)', () => {
    createChannel()
    comMediaError(LOCAL_ERROR.DECODE)

    audio.dispatchEvent(new Event('error'))

    expect(erros).toHaveLength(1)
    expect(erros[0]?.code).toBe(LOCAL_ERROR.DECODE)
    expect(erros[0]?.fatal).toBe(true)
    expect(erros[0]?.message).toMatch(/decodificar|corrompido/i)
  })

  it('trata codec não suportado como fatal', () => {
    createChannel()
    comMediaError(LOCAL_ERROR.UNSUPPORTED)

    audio.dispatchEvent(new Event('error'))

    expect(erros[0]?.fatal).toBe(true)
    expect(erros[0]?.message).toMatch(/formato/i)
  })

  it('load sem URL acusa arquivo ausente e não tenta tocar', () => {
    const channel = createChannel()

    channel.load('')

    expect(erros).toHaveLength(1)
    expect(erros[0]?.code).toBe(LOCAL_ERROR.NO_SOURCE)
    expect(erros[0]?.fatal).toBe(true)
    expect(audio.play).not.toHaveBeenCalled()
  })

  it('reprodução recusada pelo navegador (autoplay) vira erro visível na hora', async () => {
    vi.mocked(audio.play).mockImplementation(() =>
      Promise.reject(new DOMException('autoplay bloqueado', 'NotAllowedError')),
    )
    const channel = createChannel()

    channel.play()

    await vi.waitFor(() => {
      expect(erros).toHaveLength(1)
    })
    expect(erros[0]?.code).toBe(LOCAL_ERROR.PLAYBACK_BLOCKED)
  })

  it('interrupção do play (pause ou nova troca de src) NÃO vira alarme falso', async () => {
    // O Chrome rejeita o play pendente com AbortError quando um pause() ou uma
    // troca de src o interrompe — operação normal numa mesa de som, não falha.
    vi.mocked(audio.play).mockImplementation(() =>
      Promise.reject(
        new DOMException('interrompido por pause()', 'AbortError'),
      ),
    )
    const channel = createChannel()

    channel.play()

    await Promise.resolve()
    await Promise.resolve()
    expect(erros).toEqual([])
  })

  it('rejeição do play não duplica o alarme quando já há erro de mídia', async () => {
    comMediaError(LOCAL_ERROR.DECODE)
    vi.mocked(audio.play).mockImplementation(() =>
      Promise.reject(new DOMException('falhou', 'NotSupportedError')),
    )
    const channel = createChannel()

    // O evento error já reportou; a rejeição do play, com MediaError presente,
    // se cala para não gerar um segundo alerta pelo mesmo problema.
    audio.dispatchEvent(new Event('error'))
    channel.play()

    await Promise.resolve()
    await Promise.resolve()
    expect(erros).toHaveLength(1)
    expect(erros[0]?.code).toBe(LOCAL_ERROR.DECODE)
  })
})

describe('destroy', () => {
  it('para de reagir a eventos e a comandos depois de destruído (RNF-04.2)', () => {
    const channel = createChannel()

    channel.destroy()
    audio.dispatchEvent(new Event('playing'))
    channel.play()
    channel.setVolume(1)

    expect(estados).toEqual([])
    expect(audio.play).not.toHaveBeenCalled()
    expect(channel.getState()).toBe(PLAYER_STATE.UNSTARTED)
    expect(channel.getVolume()).toBe(0)
  })

  it('larga o src no destroy', () => {
    const channel = createChannel()
    channel.load('blob:abc')

    channel.destroy()

    expect(audio.getAttribute('src')).toBeNull()
  })

  it('rejeição do play que chega depois do destroy não reporta (RNF-04.2)', async () => {
    let rejeitar: (reason: unknown) => void = () => {}
    vi.mocked(audio.play).mockImplementation(
      () =>
        new Promise<void>((_, reject) => {
          rejeitar = reject
        }),
    )
    const channel = createChannel()
    channel.play()
    channel.destroy()

    // Mesmo um bloqueio real — que num canal vivo seria visível — se cala num
    // canal já destruído: o .catch é assíncrono e checa `destroyed`.
    rejeitar(new DOMException('bloqueado', 'NotAllowedError'))

    await Promise.resolve()
    await Promise.resolve()
    expect(erros).toEqual([])
  })

  it('aguenta destroy chamado duas vezes', () => {
    const channel = createChannel()

    channel.destroy()
    expect(() => channel.destroy()).not.toThrow()
  })
})

describe('describeLocalError', () => {
  it('marca decode, codec e arquivo ausente como fatais', () => {
    expect(describeLocalError(LOCAL_ERROR.DECODE).fatal).toBe(true)
    expect(describeLocalError(LOCAL_ERROR.UNSUPPORTED).fatal).toBe(true)
    expect(describeLocalError(LOCAL_ERROR.NO_SOURCE).fatal).toBe(true)
  })

  it('marca interrupção, leitura e bloqueio como não-fatais', () => {
    expect(describeLocalError(LOCAL_ERROR.ABORTED).fatal).toBe(false)
    expect(describeLocalError(LOCAL_ERROR.NETWORK).fatal).toBe(false)
    expect(describeLocalError(LOCAL_ERROR.PLAYBACK_BLOCKED).fatal).toBe(false)
  })

  it('código desconhecido cai no genérico não-fatal, citando o número', () => {
    const info = describeLocalError(999)
    expect(info.fatal).toBe(false)
    expect(info.message).toMatch(/999/)
  })
})
