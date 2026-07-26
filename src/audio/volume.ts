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
export const SNAP_TO_MUTE_THRESHOLD = 1

/**
 * Snap-to-mute: um fader parado abaixo de 1% é puxado ao zero absoluto, em vez
 * de deixar um resíduo de volume. Recebe e devolve o valor do fader na escala
 * 0–100.
 *
 * **O limiar era 3, e desceu para 1 porque o som vai para o amplificador da
 * mesa.** A regra antiga supunha caixa de notebook, onde 1% ou 2% é fiapo
 * inaudível que só faz o operador achar que o canal está mudo. Passando por um
 * PA, 1% é o sussurro que se usa para deixar o fundo sob a fala — e engoli-lo
 * fazia o fundo desaparecer quando o operador arrastava até ali de propósito.
 *
 * O que **não** mudou é o outro lado: o mesmo amplificador levantaria um resíduo
 * de 0,4%, então o fim do curso do fader tem que continuar sendo zero de
 * verdade. Como a UI só produz inteiros, esta função hoje protege sobretudo o
 * que vem de fora — um JSON importado com 0,5 gravado dentro.
 *
 * Abaixo de 1% também não há o que tocar no canal do YouTube: `setVolume` da
 * IFrame API trabalha em inteiros de 0 a 100 (ver `toYouTubeVolume`), então 1 é
 * o piso físico da escala, não uma escolha nossa.
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
