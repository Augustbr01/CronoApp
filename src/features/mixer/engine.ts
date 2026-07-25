import { createMixer } from '../../audio/mixer'
import type { ChannelName, Mixer } from '../../audio/mixer'
import type { ChannelPhase } from '../../audio/channel'
import type { FadeDirection } from '../../audio/fade'
import type { FrameScheduler } from '../../audio/scheduler'
import { snapToMute } from '../../audio/volume'
import { createYouTubeChannel } from '../../youtube/player'
import type { CreatePlayerOptions, MediaChannel } from '../../youtube/player'
import { PLAYER_STATE } from '../../youtube/types'
import { createLocalAudioChannel } from '../../localaudio/player'
import type { CreateLocalChannelOptions } from '../../localaudio/player'
import { blobVault } from '../../store/blob-storage'
import type { BlobVault } from '../../store/blob-storage'
import { createId } from '../../store/ids'
import type { CronoStore } from '../../store'
import type { Background, MediaKind, QueueItem } from '../../store/types'
import type { NewBackground } from '../../store/slices/backgrounds'

/**
 * A costura — onde o motor da Etapa 2, o store da Etapa 3 e os players se
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
 *   store e (b) um comando de som no player. Nada mais mora aqui.
 *
 * A UI não fala com o mixer nem com o player: ela chama uma ação daqui e lê o
 * `snapshot`. É isso que permite testar o painel inteiro com um player de
 * mentira e um relógio de mentira.
 *
 * **Dois backends por canal (RF-11).** Cada canal (louvor, fundo) segura um
 * iframe do YouTube **e** um `<audio>` local ao lado (D2), e a costura roteia o
 * volume e o transporte para o backend **ativo** conforme o `kind` do item
 * corrente. O iframe é caro de nascer (carrega a API, arma o watchdog de 5 s),
 * então ele fica de pé o culto inteiro; o `<audio>` é barato e nasce sob demanda
 * — um culto só de YouTube nunca cria um. O motor de mixagem (`audio/`) não sabe
 * de nada disso: ele fala em números 0–1 e anuncia intenções, e aqui é que
 * viram comandos de um backend ou de outro.
 */

/**
 * A referência de mídia que o motor precisa para mandar carregar — a parte de um
 * item da fila ou fundo que diz **o quê** tocar e **onde**.
 *
 * O `kind` decide para qual backend o canal roteia: `videoId` vai para o iframe
 * do YouTube; `blobId` é resolvido nos bytes → object URL que o `<audio>` toca.
 */
type MediaRef =
  { kind: 'youtube'; videoId: string } | { kind: 'local'; blobId: string }

type LocalRef = Extract<MediaRef, { kind: 'local' }>

/** Extrai a referência de mídia de um item da fila ou de um fundo. */
function toMediaRef(media: QueueItem | Background): MediaRef {
  return media.kind === 'youtube'
    ? { kind: 'youtube', videoId: media.videoId }
    : { kind: 'local', blobId: media.blobId }
}

/**
 * Chave estável de uma referência, para o `loaded` saber se o backend já tem
 * aquela mídia e não recarregar à toa. O prefixo do `kind` evita que um `blobId`
 * e um `videoId` iguais por acaso se confundam.
 */
function refKey(ref: MediaRef): string {
  return ref.kind === 'youtube'
    ? `youtube:${ref.videoId}`
    : `local:${ref.blobId}`
}

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
  /**
   * Qual backend é a **voz** do louvor agora — iframe, `<audio>` ou nenhum.
   *
   * A tela precisa disto, e não do `kind` do item da fila, porque as duas
   * coisas se descolam justamente na hora mais visível: remover da fila quem
   * está no ar apaga o item **na hora**, e a rampa segue por mais dois
   * segundos. Perguntar ao item, nesse intervalo, faria a pré-escuta trocar de
   * cara no meio da saída e devolver o iframe à frente — exibindo congelado o
   * último vídeo do YouTube, com um arquivo local tocando na caixa de som.
   */
  mainKind: MediaKind | null
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
  mainKind: null,
  error: null,
  playerDown: false,
}

/** De quanto em quanto tempo se pergunta ao player onde ele está. */
export const POLL_MS = 250

/** Revoga uma object URL de áudio local em produção (RNF-04.2). */
function defaultRevokeBlobUrl(url: string): void {
  URL.revokeObjectURL(url)
}

/**
 * O que impede um arquivo escolhido de virar item — ou `null` se ele serve.
 *
 * O filtro é **frouxo de propósito**: a decisão desta rodada foi aceitar
 * qualquer áudio que o Chrome toque, então basta o navegador chamar aquilo de
 * áudio. Tipo vazio passa — é o que acontece com extensões que o sistema não
 * conhece —, e aí quem julga é o decodificador, que erra em voz alta na hora de
 * tocar (RNF-03.3). Recusar por lista de extensões seria o app decidindo, com
 * menos informação que o navegador, o que o operador pode importar.
 */
function recusarArquivo(file: File): string | null {
  if (file.size === 0) return `"${file.name}" está vazio.`
  if (file.type && !file.type.startsWith('audio/'))
    return `"${file.name}" não é um arquivo de áudio.`
  return null
}

