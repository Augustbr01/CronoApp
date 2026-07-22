import {
  formatDuration,
  formatSeconds,
  formatTime,
  formatTimeOfDay,
  msToSeconds,
  secondsToMs,
} from './format'

describe('formatTime', () => {
  it('mostra minutos e segundos', () => {
    expect(formatTime(0)).toBe('0:00')
    expect(formatTime(9)).toBe('0:09')
    expect(formatTime(254)).toBe('4:14')
    expect(formatTime(3600)).toBe('60:00')
  })

  it('não deixa NaN nem número negativo chegarem à tela', () => {
    expect(formatTime(-5)).toBe('0:00')
    expect(formatTime(Number.NaN)).toBe('0:00')
    expect(formatTime(Number.POSITIVE_INFINITY)).toBe('0:00')
  })
})

describe('formatDuration', () => {
  it('duração desconhecida vira traço, não zero', () => {
    // "0:00" faria o operador achar que o vídeo tem zero segundos.
    expect(formatDuration(undefined)).toBe('--:--')
    expect(formatDuration(0)).toBe('--:--')
    expect(formatDuration(254)).toBe('4:14')
  })
})

describe('horário', () => {
  it('mostra a hora de uma entrada do histórico', () => {
    const stamp = new Date(2026, 6, 21, 19, 42).getTime()
    expect(formatTimeOfDay(stamp)).toBe('19:42')
  })
})

describe('a borda entre ms e segundos (RF-04.12)', () => {
  it('o motor pensa em ms, o modal mostra segundos', () => {
    expect(msToSeconds(2000)).toBe(2)
    expect(msToSeconds(2500)).toBe(2.5)
    expect(msToSeconds(0)).toBe(0)
    expect(secondsToMs(2.5)).toBe(2500)
    expect(secondsToMs(0)).toBe(0)
  })

  it('a volta e a ida se cancelam nos passos de meio segundo', () => {
    for (let s = 0; s <= 8; s += 0.5) {
      expect(msToSeconds(secondsToMs(s))).toBe(s)
    }
  })

  it('escreve com vírgula, como em português', () => {
    expect(formatSeconds(2.5)).toBe('2,5s')
    expect(formatSeconds(0)).toBe('0,0s')
  })
})
