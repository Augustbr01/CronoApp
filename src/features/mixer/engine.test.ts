import { createAudioEngine } from './engine'
import type { AudioEngine } from './engine'
import { createCronoStore } from '../../store'
import type { CronoStore } from '../../store'
import { createFakeChannelFactory } from '../../test/fake-channel'
import type { FakeChannelFactory } from '../../test/fake-channel'
import { createFakeScheduler } from '../../test/fake-scheduler'
import type { FakeScheduler } from '../../test/fake-scheduler'
import { createMemoryStorage } from '../../test/memory-storage'

/**
 * A costura entre store, motor e player — sem React.
 *
 * É o arquivo que responde "o que acontece com o **som** quando o operador
 * aperta um botão". Os testes de componente conferem a tela; estes conferem o
 * áudio, que é o que ninguém vê num teste de DOM.
 */

const FADE_MS = 2000

let store: CronoStore
let players: FakeChannelFactory
let clock: FakeScheduler
let engine: AudioEngine

beforeEach(async () => {
  const { storage } = createMemoryStorage()
  store = createCronoStore({ storage, legacyStorage: null })
  players = createFakeChannelFactory()
  clock = createFakeScheduler()
  engine = createAudioEngine({
    store,
    scheduler: clock,
    createChannel: players.create,
  })

  engine.attachMain(document.createElement('div'))
  engine.attachBackground(document.createElement('div'))
  // Os players nascem numa promessa.
  await Promise.resolve()
  await Promise.resolve()
})

afterEach(() => {
  engine.destroy()
})

function enfileirar(name: string, videoId: string): string {
  return store.getState().addToQueue({ name, videoId, title: `${name} canta` })
}

function comFundo(videoId = 'bg-1'): string {
  return engine.addBackground({ videoId, title: 'Piano worship' })
}

describe('tocar um item da fila', () => {
  it('carrega o vídeo daquele item e sobe com fade (RF-04.3)', () => {
    const ana = enfileirar('Ana', 'video-ana')

    engine.playQueueItem(ana)

    expect(players.main().loads).toEqual(['video-ana'])
    // Sempre parte do silêncio: nada de estourar no volume anterior.
    expect(players.main().volume).toBe(0)

    clock.advance(FADE_MS)
    expect(players.main().volume).toBeCloseTo(0.8, 2)
    expect(store.getState().mode).toBe('main')
  })

  it('o fader do operador manda no volume final (RF-04.8)', () => {
    const ana = enfileirar('Ana', 'video-ana')
    engine.setMainFader(50)

    engine.playQueueItem(ana)
    clock.advance(FADE_MS * 2)

    expect(players.main().volume).toBeCloseTo(0.5, 2)
  })

  it('trocar de música desce a atual antes de carregar a próxima (RF-04.4)', () => {
    const ana = enfileirar('Ana', 'video-ana')
    const bruno = enfileirar('Bruno', 'video-bruno')
    engine.playQueueItem(ana)
    clock.advance(FADE_MS)

    engine.playQueueItem(bruno)

    // No meio da descida o vídeo novo ainda não entrou, e a fila ainda
    // aponta para a Ana.
    clock.advance(FADE_MS / 2)
    expect(players.main().loads).toEqual(['video-ana'])
    expect(store.getState().currentId).toBe(ana)

    clock.advance(FADE_MS / 2)
    expect(players.main().loads).toEqual(['video-ana', 'video-bruno'])
    expect(store.getState().currentId).toBe(bruno)
  })
})

describe('crossfade fundo → louvor (RF-04.5)', () => {
  it('o fundo desce EM PARALELO enquanto o louvor sobe', () => {
    comFundo()
    const ana = enfileirar('Ana', 'video-ana')
    clock.advance(FADE_MS)
    expect(players.background().volume).toBeCloseTo(0.4, 2)

    engine.playQueueItem(ana)
    clock.advance(FADE_MS / 2)

    // Os dois estão soando ao mesmo tempo: um subindo, o outro descendo.
    expect(players.main().volume).toBeGreaterThan(0)
    expect(players.background().volume).toBeGreaterThan(0)
    expect(players.background().volume).toBeLessThan(0.4)
    // E o player do fundo continua tocando durante a descida.
    expect(players.background().commands).not.toContain('pause')
  })
})

