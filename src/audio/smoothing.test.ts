import { FADER_SETTLE_EPSILON, approach, normalizeFader } from './smoothing'

describe('normalizeFader', () => {
  it('converte a escala 0–100 do fader para 0–1', () => {
    expect(normalizeFader(0)).toBe(0)
    expect(normalizeFader(50)).toBe(0.5)
    expect(normalizeFader(100)).toBe(1)
  })

  it('prende valores fora da escala', () => {
    expect(normalizeFader(150)).toBe(1)
    expect(normalizeFader(-10)).toBe(0)
  })
})

describe('approach', () => {
  it('anda uma fração da distância rumo ao alvo (subindo)', () => {
    // 22% da distância de 0 até 1.
    expect(approach(0, 1)).toBeCloseTo(0.22, 10)
  })

  it('anda uma fração da distância rumo ao alvo (descendo)', () => {
    // sobra 78% depois de andar 22% de 1 até 0.
    expect(approach(1, 0)).toBeCloseTo(0.78, 10)
  })

  it('nunca ultrapassa o alvo — fica entre o ponto atual e o alvo', () => {
    const next = approach(0, 1)
    expect(next).toBeGreaterThan(0)
    expect(next).toBeLessThan(1)
  })

  it('gruda no alvo quando a distância que falta é menor que o epsilon', () => {
    expect(approach(0.995, 1)).toBe(1)
    expect(approach(1.005, 1)).toBe(1)
  })

  it('já estando no alvo, devolve o próprio alvo', () => {
    expect(approach(1, 1)).toBe(1)
  })

  it('com fator 1 chega ao alvo num único passo', () => {
    expect(approach(0, 1, 1)).toBe(1)
  })

  it('converge para o alvo ao ser iterado (e para exatamente nele)', () => {
    let value = 0
    for (let frame = 0; frame < 40; frame += 1) {
      value = approach(value, 1)
    }
    expect(value).toBe(1)
  })

  it('respeita um epsilon customizado', () => {
    // com epsilon 0,2, a 0,9 do alvo já é perto o bastante para grudar.
    expect(approach(0.9, 1, 0.22, 0.2)).toBe(1)
  })
})

describe('chegada ao alvo', () => {
  it('gruda no alvo com igualdade exata, não só "perto"', () => {
    // É desta garantia que o laço por quadro da Parte 5b depende para saber
    // que pode dormir: `=== alvo`, e não "a menos de um epsilon".
    expect(approach(1 - FADER_SETTLE_EPSILON / 2, 1)).toBe(1)
    expect(approach(0.5 + FADER_SETTLE_EPSILON / 2, 0.5)).toBe(0.5)
  })

  it('chega ao alvo exato mesmo partindo de longe', () => {
    let value = 1
    for (let frame = 0; frame < 60; frame += 1) value = approach(value, 0.4)

    expect(value).toBe(0.4)
  })
})
