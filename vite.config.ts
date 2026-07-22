import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    // Reusa um único ambiente (jsdom) e um único setup para toda a suíte, em
    // vez de recriar por arquivo. Assim o registro do jest-dom acontece uma vez
    // só, fechando a corrida de arranque entre workers do Vitest 4 que fazia o
    // matcher "não colar" de vez em quando (o flake da revisão C1) — e ainda
    // deixa a suíte bem mais rápida. Os testes já não vazam estado entre si.
    isolate: false,
    // Playwright specs live under e2e/ and run with their own runner.
    exclude: ['**/node_modules/**', '**/dist/**', 'e2e/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/test/**', 'src/**/*.d.ts'],
    },
  },
})
