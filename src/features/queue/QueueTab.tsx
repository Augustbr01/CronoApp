import { FolderOpen, Plus } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import { QueueCard } from './QueueCard'
import { useCrono, useEngine } from '../mixer/context'
import { fetchVideoInfo } from '../../youtube/oembed'
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
 * toca.
 *
 * O título e a duração chegam **depois** do item, pelo oEmbed (RF-01.2): quem
 * cola um link não espera a rede para ver a linha aparecer. Junto com eles vem
 * o aviso de embed bloqueado (RF-01.3), que é o que transforma um erro 101 no
 * domingo num alerta no sábado.
 *
 * A segunda porta de entrada é o **arquivo do PC** (RF-11.1), e ela não passa
 * por nada disso: sem link para reconhecer, sem rede para esperar, sem embed
 * para bloquear. O título já vem pronto no nome do arquivo, e a duração o
 * próprio `<audio>` anota ao carregar.
 */
export function QueueTab() {
  const engine = useEngine()
  const queue = useCrono((state) => state.queue)
  const currentId = useCrono((state) => state.currentId)
  const mode = useCrono((state) => state.mode)
  const addToQueue = useCrono((state) => state.addToQueue)
  const describeQueueItem = useCrono((state) => state.describeQueueItem)
  const renameQueueItem = useCrono((state) => state.renameQueueItem)
  const reorderQueue = useCrono((state) => state.reorderQueue)

  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [erro, setErro] = useState('')
  const [dragged, setDragged] = useState<number | null>(null)
  const arquivoRef = useRef<HTMLInputElement>(null)

  // Desmontar no meio de uma consulta — o operador trocando de aba logo depois
  // de colar — cancela o que estiver no ar, em vez de escrever no store de um
  // componente que já saiu (RNF-04.2).
  const emVoo = useRef<AbortController[]>([])
  useEffect(
    () => () => {
      for (const controller of emVoo.current) controller.abort()
      emVoo.current = []
    },
    [],
  )

  const submit = (event: FormEvent): void => {
    event.preventDefault()
    const videoId = parseVideoId(url)
    if (!videoId) {
      setErro(
        'Não reconheci esse link. Cole o endereço de um vídeo do YouTube (ou busque na aba ao lado).',
      )
      return
    }

    // O item entra na hora, com o rótulo genérico. Esperar a rede aqui faria o
    // operador olhar para um formulário parado achando que o clique não pegou.
    const id = addToQueue({
      kind: 'youtube',
      name: name.trim(),
      videoId,
      title: 'Vídeo do YouTube',
    })
    setName('')
    setUrl('')
    setErro('')

    const controller = new AbortController()
    emVoo.current.push(controller)
    void fetchVideoInfo({ videoId, signal: controller.signal }).then((info) => {
      emVoo.current = emVoo.current.filter((atual) => atual !== controller)
      // `null` é o caso normal de "não deu": sem endpoint, sem rede, vídeo
      // removido. O item fica com o rótulo genérico e o culto segue.
      if (!info) return
      describeQueueItem(id, {
        title: info.title,
        durationSec: info.durationSec,
        thumbnailUrl: info.thumbnailUrl,
        embedBlocked: !info.embeddable,
      })
    })
  }

  /**
   * Os arquivos escolhidos no seletor do sistema (RF-11.1).
   *
   * O `name` digitado vale para todos eles — quem escolhe três arquivos de uma
   * vez está montando a participação de uma pessoa só. A gravação é assíncrona e
   * quem a acompanha é o motor: erro de espaço aparece no aviso do player, do
   * mesmo jeito que uma falha de reprodução (RNF-03.3).
   */
  const escolherArquivos = (event: ChangeEvent<HTMLInputElement>): void => {
    const arquivos = Array.from(event.target.files ?? [])
    // Zera o campo para que escolher **o mesmo** arquivo de novo volte a
    // disparar o evento — sem isto, a segunda tentativa não faria nada.
    event.target.value = ''
    if (arquivos.length === 0) return
    void engine.importQueueFiles(arquivos, name.trim())
    setName('')
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

      <div className="import-row">
        <button
          className="pill-outline"
          type="button"
          onClick={() => arquivoRef.current?.click()}
          aria-describedby="import-fila-dica"
        >
          <FolderOpen size={14} />
          Importar do PC
        </button>
        {/* O `<input type="file">` do navegador não se estiliza; o padrão do
            projeto (o mesmo do backup) é escondê-lo e acioná-lo pelo botão. */}
        <input
          ref={arquivoRef}
          type="file"
          accept="audio/*"
          multiple
          hidden
          aria-hidden="true"
          tabIndex={-1}
          onChange={escolherArquivos}
        />
        <small id="import-fila-dica">
          Qualquer áudio do computador. Toca com fade e crossfade, igual a um
          vídeo.
        </small>
      </div>
    </section>
  )
}
