/**
 * Identificadores dos itens de domínio.
 *
 * A fila é um pool onde o operador toca qualquer item a qualquer momento
 * (RF-01.7), então cada item precisa de identidade própria — não dá para
 * identificar pela posição, que muda ao arrastar, nem pelo vídeo, que pode
 * repetir (duas pessoas cantando a mesma música no mesmo culto acontece).
 */

let fallbackCounter = 0

/** Um id único. Usa o gerador do navegador quando existe. */
export function createId(prefix: string): string {
  const uuid = globalThis.crypto?.randomUUID?.()
  if (uuid) return `${prefix}_${uuid}`
  fallbackCounter += 1
  return `${prefix}_${Date.now().toString(36)}_${fallbackCounter}`
}
