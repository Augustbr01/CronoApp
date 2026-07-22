/**
 * Duração ISO 8601 → segundos.
 *
 * A Data API devolve `contentDetails.duration` no formato `PT4M13S`, e a tela
 * precisa de um número para mostrar `4:13` e calcular a barra de progresso.
 *
 * O `D` de dias está aqui de propósito: a biblioteca de fundos é feita de
 * coletâneas longas (RF-03.1), e as de 10 h ou mais vêm como `PT10H`, mas
 * transmissões e compilações extremas chegam a `P1DT2H`. Ignorar o dia, como
 * fazia o protótipo, transformaria 26 horas em 2.
 */

/**
 * Âncoras nas duas pontas de propósito: sem elas, qualquer lixo que **contenha**
 * um trecho parecido seria aceito e viraria um número inventado. Aqui o que não
 * for uma duração inteira cai no zero — que é como o resto do app já trata
 * "não sei a duração".
 */
const ISO_8601 = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/

export function durationToSeconds(value: string | undefined): number {
  if (!value) return 0

  const partes = ISO_8601.exec(value)
  if (!partes) return 0

  const [, dias, horas, minutos, segundos] = partes
  return (
    Number(dias ?? 0) * 86_400 +
    Number(horas ?? 0) * 3_600 +
    Number(minutos ?? 0) * 60 +
    Number(segundos ?? 0)
  )
}
