import { render } from '@testing-library/react'
import { Meter } from './Meter'

/**
 * O medidor tem uma responsabilidade só, e é fácil de errar: **dizer se sai som
 * daqui**.
 *
 * O teste que importa é o do volume de sussurro. Com 14 segmentos, o
 * arredondamento puro apaga o medidor inteiro em 1 ou 2 — e o som do navegador
 * vai para um amplificador, onde 2 se ouve na igreja. Um medidor apagado com o
 * canal soando é a informação errada na hora errada.
 */

/** Quantos segmentos estão acesos, de qualquer cor. */
function acesos(container: HTMLElement): number {
  return container.querySelectorAll('.meter i.lit, .meter i.warm, .meter i.hot')
    .length
}

describe('Meter', () => {
  it('acende ao menos um segmento em qualquer volume audível', () => {
    // 2% arredondaria para zero segmento: round(2 / 100 * 14) = 0.
    expect(acesos(render(<Meter level={2} />).container)).toBe(1)
    expect(acesos(render(<Meter level={1} />).container)).toBe(1)
  })

  it('fica todo apagado só no silêncio', () => {
    expect(acesos(render(<Meter level={0} />).container)).toBe(0)
  })

  it('acende a escala inteira no volume cheio', () => {
    expect(acesos(render(<Meter level={100} />).container)).toBe(14)
  })
})
