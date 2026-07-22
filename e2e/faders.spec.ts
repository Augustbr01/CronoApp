import { expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'
import { controlarYouTubeFalso, instalarYouTubeFalso } from './fake-youtube'
import { abrirPainel, estadoGravado } from './painel'

/**
 * O arraste dos faders (RF-05.6), no navegador de verdade.
 *
 * Estes testes existem por causa de um relato de operação: "dependendo de onde
 * eu seguro, ele trava e eu tenho que soltar e clicar de novo". A medição
 * explicou — a coluna do fader tem 43 px e só os 28 px do trilho arrastavam; os
 * 15 px do VU-meter pareciam parte do controle e não faziam nada.
 *
 * É um teste que **só** o e2e alcança: depende de geometria de verdade, de
 * captura de ponteiro de verdade e do CSS aplicado.
 */

function valor(fader: Locator) {
  return fader.getAttribute('aria-valuenow').then(Number)
}

/** A coluna inteira do fader — o que o operador enxerga como "o fader". */
async function colunaDoFundo(page: Page) {
  const box = await page.locator('.fader').nth(1).boundingBox()
  if (!box) throw new Error('não achei a coluna do fader do fundo')
  return box
}

test.beforeEach(async ({ page }) => {
  await instalarYouTubeFalso(page)
  await abrirPainel(page)
  await expect(page.locator('.on-air')).toContainText('STANDBY')
})

test('arrasta pegando em qualquer ponto da largura da coluna', async ({
  page,
}) => {
  const fader = page.getByRole('slider', { name: 'Volume FUNDO' })
  const coluna = await colunaDoFundo(page)
  const meio = coluna.y + coluna.height / 2

  // Da borda esquerda (onde fica o medidor) até a direita, de 4 em 4 px.
  const mortos: number[] = []
  for (let dx = 2; dx < coluna.width; dx += 4) {
    const x = coluna.x + dx
    await page.mouse.move(x, meio)
    await page.mouse.down()
    const antes = await valor(fader)
    await page.mouse.move(x, meio - 60, { steps: 3 })
    const depois = await valor(fader)
    await page.mouse.up()
    if (antes === depois) mortos.push(Math.round(dx))
  }

  expect(
    mortos,
    `estes pontos da coluna não arrastaram (px da borda esquerda): ${mortos.join(', ')}`,
  ).toEqual([])
})

test('o arraste sobrevive a sair muito para o lado', async ({ page }) => {
  const fader = page.getByRole('slider', { name: 'Volume FUNDO' })
  const coluna = await colunaDoFundo(page)
  const cx = coluna.x + coluna.width / 2

  await page.mouse.move(cx, coluna.y + coluna.height * 0.7)
  await page.mouse.down()
  // A mão sai 300 px para a esquerda enquanto sobe — o gesto natural de quem
  // não está olhando para o cursor.
  await page.mouse.move(cx - 300, coluna.y + coluna.height * 0.3, { steps: 8 })
  const durante = await valor(fader)
  await page.mouse.move(cx - 300, coluna.y + 4, { steps: 8 })
  const noTopo = await valor(fader)
  await page.mouse.up()

  expect(durante).toBeGreaterThan(50)
  expect(noTopo).toBe(100)
})

test('pegar pelo medidor deixa as setas valendo em seguida', async ({
  page,
}) => {
  const fader = page.getByRole('slider', { name: 'Volume FUNDO' })
  const coluna = await colunaDoFundo(page)

  // Borda esquerda da coluna: a faixa do medidor.
  await page.mouse.move(coluna.x + 3, coluna.y + coluna.height / 2)
  await page.mouse.down()
  await page.mouse.up()

  await expect(fader).toBeFocused()
  const antes = await valor(fader)
  await page.keyboard.press('ArrowUp')
  expect(await valor(fader)).toBe(antes + 5)
})

test('Shift + setas mexem o master sem tocar no fundo (RF-07.1)', async ({
  page,
}) => {
  const master = page.getByRole('slider', { name: 'Volume MASTER' })
  const fundo = page.getByRole('slider', { name: 'Volume FUNDO' })
  await page.locator('body').click()

  await page.keyboard.press('Shift+ArrowDown')
  await page.keyboard.press('Shift+ArrowDown')

  expect(await valor(master)).toBe(70)
  expect(await valor(fundo)).toBe(40)

  await page.keyboard.press('ArrowUp')
  expect(await valor(master)).toBe(70)
  expect(await valor(fundo)).toBe(45)
})

test('o anel de foco some no clique e volta no teclado (RNF-05.2)', async ({
  page,
}) => {
  const fader = page.getByRole('slider', { name: 'Volume FUNDO' })
  const contorno = () =>
    fader.evaluate((el) => getComputedStyle(el).outlineStyle)

  const coluna = await colunaDoFundo(page)
  await page.mouse.move(coluna.x + coluna.width / 2, coluna.y + 100)
  await page.mouse.down()
  await page.mouse.move(coluna.x + coluna.width / 2, coluna.y + 60, {
    steps: 3,
  })

  // Segurando: nada de contorno em volta do trilho, que é o que atrapalha a
  // leitura do fader justamente na hora de operar.
  expect(await contorno()).toBe('none')
  await page.mouse.up()
  expect(await contorno()).toBe('none')

  // Mas o foco continua lá, e a primeira tecla traz o anel de volta — quem
  // navega por teclado não pode ficar sem saber onde está.
  await expect(fader).toBeFocused()
  await page.keyboard.press('ArrowUp')
  expect(await contorno()).toBe('solid')
})

test('chegando por Tab, o anel aparece de primeira', async ({ page }) => {
  const master = page.getByRole('slider', { name: 'Volume MASTER' })

  await page.locator('body').click()
  for (let i = 0; i < 40; i += 1) {
    await page.keyboard.press('Tab')
    if (await master.evaluate((el) => el === document.activeElement)) break
  }

  await expect(master).toBeFocused()
  expect(await master.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe(
    'solid',
  )
})

test('o volume gravado sobrevive a recarregar — e vale para o som, não só para o número', async ({
  page,
}) => {
  const fundo = page.getByRole('slider', { name: 'Volume FUNDO' })
  const youtube = controlarYouTubeFalso(page)

  // O operador deixa a mesa como gosta e fecha o app.
  await page.locator('body').click()
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowDown')
  expect(await valor(fundo)).toBe(25)
  await expect
    .poll(() => estadoGravado(page))
    .toMatchObject({
      backgroundFader: 25,
    })

  await page.reload()

  // O número volta certo — isso já funcionava.
  expect(await valor(fundo)).toBe(25)

  // O que NÃO funcionava: o motor nasce antes de o IndexedDB responder, com os
  // padrões 80/40, e ninguém o corrigia depois. O fundo entrava a 40 com o
  // fader marcando 25, e só se acertava quando alguém encostava no fader — o
  // que fazia o defeito parecer aleatório.
  await page.getByRole('button', { name: 'Fundos' }).click()
  await page.getByLabel('Nome do fundo').fill('Piano do culto')
  await page
    .getByLabel('Link do fundo no YouTube')
    .fill('https://youtu.be/M7lc1UVf-VE')
  await page.getByRole('button', { name: 'Adicionar' }).click()

  await expect
    .poll(async () => (await youtube.volumes()).background, {
      message: 'o fundo entrou num volume diferente do que o fader mostra',
    })
    .toBe(25)
})
