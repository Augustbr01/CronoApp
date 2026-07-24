import {
  AudioLines,
  Moon,
  Pause,
  Play,
  SlidersHorizontal,
  Square,
  Sun,
} from 'lucide-react'
import { useCrono, useEngine, useEngineValue } from './context'
import { estaAcabando } from './countdown'
import { Clock } from '../../shared/Clock'
import { formatDuration, formatTime } from '../../shared/format'

/**
 * A faixa de cima: o que está no ar, o que está tocando, quanto falta e os
 * controles de transporte (RF-05.4).
 *
 * É a única parte da tela que o operador olha sem procurar. Por isso ela
 * responde três perguntas em ordem de urgência: **está no ar?** (o bloco
 * colorido), **o quê?** (o título) e **quanto falta?** (o número grande).
 */

interface TopbarProps {
  onOpenSettings: () => void
}

export function Topbar({ onOpenSettings }: TopbarProps) {
  const engine = useEngine()

  const mode = useCrono((state) => state.mode)
  const currentId = useCrono((state) => state.currentId)
  const queue = useCrono((state) => state.queue)
  const backgrounds = useCrono((state) => state.backgrounds)
  const selectedBackgroundId = useCrono((state) => state.selectedBackgroundId)
  const autoReturn = useCrono((state) => state.preferences.autoReturnBackground)
  const theme = useCrono((state) => state.preferences.theme)
  const churchName = useCrono((state) => state.preferences.churchName)
  const toggleTheme = useCrono((state) => state.toggleTheme)
  const setAutoReturn = useCrono((state) => state.setAutoReturnBackground)

  const elapsed = useEngineValue((s) => Math.floor(s.elapsedSec))
  const backgroundElapsed = useEngineValue((s) =>
    Math.floor(s.backgroundElapsedSec),
  )

  const current = queue.find((item) => item.id === currentId) ?? null
  const background =
    backgrounds.find((track) => track.id === selectedBackgroundId) ?? null

  const isMain = mode === 'main'
  const isBackground = mode === 'background'
  const isPaused = mode === 'silence' && currentId !== null

  const noAr = isMain ? 'LOUVOR' : isBackground ? 'FUNDO' : 'SILÊNCIO'

  const titulo =
    isMain && current
      ? `${current.name} — ${current.title}`
      : isBackground
        ? (background?.title ?? 'Fundo não configurado')
        : isPaused && current
          ? `${current.name} — ${current.title}`
          : 'Sem áudio'

  const subtitulo = isMain
    ? `Playback da fila · ${formatTime(elapsed)} / ${formatDuration(current?.durationSec)}`
    : isBackground
      ? `Fundo musical · deck A · ${(background?.kind === 'youtube' ? background.channelTitle : undefined) ?? 'YouTube'}`
      : isPaused
        ? 'Pausado · aperte play ou Espaço para continuar'
        : backgrounds.length
          ? 'Aperte play ou use a tecla B'
          : 'Adicione o primeiro fundo musical na aba Fundos'

  /**
   * Quantos segundos faltam para o canal no ar acabar — ou `null` quando não
   * há contagem nenhuma correndo (relógio de parede, duração desconhecida).
   */
  const restanteSec =
    isMain && current?.durationSec
      ? Math.max(0, current.durationSec - elapsed)
      : isBackground && background?.durationSec
        ? Math.max(0, background.durationSec - backgroundElapsed)
        : null

  const restante =
    restanteSec !== null ? (
      formatTime(restanteSec)
    ) : (
      <Clock live={mode === 'silence'} />
    )

  // No fundo o fim não é fim: é o "Mix agora" acontecendo sozinho (RF-03.5).
  // O aviso é o mesmo porque a pergunta do operador é a mesma — "tenho tempo
  // de fazer alguma coisa antes?".
  const acabando = estaAcabando(restanteSec)

  const podeTocar = isMain || isPaused || backgrounds.length > 0

  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-badge">
          <AudioLines size={18} />
        </span>
        <span className="brand-text">
          <b>CronoApp</b>
          <small>Painel de som</small>
        </span>
        {/* Só existe quando há nome: sem ele, nem o separador aparece, e a
            topbar fica exatamente como era. */}
        {churchName && <span className="brand-church">{churchName}</span>}
      </div>

      <div
        className={`on-air ${isMain ? 'main' : isBackground ? 'background' : ''}`}
      >
        <small>
          <i />
          {isMain || isBackground ? 'NO AR' : 'STANDBY'}
        </small>
        <b>{noAr}</b>
      </div>

      {/* Região viva: o leitor de tela anuncia a mudança de modo (RNF-05.3). */}
      <p className="sr-only" role="status">
        {isMain || isBackground ? `No ar: ${noAr}. ${titulo}` : 'Em standby.'}
      </p>

      <div className="now-playing">
        <strong>{titulo}</strong>
        <span>{subtitulo}</span>
      </div>

      <div className={`countdown ${acabando ? 'acabando' : ''}`}>
        <small>
          {isMain ? 'RESTA' : isBackground ? 'MIX AUTO EM' : 'AGORA'}
        </small>
        {/* `aria-live` fica de fora de propósito: o número muda a cada segundo,
            e anunciá-lo faria o leitor de tela falar por cima de tudo o resto
            durante o culto inteiro. Quem não vê a cor tem o tempo no subtítulo,
            que já é lido sob demanda. */}
        <b>{restante}</b>
      </div>

      <div className="transport">
        <button
          className="primary"
          type="button"
          title="Pausar / continuar (Espaço)"
          aria-label={isMain ? 'Pausar' : 'Tocar'}
          disabled={!podeTocar}
          onClick={engine.togglePlayPause}
        >
          {isMain ? <Pause size={17} /> : <Play size={17} />}
        </button>
        <button
          type="button"
          onClick={engine.stopMain}
          disabled={currentId === null}
          title="Parar e voltar ao fundo (S)"
          aria-label="Parar"
        >
          <Square size={14} />
        </button>
      </div>

      <label className="switch" title="Retorno automático ao fundo">
        <button
          type="button"
          className={autoReturn ? 'enabled' : ''}
          onClick={() => setAutoReturn(!autoReturn)}
          aria-pressed={autoReturn}
          aria-label="Retorno automático ao fundo"
        >
          <i />
        </button>
        retorno automático
      </label>

      <div className="top-actions">
        <button
          className="icon-btn"
          type="button"
          onClick={toggleTheme}
          title="Alternar tema"
          aria-label="Alternar tema"
        >
          {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        </button>
        <button
          className="icon-btn"
          type="button"
          onClick={onOpenSettings}
          title="Configurações"
          aria-label="Configurações"
        >
          <SlidersHorizontal size={16} />
        </button>
      </div>
    </header>
  )
}
