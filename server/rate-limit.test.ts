import { createRateLimiter } from './rate-limit'

function comRelogio() {
  let agora = 0
  return {
    avancar: (ms: number) => (agora += ms),
    now: () => agora,
  }
}

describe('limite por IP (RF-10.5)', () => {
  it('deixa passar até o limite e barra o excedente', () => {
    const limiter = createRateLimiter({ limit: 2, windowMs: 1000 })

    expect(limiter.take('1.1.1.1').allowed).toBe(true)
    expect(limiter.take('1.1.1.1').allowed).toBe(true)
    expect(limiter.take('1.1.1.1').allowed).toBe(false)
  })

  it('conta cada IP no seu próprio balde', () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 1000 })
    limiter.take('1.1.1.1')

    // Uma igreja gastando o limite dela não pode calar a igreja do lado.
    expect(limiter.take('2.2.2.2').allowed).toBe(true)
  })

  it('a janela desliza: a vaga volta quando a chamada antiga envelhece', () => {
    const relogio = comRelogio()
    const limiter = createRateLimiter({
      limit: 2,
      windowMs: 1000,
      now: relogio.now,
    })
    limiter.take('ip')
    relogio.avancar(600)
    limiter.take('ip')

    relogio.avancar(200)
    expect(limiter.take('ip').allowed).toBe(false)

    // Passados 1000 ms da primeira, ela sai da conta e abre uma vaga — sem
    // liberar as duas de uma vez, que é o que uma janela fixa faria.
    relogio.avancar(201)
    expect(limiter.take('ip').allowed).toBe(true)
    expect(limiter.take('ip').allowed).toBe(false)
  })

  it('diz quanto falta para tentar de novo', () => {
    const relogio = comRelogio()
    const limiter = createRateLimiter({
      limit: 1,
      windowMs: 1000,
      now: relogio.now,
    })
    limiter.take('ip')

    relogio.avancar(300)

    expect(limiter.take('ip').retryAfterMs).toBe(700)
  })

  it('não guarda para sempre quem passou uma vez e sumiu', () => {
    const relogio = comRelogio()
    const limiter = createRateLimiter({
      limit: 5,
      windowMs: 1000,
      maxKeys: 2,
      now: relogio.now,
    })
    limiter.take('a')
    limiter.take('b')

    relogio.avancar(2000)
    limiter.take('c')
    limiter.take('d')

    // Os antigos saíram da memória, mas o limite continua valendo para quem
    // está chamando agora.
    expect(limiter.take('c').allowed).toBe(true)
  })
})
