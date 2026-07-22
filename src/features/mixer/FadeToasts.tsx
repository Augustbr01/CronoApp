import { ChevronsDown, ChevronsUp } from 'lucide-react'
import { useEngineValue } from './context'

/**
 * O aviso flutuante de fade (RF-05.5).
 *
 * Durante os segundos em que o volume sobe ou desce, o operador precisa saber
 * que **o app está fazendo alguma coisa** — senão ele aperta o botão de novo,
 * achando que não pegou, e cancela a própria ação (RF-04.10 funcionando contra
 * ele). A contagem regressiva responde "falta tanto".
 *
 * A entrada e a saída são CSS puro, não `framer-motion`: são duas transições de
 * opacidade e deslocamento, e o protótipo carregava ~35 KB de biblioteca para
 * isso (RNF-04.1).
 */

interface ToastProps {
  label: string
  direction: 'in' | 'out'
  remainingMs: number
  totalMs: number
}

function FadeToast({ label, direction, remainingMs, totalMs }: ToastProps) {
  const progress = totalMs > 0 ? 1 - remainingMs / totalMs : 1
  const segundos = (remainingMs / 1000).toFixed(1).replace('.', ',')

  return (
    <div className="fade-toast">
      {direction === 'out' ? (
        <ChevronsDown size={13} />
      ) : (
        <ChevronsUp size={13} />
      )}
      <span>
        {direction === 'out' ? 'Volume descendo' : 'Volume subindo'} · {label}
      </span>
      <span className="fade-track">
        <i style={{ width: `${progress * 100}%` }} />
      </span>
      <b>{segundos}s</b>
    </div>
  )
}

/**
 * Um toast por canal. Os seletores devolvem **números**, não objetos: o motor
 * publica a cada quadro, e um objeto novo por quadro re-renderizaria isto 60
 * vezes por segundo. Arredondando o restante para décimos, o componente repinta
 * dez vezes por segundo — que é o que a tela mostra de qualquer forma.
 */
export function FadeToasts() {
  const mainDirection = useEngineValue((s) => s.mainFade?.direction ?? null)
  const mainRemaining = useEngineValue((s) =>
    Math.round((s.mainFade?.remainingMs ?? 0) / 100),
  )
  const mainTotal = useEngineValue((s) => s.mainFade?.totalMs ?? 0)

  const bgDirection = useEngineValue((s) => s.backgroundFade?.direction ?? null)
  const bgRemaining = useEngineValue((s) =>
    Math.round((s.backgroundFade?.remainingMs ?? 0) / 100),
  )
  const bgTotal = useEngineValue((s) => s.backgroundFade?.totalMs ?? 0)

  return (
    <div className="fade-toasts" aria-live="polite">
      {mainDirection && (
        <FadeToast
          label="louvor"
          direction={mainDirection}
          remainingMs={mainRemaining * 100}
          totalMs={mainTotal}
        />
      )}
      {bgDirection && (
        <FadeToast
          label="fundo"
          direction={bgDirection}
          remainingMs={bgRemaining * 100}
          totalMs={bgTotal}
        />
      )}
    </div>
  )
}
