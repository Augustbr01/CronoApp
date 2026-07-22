import { createMixer } from './mixer'
import type { ChannelName, Mixer, MixerMode, TransportAction } from './mixer'
import { createFakeScheduler } from '../test/fake-scheduler'
import type { FakeScheduler } from '../test/fake-scheduler'

const FADE_MS = 2000

interface Setup {
  mixer: Mixer
  clock: FakeScheduler
  transport: `${ChannelName}:${TransportAction}`[]
  modos: MixerMode[]
}

function setup(options: { autoReturn?: boolean } = {}): Setup {
  const clock = createFakeScheduler()
  const transport: `${ChannelName}:${TransportAction}`[] = []
  const modos: MixerMode[] = []

  const mixer = createMixer({
    scheduler: clock,
    mainFadeMs: FADE_MS,
    backgroundFadeMs: FADE_MS,
    autoReturnBackground: options.autoReturn ?? true,
    onTransport: (channel, action) => transport.push(`${channel}:${action}`),
    onModeChange: (mode) => modos.push(mode),
  })

  return { mixer, clock, transport, modos }
}

/** Deixa o fundo tocando no volume cheio, que é como o culto começa. */
function comFundoNoAr(s: Setup): void {
  s.mixer.playBackground()
  s.clock.advance(FADE_MS)
}

describe('modos (RF-04.1)', () => {
  it('começa em standby, com tudo em silêncio', () => {
    const { mixer } = setup()

    expect(mixer.getMode()).toBe('silence')
    expect(mixer.getVolume('main')).toBe(0)
    expect(mixer.getVolume('background')).toBe(0)
  })

  it('entra no ar com o louvor e volta ao fundo ao parar', () => {
    const s = setup()
    comFundoNoAr(s)
    expect(s.mixer.getMode()).toBe('background')

    s.mixer.playMain()
    s.clock.advance(FADE_MS)
    expect(s.mixer.getMode()).toBe('main')

    s.mixer.stopMain()
    s.clock.advance(FADE_MS * 2)
    expect(s.mixer.getMode()).toBe('background')
    expect(s.mixer.getVolume('background')).toBeCloseTo(1, 6)
  })

  it('o standby tira os dois do ar e não traz o fundo de volta', () => {
    const s = setup()
    comFundoNoAr(s)
    s.mixer.playMain()
    s.clock.advance(FADE_MS)

    s.mixer.silence()
    s.clock.advance(FADE_MS * 3)

    expect(s.mixer.getMode()).toBe('silence')
    expect(s.mixer.getVolume('main')).toBe(0)
    expect(s.mixer.getVolume('background')).toBe(0)
  })
})

describe('crossfade fundo→louvor (RF-04.5 e RF-04.6)', () => {
  it('desce o fundo EM PARALELO com a subida do louvor', () => {
    const s = setup()
    comFundoNoAr(s)

    s.mixer.playMain()
    s.clock.advance(FADE_MS / 2)

    const louvor = s.mixer.getVolume('main')
    const fundo = s.mixer.getVolume('background')

    // No meio da transição os dois estão soando ao mesmo tempo — é isso que
    // faz a troca não ter buraco.
    expect(louvor).toBeGreaterThan(0.6)
    expect(fundo).toBeGreaterThan(0.6)
  })

  it('mantém a potência somada constante — sem buraco no meio', () => {
    const s = setup()
    comFundoNoAr(s)
    s.mixer.playMain()

    // Confere ao longo de todo o percurso, não só no meio.
    for (let passo = 0; passo < 10; passo += 1) {
      s.clock.advance(FADE_MS / 10)
      const potencia =
        s.mixer.getVolume('main') ** 2 + s.mixer.getVolume('background') ** 2
      expect(potencia).toBeCloseTo(1, 2)
    }
  })

  it('mantém o player do fundo TOCANDO durante a descida', () => {
    const s = setup()
    comFundoNoAr(s)
    s.transport.length = 0

    s.mixer.playMain()
    s.clock.advance(FADE_MS / 2)

    // No meio do crossfade o fundo ainda não pausou: ele está descendo, e para
    // descer precisa estar tocando.
    expect(s.transport).toEqual(['main:play'])
    expect(s.mixer.getVolume('background')).toBeGreaterThan(0)

    s.clock.advance(FADE_MS)
    expect(s.transport).toEqual(['main:play', 'background:pause'])
  })

  it('manda tocar o louvor antes de começar a subida, não depois', () => {
    const s = setup()

    s.mixer.playMain()

    // O play tem que sair na hora do comando: se esperasse o fade, o começo da
    // música seria engolido.
    expect(s.transport).toEqual(['main:play'])
    expect(s.mixer.getVolume('main')).toBe(0)
  })
})

