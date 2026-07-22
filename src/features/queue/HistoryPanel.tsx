import { Check } from 'lucide-react'
import { formatTimeOfDay } from '../../shared/format'
import { useCrono } from '../mixer/context'

/**
 * "Já tocou" — o histórico do culto corrente (RF-06.1).
 *
 * Mostra só o culto de agora, que é o que interessa a quem está na mesa de som
 * neste momento. O histórico completo, agrupado por culto (RF-06.2), continua
 * guardado — são até 500 entradas — e ganha tela própria depois; o que o
 * operador precisa no meio da reunião é lembrar quem já cantou hoje.
 */
export function HistoryPanel() {
  const history = useCrono((state) => state.history)
  const sessionId = useCrono((state) => state.sessionId)

  const doCulto = history.filter((entry) => entry.sessionId === sessionId)

  return (
    <>
      <h2 className="section-title">
        Já tocou
        <i />
      </h2>
      <div className="history-list">
        {doCulto.length ? (
          doCulto.map((entry) => (
            <div key={entry.id}>
              <Check size={13} />
              <span>
                {entry.name} — {entry.title}
              </span>
              <small>{formatTimeOfDay(entry.finishedAt)}</small>
            </div>
          ))
        ) : (
          <p>Nada finalizado nesta sessão</p>
        )}
      </div>
    </>
  )
}
