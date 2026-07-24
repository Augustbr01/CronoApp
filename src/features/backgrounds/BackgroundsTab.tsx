import { Check, Music2, Radio, Trash2 } from 'lucide-react'
import { Search } from 'lucide-react'
import { useState } from 'react'
import type { FormEvent } from 'react'
import { AddBackgroundForm } from './AddBackgroundForm'
import { ResultList } from '../../shared/ResultList'
import { formatDuration } from '../../shared/format'
import { useYouTubeSearch } from '../search/useYouTubeSearch'
import { useCrono, useEngine } from '../mixer/context'

/**
 * A aba Fundos (RF-03).
 *
 * A mesma busca da aba anterior, com **um** parâmetro a mais: `duration: long`,
 * que só traz vídeo de mais de 20 minutos. É o que faz sentido para a trilha de
 * fundo, montada de coletâneas de 1 a 3 horas (RF-03.1) — resultado de 4
 * minutos aqui só daria trabalho ao operador.
 *
 * Os atalhos de categoria são os quatro do protótipo (RF-03.2): é o que uma
 * igreja realmente põe de fundo, e poupa digitação no meio do culto.
 */

const CATEGORIAS = [
  'Piano worship',
  'Pads · oração',
  'Harpa cristã',
  'Celebração',
]

export function BackgroundsTab() {
  const engine = useEngine()
  const backgrounds = useCrono((state) => state.backgrounds)
  const selectedBackgroundId = useCrono((state) => state.selectedBackgroundId)

  const busca = useYouTubeSearch('long')
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
            placeholder="Ex.: piano instrumental 2 horas"
            aria-label="Buscar fundo musical"
          />
        </span>
        <button className="pill-btn" type="submit" disabled={busca.loading}>
          {busca.loading ? 'Buscando…' : 'Buscar'}
        </button>
      </form>

      <div className="chips">
        {CATEGORIAS.map((label) => (
          <button
            key={label}
            className={`chip ${busca.query === label ? 'active' : ''}`}
            type="button"
            onClick={() => {
              setSearched(true)
              busca.run(label)
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <ResultList
        results={busca.results}
        loading={busca.loading}
        error={busca.error}
        searched={searched}
        actionLabel="+ Fundos"
        emptyHint="Digite o nome de um fundo e busque"
        onAdd={(result) =>
          engine.addBackground({
            kind: 'youtube',
            videoId: result.videoId,
            title: result.title,
            channelTitle: result.channelTitle || undefined,
            durationSec: result.durationSec || undefined,
            thumbnailUrl: result.thumbnailUrl,
          })
        }
      />

      <p className="foot-note">
        Busca com filtro de vídeo longo (ideal pra coletâneas de 1–3 h).
      </p>

      <h2 className="section-title">
        Biblioteca de fundos
        <i />
      </h2>
      <div className="background-list">
        {backgrounds.length ? (
          backgrounds.map((track) => (
            <div
              key={track.id}
              className={`background-row ${track.id === selectedBackgroundId ? 'selected' : ''}`}
            >
              <button
                type="button"
                className="background-pick"
                onClick={() => engine.selectBackground(track.id)}
                aria-pressed={track.id === selectedBackgroundId}
              >
                <Radio size={16} />
                <span>
                  <b>{track.title}</b>
                  <small>
                    {(track.kind === 'youtube'
                      ? track.channelTitle
                      : undefined) ?? 'YouTube'}{' '}
                    · {formatDuration(track.durationSec)}
                  </small>
                </span>
                {track.id === selectedBackgroundId && (
                  <Check className="check" size={16} />
                )}
              </button>
              <button
                className="ghost-icon danger"
                type="button"
                onClick={() => engine.removeBackground(track.id)}
                aria-label={`Remover ${track.title} da biblioteca`}
                title="Remover da biblioteca"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))
        ) : (
          <div className="empty-state">
            <span>
              <Music2 size={17} />
              Biblioteca vazia. Busque acima ou cole um link abaixo para
              adicionar o primeiro fundo musical.
            </span>
          </div>
        )}
      </div>

      <AddBackgroundForm />
    </section>
  )
}
