import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import { buildElectronMain, electronMainDevPlugin } from './electron/vite-dev-plugin'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const webOnly = process.env.VITE_WEB_ONLY === '1'

const fsdAliases = {
  '#shared': path.resolve(__dirname, 'src/shared'),
  '#entities': path.resolve(__dirname, 'src/entities'),
  '#features': path.resolve(__dirname, 'src/features'),
  '#widgets': path.resolve(__dirname, 'src/widgets'),
  '#pages': path.resolve(__dirname, 'src/pages/index.ts'),
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, '')
  /** Alinhado com LM Studio (porta 1234). Outro host: `VITE_LM_STUDIO_TARGET`. */
  const lmStudioTarget = env.VITE_LM_STUDIO_TARGET || 'http://127.0.0.1:1234'
  const hfToken = env.HF_TOKEN
  let lmStudioProxyErrorHintShown = false

  return {
    base: './',
    resolve: { alias: fsdAliases },
    plugins: [
      vue(),
      ...(webOnly ? [] : [electronMainDevPlugin(__dirname)]),
      ...(webOnly
        ? []
        : [
            {
              name: 'electron-main-build',
              apply: 'build' as const,
              async closeBundle() {
                await buildElectronMain(__dirname)
              },
            },
          ]),
    ],
    build: {
      outDir: 'dist',
      emptyOutDir: true,
    },
    server: {
      port: 5173,
      strictPort: true,
      proxy: {
        '/lm-studio': {
          target: lmStudioTarget,
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/lm-studio/, ''),
          configure(proxy) {
            proxy.on('error', (err) => {
              if (lmStudioProxyErrorHintShown) return
              lmStudioProxyErrorHintShown = true
              const code = 'code' in err ? String((err as NodeJS.ErrnoException).code) : ''
              console.warn(
                `\n[pdf-sources] Proxy /lm-studio → ${lmStudioTarget} sem servidor (ex.: ${code || err.message}). ` +
                  'Arranque o LM Studio (Developer → Start server) ou ajuste VITE_LM_STUDIO_TARGET no .env.\n',
              )
            })
          },
        },
        '/hf-hub': {
          target: 'https://huggingface.co',
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/hf-hub/, ''),
          configure(proxy) {
            proxy.on('proxyReq', (proxyReq) => {
              if (hfToken) proxyReq.setHeader('Authorization', `Bearer ${hfToken}`)
            })
          },
        },
      },
    },
  }
})
