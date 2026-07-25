import { normalizePersistedState, normalizePreferences } from './normalize'
import { DEFAULT_PREFERENCES } from './types'

/**
 * A normalização é a muralha entre o disco e o app.
 *
 * A regra que estes testes travam: **nunca lançar erro, nunca deixar passar
 * lixo**. Um `undefined` que escapa daqui não aparece agora — aparece no meio do
 * culto, como tela branca.
 */

describe('nunca quebra', () => {
  it('aceita qualquer entrada sem lançar', () => {
    const entradas: unknown[] = [
      undefined,
      null,
      0,
      'texto',
      [],
      [1, 2, 3],
      { queue: 'não é lista' },
      { queue: [null, undefined, 42] },
      { preferences: 'nada a ver' },
    ]

    for (const entrada of entradas) {
      expect(() => normalizePersistedState(entrada)).not.toThrow()
    }
  })

  it('de nada faz um estado inicial válido', () => {
    const estado = normalizePersistedState(undefined)

    expect(estado.queue).toEqual([])
    expect(estado.history).toEqual([])
    expect(estado.backgrounds).toEqual([])
    expect(estado.selectedBackgroundId).toBeNull()
    expect(estado.preferences).toEqual(DEFAULT_PREFERENCES)
    expect(estado.sessionId).toBeTruthy()
  })
})

describe('itens da fila', () => {
  it('descarta item sem vídeo — não há o que tocar', () => {
    const estado = normalizePersistedState({
      queue: [
        { videoId: 'v1', name: 'Ana', title: 'Ana canta' },
        { name: 'Sem vídeo' },
      ],
    })

    expect(estado.queue).toHaveLength(1)
  })

  it('preenche nome e título que faltam', () => {
    const estado = normalizePersistedState({ queue: [{ videoId: 'v1' }] })

    expect(estado.queue[0]?.name).toBe('Convidado')
    expect(estado.queue[0]?.title).toBe('Vídeo do YouTube')
    expect(estado.queue[0]?.id).toBeTruthy()
    expect(estado.queue[0]?.addedAt).toBeGreaterThan(0)
  })
})

describe('origem de mídia — a union kind (RF-11)', () => {
  it('item sem kind mas com vídeo vira youtube (migração v5→v6)', () => {
    // O formato de toda versão ≤ 5 não tinha `kind`; a migração é por
    // normalização, sem escada versão a versão.
    const estado = normalizePersistedState({
      queue: [{ videoId: 'v1', name: 'Ana', title: 'Ana canta' }],
      backgrounds: [{ id: 'bg1', videoId: 'v', title: 'Piano' }],
    })

    expect(estado.queue[0]).toMatchObject({ kind: 'youtube', videoId: 'v1' })
    expect(estado.backgrounds[0]).toMatchObject({
      kind: 'youtube',
      videoId: 'v',
    })
  })

  it('aceita item local que traz blobId e fileName', () => {
    const estado = normalizePersistedState({
      queue: [
        { kind: 'local', blobId: 'a1', fileName: 'louvor.mp3', name: 'Ana' },
      ],
      backgrounds: [{ kind: 'local', blobId: 'b1', fileName: 'pads.mp3' }],
    })

    expect(estado.queue[0]).toMatchObject({
      kind: 'local',
      blobId: 'a1',
      fileName: 'louvor.mp3',
    })
    // Sem título gravado, o nome do arquivo assume — o card nunca fica sem rótulo.
    expect(estado.queue[0]?.title).toBe('louvor.mp3')
    expect(estado.backgrounds[0]).toMatchObject({
      kind: 'local',
      blobId: 'b1',
      fileName: 'pads.mp3',
    })
  })

  it('descarta item local sem blob ou sem nome de arquivo', () => {
    // Sem os dois não há como remontar o áudio; sobra só o item completo.
    const estado = normalizePersistedState({
      queue: [
        { kind: 'local', fileName: 'sem-blob.mp3', name: 'A' },
        { kind: 'local', blobId: 'a1', name: 'B' },
        { kind: 'local', blobId: 'a2', fileName: 'ok.mp3', name: 'C' },
      ],
    })

    expect(estado.queue).toHaveLength(1)
    expect(estado.queue[0]).toMatchObject({ kind: 'local', blobId: 'a2' })
  })
})

