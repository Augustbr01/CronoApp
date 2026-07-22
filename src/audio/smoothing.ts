import { clamp01 } from './fade'

/**
 * Suavização do fader — o volume real "persegue" suavemente o ponto onde o
 * operador deixou o fader, em vez de saltar de uma vez (RF-04.7).
 *
 * Sem isso, arrastar o fader rápido daria um "degrau" no som. Com isso, a cada
 * quadro o volume anda só uma fração da distância que ainda falta até o alvo:
 * começa rápido e vai desacelerando ao chegar perto — a clássica curva
 * exponencial de "easing". Continua tudo função pura; o loop por quadro
 * (requestAnimationFrame) fica no motor, na Parte 2.5.
 *
 * Este módulo também é a ponte entre as duas escalas: o fader do usuário pensa
 * em 0–100 e o player pensa em 0–1 (era a pendência anotada na Parte 2.2).
 */

/** Fração da distância até o alvo percorrida a cada quadro (0–1). */
export const FADER_SMOOTHING = 0.22

/** Distância mínima até o alvo: abaixo dela, gruda no alvo e para. */
export const FADER_SETTLE_EPSILON = 0.01

/** Converte o fader do usuário (escala 0–100) para o volume alvo (0–1). */
export function normalizeFader(faderValue: number): number {
  return clamp01(faderValue / 100)
}

/**
 * Um passo da perseguição: dado onde o volume está (`current`) e para onde quer
 * ir (`target`), devolve o próximo valor, andando `factor` da distância que
 * falta. Quando essa distância já é menor que `epsilon`, gruda no alvo — senão
 * perseguiria pra sempre em passos cada vez menores, sem nunca chegar.
 */
export function approach(
  current: number,
  target: number,
  factor: number = FADER_SMOOTHING,
  epsilon: number = FADER_SETTLE_EPSILON,
): number {
  const delta = target - current
  if (Math.abs(delta) < epsilon) return target
  return current + delta * factor
}

// Nota: a Parte 2.3 também exportava um `hasSettled(atual, alvo, epsilon)` para
// o laço por quadro decidir quando parar. Ao ligar o laço de verdade na Parte
// 5b, ele se mostrou errado para esse fim: como o `approach` gruda no alvo
// assim que chega a menos de um epsilon, parar quando "está perto" congelava o
// volume um passo antes do lugar — permanentemente. O laço usa igualdade exata
// com o alvo, e a função saiu daqui em vez de virar código morto.
