import { Plus } from 'lucide-react'
import { useState } from 'react'
import type { FormEvent } from 'react'
import { QueueCard } from './QueueCard'
import { useCrono, useEngine } from '../mixer/context'
import { parseVideoId } from '../../youtube/video-id'

/**
 * A aba Fila — o pool de quem vai cantar (RF-01).
 *
 * "Pool", e não sequência: qualquer item toca a qualquer momento, porque culto
 * é improviso e a ordem combinada dura até a primeira mudança de planos
 * (RF-01.7).
 *
 * O formulário faz a única validação que importa aqui: o link tem que ser um
 * vídeo do YouTube reconhecível. Recusar na entrada, com a frase na tela, é
 * muito melhor do que aceitar e o operador descobrir no domingo que o item não
 * toca (RF-01.3 completo — detectar embed bloqueado — depende do oEmbed da
 * Etapa 5).
 */
export function QueueTab() {
  const engine = useEngine()
  const queue = useCrono((state) => state.queue)
  const currentId = useCrono((state) => state.currentId)
  const mode = useCrono((state) => state.mode)
  const addToQueue = useCrono((state) => state.addToQueue)
  const renameQueueItem = useCrono((state) => state.renameQueueItem)
  const reorderQueue = useCrono((state) => state.reorderQueue)

  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [erro, setErro] = useState('')
  const [dragged, setDragged] = useState<number | null>(null)

  const submit = (event: FormEvent): void => {
    event.preventDefault()
    const videoId = parseVideoId(url)
    if (!videoId) {
      setErro(
        'Não reconheci esse link. Cole o endereço de um vídeo do YouTube (ou busque na aba ao lado).',
      )
      return
    }

    addToQueue({
      name: name.trim(),
      videoId,
      title: 'Vídeo do YouTube',
    })
    setName('')
    setUrl('')
    setErro('')
  }

  return (
    <section className="tab-content">
      <div className="queue-list">
        {queue.map((item, index) => (
          <QueueCard
            key={item.id}
            item={item}
            index={index}
            active={item.id === currentId && mode === 'main'}
            onPlay={() => engine.playQueueItem(item.id)}
            onRemove={() => engine.removeFromQueue(item.id)}
            onRename={(novo) => renameQueueItem(item.id, novo)}
            onDragStart={() => setDragged(index)}
            onDrop={() => {
              if (dragged !== null) reorderQueue(dragged, index)
              setDragged(null)
            }}
          />
        ))}
        {queue.length === 0 && (
          <div className="empty-state">Nenhuma música aguardando</div>
        )}
      </div>

      <h2 className="section-title">
        Adicionar à fila
        <i />
      </h2>
      <form className="add-form" onSubmit={submit}>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Quem vai cantar?"
          aria-label="Nome da pessoa"
        />
        <input
          value={url}
          onChange={(event) => {
            setUrl(event.target.value)
            if (erro) setErro('')
          }}
          placeholder="Cole o link do YouTube"
          aria-label="Link do YouTube"
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
    </section>
  )
}
