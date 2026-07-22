import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { instalarYouTubeFalso } from './fake-youtube'

/**
 * A auditoria de acessibilidade do RNF-05, no app construído.
 *
 * O axe é uma ferramenta, não um juiz: ele pega o que dá para verificar por
 * máquina — contraste, rótulo faltando, ordem de cabeçalho, semântica de
 * widget. O que ele **não** pega está testado à mão logo abaixo: foco em modal
 * (RNF-05.1) e o anúncio do estado de reprodução por região viva (RNF-05.3).
 *
 * Ambiente de culto costuma ser escuro e o operador lê a tela de relance, entre
 * uma música e outra — contraste aqui não é conformidade, é conseguir operar
 * (RNF-05.4). Por isso os dois temas são auditados, não só o padrão.
 */

/** As regras que valem: WCAG 2.1 AA é o alvo declarado. */
const REGRAS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']

async function auditar(page: Page) {
  // Congela transições e animações antes de medir.
  //
  // Sem isto o axe amostra cores **no meio** da transição de 180 ms das abas e
  // acusa 4,18:1 num tom que não existe parado — os dois estados de repouso dão
  // 6,2:1. WCAG fala do que a pessoa lê, não de um quadro intermediário; medir
  // durante a animação só produziria alarme falso e pressão para achatar o
  // design por um motivo inventado.
  await page.addStyleTag({
    content:
      '*, *::before, *::after { transition: none !important; animation: none !important; }',
  })
  return new AxeBuilder({ page }).withTags(REGRAS).analyze()
}

/** Deixa a mensagem de falha dizer **o que** quebrou, não só quantos. */
function resumir(violacoes: { id: string; nodes: { target: unknown[] }[] }[]) {
  return violacoes
    .map((v) => `${v.id} (${v.nodes.length}×): ${v.nodes[0]?.target.join(' ')}`)
    .join('\n')
}

test.beforeEach(async ({ page }) => {
  await instalarYouTubeFalso(page)
})

test('o painel em repouso não tem violação de WCAG AA', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.on-air')).toContainText('STANDBY')

  const { violations } = await auditar(page)

  expect(violations, resumir(violations)).toEqual([])
})

test('o tema claro também passa (RNF-05.4)', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.on-air')).toContainText('STANDBY')

  // Pelo botão da topbar, que é o caminho do operador.
  await page.getByRole('button', { name: 'Alternar tema' }).click()
  await expect(page.locator('.app-shell')).toHaveAttribute(
    'data-theme',
    'light',
  )

  const { violations } = await auditar(page)

  expect(violations, resumir(violations)).toEqual([])
})

test('as três abas passam, cada uma com seu formulário', async ({ page }) => {
  await page.goto('/')

  for (const aba of ['Buscar música', 'Fundos', 'Fila']) {
    await page.getByRole('button', { name: aba, exact: true }).click()
    const { violations } = await auditar(page)
    expect(violations, `aba ${aba}:\n${resumir(violations)}`).toEqual([])
  }
})

test('o modal de configurações prende e devolve o foco (RNF-05.1)', async ({
  page,
}) => {
  await page.goto('/')
  const abrir = page.getByRole('button', { name: /Configurações/i })
  await abrir.click()

  const dialogo = page.getByRole('dialog')
  await expect(dialogo).toBeVisible()

  // O foco entra no diálogo sozinho: quem navega por teclado não pode precisar
  // caçar onde ele está.
  await expect(dialogo).toContainText('Configurações')
  const focoDentro = await page.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"]')
    return dialog?.contains(document.activeElement) ?? false
  })
  expect(focoDentro, 'o foco tinha que entrar no diálogo').toBe(true)

  const { violations } = await auditar(page)
  expect(violations, resumir(violations)).toEqual([])

  // Escape fecha e o foco volta para quem abriu — senão ele cai no começo da
  // página e o operador perde o lugar.
  await page.keyboard.press('Escape')
  await expect(dialogo).toBeHidden()
  await expect(abrir).toBeFocused()
})

test('a mudança de estado é anunciada por região viva (RNF-05.3)', async ({
  page,
}) => {
  await page.goto('/')

  const anuncio = page.locator('[role="status"]').first()
  await expect(anuncio).toContainText(/silêncio|standby/i)

  await page.getByLabel('Nome da pessoa').fill('Ana')
  await page.getByLabel('Link do YouTube').fill('https://youtu.be/dQw4w9WgXcQ')
  await page.getByRole('button', { name: 'Adicionar' }).click()
  await page.getByRole('button', { name: 'Tocar Ana' }).click()

  // Quem não vê a topbar mudar de cor precisa ouvir que entrou no ar.
  await expect(anuncio).toContainText(/Ana/)
})
