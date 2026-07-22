import { Pause, Play, SkipForward } from 'lucide-react'
import { useCrono, useEngine } from '../mixer/context'

/**
 * Os decks A/B do fundo musical (RF-03.5).
 *
 * O deck A é a faixa que está (ou fica) no ar; o B é a próxima da biblioteca —
 * a que o "Mix agora" traz. É vocabulário de mesa de som, e o protótipo já
 * usava assim: o operador não pensa "índice 3 do array", ele pensa "o que está
 * tocando e o que vem depois".
 *
 * Os dois botões ficam desativados enquanto o louvor está no ar: mexer no fundo
 * durante o louvor não faz nada audível e só confundiria.
 */
export function DeckPanel() {
  const engine = useEngine()
  const mode = useCrono((state) => state.mode)
  const backgrounds = useCrono((state) => state.backgrounds)
  const selectedBackgroundId = useCrono((state) => state.selectedBackgroundId)

  const index = backgrounds.findIndex(
    (track) => track.id === selectedBackgroundId,
  )
  const atual = index >= 0 ? backgrounds[index] : null
  const proxima =
    backgrounds.length > 1
      ? backgrounds[(index + 1) % backgrounds.length]
      : null

  const noAr = mode === 'background'
  const bloqueado = mode === 'main' || !atual

  return (
    <>
      <h2 className="section-title">
        Fundo musical · decks A/B
        <i />
      </h2>
      <div className="deck active">
        <b>A</b>
        <span>{atual?.title ?? 'Nenhum fundo configurado'}</span>
        <small className={noAr ? 'on' : ''}>{noAr ? 'no ar' : 'pronto'}</small>
      </div>
      <div className="deck">
        <b>B</b>
        <span>{proxima?.title ?? '--'}</span>
        <small>engatilhada</small>
      </div>
      <div className="deck-actions">
        <button
          className="soft-btn"
          type="button"
          onClick={engine.toggleBackground}
          disabled={bloqueado}
        >
          {noAr ? <Pause size={13} /> : <Play size={13} />}
          {noAr ? 'Pausar fundo' : 'Voltar fundo'}
        </button>
        <button
          className="ghost-btn"
          type="button"
          onClick={engine.nextBackground}
          disabled={bloqueado}
        >
          <SkipForward size={13} />
          Mix agora
        </button>
      </div>
      <p className="status-line">
        {noAr
          ? 'fundo em volume seguro'
          : mode === 'main'
            ? 'fundo abaixa durante o louvor'
            : backgrounds.length
              ? 'silêncio proposital'
              : 'nenhum fundo cadastrado ainda'}
      </p>
    </>
  )
}
