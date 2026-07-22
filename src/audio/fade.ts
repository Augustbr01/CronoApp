/**
 * Curvas de fade — matemática pura de transição de volume.
 *
 * Nada aqui conhece o DOM, o YouTube ou o relógio real: são funções de
 * `progresso do tempo → fator de ganho`. Quem chama (o motor de áudio, nas
 * próximas partes da Etapa 2) roda um timer, mede quanto do fade já passou com
 * `fadeProgress` e converte esse progresso em ganho com `fadeGain`.
 *
 * A escolha central desta parte (RF-04.6) é usar curvas de POTÊNCIA CONSTANTE
 * em vez da interpolação linear do protótipo. Num crossfade — o fundo descendo
 * enquanto o louvor sobe — os dois fades se cruzam valendo 0,5 cada. Como o
 * volume percebido acompanha o quadrado da amplitude, dois fades lineares somam
 * potência 0,5² + 0,5² = 0,5 no meio: um buraco de ~3 dB que se ouve como uma
 * "barrigada" no volume. Com seno/cosseno, sin²(x) + cos²(x) = 1 em todo
 * instante — a energia total fica constante e a transição soa uniforme.
 */

export type FadeDirection = 'in' | 'out'

/** Prende um número ao intervalo [0, 1]. */
export function clamp01(value: number): number {
  if (value <= 0) return 0
  if (value >= 1) return 1
  return value
}

/**
 * Quanto de um fade já passou, de 0 (começou agora) a 1 (terminou).
 *
 * Duração zero ou negativa conta como fade instantâneo e devolve 1 — é o que
 * permite configurar o fade em 0 s (RF-04.12) sem tratar esse caso à parte no
 * motor.
 */
export function fadeProgress(elapsedMs: number, durationMs: number): number {
  if (durationMs <= 0) return 1
  return clamp01(elapsedMs / durationMs)
}

/**
 * Fator de ganho (0 a 1) para um dado progresso, na curva de potência
 * constante. `in` sobe de 0 a 1 com seno; `out` desce de 1 a 0 com cosseno.
 *
 * Para o mesmo progresso `t`, vale sempre `fadeGain('in', t)² +
 * fadeGain('out', t)² === 1` — é essa identidade que mantém a potência
 * constante durante um crossfade.
 */
export function fadeGain(direction: FadeDirection, progress: number): number {
  const t = clamp01(progress)
  return direction === 'in'
    ? Math.sin((t * Math.PI) / 2)
    : Math.cos((t * Math.PI) / 2)
}

/**
 * O caminho de volta: dado um ganho, em que ponto da curva ele está.
 *
 * Serve ao cancelamento de fade (RF-04.10). Se o louvor está saindo do ar e o
 * operador se arrepende no meio do caminho, o fade tem que **virar de direção a
 * partir do volume atual** — não recomeçar do zero, o que se ouviria como um
 * tranco. Para isso é preciso saber a que progresso da curva de subida
 * corresponde o ganho onde a descida parou. É a inversa de `fadeGain`.
 */
export function fadeProgressForGain(
  direction: FadeDirection,
  gain: number,
): number {
  const g = clamp01(gain)
  const angle = direction === 'in' ? Math.asin(g) : Math.acos(g)
  return (angle * 2) / Math.PI
}
