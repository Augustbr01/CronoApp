import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { instalarYouTubeFalso } from './fake-youtube'
import { abrirPainel } from './painel'

/**
 * O layout do RNF-06.2: **íntegro de 1280 px para cima, sem quebrar em
 * tablet.**
 *
 * "Íntegro" aqui tem um significado preciso e verificável: a página não rola na
 * horizontal e as três colunas do painel — fila, pré-escuta e faders — estão
 * todas visíveis ao mesmo tempo. É o que o operador precisa, porque no meio do
 * culto ele não tem mão sobrando para rolar a tela atrás do fader.
 *
 * Rolagem horizontal é o sintoma que denuncia quase toda quebra de grade, e é
 * barata de medir: `scrollWidth` maior que `clientWidth` significa conteúdo
 * fora da tela.
 */

/** O alvo primário (ADR 0004) e as resoluções em que ele realmente roda. */
const ALVOS = [
  { nome: '1280×720 — o mínimo do RNF-06.2', width: 1280, height: 720 },
  { nome: '1366×768 — notebook comum de igreja', width: 1366, height: 768 },
  {
    nome: '1920×1080 — a mesa de som com monitor grande',
    width: 1920,
    height: 1080,
  },
]

/** Não é alvo primário, mas não pode quebrar. */
const TABLET = { nome: '1024×768 — tablet deitado', width: 1024, height: 768 }

async function rolagemVertical(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      document.documentElement.scrollHeight -
      document.documentElement.clientHeight,
  )
}

async function rolagemHorizontal(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  )
}

test.beforeEach(async ({ page }) => {
  await instalarYouTubeFalso(page)
})

for (const alvo of ALVOS) {
  test(`${alvo.nome}: sem rolagem lateral, com as três colunas à vista`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: alvo.width, height: alvo.height })
    await abrirPainel(page)
    await expect(page.locator('.on-air')).toContainText('STANDBY')

    expect(
      await rolagemHorizontal(page),
      'apareceu rolagem horizontal — alguma coluna não coube',
    ).toBe(0)

    // As três colunas do painel, juntas na tela.
    await expect(page.locator('.primary-pane')).toBeVisible()
    await expect(page.locator('.secondary-pane')).toBeVisible()
    await expect(page.locator('.mixer-pane')).toBeVisible()

    // O fader do fundo é o controle mais usado durante o culto: se ele sair da
    // área visível, o layout quebrou mesmo que nada tenha transbordado.
    const fader = page.getByRole('slider', { name: 'Volume FUNDO' })
    await expect(fader).toBeInViewport()
  })
}

test(`${TABLET.nome}: não quebra, mesmo não sendo o alvo`, async ({ page }) => {
  await page.setViewportSize({ width: TABLET.width, height: TABLET.height })
  await abrirPainel(page)
  await expect(page.locator('.on-air')).toContainText('STANDBY')

  expect(await rolagemHorizontal(page)).toBe(0)
  await expect(page.locator('.mixer-pane')).toBeVisible()
  // O básico continua operável: dá para enfileirar alguém.
  await expect(page.getByLabel('Link do YouTube')).toBeVisible()
})

test('a busca de fundos não estica a página (rola dentro da caixa)', async ({
  page,
}) => {
  await page.route('**/api/youtube/search*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        items: Array.from({ length: 10 }, (_, i) => ({
          id: `bg-${i}`,
          title: `Piano Worship Vol. ${i + 1} — 3 horas de instrumental`,
          channel: 'Worship Piano',
          duration: 10_800,
        })),
      }),
    }),
  )
  await page.setViewportSize({ width: 1280, height: 720 })
  await abrirPainel(page)

  const alturaAntes = await page.evaluate(
    () => document.documentElement.scrollHeight,
  )

  await page.getByRole('button', { name: 'Fundos' }).click()
  await page.getByLabel('Buscar fundo musical').fill('piano worship')
  await page.getByRole('button', { name: 'Buscar', exact: true }).click()
  await page.getByText('Piano Worship Vol. 1 — 3').first().waitFor()

  // A página não cresceu: antes desta correção ela ia de 759 px para 1254 num
  // viewport de 720, levando a topbar e os faders para fora da vista.
  expect(
    await page.evaluate(() => document.documentElement.scrollHeight),
    'a busca esticou a página em vez de rolar dentro da caixa',
  ).toBe(alturaAntes)
  expect(await rolagemVertical(page)).toBe(0)

  // E o que rola é a caixa de resultados, com o campo de busca e a biblioteca
  // parados onde estavam.
  const lista = page.locator('.result-list')
  expect(
    await lista.evaluate((el) => el.scrollHeight - el.clientHeight),
    'a caixa de resultados não ficou rolável',
  ).toBeGreaterThan(0)
  await expect(page.getByLabel('Buscar fundo musical')).toBeInViewport()
  await expect(page.getByText('BIBLIOTECA DE FUNDOS')).toBeInViewport()
})