describe('a música acaba sozinha (RF-06.1 + RF-04.11)', () => {
  it('sai da fila, entra no histórico e o fundo volta', () => {
    comFundo()
    const ana = enfileirar('Ana', 'video-ana')
    engine.playQueueItem(ana)
    clock.advance(FADE_MS)

    players.main().emitEnded()
    clock.advance(FADE_MS)

    expect(store.getState().queue).toHaveLength(0)
    expect(store.getState().history.map((h) => h.name)).toEqual(['Ana'])
    expect(store.getState().mode).toBe('background')
    expect(players.background().videos).toContain('bg-1')
    expect(players.background().volume).toBeCloseTo(0.4, 2)
  })

  it('com o retorno automático desligado, fica em silêncio (momento de oração)', () => {
    comFundo()
    const ana = enfileirar('Ana', 'video-ana')
    store.getState().setAutoReturnBackground(false)
    engine.playQueueItem(ana)
    clock.advance(FADE_MS)

    players.main().emitEnded()
    clock.advance(FADE_MS * 2)

    expect(store.getState().mode).toBe('silence')
    expect(players.background().volume).toBe(0)
  })

  it('sem fundo escolhido, também fica em silêncio em vez de tentar tocar o nada', () => {
    const ana = enfileirar('Ana', 'video-ana')
    engine.playQueueItem(ana)
    clock.advance(FADE_MS)

    players.main().emitEnded()
    clock.advance(FADE_MS * 2)

    expect(store.getState().mode).toBe('silence')
  })
})

describe('pausar e continuar (RF-07.1)', () => {
  it('o Espaço pausa com fade e o Espaço de novo traz de volta', () => {
    const ana = enfileirar('Ana', 'video-ana')
    engine.playQueueItem(ana)
    clock.advance(FADE_MS)

    engine.togglePlayPause()
    clock.advance(FADE_MS)
    expect(players.main().volume).toBe(0)
    expect(players.main().commands).toContain('pause')
    expect(store.getState().currentId).toBe(ana)

    engine.togglePlayPause()
    clock.advance(FADE_MS)
    expect(store.getState().mode).toBe('main')
    expect(players.main().volume).toBeCloseTo(0.8, 2)
    // Continuar não recarrega o vídeo: ele continua de onde parou.
    expect(players.main().loads).toEqual(['video-ana'])
  })

  it('pausar NÃO traz o fundo — quem pausa quer segurar tudo', () => {
    comFundo()
    const ana = enfileirar('Ana', 'video-ana')
    engine.playQueueItem(ana)
    clock.advance(FADE_MS)

    engine.togglePlayPause()
    clock.advance(FADE_MS * 3)

    expect(store.getState().mode).toBe('silence')
    expect(players.background().volume).toBe(0)
  })

  it('arrepender-se no meio da descida devolve o volume (RF-04.10)', () => {
    const ana = enfileirar('Ana', 'video-ana')
    engine.playQueueItem(ana)
    clock.advance(FADE_MS)

    engine.togglePlayPause()
    clock.advance(FADE_MS / 2)
    engine.togglePlayPause()
    clock.advance(FADE_MS)

    expect(store.getState().mode).toBe('main')
    expect(players.main().volume).toBeCloseTo(0.8, 2)
  })
})

