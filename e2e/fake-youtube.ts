import type { Page } from '@playwright/test'

/**
 * O YouTube de mentira, instalado dentro do navegador de verdade.
 *
 * Os testes de unidade já trocam o player por um dublê em memória. O que **só**
 * o e2e responde é outra coisa: se o app **construído** — o bundle de produção,
 * com IndexedDB de verdade, CSS de verdade e o React montado num Chromium de
 * verdade — leva alguém da busca até o fundo retornar sozinho.
 *
 * Para isso, uma única fronteira é falsificada: a IFrame API do YouTube. Ela
 * fica de fora porque depender do YouTube estar no ar transformaria a suíte num
 * detector de instabilidade da internet, e porque o vídeo não pode tocar de
 * verdade num CI sem áudio.
 *
 * Tudo o mais é o app.
 */

/** O que o teste consegue mandar o player falso fazer, de dentro da página. */
export interface FakeYouTubeControls {
  /** Faz o vídeo do canal informado chegar ao fim, como o YouTube faria. */
  encerrar(canal: 'main' | 'background'): Promise<void>
  /** O volume atual de cada canal, na escala 0–100 do YouTube. */
  volumes(): Promise<{ main: number; background: number }>
  /** Os vídeos carregados em cada canal, na ordem. */
  carregados(): Promise<{ main: string[]; background: string[] }>
}

declare global {
  interface Window {
    __cronoFake?: {
      players: {
        canal: 'main' | 'background'
        loads: string[]
        volume: number
        estado: number
        emitir(estado: number): void
      }[]
    }
    /**
     * A superfície do YouTube que este dublê ocupa.
     *
     * Declarada aqui, e não reaproveitada de `src/youtube/types.ts`, porque os
     * specs compilam num projeto de TypeScript separado do app — o mesmo
     * isolamento que impede um teste de importar código de produção por engano.
     */
    YT?: unknown
    onYouTubeIframeAPIReady?: () => void
  }
}

/**
 * Instala o `window.YT` falso **antes** de qualquer script da página.
 *
 * `addInitScript` roda em todo documento novo, antes do bundle — que é
 * exatamente o que se precisa: o `api-loader` do app procura `window.YT` e, ao
 * encontrá-lo pronto, nem injeta o script do Google.
 *
 * Quem é `main` e quem é `background` sai do tamanho do elemento host: o player
 * do fundo mora num div de 1 px (`.hidden-player`), o do louvor ocupa a
 * pré-escuta. É a única pista disponível de dentro da página, e ela é estável
 * porque vem do CSS do app, não de atributo posto para teste.
 */
export async function instalarYouTubeFalso(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const registro: NonNullable<Window['__cronoFake']> = { players: [] }
    window.__cronoFake = registro

    const ESTADOS = { UNSTARTED: -1, ENDED: 0, PLAYING: 1, PAUSED: 2 }

    class FakePlayer {
      private readonly eventos: Record<
        string,
        ((e: unknown) => void) | undefined
      >
      private readonly entrada: (typeof registro.players)[number]

      constructor(
        host: HTMLElement | string,
        options: Record<string, unknown>,
      ) {
        const elemento =
          typeof host === 'string' ? document.getElementById(host) : host
        const pai = elemento?.parentElement
        // O fundo é o player escondido de 1 px; o resto é o louvor.
        const canal: 'main' | 'background' =
          pai?.closest('.hidden-player') !== null &&
          pai?.closest('.hidden-player') !== undefined
            ? 'background'
            : 'main'

        this.eventos = (options.events ?? {}) as Record<
          string,
          ((e: unknown) => void) | undefined
        >
        this.entrada = {
          canal,
          loads: [],
          volume: 100,
          estado: ESTADOS.UNSTARTED,
          emitir: (estado: number) => {
            this.entrada.estado = estado
            this.eventos.onStateChange?.({ target: this, data: estado })
          },
        }
        registro.players.push(this.entrada)

        // O `onReady` do YouTube chega depois do construtor retornar. Manter
        // essa assincronia é o que faz o dublê exercitar o mesmo caminho do
        // player de verdade no app.
        setTimeout(() => {
          this.eventos.onReady?.({ target: this })
        }, 0)
      }

      loadVideoById(videoId: string) {
        this.entrada.loads.push(videoId)
        this.entrada.emitir(ESTADOS.PLAYING)
      }
      cueVideoById(videoId: string) {
        this.entrada.loads.push(videoId)
      }
      playVideo() {
        this.entrada.emitir(ESTADOS.PLAYING)
      }
      pauseVideo() {
        this.entrada.emitir(ESTADOS.PAUSED)
      }
      stopVideo() {}
      seekTo() {}
      setVolume(volume: number) {
        this.entrada.volume = volume
      }
      getVolume() {
        return this.entrada.volume
      }
      getPlayerState() {
        return this.entrada.estado
      }
      getCurrentTime() {
        return 0
      }
      getDuration() {
        return 0
      }
      destroy() {
        const i = registro.players.indexOf(this.entrada)
        if (i >= 0) registro.players.splice(i, 1)
      }
    }

    window.YT = { Player: FakePlayer }
    window.onYouTubeIframeAPIReady?.()
  })
}

/** As alavancas que o teste usa para mexer no player falso. */
export function controlarYouTubeFalso(page: Page): FakeYouTubeControls {
  return {
    async encerrar(canal) {
      await page.evaluate((alvo) => {
        const player = window.__cronoFake?.players.find((p) => p.canal === alvo)
        player?.emitir(0)
      }, canal)
    },

    volumes() {
      return page.evaluate(() => {
        const achar = (canal: string) =>
          window.__cronoFake?.players.find((p) => p.canal === canal)?.volume ??
          0
        return { main: achar('main'), background: achar('background') }
      })
    },

    carregados() {
      return page.evaluate(() => {
        const achar = (canal: string) =>
          window.__cronoFake?.players.find((p) => p.canal === canal)?.loads ??
          []
        return { main: achar('main'), background: achar('background') }
      })
    },
  }
}
