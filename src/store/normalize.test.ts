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
    })

    expect(prefs).toEqual({
      mainFadeMs: 1500,
      backgroundFadeMs: 3000,
      accent: '#4f8df7',
      theme: 'light',
      autoReturnBackground: false,
    })
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
