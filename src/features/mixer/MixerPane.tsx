import { Fader } from './Fader'
import { useCrono, useEngine, useEngineValue } from './context'

/**
 * A coluna do mixer: MASTER (louvor) e FUNDO (RF-05.1).
 *
 * Cada fader lê duas coisas de lugares diferentes, e é de propósito: a
 * **posição** vem do store (é intenção do operador, e é persistida) e o
 * **nível** vem do motor (é o som de agora, e some quando o app fecha).
 */
export function MixerPane() {
  const engine = useEngine()

  const mainFader = useCrono((state) => state.mainFader)
  const backgroundFader = useCrono((state) => state.backgroundFader)

  const mainLevel = useEngineValue((s) => Math.round(s.mainVolume * 100))
  const backgroundLevel = useEngineValue((s) =>
    Math.round(s.backgroundVolume * 100),
  )
  // Fora do ar é o que o operador chama de "mudo" neste painel — não é o fader
  // no zero (RF-05.3).
  const mainMuted = useEngineValue((s) => s.mainPhase === 'silent')
  const backgroundMuted = useEngineValue((s) => s.backgroundPhase === 'silent')

  return (
    <aside className="mixer-pane" aria-label="Mixer de volume">
      <div className="mixer">
        <Fader
          label="MASTER"
          value={mainFader}
          level={mainLevel}
          muted={mainMuted}
          onChange={engine.setMainFader}
        />
        <i className="mixer-divider" />
        <Fader
          label="FUNDO"
          value={backgroundFader}
          level={backgroundLevel}
          muted={backgroundMuted}
          onChange={engine.setBackgroundFader}
        />
      </div>
    </aside>
  )
}
