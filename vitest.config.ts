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
    // Glob paths, not bare names: '.claude' keeps old copies of the repo from
    // agent sessions and vitest was picking them up, failing tests that pass here.
    exclude: ['**/node_modules/**', '**/dist/**', '**/.claude/**', 'e2e/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'src/test/',
        '**/*.d.ts',
        '**/*.config.*',
        // Re-export barrels: they have no logic to cover.
        // There used to be a generic '**/index.ts' that also excluded
        // src/store/index.ts, that is, the whole store: the file with the most
        // logic in the project was left out of the coverage threshold. The
        // storage durability defect lived right there, unmeasured.
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
