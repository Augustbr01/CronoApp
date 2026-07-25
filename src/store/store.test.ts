import { createCronoStore } from './index'
import type { CronoStore } from './index'
import { createMemoryStorage } from '../test/memory-storage'

/**
 * As regras de culto — o coração do domínio.
 *
 * Nenhum teste aqui toca IndexedDB nem áudio: são as decisões que o app toma
 * quando o operador aperta um botão. É o que o plano da Etapa 3 pede para travar
 * com teste, porque são regras validadas no protótipo e fáceis de quebrar sem
 * perceber.
 */

let store: CronoStore

beforeEach(() => {
  const { storage } = createMemoryStorage()
  store = createCronoStore({ storage, legacyStorage: null })
})

/** Atalho: adiciona alguém à fila e devolve o id. */
function enfileirar(name: string, videoId = 'abc123'): string {
  return store
    .getState()
    .addToQueue({ kind: 'youtube', name, videoId, title: `${name} canta` })
}

function adicionarFundo(title = 'Piano worship'): string {
  return store
    .getState()
    .addBackground({ kind: 'youtube', videoId: `bg-${title}`, title })
}

describe('fila (RF-01)', () => {
  it('adiciona ao fim e usa "Convidado" quando o nome vem vazio', () => {
    enfileirar('Ana')
    const id = store.getState().addToQueue({
      kind: 'youtube',
      name: '   ',
      videoId: 'xyz',
      title: 'Música',
    })

    const { queue } = store.getState()
    expect(queue).toHaveLength(2)
    expect(queue[1]?.id).toBe(id)
    expect(queue[1]?.name).toBe('Convidado')
  })

  it('toca qualquer item, não só o primeiro (RF-01.7)', () => {
    enfileirar('Ana')
    const bruno = enfileirar('Bruno')
    enfileirar('Carla')

    store.getState().play(bruno)

    expect(store.getState().currentId).toBe(bruno)
    expect(store.getState().mode).toBe('main')
  })

  it('ignora o pedido de tocar um item que não está na fila', () => {
    store.getState().play('id-que-nao-existe')

    expect(store.getState().currentId).toBeNull()
    expect(store.getState().mode).toBe('silence')
  })

  it('renomeia inline, mas recusa nome vazio (RF-01.5)', () => {
    const ana = enfileirar('Ana')

    store.getState().renameQueueItem(ana, '  Ana Paula  ')
    expect(store.getState().queue[0]?.name).toBe('Ana Paula')

    store.getState().renameQueueItem(ana, '   ')
    expect(store.getState().queue[0]?.name).toBe('Ana Paula')
  })

  it('reordena por arrastar e soltar (RF-01.4)', () => {
    enfileirar('Ana')
    enfileirar('Bruno')
    enfileirar('Carla')

    store.getState().reorderQueue(2, 0)

    expect(store.getState().queue.map((i) => i.name)).toEqual([
      'Carla',
      'Ana',
      'Bruno',
    ])
  })

  it('ignora reordenação fora dos limites em vez de embaralhar a fila', () => {
    enfileirar('Ana')
    enfileirar('Bruno')

    store.getState().reorderQueue(0, 9)
    store.getState().reorderQueue(-1, 0)

    expect(store.getState().queue.map((i) => i.name)).toEqual(['Ana', 'Bruno'])
  })

  it('tirar da fila quem está no ar também tira do ar', () => {
    const ana = enfileirar('Ana')
    store.getState().play(ana)

    store.getState().removeFromQueue(ana)

    expect(store.getState().queue).toHaveLength(0)
    expect(store.getState().currentId).toBeNull()
    expect(store.getState().mode).toBe('silence')
  })

  it('tirar outro da fila não interrompe quem está cantando', () => {
    const ana = enfileirar('Ana')
    const bruno = enfileirar('Bruno')
    store.getState().play(ana)

    store.getState().removeFromQueue(bruno)

    expect(store.getState().currentId).toBe(ana)
    expect(store.getState().mode).toBe('main')
  })

  it('o atalho "próxima" pula quem já está no ar', () => {
    const ana = enfileirar('Ana')
    const bruno = enfileirar('Bruno')
    store.getState().play(ana)

    store.getState().playNext()

    expect(store.getState().currentId).toBe(bruno)
  })
})

