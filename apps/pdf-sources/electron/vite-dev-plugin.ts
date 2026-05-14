import type { ChildProcess } from 'node:child_process'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import path from 'node:path'
import * as esbuild from 'esbuild'
import type { Plugin } from 'vite'
import { loadPdfSourcesDotEnv } from './appEnv'

/**
 * Empacota `main` (ESM) e `preload` (CJS). O preload tem de ser CJS para o Electron
 * carregar `contextBridge` de forma fiável; ESM em `.js` costuma falhar silenciosamente.
 */
export async function bundleElectronShell(appRoot: string): Promise<void> {
  await esbuild.build({
    absWorkingDir: appRoot,
    entryPoints: ['electron/main.ts'],
    outfile: path.join(appRoot, 'dist-electron/main.js'),
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node20',
    external: ['electron'],
    sourcemap: true,
    logLevel: 'warning',
  })
  await esbuild.build({
    absWorkingDir: appRoot,
    entryPoints: ['electron/preload.ts'],
    outfile: path.join(appRoot, 'dist-electron/preload.cjs'),
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node20',
    external: ['electron'],
    sourcemap: true,
    logLevel: 'warning',
  })
}

/**
 * Dev + production bundling for `electron/main.ts` without `vite-plugin-electron`.
 * That plugin's `import('electron')` can throw in Node 20 + ESM (CJS interop) during startup.
 */
export function electronMainDevPlugin(appRoot: string): Plugin {
  let child: ChildProcess | null = null

  return {
    name: 'electron-main-dev',
    apply: 'serve',
    configureServer(server) {
      server.httpServer?.once('listening', () => {
        if (process.env.VITE_WEB_ONLY === '1') return

        console.info(
          '[pdf-sources] LLM: use LM Studio (API local) ou defina URL em Ajustes. Em dev o proxy /lm-studio ' +
            'aponta para VITE_LM_STUDIO_TARGET (por defeito http://127.0.0.1:1234).',
        )

        const addr = server.httpServer?.address()
        const port = typeof addr === 'object' && addr && 'port' in addr ? addr.port : 5173
        const url = `http://127.0.0.1:${port}`
        process.env.VITE_DEV_SERVER_URL = url

        void (async () => {
          const req = createRequire(path.join(appRoot, 'package.json'))
          const electronPath = req('electron') as string

          await bundleElectronShell(appRoot)

          if (child) return
          loadPdfSourcesDotEnv(appRoot, process.cwd())
          const env: NodeJS.ProcessEnv = { ...process.env, VITE_DEV_SERVER_URL: url }
          delete env.ELECTRON_RUN_AS_NODE
          child = spawn(electronPath, ['.', '--no-sandbox'], {
            stdio: 'inherit',
            cwd: appRoot,
            env,
          })
          child.once('exit', () => {
            child = null
          })
        })().catch((err) => {
          console.error('[electron-main-dev]', err)
          void server.close()
        })
      })

      return () => {
        if (child) {
          child.kill()
          child = null
        }
      }
    },
  }
}

export async function buildElectronMain(appRoot: string): Promise<void> {
  await bundleElectronShell(appRoot)
}
