import { AVISO_FIM_SEGUNDOS, estaAcabando } from './countdown'

/**
 * Quando o cronômetro pisca.
 *
 * O aviso serve ao operador que está olhando para a igreja, não para a tela:
 * ele precisa puxar o olho na hora certa e ficar quieto no resto do tempo.
 */
describe('estaAcabando', () => {
  it('pisca nos últimos dez segundos, inclusive no zero', () => {
    expect(estaAcabando(AVISO_FIM_SEGUNDOS)).toBe(true)
    expect(estaAcabando(3)).toBe(true)
    // Zero também: é o instante em que a troca acontece, e a tela não pode
    // apagar o aviso justo aí.
    expect(estaAcabando(0)).toBe(true)
  })

  it('fica quieto no resto da música', () => {
    expect(estaAcabando(AVISO_FIM_SEGUNDOS + 1)).toBe(false)
    expect(estaAcabando(180)).toBe(false)
  })

  it('sem contagem correndo, não pisca', () => {
    // `null` é o relógio de parede do standby, ou um vídeo cuja duração
    // ninguém descobriu: inventar urgência a partir de ignorância seria pior
    // do que não avisar.
    expect(estaAcabando(null)).toBe(false)
  })

  it('tempo negativo não acende o aviso', () => {
    // Só acontece se o relógio do player passar da duração anotada; aí a
    // música já acabou e o piscar seria eco.
    expect(estaAcabando(-1)).toBe(false)
  })
})
