import { createAudioEngine } from './engine'
import type { AudioEngine } from './engine'
import { createCronoStore } from '../../store'
import type { CronoStore } from '../../store'
import { createFakeChannelFactory } from '../../test/fake-channel'
import type { FakeChannelFactory } from '../../test/fake-channel'
import { createFakeLocalChannelFactory } from '../../test/fake-local-channel'
import type { FakeLocalChannelFactory } from '../../test/fake-local-channel'
import { createFakeScheduler } from '../../test/fake-scheduler'
import type { FakeScheduler } from '../../test/fake-scheduler'
import {
  createMemoryBlobVault,
  createMemoryStorage,
} from '../../test/memory-storage'
import type { MemoryBlobVault } from '../../test/memory-storage'

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
let locais: FakeLocalChannelFactory
let cofre: MemoryBlobVault
let clock: FakeScheduler
let engine: AudioEngine

/** As opções que todo motor destes testes recebe — tudo em memória. */
function opcoes() {
  return {
    store,
    scheduler: clock,
    createChannel: players.create,
    createLocalChannel: locais.create,
    blobs: cofre.vault,
    resolveBlobUrl: cofre.resolveUrl,
    revokeBlobUrl: cofre.revokeUrl,
  }
}

beforeEach(async () => {
  const { storage } = createMemoryStorage()
  store = createCronoStore({ storage, legacyStorage: null })
  players = createFakeChannelFactory()
  locais = createFakeLocalChannelFactory()
  cofre = createMemoryBlobVault()
  clock = createFakeScheduler()
  engine = createAudioEngine(opcoes())

  engine.attachMain(document.createElement('div'))
  engine.attachBackground(document.createElement('div'))
  // Os players nascem numa promessa.
  await Promise.resolve()
  await Promise.resolve()
})

afterEach(() => {
  engine.destroy()
})

/**
 * Deixa as promessas em dia: gravar no cofre, resolver a object URL e a
 * varredura de órfãos são todos assíncronos, e nenhum deles depende do relógio.
 */
async function assentar(): Promise<void> {
  for (let i = 0; i < 5; i += 1) await Promise.resolve()
}

function enfileirar(name: string, videoId: string): string {
  return store
    .getState()
    .addToQueue({ kind: 'youtube', name, videoId, title: `${name} canta` })
}

function comFundo(videoId = 'bg-1'): string {
  return engine.addBackground({
    kind: 'youtube',
    videoId,
    title: 'Piano worship',
  })
}

/** Um arquivo escolhido no seletor do sistema. */
function arquivo(nome: string, type = 'audio/mpeg'): File {
  return new File(['bytes-de-som'], nome, { type })
}

/** O item local da fila, já estreitado — falha alto se não for local. */
function itemLocal(index = 0): { id: string; blobId: string } {
  const item = store.getState().queue[index]
  if (item?.kind !== 'local') throw new Error('esperava um item local na fila')
  return { id: item.id, blobId: item.blobId }
}

/** Um áudio que já estava no cofre — o arquivo importado num culto anterior. */
function comBytes(blobId: string): string {
  cofre.guardados.set(blobId, new Blob(['bytes-de-som']))
  return blobId
}

function enfileirarLocal(name: string, blobId: string): string {
  comBytes(blobId)
  return store.getState().addToQueue({
    kind: 'local',
    name,
    blobId,
    fileName: `${blobId}.mp3`,
    title: `${blobId}.mp3`,
  })
}

function comFundoLocal(blobId = 'bg-local'): string {
  comBytes(blobId)
  return engine.addBackground({
    kind: 'local',
    blobId,
    fileName: `${blobId}.mp3`,
    title: `${blobId}.mp3`,
  })
}

/**
 * A object URL que o cofre entregou para aquele áudio.
 *
 * Vem da lista de URLs vivas, e não de uma fórmula repetida no teste: se a
 * costura não tiver criado a URL, isto falha aqui — antes de a asserção seguinte
 * comparar dois `undefined` e passar por engano.
 */