describe('retorno automático do fundo (RF-04.11)', () => {
  it('volta sozinho quando o vídeo do louvor acaba', () => {
    const s = setup()
    comFundoNoAr(s)
    s.mixer.playMain()
    s.clock.advance(FADE_MS * 2)
    s.transport.length = 0

    s.mixer.mainEnded()

    // Sem fade de despedida: o som já acabou sozinho, o fundo entra na hora.
    expect(s.transport).toEqual(['main:pause', 'background:play'])
    s.clock.advance(FADE_MS)
    expect(s.mixer.getMode()).toBe('background')
    expect(s.mixer.getVolume('background')).toBeCloseTo(1, 6)
  })

  it('não volta quando o retorno está desligado (momento de oração)', () => {
    const s = setup({ autoReturn: false })
    comFundoNoAr(s)
    s.mixer.playMain()
    s.clock.advance(FADE_MS * 2)

    s.mixer.stopMain()
    s.clock.advance(FADE_MS * 3)

    expect(s.mixer.getMode()).toBe('silence')
    expect(s.mixer.getVolume('background')).toBe(0)
  })

  it('deixa o operador trazer o fundo na mão a qualquer momento', () => {
    const s = setup({ autoReturn: false })
    s.mixer.playMain()
    s.clock.advance(FADE_MS)
    s.mixer.stopMain()
    s.clock.advance(FADE_MS * 2)
    expect(s.mixer.getMode()).toBe('silence')

    s.mixer.playBackground()
    s.clock.advance(FADE_MS)

    expect(s.mixer.getMode()).toBe('background')
    expect(s.mixer.getVolume('background')).toBeCloseTo(1, 6)
  })

  it('vale a escolha de quando o operador mandou parar', () => {
    const s = setup({ autoReturn: true })
    comFundoNoAr(s)
    s.mixer.playMain()
    s.clock.advance(FADE_MS * 2)

    s.mixer.stopMain()
    // Ele desliga o retorno DEPOIS de mandar parar; a ordem já dada continua
    // valendo, senão o fundo sumiria no meio do caminho sem explicação.
    s.mixer.setAutoReturnBackground(false)
    s.clock.advance(FADE_MS * 3)

    expect(s.mixer.getMode()).toBe('background')
  })

  it('troca de louvor para fundo esperando o louvor sair', () => {
    const s = setup()
    s.mixer.playMain()
    s.clock.advance(FADE_MS)
    s.transport.length = 0

    s.mixer.playBackground()
    expect(s.mixer.getMode()).toBe('background')
    // O fundo ainda não entrou: primeiro o louvor sai.
    expect(s.transport).toEqual([])

    s.clock.advance(FADE_MS)
    expect(s.transport).toEqual(['main:pause', 'background:play'])
  })
})

describe('cancelamento (RF-04.10)', () => {
  it('desistir da saída do louvor não pausa o player nem traz o fundo', () => {
    const s = setup()
    comFundoNoAr(s)
    s.mixer.playMain()
    s.clock.advance(FADE_MS * 2)
    s.transport.length = 0

    s.mixer.stopMain()
    s.clock.advance(FADE_MS / 2)
    s.mixer.playMain()
    s.clock.advance(FADE_MS * 3)

    // Nenhuma pausa, nenhum fundo: como se ele nunca tivesse mandado parar.
    expect(s.transport).toEqual([])
    expect(s.mixer.getMode()).toBe('main')
    expect(s.mixer.getVolume('main')).toBeCloseTo(1, 6)
    expect(s.mixer.getVolume('background')).toBe(0)
  })
})