describe('fundo selecionado', () => {
  it('não deixa apontar para uma faixa que não existe', () => {
    const estado = normalizePersistedState({
      backgrounds: [{ id: 'bg1', videoId: 'v', title: 'Piano' }],
      selectedBackgroundId: 'bg-fantasma',
    })

    // Cai na primeira faixa real em vez de tentar tocar um fantasma.
    expect(estado.selectedBackgroundId).toBe('bg1')
  })

  it('sem biblioteca, não há seleção', () => {
    const estado = normalizePersistedState({ selectedBackgroundId: 'bg1' })

    expect(estado.selectedBackgroundId).toBeNull()
  })

  it('mantém a seleção quando ela é válida', () => {
    const estado = normalizePersistedState({
      backgrounds: [
        { id: 'bg1', videoId: 'v', title: 'Piano' },
        { id: 'bg2', videoId: 'v2', title: 'Harpa' },
      ],
      selectedBackgroundId: 'bg2',
    })

    expect(estado.selectedBackgroundId).toBe('bg2')
  })
})

describe('preferências', () => {
  it('prende as durações de fade nos limites do RF-04.12', () => {
    expect(normalizePreferences({ mainFadeMs: 999_999 }).mainFadeMs).toBe(8000)
    expect(
      normalizePreferences({ backgroundFadeMs: -5 }).backgroundFadeMs,
    ).toBe(0)
  })

  it('recusa cor de destaque inventada', () => {
    expect(normalizePreferences({ accent: 'rosa-choque' }).accent).toBe(
      DEFAULT_PREFERENCES.accent,
    )
  })

  it('recusa tema inventado', () => {
    expect(normalizePreferences({ theme: 'neon' }).theme).toBe('dark')
  })

  it('aceita os valores válidos', () => {
    const prefs = normalizePreferences({
      mainFadeMs: 1500,
      backgroundFadeMs: 3000,
      accent: '#4f8df7',
      theme: 'light',
      autoReturnBackground: false,
      churchName: 'Igreja Batista Central',
      setupDone: true,
    })

    expect(prefs).toEqual({
      mainFadeMs: 1500,
      backgroundFadeMs: 3000,
      accent: '#4f8df7',
      theme: 'light',
      autoReturnBackground: false,
      churchName: 'Igreja Batista Central',
      setupDone: true,
    })
  })

  it('estado gravado antes do nome da igreja existir vira primeiro arranque', () => {
    // É o caminho de quem já usava o app: sem migração escrita à mão, o campo
    // que falta cai no padrão e a tela de boas-vindas aparece uma vez.
    const prefs = normalizePreferences({ mainFadeMs: 1500 })

    expect(prefs.churchName).toBe('')
    expect(prefs.setupDone).toBe(false)
  })

  it('limpa o nome da igreja que vem torto de um arquivo importado', () => {
    expect(
      normalizePreferences({ churchName: '  Igreja   Central \n' }).churchName,
    ).toBe('Igreja Central')
    // Um nome absurdo não pode empurrar a topbar inteira.
    expect(
      normalizePreferences({ churchName: 'a'.repeat(200) }).churchName,
    ).toHaveLength(40)
    // E o que não é texto não vira nome.
    expect(normalizePreferences({ churchName: 42 }).churchName).toBe('')
  })
})

describe('faders', () => {
  it('prende na escala 0–100', () => {
    expect(normalizePersistedState({ mainFader: 500 }).mainFader).toBe(100)
    expect(
      normalizePersistedState({ backgroundFader: -9 }).backgroundFader,
    ).toBe(0)
  })

  it('valor não numérico vira o padrão, não NaN', () => {
    expect(normalizePersistedState({ mainFader: 'alto' }).mainFader).toBe(80)
  })
})

describe('histórico', () => {
  it('carimba o culto quando a entrada antiga não tinha sessão', () => {
    const estado = normalizePersistedState({
      history: [{ name: 'Ana', title: 'Ana cantou' }],
    })

    expect(estado.history[0]?.sessionId).toBe(estado.sessionId)
  })

  it('descarta entrada sem nome nem título', () => {
    const estado = normalizePersistedState({
      history: [{ videoId: 'v1' }, { name: 'Ana', title: 'Ana cantou' }],
    })

    expect(estado.history).toHaveLength(1)
  })
})
