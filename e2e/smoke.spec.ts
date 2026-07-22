import { expect, test } from '@playwright/test'
import { instalarYouTubeFalso } from './fake-youtube'
import { abrirPainel } from './painel'

/**
 * O app sobe, monta e chega ao estado de repouso.
 *
 * É o teste mais burro da suíte e o mais informativo quando quebra: se ele
 * falha, não adianta olhar o resto — o bundle não carregou, o React não montou
 * ou o painel explodiu antes de desenhar. O fluxo crítico completo (RNF-02.4)
 * fica em [fluxo-critico.spec.ts](fluxo-critico.spec.ts).
 */
test('o painel abre em standby, com a fila vazia', async ({ page }) => {
  // Mesmo aqui o YouTube entra falso: o smoke não pode virar um detector de
  // instabilidade da internet do CI.
  await instalarYouTubeFalso(page)

  await abrirPainel(page)

  await expect(page.getByText('CronoApp')).toBeVisible()
  await expect(page.locator('.on-air')).toContainText('STANDBY')
  await expect(page.getByText('Nenhuma música aguardando')).toBeVisible()
  await expect(page.getByText('0 na fila')).toBeVisible()
})
