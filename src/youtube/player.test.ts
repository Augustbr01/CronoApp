import { resetYouTubeIframeApiLoader } from './api-loader'
import {
  PLAYBACK_TIMEOUT_MS,
  createYouTubeChannel,
  toYouTubeVolume,
} from './player'
import type { MediaChannel } from './player'
import { PLAYER_STATE } from './types'
import type { PlayerErrorInfo } from './errors'
import { createFakeYouTubeApi } from '../test/fake-youtube'
import type { FakeYouTubeApi, FakeYouTubePlayer } from '../test/fake-youtube'

let fake: FakeYouTubeApi
let host: HTMLElement
let erros: PlayerErrorInfo[]
let estados: number[]

beforeEach(() => {
  resetYouTubeIframeApiLoader()
  fake = createFakeYouTubeApi()
  window.YT = fake.api
  host = document.createElement('div')
  document.body.appendChild(host)
  erros = []
  estados = []
})

afterEach(() => {
  vi.useRealTimers()
  host.remove()
  delete window.YT
  resetYouTubeIframeApiLoader()
})

/**
 * Cria o canal e o deixa pronto. O `emitReady` precisa acontecer **depois** de
 * o player existir, então esperamos o construtor rodar antes de disparar.
 */
async function createReadyChannel(): Promise<{
  channel: MediaChannel
  player: FakeYouTubePlayer
}> {
  const creating = createYouTubeChannel({
    host,
    onError: (erro) => erros.push(erro),
    onStateChange: (estado) => estados.push(estado),
  })

  await vi.waitFor(() => {
    if (fake.players.length === 0)
      throw new Error('player ainda não foi criado')
  })
  const player = fake.last()
  player.emitReady()

  return { channel: await creating, player }
}

describe('createYouTubeChannel', () => {
  it('monta o player e só entrega o canal quando ele fica pronto', async () => {
    const { channel, player } = await createReadyChannel()

    expect(fake.players).toHaveLength(1)
    expect(player.destroyed).toBe(false)
    expect(channel.getState()).toBe(PLAYER_STATE.UNSTARTED)
  })

  it('esconde a interface do YouTube — é uma mesa de som, não um site', async () => {
    const { player } = await createReadyChannel()

    expect(player.host).toBe(host)
    expect(player.options.playerVars).toMatchObject({
      autoplay: 0,
      controls: 0,
      disablekb: 1,
      rel: 0,
      modestbranding: 1,
    })
  })

  it('deixa sobrescrever os ajustes do iframe quando preciso', async () => {
    const creating = createYouTubeChannel({ host, playerVars: { controls: 1 } })
    await vi.waitFor(() => {
      if (fake.players.length === 0) throw new Error('player ainda não criado')
    })
    fake.last().emitReady()
    await creating

    expect(fake.last().options.playerVars).toMatchObject({
      controls: 1,
      rel: 0,
    })
  })

  it('inclui origin nos ajustes do iframe por padrão', async () => {
    const { player } = await createReadyChannel()

    expect(player.options.playerVars?.origin).toBe(window.location.origin)
  })

  it('desiste quando o player não fica pronto no prazo', async () => {
    vi.useFakeTimers()

    const creating = createYouTubeChannel({ host, playbackTimeoutMs: 5000 })
    const rejeicao = expect(creating).rejects.toThrow(/não respondeu/i)
    await vi.advanceTimersByTimeAsync(5000)

    await rejeicao
  })

  it('desmonta o player que ficou pronto tarde demais (RNF-04.2)', async () => {
    vi.useFakeTimers()

    const creating = createYouTubeChannel({ host, playbackTimeoutMs: 5000 })
    const rejeicao = expect(creating).rejects.toThrow(/não respondeu/i)
    await vi.waitFor(() => {
      if (fake.players.length === 0) throw new Error('player ainda não nasceu')
    })
    const player = fake.last()

    await vi.advanceTimersByTimeAsync(5000)
    await rejeicao

    // Quem pediu já desistiu: ninguém mais comanda este player. Deixá-lo de pé
    // seria um iframe carregado na página — tocando, se veio com vídeo.
    expect(player.destroyed).toBe(true)
  })

  it('desmonta também o player cujo onReady chega depois da desistência', async () => {
    vi.useFakeTimers()

    const creating = createYouTubeChannel({ host, playbackTimeoutMs: 5000 })
    const rejeicao = expect(creating).rejects.toThrow(/não respondeu/i)
    await vi.waitFor(() => {
      if (fake.players.length === 0) throw new Error('player ainda não nasceu')
    })
    const player = fake.last()
    await vi.advanceTimersByTimeAsync(5000)
    await rejeicao
    player.destroyed = false

    // O YouTube não sabe do nosso prazo: ele avisa quando fica pronto.
    player.emitReady()

    expect(player.destroyed).toBe(true)
  })
})

