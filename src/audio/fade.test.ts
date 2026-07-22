import { clamp01, fadeGain, fadeProgress, fadeProgressForGain } from './fade'

describe('clamp01', () => {
  it('prende valores abaixo de 0', () => {
    expect(clamp01(-0.5)).toBe(0)
    expect(clamp01(-999)).toBe(0)
  })

  it('prende valores acima de 1', () => {
    expect(clamp01(1.5)).toBe(1)
    expect(clamp01(999)).toBe(1)
  })

  it('deixa passar valores dentro do intervalo, inclusive as pontas', () => {
    expect(clamp01(0)).toBe(0)
    expect(clamp01(0.42)).toBe(0.42)
    expect(clamp01(1)).toBe(1)
  })
})

describe('fadeProgress', () => {
  it('vale 0 quando o fade acabou de começar', () => {
    expect(fadeProgress(0, 2000)).toBe(0)
  })

  it('vale 1 quando o tempo do fade se esgotou', () => {
    expect(fadeProgress(2000, 2000)).toBe(1)
  })

  it('é linear no meio do caminho', () => {
    expect(fadeProgress(1000, 2000)).toBe(0.5)
    expect(fadeProgress(500, 2000)).toBe(0.25)
  })

  it('não passa de 1 mesmo com o tempo estourado', () => {
    expect(fadeProgress(5000, 2000)).toBe(1)
  })

  it('não fica negativo com tempo decorrido negativo', () => {
    expect(fadeProgress(-100, 2000)).toBe(0)
  })

  it('trata duração 0 ou negativa como fade instantâneo (progresso 1)', () => {
    expect(fadeProgress(0, 0)).toBe(1)
    expect(fadeProgress(0, -1000)).toBe(1)
  })
})

describe('fadeGain', () => {
  it('o fade-in sai de 0 e chega a 1', () => {
    expect(fadeGain('in', 0)).toBeCloseTo(0, 10)
    expect(fadeGain('in', 1)).toBeCloseTo(1, 10)
  })

  it('o fade-out sai de 1 e chega a 0', () => {
    expect(fadeGain('out', 0)).toBeCloseTo(1, 10)
    expect(fadeGain('out', 1)).toBeCloseTo(0, 10)
  })

  it('o fade-in cresce de forma monótona', () => {
    let previous = -Infinity
    for (let step = 0; step <= 20; step += 1) {
      const gain = fadeGain('in', step / 20)
      expect(gain).toBeGreaterThanOrEqual(previous)
      previous = gain
    }
  })

  it('o fade-out decresce de forma monótona', () => {
    let previous = Infinity
    for (let step = 0; step <= 20; step += 1) {
      const gain = fadeGain('out', step / 20)
      expect(gain).toBeLessThanOrEqual(previous)
      previous = gain
    }
  })

  it('prende o progresso fora do intervalo às pontas da curva', () => {
    expect(fadeGain('in', -1)).toBeCloseTo(0, 10)
    expect(fadeGain('in', 2)).toBeCloseTo(1, 10)
    expect(fadeGain('out', -1)).toBeCloseTo(1, 10)
    expect(fadeGain('out', 2)).toBeCloseTo(0, 10)
  })

  // O coração do RF-04.6: a soma das potências dos dois canais é constante ao
  // longo de todo o crossfade, então não há queda de volume percebida.
  it('mantém potência constante (gainIn² + gainOut² === 1) em todo o percurso', () => {
    for (let step = 0; step <= 100; step += 1) {
      const t = step / 100
      const power = fadeGain('in', t) ** 2 + fadeGain('out', t) ** 2
      expect(power).toBeCloseTo(1, 10)
    }
  })

  it('no meio do crossfade, os dois canais valem ~0,707 (−3 dB), não 0,5', () => {
    // 0,707 = √2/2. Ao quadrado dá 0,5 para cada canal, somando potência 1.
    // Uma rampa linear valeria 0,5 aqui, somando potência 0,5 — o buraco de
    // ~3 dB no meio que esta curva existe para evitar.
    expect(fadeGain('in', 0.5)).toBeCloseTo(Math.SQRT1_2, 10)
    expect(fadeGain('out', 0.5)).toBeCloseTo(Math.SQRT1_2, 10)

    const equalPowerMid = fadeGain('in', 0.5) ** 2 + fadeGain('out', 0.5) ** 2
    const linearMid = 0.5 ** 2 + 0.5 ** 2
    expect(equalPowerMid).toBeCloseTo(1, 10)
    expect(linearMid).toBeCloseTo(0.5, 10)
  })
})

describe('fadeProgressForGain', () => {
  it('é a volta exata de fadeGain, nos dois sentidos', () => {
    for (let step = 0; step <= 100; step += 1) {
      const t = step / 100
      for (const direction of ['in', 'out'] as const) {
        const gain = fadeGain(direction, t)
        expect(fadeProgressForGain(direction, gain)).toBeCloseTo(t, 10)
      }
    }
  })

  it('marca os extremos de cada curva', () => {
    expect(fadeProgressForGain('in', 0)).toBe(0)
    expect(fadeProgressForGain('in', 1)).toBeCloseTo(1, 10)
    expect(fadeProgressForGain('out', 1)).toBe(0)
    expect(fadeProgressForGain('out', 0)).toBeCloseTo(1, 10)
  })

  it('acha o mesmo ponto médio que a curva de ida', () => {
    expect(fadeProgressForGain('in', Math.SQRT1_2)).toBeCloseTo(0.5, 10)
    expect(fadeProgressForGain('out', Math.SQRT1_2)).toBeCloseTo(0.5, 10)
  })

  it('prende ganhos fora da escala em vez de devolver NaN', () => {
    expect(fadeProgressForGain('in', 1.5)).toBeCloseTo(1, 10)
    expect(fadeProgressForGain('in', -0.5)).toBe(0)
    expect(fadeProgressForGain('out', 1.5)).toBe(0)
  })
})
