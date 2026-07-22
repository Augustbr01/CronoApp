import {
  BACKUP_FORMAT_VERSION,
  backupFileName,
  exportBackupJson,
  parseBackupJson,
} from './backup'
import { createCronoStore } from './index'
import { createMemoryStorage } from '../test/memory-storage'
import type { PersistedState } from './types'
import { DEFAULT_PREFERENCES } from './types'

/**
 * Export/import JSON (RF-09.4) — o backup do operador.
 *
 * Sem contas e sem nuvem, este arquivo é a única forma de levar o culto para
 * outro notebook. Se ele não voltar igual, a funcionalidade não existe.
 */

const estadoExemplo: PersistedState = {
  queue: [
    {
      id: 'q1',
      name: 'Ana',
      videoId: 'v1',
      title: 'Ana canta',
      addedAt: 1_700_000_000_000,
    },
  ],
  history: [
    {
      id: 'h1',
      name: 'Bruno',
      title: 'Bruno cantou',
      videoId: 'v2',
      finishedAt: 1_700_000_100_000,
      sessionId: 's1',
    },
  ],
  backgrounds: [
    {
      id: 'bg1',
      videoId: 'bgv',
      title: 'Piano worship',
      addedAt: 1_700_000_000_000,
    },
  ],
  selectedBackgroundId: 'bg1',
  mainFader: 80,
  backgroundFader: 45,
  preferences: { ...DEFAULT_PREFERENCES, accent: '#c084fc', theme: 'light' },
  sessionId: 's1',
}

describe('exportar', () => {
  it('gera um arquivo identificável e legível', () => {
    const json = exportBackupJson(estadoExemplo)
    const arquivo = JSON.parse(json) as Record<string, unknown>

    expect(arquivo.app).toBe('cronoapp')
    expect(arquivo.formatVersion).toBe(BACKUP_FORMAT_VERSION)
    expect(typeof arquivo.exportedAt).toBe('string')
    // Indentado: o operador pode abrir no bloco de notas e ver o que tem lá.
    expect(json).toContain('\n  ')
  })

  it('sugere um nome de arquivo com a data', () => {
    expect(backupFileName(new Date('2026-07-21T10:00:00Z'))).toBe(
      'cronoapp-2026-07-21.json',
    )
  })
})

describe('a volta completa', () => {
  it('exportar e importar devolve exatamente o mesmo estado', () => {
    const json = exportBackupJson(estadoExemplo)

    expect(parseBackupJson(json)).toEqual(estadoExemplo)
  })

  it('leva o culto para outro notebook', () => {
    const { storage } = createMemoryStorage()
    const origem = createCronoStore({ storage, legacyStorage: null })
    origem.getState().addToQueue({ name: 'Ana', videoId: 'v1', title: 'Ana' })
    origem.getState().addBackground({ videoId: 'bg', title: 'Piano' })
    origem.getState().setBackgroundFader(30)
    origem.getState().setAccent('#1fce6d')

    const arquivo = exportBackupJson(origem.getState().exportState())

    const destino = createCronoStore({
      storage: createMemoryStorage().storage,
      legacyStorage: null,
    })
    destino.getState().importState(parseBackupJson(arquivo))

    expect(destino.getState().queue.map((i) => i.name)).toEqual(['Ana'])
    expect(destino.getState().backgrounds).toHaveLength(1)
    expect(destino.getState().backgroundFader).toBe(30)
    expect(destino.getState().preferences.accent).toBe('#1fce6d')
  })

  it('importar não deixa o app achando que tem algo no ar', () => {
    const { storage } = createMemoryStorage()
    const store = createCronoStore({ storage, legacyStorage: null })
    const ana = store
      .getState()
      .addToQueue({ name: 'Ana', videoId: 'v1', title: 'Ana' })
    store.getState().play(ana)
    expect(store.getState().mode).toBe('main')

    store.getState().importState(estadoExemplo)

    expect(store.getState().mode).toBe('silence')
    expect(store.getState().currentId).toBeNull()
  })
})

describe('arquivo ruim, mensagem clara (RNF-03.3)', () => {
  it('recusa o que não é JSON', () => {
    expect(() => parseBackupJson('{{{ isto não é json')).toThrow(/JSON válido/i)
  })

  it('recusa arquivo de outro programa', () => {
    const outro = JSON.stringify({ app: 'outra-coisa', data: {} })

    expect(() => parseBackupJson(outro)).toThrow(/backup do CronoApp/i)
  })

  it('recusa backup sem dados', () => {
    const semDados = JSON.stringify({ app: 'cronoapp', formatVersion: 1 })

    expect(() => parseBackupJson(semDados)).toThrow(/sem dados|corrompido/i)
  })

  it('recusa um JSON que é uma lista, não um objeto', () => {
    expect(() => parseBackupJson('[1,2,3]')).toThrow(/backup do CronoApp/i)
  })
})

describe('arquivo antigo ou incompleto ainda abre', () => {
  it('preenche o que falta em vez de recusar', () => {
    const antigo = JSON.stringify({
      app: 'cronoapp',
      formatVersion: 1,
      data: {
        queue: [{ id: 'q1', name: 'Ana', videoId: 'v1', title: 'Ana canta' }],
      },
    })

    const estado = parseBackupJson(antigo)

    expect(estado.queue).toHaveLength(1)
    expect(estado.preferences).toEqual(DEFAULT_PREFERENCES)
    expect(estado.backgrounds).toEqual([])
    expect(estado.mainFader).toBe(80)
  })

  it('descarta itens corrompidos e mantém os bons', () => {
    const misturado = JSON.stringify({
      app: 'cronoapp',
      data: {
        queue: [
          { id: 'q1', name: 'Ana', videoId: 'v1', title: 'Ana canta' },
          { id: 'q2', name: 'Sem vídeo nenhum' },
        ],
      },
    })

    expect(parseBackupJson(misturado).queue.map((i) => i.name)).toEqual(['Ana'])
  })
})
