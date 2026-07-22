import { ListMusic, Music2, Search, WifiOff } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { BackgroundsTab } from './features/backgrounds/BackgroundsTab'
import { DeckPanel } from './features/backgrounds/DeckPanel'
import { FadeToasts } from './features/mixer/FadeToasts'
import { MixerPane } from './features/mixer/MixerPane'
import { PreviewDeck } from './features/mixer/PreviewDeck'
import { Topbar } from './features/mixer/Topbar'
import { useCrono, useEngine, useHydrated } from './features/mixer/context'
import { HistoryPanel } from './features/queue/HistoryPanel'
import { QueueTab } from './features/queue/QueueTab'
import { SearchTab } from './features/search/SearchTab'
import { Credit } from './shared/Credit'
import { SettingsModal } from './shared/SettingsModal'
import { WelcomeSetup } from './shared/WelcomeSetup'
import { useOnlineStatus } from './shared/hooks'
import { useKeyboardShortcuts } from './shared/useKeyboardShortcuts'
import type { AppTab } from './shared/tabs'

/**
 * O painel montado — e **só** a montagem.
 *
 * Este arquivo decide onde cada pedaço fica na tela e mais nada: não tem regra
 * de fade, não tem chamada de rede, não tem estado de áudio. É a resposta
 * direta ao RNF-01.4, contra o `App.tsx` de 721 linhas do protótipo, que
 * misturava UI, mixagem, atalhos e `fetch` no mesmo componente.
 *
 * O que sobrou de estado aqui é o que é de fato só da tela: qual aba está
 * aberta e se o modal está no ar.
 */
export function Dashboard() {
  const engine = useEngine()
  const [tab, setTab] = useState<AppTab>('queue')
  const [settingsOpen, setSettingsOpen] = useState(false)

  const theme = useCrono((state) => state.preferences.theme)
  const accent = useCrono((state) => state.preferences.accent)
  const queueLength = useCrono((state) => state.queue.length)

  // A tela de boas-vindas só depois do IndexedDB responder: antes disso o
  // estado é o padrão de fábrica, e ela apareceria para quem já configurou.
  const hydrated = useHydrated()
  const setupDone = useCrono((state) => state.preferences.setupDone)
  const mostrarBoasVindas = hydrated && !setupDone

  const online = useOnlineStatus()

  // Estável, senão o React desmontaria e remontaria o player do fundo a cada
  // repintura do painel — no meio do culto.
  const attachBackground = useCallback(
    (element: HTMLDivElement | null) => engine.attachBackground(element),
    [engine],
  )

  // A rede voltou — o operador ligou o hotspot do celular (RNF-03.4). Se algum
  // player não chegou a nascer, é a hora exata de refazê-lo: sem isto o app
  // ficaria sem som até alguém recarregar a página no meio do culto. Não faz
  // nada quando está tudo de pé.
  useEffect(() => {
    if (online) engine.retryPlayers()
  }, [online, engine])

  // Com qualquer diálogo por cima, o teclado é dele (RF-07.2).
  useKeyboardShortcuts({ setTab, paused: settingsOpen || mostrarBoasVindas })

  return (
    <main
      className="app-shell"
      data-theme={theme}
      style={{ '--accent': accent } as CSSProperties}
    >
      <Topbar onOpenSettings={() => setSettingsOpen(true)} />

      {/* Streaming sem internet não toca. O plano B do operador é o hotspot do
          celular — e para chegar nele ele precisa saber (RNF-03.4). */}
      {!online && (
        <div className="offline-banner" role="alert">
          <WifiOff size={14} />
          Sem conexão com a internet. O YouTube não vai tocar até a rede voltar
          — ligue o hotspot do celular se precisar.
        </div>
      )}

      {/* O player do fundo não tem o que mostrar: é só áudio. */}
      <div
        className="hidden-player"
        ref={attachBackground}
        aria-hidden="true"
      />

      <section className="workbench">
        <div className="primary-pane">
          <nav className="tabs" aria-label="Painéis do CronoApp">
            <TabButton
              tab="queue"
              current={tab}
              onSelect={setTab}
              icon={<ListMusic size={15} />}
            >
              Fila
            </TabButton>
            <TabButton
              tab="search"
              current={tab}
              onSelect={setTab}
              icon={<Search size={15} />}
            >
              Buscar música
            </TabButton>
            <TabButton
              tab="backgrounds"
              current={tab}
              onSelect={setTab}
              icon={<Music2 size={15} />}
            >
              Fundos
            </TabButton>
            <span>{queueLength} na fila</span>
          </nav>

          {/* A troca de aba é uma transição CSS (`.tab-content`), não uma
              biblioteca de animação — ver a revisão da Etapa 4. */}
          {tab === 'queue' && <QueueTab />}
          {tab === 'search' && <SearchTab onAdded={() => setTab('queue')} />}
          {tab === 'backgrounds' && <BackgroundsTab />}
        </div>

        {/* `tabIndex` porque a coluna rola por dentro desde que a altura do
            painel passou a ser a do viewport: área rolável que não recebe foco
            é conteúdo inalcançável para quem navega por teclado — foi a
            auditoria do axe que pegou (`scrollable-region-focusable`). O rótulo
            existe para o ponto de parada dizer o que é, em vez de ser um
            "grupo" mudo no leitor de tela. */}
        <aside
          className="secondary-pane"
          tabIndex={0}
          aria-label="Pré-escuta, fundo musical e histórico"
        >
          <PreviewDeck />
          <DeckPanel />
          <HistoryPanel />
        </aside>

        <MixerPane />
      </section>

      <footer className="shortcuts">
        <b>ATALHOS</b>
        <span>
          <kbd>Espaço</kbd> pausar
        </span>
        <span>
          <kbd>B</kbd> fundo
        </span>
        <span>
          <kbd>S</kbd> parar
        </span>
        <span>
          <kbd>N</kbd> próxima da fila
        </span>
        <span>
          <kbd>M</kbd> mix agora
        </span>
        <span>
          <kbd>↑</kbd>
          <kbd>↓</kbd> volume do fundo
        </span>
        <span>
          <kbd>Shift</kbd>
          <kbd>↑</kbd>
          <kbd>↓</kbd> volume do master
        </span>
        <span>
          <kbd>1</kbd>
          <kbd>2</kbd>
          <kbd>3</kbd> abas
        </span>
        <span>dados salvos neste dispositivo</span>
        <Credit />
      </footer>

      <FadeToasts />

      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}

      {mostrarBoasVindas && <WelcomeSetup />}
    </main>
  )
}

interface TabButtonProps {
  tab: AppTab
  current: AppTab
  onSelect: (tab: AppTab) => void
  icon: ReactNode
  children: ReactNode
}

function TabButton({ tab, current, onSelect, icon, children }: TabButtonProps) {
  const active = tab === current
  return (
    <button
      type="button"
      className={active ? 'active' : ''}
      aria-current={active ? 'true' : undefined}
      onClick={() => onSelect(tab)}
    >
      {icon}
      {children}
    </button>
  )
}
