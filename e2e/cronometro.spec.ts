import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { instalarYouTubeFalso } from './fake-youtube'
import { abrirPainel } from './painel'

/**
 * O cronômetro piscando na reta final.
 *
 * Só o e2e responde se o efeito **existe de verdade**: a classe no elemento é
 * meia resposta, e um `@keyframes` com o nome errado, ou uma regra que outra
 * sobrescreve, deixa a classe lá e o operador sem aviso nenhum. Aqui a
 * animação computada é lida do navegador.
 */

/** Empurra o relógio do player falso, como o vídeo andando de verdade. */
async function avancarPara(page: Page, segundos: number) {
  await page.evaluate((s) => {
    const player = window.__cronoFake?.players.find((p) => p.canal === 'main')
    if (player) player.currentTime = s
  }, segundos)
}

test.beforeEach(async ({ page }) => {
  await instalarYouTubeFalso(page)
  await abrirPainel(page)
})

test('pisca em vermelho nos últimos dez segundos e para quando acaba', async ({
  page,
}) => {
  const cronometro = page.locator('.countdown')

  await page.getByLabel('Nome da pessoa').fill('Ana')
  await page.getByLabel('Link do YouTube').fill('https://youtu.be/dQw4w9WgXcQ')
  await page.getByRole('button', { name: 'Adicionar' }).click()
  // Uma música de três minutos, com a duração já conhecida.
  await page.evaluate(() => {
    const player = window.__cronoFake?.players.find((p) => p.canal === 'main')
    if (player) player.duration = 180
  })
  await page.getByRole('button', { name: 'Tocar Ana' }).click()

  // Meio da música: nada piscando, senão o aviso vira ruído de fundo.
  await avancarPara(page, 60)
  await expect(cronometro).not.toHaveClass(/acabando/)

  // Faltando oito segundos.
  await avancarPara(page, 172)
  await expect(cronometro).toHaveClass(/acabando/)

  const animacao = await cronometro
    .locator('b')
    .evaluate((el) => getComputedStyle(el).animationName)
  expect(
    animacao,
    'a classe entrou mas nenhuma animação está rodando no número',
  ).toBe('crCountdownAlerta')
})

test('quem pede menos movimento recebe o aviso parado, não piscando', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })

  await page.getByLabel('Nome da pessoa').fill('Ana')
  await page.getByLabel('Link do YouTube').fill('https://youtu.be/dQw4w9WgXcQ')
  await page.getByRole('button', { name: 'Adicionar' }).click()
  await page.evaluate(() => {
    const player = window.__cronoFake?.players.find((p) => p.canal === 'main')
    if (player) player.duration = 180
  })
  await page.getByRole('button', { name: 'Tocar Ana' }).click()
  await avancarPara(page, 174)

  const numero = page.locator('.countdown b')
  await expect(page.locator('.countdown')).toHaveClass(/acabando/)

  // Nada piscando — mas o vermelho continua avisando.
  expect(
    await numero.evaluate((el) => getComputedStyle(el).animationName),
  ).toBe('none')
  expect(await numero.evaluate((el) => getComputedStyle(el).color)).toBe(
    'rgb(255, 80, 68)',
  )
})
