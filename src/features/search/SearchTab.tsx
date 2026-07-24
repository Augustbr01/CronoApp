import { Search } from 'lucide-react'
import type { FormEvent } from 'react'
import { useState } from 'react'
import { useYouTubeSearch } from './useYouTubeSearch'
import { ResultList } from '../../shared/ResultList'
import { useCrono } from '../mixer/context'

/**
 * A aba Buscar música (RF-02).
 *
 * O nome digitado aqui é quem vai cantar; vazio vira "Convidado" (RF-02.3). Ao
 * adicionar, o painel pula para a aba Fila — o operador acabou de decidir quem
 * canta e o próximo passo dele é tocar.
 */

interface SearchTabProps {
  onAdded: () => void
}

export function SearchTab({ onAdded }: SearchTabProps) {
  const addToQueue = useCrono((state) => state.addToQueue)
  const [singer, setSinger] = useState('')
  const busca = useYouTubeSearch()
  const [searched, setSearched] = useState(false)

  const submit = (event: FormEvent): void => {
    event.preventDefault()
    if (!busca.query.trim()) return
    setSearched(true)
    busca.run()
  }

  return (
    <section className="tab-content">
      <form className="search-row" onSubmit={submit}>
        <span className="search-field">
          <Search size={15} />
          <input
            value={busca.query}
            onChange={(event) => busca.setQuery(event.target.value)}
            placeholder="Ex.: Porque Ele Vive playback"
            aria-label="Buscar música"
          />
        </span>
        <button className="pill-btn" type="submit" disabled={busca.loading}>
          {busca.loading ? 'Buscando…' : 'Buscar'}
        </button>
      </form>

      <div className="add-form">
        <input
          value={singer}
          onChange={(event) => setSinger(event.target.value)}
          placeholder="Quem vai cantar? (opcional)"
          aria-label="Nome de quem vai cantar"
        />
      </div>

      <ResultList
        results={busca.results}
        loading={busca.loading}
        error={busca.error}
        searched={searched}
        actionLabel="+ Fila"
        emptyHint="Digite o nome de uma música e busque"
        onAdd={(result) => {
          addToQueue({
            kind: 'youtube',
            name: singer.trim(),
            videoId: result.videoId,
            title: result.title,
            durationSec: result.durationSec || undefined,
            thumbnailUrl: result.thumbnailUrl,
          })
          setSinger('')
          onAdded()
        }}
      />
    </section>
  )
}
