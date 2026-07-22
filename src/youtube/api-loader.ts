import type { YouTubeApi } from './types'

/**
 * Carregamento do script da IFrame Player API.
 *
 * O YouTube não expõe um módulo importável: é preciso injetar um `<script>` na
 * página e esperar ele chamar de volta o global `window.onYouTubeIframeAPIReady`.
 * Este módulo embrulha essa dança num `Promise`, com três garantias:
 *
 * 1. **Uma vez só.** Dois canais (louvor e fundo) pedem a API ao mesmo tempo, e
 *    o script tem que entrar na página uma vez — nunca duas.
 * 2. **Falha com voz.** Sem internet, o `<script>` simplesmente não chega e
 *    ninguém avisa. Aqui isso vira um erro com mensagem para o operador
 *    (RNF-03.3), com prazo máximo de espera (RNF-03.4).
 * 3. **Falhar não é definitivo.** Depois de um erro a memória é limpa, então uma
 *    nova tentativa realmente tenta de novo — é o cenário do plano B do
 *    operador, que liga o hotspot do celular e manda recarregar.
 */

/** Endereço oficial do script da IFrame API. */
export const IFRAME_API_URL = 'https://www.youtube.com/iframe_api'

/** Espera máxima até desistir e avisar o operador. */
export const IFRAME_API_TIMEOUT_MS = 15_000

/** A carga em andamento, compartilhada por todos que pedirem enquanto ela roda. */
let pendingLoad: Promise<YouTubeApi> | null = null

/**
 * Devolve a API do YouTube pronta para uso, carregando o script se preciso.
 * Chamadas simultâneas compartilham a mesma carga.
 */
export function loadYouTubeIframeApi(
  timeoutMs: number = IFRAME_API_TIMEOUT_MS,
): Promise<YouTubeApi> {
  const alreadyLoaded = window.YT
  if (alreadyLoaded?.Player) return Promise.resolve(alreadyLoaded)

  pendingLoad ??= startLoading(timeoutMs)
  return pendingLoad
}

/**
 * Esquece a carga em andamento. Existe para os testes poderem começar do zero;
 * o app não precisa chamar isto.
 */
export function resetYouTubeIframeApiLoader(): void {
  pendingLoad = null
}

function startLoading(timeoutMs: number): Promise<YouTubeApi> {
  return new Promise<YouTubeApi>((resolve, reject) => {
    // Outro código pode ter registrado o callback antes de nós (a própria
    // página, uma extensão). Guardamos para chamar e devolver no lugar.
    const previousReadyCallback = window.onYouTubeIframeAPIReady
    const script = findApiScript() ?? injectApiScript()
    let timer: ReturnType<typeof setTimeout> | undefined

    // Um só lugar desfaz tudo o que foi registrado: o timer, o listener de erro
    // e o callback global (RNF-04.2).
    const cleanup = (): void => {
      if (timer !== undefined) clearTimeout(timer)
      timer = undefined
      script.removeEventListener('error', handleScriptError)
      window.onYouTubeIframeAPIReady = previousReadyCallback
    }

    const fail = (message: string): void => {
      cleanup()
      // Solta a memória: a próxima chamada tenta de verdade, em vez de receber
      // esta mesma promessa já rejeitada para sempre.
      pendingLoad = null
      reject(new Error(message))
    }

    const handleReady = (): void => {
      previousReadyCallback?.()
      const api = window.YT
      if (!api?.Player) {
        fail('A API do YouTube carregou incompleta. Recarregue a página.')
        return
      }
      cleanup()
      resolve(api)
    }

    function handleScriptError(): void {
      fail(
        'Não foi possível carregar o player do YouTube. Verifique a conexão com a internet.',
      )
    }

    window.onYouTubeIframeAPIReady = handleReady
    script.addEventListener('error', handleScriptError)
    timer = setTimeout(() => {
      fail(
        'O player do YouTube demorou demais para carregar. Verifique a conexão com a internet.',
      )
    }, timeoutMs)
  })
}

/** O script já pode estar na página (recarga, ou posto pelo index.html). */
function findApiScript(): HTMLScriptElement | null {
  return document.querySelector<HTMLScriptElement>(
    `script[src="${IFRAME_API_URL}"]`,
  )
}

function injectApiScript(): HTMLScriptElement {
  const script = document.createElement('script')
  script.src = IFRAME_API_URL
  script.async = true
  document.head.appendChild(script)
  return script
}
