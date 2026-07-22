import { Dashboard } from './Dashboard'
import { CronoProvider } from './features/mixer/AudioEngineProvider'
import type { CronoProviderProps } from './features/mixer/AudioEngineProvider'
import { ErrorBoundary } from './shared/ErrorBoundary'

/**
 * A raiz: rede de proteção por fora, motor e store por dentro, painel no meio.
 *
 * A ordem importa. O `ErrorBoundary` fica **fora** do provedor para pegar
 * também a explosão que acontecer na montagem do motor — se ele estivesse
 * dentro, esse caso levaria a tela ao branco, que é o pior cenário no meio de
 * um culto (RNF-03.1).
 */

export type AppProps = Pick<CronoProviderProps, 'store' | 'engineOptions'>

export default function App({ store, engineOptions }: AppProps = {}) {
  return (
    <ErrorBoundary>
      <CronoProvider store={store} engineOptions={engineOptions}>
        <Dashboard />
      </CronoProvider>
    </ErrorBoundary>
  )
}
