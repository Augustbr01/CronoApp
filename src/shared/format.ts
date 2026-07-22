/**
 * Formatação para a tela do operador.
 *
 * Tudo em pt-BR e tudo pensado para leitura **de relance**: o operador olha a
 * tela por meio segundo entre uma coisa e outra, no escuro do culto.
 */

/** `254` → `"4:14"`. Negativo e quebrado viram `0:00` em vez de `NaN:NaN`. */
export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return '0:00'
  const safe = Math.max(0, Math.round(seconds))
  const minutos = Math.floor(safe / 60)
  const segundos = String(safe % 60).padStart(2, '0')
  return `${minutos}:${segundos}`
}

/** O mesmo, mas devolve `--:--` quando não se sabe a duração. */
export function formatDuration(seconds: number | undefined): string {
  return seconds && seconds > 0 ? formatTime(seconds) : '--:--'
}

/** A hora do relógio de parede — o "AGORA" da topbar. */
export function formatClock(date: Date = new Date()): string {
  return date.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** Só a hora de uma entrada do histórico (`19:42`). */
export function formatTimeOfDay(timestamp: number): string {
  return formatClock(new Date(timestamp))
}

/**
 * Milissegundos (como o motor pensa) → segundos com uma casa (como o modal
 * mostra). O operador ajusta fade em segundos; guardamos em ms.
 */
export function msToSeconds(ms: number): number {
  return Math.round(ms / 100) / 10
}

/** O caminho de volta: os segundos do controle deslizante viram ms. */
export function secondsToMs(seconds: number): number {
  return Math.round(seconds * 1000)
}

/** `2.5` → `"2,5s"` — vírgula decimal, como se escreve em português. */
export function formatSeconds(seconds: number): string {
  return `${seconds.toFixed(1).replace('.', ',')}s`
}
