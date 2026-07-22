/**
 * Tradução dos erros do YouTube para o operador.
 *
 * A API entrega um número seco (2, 5, 100, 101, 150). No meio do culto, "erro
 * 150" não ajuda ninguém: o operador precisa saber, em um segundo, se **troca
 * de vídeo** ou se **tenta de novo**. É o que este módulo responde (RNF-03.3 —
 * erro do player é visível, nunca engolido com `.catch(() => {})`).
 */

/** Códigos de erro documentados da IFrame API. */
export const PLAYER_ERROR = {
  /** Parâmetro inválido — normalmente um ID de vídeo malformado. */
  INVALID_PARAMETER: 2,
  /** O player HTML5 falhou ao reproduzir o conteúdo. */
  HTML5: 5,
  /** Vídeo inexistente, removido ou privado. */
  NOT_FOUND: 100,
  /** O dono bloqueou a reprodução fora do YouTube. */
  EMBED_BLOCKED: 101,
  /** Mesmo caso do 101 — o YouTube usa os dois códigos. */
  EMBED_BLOCKED_ALIAS: 150,
  /**
   * **Nosso**, não do YouTube (por isso negativo, sem risco de colidir com um
   * código novo deles): o operador deu play e o som não começou no prazo. O
   * YouTube não reclama nesse caso — ele fica bufferizando calado, e é
   * exatamente esse silêncio que o operador não pode levar ao vivo.
   */
  PLAYBACK_TIMEOUT: -1,
  /** Nosso também: o player não ficou pronto para receber comandos. */
  PLAYER_NOT_READY: -2,
} as const

/** Um erro do player já mastigado para a tela. */
export interface PlayerErrorInfo {
  /** O código cru, para log e para o operador citar num suporte. */
  code: number
  /** Mensagem curta e acionável, em português, para o operador. */
  message: string
  /**
   * `true` quando este vídeo **nunca** vai tocar (bloqueado, removido, link
   * inválido): a saída é trocar de vídeo, não insistir. `false` quando uma nova
   * tentativa tem chance real de funcionar.
   */
  fatal: boolean
}

/**
 * Traduz um código de erro do player. Códigos desconhecidos caem no caso
 * genérico não-fatal — melhor deixar o operador tentar de novo do que declarar
 * perdido um vídeo por causa de um código que não previmos.
 */
export function describePlayerError(code: number): PlayerErrorInfo {
  switch (code) {
    case PLAYER_ERROR.INVALID_PARAMETER:
      return {
        code,
        message:
          'Link do vídeo inválido. Confira o endereço ou busque de novo.',
        fatal: true,
      }
    case PLAYER_ERROR.HTML5:
      return {
        code,
        message:
          'O player do YouTube falhou ao abrir este vídeo. Tente de novo.',
        fatal: false,
      }
    case PLAYER_ERROR.NOT_FOUND:
      return {
        code,
        message:
          'Vídeo não encontrado — pode ter sido removido ou está privado.',
        fatal: true,
      }
    case PLAYER_ERROR.PLAYBACK_TIMEOUT:
      return {
        code,
        message:
          'O vídeo não começou a tocar. Verifique a conexão ou troque o vídeo.',
        fatal: false,
      }
    case PLAYER_ERROR.PLAYER_NOT_READY:
      return {
        code,
        message:
          'O player do YouTube não respondeu. Tente de novo ou recarregue a página.',
        fatal: false,
      }
    case PLAYER_ERROR.EMBED_BLOCKED:
    case PLAYER_ERROR.EMBED_BLOCKED_ALIAS:
      return {
        code,
        message:
          'O dono deste vídeo não permite reprodução fora do YouTube. Escolha outra versão da música.',
        fatal: true,
      }
    default:
      return {
        code,
        message: `Erro ${code} do player do YouTube. Tente de novo ou troque o vídeo.`,
        fatal: false,
      }
  }
}