describe('áudio local na fila e nos fundos (RF-11)', () => {
  it('cria um item de fila a partir de um arquivo importado', () => {
    const id = store.getState().addToQueue({
      kind: 'local',
      name: 'Ana',
      title: 'louvor.mp3',
      blobId: 'blob-1',
      fileName: 'louvor.mp3',
    })

    expect(store.getState().findQueueItem(id)).toMatchObject({
      kind: 'local',
      blobId: 'blob-1',
      fileName: 'louvor.mp3',
    })
  })

  it('cria uma faixa de fundo a partir de um arquivo importado', () => {
    const id = store.getState().addBackground({
      kind: 'local',
      title: 'coletânea.mp3',
      blobId: 'blob-2',
      fileName: 'coletânea.mp3',
    })

    expect(store.getState().backgrounds.find((b) => b.id === id)).toMatchObject(
      {
        kind: 'local',
        blobId: 'blob-2',
        fileName: 'coletânea.mp3',
      },
    )
  })
})

describe('histórico (RF-06)', () => {
  it('ao terminar, sai da fila e entra em "já cantaram" (RF-06.1)', () => {
    const ana = enfileirar('Ana')
    store.getState().play(ana)

    store.getState().finish()

    const { queue, history, currentId } = store.getState()
    expect(queue).toHaveLength(0)
    expect(history).toHaveLength(1)
    expect(history[0]?.name).toBe('Ana')
    expect(history[0]?.title).toBe('Ana canta')
    expect(history[0]?.finishedAt).toBeGreaterThan(0)
    expect(currentId).toBeNull()
  })

  it('parar não é terminar: o item continua na fila', () => {
    const ana = enfileirar('Ana')
    store.getState().play(ana)

    store.getState().stop()

    expect(store.getState().queue).toHaveLength(1)
    expect(store.getState().history).toHaveLength(0)
  })

  it('agrupa o histórico por culto (RF-06.2)', () => {
    const ana = enfileirar('Ana')
    store.getState().play(ana)
    store.getState().finish()

    store.getState().startNewSession()

    const bruno = enfileirar('Bruno')
    store.getState().play(bruno)
    store.getState().finish()

    const sessoes = store.getState().historyBySession()
    expect(sessoes).toHaveLength(2)
    expect(sessoes[0]?.entries.map((e) => e.name)).toEqual(['Bruno'])
    expect(sessoes[1]?.entries.map((e) => e.name)).toEqual(['Ana'])
  })

  it('guarda muito mais que as 8 entradas do protótipo', () => {
    for (let i = 0; i < 40; i += 1) {
      const id = enfileirar(`Pessoa ${i}`)
      store.getState().play(id)
      store.getState().finish()
    }

    expect(store.getState().history).toHaveLength(40)
  })
})

