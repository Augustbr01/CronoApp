import { useEffect } from 'react'
import { useCrono, useEngine } from '../features/mixer/context'
import type { AppTab } from './tabs'

/**
 * Os atalhos de teclado (RF-07.1).
 *
 * Num culto o operador tem uma mão no notebook e os olhos na igreja. Os atalhos
 * são a interface de verdade; os botões são o mapa de quem ainda está
 * aprendendo. A lista aqui é exatamente a do rodapé (RF-07.3) — se uma mudar, a
 * outra tem que mudar junto.
 *
 * | Tecla | O que faz |
 * | ----- | --------- |
 * | `Espaço` | pausa, continua ou religa o fundo, conforme o momento |
 * | `B` | liga/desliga o fundo |
 * | `S` | para o louvor e devolve o fundo |
 * | `N` | toca a próxima da fila |
 * | `M` | mixa para o próximo fundo |
 * | `↑` `↓` | volume do fundo, de 5 em 5 |
 * | `Shift` + `↑` `↓` | volume do master |
 * | `1` `2` `3` | troca de aba |
 *
 * O fundo fica nas setas secas e o master no `Shift` porque é o fundo que o
 * operador mexe o tempo todo — ele acompanha a fala, sobe na oração, desce
 * quando alguém pega o microfone. O master é ajuste de começo de culto.
 *
 * **Nada dispara com o foco num campo de texto ou com o modal aberto**
 * (RF-07.2): quem está digitando o nome de alguém não pode parar o louvor ao
 * escrever "s".
 */

interface Options {
  setTab: (tab: AppTab) => void
  /** Com o modal aberto, o teclado é dele. */
  paused: boolean
}

/** O foco está num lugar onde as teclas significam texto, não comando? */
function digitando(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
}

/**
 * O foco está num fader, que trata as setas por conta própria?
 *
 * Sem esta pergunta as duas coisas acontecem ao mesmo tempo: o `onKeyDown` do
 * fader soma 5 e o atalho global soma outros 5. O operador aperta uma vez e o
 * volume pula 10 — e ele não tem como saber por quê, porque a tecla é a mesma
 * que funciona certo quando o foco está em qualquer outro lugar.
 */
function emUmFader(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement && target.closest('[role="slider"]') !== null
  )
}

export function useKeyboardShortcuts({ setTab, paused }: Options): void {
  const engine = useEngine()
  const mode = useCrono((state) => state.mode)
  const currentId = useCrono((state) => state.currentId)
  const backgroundsLength = useCrono((state) => state.backgrounds.length)

  useEffect(() => {
    if (paused) return

    const onKeyDown = (event: KeyboardEvent): void => {
      if (digitando(event.target)) return
      // Combinações do navegador (Ctrl+R, Cmd+L…) continuam sendo dele.
      if (event.ctrlKey || event.metaKey || event.altKey) return

      switch (event.key) {
        case ' ':
          event.preventDefault()
          engine.togglePlayPause()
          return
        case 'ArrowUp':
          if (emUmFader(event.target)) return
          event.preventDefault()
          if (event.shiftKey) engine.nudgeMainFader(5)
          else engine.nudgeBackgroundFader(5)
          return
        case 'ArrowDown':
          if (emUmFader(event.target)) return
          event.preventDefault()
          if (event.shiftKey) engine.nudgeMainFader(-5)
          else engine.nudgeBackgroundFader(-5)
          return
        case '1':
          setTab('queue')
          return
        case '2':
          setTab('search')
          return
        case '3':
          setTab('backgrounds')
          return
      }

      switch (event.key.toLowerCase()) {
        case 'b':
          // Durante o louvor, `B` não faz nada: o fundo entra quando o louvor
          // sair, e não por cima dele.
          if (mode !== 'main' && backgroundsLength > 0)
            engine.toggleBackground()
          return
        case 's':
          if (currentId) engine.stopMain()
          return
        case 'n':
          engine.playNext()
          return
        case 'm':
          if (mode === 'background') engine.nextBackground()
          return
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [engine, mode, currentId, backgroundsLength, setTab, paused])
}
