import { fromPrototypeState, parsePlayedAt, readLegacyState } from './legacy'
import { LEGACY_IMPORTED_KEY, LEGACY_STORAGE_KEY } from './legacy'
import { normalizePersistedState } from './normalize'
import { createFakeLocalStorage } from '../test/memory-storage'
import type { PersistedState } from './types'

/**
 * O tradutor do schema v4 do protótipo (correção C4).
 *
 * O payload abaixo é do formato real, montado a partir de
 * `CronoApp-prototipo/src/store.ts` — `partialize` + `version: 4`. Se um nome de
 * campo estiver errado aqui, o resgate perde os dados **em silêncio**: item sem
 * `videoId` é descartado pela normalização, e o operador abre o app novo com a
 * fila vazia e nenhum aviso.
 */
const PAYLOAD_V4 = {
  version: 4,
  state: {
    theme: 'light',
    accent: '#4f8df7',
    queue: [
      {
        id: 'a1b2',
        singer: 'Ana',
        title: 'Porque Ele Vive (playback)',
        duration: 254,
        url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      },
      {
        id: 'c3d4',
        singer: 'Bruno',
        title: 'Deus é Deus',
        duration: 198,
        url: 'https://youtu.be/kXYiU_JCYtU?si=xyz',
      },
    ],
    history: [
      { singer: 'Carla', title: 'Ele é Exaltado', playedAt: '19:42' },
      { singer: 'Diego', title: 'Grande é o Senhor', playedAt: '19:18' },
    ],
    backgrounds: [
      {
        id: 'M7lc1UVf-VE',
        title: 'Piano worship 3 horas',
        playlist: 'YouTube',
        duration: 10_800,
      },
      {
        id: '9bZkp7q19f0',
        title: 'Pads para oração',
        playlist: 'YouTube',
        duration: 7200,
      },
    ],
    masterVolume: 80,
    backgroundVolume: 40,
    autoReturn: false,
    backgroundIndex: 1,
    mainFadeSeconds: 2.5,
    backgroundFadeSeconds: 3,
  },
}

/** O caminho completo: traduzir e depois normalizar, como o resgate faz. */
function resgatar(raw: unknown, version = 4): PersistedState {
  return normalizePersistedState(fromPrototypeState(raw, version))
}

