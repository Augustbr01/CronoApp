import { useState } from 'react'
import { useInterval } from '../../shared/hooks'

/**
 * O VU-meter (RF-05.2).
 *
 * Catorze segmentos desenhados **de baixo para cima** (o CSS usa
 * `column-reverse`), em três faixas de cor: normal até o 9, quente do 9 ao 12,
 * pico do 12 em diante.
 *
 * O tremor não é enfeite. O volume que o app conhece é o que ele **manda** ao
 * YouTube, não o que sai da caixa — o iframe não deixa medir o sinal de
 * verdade. Um medidor perfeitamente parado passaria a impressão errada de que
 * está medindo o áudio; o tremor comunica "tem som saindo por aqui", que é a
 * informação que o operador de fato usa.
 */

const SEGMENTS = 14
const JITTER_MS = 160

interface MeterProps {
  /** Nível efetivo do canal, 0–100, já com fade e mudo aplicados. */
  level: number
}

export function Meter({ level }: MeterProps) {
  const playing = level > 0
  // O sorteio acontece no timer, não no render: render tem que ser previsível
  // (a mesma entrada, a mesma saída), senão o React não pode reaproveitá-lo.
  const [jitter, setJitter] = useState(1)

  // Parado, o medidor não agenda nada — nada de girar um timer durante o
  // sermão inteiro (RNF-04.2).
  useInterval(
    () => setJitter(0.85 + Math.random() * 0.25),
    playing ? JITTER_MS : null,
  )

  const lit = Math.round((level / 100) * SEGMENTS * (playing ? jitter : 1))

  return (
    <div className="meter" aria-hidden="true">
      {Array.from({ length: SEGMENTS }, (_, index) => (
        <i
          key={index}
          className={
            index < lit
              ? index >= 12
                ? 'hot'
                : index >= 9
                  ? 'warm'
                  : 'lit'
              : ''
          }
        />
      ))}
    </div>
  )
}
