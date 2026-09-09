import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'fs'
import { resolve } from 'path'

// Read version from package.json for tests
const packageJson = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf-8'))

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(packageJson.version),
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: true,
    // Rutas glob, no nombres sueltos: '.claude' guarda copias viejas del repo de
    // sesiones de agente y vitest las recogia, haciendo fallar tests que aqui pasan.
    exclude: ['**/node_modules/**', '**/dist/**', '**/.claude/**', 'e2e/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'src/test/',
        '**/*.d.ts',
        '**/*.config.*',
        // Barrels de re-exportacion: no tienen logica que cubrir.
        // Antes habia un '**/index.ts' generico que tambien excluia
        // src/store/index.ts, o sea el store completo: el archivo con mas logica
        // del proyecto quedaba fuera del umbral de cobertura. El defecto de
        // durabilidad del storage vivia justo ahi, sin medir.
        'src/components/**/index.ts',
        'src/hooks/index.ts',
        'src/types/index.ts',
      ],
      thresholds: {
        statements: 80,
        branches: 80,
        functions: 80,
        lines: 80,
      },
    },
  },
})