describe('laço por quadro (RNF-04.2 e RNF-04.3)', () => {
  it('dorme quando não há nada acontecendo', () => {
    const s = setup()
    expect(s.clock.pending()).toBe(0)

    s.mixer.playMain()
    expect(s.clock.pending()).toBe(1)

    s.clock.advance(FADE_MS * 2)

    // Fade terminou e o fader assentou: nada a fazer, o laço para de girar.
    expect(s.clock.pending()).toBe(0)
  })

  it('acorda quando o operador mexe no fader', () => {
    const s = setup()
    s.mixer.playMain()
    s.clock.advance(FADE_MS * 2)
    expect(s.clock.pending()).toBe(0)

    s.mixer.setFader('main', 40)

    expect(s.clock.pending()).toBe(1)
  })

  it('solta o quadro agendado ao ser destruído', () => {
    const s = setup()
    s.mixer.playMain()
    expect(s.clock.pending()).toBe(1)

    s.mixer.destroy()

    expect(s.clock.pending()).toBe(0)
  })

  it('não agenda mais nada depois de destruído', () => {
    const s = setup()
    s.mixer.destroy()

    s.mixer.playMain()
    s.mixer.setFader('main', 50)

    expect(s.clock.pending()).toBe(0)
  })
})

describe('faders dos dois canais', () => {
  it('mexe em um canal sem tocar no outro (RNF-01.2)', () => {
    const s = setup()
    comFundoNoAr(s)

    s.mixer.setFader('background', 40)
    s.clock.advance(1000)

    expect(s.mixer.getFader('background')).toBe(40)
    expect(s.mixer.getFader('main')).toBe(100)
    expect(s.mixer.getVolume('background')).toBeCloseTo(0.4, 10)
  })

  it('o mudo de um canal não silencia o outro', () => {
    const s = setup()
    comFundoNoAr(s)
    s.mixer.playMain()
    s.clock.advance(FADE_MS / 2)

    s.mixer.setMuted('main', true)
    s.clock.advance(100)

    expect(s.mixer.getVolume('main')).toBe(0)
    expect(s.mixer.getVolume('background')).toBeGreaterThan(0)
  })
})

