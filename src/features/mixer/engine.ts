import { createMixer } from '../../audio/mixer'
import type { ChannelName, Mixer } from '../../audio/mixer'
import type { ChannelPhase } from '../../audio/channel'
import type { FadeDirection } from '../../audio/fade'
import type { FrameScheduler } from '../../audio/scheduler'
import { snapToMute } from '../../audio/volume'
import { createYouTubeChannel } from '../../youtube/player'
import type { CreatePlayerOptions, MediaChannel } from '../../youtube/player'
import { PLAYER_STATE } from '../../youtube/types'
import type { CronoStore } from '../../store'
import type { NewBackground } from '../../store/slices/backgrounds'

/**
 * A costura — onde o motor da Etapa 2, o store da Etapa 3 e o YouTube se
 * encontram.
 *
 * A divisão de trabalho é a mesma das etapas anteriores, e é o que impede este
 * arquivo de virar o `App.tsx` de 721 linhas do protótipo (RNF-01.4):
 *
 * - **O store guarda intenção.** Quem está na fila, quem está no ar, onde o
 *   operador deixou os faders. Não conhece áudio.
 * - **O mixer guarda som.** Rampas, crossfade, volume por quadro. Não conhece
 *   React nem store — ele **anuncia** ("o volume do fundo agora é 0,42").
 * - **O engine traduz.** Cada ação do operador vira (a) uma mudança de dados no
 *   store e (b) um comando de som no mixer. Nada mais mora aqui.
 *
 * A UI não fala com o mixer nem com o player: ela chama uma ação daqui e lê o
 * `snapshot`. É isso que permite testar o painel inteiro com um player de
 * mentira e um relógio de mentira.
 */

/** Um fade em andamento, do jeito que o aviso flutuante consome (RF-05.5). */
export interface FadeSnapshot {
  direction: FadeDirection
  remainingMs: number
  totalMs: number
}

/**
 * Tudo o que muda rápido demais para caber no store.
 *
 * Volume por quadro e tempo decorrido não são estado de domínio: são leitura de
 * instrumento. Ficam aqui, num observável próprio, para que mexer no fader
 * repinte o VU-meter sem re-renderizar a fila inteira (RNF-04.3).
 */
export interface EngineSnapshot {
  /** Volume final do canal, 0–1, já com fader, fade e mudo aplicados. */
  mainVolume: number
  backgroundVolume: number
  mainPhase: ChannelPhase
  backgroundPhase: ChannelPhase
  mainFade: FadeSnapshot | null
  backgroundFade: FadeSnapshot | null
  /** Onde o vídeo do louvor está, em segundos. */
  elapsedSec: number
  backgroundElapsedSec: number
  /** Falha do player, em português, para a tela (RNF-03.3). */
  error: string | null
  /**
   * Algum canal está sem player porque ele não conseguiu nascer.
   *
   * É diferente de `error`: um vídeo bloqueado é erro e não tem conserto por
   * aqui (o operador troca de vídeo), enquanto um player que não nasceu **tem**
   * — basta tentar de novo. É este campo que autoriza a tela a oferecer isso.
   */
  playerDown: boolean
}

const EMPTY_SNAPSHOT: EngineSnapshot = {
  mainVolume: 0,
  backgroundVolume: 0,
  mainPhase: 'silent',
  backgroundPhase: 'silent',
  mainFade: null,
  backgroundFade: null,
  elapsedSec: 0,
  backgroundElapsedSec: 0,
  error: null,
  playerDown: false,
}

/** De quanto em quanto tempo se pergunta ao player onde ele está. */
export const POLL_MS = 250

export interface AudioEngineOptions {
  store: CronoStore
  /** O relógio do motor. Trocado nos testes. */
  scheduler?: FrameScheduler
  /**
   * Como nascem os players. Trocado nos testes por um dublê.
   *
   * O segundo argumento diz **qual canal** está sendo criado. Não serve para
   * nada em produção (o `createYouTubeChannel` o ignora), mas evita que o teste
   * tenha que adivinhar quem é quem pela ordem de montagem — ou que a marcação
   * da tela carregue atributos que só existem para teste.
   */
  createChannel?: (
    options: CreatePlayerOptions,
    channel: ChannelName,
  ) => Promise<MediaChannel>
  pollMs?: number
}

