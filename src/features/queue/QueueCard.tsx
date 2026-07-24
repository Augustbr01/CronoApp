import { Pencil, Play, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { formatDuration } from '../../shared/format'
import type { QueueItem } from '../../store/types'

/**
 * Uma pessoa na fila (RF-01).
 *
 * O card carrega quatro requisitos de uma vez: tocar **este** item a qualquer
 * momento (RF-01.7), renomear no lugar com Enter/Escape (RF-01.5), remover
 * (RF-01.6) e arrastar para reordenar (RF-01.4).
 *
 * O arraste é desligado enquanto o nome está sendo editado — senão selecionar
 * texto dentro do campo vira arraste do card, e o operador reordena a fila sem
 * querer no meio do culto.
 */

interface QueueCardProps {
  item: QueueItem
  index: number
  /** Este é o que está no ar agora. */
  active: boolean
  onPlay: () => void
  onRemove: () => void
  onRename: (name: string) => void
  onDragStart: () => void
  onDrop: () => void
}

export function QueueCard({
  item,
  index,
  active,
  onPlay,
  onRemove,
  onRename,
  onDragStart,
  onDrop,
}: QueueCardProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(item.name)

  // O rascunho nasce no momento em que a edição começa — e não num efeito que
  // persegue o nome do item. Assim não existe instante em que o campo mostra um
  // nome e o card mostra outro.
  const startEditing = (): void => {
    setDraft(item.name)
    setEditing(true)
  }

  const commit = (): void => {
    const trimmed = draft.trim()
    if (trimmed && trimmed !== item.name) onRename(trimmed)
    setEditing(false)
  }

  return (
    <article
      className={`queue-card ${active ? 'playing' : ''}`}
      title="Arraste pra reordenar"
      draggable={!editing}
      onDragStart={onDragStart}
      onDragOver={(event) => event.preventDefault()}
      onDrop={onDrop}
    >
      <span className="queue-number">{String(index + 1).padStart(2, '0')}</span>
      <div className="queue-info">
        {editing ? (
          <input
            className="queue-name-input"
            value={draft}
            autoFocus
            onChange={(event) => setDraft(event.target.value)}
            onBlur={commit}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                commit()
              }
              if (event.key === 'Escape') {
                setDraft(item.name)
                setEditing(false)
              }
            }}
            aria-label={`Renomear ${item.name}`}
          />
        ) : (
          <div className="queue-name-row">
            <b>{item.name}</b>
            {active && <em>NO AR</em>}
            {item.kind === 'youtube' && item.embedBlocked && (
              <em
                className="blocked"
                title="Este vídeo não toca fora do YouTube"
              >
                BLOQUEADO
              </em>
            )}
          </div>
        )}
        <span>{item.title}</span>
      </div>
      <small>{formatDuration(item.durationSec)}</small>
      {/* Numa fila de dez pessoas, dez botões chamados "Tocar" não dizem nada
          a quem ouve a tela; o nome entra no rótulo acessível. */}
      <button
        className="pill-btn"
        type="button"
        onClick={onPlay}
        disabled={active}
        aria-label={`Tocar ${item.name}`}
      >
        <Play size={11} />
        Tocar
      </button>
      <button
        className="ghost-icon"
        type="button"
        onClick={startEditing}
        aria-label={`Editar nome de quem vai cantar (${item.name})`}
        title="Alterar nome"
      >
        <Pencil size={14} />
      </button>
      <button
        className="ghost-icon danger"
        type="button"
        onClick={onRemove}
        aria-label={`Remover ${item.name}`}
        title="Remover"
      >
        <Trash2 size={14} />
      </button>
    </article>
  )
}
