import { normalizePersistedState } from './normalize'
import type { PersistedState } from './types'

/**
 * Backup e portabilidade em JSON (RF-09.4).
 *
 * Sem contas e sem nuvem, o arquivo JSON **é** o backup do operador — e é como
 * ele leva a configuração do culto para outro notebook quando o da mesa de som
 * resolve não ligar. Por isso o formato é legível e a importação é rigorosa na
 * entrada e generosa no conteúdo: recusa arquivo que não é do CronoApp, mas
 * aceita um exportado por uma versão diferente do app.
 */

/** Versão do formato de arquivo — não é a versão do schema do store. */
export const BACKUP_FORMAT_VERSION = 1

const BACKUP_MARKER = 'cronoapp'

export interface BackupFile {
  app: typeof BACKUP_MARKER
  formatVersion: number
  exportedAt: string
  data: PersistedState
}

/** Monta o conteúdo do arquivo de backup. */
export function createBackup(state: PersistedState): BackupFile {
  return {
    app: BACKUP_MARKER,
    formatVersion: BACKUP_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    data: state,
  }
}

/** O texto que vai para o arquivo `.json`, indentado para ser legível. */
export function exportBackupJson(state: PersistedState): string {
  return JSON.stringify(createBackup(state), null, 2)
}

/** Nome sugerido do arquivo, com a data — `cronoapp-2026-07-21.json`. */
export function backupFileName(date: Date = new Date()): string {
  const dia = date.toISOString().slice(0, 10)
  return `cronoapp-${dia}.json`
}

/**
 * Lê um arquivo de backup.
 *
 * Lança `Error` com mensagem em português para o operador (RNF-03.3) quando o
 * arquivo não serve — é a única parte do módulo de persistência que **deve**
 * falhar em voz alta, porque aqui existe alguém olhando a tela, esperando o
 * resultado de uma ação que acabou de tomar.
 */
export function parseBackupJson(json: string): PersistedState {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    throw new Error('Este arquivo não é um JSON válido.')
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('Este arquivo não parece um backup do CronoApp.')
  }

  const file = parsed as Partial<BackupFile>
  if (file.app !== BACKUP_MARKER) {
    throw new Error(
      'Este arquivo não é um backup do CronoApp. Escolha um arquivo exportado pelo app.',
    )
  }

  if (typeof file.data !== 'object' || file.data === null) {
    throw new Error(
      'O backup está sem dados — o arquivo pode estar corrompido.',
    )
  }

  // A partir daqui é generoso: campo que falta vira padrão, item corrompido é
  // descartado. Um backup antigo continua abrindo.
  return normalizePersistedState(file.data)
}