describe('volume', () => {
  it('converte a escala do motor (0–1) para a do YouTube (0–100)', async () => {
    const { channel, player } = await createReadyChannel()

    channel.setVolume(1)
    expect(player.volume).toBe(100)

    channel.setVolume(0.5)
    expect(player.volume).toBe(50)

    channel.setVolume(0)
    expect(player.volume).toBe(0)
  })

  it('devolve o volume de volta na escala do motor', async () => {
    const { channel, player } = await createReadyChannel()

    player.volume = 40
    expect(channel.getVolume()).toBeCloseTo(0.4, 10)
  })

  it('prende valores fora da escala e nunca manda lixo ao player', () => {
    expect(toYouTubeVolume(1.5)).toBe(100)
    expect(toYouTubeVolume(-0.2)).toBe(0)
    expect(toYouTubeVolume(Number.NaN)).toBe(0)
    expect(toYouTubeVolume(0.333)).toBe(33)
  })
})

describe('cronômetro do silêncio (5 s depois do play)', () => {
  it('acusa erro quando o som não começa no prazo', async () => {
    const { channel } = await createReadyChannel()
    vi.useFakeTimers()

    channel.play()
    await vi.advanceTimersByTimeAsync(PLAYBACK_TIMEOUT_MS)

    expect(erros).toHaveLength(1)
    expect(erros[0]?.message).toMatch(/não começou a tocar/i)
    expect(erros[0]?.fatal).toBe(false)
  })

  it('fica calado quando o som começa a tempo', async () => {
    const { channel, player } = await createReadyChannel()
    vi.useFakeTimers()

    channel.play()
    await vi.advanceTimersByTimeAsync(4000)
    player.emitStateChange(PLAYER_STATE.PLAYING)
    await vi.advanceTimersByTimeAsync(10_000)

    expect(erros).toEqual([])
  })

  it('não perdoa buffer eterno — bufferizar não conta como tocar', async () => {
    const { channel, player } = await createReadyChannel()
    vi.useFakeTimers()

    channel.play()
    player.emitStateChange(PLAYER_STATE.BUFFERING)
    await vi.advanceTimersByTimeAsync(PLAYBACK_TIMEOUT_MS)

    expect(erros).toHaveLength(1)
    expect(erros[0]?.message).toMatch(/não começou a tocar/i)
  })

  it('desarma quando o operador pausa antes do prazo', async () => {
    const { channel } = await createReadyChannel()
    vi.useFakeTimers()

    channel.play()
    channel.pause()
    await vi.advanceTimersByTimeAsync(60_000)

    expect(erros).toEqual([])
  })

  it('desarma quando o operador para antes do prazo', async () => {
    const { channel } = await createReadyChannel()
    vi.useFakeTimers()

    channel.play()
    channel.stop()
    await vi.advanceTimersByTimeAsync(60_000)

    expect(erros).toEqual([])
  })

  it('vale também para o load, que já começa a tocar', async () => {
    const { channel } = await createReadyChannel()
    vi.useFakeTimers()

    channel.load('abc123')
    await vi.advanceTimersByTimeAsync(PLAYBACK_TIMEOUT_MS)

    expect(erros).toHaveLength(1)
  })

  it('não arma no cue — engatilhar um vídeo não é pedir som', async () => {
    const { channel } = await createReadyChannel()
    vi.useFakeTimers()

    channel.cue('abc123')
    await vi.advanceTimersByTimeAsync(60_000)

    expect(erros).toEqual([])
  })

  it('dois plays seguidos não geram dois alarmes pelo mesmo silêncio', async () => {
    const { channel } = await createReadyChannel()
    vi.useFakeTimers()

    channel.play()
    await vi.advanceTimersByTimeAsync(2000)
    channel.play()
    await vi.advanceTimersByTimeAsync(PLAYBACK_TIMEOUT_MS)

    expect(erros).toHaveLength(1)
  })

  it('cala o cronômetro quando o YouTube já explicou o problema', async () => {
    const { channel, player } = await createReadyChannel()
    vi.useFakeTimers()

    channel.play()
    player.emitError(150)
    await vi.advanceTimersByTimeAsync(60_000)

    // Um erro só: o do YouTube. Não um segundo alarme pelo mesmo problema.
    expect(erros).toHaveLength(1)
    expect(erros[0]?.code).toBe(150)
    expect(erros[0]?.fatal).toBe(true)
  })

  it('não dispara depois de o canal ser destruído (RNF-04.2)', async () => {
    const { channel } = await createReadyChannel()
    vi.useFakeTimers()

    channel.play()
    channel.destroy()
    await vi.advanceTimersByTimeAsync(60_000)

    expect(erros).toEqual([])
    expect(vi.getTimerCount()).toBe(0)
  })
})

