import { DEFAULT_FADE_MS, createChannel } from './channel'
import type { Channel } from './channel'
import type { FadeDirection } from './fade'

/**
 * O canal não tem relógio: quem manda no tempo é o teste. Estes ajudantes
 * simulam o laço por quadro que a Parte 2.5b vai rodar de verdade — 60 quadros
 * por segundo, cada um chamando `tick(agora)`.
 */
const FRAME_MS = 1000 / 60

/** Roda o canal por `durationMs` a partir de `from`, devolvendo o instante final. */
function run(channel: Channel, from: number, durationMs: number): number {
  const end = from + durationMs
  for (let t = from; t < end; t += FRAME_MS) channel.tick(t)
  channel.tick(end)
  return end
}

describe('fader e mudo', () => {
  it('parte com o fader onde foi configurado, mas em silêncio (fora do ar)', () => {
    const channel = createChannel({ fader: 80 })

    expect(channel.getFader()).toBe(80)
    expect(channel.tick(0)).toBe(0)
    expect(channel.getPhase()).toBe('silent')
  })

  it('aplica o snap-to-mute ao mover o fader (RF-04.9)', () => {
    const channel = createChannel()

    channel.setFader(2.5)
    expect(channel.getFader()).toBe(0)
    expect(channel.isMuted()).toBe(true)

    channel.setFader(3)
    expect(channel.getFader()).toBe(3)
    expect(channel.isMuted()).toBe(false)
  })

  it('silencia na hora quando o botão de mudo é ligado (RF-04.8)', () => {
    const channel = createChannel({ fader: 100 })
    channel.fadeIn(0)
    run(channel, 0, DEFAULT_FADE_MS)
    expect(channel.getVolume()).toBeCloseTo(1, 6)

    channel.setMuted(true)
    expect(channel.tick(DEFAULT_FADE_MS + FRAME_MS)).toBe(0)

    channel.setMuted(false)
    expect(channel.tick(DEFAULT_FADE_MS + 2 * FRAME_MS)).toBeGreaterThan(0.9)
  })

  it('o mudo do botão não é apagado por mexer no fader', () => {
    const channel = createChannel({ fader: 100 })
    channel.setMuted(true)

    channel.setFader(60)

    expect(channel.isMuted()).toBe(true)
  })

  it('persegue o fader suavemente em vez de saltar (RF-04.7)', () => {
    const channel = createChannel({ fader: 100 })
    channel.fadeIn(0)
    const now = run(channel, 0, DEFAULT_FADE_MS)
    expect(channel.getVolume()).toBeCloseTo(1, 6)

    // Arrasto brusco de 100% para 30%.
    channel.setFader(30)
    const umQuadro = channel.tick(now + FRAME_MS)

    // Um quadro depois já desceu, mas está longe de ter chegado: é a rampa.
    expect(umQuadro).toBeLessThan(1)
    expect(umQuadro).toBeGreaterThan(0.3)

    // Em meio segundo já assentou no novo valor.
    run(channel, now + FRAME_MS, 500)
    expect(channel.getVolume()).toBeCloseTo(0.3, 3)
  })

  it('zerar o fader corta na hora — mudo é mudo (RF-04.8 / RF-04.9)', () => {
    const channel = createChannel({ fader: 100 })
    channel.fadeIn(0)
    const now = run(channel, 0, DEFAULT_FADE_MS)

    channel.setFader(0)

    // Sem rampa: o zero absoluto do fader não espera a suavização descer, senão
    // sobraria um fiapo de som depois de o operador já ter zerado.
    expect(channel.tick(now + FRAME_MS)).toBe(0)
  })
})