export interface AudioEngine {
  subscribe(listener: () => void): () => void
  getSnapshot(): EngineSnapshot

  /** Entrega o retângulo da pré-escuta ao player do louvor. */
  attachMain(host: HTMLElement | null): void
  /** Entrega o div escondido ao player do fundo. */
  attachBackground(host: HTMLElement | null): void
  /**
   * Refaz os players que não conseguiram nascer.
   *
   * Sem isto, uma falha na criação é definitiva: o `ref` do React só dispara na
   * montagem, então ninguém chamaria `attach` de novo e o canal ficaria morto
   * até o operador recarregar a página — a topbar anunciando NO AR e a igreja
   * em silêncio. É o mesmo cenário do plano B do RNF-03.4: o operador liga o
   * hotspot do celular e o app tem que se recuperar sozinho.
   *
   * Não faz nada quando está tudo de pé, então pode ser chamado à vontade.
   */
  retryPlayers(): void

  /** Põe qualquer item da fila no ar, na hora que for (RF-01.7). */
  playQueueItem(id: string): void
  /** O `Espaço`: pausa, continua ou religa o fundo, conforme o momento. */
  togglePlayPause(): void
  /** O `S`: tira o louvor do ar e devolve o fundo (RF-04.11). */
  stopMain(): void
  /** O `N`: toca a primeira da fila que não está no ar. */
  playNext(): void
  /** O `B` e o botão do deck: liga/desliga o fundo. */
  toggleBackground(): void
  /** O `M` e o "Mix agora": avança a faixa de fundo com fade (RF-03.5). */
  nextBackground(): void
  /** Escolhe outra faixa da biblioteca, com fade se o fundo estiver no ar. */
  selectBackground(id: string): void
  /**
   * Guarda uma faixa na biblioteca. Passa pelo motor, e não direto pelo store,
   * porque a **primeira** faixa da biblioteca vazia já entra tocando
   * (RF-03.4) — e isso é som, não só dado.
   */
  addBackground(track: NewBackground): string
  removeBackground(id: string): void
  removeFromQueue(id: string): void

  setMainFader(value: number): void
  setBackgroundFader(value: number): void
  nudgeBackgroundFader(delta: number): void
  nudgeMainFader(delta: number): void

  dismissError(): void
  destroy(): void
}

