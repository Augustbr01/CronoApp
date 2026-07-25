import {
  formatBytes,
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
  })

  it('mostra a hora quando existe — coletânea de fundo (RF-03.1)', () => {
    // Três horas eram `180:00`, um número que o operador tinha que converter
    // de cabeça para saber se dava para o culto inteiro.
    expect(formatTime(10_800)).toBe('3:00:00')
    expect(formatTime(3600)).toBe('1:00:00')
    expect(formatTime(3661)).toBe('1:01:01')
    expect(formatTime(7_845)).toBe('2:10:45')
  })

  it('mas não inventa hora onde não tem', () => {
    // O caso comum é uma música de quatro minutos no cronômetro grande da
    // topbar: `0:03:47` ali seriam dois caracteres a mais para ler de relance.
    expect(formatTime(3599)).toBe('59:59')
    expect(formatTime(60)).toBe('1:00')
  })

  it('o minuto ganha zero à esquerda só depois da hora', () => {
    // `1:5:03` seria ilegível; `1:05:03` é o formato que todo player usa.
    expect(formatTime(3903)).toBe('1:05:03')
    expect(formatTime(303)).toBe('5:03')
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

  it('coletânea longa aparece em horas', () => {
    expect(formatDuration(10_800)).toBe('3:00:00')
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

describe('o medidor de armazenamento (RF-11)', () => {
  it('sobe de unidade sozinho', () => {
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(1024)).toBe('1 KB')
    expect(formatBytes(5 * 1024 * 1024)).toBe('5,0 MB')
    expect(formatBytes(1024 * 1024 * 1024)).toBe('1,0 GB')
  })

  it('a casa decimal só aparece onde ela informa', () => {
    // Abaixo de 10 a fração diz alguma coisa; acima, vira ruído para quem só
    // quer saber se ainda cabe o louvor de domingo.
    expect(formatBytes(1.4 * 1024 * 1024 * 1024)).toBe('1,4 GB')
    expect(formatBytes(70 * 1024 * 1024)).toBe('70 MB')
    expect(formatBytes(1462 * 1024 * 1024)).toBe('1,4 GB')
  })

  it('nada guardado não vira NaN nem número negativo', () => {
    expect(formatBytes(0)).toBe('0 MB')
    expect(formatBytes(-1)).toBe('0 MB')
    expect(formatBytes(Number.NaN)).toBe('0 MB')
  })
})
