import { test, expect } from '@playwright/test'

// Smoke e2e da fundação. O fluxo crítico completo (buscar → adicionar à fila
// → tocar → fundo retornar automaticamente, RNF-02.4) chega na Etapa 6.
test('a aplicação carrega e mostra o painel', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'CronoApp' })).toBeVisible()
})