describe('fundos (RF-03)', () => {
  it('a primeira faixa da biblioteca vazia entra selecionada e já toca (RF-03.4)', () => {
    const id = adicionarFundo()

    expect(store.getState().selectedBackgroundId).toBe(id)
    expect(store.getState().mode).toBe('background')
  })

  it('...mas não atropela o louvor que está no ar (RF-03.4)', () => {
    const ana = enfileirar('Ana')
    store.getState().play(ana)

    const id = adicionarFundo()

    // Selecionada, sim — no ar, não. O louvor continua.
    expect(store.getState().selectedBackgroundId).toBe(id)
    expect(store.getState().mode).toBe('main')
    expect(store.getState().currentId).toBe(ana)
  })

  it('a segunda faixa entra sem mexer na seleção', () => {
    const primeiro = adicionarFundo('Piano')
    adicionarFundo('Harpa')

    expect(store.getState().selectedBackgroundId).toBe(primeiro)
    expect(store.getState().backgrounds).toHaveLength(2)
  })

  it('remover a última faixa derruba o fundo para standby', () => {
    const id = adicionarFundo()
    expect(store.getState().mode).toBe('background')

    store.getState().removeBackground(id)

    expect(store.getState().backgrounds).toHaveLength(0)
    expect(store.getState().selectedBackgroundId).toBeNull()
    expect(store.getState().mode).toBe('silence')
  })

  it('remover a faixa selecionada passa a vez para outra', () => {
    const piano = adicionarFundo('Piano')
    adicionarFundo('Harpa')

    store.getState().removeBackground(piano)

    expect(store.getState().selectedBackgroundId).not.toBeNull()
    expect(store.getState().selectedBackground()?.title).toBe('Harpa')
    expect(store.getState().mode).toBe('background')
  })

  it('remover uma faixa que não está selecionada não muda a seleção', () => {
    const piano = adicionarFundo('Piano')
    const harpa = adicionarFundo('Harpa')

    store.getState().removeBackground(harpa)

    expect(store.getState().selectedBackgroundId).toBe(piano)
  })

  it('avança para a próxima faixa e dá a volta no fim (RF-03.5)', () => {
    adicionarFundo('Piano')
    adicionarFundo('Harpa')

    store.getState().nextBackground()
    expect(store.getState().selectedBackground()?.title).toBe('Harpa')

    store.getState().nextBackground()
    expect(store.getState().selectedBackground()?.title).toBe('Piano')
  })

  it('com uma faixa só, "mixar" reinicia a mesma (RF-03.6)', () => {
    const id = adicionarFundo('Piano')
    const cueAntes = store.getState().backgroundCue

    store.getState().nextBackground()

    // A seleção não muda — é o cue que sobe, avisando que é para recomeçar.
    expect(store.getState().selectedBackgroundId).toBe(id)
    expect(store.getState().backgroundCue).toBe(cueAntes + 1)
  })

  it('não deixa selecionar uma faixa que não está na biblioteca', () => {
    const id = adicionarFundo('Piano')

    store.getState().selectBackground('bg-fantasma')

    expect(store.getState().selectedBackgroundId).toBe(id)
  })
})

describe('modos e retorno do fundo (RF-04.1 e RF-04.11)', () => {
  it('começa em standby', () => {
    expect(store.getState().mode).toBe('silence')
    expect(store.getState().currentId).toBeNull()
  })

  it('ao terminar o louvor, o fundo volta sozinho', () => {
    adicionarFundo()
    const ana = enfileirar('Ana')
    store.getState().play(ana)
    expect(store.getState().mode).toBe('main')

    store.getState().finish()

    expect(store.getState().mode).toBe('background')
  })

  it('com o retorno desligado, termina em standby (momento de oração)', () => {
    adicionarFundo()
    store.getState().setAutoReturnBackground(false)
    const ana = enfileirar('Ana')
    store.getState().play(ana)

    store.getState().finish()

    expect(store.getState().mode).toBe('silence')
  })

  it('sem fundo escolhido, não há para onde voltar', () => {
    const ana = enfileirar('Ana')
    store.getState().play(ana)

    store.getState().finish()

    expect(store.getState().mode).toBe('silence')
  })

  it('não põe o fundo no ar quando não há faixa escolhida', () => {
    store.getState().playBackground()

    expect(store.getState().mode).toBe('silence')
  })

  it('o standby tira tudo do ar', () => {
    const ana = enfileirar('Ana')
    store.getState().play(ana)

    store.getState().silence()

    expect(store.getState().mode).toBe('silence')
    expect(store.getState().currentId).toBeNull()
  })
})

