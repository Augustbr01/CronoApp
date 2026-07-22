import { Pause, Play } from 'lucide-react'
import { useCallback } from 'react'
import { useCrono, useEngine, useEngineValue } from './context'

/**
 * A pré-escuta: onde o vídeo do louvor aparece (RF-04.2).
 *
 * O iframe **fica montado o tempo todo**, mesmo em standby, e é isso que muda
 * em relação ao protótipo: lá o player era montado e desmontado junto com o
 * item da fila, e por isso qualquer parada precisava esperar o fade antes de
 * mexer no estado — desmontar no meio do fade cortaria o som seco. Aqui o
 * player é um só, do começo ao fim do culto, e trocar de música é só um
 * `load()`. O fade corre por cima, sem depender de quem está montado.
 *
 * Abaixo dele, o erro do player em português (RNF-03.3) — nunca um
 * `.catch(() => {})`.
 */
export function PreviewDeck() {
  const engine = useEngine()

  // A referência precisa ser **estável**: um callback novo a cada render faria
  // o React chamá-lo com `null` e o motor destruiria o player — no meio do
  // louvor, a cada repintura do cronômetro.
  const attachPlayer = useCallback(
    (element: HTMLDivElement | null) => engine.attachMain(element),
    [engine],
  )

  const currentId = useCrono((state) => state.currentId)
  const queue = useCrono((state) => state.queue)
  const backgrounds = useCrono((state) => state.backgrounds)
  const selectedBackgroundId = useCrono((state) => state.selectedBackgroundId)
  const mode = useCrono((state) => state.mode)

  const mainPhase = useEngineValue((s) => s.mainPhase)
  const elapsed = useEngineValue((s) => Math.floor(s.elapsedSec))
  const backgroundElapsed = useEngineValue((s) =>
    Math.floor(s.backgroundElapsedSec),
  )
  const error = useEngineValue((s) => s.error)
  const playerDown = useEngineValue((s) => s.playerDown)

  const current = queue.find((item) => item.id === currentId) ?? null
  const background =
    backgrounds.find((track) => track.id === selectedBackgroundId) ?? null

  // Enquanto houver som do louvor — inclusive durante a descida — o vídeo
  // continua à vista. Só some quando o canal chega ao silêncio de verdade.
  const mostrandoVideo = currentId !== null || mainPhase !== 'silent'

  const progresso =
    mode === 'main' && current?.durationSec
      ? (elapsed / current.durationSec) * 100
      : mode === 'background' && background?.durationSec
        ? (backgroundElapsed / background.durationSec) * 100
        : 0

  return (
    <>
      <h2 className="section-title">
        Pré-escuta
        <i />
      </h2>
      <div className={`preview ${mostrandoVideo ? 'has-video' : ''}`}>
        <div className="preview-player" ref={attachPlayer} />
        {!mostrandoVideo && (
          <div className="preview-idle">
            <span>
              {mode === 'main' ? <Pause size={19} /> : <Play size={19} />}
            </span>
            <p>Fundo: {background?.title ?? 'nenhum selecionado'}</p>
          </div>
        )}
        {!mostrandoVideo && (
          <i className="preview-progress" style={{ width: `${progresso}%` }} />
        )}
      </div>
      {error && (
        <p className="player-error" role="alert">
          {error}
          {/* Só quando há o que refazer: um vídeo bloqueado não melhora com
              insistência — ali a saída é trocar de vídeo. */}
          {playerDown && (
            <button
              type="button"
              className="player-error-retry"
              onClick={engine.retryPlayers}
            >
              Tentar de novo
            </button>
          )}
          <button
            type="button"
            className="player-error-dismiss"
            onClick={engine.dismissError}
            aria-label="Dispensar aviso"
          >
            ×
          </button>
        </p>
      )}
    </>
  )
}