/** O nome de uma falha, seja ela `Error` ou `DOMException`. */
function errorName(error: unknown): string {
  if (error instanceof Error) return error.name
  if (error instanceof DOMException) return error.name
  return ''
}

/**
 * Traduz uma falha de gravação do cofre para o operador (RNF-03.3).
 *
 * A quota estourada é a única que ganha texto próprio, porque é a única
 * **acionável**: a saída é apagar áudio que não se usa mais. Engolir esse erro
 * seria o pior desfecho possível — o operador importaria o louvor achando que
 * salvou e descobriria no domingo que não.
 */
function describeStorageError(error: unknown, fileName: string): string {
  const nome = errorName(error)
  if (nome === 'QuotaExceededError' || nome === 'NS_ERROR_DOM_QUOTA_REACHED') {
    return `Não há espaço no navegador para "${fileName}". Remova áudios importados que você não usa mais e tente de novo.`
  }
  return `Não foi possível guardar "${fileName}" no dispositivo.`
}

export interface AudioEngineOptions {
  store: CronoStore
  /** O relógio do motor. Trocado nos testes. */
  scheduler?: FrameScheduler
  /**
   * Como nascem os players do YouTube. Trocado nos testes por um dublê.
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
  /**
   * Como nasce o backend de áudio local. Trocado nos testes por um dublê, e
   * espelha o `createChannel` do YouTube — inclusive o segundo argumento com o
   * canal, que o `createLocalAudioChannel` de produção ignora.
   */
  createLocalChannel?: (
    options: CreateLocalChannelOptions,
    channel: ChannelName,
  ) => MediaChannel
  /**
   * Onde os bytes dos áudios importados moram. Trocado nos testes por um cofre
   * de memória, para nenhum teste de costura precisar de IndexedDB.
   */
  blobs?: BlobVault
  /**
   * Resolve o `blobId` de um item local nos bytes → object URL que o `<audio>`
   * toca, ou `null` se o blob sumiu do cofre. Quem faz isso é a **costura**, não
   * o backend local (RNF-04.2): o motor é o único que fala com o store. Trocado
   * nos testes por um dublê que não depende do IndexedDB nem do `URL`.
   */
  resolveBlobUrl?: (blobId: string) => Promise<string | null>
  /** Revoga uma object URL criada por `resolveBlobUrl` (RNF-04.2). */
  revokeBlobUrl?: (url: string) => void
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
   * Refaz os players do YouTube que não conseguiram nascer.
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

