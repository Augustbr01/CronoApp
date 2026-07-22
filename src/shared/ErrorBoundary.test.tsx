import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ErrorBoundary } from './ErrorBoundary'

/**
 * A rede de proteção (RNF-03.1).
 *
 * Sem ela, qualquer exceção de render deixa a tela branca — no meio de um culto,
 * com a igreja esperando. O teste é curto porque a garantia é curta: **existe
 * alguma coisa na tela depois do erro, e existe um caminho de volta**.
 */

function Explode(): never {
  throw new Error('faltou o vídeo')
}

let erros: unknown[][]

beforeEach(() => {
  // O React reporta o erro no console de propósito; aqui ele só faria barulho.
  erros = []
  vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    erros.push(args)
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('ErrorBoundary', () => {
  it('deixa passar o que funciona', () => {
    render(
      <ErrorBoundary>
        <p>painel de som</p>
      </ErrorBoundary>,
    )

    expect(screen.getByText('painel de som')).toBeInTheDocument()
  })

  it('troca a tela branca por um aviso com saída', () => {
    render(
      <ErrorBoundary>
        <Explode />
      </ErrorBoundary>,
    )

    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByText('O painel travou')).toBeInTheDocument()
    // A mensagem técnica fica à vista: é o que o operador manda por WhatsApp.
    expect(screen.getByText('faltou o vídeo')).toBeInTheDocument()
  })

  it('o botão de recarregar realmente recarrega', async () => {
    const onReload = vi.fn()
    render(
      <ErrorBoundary onReload={onReload}>
        <Explode />
      </ErrorBoundary>,
    )

    await userEvent.setup().click(screen.getByRole('button'))

    expect(onReload).toHaveBeenCalledOnce()
  })

  it('não engole o erro: ele continua indo para o console', () => {
    render(
      <ErrorBoundary>
        <Explode />
      </ErrorBoundary>,
    )

    // Erro engolido é erro que ninguém conserta.
    expect(
      erros.some((args) =>
        args.some(
          (arg) => typeof arg === 'string' && arg.includes('CronoApp quebrou'),
        ),
      ),
    ).toBe(true)
  })
})