describe('fade de entrada e saída', () => {
  it('sobe do silêncio até o volume cheio (RF-04.3)', () => {
    const channel = createChannel({ fader: 100 })

    channel.fadeIn(0)
    expect(channel.getPhase()).toBe('fading-in')
    expect(channel.tick(0)).toBe(0)

    const meio = channel.tick(DEFAULT_FADE_MS / 2)
    expect(meio).toBeCloseTo(Math.SQRT1_2, 3)

    channel.tick(DEFAULT_FADE_MS)
    expect(channel.getVolume()).toBeCloseTo(1, 6)
    expect(channel.getPhase()).toBe('on-air')
  })

  it('desce até o silêncio sem cortar seco (RF-04.4)', () => {
    const channel = createChannel({ fader: 100 })
    channel.fadeIn(0)
    const noAr = run(channel, 0, DEFAULT_FADE_MS)

    channel.fadeOut(noAr)
    expect(channel.getPhase()).toBe('fading-out')

    const meio = channel.tick(noAr + DEFAULT_FADE_MS / 2)
    expect(meio).toBeCloseTo(Math.SQRT1_2, 3)

    channel.tick(noAr + DEFAULT_FADE_MS)
    expect(channel.getVolume()).toBe(0)
    expect(channel.getPhase()).toBe('silent')
  })

  it('avisa quando cada fade termina — é a deixa para pausar o player', () => {
    const fins: FadeDirection[] = []
    const channel = createChannel({
      fader: 100,
      onFadeEnd: (d) => fins.push(d),
    })

    channel.fadeIn(0)
    const noAr = run(channel, 0, DEFAULT_FADE_MS)
    expect(fins).toEqual(['in'])

    channel.fadeOut(noAr)
    run(channel, noAr, DEFAULT_FADE_MS)
    expect(fins).toEqual(['in', 'out'])
  })

  it('respeita durações diferentes para entrar e sair (RF-04.12)', () => {
    const channel = createChannel({
      fader: 100,
      fadeInMs: 1000,
      fadeOutMs: 4000,
    })

    channel.fadeIn(0)
    run(channel, 0, 1000)
    expect(channel.getVolume()).toBeCloseTo(1, 6)

    channel.fadeOut(1000)
    run(channel, 1000, 1000)
    // Um quarto do caminho de saída: ainda bem audível.
    expect(channel.getVolume()).toBeCloseTo(Math.cos(Math.PI / 8), 3)
  })

  it('com duração 0 entra e sai instantaneamente (RF-04.12)', () => {
    const channel = createChannel({ fader: 100, fadeInMs: 0, fadeOutMs: 0 })

    channel.fadeIn(0)
    expect(channel.tick(0)).toBeCloseTo(1, 6)

    channel.fadeOut(0)
    expect(channel.tick(0)).toBe(0)
  })

  it('só manda volume ao player quando ele muda de fato', () => {
    const volumes: number[] = []
    const channel = createChannel({
      fader: 100,
      onVolume: (v) => volumes.push(v),
    })

    channel.tick(0)
    channel.tick(FRAME_MS)
    channel.tick(2 * FRAME_MS)

    // Parado e em silêncio: nada a dizer ao player.
    expect(volumes).toEqual([])
  })
})

describe('cancelamento de fade (RF-04.10)', () => {
  it('volta do meio do fade-out sem degrau de volume', () => {
    const channel = createChannel({ fader: 100 })
    channel.fadeIn(0)
    const noAr = run(channel, 0, DEFAULT_FADE_MS)

    // Sai do ar... e o operador se arrepende na metade do caminho.
    channel.fadeOut(noAr)
    const meio = noAr + DEFAULT_FADE_MS / 2
    const antes = channel.tick(meio)

    channel.fadeIn(meio)
    const depois = channel.tick(meio)

    // O volume no instante da virada é o mesmo: continuidade, não salto.
    expect(depois).toBeCloseTo(antes, 6)
    expect(channel.getPhase()).toBe('fading-in')
  })

  it('a volta leva só o tempo que falta, não um fade inteiro', () => {
    const channel = createChannel({ fader: 100 })
    channel.fadeIn(0)
    const noAr = run(channel, 0, DEFAULT_FADE_MS)

    // Desistiu depois de 25% do fade-out: faltam 25% para voltar ao topo.
    channel.fadeOut(noAr)
    const desistiu = noAr + DEFAULT_FADE_MS * 0.25
    channel.tick(desistiu)
    channel.fadeIn(desistiu)

    run(channel, desistiu, DEFAULT_FADE_MS * 0.25)
    expect(channel.getVolume()).toBeCloseTo(1, 4)
    expect(channel.getPhase()).toBe('on-air')
  })

  it('o volume sobe monotonicamente depois da virada — nunca desce de novo', () => {
    const channel = createChannel({ fader: 100 })
    channel.fadeIn(0)
    const noAr = run(channel, 0, DEFAULT_FADE_MS)

    channel.fadeOut(noAr)
    const virada = noAr + DEFAULT_FADE_MS / 3
    channel.tick(virada)
    channel.fadeIn(virada)

    let anterior = channel.getVolume()
    for (let t = virada; t <= virada + DEFAULT_FADE_MS; t += FRAME_MS) {
      const atual = channel.tick(t)
      expect(atual).toBeGreaterThanOrEqual(anterior - 1e-9)
      anterior = atual
    }
  })

  it('também cancela um fade-in no meio do caminho', () => {
    const channel = createChannel({ fader: 100 })
    channel.fadeIn(0)

    const meio = DEFAULT_FADE_MS / 2
    const antes = channel.tick(meio)
    channel.fadeOut(meio)
    const depois = channel.tick(meio)

    expect(depois).toBeCloseTo(antes, 6)
    expect(channel.getPhase()).toBe('fading-out')

    run(channel, meio, DEFAULT_FADE_MS)
    expect(channel.getVolume()).toBe(0)
  })

  it('avisa só o fim do fade que realmente terminou', () => {
    const fins: FadeDirection[] = []
    const channel = createChannel({
      fader: 100,
      onFadeEnd: (d) => fins.push(d),
    })
    channel.fadeIn(0)
    const noAr = run(channel, 0, DEFAULT_FADE_MS)
    fins.length = 0

    channel.fadeOut(noAr)
    const meio = noAr + DEFAULT_FADE_MS / 2
    channel.tick(meio)
    channel.fadeIn(meio)
    run(channel, meio, DEFAULT_FADE_MS)

    // O fade-out foi cancelado: ele nunca terminou, então não anuncia 'out'.
    expect(fins).toEqual(['in'])
  })

  it('pedir de novo o que já está valendo não faz nada', () => {
    const channel = createChannel({ fader: 100 })
    channel.fadeIn(0)
    const noAr = run(channel, 0, DEFAULT_FADE_MS)

    channel.fadeIn(noAr)
    expect(channel.getPhase()).toBe('on-air')

    channel.fadeOut(noAr)
    const silencio = run(channel, noAr, DEFAULT_FADE_MS)
    channel.fadeOut(silencio)
    expect(channel.getPhase()).toBe('silent')
  })
})