describe('troca de faixa sem corte seco (RF-04.4)', () => {
  it('desce até o silêncio, troca ali e sobe de novo', () => {
    const s = setup()
    s.mixer.playMain()
    s.clock.advance(FADE_MS)
    const trocas: number[] = []

    s.mixer.swap('main', () => trocas.push(s.mixer.getVolume('main')))

    // No meio da descida o vídeo novo ainda NÃO entrou.
    s.clock.advance(FADE_MS / 2)
    expect(trocas).toHaveLength(0)
    expect(s.mixer.getVolume('main')).toBeGreaterThan(0)

    // A troca acontece no fundo do poço.
    s.clock.advance(FADE_MS / 2)
    expect(trocas).toEqual([0])

    // E o canal volta a subir sozinho.
    s.clock.advance(FADE_MS)
    expect(s.mixer.getVolume('main')).toBeCloseTo(1, 6)
    expect(s.mixer.getMode()).toBe('main')
  })

  it('não devolve o fundo no meio da troca de música', () => {
    const s = setup()
    comFundoNoAr(s)
    s.mixer.playMain()
    s.clock.advance(FADE_MS * 2)

    s.mixer.swap('main', () => {})
    s.clock.advance(FADE_MS * 3)

    expect(s.mixer.getMode()).toBe('main')
    expect(s.mixer.getVolume('background')).toBe(0)
  })

  it('serve igual ao fundo — é o "Mix agora" (RF-03.5)', () => {
    const s = setup()
    comFundoNoAr(s)
    const trocas: number[] = []

    s.mixer.swap('background', () => trocas.push(1))
    s.clock.advance(FADE_MS)
    expect(trocas).toEqual([1])
    expect(s.transport).toContain('background:pause')

    s.clock.advance(FADE_MS)
    expect(s.mixer.getVolume('background')).toBeCloseTo(1, 6)
    expect(s.mixer.getMode()).toBe('background')
  })

  it('com o canal em silêncio troca na hora e não liga som nenhum', () => {
    const s = setup()
    const trocas: number[] = []

    s.mixer.swap('background', () => trocas.push(1))
    s.clock.advance(FADE_MS * 2)

    expect(trocas).toEqual([1])
    expect(s.mixer.getVolume('background')).toBe(0)
    expect(s.mixer.getMode()).toBe('silence')
  })

  it('cancelar o louvor no meio da troca cancela a troca junto (RF-04.10)', () => {
    const s = setup()
    s.mixer.playMain()
    s.clock.advance(FADE_MS)
    const trocas: number[] = []

    s.mixer.swap('main', () => trocas.push(1))
    s.clock.advance(FADE_MS / 2)
    s.mixer.playMain()
    s.clock.advance(FADE_MS * 3)

    expect(trocas).toHaveLength(0)
    expect(s.mixer.getVolume('main')).toBeCloseTo(1, 6)
  })
})

describe('recomeço de faixa (RF-03.5)', () => {
  it('corta para o silêncio e sobe de novo com fade', () => {
    const s = setup()
    comFundoNoAr(s)

    s.mixer.restart('background')
    expect(s.mixer.getVolume('background')).toBe(0)
    expect(s.transport).toContain('background:play')

    s.clock.advance(FADE_MS / 2)
    expect(s.mixer.getVolume('background')).toBeGreaterThan(0)
    expect(s.mixer.getVolume('background')).toBeLessThan(1)

    s.clock.advance(FADE_MS / 2)
    expect(s.mixer.getVolume('background')).toBeCloseTo(1, 6)
  })
})

describe('pausa do louvor', () => {
  it('sai com fade e NÃO devolve o fundo', () => {
    const s = setup()
    comFundoNoAr(s)
    s.mixer.playMain()
    s.clock.advance(FADE_MS * 2)

    s.mixer.pauseMain()
    s.clock.advance(FADE_MS * 3)

    expect(s.mixer.getMode()).toBe('silence')
    expect(s.mixer.getVolume('main')).toBe(0)
    expect(s.mixer.getVolume('background')).toBe(0)
  })

  it('parar, ao contrário de pausar, devolve o fundo', () => {
    const s = setup()
    comFundoNoAr(s)
    s.mixer.playMain()
    s.clock.advance(FADE_MS * 2)

    s.mixer.stopMain()
    s.clock.advance(FADE_MS * 3)

    expect(s.mixer.getMode()).toBe('background')
    expect(s.mixer.getVolume('background')).toBeCloseTo(1, 6)
  })
})

describe('aviso de fade (RF-05.5)', () => {
  it('reporta direção e tempo restante por canal', () => {
    const s = setup()
    s.mixer.playMain()
    s.clock.advance(FADE_MS / 2)

    const fade = s.mixer.getFade('main')
    expect(fade?.direction).toBe('in')
    expect(fade?.remainingMs).toBeCloseTo(FADE_MS / 2, -1)
    expect(s.mixer.getFade('background')).toBeNull()
  })
})

describe('duração de fade em tempo real (RF-04.12)', () => {
  it('o ajuste do operador vale na próxima rampa', () => {
    const s = setup()
    s.mixer.setFadeMs('main', 500)
    expect(s.mixer.getFadeMs('main')).toBe(500)

    s.mixer.playMain()
    s.clock.advance(500)

    expect(s.mixer.getVolume('main')).toBeCloseTo(1, 6)
  })
})
