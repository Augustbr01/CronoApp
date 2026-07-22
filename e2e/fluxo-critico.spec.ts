import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { controlarYouTubeFalso, instalarYouTubeFalso } from './fake-youtube'

/**
 * O fluxo crítico do RNF-02.4, no app construído:
 *
 * **buscar → adicionar à fila → tocar → o fundo voltar sozinho.**
 *
 * É o mesmo caminho que os testes de componente já percorrem — e é de propósito
 * que ele seja percorrido de novo aqui. O que muda é tudo o que os outros não
 * podem exercitar: o bundle de produção, o IndexedDB do navegador, o CSS
 * aplicado, o `requestAnimationFrame` real medindo os fades em tempo real.
 *
 * Um teste de componente prova que a lógica está certa. Este prova que o app
 * está de pé.
 */

/** Um resultado de busca, no formato que o `/api/youtube/search` devolve. */
function resultado(id: string, title: string, duration = 240) {
  return {
    id,
    title,
    channel: 'Canal de teste',
    thumbnail: `https://i.ytimg.com/vi/${id}/default.jpg`,
    duration,
  }
}

/**
 * Responde a busca sem sair para a internet.
 *
 * O endpoint de verdade tem a suíte dele (54 testes na Etapa 5). Aqui o que
 * está sob teste é a tela, e depender da cota do YouTube — menos de cem buscas
 * por dia — para rodar o CI seria trocar um teste por um problema.
 */
async function responderBusca(
  page: Page,
  itens: ReturnType<typeof resultado>[],
) {
  await page.route('**/api/youtube/search*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: itens }),
    })
  })
}

/** O bloco NO AR da topbar — a resposta a "o que está tocando agora". */
function noAr(page: Page) {
  return page.locator('.on-air')
}

test.beforeEach(async ({ page }) => {
  await instalarYouTubeFalso(page)
})

test('do zero ao fundo voltando sozinho (RNF-02.4)', async ({ page }) => {
  const youtube = controlarYouTubeFalso(page)

  await responderBusca(page, [
    resultado('bg-piano', 'Piano Worship 3 horas', 10_800),
    resultado('v-ana', 'Porque Ele Vive'),
  ])

  await page.goto('/')
  await expect(noAr(page)).toContainText('STANDBY')

  // 1. O fundo entra primeiro, como no culto: a trilha já está no ar quando a
  //    primeira pessoa sobe para cantar (RF-03.4).
  await page.getByRole('button', { name: 'Fundos' }).click()
  await page.getByLabel('Buscar fundo musical').fill('piano worship')
  await page.getByRole('button', { name: 'Buscar', exact: true }).click()
  await page.getByRole('button', { name: '+ Fundos' }).first().click()

  await expect(noAr(page)).toContainText('FUNDO')
  await expect
    .poll(async () => (await youtube.volumes()).background, {
      message: 'o fundo tinha que subir com fade até o volume do fader (40)',
    })
    .toBe(40)

  // 2. Alguém aparece: entra pela busca de músicas (RF-02.3).
  await page.getByRole('button', { name: 'Buscar música' }).click()
  await page.getByLabel('Buscar música').fill('porque ele vive')
  await page.getByRole('button', { name: 'Buscar', exact: true }).click()
  await page.getByLabel('Nome de quem vai cantar').fill('Ana')
  await page.getByRole('button', { name: '+ Fila' }).nth(1).click()

  // Adicionar pela busca troca para a aba Fila sozinho.
  // `exact` porque "Ana" é substring de "Canal de teste", o nome do canal nos
  // resultados — sem isso o localizador casa com dois elementos.
  await expect(page.getByText('Ana', { exact: true })).toBeVisible()

  // 3. O operador põe a Ana no ar. O fundo desce EM PARALELO — crossfade, sem
  //    corte seco (RF-04.5).
  await page.getByRole('button', { name: 'Tocar Ana' }).click()
  await expect(noAr(page)).toContainText('LOUVOR')

  await expect
    .poll(async () => (await youtube.volumes()).main, {
      message: 'o louvor tinha que subir até o fader master (80)',
    })
    .toBe(80)
  // As duas rampas correm juntas mas não terminam no mesmo quadro, então o
  // fundo é esperado até zerar em vez de conferido no instante em que o louvor
  // chega ao topo. O formato exato do cruzamento é assunto dos testes do mixer,
  // que medem quadro a quadro com relógio falso; aqui o que importa é o estado
  // final — louvor no ar, fundo silenciado sem ter sido pausado no caminho.
  await expect
    .poll(async () => (await youtube.volumes()).background, {
      message: 'o fundo tinha que sumir por baixo do louvor',
    })
    .toBe(0)
  expect((await youtube.carregados()).main).toEqual(['v-ana'])

  // 4. A música acaba sozinha e o fundo volta, sem ninguém tocar em nada
  //    (RF-06.1 + RF-04.11). É o requisito que define o produto.
  await youtube.encerrar('main')

  await expect(noAr(page)).toContainText('FUNDO')
  await expect.poll(async () => (await youtube.volumes()).background).toBe(40)
  await expect(page.getByText('Nenhuma música aguardando')).toBeVisible()
  // E a Ana foi para o "Já tocou", não sumiu (RF-06.1).
  await expect(page.locator('.history-list')).toContainText(
    'Ana — Porque Ele Vive',
  )
})

test('a fila sobrevive a recarregar a página (ADR 0003)', async ({ page }) => {
  await responderBusca(page, [resultado('v-ana', 'Porque Ele Vive')])
  await page.goto('/')

  await page.getByLabel('Nome da pessoa').fill('Ana')
  await page.getByLabel('Link do YouTube').fill('https://youtu.be/dQw4w9WgXcQ')
  await page.getByRole('button', { name: 'Adicionar' }).click()
  await expect(page.getByText('1 na fila')).toBeVisible()

  // Recarregar no meio do culto — porque acontece — não pode custar a fila. É o
  // IndexedDB de verdade respondendo, coisa que só este teste alcança.
  await page.reload()

  await expect(page.getByText('1 na fila')).toBeVisible()
  await expect(page.getByText('Ana')).toBeVisible()
})

test('os atalhos do rodapé funcionam de verdade (RF-07)', async ({ page }) => {
  const youtube = controlarYouTubeFalso(page)
  await responderBusca(page, [resultado('bg-piano', 'Piano 3h', 10_800)])
  await page.goto('/')

  await page.getByRole('button', { name: 'Fundos' }).click()
  await page.getByLabel('Nome do fundo').fill('Piano do culto')
  await page
    .getByLabel('Link do fundo no YouTube')
    .fill('https://youtu.be/M7lc1UVf-VE')
  await page.getByRole('button', { name: 'Adicionar' }).click()
  await expect(noAr(page)).toContainText('FUNDO')

  // B desliga o fundo; B de novo religa. O foco está no corpo da página, que é
  // onde o operador o deixa — teclado é o caminho dele durante o culto.
  await page.locator('body').click()
  await page.keyboard.press('b')
  await expect(noAr(page)).toContainText('STANDBY')
  await expect.poll(async () => (await youtube.volumes()).background).toBe(0)

  await page.keyboard.press('b')
  await expect(noAr(page)).toContainText('FUNDO')
  await expect.poll(async () => (await youtube.volumes()).background).toBe(40)
})