describe('comandos e estado', () => {
  it('repassa os comandos ao player', async () => {
    const { channel, player } = await createReadyChannel()

    channel.load('video-1', 30)
    channel.play()
    channel.pause()
    channel.stop()

    expect(player.loadCalls).toEqual([{ videoId: 'video-1', startSeconds: 30 }])
    expect(player.commands).toEqual(['load', 'play', 'pause', 'stop'])
  })

  it('avisa cada mudança de estado, já traduzida', async () => {
    const { player } = await createReadyChannel()

    player.emitStateChange(PLAYER_STATE.BUFFERING)
    player.emitStateChange(PLAYER_STATE.PLAYING)
    player.emitStateChange(PLAYER_STATE.ENDED)

    expect(estados).toEqual([
      PLAYER_STATE.BUFFERING,
      PLAYER_STATE.PLAYING,
      PLAYER_STATE.ENDED,
    ])
  })

  it('trata estado desconhecido como parado, sem quebrar', async () => {
    const { player } = await createReadyChannel()

    player.emitStateChange(99)

    expect(estados).toEqual([PLAYER_STATE.UNSTARTED])
  })

  it('traduz o erro do YouTube antes de entregar ao operador', async () => {
    const { player } = await createReadyChannel()

    player.emitError(100)

    expect(erros).toHaveLength(1)
    expect(erros[0]?.message).toMatch(/removido|privado/i)
    expect(erros[0]?.fatal).toBe(true)
  })

  it('desmonta o iframe no destroy e ignora comandos depois dele', async () => {
    const { channel, player } = await createReadyChannel()

    channel.destroy()
    channel.play()
    channel.setVolume(1)

    expect(player.destroyed).toBe(true)
    expect(player.commands).toEqual([])
    expect(channel.getState()).toBe(PLAYER_STATE.UNSTARTED)
    expect(channel.getVolume()).toBe(0)
  })

  it('aguenta destroy chamado duas vezes', async () => {
    const { channel } = await createReadyChannel()

    channel.destroy()
    expect(() => channel.destroy()).not.toThrow()
  })
})