describe('o fundo (RF-03)', () => {
  it('a primeira faixa da biblioteca vazia já entra tocando (RF-03.4)', () => {
    comFundo('bg-1')

    // O store decide o modo; o som tem que acompanhar sem um segundo clique.
    expect(store.getState().mode).toBe('background')
    expect(players.background().videos).toContain('bg-1')

    clock.advance(FADE_MS)
    expect(players.background().volume).toBeCloseTo(0.4, 2)
  })

  it('mas NÃO atropela o louvor que está no ar (RF-03.4)', () => {
    const ana = enfileirar('Ana', 'video-ana')
    engine.playQueueItem(ana)
    clock.advance(FADE_MS)

    comFundo('bg-1')
    clock.advance(FADE_MS * 2)

    expect(store.getState().mode).toBe('main')
    expect(players.background().volume).toBe(0)
    expect(players.main().volume).toBeCloseTo(0.8, 2)
  })

  it('"Mix agora" desce a faixa atual antes de trocar (RF-03.5)', () => {
    comFundo('bg-1')
    engine.addBackground({ videoId: 'bg-2', title: 'Pads' })
    clock.advance(FADE_MS)
    const antes = players.background().videos.length

    engine.nextBackground()
    clock.advance(FADE_MS / 2)
    expect(players.background().videos).toHaveLength(antes)

    clock.advance(FADE_MS / 2)
    expect(players.background().videos.at(-1)).toBe('bg-2')
  })

  it('o "Mix agora" chega ao player como um comando só, e o deck B toca', () => {
    comFundo('bg-1')
    engine.addBackground({ videoId: 'bg-2', title: 'Pads' })
    clock.advance(FADE_MS)

    engine.nextBackground()
    clock.advance(FADE_MS * 2)

    // O caso real: engatilhar e mandar tocar em seguida é uma corrida que o
    // YouTube perde — o deck A parava e o B nunca entrava. Tem que ser um
    // `load` só, e som de verdade no fim da rampa.
    expect(players.background().loads.at(-1)).toBe('bg-2')
    expect(engine.getSnapshot().error).toBeNull()
    expect(players.background().volume).toBeCloseTo(0.4, 2)
  })

  it('"voltar fundo" depois de parar volta a tocar, sem acusar link inválido', () => {
    comFundo('bg-1')
    clock.advance(FADE_MS)

    engine.toggleBackground()
    clock.advance(FADE_MS)
    engine.toggleBackground()
    clock.advance(FADE_MS)

    expect(engine.getSnapshot().error).toBeNull()
    expect(store.getState().mode).toBe('background')
    expect(players.background().volume).toBeCloseTo(0.4, 2)
  })

  it('com uma faixa só, o fim do vídeo reinicia a mesma (RF-03.6)', () => {
    comFundo('bg-1')
    clock.advance(FADE_MS)

    players.background().emitEnded()
    clock.advance(FADE_MS)

    expect(players.background().videos.at(-1)).toBe('bg-1')
    expect(players.background().volume).toBeCloseTo(0.4, 2)
  })

  it('fica engatilhado, não sai streamando por trás do louvor', () => {
    // O cenário é o fundo em standby: tem faixa escolhida, mas está desligado.
    comFundo('bg-1')
    engine.toggleBackground()
    clock.advance(FADE_MS)
    const desdeODesligamento = players.background().commands.length
    const ana = enfileirar('Ana', 'video-ana')

    engine.playQueueItem(ana)
    clock.advance(FADE_MS)

    // O player do fundo não recebe nada enquanto o louvor está no ar: dois
    // vídeos do YouTube ao mesmo tempo custam banda que o hotspot do celular
    // não tem, e a faixa voltaria no meio.
    expect(players.background().commands.slice(desdeODesligamento)).toEqual([])

    players.main().emitEnded()
    clock.advance(FADE_MS)

    // Só agora a faixa entra — e do começo, num comando só.
    expect(players.background().loads.at(-1)).toBe('bg-1')
    expect(players.background().volume).toBeCloseTo(0.4, 2)
  })

  it('trocar de faixa fora do ar não liga o som sozinho', () => {
    comFundo('bg-1')
    engine.addBackground({ videoId: 'bg-2', title: 'Pads' })
    engine.toggleBackground()
    clock.advance(FADE_MS)
    const antes = players.background().commands.length

    engine.selectBackground(
      store.getState().backgrounds.filter((b) => b.videoId === 'bg-2')[0].id,
    )
    clock.advance(FADE_MS)

    // O deck parado não recebe comando nenhum — trocar de disco não liga o som.
    expect(players.background().commands.slice(antes)).toEqual([])
    expect(players.background().volume).toBe(0)

    // E quando o operador liga o fundo, é a faixa nova que entra.
    engine.toggleBackground()
    clock.advance(FADE_MS)
    expect(players.background().loads.at(-1)).toBe('bg-2')
  })

  it('remover a última faixa da biblioteca derruba o fundo', () => {
    const bg = comFundo('bg-1')
    clock.advance(FADE_MS)

    engine.removeBackground(bg)
    clock.advance(FADE_MS)

    expect(store.getState().mode).toBe('silence')
    expect(players.background().volume).toBe(0)
  })
})

