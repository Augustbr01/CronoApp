import { SNAP_TO_MUTE_THRESHOLD, composeVolume, snapToMute } from './volume'

describe('snapToMute', () => {
  it('puxa ao zero só o que o player nem conseguiria tocar', () => {
    expect(snapToMute(0)).toBe(0)
    expect(snapToMute(0.4)).toBe(0)
  })

  it('deixa passar o sussurro de 1 e 2, que no amplificador se ouve', () => {
    expect(snapToMute(SNAP_TO_MUTE_THRESHOLD)).toBe(1)
    expect(snapToMute(2)).toBe(2)
    expect(snapToMute(50)).toBe(50)
    expect(snapToMute(100)).toBe(100)
  })

  it('prende o valor à escala 0–100', () => {
    expect(snapToMute(150)).toBe(100)
    expect(snapToMute(-20)).toBe(0)
  })
})

describe('composeVolume', () => {
  it('multiplica o fader suavizado pelo fator de fade', () => {
    expect(composeVolume(1, 1, false)).toBe(1)
    expect(composeVolume(0.5, 1, false)).toBe(0.5)
    expect(composeVolume(1, 0.5, false)).toBe(0.5)
    expect(composeVolume(0.5, 0.5, false)).toBe(0.25)
  })

  it('devolve 0 quando o canal está mudo, ignorando fader e fade', () => {
    expect(composeVolume(1, 1, true)).toBe(0)
    expect(composeVolume(0.8, 0.9, true)).toBe(0)
  })

  it('resulta em 0 com fader suavizado em zero, mesmo sem mute', () => {
    expect(composeVolume(0, 1, false)).toBe(0)
  })

  it('prende o resultado ao intervalo [0, 1]', () => {
    expect(composeVolume(2, 2, false)).toBe(1)
    expect(composeVolume(-1, 1, false)).toBe(0)
  })
})
