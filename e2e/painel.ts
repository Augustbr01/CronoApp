import type { Page } from '@playwright/test'
import { instalarYouTubeFalso } from './fake-youtube'

/**
 * Abre o painel no estado em que ele passa a vida: **já configurado**.
 *
 * Cada teste do Playwright ganha um perfil limpo, o que significa IndexedDB
 * vazio e, portanto, primeiro arranque — com a tela de boas-vindas por cima de
 * tudo. Só que o primeiro arranque acontece uma vez na vida da instalação; o
 * resto do tempo o operador abre um painel que já sabe de quem é.
 *
 * Fazer todo teste de fila, de fader e de layout começar dispensando um diálogo
 * seria ruído em cima de coisa que não está sendo testada — e esconderia, atrás
 * de um clique repetido, o que cada um deles realmente verifica.
 *
 * Quem testa o primeiro arranque de propósito é
 * [primeiro-arranque.spec.ts](primeiro-arranque.spec.ts), que **não** usa isto.
 */
export async function abrirPainel(page: Page): Promise<void> {
  await page.goto('/')

  // Sem `if`: cada teste ganha um perfil novo, então a tela de boas-vindas
  // está **sempre** lá. Perguntar antes (`isVisible()`) responderia `false`
  // quando o React ainda não montou o diálogo, o clique seria pulado e ele
  // apareceria no meio do teste — foi assim que três specs ficaram
  // intermitentes. O `click` espera o elemento sozinho; o condicional é que
  // não esperava nada.
  await page.getByRole('button', { name: 'Agora não' }).click()
}

/** O par completo: YouTube falso instalado e painel aberto e configurado. */
export async function prepararPainel(page: Page): Promise<void> {
  await instalarYouTubeFalso(page)
  await abrirPainel(page)
}

/**
 * As preferências como estão **no IndexedDB**, não em memória.
 *
 * A gravação do `persist` é assíncrona: a tela muda no mesmo quadro, o disco
 * responde um instante depois. Recarregar entre as duas coisas lê o estado
 * anterior — o que num teste vira intermitência e, na vida real, seria a
 * escolha do operador se perdendo se ele fechasse o notebook no mesmo segundo.
 *
 * Use com `expect.poll`: ler o registro direto do banco é a única forma honesta
 * de saber que a gravação aconteceu. Esperar por tempo seria chute.
 */
export async function preferenciasGravadas(
  page: Page,
): Promise<Record<string, unknown>> {
  const estado = await estadoGravado(page)
  return (estado.preferences as Record<string, unknown> | undefined) ?? {}
}

/** O registro inteiro que está no disco — faders inclusive. */
export function estadoGravado(page: Page): Promise<Record<string, unknown>> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase | null>((resolve) => {
      const req = indexedDB.open('cronoapp')
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => resolve(null)
    })
    if (!db) return {}

    const bruto = await new Promise<unknown>((resolve) => {
      const req = db
        .transaction('state')
        .objectStore('state')
        .get('cronoapp-state')
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => resolve(null)
    })
    db.close()

    if (typeof bruto !== 'string') return {}
    const guardado = JSON.parse(bruto) as {
      state?: Record<string, unknown>
    }
    return guardado.state ?? {}
  })
}
