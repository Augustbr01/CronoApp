import { Download, Upload, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { formatSeconds, msToSeconds, secondsToMs } from './format'
import { useFocusTrap } from './hooks'
import { useCrono } from '../features/mixer/context'
import {
  backupFileName,
  exportBackupJson,
  parseBackupJson,
} from '../store/backup'
import { ACCENT_COLORS, MAX_CHURCH_NAME, MAX_FADE_MS } from '../store/types'

/**
 * O modal de configurações (RF-08.1) — e o backup (RF-09.4).
 *
 * Duas coisas que o protótipo não tinha e que este arquivo traz:
 *
 * - **Foco gerenciado** (RNF-05.1): abre com o foco no primeiro controle,
 *   `Tab` circula dentro do diálogo, `Escape` fecha e o foco volta para o
 *   botão que abriu.
 * - **Exportar e importar** o culto inteiro em JSON. Sem contas e sem nuvem, o
 *   arquivo é o backup — e é como o operador leva a configuração para outro
 *   notebook quando o da mesa de som resolve não ligar.
 *
 * O fade é mostrado em **segundos**, com passo de meio segundo, porque é assim
 * que o operador pensa; guardamos em milissegundos, porque é assim que o motor
 * pensa. A conversão acontece só aqui, na borda.
 */

interface SettingsModalProps {
  onClose: () => void
}

export function SettingsModal({ onClose }: SettingsModalProps) {
  const dialogRef = useRef<HTMLElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const preferences = useCrono((state) => state.preferences)
  const setMainFadeMs = useCrono((state) => state.setMainFadeMs)
  const setBackgroundFadeMs = useCrono((state) => state.setBackgroundFadeMs)
  const setAccent = useCrono((state) => state.setAccent)
  const setChurchName = useCrono((state) => state.setChurchName)
  const exportState = useCrono((state) => state.exportState)
  const importState = useCrono((state) => state.importState)

  const [aviso, setAviso] = useState('')

  useFocusTrap(dialogRef, true)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const exportar = (): void => {
    const blob = new Blob([exportBackupJson(exportState())], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = backupFileName()
    link.click()
    URL.revokeObjectURL(url)
    setAviso('Backup exportado.')
  }

  const importar = async (file: File): Promise<void> => {
    try {
      importState(parseBackupJson(await file.text()))
      setAviso('Backup importado. O painel voltou para standby.')
    } catch (error) {
      // Aqui existe alguém olhando a tela, esperando o resultado de uma ação
      // que acabou de tomar: o erro tem que aparecer (RNF-03.3).
      setAviso(
        error instanceof Error ? error.message : 'Não foi possível importar.',
      )
    }
  }

  return (
    <div
      className="modal-overlay"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label="Configurações"
        // Recebe o foco quando não há controle nenhum dentro — e dá ao leitor
        // de tela um ponto de partida dentro do diálogo.
        tabIndex={-1}
        ref={dialogRef}
      >
        <header>
          <h1>Configurações</h1>
          <button
            className="ghost-icon"
            type="button"
            onClick={onClose}
            title="Fechar"
            aria-label="Fechar configurações"
          >
            <X size={15} />
          </button>
        </header>
        <p>Tempos de transição de áudio e aparência, salvos automaticamente.</p>

        {/* Primeiro campo do diálogo porque é o que identifica a instalação —
            e porque é aqui que quem pulou as boas-vindas vem procurar. */}
        <div className="settings-field">
          <label htmlFor="church-name">Nome da igreja</label>
          <input
            id="church-name"
            className="settings-input"
            value={preferences.churchName}
            onChange={(event) => setChurchName(event.target.value)}
            placeholder="Ex.: Igreja Batista Central"
            maxLength={MAX_CHURCH_NAME}
            autoComplete="organization"
          />
          <small>
            Aparece na topbar, ao lado do nome do app. Deixe vazio para
            esconder.
          </small>
        </div>

        <FadeField
          id="main-fade"
          label="Fade do louvor principal"
          hint="Ao pausar, parar ou trocar a música da fila"
          valueMs={preferences.mainFadeMs}
          onChange={setMainFadeMs}
        />

        <FadeField
          id="background-fade"
          label="Fade do fundo musical"
          hint={'Ao pausar o fundo (tecla B) e no "Mix agora"'}
          valueMs={preferences.backgroundFadeMs}
          onChange={setBackgroundFadeMs}
        />

        <div className="settings-field">
          <label id="accent-label">Cor de destaque</label>
          <div
            className="accent-swatches"
            role="group"
            aria-labelledby="accent-label"
          >
            {ACCENT_COLORS.map((option) => (
              <button
                key={option}
                type="button"
                className={preferences.accent === option ? 'selected' : ''}
                style={{ background: option }}
                onClick={() => setAccent(option)}
                aria-label={`Cor de destaque ${option}`}
                aria-pressed={preferences.accent === option}
              />
            ))}
          </div>
        </div>

        <div className="settings-field">
          <label>Backup deste dispositivo</label>
          <div className="settings-actions">
            <button className="pill-outline" type="button" onClick={exportar}>
              <Download size={14} />
              Exportar JSON
            </button>
            <button
              className="pill-outline"
              type="button"
              onClick={() => fileRef.current?.click()}
            >
              <Upload size={14} />
              Importar JSON
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              hidden
              aria-hidden="true"
              tabIndex={-1}
              onChange={(event) => {
                const file = event.target.files?.[0]
                event.target.value = ''
                if (file) void importar(file)
              }}
            />
          </div>
          <small>
            Fila, fundos, histórico e preferências. Importar substitui tudo.
          </small>
        </div>

        {aviso && (
          <p className="settings-notice" role="status">
            {aviso}
          </p>
        )}

        <div className="settings-card">
          <b>Dica</b> · entre 1,5s e 3s o fade soa natural nas transições do
          culto.
        </div>
      </section>
    </div>
  )
}

interface FadeFieldProps {
  id: string
  label: string
  hint: string
  valueMs: number
  onChange: (ms: number) => void
}

function FadeField({ id, label, hint, valueMs, onChange }: FadeFieldProps) {
  const seconds = msToSeconds(valueMs)

  return (
    <div className="settings-field">
      <label htmlFor={id}>
        {label}
        <b>{formatSeconds(seconds)}</b>
      </label>
      <input
        id={id}
        type="range"
        min={0}
        max={msToSeconds(MAX_FADE_MS)}
        step={0.5}
        value={seconds}
        onChange={(event) => onChange(secondsToMs(Number(event.target.value)))}
      />
      <small>{hint}</small>
    </div>
  )
}
