import { createCache } from './cache'

/**
 * O relógio é do teste: prazo de validade só se observa quando o tempo passa,
 * e esperar seis horas de verdade não é teste, é castigo.
 */
function comRelogio() {
  let agora = 0
  return {
    avancar: (ms: number) => (agora += ms),
    now: () => agora,
  }
}

describe('cache de respostas (RF-10.3)', () => {
  it('devolve o que guardou', () => {
    const cache = createCache<string>({ ttlMs: 1000, maxEntries: 10 })

    cache.set('a', 'resposta')

    expect(cache.get('a')).toBe('resposta')
  })

  it('esquece o que passou do prazo', () => {
    const relogio = comRelogio()
    const cache = createCache<string>({
      ttlMs: 1000,
      maxEntries: 10,
      now: relogio.now,
    })
    cache.set('a', 'resposta')

    relogio.avancar(999)
    expect(cache.get('a')).toBe('resposta')

    relogio.avancar(1)
    expect(cache.get('a')).toBeUndefined()
    // E some de vez, em vez de ficar ocupando espaço vencido.
    expect(cache.size()).toBe(0)
  })

  it('respeita o teto de entradas', () => {
    const cache = createCache<number>({ ttlMs: 1000, maxEntries: 2 })

    cache.set('a', 1)
    cache.set('b', 2)
    cache.set('c', 3)

    expect(cache.size()).toBe(2)
    expect(cache.get('a')).toBeUndefined()
  })

  it('descarta a menos usada, não a mais antiga', () => {
    const cache = createCache<number>({ ttlMs: 10_000, maxEntries: 2 })
    cache.set('piano worship', 1)
    cache.set('harpa crista', 2)

    // A primeira volta a ser usada: é a busca popular do domingo.
    cache.get('piano worship')
    cache.set('celebracao', 3)

    // Quem sai é a do meio, não a popular — senão a busca mais repetida seria
    // a que mais gasta cota.
    expect(cache.get('piano worship')).toBe(1)
    expect(cache.get('harpa crista')).toBeUndefined()
  })

  it('sobrescrever não duplica a entrada', () => {
    const cache = createCache<number>({ ttlMs: 1000, maxEntries: 10 })

    cache.set('a', 1)
    cache.set('a', 2)

    expect(cache.size()).toBe(1)
    expect(cache.get('a')).toBe(2)
  })
})
