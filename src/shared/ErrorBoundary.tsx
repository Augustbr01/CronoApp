import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'

/**
 * A rede de proteção da aplicação inteira (RNF-03.1).
 *
 * Sem isto, uma exceção em qualquer render derruba a tela para o branco. Num
 * culto ao vivo esse é o pior cenário possível: o operador fica sem transporte,
 * sem fader e sem fila, com a igreja esperando.
 *
 * O fallback é deliberadamente mínimo — não usa store, não usa motor, não usa
 * nada que possa ser a causa do problema. Ele diz o que aconteceu, mostra a
 * mensagem técnica (que é o que o operador vai mandar por WhatsApp) e oferece a
 * única saída que sempre funciona: recarregar.
 *
 * O que ele **não** faz é esconder o erro: `componentDidCatch` reporta no
 * console, porque erro engolido é erro que ninguém conserta.
 */

interface Props {
  children: ReactNode
  /** Trocado nos testes; no app é o `location.reload` do navegador. */
  onReload?: () => void
}

interface State {
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('CronoApp quebrou ao renderizar:', error, info.componentStack)
  }

  private handleReload = (): void => {
    if (this.props.onReload) {
      this.props.onReload()
      return
    }
    window.location.reload()
  }

  render(): ReactNode {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <div className="crash" role="alert">
        <div className="crash-card">
          <h1>O painel travou</h1>
          <p>
            Alguma coisa quebrou na tela. O áudio que estiver tocando continua —
            o que parou foi o painel. Recarregue para voltar; a fila, os fundos
            e as preferências estão salvos neste dispositivo.
          </p>
          <pre>{error.message}</pre>
          <button
            className="pill-btn"
            type="button"
            onClick={this.handleReload}
          >
            Recarregar o painel
          </button>
        </div>
      </div>
    )
  }
}