describe('erros do player (RNF-03.3)', () => {
  it('a falha do louvor aparece no instrumento, não some no console', () => {
    players.main().emitError(101, 'O dono deste vídeo não permite reprodução.')

    expect(engine.getSnapshot().error).toBe(
      'O dono deste vídeo não permite reprodução.',
    )
  })

  it('a falha do fundo diz que é do fundo', () => {
    players.background().emitError(100, 'Vídeo não encontrado.')

    expect(engine.getSnapshot().error).toBe('Fundo: Vídeo não encontrado.')
  })

  it('som saindo apaga o aviso antigo', () => {
    players.main().emitError(5, 'falhou')
    expect(engine.getSnapshot().error).toBeTruthy()

    const ana = enfileirar('Ana', 'video-ana')
    engine.playQueueItem(ana)

    expect(engine.getSnapshot().error).toBeNull()
  })
})

describe('player que não conseguiu nascer', () => {
  /**
   * Refaz o motor com um player do louvor que falha nas primeiras `quantas`
   * tentativas — o painel que abre sem rede, ou com o YouTube fora do ar.
   */
  async function comFalha(quantas: number): Promise<void> {
    engine.destroy()
    players = createFakeChannelFactory()
    players.falharProximas(quantas, 'Não foi possível carregar o player.')
    engine = createAudioEngine({
      store,
      scheduler: clock,
      createChannel: players.create,
    })
    engine.attachMain(document.createElement('div'))
    await Promise.resolve()
    await Promise.resolve()
  }

  it('a falha vira aviso na tela e marca o canal como recuperável', async () => {
    await comFalha(1)

    expect(engine.getSnapshot().error).toBe(
      'Não foi possível carregar o player.',
    )
    // É o que autoriza a tela a oferecer "tentar de novo" — um vídeo bloqueado
    // não ganharia esse botão.
    expect(engine.getSnapshot().playerDown).toBe(true)
  })

  it('tentar de novo refaz o player e apaga o aviso', async () => {
    await comFalha(1)

    engine.retryPlayers()
    await Promise.resolve()
    await Promise.resolve()

    expect(engine.getSnapshot().playerDown).toBe(false)
    expect(engine.getSnapshot().error).toBeNull()

    const ana = enfileirar('Ana', 'video-ana')
    engine.playQueueItem(ana)
    expect(players.main().loads).toEqual(['video-ana'])
  })

  it('o play do operador já é o pedido de nova tentativa — e o vídeo dele não se perde', async () => {
    await comFalha(1)
    const ana = enfileirar('Ana', 'video-ana')

    // Sem a nova tentativa, este canal ficaria morto até recarregar a página:
    // o botão responde, a topbar anuncia NO AR e não sai som nenhum.
    engine.playQueueItem(ana)
    await Promise.resolve()
    await Promise.resolve()
    clock.advance(FADE_MS)

    expect(players.main().loads).toEqual(['video-ana'])
    expect(players.main().volume).toBeCloseTo(0.8, 2)
    expect(engine.getSnapshot().playerDown).toBe(false)
  })

  it('com tudo de pé, tentar de novo não monta um segundo player', () => {
    const quantos = players.channels.length

    engine.retryPlayers()

    expect(players.channels).toHaveLength(quantos)
  })
})

