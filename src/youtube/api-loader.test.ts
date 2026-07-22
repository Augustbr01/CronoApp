import {
  IFRAME_API_URL,
  loadYouTubeIframeApi,
  resetYouTubeIframeApiLoader,
} from './api-loader'
import type { YouTubeApi } from './types'
import { createFakeYouTubeApi } from '../test/fake-youtube'

const { api: fakeApi } = createFakeYouTubeApi()

/** Simula o script do YouTube terminando de carregar. */
function announceApiReady(api: YouTubeApi = fakeApi): void {
  window.YT = api
  window.onYouTubeIframeAPIReady?.()
}

/** O `<script>` que o loader injetou — falha o teste se não houver nenhum. */
function apiScript(): HTMLScriptElement {
  const script = document.querySelector<HTMLScriptElement>(
    `script[src="${IFRAME_API_URL}"]`,
  )
  if (!script) throw new Error('o loader não injetou o script da API')
  return script
}

function injectedScriptCount(): number {
  return document.querySelectorAll(`script[src="${IFRAME_API_URL}"]`).length
}

/**
 * Devolve a página ao estado "YouTube nunca carregou". A suíte roda com
 * `isolate: false`, então os globais são compartilhados: limpamos antes de cada
 * teste **e depois do último**, para não deixar `window.YT` de herança para os
 * outros arquivos.
 */
function resetPage(): void {
  resetYouTubeIframeApiLoader()
  delete window.YT
  delete window.onYouTubeIframeAPIReady
  document
    .querySelectorAll(`script[src="${IFRAME_API_URL}"]`)
    .forEach((script) => script.remove())
}

beforeEach(resetPage)

afterEach(() => {
  vi.useRealTimers()
  resetPage()
})

describe('loadYouTubeIframeApi', () => {
  it('injeta o script e resolve quando a API avisa que está pronta', async () => {
    const loading = loadYouTubeIframeApi()

    expect(injectedScriptCount()).toBe(1)
    expect(apiScript().async).toBe(true)

    announceApiReady()

    await expect(loading).resolves.toBe(fakeApi)
  })

  it('resolve na hora quando a API já está na página, sem injetar script', async () => {
    window.YT = fakeApi

    await expect(loadYouTubeIframeApi()).resolves.toBe(fakeApi)
    expect(injectedScriptCount()).toBe(0)
  })

  it('carrega uma vez só quando os dois canais pedem ao mesmo tempo', async () => {
    const primeiro = loadYouTubeIframeApi()
    const segundo = loadYouTubeIframeApi()

    expect(injectedScriptCount()).toBe(1)

    announceApiReady()

    await expect(primeiro).resolves.toBe(fakeApi)
    await expect(segundo).resolves.toBe(fakeApi)
  })

  it('reaproveita um script já presente na página em vez de injetar outro', async () => {
    const existente = document.createElement('script')
    existente.src = IFRAME_API_URL
    document.head.appendChild(existente)

    const loading = loadYouTubeIframeApi()
    expect(injectedScriptCount()).toBe(1)

    announceApiReady()
    await expect(loading).resolves.toBe(fakeApi)
  })

  it('avisa o operador quando o script não carrega (sem internet)', async () => {
    const loading = loadYouTubeIframeApi()
    apiScript().dispatchEvent(new Event('error'))

    await expect(loading).rejects.toThrow(/conexão com a internet/i)
  })

  it('desiste com aviso quando a API demora demais', async () => {
    vi.useFakeTimers()

    const loading = loadYouTubeIframeApi(1000)
    const rejeicao = expect(loading).rejects.toThrow(/demorou demais/i)
    await vi.advanceTimersByTimeAsync(1000)

    await rejeicao
  })

  it('rejeita quando o script carrega mas não traz o player', async () => {
    const loading = loadYouTubeIframeApi()
    window.onYouTubeIframeAPIReady?.()

    await expect(loading).rejects.toThrow(/incompleta/i)
  })

  it('deixa tentar de novo depois de uma falha (o hotspot do celular)', async () => {
    const primeira = loadYouTubeIframeApi()
    apiScript().dispatchEvent(new Event('error'))
    await expect(primeira).rejects.toThrow()

    // Segunda tentativa: promessa nova, que ainda pode dar certo.
    const segunda = loadYouTubeIframeApi()
    announceApiReady()

    await expect(segunda).resolves.toBe(fakeApi)
  })

  it('limpa o timeout quando resolve (RNF-04.2)', async () => {
    vi.useFakeTimers()

    const loading = loadYouTubeIframeApi(1000)
    announceApiReady()
    await loading

    expect(vi.getTimerCount()).toBe(0)
  })

  it('limpa o timeout quando falha (RNF-04.2)', async () => {
    vi.useFakeTimers()

    const loading = loadYouTubeIframeApi(1000)
    apiScript().dispatchEvent(new Event('error'))
    await expect(loading).rejects.toThrow()

    expect(vi.getTimerCount()).toBe(0)
  })

  it('não atropela um callback que outro código já tinha registrado', async () => {
    const anterior = vi.fn()
    window.onYouTubeIframeAPIReady = anterior

    const loading = loadYouTubeIframeApi()
    announceApiReady()
    await loading

    expect(anterior).toHaveBeenCalledTimes(1)
    expect(window.onYouTubeIframeAPIReady).toBe(anterior)
  })
})
