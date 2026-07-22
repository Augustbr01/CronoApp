import { Play, WandSparkles } from 'lucide-react'
import { formatDuration } from './format'
import type { SearchResult } from '../youtube/search'

/**
 * A lista de resultados do YouTube, compartilhada pelas abas Buscar e Fundos.
 *
 * As duas mostram a mesma coisa — miniatura, título, canal e duração — e mudam
 * só no rótulo do botão ("+ Fila" ou "+ Fundos"). Ter um componente só é o lado
 * visual do RNF-01.3.
 *
 * O estado vazio distingue três situações que pedem reações diferentes: ainda
 * não buscou, buscou e não achou, e a busca falhou.
 */

interface ResultListProps {
  results: SearchResult[]
  loading: boolean
  error: string
  /** `false` antes da primeira busca. */
  searched: boolean
  actionLabel: string
  onAdd: (result: SearchResult) => void
  emptyHint: string
}

export function ResultList({
  results,
  loading,
  error,
  searched,
  actionLabel,
  onAdd,
  emptyHint,
}: ResultListProps) {
  if (results.length === 0) {
    return (
      <div className="result-list">
        <div className="empty-state">
          <span role={error ? 'alert' : undefined}>
            <WandSparkles size={17} />
            {error
              ? error
              : loading
                ? 'Buscando…'
                : searched
                  ? 'Nenhum resultado para esse termo.'
                  : emptyHint}
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className="result-list">
      {results.map((result) => (
        <article className="result" key={result.videoId}>
          <div className="thumbnail">
            {result.thumbnailUrl ? (
              <img src={result.thumbnailUrl} alt="" />
            ) : (
              <Play size={13} />
            )}
          </div>
          <div>
            <b>{result.title}</b>
            <span>
              {result.channelTitle} · {formatDuration(result.durationSec)}
            </span>
          </div>
          <button
            type="button"
            className="pill-outline"
            onClick={() => onAdd(result)}
          >
            {actionLabel}
          </button>
        </article>
      ))}
    </div>
  )
}
