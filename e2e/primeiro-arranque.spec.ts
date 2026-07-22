import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import { instalarYouTubeFalso } from './fake-youtube'
import { preferenciasGravadas } from './painel'

/**
 * O setup do primeiro arranque, no navegador de verdade.
 *
 * Aqui está a única pergunta que os testes de componente não conseguem
 * responder: o nome sobrevive a **fechar e abrir o app**? Isso depende do
 * IndexedDB de verdade e da hidratação assíncrona de verdade — que é
 * justamente onde mora a armadilha, porque antes dela responder o estado em
 * memória é o de um app recém-instalado.
 */

test.beforeEach(async ({ page }) => {
  await instalarYouTubeFalso(page)
})

test('nomear a igreja, recarregar, e o nome continuar lá', async ({ page }) => {
  await page.goto('/')

  const dialogo = page.getByRole('dialog')
  await expect(dialogo).toContainText('Bem-vindo ao CronoApp')

  await page.getByLabel('Nome da igreja').fill('Igreja Batista Central')
  await page.getByRole('button', { name: 'Começar' }).click()

  await expect(dialogo).toBeHidden()
  await expect(page.locator('.brand')).toContainText('Igreja Batista Central')
  await expect
    .poll(() => preferenciasGravadas(page))
    .toMatchObject({ churchName: 'Igreja Batista Central' })

  // O teste de verdade: fechar e abrir. Se a hidratação não fosse esperada, a
  // tela de boas-vindas piscaria aqui antes do IndexedDB responder.
  await page.reload()

  await expect(page.locator('.brand')).toContainText('Igreja Batista Central')
  await expect(page.getByRole('dialog')).toBeHidden()
})

test('pular também é resposta: não pergunta de novo depois de recarregar', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Agora não' }).click()
  await expect(page.getByRole('dialog')).toBeHidden()
  await expect
    .poll(() => preferenciasGravadas(page))
    .toMatchObject({
      setupDone: true,
    })

  await page.reload()

  await expect(page.locator('.on-air')).toContainText('STANDBY')
  await expect(page.getByRole('dialog')).toBeHidden()
  await expect(page.locator('.brand-church')).toHaveCount(0)
})

test('a tela de boas-vindas passa na auditoria de acessibilidade', async ({
  page,
}) => {
  await page.goto('/')
  await expect(page.getByRole('dialog')).toBeVisible()

  // O foco entra no campo sozinho: quem navega por teclado não pode ter que
  // caçar onde começar.
  await expect(page.getByLabel('Nome da igreja')).toBeFocused()

  await page.addStyleTag({
    content:
      '*, *::before, *::after { transition: none !important; animation: none !important; }',
  })
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()

  expect(
    violations,
    violations
      .map((v) => `${v.id}: ${v.nodes[0]?.target.join(' ')}`)
      .join('\n'),
  ).toEqual([])
})

test('um nome comprido não quebra a topbar (RNF-06.2)', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 })
  await page.goto('/')

  await page
    .getByLabel('Nome da igreja')
    .fill('Igreja Evangélica Assembleia de Deus Ministério do Belém')
  await page.getByRole('button', { name: 'Começar' }).click()

  const rolagem = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  )
  expect(rolagem, 'o nome da igreja empurrou a topbar').toBe(0)
  // O transporte continua alcançável, que é o que o operador usa.
  await expect(page.locator('.transport')).toBeInViewport()
})