describe('ocioso', () => {
  it('fica ocioso quando não há fade nem fader a perseguir', () => {
    const channel = createChannel({ fader: 100 })
    channel.tick(0)

    expect(channel.isIdle()).toBe(true)
  })

  it('não fica ocioso durante um fade', () => {
    const channel = createChannel({ fader: 100 })
    channel.fadeIn(0)
    channel.tick(0)

    expect(channel.isIdle()).toBe(false)
  })

  it('não fica ocioso enquanto o fader ainda persegue o alvo', () => {
    const channel = createChannel({ fader: 100 })
    channel.tick(0)

    channel.setFader(20)

    expect(channel.isIdle()).toBe(false)
  })
})

describe('fade em andamento (RF-05.5)', () => {
  it('não reporta fade nenhum quando não há rampa correndo', () => {
    const channel = createChannel({ fader: 100 })
    channel.tick(0)

    expect(channel.getFade()).toBeNull()
  })

  it('conta o tempo que falta para o fade terminar', () => {
    const channel = createChannel({ fader: 100 })
    channel.fadeIn(0)
    run(channel, 0, DEFAULT_FADE_MS / 2)

    const fade = channel.getFade()
    expect(fade?.direction).toBe('in')
    expect(fade?.durationMs).toBeCloseTo(DEFAULT_FADE_MS, 0)
    expect(fade?.remainingMs).toBeCloseTo(DEFAULT_FADE_MS / 2, 0)
  })

  it('a contagem some quando a rampa chega ao fim', () => {
    const channel = createChannel({ fader: 100 })
    channel.fadeIn(0)
    run(channel, 0, DEFAULT_FADE_MS)

    expect(channel.getFade()).toBeNull()
  })

  it('uma reversão no meio do caminho conta o tempo da volta, não o cheio', () => {
    const channel = createChannel({ fader: 100 })
    channel.fadeIn(0)
    const noAr = run(channel, 0, DEFAULT_FADE_MS)

    // Sai do ar, se arrepende na metade: a volta é mais curta que a ida.
    channel.fadeOut(noAr)
    const meio = run(channel, noAr, DEFAULT_FADE_MS / 2)
    channel.fadeIn(meio)
    channel.tick(meio)

    const fade = channel.getFade()
    expect(fade?.direction).toBe('in')
    expect(fade?.durationMs).toBeLessThan(DEFAULT_FADE_MS)
    expect(fade?.remainingMs).toBeLessThan(DEFAULT_FADE_MS)
  })
})

describe('duração do fade em tempo real (RF-04.12)', () => {
  it('passa a valer na próxima rampa', () => {
    const channel = createChannel({ fader: 100 })
    channel.setFadeMs(500)
    expect(channel.getFadeMs()).toBe(500)

    channel.fadeIn(0)
    run(channel, 0, 500)

    expect(channel.getPhase()).toBe('on-air')
    expect(channel.getVolume()).toBeCloseTo(1, 6)
  })

  it('não dá tranco na rampa que já está correndo', () => {
    const channel = createChannel({ fader: 100 })
    channel.fadeIn(0)
    run(channel, 0, DEFAULT_FADE_MS / 2)
    const antes = channel.getVolume()

    channel.setFadeMs(8000)
    channel.tick(DEFAULT_FADE_MS / 2)

    expect(channel.getVolume()).toBeCloseTo(antes, 6)
  })

  it('fade zero entra no ar de uma vez (RF-04.12)', () => {
    const channel = createChannel({ fader: 100 })
    channel.setFadeMs(0)
    channel.fadeIn(0)
    channel.tick(0)

    expect(channel.getVolume()).toBeCloseTo(1, 6)
    expect(channel.getPhase()).toBe('on-air')
  })
})
