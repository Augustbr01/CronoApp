import { useState } from 'react'
import { formatClock } from './format'
import { useInterval } from './hooks'

/**
 * O relógio de parede do "AGORA" na topbar.
 *
 * É componente, e não hook, de propósito: ele só existe na árvore quando a
 * topbar está de fato mostrando a hora. Assim ele **nasce com a hora certa** —
 * sem precisar de um efeito que corrija o valor ao aparecer — e some, com o
 * timer junto, assim que a topbar volta a mostrar tempo de música.
 *
 * `live` acompanha o protótipo: o relógio só anda no modo silêncio. Nos outros
 * modos o painel já re-renderiza por conta do áudio.
 */
export function Clock({ live }: { live: boolean }) {
  const [now, setNow] = useState(() => new Date())

  useInterval(() => setNow(new Date()), live ? 1000 : null)

  return <>{formatClock(now)}</>
}
