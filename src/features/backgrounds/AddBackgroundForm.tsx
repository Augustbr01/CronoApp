import { Plus } from 'lucide-react'
import { useState } from 'react'
import type { FormEvent } from 'react'
import { parseVideoId } from '../../youtube/video-id'
import { useEngine } from '../mixer/context'

/**
 * Cadastrar fundo colando o link, sem passar pela busca.
 *
 * **Isto não existia no protótipo** — lá, a única porta de entrada da biblioteca
 * de fundos era a busca do YouTube. Duas razões para existir aqui:
 *
 * 1. **Prática:** o servidor de busca é a Etapa 5. Sem este campo, a aba Fundos
 *    fica inutilizável até lá, e com ela metade da Etapa 4 — crossfade, retorno
 *    automático, decks, teclas `B` e `M` — não dá para experimentar.
 * 2. **De produto:** quem já tem a coletânea de 3 horas favorita não deveria ter
 *    que caçá-la numa busca. A aba Fila sempre aceitou link colado; a de Fundos
 *    passar a aceitar é coerência, não novidade.
 *
 * O nome é do operador porque não temos de onde tirar o título do vídeo: isso
 * chega na Etapa 5, com o oEmbed (RF-01.2).
 */
export function AddBackgroundForm() {
  const engine = useEngine()
  const [title, setTitle] = useState('')
  const [url, setUrl] = useState('')
  const [erro, setErro] = useState('')

  const submit = (event: FormEvent): void => {
    event.preventDefault()
    const videoId = parseVideoId(url)
    if (!videoId) {
      setErro(
        'Não reconheci esse link. Cole o endereço de um vídeo do YouTube.',
      )
      return
    }

    engine.addBackground({ videoId, title: title.trim() || 'Fundo musical' })
    setTitle('')
    setUrl('')
    setErro('')
  }

  return (
    <>
      <h2 className="section-title">
        Adicionar fundo por link
        <i />
      </h2>
      <form className="add-form" onSubmit={submit}>
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Nome do fundo"
          aria-label="Nome do fundo"
        />
        <input
          value={url}
          onChange={(event) => {
            setUrl(event.target.value)
            if (erro) setErro('')
          }}
          placeholder="Cole o link do YouTube"
          aria-label="Link do fundo no YouTube"
        />
        <button className="pill-btn" type="submit">
          <Plus size={15} />
          Adicionar
        </button>
      </form>
      {erro && (
        <p className="player-error" role="alert">
          {erro}
        </p>
      )}
    </>
  )
}
