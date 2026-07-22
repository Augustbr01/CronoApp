import type { FrameScheduler } from '../audio/scheduler'

/**
 * Relógio de mentira para os testes do motor.
 *
 * No app, os quadros vêm do navegador a ~60 por segundo e o teste teria que
 * **esperar tempo real** — 2 segundos de fade seriam 2 segundos de suíte, e o
 * resultado dependeria da carga da máquina. Aqui o teste manda no tempo:
 * `advance(2000)` simula dois segundos de quadros na hora, sempre igual.
 */
const FRAME_MS = 1000 / 60

export interface FakeScheduler extends FrameScheduler {
  /** Simula `ms` de quadros, chamando quem estiver agendado a cada um. */
  advance(ms: number): void
  /** Quantos quadros estão agendados — 0 significa que o laço dormiu. */
  pending(): number
}

export function createFakeScheduler(startAt = 0): FakeScheduler {
  let current = startAt
  let nextHandle = 1
  const scheduled = new Map<number, (now: number) => void>()

  return {
    now: () => current,

    request(callback) {
      const handle = nextHandle++
      scheduled.set(handle, callback)
      return handle
    },

    cancel(handle) {
      scheduled.delete(handle)
    },

    advance(ms) {
      const target = current + ms
      while (current < target) {
        current = Math.min(current + FRAME_MS, target)
        // Copiar e limpar antes de chamar: o callback normalmente agenda o
        // próximo quadro, e ele não pode rodar dentro deste mesmo passo.
        const due = [...scheduled.values()]
        scheduled.clear()
        for (const callback of due) callback(current)
      }
    },

    pending: () => scheduled.size,
  }
}
