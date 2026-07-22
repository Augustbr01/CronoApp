import { useRef, useState } from 'react'
import { Meter } from './Meter'

/**
 * Um fader vertical do mixer (RF-05.1).
 *
 * Três formas de operar, porque a mesa de som não é sempre um mouse:
 *
 * - **Ponteiro** (RF-05.6): a posição do dedo/cursor contra a altura do trilho
 *   vira o valor.
 * - **Teclado** (RNF-05.2): setas mexem de 5 em 5, com `role="slider"` e
 *   `aria-valuenow` para leitor de tela.
 * - **O snap-to-mute** (RF-04.9) fica no motor, não aqui: o valor que a tela
 *   mostra é o mesmo que o áudio ouve, sempre.
 *
 * O `MUTE` no lugar do número não quer dizer "fader no zero", e sim **canal
 * fora do ar** (RF-05.3) — é a pergunta que o operador realmente faz ao olhar.
 *
 * ## Duas correções de arraste que valem o comentário
 *
 * **A área de pegada é a coluna inteira, não só o trilho.** O trilho tem 28 px
 * e a coluna do fader tem 43: os 15 px do VU-meter e do vão pareciam parte do
 * controle e não faziam nada. Quem pegava ali via o fader travar, soltava e
 * clicava de novo — que é como o problema foi relatado. O medidor é mostrador,
 * não controle, então entregar a área dele ao arraste não custa nada e devolve
 * mais de um terço do alvo.
 *
 * **O arraste é seguido pelo `pointerId`, não por `event.buttons`.** O `buttons`
 * chega a reportar zero no meio de um arraste de trackpad ou caneta, e a
 * verificação antiga (`buttons & 1`) engolia esses quadros — o fader parava
 * embaixo do dedo ainda pressionado. Guardar o ponteiro que iniciou o gesto e
 * segui-lo até `pointerup`/`pointercancel` não tem esse buraco.
 */

const STEP = 5

interface FaderProps {
  label: string
  /** Posição do fader, 0–100. */
  value: number
  /** Nível efetivo para o medidor, 0–100. */
  level: number
  /** Canal fora do ar: o número dá lugar a MUTE e o medidor apaga. */
  muted: boolean
  onChange: (value: number) => void
}

export function Fader({ label, value, level, muted, onChange }: FaderProps) {
  const trackRef = useRef<HTMLDivElement>(null)
  /** O ponteiro que está arrastando agora, ou `null`. */
  const arrastando = useRef<number | null>(null)
  const [pego, setPego] = useState(false)
  /**
   * O foco chegou aqui por um clique, não pelo teclado.
   *
   * Existe para apagar o anel de foco durante o arraste sem apagá-lo para quem
   * navega por teclado — que precisa dele (RNF-05.2) e é justamente quem não
   * pode perdê-lo. O `:focus-visible` sozinho não resolve: como o
   * `preventDefault` do `pointerdown` impede o foco nativo e nós o movemos por
   * código, o Chrome não consegue atribuir o foco ao clique e mostra o anel
   * assim mesmo. A primeira tecla apertada devolve o anel.
   */
  const [focoDePonteiro, setFocoDePonteiro] = useState(false)

  /**
   * Converte a altura do ponteiro em valor.
   *
   * A conta é sempre contra o **trilho**, mesmo quando a mão pegou na faixa do
   * medidor: é o trilho que o operador vê o cursor percorrer, e o valor tem que
   * bater com o que ele enxerga.
   */
  const setFromPointer = (clientY: number): void => {
    const rect = trackRef.current?.getBoundingClientRect()
    if (!rect || rect.height === 0) return
    const ratio = 1 - (clientY - rect.top) / rect.height
    onChange(Math.max(0, Math.min(100, Math.round(ratio * 100))))
  }

  const soltar = (): void => {
    arrastando.current = null
    setPego(false)
  }

  return (
    <div className="fader">
      <span className="fader-label">{label}</span>
      <span className={`fader-value ${muted ? 'muted' : ''}`}>
        {muted ? 'MUTE' : value}
      </span>
      <div
        className={`fader-body ${pego ? 'dragging' : ''}`}
        onPointerDown={(event) => {
          // Só o botão principal arrasta: o direito é do menu de contexto.
          if (event.button !== 0) return
          // Impede o navegador de iniciar seleção de texto por cima do gesto,
          // que é o caminho para um `pointercancel` no meio do arraste.
          event.preventDefault()

          event.currentTarget.setPointerCapture(event.pointerId)
          arrastando.current = event.pointerId
          setPego(true)
          // Pegar pelo medidor também leva o foco ao slider, para as setas
          // continuarem valendo logo depois do arraste (RNF-05.2) — mas sem o
          // anel, que aqui só atrapalharia a leitura do fader.
          setFocoDePonteiro(true)
          trackRef.current?.focus()
          setFromPointer(event.clientY)
        }}
        onPointerMove={(event) => {
          if (arrastando.current !== event.pointerId) return
          setFromPointer(event.clientY)
        }}
        onPointerUp={soltar}
        onPointerCancel={soltar}
        onLostPointerCapture={soltar}
      >
        <Meter level={muted ? 0 : level} />
        <div
          ref={trackRef}
          className={`fader-track ${focoDePonteiro ? 'foco-de-ponteiro' : ''}`}
          role="slider"
          tabIndex={0}
          onBlur={() => setFocoDePonteiro(false)}
          aria-label={`Volume ${label}`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={value}
          aria-valuetext={`${value}%`}
          onKeyDown={(event) => {
            // Tocou o teclado: a partir daqui o anel de foco volta a valer.
            setFocoDePonteiro(false)
            if (event.key === 'ArrowUp' || event.key === 'ArrowRight') {
              event.preventDefault()
              onChange(Math.min(100, value + STEP))
            }
            if (event.key === 'ArrowDown' || event.key === 'ArrowLeft') {
              event.preventDefault()
              onChange(Math.max(0, value - STEP))
            }
            if (event.key === 'Home') {
              event.preventDefault()
              onChange(0)
            }
            if (event.key === 'End') {
              event.preventDefault()
              onChange(100)
            }
          }}
        >
          <i className="fader-rail" />
          <i
            className="fader-fill"
            style={{ height: `calc(${value}% - 8px)` }}
          />
          <i
            className="fader-handle"
            style={{ bottom: `calc(4px + (${value} * (100% - 8px) / 100))` }}
          />
        </div>
      </div>
    </div>
  )
}