  /**
   * Importa arquivos de áudio do PC para a fila (RF-11.1).
   *
   * Passa pelo motor, e não direto pelo store, porque importar é **duas coisas
   * numa**: gravar megabytes no cofre e criar o item que aponta para eles. Só
   * quem faz as duas em ordem consegue garantir que não sobra item sem áudio
   * nem áudio sem item — e é aqui que a falta de espaço vira frase na tela em
   * vez de exceção no console (RNF-03.3).
   *
   * `name` é quem vai cantar, e vale para todos os arquivos da mesma escolha.
   */
  importQueueFiles(files: readonly File[], name?: string): Promise<void>
  /** O mesmo para a biblioteca de fundos (RF-11.2). */
  importBackgroundFiles(files: readonly File[]): Promise<void>
  /**
   * Apaga os áudios que nenhum item referencia mais (RF-11.5).
   *
   * Roda sozinho na abertura; existe em público para quem **troca o estado
   * inteiro** — importar um backup substitui fila e biblioteca de uma vez, e
   * todos os áudios da instalação anterior viram órfãos no mesmo instante.
   * Esperar a próxima abertura para recolhê-los seria deixar o dispositivo
   * ocupado com áudio de outro culto.
   */
  sweepOrphanAudio(): void

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
    createLocalChannel = createLocalAudioChannel,
    blobs = blobVault,
    // Derivado do cofre de propósito: trocar `blobs` num teste já troca a
    // resolução inteira, e sobra só o `URL.createObjectURL` — que é browser, não
    // armazenamento — para quem precisar trocar separado.
    resolveBlobUrl = async (blobId: string) => {
      const blob = await blobs.get(blobId)
      return blob ? URL.createObjectURL(blob) : null
    },
    revokeBlobUrl = defaultRevokeBlobUrl,
    pollMs = POLL_MS,
  } = options

  const listeners = new Set<() => void>()
  let snapshot: EngineSnapshot = EMPTY_SNAPSHOT
  let destroyed = false

  /** O backend do YouTube de cada canal — o iframe persistente. */
  const youtube: Record<ChannelName, MediaChannel | null> = {
    main: null,
    background: null,
  }
  /**
   * O backend de áudio local de cada canal — o `<audio>` que fica ao lado do
   * iframe (D2). Nasce sob demanda: só existe depois que o canal precisa tocar
   * um item local pela primeira vez.
   */
  const local: Record<ChannelName, MediaChannel | null> = {
    main: null,
    background: null,
  }
  /**
   * Qual backend é a **voz** do canal agora — para onde o volume e o transporte
   * do mixer vão. `null` enquanto nada foi carregado. Trocar de valor pausa o
   * backend anterior, para o inativo ficar em silêncio de verdade.
   */
  const active: Record<ChannelName, MediaKind | null> = {
    main: null,
    background: null,
  }
  /**
   * A object URL que o backend local de cada canal está tocando, guardada só
   * para revogá-la quando a faixa troca ou no `destroy` (RNF-04.2). Criar e
   * revogar a URL é da costura; o backend local a recebe pronta.
   */
  const localUrl: Record<ChannelName, string | null> = {
    main: null,
    background: null,
  }
  /**
   * Sobe a cada novo pedido de carga num canal. A resolução assíncrona do blob
   * captura o valor de agora; se um pedido mais novo chegar antes de ela
   * terminar (o operador trocou de faixa, ou removeu o item), o token não
   * confere e a resolução velha se descarta — revogando a URL que criou à toa —
   * em vez de tocar algo que já não é mais para tocar.
   */
  const loadToken: Record<ChannelName, number> = {
    main: 0,
    background: 0,
  }
  /** Que mídia está carregada em cada canal (chave do `kind`), para não recarregar à toa. */
  const loaded: Record<ChannelName, string | null> = {
    main: null,
    background: null,
  }
  /** Cria um player do YouTube por vez, por canal, mesmo com React montando duas vezes. */
  const pending: Record<ChannelName, Promise<void> | null> = {
    main: null,
    background: null,
  }
  /** O retângulo da página que cada canal ocupa hoje (do iframe). */
  const hosts: Record<ChannelName, HTMLElement | null> = {
    main: null,
    background: null,
  }
  /** Canal cujo iframe não conseguiu nascer — candidato a nova tentativa. */
  const down: Record<ChannelName, boolean> = {
    main: false,
    background: false,
  }
  /**
   * Mídia engatilhada num canal: escolhida, mas que o backend ativo ainda não
   * pôs no ar.
   *
   * No YouTube, engatilhar é **anotação nossa**, não comando ao iframe — e isso
   * é deliberado. Mandar `cueVideoById` e, no mesmo tique, `playVideo` é uma
   * corrida perdida: os comandos viajam por `postMessage` até o iframe, e o play
   * chega enquanto o cue ainda está buscando o vídeo. O player fica sem vídeo
   * registrado e o play vira erro 2 — "Link do vídeo inválido" no meio do culto,
   * com o fundo mudo. O `loadVideoById` não tem esse problema porque é um
   * comando só, que carrega e toca de uma vez; é ele que resolve o engatilhado
   * quando o mixer manda tocar.
   *
   * No local não há essa corrida: o `cue` já apontou o `src` e mandou o
   * `<audio>` bufferizar, então a partida é só um `play`.
   */
  const cued: Record<ChannelName, MediaRef | null> = {
    main: null,
    background: null,
  }
  /**
   * O que o canal deveria estar fazendo enquanto o backend ativo ainda não pode
   * receber a mídia — o iframe nascendo, ou o blob local sendo resolvido.
   *
   * O script da API do YouTube leva um tempo para baixar, e o operador não
   * espera: ele abre o app e já manda tocar. Sem guardar o pedido, ele se perde
   * no ar — o botão responde, a topbar muda e não sai som.
   *
   * `autoplay` acompanha o pedido porque ele pode mudar de ideia no caminho: uma
   * faixa engatilhada que o mixer resolve tocar antes de o backend estar pronto
   * vira autoplay na chegada.
   */
  interface PedidoPendente {
    ref: MediaRef
    autoplay: boolean
  }
  const pendingLoad: Record<ChannelName, PedidoPendente | null> = {
    main: null,
    background: null,
  }
  let poll: number | null = null

  const state = () => store.getState()

  // --- o roteamento entre backends ----------------------------------------

  const backendFor = (
    channel: ChannelName,
    kind: MediaKind | null,
  ): MediaChannel | null => {
    if (kind === 'youtube') return youtube[channel]
    if (kind === 'local') return local[channel]
    return null
  }

  /** O backend que é a voz do canal agora — ou `null` se nada foi carregado. */
  const activeBackend = (channel: ChannelName): MediaChannel | null =>
    backendFor(channel, active[channel])

  /**
   * Conta à tela quem é a voz do louvor. Chamado a cada mudança de `active`,
   * porque é ela — e não o item da fila — que a pré-escuta precisa seguir.
   */
  const publicarVozDoLouvor = (): void => publish({ mainKind: active.main })

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

    // O mixer anuncia o volume; aqui ele vira comando do backend ativo. O
    // inativo fica pausado (silencioso) e não recebe volume.
    onVolume: (channel, volume) => {
      activeBackend(channel)?.setVolume(volume)
      publishFromMixer()
    },

    onTransport: (channel, action) => {
      const backend = activeBackend(channel)
      // Backend ativo ainda não pronto — o iframe nascendo, ou o blob local
      // sendo resolvido. O comando não pode se perder no ar: vira intenção no
      // pedido guardado, e chega junto com a mídia.
      if (!backend || pendingLoad[channel]) {
        const pedido = pendingLoad[channel]
        if (pedido) pedido.autoplay = action === 'play'
        return
      }
      if (action === 'pause') {
        backend.pause()
        return
      }
      // Canal com faixa engatilhada: quem dá a partida é o `startCued`, no
      // comando certo para cada backend (ver `cued`).
      const engatilhado = cued[channel]
      if (engatilhado !== null) {
        cued[channel] = null
        startCued(channel, engatilhado)
        return
      }
      backend.play()
    },

    onModeChange: () => publishFromMixer(),
  })

  // --- os players ---------------------------------------------------------

  const algumCaido = (): boolean => down.main || down.background

  /**
   * Solta o backend do YouTube de um canal, sem mexer em quem é o dono do
   * retângulo.
   *
   * Só zera o que descreve a mídia (`loaded`/`cued`/`pendingLoad`/`active`) se o
   * YouTube era mesmo a voz do canal: se um item local estava tocando, o
   * retângulo do iframe pode ter saído da árvore, mas o `<audio>` ao lado segue
   * — o estado dele não pode ser apagado junto.
   */
  const releaseYouTube = (channel: ChannelName): void => {
    youtube[channel]?.destroy()
    youtube[channel] = null
    if (active[channel] === 'youtube') {
      loaded[channel] = null
      cued[channel] = null
      pendingLoad[channel] = null
      active[channel] = null
      publicarVozDoLouvor()
    }
  }

  /** Cria o backend local do canal sob demanda, já no volume atual do mixer. */
  const ensureLocal = (channel: ChannelName): MediaChannel => {
    const existing = local[channel]
    if (existing) return existing
    const backend = createLocalChannel(
      {
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
    local[channel] = backend
    // O backend nasce em volume cheio, e o mixer só avisa quando o valor MUDA.
    // Sem esta linha, a primeira entrada de um item local sairia no volume
    // máximo antes do primeiro quadro do fade — o mesmo cuidado do iframe.
    backend.setVolume(mixer.getVolume(channel))
    startPolling()
    return backend
  }

  const attach = (
    channel: ChannelName,
    container: HTMLElement | null,
  ): void => {
    if (destroyed) return

    if (!container) {
      hosts[channel] = null
      down[channel] = false
      releaseYouTube(channel)
      publish({ playerDown: algumCaido() })
      return
    }

    // O retângulo mudou de nó (remontagem da árvore): o player velho ficou
    // preso a um elemento que já saiu da página.
    if (hosts[channel] !== null && hosts[channel] !== container) {
      releaseYouTube(channel)
    }
    hosts[channel] = container

    if (youtube[channel] || pending[channel]) return
    spawn(channel, container)
  }

  /** Monta um iframe do YouTube novo no retângulo do canal. */
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
        youtube[channel] = created
        // O player nasce em volume 100; o mixer só avisa quando o valor MUDA,
        // e no silêncio ele não muda. Sem esta linha, o primeiro play sairia
        // no volume cheio antes do primeiro quadro do fade.
        created.setVolume(mixer.getVolume(channel))

        // Pedido que chegou enquanto ele nascia — mas só se ainda for do
        // YouTube. Se um item local passou a ser a voz do canal nesse
        // meio-tempo, o iframe nasce ocioso: quem manda agora é o `<audio>`.
        const pedido = pendingLoad[channel]
        if (pedido && pedido.ref.kind === 'youtube') {
          pendingLoad[channel] = null
          if (pedido.autoplay) created.load(pedido.ref.videoId)
          else cued[channel] = pedido.ref
        }

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

  /** Refaz um iframe caído, se houver retângulo esperando por ele. */
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
   * Dá a partida numa faixa engatilhada, do jeito certo para cada backend.
   *
   * No YouTube, engatilhar foi anotação nossa (nada foi ao iframe): a partida é
   * um `load`, um comando só que evita a corrida cue/play. No local, o `cue` já
   * apontou o `src`; a partida é só um `play`, sem re-apontar o arquivo.
   */
  const startCued = (channel: ChannelName, ref: MediaRef): void => {
    if (ref.kind === 'youtube') {
      youtube[channel]?.load(ref.videoId)
      return
    }
    local[channel]?.play()
  }

  /**
   * Resolve o blob de um item local e entrega a URL ao backend — ou reporta que
   * o arquivo sumiu (RF-11.5/6). Assíncrono; o `token` garante que uma resolução
   * ultrapassada por um pedido mais novo se descarte sem tocar nada.
   */
  /**
   * A resolução do blob, blindada.
   *
   * Uma exceção escapando daqui (o `createObjectURL` recusando um blob
   * inválido) deixaria o `pendingLoad` do canal de pé para sempre — e um canal
   * com pedido pendente **engole todo play e pause** do mixer. O painel
   * responderia aos botões, a topbar mudaria, e não sairia som nenhum, sem
   * aviso. Uma falha aqui vira "arquivo não encontrado", que o canal já sabe
   * tratar e o operador já sabe ler.
   */
  const resolverUrl = async (blobId: string): Promise<string | null> => {
    try {
      return await resolveBlobUrl(blobId)
    } catch {
      return null
    }
  }

  const resolveLocal = async (
    channel: ChannelName,
    ref: LocalRef,
    token: number,
  ): Promise<void> => {
    const url = await resolverUrl(ref.blobId)

    if (destroyed || loadToken[channel] !== token) {
      // Pedido ultrapassado (troca/remoção de faixa) ou motor desmontado: a URL
      // recém-criada não vai a lugar nenhum — revoga para não vazar (RNF-04.2).
      if (url) revokeBlobUrl(url)
      return
    }

    const pedido = pendingLoad[channel]
    pendingLoad[channel] = null
    const autoplay = pedido?.autoplay ?? false

    if (!url) {
      // Blob ausente: o backend local traduz num erro visível (NO_SOURCE), sem
      // som, reaproveitando o caminho de erro que a tela já sabe mostrar.
      local[channel]?.load('')
      // E o canal fica **sem voz**. Sem isto, o `<audio>` continuaria com o
      // `src` da faixa anterior no elemento (o `load('')` recusa a troca sem
      // arquivo), e o próximo play do mixer tocaria a faixa velha com a tela
      // anunciando a nova — som e tela discordando, que é o que este projeto
      // não admite. Zerar o `active` faz o transporte não achar backend nenhum.
      revokeLocalUrl(channel)
      loaded[channel] = null
      active[channel] = null
      publicarVozDoLouvor()
      return
    }

    const previous = localUrl[channel]
    localUrl[channel] = url
    if (autoplay) {
      cued[channel] = null
      local[channel]?.load(url)
    } else {
      cued[channel] = ref
      local[channel]?.cue(url)
    }
    // Revoga a URL da faixa anterior só depois que a nova já está no `<audio>`.
    if (previous && previous !== url) revokeBlobUrl(previous)
  }

  /** Revoga a object URL que o backend local do canal segurava (RNF-04.2). */
  const revokeLocalUrl = (channel: ChannelName): void => {
    const url = localUrl[channel]
    if (url) revokeBlobUrl(url)
    localUrl[channel] = null
  }

  /**
   * Cancela de vez o que o canal ia carregar — a mídia que **deixou de existir**.
   *
   * São duas coisas, e as duas importam. O `loadToken` invalida uma resolução de
   * blob em voo, para ela não tocar depois de a faixa ter saído. E o
   * `pendingLoad` some junto, porque um pedido pendente órfão é pior do que
   * inútil: enquanto ele estiver de pé, o `onTransport` **engole todo play e
   * pause** do canal (ele os interpreta como intenção para a mídia que está
   * chegando). O sintoma é cruel — o operador remove um arquivo, põe o próximo
   * vídeo no ar, aperta pausa, e o vídeo continua tocando mudo, porque o comando
   * nunca chegou ao player.
   */
  const cancelLoad = (channel: ChannelName): void => {
    loadToken[channel] += 1
    pendingLoad[channel] = null
  }

  /**
   * Tira o autoplay de uma carga local ainda em voo.
   *
   * É o que "parar" precisa: o operador mandou o canal sair do ar, mas o blob
   * ainda está sendo lido do disco. Sem isto a resolução chega no meio da rampa
   * de saída e **começa a tocar** — um susto de meio segundo da faixa que
   * acabou de ser parada.
   *
   * Não cancela a carga, só desarma a partida: a faixa fica engatilhada, pronta
   * para entrar se o operador se arrepender no meio da descida (RF-04.10).
   */
  const desarmarAutoplay = (channel: ChannelName): void => {
    const pedido = pendingLoad[channel]
    if (pedido) pedido.autoplay = false
  }

  /**
   * Escolhe a mídia de um canal e a roteia para o backend certo.
   *
   * Com `autoplay`, vai direto ao backend (o `load` do YouTube carrega e toca de
   * uma vez; o local resolve o blob e toca). Sem, fica **engatilhada** em `cued`:
   * o backend não recebe partida agora, e a mídia entra no instante em que o
   * mixer mandar tocar.
   */
  const put = (
    channel: ChannelName,
    ref: MediaRef,
    autoplay: boolean,
  ): void => {
    loaded[channel] = refKey(ref)
    const token = (loadToken[channel] += 1)
    // A mídia engatilhada acabou de ser substituída, seja qual for o backend.
    // Zerar aqui, e não só nos ramos que a reescrevem, é o que impede um
    // engatilhado velho de sobreviver a uma carga que não chegou ao fim — e de
    // entrar no ar no lugar da faixa que a tela está mostrando.
    cued[channel] = null

    // Trocar o backend ativo do canal (YouTube ↔ local): silencia o anterior e
    // leva o novo ao volume de agora, para ele não entrar num salto.
    if (active[channel] !== ref.kind) {
      backendFor(channel, active[channel])?.pause()
      active[channel] = ref.kind
      backendFor(channel, ref.kind)?.setVolume(mixer.getVolume(channel))
      publicarVozDoLouvor()
    }

    if (ref.kind === 'youtube') {
      const player = youtube[channel]
      if (!player) {
        // Iframe ainda nascendo — ou caído. O pedido fica de pé e é aplicado na
        // chegada; a ação do operador é o pedido de nova tentativa mais natural
        // que existe, então ela também remonta o que caiu.
        pendingLoad[channel] = { ref, autoplay }
        retry(channel)
        return
      }
      if (!autoplay) {
        cued[channel] = ref
        return
      }
      cued[channel] = null
      player.load(ref.videoId)
      return
    }

    // Local: o backend nasce agora (barato), mas a URL do blob vem de uma
    // leitura assíncrona do cofre. Até ela chegar, o pedido fica pendente — como
    // o iframe nascendo —, e o transporte que vier atualiza o autoplay.
    ensureLocal(channel)
    pendingLoad[channel] = { ref, autoplay }
    void resolveLocal(channel, ref, token)
  }

  /**
   * Carrega já tocando. É o que o louvor quer: todo caminho que troca o vídeo do
   * louvor é o operador mandando tocar **agora**, e nem sempre o mixer manda um
   * `play` atrás (quando ele já está no ar, ou descendo, o transporte não
   * repete o comando).
   */
  const load = (channel: ChannelName, ref: MediaRef): void =>
    put(channel, ref, true)

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
  const engatilhar = (channel: ChannelName, ref: MediaRef): void =>
    put(channel, ref, false)

  /**
   * Garante que o fundo tem faixa engatilhada antes de precisar dela.
   *
   * O mixer manda "toque o fundo" sem saber se há mídia lá dentro. Chamar isto
   * antes de qualquer caminho que devolva o fundo evita o pior silêncio de
   * todos: o que acontece quando a música acaba e nada entra no lugar.
   */
  const ensureBackgroundLoaded = (): void => {
    const track = state().selectedBackground()
    if (!track) return
    const ref = toMediaRef(track)
    if (loaded.background === refKey(ref)) return
    engatilhar('background', ref)
  }

  // --- o tempo ------------------------------------------------------------

  const startPolling = (): void => {
    if (poll !== null || destroyed) return
    poll = window.setInterval(tickTime, pollMs)
  }

  /**
   * Lê o relógio dos backends ativos.
   *
   * O iframe não avisa o tempo passar — não existe evento de progresso —, então
   * perguntamos. Quatro vezes por segundo é o suficiente para o cronômetro da
   * topbar não parecer travado e pouco o bastante para não pesar. Para um item
   * local, `getDuration` já devolve a duração do arquivo assim que os metadados
   * carregam, então a duração do MP3 é anotada sem oEmbed (RF-11.3).
   */
  const tickTime = (): void => {
    const main = activeBackend('main')
    const background = activeBackend('background')
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
    const ref = toMediaRef(item)
    const { mode, currentId } = state()

    publish({ error: null })
    ensureBackgroundLoaded()

    if (mode === 'main' && currentId === id) return

    if (mode === 'main') {
      // Já tem alguém no ar: a música atual sai com fade antes da troca
      // (RF-04.4) — o operador nunca ouve corte seco.
      mixer.swap('main', () => {
        state().play(id)
        load('main', ref)
        publish({ elapsedSec: 0 })
      })
      return
    }

    state().play(id)
    load('main', ref)
    publish({ elapsedSec: 0 })
    // Com o fundo tocando isto vira crossfade: ele desce enquanto o louvor
    // sobe, sem corte (RF-04.5). O louvor e o fundo podem ser de fontes
    // diferentes (um MP3 local e um vídeo do YouTube), e o crossfade continua
    // sendo só dois `setVolume` em backends distintos (RF-11.4).
    mixer.playMain()
  }

  const finishMain = (): void => {
    const atual = state().currentId
    if (atual === null) return
    ensureBackgroundLoaded()
    // Acabar sozinho é o caminho **normal** de um louvor: o `finish` tira o item
    // da fila e o manda para o histórico, que não guarda `blobId` nem toca de
    // novo. Sem esta linha, um culto de oito arquivos terminaria com oito
    // áudios sem dono ocupando a quota — e a próxima importação poderia ouvir
    // "não há espaço" por causa de música que já foi cantada (RF-11.5).
    const item = state().findQueueItem(atual)
    state().finish()
    if (item?.kind === 'local') descartarSeOrfao(item.blobId)
    // O som já acabou sozinho: fade de silêncio só atrasaria o fundo.
    mixer.mainEnded()
    publish({ elapsedSec: 0 })
    publishFromMixer()
  }

  const backgroundEnded = (): void => {
    const { backgrounds } = state()
    if (backgrounds.length === 0) return
    // Com uma faixa só, "a próxima" é ela mesma — e a faixa recomeça (RF-03.6).
    state().nextBackground()
    const track = state().selectedBackground()
    if (!track) return
    engatilhar('background', toMediaRef(track))
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
    // Um arquivo local ainda sendo lido do disco não pode chegar tocando no meio
    // da saída — ver `desarmarAutoplay`.
    desarmarAutoplay('main')
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
    desarmarAutoplay('background')
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
      if (track) engatilhar('background', toMediaRef(track))
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
      if (track) engatilhar('background', toMediaRef(track))
      publish({ backgroundElapsedSec: 0 })
    }

    if (state().mode === 'background') mixer.swap('background', trocar)
    else trocar()
  }

  /**
   * Guarda uma faixa na biblioteca — ver a interface.
   *
   * Mora fora do objeto devolvido porque a importação de arquivos também
   * precisa dela: um fundo que entra por arquivo tem que obedecer à mesma regra
   * de "a primeira da biblioteca vazia já toca" que um que entra por link.
   */
  const addBackground = (track: NewBackground): string => {
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
  }

  // --- áudio local: importar e faxinar ------------------------------------

  let persistenciaPedida = false

  /**
   * Pede ao navegador que não descarte o armazenamento deste site (RF-11).
   *
   * Sem isto os áudios ficam em armazenamento "best-effort", que o Chrome pode
   * limpar sozinho quando o disco aperta — e o operador só descobriria no
   * domingo, com o louvor sumido. É pedido no **primeiro import** porque é aí
   * que o app passa a guardar megabytes; antes disso não há o que proteger.
   *
   * A recusa é silenciosa de propósito: o navegador decide por conta própria, o
   * operador não tem o que fazer a respeito, e a importação funciona do mesmo
   * jeito. Um aviso aqui seria ruído sem ação.
   */
  const pedirPersistencia = async (): Promise<void> => {
    if (persistenciaPedida) return
    persistenciaPedida = true
    try {
      const manager: StorageManager | undefined = navigator.storage
      if (!manager?.persist || !manager.persisted) return
      if (await manager.persisted()) return
      await manager.persist()
    } catch {
      // Navegador sem a API, ou que recusou: seguimos sem a garantia.
    }
  }

  /**
   * Apaga bytes do cofre sem alarme.
   *
   * É a exceção deliberada ao "erro nunca some calado" (RNF-03.3): apagar bytes
   * é faxina, não som. Não há nada que o operador possa fazer com esse aviso no
   * meio do culto, e a varredura da próxima abertura repete a tentativa.
   */
  const apagarBytes = async (blobId: string): Promise<void> => {
    try {
      await blobs.delete(blobId)
    } catch {
      // Ver acima: a varredura da próxima abertura tenta de novo (RF-11.5).
    }
  }

  /**
   * Apaga os bytes de um áudio que acabou de perder o dono (RF-11.5).
   *
   * Confere antes se **mais alguém** aponta para o mesmo `blobId`: nada impede
   * que um arquivo esteja ao mesmo tempo na fila e nos fundos, e apagar os bytes
   * por causa de um deles deixaria o outro mudo.
   */
  const descartarSeOrfao = (blobId: string): void => {
    const { queue, backgrounds } = state()
    const aindaTemDono =
      queue.some((item) => item.kind === 'local' && item.blobId === blobId) ||
      backgrounds.some(
        (track) => track.kind === 'local' && track.blobId === blobId,
      )
    if (aindaTemDono) return
    void apagarBytes(blobId)
  }

  /**
   * Bytes já gravados cujo item ainda não entrou no store.
   *
   * Janela curta — dura de um `await` a outro —, mas real: se a varredura de
   * órfãos passasse exatamente ali, ela veria bytes sem dono e apagaria o
   * arquivo que o operador acabou de importar. Guardá-los aqui fecha a janela.
   */
  const gravandoAgora = new Set<string>()

  let varreduraFeita = false

  /**
   * A varredura de órfãos da abertura (RF-11.5): bytes no cofre que item nenhum
   * referencia.
   *
   * Existe porque a faxina do momento da remoção pode não acontecer — o
   * navegador fechado no meio da gravação, uma aba morta entre o `put` e o
   * item, um estado restaurado de backup. Sem ela, esses megabytes ficariam para
   * sempre ocupando a quota de um app que não sabe mais o que são.
   *
   * **Só pode rodar depois da hidratação.** Antes dela o store está vazio, e uma
   * varredura ali entenderia a biblioteca inteira do operador como lixo. Roda
   * uma vez por motor e falha calada, pelo mesmo motivo do `apagarBytes`.
   */
  const varrerOrfaos = async (forcada = false): Promise<void> => {
    if ((varreduraFeita && !forcada) || destroyed) return
    varreduraFeita = true
    try {
      const guardados = await blobs.list()
      if (destroyed || guardados.length === 0) return

      const comDono = new Set<string>()
      for (const item of state().queue)
        if (item.kind === 'local') comDono.add(item.blobId)
      for (const track of state().backgrounds)
        if (track.kind === 'local') comDono.add(track.blobId)

      for (const id of guardados) {
        if (!comDono.has(id) && !gravandoAgora.has(id)) await blobs.delete(id)
      }
    } catch {
      // Cofre indisponível: a próxima abertura tenta de novo (RF-11.5).
    }
  }

  /**
   * O caminho comum das duas importações: valida, grava os bytes e só então
   * registra o item.
   *
   * A ordem não é detalhe. Gravar primeiro e registrar depois significa que uma
   * falha de espaço deixa o app exatamente como estava; a ordem inversa criaria
   * um item na fila apontando para bytes que não existem — o item que aparece na
   * tela e não toca, que é justamente o que o RF-11.5 quer evitar.
   */
  const guardarArquivos = async (
    files: readonly File[],
    registrar: (file: File, blobId: string) => void,
  ): Promise<void> => {
    if (files.length === 0) return
    void pedirPersistencia()

    const recusados: string[] = []

    for (const file of files) {
      const recusa = recusarArquivo(file)
      if (recusa) {
        recusados.push(recusa)
        continue
      }

      const blobId = createId('ab')
      gravandoAgora.add(blobId)
      try {
        await blobs.put(blobId, file)
      } catch (error) {
        gravandoAgora.delete(blobId)
        // Para no primeiro tropeço de gravação: a falha é do dispositivo, não
        // do arquivo, então os seguintes falhariam igual — e a tela ficaria com
        // uma pilha de avisos dizendo a mesma coisa.
        publish({ error: describeStorageError(error, file.name) })
        return
      }

      try {
        // O painel saiu de cena enquanto os bytes gravavam: o item nunca vai
        // existir, então os bytes não podem ficar (RNF-04.2, RF-11.5).
        if (destroyed) {
          void apagarBytes(blobId)
          return
        }
        registrar(file, blobId)
      } finally {
        // Sempre — inclusive se `registrar` explodir. Um `blobId` esquecido
        // aqui nunca mais seria varrido, e aqueles bytes ficariam para sempre.
        gravandoAgora.delete(blobId)
      }
    }

    // Uma frase só para todas as recusas: dizer apenas a última faria o
    // operador achar que os outros entraram.
    if (recusados.length === 1) publish({ error: recusados[0] })
    else if (recusados.length > 1) {
      publish({
        error: `${recusados[0]} Outros ${recusados.length - 1} arquivo(s) também ficaram de fora.`,
      })
    }
  }

  const importQueueFiles = (files: readonly File[], name = ''): Promise<void> =>
    guardarArquivos(files, (file, blobId) => {
      // Sem oEmbed e sem `parseVideoId`: não há rede envolvida, e o título já
      // chega pronto — é o nome do arquivo, que é como o operador reconhece a
      // faixa no PC dele. A duração o próprio `<audio>` anota ao carregar.
      state().addToQueue({
        kind: 'local',
        name,
        title: file.name,
        blobId,
        fileName: file.name,
      })
    })

  const importBackgroundFiles = (files: readonly File[]): Promise<void> =>
    guardarArquivos(files, (file, blobId) => {
      addBackground({
        kind: 'local',
        title: file.name,
        blobId,
        fileName: file.name,
      })
    })

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

  // A varredura de órfãos espera o disco responder — ver `varrerOrfaos`. Os
  // dois caminhos existem porque a hidratação pode terminar antes de o motor
  // nascer (armazenamento síncrono) ou depois (IndexedDB); `varreduraFeita`
  // garante que só um deles vale.
  const unsubscribeHydration = store.persist.onFinishHydration(() => {
    void varrerOrfaos()
  })
  if (store.persist.hasHydrated()) void varrerOrfaos()

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
          // O mixer cancela a rampa **sem** reemitir "toque": para ele o canal
          // nunca deixou de tocar, e no YouTube isso está certo — o iframe
          // seguiu rodando o tempo todo, só baixo. Mas uma faixa que ficou
          // apenas engatilhada precisa de partida: é o arquivo local cujo disco
          // respondeu **depois** do "parar" (ver `desarmarAutoplay`). Sem esta
          // partida, o arrependimento devolveria o volume de um canal em
          // silêncio — a topbar anunciando NO AR e a igreja sem som.
          const engatilhado = cued.main
          if (engatilhado !== null) {
            cued.main = null
            startCued('main', engatilhado)
          }
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

    addBackground,
    importQueueFiles,
    importBackgroundFiles,

    sweepOrphanAudio() {
      void varrerOrfaos(true)
    },

    removeBackground(id) {
      const eraSelecionada = state().selectedBackgroundId === id
      const removida = state().backgrounds.find((track) => track.id === id)
      state().removeBackground(id)
      // A faixa saiu da biblioteca: os bytes dela não têm mais dono (RF-11.5).
      if (removida?.kind === 'local') descartarSeOrfao(removida.blobId)
      if (!eraSelecionada) return

      const track = state().selectedBackground()
      if (!track) {
        // Biblioteca vazia: o fundo cai. Invalida uma resolução de blob em voo
        // (não vá ela tocar um fundo que não existe mais) e revoga a URL atual.
        //
        // `active` **não** é zerado aqui: o backend continua sendo a voz do
        // canal até a rampa acabar, e é ela que leva o volume dele a zero de
        // verdade. Zerar antes cortaria o aviso pelo meio e deixaria um player
        // pausado guardando o último volume — pronto para estourar no ar se
        // alguma coisa o religasse.
        cancelLoad('background')
        activeBackend('background')?.pause()
        revokeLocalUrl('background')
        loaded.background = null
        cued.background = null
        mixer.stopBackground()
        publishFromMixer()
        return
      }
      engatilhar('background', toMediaRef(track))
      if (state().mode === 'background') mixer.restart('background')
    },

    removeFromQueue(id) {
      const eraOAtual = state().currentId === id
      const removido = state().findQueueItem(id)
      state().removeFromQueue(id)
      // Tirar da fila quem está no ar tira do ar também — e o som tem que
      // acompanhar a tela. Invalida uma resolução de blob em voo para o item
      // removido não começar a tocar durante a saída.
      if (eraOAtual) {
        cancelLoad('main')
        // A URL é revogada **no fim da rampa**, não agora: o arquivo ainda está
        // saindo do ar, e revogar a fonte de um `<audio>` que toca pode cortar
        // o som no meio da descida (RNF-04.2 sem estragar o fade).
        mixer.stopMain(() => {
          revokeLocalUrl('main')
          loaded.main = null
        })
      }
      if (removido?.kind === 'local') descartarSeOrfao(removido.blobId)
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
      unsubscribeHydration()
      if (poll !== null) window.clearInterval(poll)
      poll = null
      mixer.destroy()
      releaseYouTube('main')
      releaseYouTube('background')
      local.main?.destroy()
      local.background?.destroy()
      revokeLocalUrl('main')
      revokeLocalUrl('background')
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