describe('tradução do schema v4 (C4)', () => {
  it('a fila sobrevive — nome, título, duração e o id extraído da URL', () => {
    const state = resgatar(PAYLOAD_V4.state)

    expect(state.queue).toHaveLength(2)
    expect(state.queue[0]).toMatchObject({
      name: 'Ana',
      title: 'Porque Ele Vive (playback)',
      videoId: 'dQw4w9WgXcQ',
      durationSec: 254,
    })
    // O segundo veio de um link curto, com parâmetro de rastreio grudado.
    expect(state.queue[1]?.videoId).toBe('kXYiU_JCYtU')
  })

  it('o `id` do fundo no protótipo É o id do vídeo', () => {
    const state = resgatar(PAYLOAD_V4.state)

    expect(state.backgrounds.map((b) => b.videoId)).toEqual([
      'M7lc1UVf-VE',
      '9bZkp7q19f0',
    ])
    // …e a faixa ganha identidade própria na biblioteca, separada do vídeo.
    expect(state.backgrounds[0]?.id).not.toBe('M7lc1UVf-VE')
    expect(state.backgrounds.map((b) => b.title)).toEqual([
      'Piano worship 3 horas',
      'Pads para oração',
    ])
  })

  it('o índice do fundo selecionado vira o id da faixa daquela posição', () => {
    const state = resgatar(PAYLOAD_V4.state)

    // backgroundIndex: 1 → a segunda faixa da lista.
    expect(state.selectedBackgroundId).toBe(state.backgrounds[1]?.id)
  })

  it('o histórico mantém nome, título e horário', () => {
    const state = resgatar(PAYLOAD_V4.state)

    expect(state.history.map((h) => h.name)).toEqual(['Carla', 'Diego'])
    const primeiro = state.history[0]
    expect(primeiro?.finishedAt).toBeGreaterThan(0)
    expect(new Date(primeiro?.finishedAt ?? 0).getHours()).toBe(19)
    expect(new Date(primeiro?.finishedAt ?? 0).getMinutes()).toBe(42)
    // Tudo do protótipo vira um culto só — lá não havia noção de sessão.
    expect(new Set(state.history.map((h) => h.sessionId)).size).toBe(1)
  })

  it('volumes e fades chegam na escala certa', () => {
    const state = resgatar(PAYLOAD_V4.state)

    expect(state.mainFader).toBe(80)
    expect(state.backgroundFader).toBe(40)
    // Segundos lá, milissegundos aqui.
    expect(state.preferences.mainFadeMs).toBe(2500)
    expect(state.preferences.backgroundFadeMs).toBe(3000)
  })

  it('as preferências que moravam na raiz entram no bloco de preferências', () => {
    const state = resgatar(PAYLOAD_V4.state)

    expect(state.preferences.theme).toBe('light')
    expect(state.preferences.accent).toBe('#4f8df7')
    expect(state.preferences.autoReturnBackground).toBe(false)
  })

  it('descarta só o item cujo link não dá para reconhecer', () => {
    const state = resgatar({
      queue: [
        { singer: 'Ana', title: 'ok', url: 'https://youtu.be/dQw4w9WgXcQ' },
        { singer: 'Sem link', title: 'nada' },
        { singer: 'Link torto', title: 'nada', url: 'não é link' },
      ],
    })

    expect(state.queue.map((i) => i.name)).toEqual(['Ana'])
  })

  it('joga fora os fundos de exemplo das versões anteriores à 3', () => {
    const state = resgatar(PAYLOAD_V4.state, 2)

    // Eram seeds fixos que nunca tocaram áudio; a própria migração do
    // protótipo os descartava.
    expect(state.backgrounds).toEqual([])
    expect(state.selectedBackgroundId).toBeNull()
    // O resto continua vindo.
    expect(state.queue).toHaveLength(2)
  })

  it('estado vazio do protótipo não quebra nada', () => {
    const state = resgatar({})

    expect(state.queue).toEqual([])
    expect(state.backgrounds).toEqual([])
    expect(state.mainFader).toBe(80)
    expect(state.preferences.accent).toBe('#e8b64c')
  })
})

describe('parsePlayedAt', () => {
  const hoje = new Date(2026, 6, 21, 20, 0, 0).getTime()

  it('coloca a hora do protótipo no dia de hoje', () => {
    const stamp = parsePlayedAt('19:42', hoje)
    const data = new Date(stamp)

    expect(data.getDate()).toBe(21)
    expect(data.getHours()).toBe(19)
    expect(data.getMinutes()).toBe(42)
  })

  it('hora que ainda não chegou foi no culto de ontem', () => {
    const stamp = parsePlayedAt('22:30', hoje)

    expect(new Date(stamp).getDate()).toBe(20)
    expect(new Date(stamp).getHours()).toBe(22)
  })

  it('o que não é horário vira o instante de agora, em vez de NaN', () => {
    expect(parsePlayedAt(undefined, hoje)).toBe(hoje)
    expect(parsePlayedAt('ontem à noite', hoje)).toBe(hoje)
    expect(parsePlayedAt('99:99', hoje)).toBe(hoje)
  })
})

describe('readLegacyState com o payload de verdade', () => {
  it('lê do localStorage e devolve o estado já traduzido', () => {
    const storage = createFakeLocalStorage({
      [LEGACY_STORAGE_KEY]: JSON.stringify(PAYLOAD_V4),
    })

    const state = readLegacyState(storage)

    expect(state?.queue.map((i) => i.name)).toEqual(['Ana', 'Bruno'])
    expect(state?.backgrounds).toHaveLength(2)
    expect(state?.preferences.mainFadeMs).toBe(2500)
  })

  it('não resgata de novo depois de marcado', () => {
    const storage = createFakeLocalStorage({
      [LEGACY_STORAGE_KEY]: JSON.stringify(PAYLOAD_V4),
      [LEGACY_IMPORTED_KEY]: '2026-07-21T00:00:00.000Z',
    })

    expect(readLegacyState(storage)).toBeNull()
  })
})
