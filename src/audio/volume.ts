import { clamp01 } from './fade'

/**
 * Composição de volume — as regras que transformam a posição do fader e o
 * estado do fade no número final (0 a 1) que vai para o player.
 *
 * Continuam funções puras, sem timer e sem DOM. Duas responsabilidades:
 *  - o snap-to-mute do fader (RF-04.9);
 *  - a composição `fader × fade` com mute binário (RF-04.8).
 *
 * A suavização do fader ao longo do tempo (RF-04.7) é peça à parte, na Parte
 * 2.3 — aqui o fader já chega com seu valor "suavizado" pronto.
 */

/** Abaixo deste percentual (escala 0–100) o fader gruda no mudo (RF-04.9). */
export const SNAP_TO_MUTE_THRESHOLD = 3

/**
 * Snap-to-mute: um fader arrastado para muito perto do fim (abaixo de 3%) é
 * puxado ao zero absoluto, em vez de deixar um fiapo de volume audível.
 * Recebe e devolve o valor do fader na escala 0–100.
 */
export function snapToMute(faderValue: number): number {
  const clamped = Math.max(0, Math.min(100, faderValue))
  return clamped < SNAP_TO_MUTE_THRESHOLD ? 0 : clamped
}

/**
 * Volume final de um canal, de 0 a 1, pronto para mandar ao player (RF-04.8).
 *
 * É o fader já suavizado (0–1) multiplicado pelo fator de fade (0–1). Quando o
 * canal está mudo — fader no zero absoluto — devolve 0 direto, sem confiar na
 * multiplicação: é a garantia de silêncio de verdade, sem nenhum resíduo do
 * volume interno do player.
 */
export function composeVolume(
  faderSmoothed: number,
  fadeFactor: number,
  muted: boolean,
): number {
  if (muted) return 0
  return clamp01(faderSmoothed * fadeFactor)
}