describe('faders e preferências (RF-05 e RF-08)', () => {
  it('prende os faders na escala 0–100', () => {
    store.getState().setMainFader(150)
    expect(store.getState().mainFader).toBe(100)

    store.getState().setBackgroundFader(-20)
    expect(store.getState().backgroundFader).toBe(0)
  })

  it('as setas mexem o fundo em passos, sem passar do limite (RF-07.1)', () => {
    store.getState().setBackgroundFader(97)

    store.getState().nudgeBackgroundFader(5)
    expect(store.getState().backgroundFader).toBe(100)

    store.getState().setBackgroundFader(3)
    store.getState().nudgeBackgroundFader(-5)
    expect(store.getState().backgroundFader).toBe(0)
  })

  it('prende as durações de fade entre 0 e 8 s (RF-04.12)', () => {
    store.getState().setMainFadeMs(99_000)
    expect(store.getState().preferences.mainFadeMs).toBe(8000)

    store.getState().setBackgroundFadeMs(-500)
    expect(store.getState().preferences.backgroundFadeMs).toBe(0)
  })

  it('alterna o tema e guarda a cor de destaque (RF-08.1 e RF-08.2)', () => {
    expect(store.getState().preferences.theme).toBe('dark')

    store.getState().toggleTheme()
    expect(store.getState().preferences.theme).toBe('light')

    store.getState().setAccent('#1fce6d')
    expect(store.getState().preferences.accent).toBe('#1fce6d')
  })

  it('o mudo de um canal não mexe no outro (RF-05.3)', () => {
    store.getState().setMainMuted(true)

    expect(store.getState().mainMuted).toBe(true)
    expect(store.getState().backgroundMuted).toBe(false)
  })
})

describe('apagar tudo', () => {
  it('volta ao estado de fábrica', () => {
    enfileirar('Ana')
    adicionarFundo()
    store.getState().setMainFader(20)
    store.getState().setAccent('#c084fc')

    store.getState().resetAll()

    const state = store.getState()
    expect(state.queue).toHaveLength(0)
    expect(state.backgrounds).toHaveLength(0)
    expect(state.selectedBackgroundId).toBeNull()
    expect(state.mainFader).toBe(80)
    expect(state.mode).toBe('silence')
    expect(state.preferences.accent).toBe('#e8b64c')
  })
})

describe('pausar é diferente de parar (RF-07.1)', () => {
  it('pausar segura a pessoa no ar para o Espaço continuar de onde parou', () => {
    const ana = enfileirar('Ana')
    store.getState().play(ana)

    store.getState().pauseMain()

    expect(store.getState().mode).toBe('silence')
    // O item continua sendo o corrente — é isso que distingue pausa de standby.
    expect(store.getState().currentId).toBe(ana)
    expect(store.getState().isMainPaused()).toBe(true)

    store.getState().resumeMain()
    expect(store.getState().mode).toBe('main')
    expect(store.getState().currentId).toBe(ana)
  })

  it('parar solta a pessoa de volta na fila', () => {
    const ana = enfileirar('Ana')
    store.getState().play(ana)

    store.getState().stop()

    expect(store.getState().currentId).toBeNull()
    expect(store.getState().isMainPaused()).toBe(false)
    expect(store.getState().queue.map((i) => i.name)).toEqual(['Ana'])
  })

  it('standby de verdade não é pausa: não há o que continuar', () => {
    adicionarFundo()
    store.getState().playBackground()

    expect(store.getState().isMainPaused()).toBe(false)

    store.getState().resumeMain()
    // Sem item corrente, continuar não faz nada.
    expect(store.getState().mode).toBe('background')
  })

  it('pausar o que não está no ar não faz nada', () => {
    adicionarFundo()
    store.getState().playBackground()

    store.getState().pauseMain()

    expect(store.getState().mode).toBe('background')
  })
})

describe('durações descobertas pelo player', () => {
  it('anota a duração do item da fila', () => {
    const ana = enfileirar('Ana')

    store.getState().setQueueItemDuration(ana, 254)

    expect(store.getState().findQueueItem(ana)?.durationSec).toBe(254)
  })

  it('anota a duração da faixa de fundo', () => {
    const bg = adicionarFundo()

    store.getState().setBackgroundDuration(bg, 10_800)

    expect(store.getState().selectedBackground()?.durationSec).toBe(10_800)
  })

  it('ignora duração inválida em vez de gravar NaN', () => {
    const ana = enfileirar('Ana')

    store.getState().setQueueItemDuration(ana, Number.NaN)
    store.getState().setQueueItemDuration(ana, 0)
    store.getState().setQueueItemDuration(ana, -5)

    expect(store.getState().findQueueItem(ana)?.durationSec).toBeUndefined()
  })
})

describe('faders de fábrica', () => {
  it('o louvor começa em 80 e o fundo em 40, como no protótipo', () => {
    expect(store.getState().mainFader).toBe(80)
    expect(store.getState().backgroundFader).toBe(40)
  })
})
