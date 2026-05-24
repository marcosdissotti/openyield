import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '#shared': path.resolve(__dirname, 'src/shared'),
      '#entities': path.resolve(__dirname, 'src/entities'),
      '#features': path.resolve(__dirname, 'src/features'),
      '#widgets': path.resolve(__dirname, 'src/widgets'),
      '#pages': path.resolve(__dirname, 'src/pages/index.ts'),
    },
  },
  test: {
    environment: 'happy-dom',
    globals: false,
    include: ['tests/**/*.spec.ts'],
    setupFiles: ['./tests/setup/vitest-setup.ts'],
    testTimeout: 60_000,
  },
})
