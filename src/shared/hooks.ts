import { useEffect, useRef, useState } from 'react'

/**
 * Os hooks transversais do painel.
 *
 * Todos seguem a mesma regra do CLAUDE.md: **todo timer tem limpeza** (RNF-04.2).
 * Um `setInterval` esquecido no painel de um culto de duas horas é vazamento
 * garantido — e, pior, é um relógio andando sozinho depois que ninguém mais
 * olha para ele.
 */

/**
 * Chama `callback` a cada `delayMs`, ou nunca, se `delayMs` for `null`.
 *
 * O callback fica num ref para o intervalo **não** ser recriado a cada render:
 * sem isso, um componente que renderiza a 60 fps derrubaria e recriaria o timer
 * 60 vezes por segundo, e ele nunca dispararia.
 */
export function useInterval(
  callback: () => void,
  delayMs: number | null,
): void {
  const saved = useRef(callback)

  useEffect(() => {
    saved.current = callback
  }, [callback])

  useEffect(() => {
    if (delayMs === null) return
    const id = window.setInterval(() => saved.current(), delayMs)
    return () => window.clearInterval(id)
  }, [delayMs])
}

/**
 * A conexão caiu? (RNF-03.4)
 *
 * O app é streaming do YouTube: sem internet, nada toca. O plano B do operador
 * é o hotspot do celular, e para chegar a esse plano ele precisa **saber** que a
 * conexão caiu — em vez de ficar olhando um vídeo que não começa.
 */
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine)

  useEffect(() => {
    const subir = (): void => setOnline(true)
    const cair = (): void => setOnline(false)
    window.addEventListener('online', subir)
    window.addEventListener('offline', cair)
    return () => {
      window.removeEventListener('online', subir)
      window.removeEventListener('offline', cair)
    }
  }, [])

  return online
}

/** Elementos que recebem foco por padrão dentro de um diálogo. */
const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

/**
 * Foco preso dentro do modal (RNF-05.1).
 *
 * Três coisas, todas ausentes no protótipo:
 *
 * 1. **Foco inicial** no primeiro controle — quem abre com teclado não fica
 *    com o foco perdido lá atrás, no botão que abriu o modal.
 * 2. **Armadilha**: `Tab` circula dentro do diálogo em vez de vazar para a
 *    tela de trás, que está inerte.
 * 3. **Devolução**: ao fechar, o foco volta para onde estava.
 */
export function useFocusTrap(
  ref: React.RefObject<HTMLElement | null>,
  active: boolean,
): void {
  useEffect(() => {
    if (!active) return
    const container = ref.current
    if (!container) return

    const anterior = document.activeElement as HTMLElement | null
    // `tabIndex >= 0` já exclui o que foi tirado da ordem de tabulação de
    // propósito — como o campo de arquivo escondido atrás do botão "Importar".
    const alvos = (): HTMLElement[] =>
      [...container.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (el) => !el.hasAttribute('hidden') && el.tabIndex >= 0,
      )

    // Foco inicial: o primeiro controle, ou o próprio diálogo se não houver um.
    const primeiro = alvos()[0] ?? container
    primeiro.focus()

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Tab') return
      const focaveis = alvos()
      if (focaveis.length === 0) {
        event.preventDefault()
        return
      }
      const inicio = focaveis[0]
      const fim = focaveis[focaveis.length - 1]
      if (!inicio || !fim) return

      const atual = document.activeElement
      if (event.shiftKey && (atual === inicio || atual === container)) {
        event.preventDefault()
        fim.focus()
      } else if (!event.shiftKey && atual === fim) {
        event.preventDefault()
        inicio.focus()
      }
    }

    container.addEventListener('keydown', onKeyDown)
    return () => {
      container.removeEventListener('keydown', onKeyDown)
      anterior?.focus?.()
    }
  }, [ref, active])
}
