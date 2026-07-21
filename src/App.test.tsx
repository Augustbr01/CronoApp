import { render, screen } from '@testing-library/react'
import App from './App'

// Smoke test da fundação: confirma que a árvore monta e que o harness de
// testes (Vitest + Testing Library + jsdom + jest-dom) está de pé.
describe('App', () => {
  it('renderiza o título do painel', () => {
    render(<App />)
    expect(
      screen.getByRole('heading', { name: 'CronoApp', level: 1 }),
    ).toBeInTheDocument()
  })
})
