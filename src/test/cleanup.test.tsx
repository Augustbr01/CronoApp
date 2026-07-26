import { render, screen } from '@testing-library/react'

/**
 * O contrato do `setup.ts`: **cada teste começa com o DOM vazio**.
 *
 * Parece garantido pelo `@testing-library/react`, e não é: com `isolate: false`
 * o hook de cleanup que ele registra no import vale só para o primeiro arquivo
 * que importou o RTL naquele worker — ver o comentário em [setup.ts](setup.ts).
 * O resultado eram containers empilhados no mesmo `document.body` e um
 * `getByRole` achando dois de cada coisa, em qualquer arquivo que dependesse do
 * cleanup automático.
 *
 * Ressalva honesta sobre este canário: se **ele** for o primeiro arquivo a
 * importar o RTL, passa mesmo com o defeito de volta. Erra para o lado seguro
 * (falso verde, nunca falso vermelho), e é por isso que a reprodução
 * determinística está registrada no `setup.ts` em vez de depender daqui.
 */

describe('o DOM entre testes', () => {
  it('deixa um botão para trás de propósito', () => {
    render(<button type="button">canário</button>)

    expect(screen.getByRole('button')).toBeInTheDocument()
  })

  it('e o teste seguinte encontra o corpo limpo', () => {
    expect(document.body.children).toHaveLength(0)
    expect(screen.queryByRole('button')).toBeNull()
  })
})
