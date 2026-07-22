import { durationToSeconds } from './duration'

describe('duração ISO 8601 → segundos', () => {
  it('lê o formato que a Data API devolve para uma música', () => {
    expect(durationToSeconds('PT4M13S')).toBe(253)
    expect(durationToSeconds('PT3M')).toBe(180)
    expect(durationToSeconds('PT45S')).toBe(45)
  })

  it('lê coletâneas de fundo, que é o caso longo (RF-03.1)', () => {
    expect(durationToSeconds('PT3H')).toBe(10_800)
    expect(durationToSeconds('PT1H30M')).toBe(5_400)
    expect(durationToSeconds('PT2H15M30S')).toBe(8_130)
  })

  it('conta os dias — 26 horas não é 2 horas', () => {
    expect(durationToSeconds('P1DT2H')).toBe(93_600)
    expect(durationToSeconds('P1D')).toBe(86_400)
  })

  it('transmissão ao vivo, que vem sem duração, vale zero', () => {
    expect(durationToSeconds('P0D')).toBe(0)
    expect(durationToSeconds('PT0S')).toBe(0)
  })

  it('o que não for duração vira zero, em vez de virar número inventado', () => {
    expect(durationToSeconds(undefined)).toBe(0)
    expect(durationToSeconds('')).toBe(0)
    expect(durationToSeconds('4:13')).toBe(0)
    expect(durationToSeconds('lixo')).toBe(0)
    // O perigo real: um trecho válido no meio de outra coisa.
    expect(durationToSeconds('xxPT4MSyy')).toBe(0)
  })
})
