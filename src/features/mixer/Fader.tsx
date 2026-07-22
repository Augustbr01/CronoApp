import { useRef } from 'react'
import { Meter } from './Meter'

/**
 * Um fader vertical do mixer (RF-05.1).
 *
 * Três formas de operar, porque a mesa de som não é sempre um mouse:
 *
 * - **Ponteiro** (RF-05.6): a posição do dedo/cursor contra a altura do trilho
 *   vira o valor. `setPointerCapture` mantém o arraste vivo mesmo quando o dedo
 *   sai do trilho — sem isso, um arraste rápido "escapa" e o fader trava no
 *   meio.
 * - **Teclado** (RNF-05.2): setas mexem de 5 em 5, com `role="slider"` e
 *   `aria-valuenow` para leitor de tela.
 * - **O snap-to-mute** (RF-04.9) fica no motor, não aqui: o valor que a tela
 *   mostra é o mesmo que o áudio ouve, sempre.
 *
 * O `MUTE` no lugar do número não quer dizer "fader no zero", e sim **canal
 * fora do ar** (RF-05.3) — é a pergunta que o operador realmente faz ao olhar.
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

  const setFromPointer = (clientY: number): void => {
    const rect = trackRef.current?.getBoundingClientRect()
    if (!rect || rect.height === 0) return
    const ratio = 1 - (clientY - rect.top) / rect.height
    onChange(Math.max(0, Math.min(100, Math.round(ratio * 100))))
  }

  return (
    <div className="fader">
      <span className="fader-label">{label}</span>
      <span className={`fader-value ${muted ? 'muted' : ''}`}>
        {muted ? 'MUTE' : value}
      </span>
      <div className="fader-body">
        <Meter level={muted ? 0 : level} />
        <div
          ref={trackRef}
          className="fader-track"
          role="slider"
          tabIndex={0}
          aria-label={`Volume ${label}`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={value}
          aria-valuetext={`${value}%`}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId)
            setFromPointer(event.clientY)
          }}
          onPointerMove={(event) => {
            if (event.buttons & 1) setFromPointer(event.clientY)
          }}
          onKeyDown={(event) => {
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