export function createAudioEngine(options: AudioEngineOptions): AudioEngine {
  const {
    store,
    scheduler,
    createChannel = createYouTubeChannel,
    pollMs = POLL_MS,
  } = options

  const listeners = new Set<() => void>()
  let snapshot: EngineSnapshot = EMPTY_SNAPSHOT
  let destroyed = false

  const players: Record<ChannelName, MediaChannel | null> = {
    main: null,
    background: null,
  }
  /** Que vídeo está carregado em cada player, para não recarregar à toa. */
  const loaded: Record<ChannelName, string | null> = {
    main: null,
    background: null,
  }
  /** Cria um player por vez, por canal, mesmo com React montando duas vezes. */
  const pending: Record<ChannelName, Promise<void> | null> = {
    main: null,
    background: null,
  }
  /** O retângulo da página que cada canal ocupa hoje. */
  const hosts: Record<ChannelName, HTMLElement | null> = {
    main: null,
    background: null,
  }
  /** Canal cujo player não conseguiu nascer — candidato a nova tentativa. */
  const down: Record<ChannelName, boolean> = {
    main: false,
    background: false,
  }
  /**
   * Vídeo engatilhado num canal: escolhido, mas que o player ainda não recebeu.
   *
   * Engatilhar é **anotação nossa**, não comando ao YouTube — e isso é
   * deliberado. Mandar `cueVideoById` e, no mesmo tique, `playVideo` é uma
   * corrida perdida: os comandos viajam por `postMessage` até o iframe, e o play
   * chega enquanto o cue ainda está buscando o vídeo. O player fica sem vídeo
   * registrado e o play vira erro 2 — "Link do vídeo inválido" no meio do culto,
   * com o fundo mudo. O `loadVideoById` não tem esse problema porque é um
   * comando só, que carrega e toca de uma vez; é ele que resolve o engatilhado
   * quando o mixer manda tocar.
   */
  const cued: Record<ChannelName, string | null> = {
    main: null,
    background: null,
  }
  /**
   * O que o canal deveria estar fazendo enquanto o player ainda nasce.
   *
   * O script da API do YouTube leva um tempo para baixar, e o operador não
   * espera: ele abre o app e já manda tocar. Sem guardar o pedido, ele se perde
   * no ar — o botão responde, a topbar muda e não sai som.
   *
   * `autoplay` acompanha o pedido porque ele pode mudar de ideia no caminho: um
   * vídeo engatilhado que o mixer resolve tocar antes de o player existir vira
   * autoplay na chegada.
   */
  interface PedidoPendente {
    videoId: string
    autoplay: boolean
  }
  const pendingLoad: Record<ChannelName, PedidoPendente | null> = {
    main: null,
    background: null,
  }
  let poll: number | null = null

  const state = () => store.getState()

  // --- o observável -------------------------------------------------------

  const publish = (patch: Partial<EngineSnapshot>): void => {
    snapshot = { ...snapshot, ...patch }
    for (const listener of listeners) listener()
  }

  /** Recolhe do mixer o que mudou neste quadro. */
  const publishFromMixer = (): void => {
    publish({
      mainVolume: mixer.getVolume('main'),
      backgroundVolume: mixer.getVolume('background'),
      mainPhase: mixer.getPhase('main'),
      backgroundPhase: mixer.getPhase('background'),
      mainFade: toFadeSnapshot(mixer, 'main'),
      backgroundFade: toFadeSnapshot(mixer, 'background'),
    })
  }

  // --- o motor ------------------------------------------------------------

  const inicial = state()

  const mixer: Mixer = createMixer({
    scheduler,
    mainFadeMs: inicial.preferences.mainFadeMs,
    backgroundFadeMs: inicial.preferences.backgroundFadeMs,
    mainFader: inicial.mainFader,
    backgroundFader: inicial.backgroundFader,
    autoReturnBackground: inicial.preferences.autoReturnBackground,

    // O mixer anuncia o volume; aqui ele vira comando de player.
    onVolume: (channel, volume) => {
      players[channel]?.setVolume(volume)
      publishFromMixer()
    },

    onTransport: (channel, action) => {
      const player = players[channel]
      if (!player) {
        // Player ainda nascendo: o comando não pode se perder no ar. Ele vira
        // intenção no pedido guardado, e chega junto com o vídeo.
        const pedido = pendingLoad[channel]
        if (pedido) pedido.autoplay = action === 'play'
        return
      }
      if (action === 'pause') {
        player.pause()
        return
      }
      // Canal com faixa engatilhada: quem dá a partida é o `loadVideoById`, num
      // comando só — ver o comentário de `cued`.
      const engatilhado = cued[channel]
      if (engatilhado !== null) {
        cued[channel] = null
        player.load(engatilhado)
        return
      }
      player.play()
    },

    onModeChange: () => publishFromMixer(),
  })

  // --- os players ---------------------------------------------------------

  const algumCaido = (): boolean => down.main || down.background

  /** Solta o player de um canal, sem mexer em quem é o dono do retângulo. */
  const releasePlayer = (channel: ChannelName): void => {
    players[channel]?.destroy()
    players[channel] = null
    loaded[channel] = null
    cued[channel] = null
    pendingLoad[channel] = null
  }

  const attach = (
    channel: ChannelName,
    container: HTMLElement | null,
  ): void => {
    if (destroyed) return

    if (!container) {
      hosts[channel] = null
      down[channel] = false
      releasePlayer(channel)
      publish({ playerDown: algumCaido() })
      return
    }

    // O retângulo mudou de nó (remontagem da árvore): o player velho ficou
    // preso a um elemento que já saiu da página.
    if (hosts[channel] !== null && hosts[channel] !== container) {
      releasePlayer(channel)
    }
    hosts[channel] = container

    if (players[channel] || pending[channel]) return
    spawn(channel, container)
  }

  /** Monta um player novo no retângulo do canal. */
  const spawn = (channel: ChannelName, container: HTMLElement): void => {
    // O YouTube **substitui** o elemento que recebe pelo iframe. Dar a ele um
    // filho criado à mão, e não o div que o React controla, evita que o React
    // tente remover na desmontagem um nó que já não é dele.
    const host = document.createElement('div')
    container.replaceChildren(host)

    pending[channel] = createChannel(
      {
        host,
        onStateChange: (playerState) => handleState(channel, playerState),
        onError: (error) =>
          publish({
            error:
              channel === 'background'
                ? `Fundo: ${error.message}`
                : error.message,
          }),
      },
      channel,
    )
      .then((created) => {
        // O painel pode ter sido desmontado enquanto a API do YouTube
        // carregava — um iframe órfão continuaria tocando sem ninguém no
        // comando.
        if (destroyed || hosts[channel] !== container) {
          created.destroy()
          return
        }
        const eraQueda = down[channel]
        down[channel] = false
        players[channel] = created
        // O player nasce em volume 100; o mixer só avisa quando o valor MUDA,
        // e no silêncio ele não muda. Sem esta linha, o primeiro play sairia
        // no volume cheio antes do primeiro quadro do fade.
        created.setVolume(mixer.getVolume(channel))

        // Pedido que chegou enquanto ele nascia — inclusive o que o mixer
        // mandou tocar sem ter em quem mandar.
        const pedido = pendingLoad[channel]
        pendingLoad[channel] = null
        if (pedido?.autoplay) created.load(pedido.videoId)
        else if (pedido) cued[channel] = pedido.videoId

        // Deu certo na segunda: o aviso da tentativa anterior agora mentiria.
        publish({
          playerDown: algumCaido(),
          error: eraQueda && !algumCaido() ? null : snapshot.error,
        })
        startPolling()
      })
      .catch((error: unknown) => {
        // Sem isto o canal ficaria morto para sempre: `attach` só é chamado
        // pelo `ref` do React, que não dispara de novo. Marcar a queda é o que
        // deixa `retryPlayers` ter o que refazer.
        down[channel] = true
        publish({
          playerDown: true,
          error:
            error instanceof Error
              ? error.message
              : 'Não foi possível preparar o player do YouTube.',
        })
      })
      .finally(() => {
        pending[channel] = null
      })
  }

  /** Refaz um player caído, se houver retângulo esperando por ele. */
  const retry = (channel: ChannelName): void => {
    if (destroyed || !down[channel] || pending[channel]) return
    const container = hosts[channel]
    if (!container) return
    spawn(channel, container)
  }

  const handleState = (channel: ChannelName, playerState: number): void => {
    if (playerState === PLAYER_STATE.PLAYING) {
      // Som saindo: o que estava escrito na tela sobre falha já não vale.
      if (snapshot.error) publish({ error: null })
    }
    if (playerState !== PLAYER_STATE.ENDED) return
    if (channel === 'main') finishMain()
    else backgroundEnded()
  }

  /**
   * Escolhe o vídeo de um canal.
   *
   * Com `autoplay`, vai direto ao player pelo `loadVideoById`, que carrega e
   * toca de uma vez. Sem, fica **só anotado** em `cued`: o player não recebe
   * nada agora, e o vídeo entra nele no instante em que o mixer mandar tocar.
   */
  const put = (
    channel: ChannelName,
    videoId: string,
    autoplay: boolean,
  ): void => {
    loaded[channel] = videoId
    const player = players[channel]
    if (!player) {
      // Player ainda nascendo — ou caído. O pedido fica de pé e é aplicado na
      // chegada; a ação do operador é o pedido de nova tentativa mais natural
      // que existe, então ela também remonta o que caiu.
      pendingLoad[channel] = { videoId, autoplay }
      retry(channel)
      return
    }
    if (!autoplay) {
      cued[channel] = videoId
      return
    }
    cued[channel] = null
    player.load(videoId)
  }

  /**
   * Carrega já tocando. É o que o louvor quer: todo caminho que troca o vídeo do
   * louvor é o operador mandando tocar **agora**, e nem sempre o mixer manda um
   * `play` atrás (quando ele já está no ar, ou descendo, o transporte não
   * repete o comando).
   */
  const load = (channel: ChannelName, videoId: string): void =>
    put(channel, videoId, true)

  /**
   * Engatilha sem tocar. É o certo para o **fundo**, porque nele quem manda
   * tocar é sempre o mixer, pelo transporte — nenhum caminho depende do
   * autoplay do `load`.
   *
   * Carregar o fundo tocando custava caro e em silêncio: ele streamava por trás
   * do louvor inteiro (dois vídeos do YouTube ao mesmo tempo, no hotspot do
   * celular do RNF-03.4), voltava no meio da faixa em vez do começo (RF-03.6) e
   * armava o cronômetro de 5 s num canal mudo — um buffer lento durante o
   * louvor virava o alarme falso "Fundo: o vídeo não começou a tocar".
   *
   * A partida a frio que isto reintroduz é coberta pelo fade: o fundo entra
   * subindo do zero, e o primeiro instante — justamente o do buffer — é o
   * inaudível.
   */
  const engatilhar = (channel: ChannelName, videoId: string): void =>
    put(channel, videoId, false)

  /**
   * Garante que o fundo tem faixa engatilhada antes de precisar dela.
   *
   * O mixer manda "toque o fundo" sem saber se há vídeo lá dentro. Chamar isto
   * antes de qualquer caminho que devolva o fundo evita o pior silêncio de
   * todos: o que acontece quando a música acaba e nada entra no lugar.
   */
  const ensureBackgroundLoaded = (): void => {
    const track = state().selectedBackground()
    if (!track) return
    if (loaded.background === track.videoId) return
    engatilhar('background', track.videoId)
  }

  // --- o tempo ------------------------------------------------------------

  const startPolling = (): void => {
    if (poll !== null || destroyed) return
    poll = window.setInterval(tickTime, pollMs)
  }

  /**
   * Lê o relógio dos players.
   *
   * A IFrame API não avisa o tempo passar — não existe evento de progresso —,
   * então perguntamos. Quatro vezes por segundo é o suficiente para o
   * cronômetro da topbar não parecer travado e pouco o bastante para não pesar.
   */
  const tickTime = (): void => {
    const main = players.main
    const background = players.background
    const patch: Partial<EngineSnapshot> = {}

    if (main) {
      patch.elapsedSec = main.getCurrentTime()
      const duration = Math.round(main.getDuration())
      const item = state().currentId
        ? state().findQueueItem(state().currentId ?? '')
        : null
      // Só grava se mudou: sem esta guarda seriam quatro escritas por segundo
      // no IndexedDB e quatro re-renders da fila, para anotar sempre o mesmo
      // número.
      if (item && duration > 0 && item.durationSec !== duration) {
        state().setQueueItemDuration(item.id, duration)
      }
    }

    if (background) {
      patch.backgroundElapsedSec = background.getCurrentTime()
      const duration = Math.round(background.getDuration())
      const track = state().selectedBackground()
      if (track && duration > 0 && track.durationSec !== duration) {
        state().setBackgroundDuration(track.id, duration)
      }
    }

    publish(patch)
  }

  // --- as ações -----------------------------------------------------------

  const playQueueItem = (id: string): void => {
    const item = state().findQueueItem(id)
    if (!item) return
    const { mode, currentId } = state()

    publish({ error: null })
    ensureBackgroundLoaded()

    if (mode === 'main' && currentId === id) return

    if (mode === 'main') {
      // Já tem alguém no ar: a música atual sai com fade antes da troca
      // (RF-04.4) — o operador nunca ouve corte seco.
      mixer.swap('main', () => {
        state().play(id)
        load('main', item.videoId)
        publish({ elapsedSec: 0 })
      })
      return
    }

    state().play(id)
    load('main', item.videoId)
    publish({ elapsedSec: 0 })
    // Com o fundo tocando isto vira crossfade: ele desce enquanto o louvor
    // sobe, sem corte (RF-04.5).
    mixer.playMain()
  }

  const finishMain = (): void => {
    if (state().currentId === null) return
    ensureBackgroundLoaded()
    state().finish()
    // O som já acabou sozinho: fade de silêncio só atrasaria o fundo.
    mixer.mainEnded()
    publish({ elapsedSec: 0 })
    publishFromMixer()
  }

  const backgroundEnded = (): void => {
    const { backgrounds } = state()
    if (backgrounds.length === 0) return
    // Com uma faixa só, "a próxima" é ela mesma — e o vídeo recomeça (RF-03.6).
    state().nextBackground()
    const track = state().selectedBackground()
    if (!track) return
    engatilhar('background', track.videoId)
    publish({ backgroundElapsedSec: 0 })
    // A faixa anterior terminou em silêncio; não há o que abaixar, só o que
    // subir. É o `restart` que manda o transporte tocar a faixa engatilhada.
    mixer.restart('background')
  }

  /**
   * As três saídas de cena abaixo seguem a mesma regra do protótipo: **a tela
   * só muda quando o som acaba de sair**.
   *
   * O operador aperta parar e continua lendo "NO AR · LOUVOR" enquanto o volume
   * desce — com o aviso de fade correndo ao lado, dizendo quanto falta. Só no
   * fim a topbar troca. Anunciar antes seria a tela contando uma coisa e a
   * caixa de som contando outra.
   */
  const stopMain = (): void => {
    if (state().currentId === null) return
    // A faixa de fundo precisa estar carregada **antes**: quando a rampa
    // terminar, ela entra no mesmo instante.
    ensureBackgroundLoaded()
    mixer.stopMain(() => {
      state().stop()
      publish({ elapsedSec: 0 })
    })
    publishFromMixer()
  }

  const pauseMain = (): void => {
    mixer.pauseMain(() => state().pauseMain())
    publishFromMixer()
  }

  const resumeMain = (): void => {
    state().resumeMain()
    mixer.playMain()
    publishFromMixer()
  }

  const playBackground = (): void => {
    if (!state().selectedBackgroundId) return
    ensureBackgroundLoaded()
    state().playBackground()
    mixer.playBackground()
    publishFromMixer()
  }

  const stopBackground = (): void => {
    mixer.stopBackground(() => state().stopBackground())
    publishFromMixer()
  }

  const toggleBackground = (): void => {
    if (state().mode === 'background') stopBackground()
    else playBackground()
  }

  const nextBackground = (): void => {
    if (state().backgrounds.length === 0) return

    const trocar = (): void => {
      state().nextBackground()
      const track = state().selectedBackground()
      if (track) engatilhar('background', track.videoId)
      publish({ backgroundElapsedSec: 0 })
    }

    // Fora do ar o fundo só troca de faixa engatilhada — trocar de disco no
    // deck parado não liga o som.
    if (state().mode === 'background') mixer.swap('background', trocar)
    else trocar()
  }

  const selectBackground = (id: string): void => {
    if (state().selectedBackgroundId === id) return

    const trocar = (): void => {
      state().selectBackground(id)
      const track = state().selectedBackground()
      if (track) engatilhar('background', track.videoId)
      publish({ backgroundElapsedSec: 0 })
    }

    if (state().mode === 'background') mixer.swap('background', trocar)
    else trocar()
  }

  // --- o store manda nos ajustes -----------------------------------------

  /**
   * Espelha no motor tudo o que é ajuste, não comando: posição dos faders,
   * durações de fade e retorno automático. Fica numa assinatura só, em vez de
   * espalhada pelas ações, para não haver caminho em que o store muda e o motor
   * não fica sabendo.
   *
   * **Os faders estão aqui por causa de um bug que custou caro.** O motor nasce
   * antes de o IndexedDB responder — nesse instante o store ainda tem os
   * padrões (80/40), e é com eles que o mixer é criado. Quando o disco chega
   * com o que o operador havia deixado, o store atualiza e o número na tela
   * fica certo; sem esta sincronia, o **volume** continuava no padrão. O
   * sintoma era o pior tipo: a música da fila entrava mais alta do que o master
   * mostrava, e o fundo voltava mais alto do que o fader dele — e só se
   * acertava quando alguém encostava no fader, o que fazia parecer defeito
   * aleatório. Este caminho também cobre a importação de um backup (RF-09.4),
   * que escreve os faders do mesmo jeito.
   */
  const syncSettings = (): void => {
    const { preferences, selectedBackgroundId, mainFader, backgroundFader } =
      state()
    mixer.setFader('main', mainFader)
    mixer.setFader('background', backgroundFader)
    mixer.setFadeMs('main', preferences.mainFadeMs)
    mixer.setFadeMs('background', preferences.backgroundFadeMs)
    // Sem faixa escolhida não há fundo para voltar — o destino é o standby.
    mixer.setAutoReturnBackground(
      preferences.autoReturnBackground && selectedBackgroundId !== null,
    )
  }

  const unsubscribeStore = store.subscribe(syncSettings)
  syncSettings()

  return {
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },

    getSnapshot: () => snapshot,

    attachMain: (host) => attach('main', host),
    attachBackground: (host) => attach('background', host),

    retryPlayers() {
      retry('main')
      retry('background')
    },

    playQueueItem,
    playNext() {
      const next = state().nextInQueue()
      if (next) playQueueItem(next.id)
    },
    stopMain,
    toggleBackground,
    nextBackground,
    selectBackground,

    togglePlayPause() {
      const { mode, backgrounds } = state()
      if (mode === 'main') {
        // Repetir a ação no meio de uma saída **cancela** a saída e devolve o
        // volume (RF-04.10) — o "segura, deixa continuar" do protótipo. Como a
        // tela só muda no fim da rampa, é aqui que esse arrependimento cabe.
        if (mixer.getPhase('main') === 'fading-out') {
          mixer.playMain()
          publishFromMixer()
          return
        }
        pauseMain()
        return
      }
      if (state().isMainPaused()) {
        resumeMain()
        return
      }
      // Sem louvor engatilhado, o play religa o fundo — é o que o operador
      // espera de um botão de play num painel que está em silêncio.
      if (mode === 'silence' && backgrounds.length > 0) playBackground()
    },

    addBackground(track) {
      const eraVazia = state().backgrounds.length === 0
      const id = state().addBackground(track)

      // O store é quem decide se a primeira faixa já entra tocando — e ele
      // recusa se houver louvor no ar (RF-03.4). Aqui só olhamos o que ele
      // decidiu e mandamos o som acompanhar; duplicar a regra seria criar duas
      // versões dela para divergirem depois.
      if (eraVazia && state().mode === 'background') {
        ensureBackgroundLoaded()
        mixer.playBackground()
        publishFromMixer()
      }

      return id
    },

    removeBackground(id) {
      const eraSelecionada = state().selectedBackgroundId === id
      state().removeBackground(id)
      if (!eraSelecionada) return

      const track = state().selectedBackground()
      if (!track) {
        players.background?.pause()
        loaded.background = null
        cued.background = null
        mixer.stopBackground()
        publishFromMixer()
        return
      }
      engatilhar('background', track.videoId)
      if (state().mode === 'background') mixer.restart('background')
    },

    removeFromQueue(id) {
      const eraOAtual = state().currentId === id
      state().removeFromQueue(id)
      // Tirar da fila quem está no ar tira do ar também — e o som tem que
      // acompanhar a tela.
      if (eraOAtual) mixer.stopMain()
      publishFromMixer()
    },

    setMainFader(value) {
      // O snap acontece aqui, na entrada, para o número guardado e o número
      // ouvido serem o mesmo — senão o fader mostraria 2 com o som em 0.
      const snapped = snapToMute(value)
      state().setMainFader(snapped)
      mixer.setFader('main', snapped)
    },

    setBackgroundFader(value) {
      const snapped = snapToMute(value)
      state().setBackgroundFader(snapped)
      mixer.setFader('background', snapped)
    },

    nudgeBackgroundFader(delta) {
      state().nudgeBackgroundFader(delta)
      mixer.setFader('background', state().backgroundFader)
    },

    nudgeMainFader(delta) {
      state().nudgeMainFader(delta)
      mixer.setFader('main', state().mainFader)
    },

    dismissError() {
      publish({ error: null })
    },

    destroy() {
      destroyed = true
      unsubscribeStore()
      if (poll !== null) window.clearInterval(poll)
      poll = null
      mixer.destroy()
      releasePlayer('main')
      releasePlayer('background')
      hosts.main = null
      hosts.background = null
      listeners.clear()
    },
  }
}

function toFadeSnapshot(
  mixer: Mixer,
  channel: ChannelName,
): FadeSnapshot | null {
  const fade = mixer.getFade(channel)
  if (!fade) return null
  return {
    direction: fade.direction,
    remainingMs: fade.remainingMs,
    totalMs: fade.durationMs,
  }
}
