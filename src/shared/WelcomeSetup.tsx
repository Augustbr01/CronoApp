import { AudioLines } from 'lucide-react'
import { useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { useFocusTrap } from './hooks'
import { useCrono } from '../features/mixer/context'
import { MAX_CHURCH_NAME } from '../store/types'

/**
 * A tela do primeiro arranque.
 *
 * Aparece uma vez, quando ainda não há nome de igreja guardado, e serve para
 * uma coisa só: dar identidade ao painel. Um app de som instalado em várias
 * igrejas fica igual em todas — e quem opera em mais de um lugar, ou tem dois
 * notebooks, precisa saber de relance em qual está.
 *
 * **É pular-vel de propósito.** Nome de igreja não é dado de operação: nada no
 * app depende dele para tocar. Transformar isto em portão antes de um culto
 * seria criar um problema onde não havia — o operador que abriu o painel dez
 * minutos antes do início quer a fila, não um formulário. Quem pular pode pôr
 * o nome depois, nas Configurações.
 *
 * Só é montada **depois da hidratação** (ver `useHydrated`): o estado em
 * memória antes disso é o padrão de fábrica, e desenhar a partir dele faria esta
 * tela piscar na cara de quem já configurou.
 */

export function WelcomeSetup() {
  const dialogRef = useRef<HTMLElement>(null)
  const completeSetup = useCrono((state) => state.completeSetup)
  const [nome, setNome] = useState('')

  useFocusTrap(dialogRef, true)

  const salvar = (event: FormEvent): void => {
    event.preventDefault()
    // Vazio é o mesmo que pular: o formulário não cobra o que não é obrigatório.
    completeSetup(nome)
  }

  return (
    <div className="welcome-overlay">
      <section
        className="welcome"
        role="dialog"
        aria-modal="true"
        aria-labelledby="welcome-title"
        tabIndex={-1}
        ref={dialogRef}
      >
        <span className="welcome-badge">
          <AudioLines size={26} />
        </span>

        <h1 id="welcome-title">Bem-vindo ao CronoApp</h1>
        <p>
          O painel de som do culto. Antes de começar, dê um nome a este painel —
          ele aparece aqui em cima e diz de quem é a instalação.
        </p>

        <form onSubmit={salvar}>
          <label htmlFor="welcome-church">Nome da igreja</label>
          <input
            id="welcome-church"
            value={nome}
            onChange={(event) => setNome(event.target.value)}
            placeholder="Ex.: Igreja Batista Central"
            maxLength={MAX_CHURCH_NAME}
            autoComplete="organization"
            autoFocus
          />
          <small>
            Fica salvo neste dispositivo e pode ser mudado depois, nas
            configurações.
          </small>

          <div className="welcome-actions">
            <button
              type="button"
              className="ghost-btn"
              onClick={() => completeSetup('')}
            >
              Agora não
            </button>
            <button type="submit" className="pill-btn">
              Começar
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}
