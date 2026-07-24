import type { PlayerErrorInfo } from '../youtube/errors'

/**
 * Tradução dos erros do áudio local para o operador.
 *
 * O que `youtube/errors.ts` faz pelo streaming, este módulo faz pelo arquivo do
 * PC. Lá a IFrame API entrega um número (2, 100, 150); aqui o `<audio>` entrega
 * um `MediaError` com um `code` de 1 a 4. Em ambos os casos o operador precisa
 * saber, em um segundo, se **troca de arquivo** ou se **tenta de novo** — nunca
 * um erro seco, nunca silêncio engolido (RNF-03.3).
 *
 * Reusa o `PlayerErrorInfo` de `youtube/` de propósito: é o mesmo formato que a
 * tela já sabe mostrar, e o operador não deveria precisar saber se o som que
 * falhou vinha do YouTube ou do disco.
 */

/**
 * Códigos de erro do áudio local. 1–4 são os do `MediaError` do navegador; os
 * negativos são **nossos** — negativos para nunca colidirem com um código que o
 * `MediaError` venha a ganhar, o mesmo truque de `youtube/errors.ts`.
 */
export const LOCAL_ERROR = {
  /** `MediaError.MEDIA_ERR_ABORTED` — a reprodução foi interrompida no meio. */
  ABORTED: 1,
  /** `MediaError.MEDIA_ERR_NETWORK` — falha ao ler os bytes do arquivo. */
  NETWORK: 2,
  /** `MediaError.MEDIA_ERR_DECODE` — arquivo corrompido ou gravado pela metade. */
  DECODE: 3,
  /** `MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED` — codec/formato que o Chrome não abre. */
  UNSUPPORTED: 4,
  /**
   * **Nosso:** mandaram carregar sem arquivo. O blob referenciado sumiu do cofre
   * e a costura não teve o que virar object URL — o operador reimporta (RF-11.5).
   */
  NO_SOURCE: -1,
  /**
   * **Nosso** também: o navegador recusou a reprodução (política de autoplay ou
   * permissão). É o análogo local do silêncio que o YouTube esconde — só que aqui
   * o navegador **avisa na hora**, rejeitando a promessa do `play()`, e por isso
   * o áudio local dispensa o cronômetro de 5 s do streaming.
   */
  PLAYBACK_BLOCKED: -2,
} as const

/**
 * Traduz um código de erro do áudio local. Como em `describePlayerError`, o que
 * não conhecemos cai no caso genérico **não-fatal** — melhor deixar o operador
 * tentar de novo do que declarar perdido um arquivo por um código imprevisto.
 */
export function describeLocalError(code: number): PlayerErrorInfo {
  switch (code) {
    case LOCAL_ERROR.ABORTED:
      return {
        code,
        message: 'A reprodução do arquivo foi interrompida. Tente de novo.',
        fatal: false,
      }
    case LOCAL_ERROR.NETWORK:
      return {
        code,
        message: 'Falha ao ler o arquivo de áudio. Tente de novo.',
        fatal: false,
      }
    case LOCAL_ERROR.DECODE:
      return {
        code,
        message:
          'Não foi possível decodificar este áudio — o arquivo pode estar corrompido. Reimporte-o.',
        fatal: true,
      }
    case LOCAL_ERROR.UNSUPPORTED:
      return {
        code,
        message:
          'Formato de áudio não suportado pelo navegador. Converta para MP3 e reimporte.',
        fatal: true,
      }
    case LOCAL_ERROR.NO_SOURCE:
      return {
        code,
        message:
          'Arquivo de áudio não encontrado — pode ter sido removido do dispositivo. Reimporte-o.',
        fatal: true,
      }
    case LOCAL_ERROR.PLAYBACK_BLOCKED:
      return {
        code,
        message:
          'O navegador bloqueou a reprodução do áudio. Toque na tela e tente de novo.',
        fatal: false,
      }
    default:
      return {
        code,
        message: `Erro ${code} ao tocar o áudio local. Tente de novo ou reimporte o arquivo.`,
        fatal: false,
      }
  }
}
