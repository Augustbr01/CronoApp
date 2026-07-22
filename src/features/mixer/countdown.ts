/**
 * A regra da reta final do cronômetro.
 *
 * Vive fora do `Topbar.tsx` por causa do Fast Refresh do Vite, que só funciona
 * quando um módulo exporta **ou** componentes **ou** outras coisas — a mesma
 * razão que separou o `context.ts` do provedor.
 */

/**
 * A partir de quantos segundos restantes o cronômetro começa a piscar.
 *
 * Dez é o tempo de encostar a mão no fader e decidir: deixar acabar, cortar
 * antes, ou já engatilhar a próxima. Menos que isso o aviso chega tarde; muito
 * mais e ele vira poluição piscando durante o culto inteiro.
 */
export const AVISO_FIM_SEGUNDOS = 10

/**
 * O cronômetro está na reta final?
 *
 * `null` — duração desconhecida, ou o relógio de parede do standby — nunca
 * pisca: avisar do fim de uma música cuja duração ninguém sabe seria inventar
 * urgência a partir de ignorância.
 */
export function estaAcabando(restanteSec: number | null): boolean {
  if (restanteSec === null) return false
  return restanteSec >= 0 && restanteSec <= AVISO_FIM_SEGUNDOS
}
