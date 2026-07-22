/**
 * O relógio do motor — e o **único** arquivo de `audio/` que encosta no
 * navegador.
 *
 * O motor precisa de um pulso: alguém tem que chamá-lo ~60 vezes por segundo
 * para as rampas de volume andarem. No app isso é o `requestAnimationFrame`.
 * Mas o CLAUDE.md exige que o motor seja testável **sem DOM** (RNF-01.1), e um
 * teste que espera tempo real é um teste lento e instável.
 *
 * A saída é o motor depender desta *interface*, não do navegador. Em produção
 * entra o `requestAnimationFrame`; nos testes entra um relógio de mentira em que
 * o teste avança o tempo na mão. Todo o resto de `audio/` continua sendo
 * matemática pura.
 */
export interface FrameScheduler {
  /** O instante atual, em ms. */
  now(): number
  /** Agenda um quadro; devolve um identificador para poder cancelar. */
  request(callback: (now: number) => void): number
  /** Cancela um quadro agendado (RNF-04.2 — nada de timer órfão). */
  cancel(handle: number): void
}

/** O relógio de verdade: quadros do navegador. */
export function createRafScheduler(): FrameScheduler {
  return {
    now: () => performance.now(),
    request: (callback) => requestAnimationFrame(callback),
    cancel: (handle) => {
      cancelAnimationFrame(handle)
    },
  }
}