function urlDe(blobId: string): string {
  const url = cofre.urlsVivas().find((viva) => viva.includes(blobId))
  if (!url) throw new Error(`nenhuma object URL viva para "${blobId}"`)
  return url
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
    engine.addBackground({ kind: 'youtube', videoId: 'bg-2', title: 'Pads' })
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
    engine.addBackground({ kind: 'youtube', videoId: 'bg-2', title: 'Pads' })
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
    engine.addBackground({ kind: 'youtube', videoId: 'bg-2', title: 'Pads' })
    engine.toggleBackground()
    clock.advance(FADE_MS)
    const antes = players.background().commands.length

    engine.selectBackground(
      store
        .getState()
        .backgrounds.filter(
          (b) => b.kind === 'youtube' && b.videoId === 'bg-2',
        )[0].id,
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

/**
 * O roteamento entre os dois backends — a parte de maior risco da feature.
 *
 * Este bloco veio da implementação paralela da Etapa 4 (commit `e9321cf`), que
 * se perdeu num merge mal resolvido junto com estes testes. Foram adaptados aos
 * dublês desta suíte; o que eles cobrem é o que nenhum outro teste cobria: o
 * canal trocando de voz no meio do culto.
 */
describe('áudio local na fila (RF-11)', () => {
  it('toca pelo backend local, não pelo iframe, e sobe com fade (RF-11.4)', async () => {
    const ana = enfileirarLocal('Ana', 'blob-ana')

    engine.playQueueItem(ana)
    // A URL do blob chega numa microtarefa; sem ela o backend não recebeu nada.
    await assentar()

    expect(locais.main().loads).toEqual([urlDe('blob-ana')])
    // O iframe do louvor não recebeu nada: quem toca é o `<audio>`.
    expect(players.main().loads).toEqual([])
    expect(locais.main().volume).toBe(0)

    clock.advance(FADE_MS)
    expect(locais.main().volume).toBeCloseTo(0.8, 2)
    expect(store.getState().mode).toBe('main')
  })

  it('o blob que sumiu do cofre vira erro visível, não silêncio (RF-11.6)', async () => {
    // O arquivo não é semeado no cofre: é o item que sobreviveu ao áudio.
    const ana = store.getState().addToQueue({
      kind: 'local',
      name: 'Ana',
      blobId: 'blob-sumido',
      fileName: 'blob-sumido.mp3',
      title: 'blob-sumido.mp3',
    })

    engine.playQueueItem(ana)
    await assentar()

    expect(engine.getSnapshot().error).toMatch(/não encontrado/i)
    // Não tocou nada: sem arquivo, não há o que tocar.
    expect(locais.main().loads).toEqual([])
  })

  it('o erro do fundo local diz que é do fundo', async () => {
    comFundoLocal('bg-local')
    await assentar()

    locais.background().emitError(-1)

    expect(engine.getSnapshot().error).toBe(
      'Fundo: Arquivo de áudio não encontrado — pode ter sido removido do dispositivo. Reimporte-o.',
    )
  })
})

describe('fila e fundo misturados (RF-11.4)', () => {
  it('trocar de YouTube para local desce um e sobe o outro, pausando o iframe', async () => {
    const ana = enfileirar('Ana', 'video-ana')
    const bruno = enfileirarLocal('Bruno', 'blob-bruno')
    engine.playQueueItem(ana)
    clock.advance(FADE_MS)
    expect(players.main().volume).toBeCloseTo(0.8, 2)

    engine.playQueueItem(bruno)
    // No meio da descida, o vídeo ainda está no ar e a fila aponta para a Ana.
    clock.advance(FADE_MS / 2)
    expect(store.getState().currentId).toBe(ana)
    // O backend local nem nasceu ainda: só nasce quando a troca chega ao fundo.
    expect(locais.channels).toHaveLength(0)

    // No fundo do poço, o iframe é pausado e a faixa local entra.
    clock.advance(FADE_MS / 2)
    await assentar()
    expect(players.main().commands).toContain('pause')
    expect(locais.main().loads).toEqual([urlDe('blob-bruno')])
    expect(store.getState().currentId).toBe(bruno)

    clock.advance(FADE_MS)
    expect(locais.main().volume).toBeCloseTo(0.8, 2)
  })

  it('trocar de local para YouTube faz o inverso, pausando o `<audio>`', async () => {
    const ana = enfileirarLocal('Ana', 'blob-ana')
    const bruno = enfileirar('Bruno', 'video-bruno')
    engine.playQueueItem(ana)
    await assentar()
    clock.advance(FADE_MS)
    expect(locais.main().volume).toBeCloseTo(0.8, 2)

    engine.playQueueItem(bruno)
    clock.advance(FADE_MS)
    // No fundo do poço o `<audio>` é pausado e o vídeo entra pelo iframe.
    expect(locais.main().commands).toContain('pause')
    expect(players.main().loads).toEqual(['video-bruno'])

    clock.advance(FADE_MS)
    expect(players.main().volume).toBeCloseTo(0.8, 2)
  })

  it('crossfade misto: louvor local sobe enquanto o fundo do YouTube desce (RF-04.5)', async () => {
    comFundo('bg-1')
    const ana = enfileirarLocal('Ana', 'blob-ana')
    clock.advance(FADE_MS)
    expect(players.background().volume).toBeCloseTo(0.4, 2)

    engine.playQueueItem(ana)
    await assentar()
    clock.advance(FADE_MS / 2)

    // Os dois soam ao mesmo tempo, em backends diferentes: o `<audio>` subindo,
    // o iframe descendo — e o fundo continua tocando durante a descida.
    expect(locais.main().volume).toBeGreaterThan(0)
    expect(players.background().volume).toBeGreaterThan(0)
    expect(players.background().volume).toBeLessThan(0.4)
    expect(players.background().commands).not.toContain('pause')
  })
})

describe('fundo local (RF-11.2)', () => {
  it('com uma faixa local só, o fim reinicia a mesma (RF-03.6)', async () => {
    comFundoLocal('bg-local')
    await assentar()
    clock.advance(FADE_MS)

    locais.background().emitEnded()
    await assentar()
    clock.advance(FADE_MS)

    // Entrou de novo, do começo: dois `load` da mesma faixa.
    expect(locais.background().loads).toHaveLength(2)
    expect(locais.background().volume).toBeCloseTo(0.4, 2)
  })

  it('mistura fontes: um fundo do YouTube e um local convivem na biblioteca', async () => {
    comFundo('bg-1')
    comFundoLocal('bg-local')
    clock.advance(FADE_MS)

    // "Mix agora" troca do fundo do YouTube para o local, com fade.
    engine.nextBackground()
    clock.advance(FADE_MS)
    await assentar()
    clock.advance(FADE_MS)

    expect(locais.background().loads.at(-1)).toBe(urlDe('bg-local'))
    expect(locais.background().volume).toBeCloseTo(0.4, 2)
    // E o iframe do fundo foi silenciado ao ceder a voz do canal.
    expect(players.background().commands).toContain('pause')
  })
})

describe('cargas locais canceladas no meio', () => {
  it('a carga pendente cancelada não engole o transporte do próximo item', async () => {
    // O cenário do bug: remover um item local a meio de resolver deixava um
    // pedido pendente órfão, e a partir daí todo play/pause do canal era
    // engolido — o vídeo seguinte nunca pausava, só ficava mudo tocando.
    const ana = enfileirarLocal('Ana', 'blob-ana')
    const bruno = enfileirar('Bruno', 'video-bruno')
    engine.playQueueItem(ana)
    engine.removeFromQueue(ana)
    await assentar()

    engine.playQueueItem(bruno)
    clock.advance(FADE_MS)
    expect(players.main().volume).toBeCloseTo(0.8, 2)

    // O Espaço tem que chegar ao player: pausa de verdade, não só mudo.
    engine.togglePlayPause()
    clock.advance(FADE_MS)
    expect(players.main().commands).toContain('pause')
    expect(players.main().volume).toBe(0)
  })

  it('parar cancela a resolução local em voo — a faixa parada não toca', async () => {
    const ana = enfileirarLocal('Ana', 'blob-ana')
    // Toca e para antes de a URL chegar: a faixa não pode entrar na saída.
    engine.playQueueItem(ana)
    engine.stopMain()
    await assentar()

    expect(locais.main().loads).toEqual([])
    // Mas a faixa fica **engatilhada**, não descartada: se o operador se
    // arrepender no meio da descida (RF-04.10), o `play` entra na hora, sem
    // esperar o disco de novo. Uma object URL viva por canal é o preço, e é o
    // mesmo teto de sempre.
    expect(locais.main().cues).toHaveLength(1)
    expect(cofre.urlsVivas()).toHaveLength(1)
  })

  it('e o arrependimento no meio da descida ainda toca a faixa (RF-04.10)', async () => {
    const ana = enfileirarLocal('Ana', 'blob-ana')
    engine.playQueueItem(ana)
    // O disco demora: a rampa sobe inteira antes de a URL chegar.
    clock.advance(FADE_MS)
    engine.stopMain()
    await assentar()
    clock.advance(FADE_MS / 2)

    // O Espaço no meio da saída segura o louvor — e a faixa engatilhada entra.
    engine.togglePlayPause()
    clock.advance(FADE_MS)

    expect(store.getState().mode).toBe('main')
    expect(locais.main().commands).toContain('play')
    expect(locais.main().volume).toBeCloseTo(0.8, 2)
  })
})

describe('importar áudio do PC (RF-11.1 e RF-11.2)', () => {
  it('grava os bytes e cria o item apontando para eles', async () => {
    await engine.importQueueFiles([arquivo('Grandes Coisas.mp3')], 'Ana')

    expect(store.getState().queue[0]).toMatchObject({
      kind: 'local',
      name: 'Ana',
      // Sem oEmbed no caminho: o título já vem pronto no nome do arquivo.
      title: 'Grandes Coisas.mp3',
      fileName: 'Grandes Coisas.mp3',
    })
    expect(cofre.guardados.has(itemLocal().blobId)).toBe(true)
  })

  it('o mesmo nome vale para todos os arquivos da mesma escolha', async () => {
    await engine.importQueueFiles(
      [arquivo('parte-1.mp3'), arquivo('parte-2.mp3')],
      'Coral',
    )

    expect(store.getState().queue.map((item) => item.name)).toEqual([
      'Coral',
      'Coral',
    ])
    expect(cofre.guardados.size).toBe(2)
  })

  it('sem espaço no dispositivo, a falha vira frase na tela — e nada entra na fila', async () => {
    cofre.falharProximaGravacao(new DOMException('quota', 'QuotaExceededError'))

    await engine.importQueueFiles([arquivo('louvor.mp3')], 'Ana')

    // O pior desfecho seria o silencioso: o item na tela sem áudio por trás.
    expect(store.getState().queue).toHaveLength(0)
    expect(engine.getSnapshot().error).toContain('Não há espaço no navegador')
    expect(engine.getSnapshot().error).toContain('louvor.mp3')
  })

  it('recusa o que não é áudio sem sequer abrir o cofre', async () => {
    await engine.importQueueFiles([arquivo('slides.pdf', 'application/pdf')])

    expect(store.getState().queue).toHaveLength(0)
    expect(cofre.guardados.size).toBe(0)
    expect(engine.getSnapshot().error).toContain('slides.pdf')
  })

  it('um arquivo recusado no meio não impede os outros', async () => {
    await engine.importQueueFiles([
      arquivo('ok-1.mp3'),
      arquivo('leia-me.txt', 'text/plain'),
      arquivo('ok-2.mp3'),
    ])

    expect(store.getState().queue.map((item) => item.title)).toEqual([
      'ok-1.mp3',
      'ok-2.mp3',
    ])
  })

  it('o fundo importado entra na biblioteca e a primeira faixa já toca (RF-03.4)', async () => {
    await engine.importBackgroundFiles([arquivo('pads.mp3')])
    await assentar()

    expect(store.getState().backgrounds[0]).toMatchObject({
      kind: 'local',
      title: 'pads.mp3',
    })
    expect(store.getState().mode).toBe('background')

    clock.advance(FADE_MS)
    // Som de verdade saindo pelo backend local, no volume do fader do fundo.
    expect(locais.background().loads).toHaveLength(1)
    expect(locais.background().volume).toBeCloseTo(0.4, 2)
  })
})

describe('limpeza de órfãos (RF-11.5)', () => {
  it('remover o item da fila apaga os bytes junto', async () => {
    await engine.importQueueFiles([arquivo('louvor.mp3')], 'Ana')
    const { id } = itemLocal()

    engine.removeFromQueue(id)
    await assentar()

    expect(cofre.guardados.size).toBe(0)
  })

  it('remover a faixa da biblioteca apaga os bytes junto', async () => {
    await engine.importBackgroundFiles([arquivo('pads.mp3')])
    await assentar()
    const track = store.getState().backgrounds[0]

    engine.removeBackground(track.id)
    await assentar()

    expect(cofre.guardados.size).toBe(0)
  })

  it('mas não apaga o arquivo que ainda tem outro dono', async () => {
    // O mesmo áudio na fila e nos fundos — o que um backup restaurado produz.
    const blobId = 'ab_compartilhado'
    cofre.guardados.set(blobId, new Blob(['som']))
    const id = store.getState().addToQueue({
      kind: 'local',
      name: 'Ana',
      title: 'tema.mp3',
      blobId,
      fileName: 'tema.mp3',
    })
    store.getState().addBackground({
      kind: 'local',
      title: 'tema.mp3',
      blobId,
      fileName: 'tema.mp3',
    })

    engine.removeFromQueue(id)
    await assentar()

    // Apagar aqui deixaria o fundo mudo por causa de uma remoção na fila.
    expect(cofre.guardados.has(blobId)).toBe(true)
  })

  it('a abertura varre os bytes que ninguém referencia mais', async () => {
    cofre.guardados.set('ab_orfao', new Blob(['som']))
    cofre.guardados.set('ab_com_dono', new Blob(['som']))
    store.getState().addToQueue({
      kind: 'local',
      name: 'Ana',
      title: 'tema.mp3',
      blobId: 'ab_com_dono',
      fileName: 'tema.mp3',
    })

    // Um motor novo sobre o mesmo store é exatamente o que abrir o app faz.
    const outro = createAudioEngine(opcoes())
    await assentar()

    expect([...cofre.guardados.keys()]).toEqual(['ab_com_dono'])
    outro.destroy()
  })

  it('a varredura não leva junto o arquivo que está sendo importado agora', async () => {
    // A janela é real em produção: a varredura espera a hidratação do
    // IndexedDB, que pode terminar depois de o operador já ter clicado em
    // importar. Os dois portões reproduzem exatamente essa sobreposição — a
    // varredura lista **depois** de os bytes entrarem no cofre e **antes** de o
    // item existir no store.
    const soltarGravacao = cofre.travarGravacao()
    const soltarListagem = cofre.travarListagem()
    const outro = createAudioEngine(opcoes())

    const importando = outro.importQueueFiles([arquivo('louvor.mp3')], 'Ana')
    await assentar()
    // Neste instante: bytes no cofre, item nenhum na fila.
    expect(cofre.guardados.size).toBe(1)
    expect(store.getState().queue).toHaveLength(0)

    soltarListagem()
    await assentar()
    soltarGravacao()
    await importando
    await assentar()

    // Sem a proteção, a varredura teria apagado o que o operador acabou de
    // escolher — e sobraria um item na fila sem áudio por trás.
    expect(cofre.guardados.size).toBe(1)
    expect(store.getState().queue).toHaveLength(1)
    outro.destroy()
  })

  it('trocar o estado inteiro (backup importado) recolhe os áudios do estado antigo', async () => {
    await engine.importQueueFiles([arquivo('do-culto-passado.mp3')], 'Ana')
    expect(cofre.guardados.size).toBe(1)

    // É o que o botão "Importar JSON" faz: substitui fila e biblioteca de uma
    // vez, e todos os áudios da instalação anterior perdem o dono juntos.
    store.getState().importState({
      ...store.getState().exportState(),
      queue: [],
      backgrounds: [],
    })
    engine.sweepOrphanAudio()
    await assentar()

    expect(cofre.guardados.size).toBe(0)
  })
})

describe('o ciclo de vida da object URL (RNF-04.2)', () => {
  it('trocar de arquivo revoga a URL do anterior', async () => {
    await engine.importQueueFiles(
      [arquivo('primeira.mp3'), arquivo('segunda.mp3')],
      'Ana',
    )
    const primeira = itemLocal(0)
    const segunda = itemLocal(1)

    engine.playQueueItem(primeira.id)
    await assentar()
    expect(cofre.urlsVivas()).toHaveLength(1)

    engine.playQueueItem(segunda.id)
    clock.advance(FADE_MS)
    await assentar()

    // Uma por canal, sempre: a URL segura o Blob inteiro em memória, e num
    // culto de duas horas isso seria a lista de arquivos toda viva ao mesmo
    // tempo.
    expect(cofre.urlsVivas()).toHaveLength(1)
  })

  it('desmontar o motor não deixa URL viva nenhuma', async () => {
    await engine.importBackgroundFiles([arquivo('pads.mp3')])
    await engine.importQueueFiles([arquivo('louvor.mp3')], 'Ana')
    engine.playQueueItem(itemLocal().id)
    await assentar()
    expect(cofre.urlsVivas().length).toBeGreaterThan(0)

    engine.destroy()
    await assentar()

    expect(cofre.urlsVivas()).toEqual([])
  })

  it('a resolução ultrapassada por outra não deixa a URL dela para trás', async () => {
    await engine.importQueueFiles(
      [arquivo('primeira.mp3'), arquivo('segunda.mp3')],
      'Ana',
    )

    // Duas cargas no mesmo canal sem deixar a primeira terminar: a resolução
    // velha chega depois e tem que se descartar revogando o que criou.
    engine.playQueueItem(itemLocal(0).id)
    engine.playQueueItem(itemLocal(1).id)
    clock.advance(FADE_MS)
    await assentar()

    expect(cofre.urlsVivas()).toHaveLength(1)
  })
})

describe('o arquivo que some do cofre (RF-11.5)', () => {
  it('avisa o operador em vez de tocar a faixa anterior', async () => {
    await engine.importBackgroundFiles([arquivo('primeira.mp3')])
    await assentar()
    clock.advance(FADE_MS)

    // A segunda faixa entra na biblioteca, mas os bytes dela somem do cofre —
    // eviction do Chrome, backup restaurado de outro PC, arquivo apagado.
    await engine.importBackgroundFiles([arquivo('sumida.mp3')])
    await assentar()
    const sumida = store.getState().backgrounds[1]
    if (sumida.kind !== 'local') throw new Error('esperava fundo local')
    cofre.guardados.delete(sumida.blobId)

    const cargasAntes = locais.background().loads.length
    engine.selectBackground(sumida.id)
    clock.advance(FADE_MS)
    await assentar()

    expect(engine.getSnapshot().error).toContain('não encontrado')
    // A URL da faixa anterior não fica pendurada num canal que perdeu a voz.
    expect(cofre.urlsVivas()).toEqual([])

    // E o pedido de tocar não pode ressuscitar a faixa anterior: a tela mostra
    // a segunda, e som da primeira aqui seria a tela mentindo.
    const antes = locais.background().commands.length
    engine.toggleBackground()
    clock.advance(FADE_MS)
    await assentar()

    expect(locais.background().commands.slice(antes)).not.toContain('play')
    expect(locais.background().loads).toHaveLength(cargasAntes)
  })
})

describe('o arquivo que termina sozinho', () => {
  it('vai para o histórico e leva os bytes junto (RF-11.5)', async () => {
    comFundo()
    await engine.importQueueFiles([arquivo('louvor.mp3')], 'Ana')
    engine.playQueueItem(itemLocal().id)
    await assentar()
    clock.advance(FADE_MS)

    locais.main().emitEnded()
    clock.advance(FADE_MS)
    await assentar()

    expect(store.getState().queue).toHaveLength(0)
    expect(store.getState().history.map((h) => h.name)).toEqual(['Ana'])
    expect(store.getState().mode).toBe('background')
    // O histórico não guarda `blobId` nem toca de novo: esses bytes não têm
    // mais dono, e um culto inteiro deles encheria a quota do dispositivo.
    expect(cofre.guardados.size).toBe(0)
  })
})

describe('o fader gravado no disco tem que chegar ao som', () => {
  /**
   * O motor nasce **antes** de o IndexedDB responder: nesse instante o store
   * ainda tem os faders padrão (80/40), e é com eles que o mixer é criado.
   * Quando o disco chega, o store é atualizado — e o mixer precisa ficar
   * sabendo, senão o número na tela e o volume no ar discordam até alguém
   * tocar no fader.
   *
   * `store.getState().setXFader` é exatamente o que a hidratação faz: escreve
   * no store por fora do motor.
   */
  it('o fundo volta no volume que o fader mostra (RF-05.1)', () => {
    comFundo()
    const ana = enfileirar('Ana', 'video-ana')
    engine.playQueueItem(ana)
    clock.advance(FADE_MS)

    store.getState().setBackgroundFader(25)

    engine.stopMain()
    clock.advance(FADE_MS * 3)

    expect(store.getState().backgroundFader).toBe(25)
    expect(players.background().volume).toBeCloseTo(0.25, 2)
  })

  it('e o louvor entra no volume do master (RF-04.8)', () => {
    const ana = enfileirar('Ana', 'video-ana')

    store.getState().setMainFader(55)

    engine.playQueueItem(ana)
    clock.advance(FADE_MS * 2)

    expect(players.main().volume).toBeCloseTo(0.55, 2)
  })
})
