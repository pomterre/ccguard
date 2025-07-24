import { defineConfig } from 'vitest/config'
import path from 'path'

// Note: Vite shows a CJS deprecation warning but this is just informational.
// The project uses CommonJS modules which work fine for our CLI tool.
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    exclude: ['**/node_modules/**', '**/dist/**', '**/tdd-guard/**'],
    coverage: {
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', 'test/', 'dist/', 'tdd-guard/']
    }
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  }
})