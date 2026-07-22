/**
 * Formatação para a tela do operador.
 *
 * Tudo em pt-BR e tudo pensado para leitura **de relance**: o operador olha a
 * tela por meio segundo entre uma coisa e outra, no escuro do culto.
 */

/**
 * `254` → `"4:14"`; `10800` → `"3:00:00"`.
 *
 * A hora só aparece quando existe. É por causa da biblioteca de fundos, que é
 * feita de coletâneas de 1 a 3 horas (RF-03.1): sem isso, três horas viravam
 * `180:00`, um número que o operador tem que **converter de cabeça** para saber
 * se aquilo dá para o culto inteiro.
 *
 * E só quando existe porque o caso comum é uma música de quatro minutos, no
 * cronômetro grande da topbar — `0:03:47` ali seria dois caracteres a mais para
 * ler de relance, no escuro, sem informação nenhuma a mais.
 *
 * Negativo e quebrado viram `0:00` em vez de `NaN:NaN`.
 */
export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return '0:00'
  const safe = Math.max(0, Math.round(seconds))

  const horas = Math.floor(safe / 3600)
  const minutos = Math.floor((safe % 3600) / 60)
  const segundos = String(safe % 60).padStart(2, '0')

  if (horas === 0) return `${minutos}:${segundos}`
  return `${horas}:${String(minutos).padStart(2, '0')}:${segundos}`
}

/** O mesmo, mas devolve `--:--` quando não se sabe a duração. */
export function formatDuration(seconds: number | undefined): string {
  return seconds && seconds > 0 ? formatTime(seconds) : '--:--'
}

/**
 * A hora do relógio de parede — o "AGORA" da topbar.
 *
 * Os segundos são opcionais porque só fazem sentido onde o número **anda**: no
 * histórico ("tocou às 19:42") eles seriam ruído, e num relógio parado seriam
 * mentira, marcando para sempre o instante em que a tela foi desenhada.
 */
export function formatClock(
  date: Date = new Date(),
  options: { seconds?: boolean } = {},
): string {
  return date.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    ...(options.seconds ? { second: '2-digit' } : {}),
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
