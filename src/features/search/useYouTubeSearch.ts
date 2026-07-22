import { useCallback, useEffect, useRef, useState } from 'react'
import { SearchError, searchYouTube } from '../../youtube/search'
import type { SearchDuration, SearchResult } from '../../youtube/search'

/**
 * A busca do YouTube na tela — **um hook só, parametrizado** (RNF-01.3).
 *
 * A aba Buscar e a aba Fundos usam este mesmo hook; a única diferença entre
 * elas é o `duration: 'long'` que a segunda passa. No protótipo eram dois
 * blocos de estado idênticos com nomes diferentes (`searchYouTube` e
 * `searchBgYouTube`), e é exatamente esse tipo de duplicação que o RNF-01.3
 * proíbe.
 *
 * Uma busca em andamento é **cancelada** quando outra começa: sem isso, a
 * resposta lenta da primeira chegaria depois e sobrescreveria a lista da
 * segunda — o operador veria o resultado da busca errada.
 */

export interface UseYouTubeSearch {
  query: string
  setQuery: (value: string) => void
  results: SearchResult[]
  loading: boolean
  /** Mensagem em pt-BR, pronta para a tela (RF-02.4). */
  error: string
  /** Busca o termo informado, ou o que estiver no campo. */
  run: (term?: string) => void
}

export function useYouTubeSearch(duration?: SearchDuration): UseYouTubeSearch {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const inFlight = useRef<AbortController | null>(null)

  // Sair da tela no meio de uma busca não pode deixar a requisição pendurada
  // nem tentar mexer em estado de um componente que já foi (RNF-04.2).
  useEffect(() => () => inFlight.current?.abort(), [])

  const run = useCallback(
    (term?: string) => {
      const termo = (term ?? query).trim()
      if (term !== undefined) setQuery(term)
      if (!termo) return

      inFlight.current?.abort()
      const controller = new AbortController()
      inFlight.current = controller

      setLoading(true)
      setError('')

      searchYouTube({ query: termo, duration, signal: controller.signal })
        .then((items) => {
          if (controller.signal.aborted) return
          setResults(items)
          setLoading(false)
        })
        .catch((failure: unknown) => {
          if (controller.signal.aborted) return
          setResults([])
          setError(
            failure instanceof SearchError
              ? failure.message
              : 'Não foi possível buscar no YouTube.',
          )
          setLoading(false)
        })
    },
    [duration, query],
  )

  return { query, setQuery, results, loading, error, run }
}