describe('ajustes em tempo real', () => {
  it('mudar o fade nas configurações vale na próxima rampa (RF-04.12)', () => {
    const ana = enfileirar('Ana', 'video-ana')
    store.getState().setMainFadeMs(500)

    engine.playQueueItem(ana)
    clock.advance(500)

    expect(players.main().volume).toBeCloseTo(0.8, 2)
  })

  it('o snap-to-mute vale para o número guardado, não só para o som (RF-04.9)', () => {
    engine.setBackgroundFader(2)

    expect(store.getState().backgroundFader).toBe(0)
  })
})

describe('desmontar', () => {
  it('solta os players e o laço por quadro (RNF-04.2)', () => {
    const main = players.main()
    const background = players.background()

    engine.destroy()

    expect(main.destroyed).toBe(true)
    expect(background.destroyed).toBe(true)
    expect(clock.pending()).toBe(0)
  })
})

describe('a tela só muda quando o som acaba de sair (como o protótipo)', () => {
  it('parar mantém a pessoa no ar durante toda a descida', () => {
    comFundo()
    const ana = enfileirar('Ana', 'video-ana')
    engine.playQueueItem(ana)
    clock.advance(FADE_MS)

    engine.stopMain()

    // Metade do caminho: o volume já caiu, mas a tela ainda anuncia o louvor.
    clock.advance(FADE_MS / 2)
    expect(store.getState().currentId).toBe(ana)
    expect(store.getState().mode).toBe('main')
    expect(players.main().volume).toBeLessThan(0.8)
    expect(players.main().volume).toBeGreaterThan(0)

    // No fim da rampa, aí sim.
    clock.advance(FADE_MS / 2)
    expect(store.getState().currentId).toBeNull()
    expect(store.getState().mode).toBe('background')
  })

  it('pausar também espera a rampa terminar', () => {
    const ana = enfileirar('Ana', 'video-ana')
    engine.playQueueItem(ana)
    clock.advance(FADE_MS)

    engine.togglePlayPause()
    clock.advance(FADE_MS / 2)
    expect(store.getState().mode).toBe('main')

    clock.advance(FADE_MS / 2)
    expect(store.getState().mode).toBe('silence')
    expect(store.getState().currentId).toBe(ana)
  })

  it('desligar o fundo espera a rampa terminar', () => {
    comFundo()
    clock.advance(FADE_MS)

    engine.toggleBackground()
    clock.advance(FADE_MS / 2)
    expect(store.getState().mode).toBe('background')

    clock.advance(FADE_MS / 2)
    expect(store.getState().mode).toBe('silence')
  })

  it('arrepender-se no meio de um "parar" cancela tudo (RF-04.10)', () => {
    comFundo()
    const ana = enfileirar('Ana', 'video-ana')
    engine.playQueueItem(ana)
    clock.advance(FADE_MS)

    engine.stopMain()
    clock.advance(FADE_MS / 2)
    // O Espaço no meio da descida segura o louvor.
    engine.togglePlayPause()
    clock.advance(FADE_MS * 3)

    expect(store.getState().currentId).toBe(ana)
    expect(store.getState().mode).toBe('main')
    expect(players.main().volume).toBeCloseTo(0.8, 2)
    // E o fundo, que ia voltar, não voltou.
    expect(players.background().volume).toBe(0)
  })

  it('parar o que já está pausado devolve o fundo na hora', () => {
    comFundo()
    const ana = enfileirar('Ana', 'video-ana')
    engine.playQueueItem(ana)
    clock.advance(FADE_MS)
    engine.togglePlayPause()
    clock.advance(FADE_MS)
    expect(store.getState().mode).toBe('silence')

    // Não há rampa para esperar: sem tratar este caso, o fundo nunca voltaria.
    engine.stopMain()
    clock.advance(FADE_MS)

    expect(store.getState().currentId).toBeNull()
    expect(store.getState().mode).toBe('background')
    expect(players.background().volume).toBeCloseTo(0.4, 2)
  })
})
