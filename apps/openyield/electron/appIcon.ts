import { app } from 'electron'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const mainDir = path.dirname(fileURLToPath(import.meta.url))

export function resolveAppIconPath(): string | undefined {
  const appRoot = path.join(mainDir, '..')
  const candidates = [
    path.join(app.getAppPath(), 'src/assets/oy-icon.png'),
    path.join(appRoot, 'src/assets/oy-icon.png'),
    path.join(process.cwd(), 'src/assets/oy-icon.png'),
  ]

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate
  }

  return undefined
}
