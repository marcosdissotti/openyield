/**
 * Copia a árvore de dependências de produção do monorepo para apps/openyield/node_modules
 * antes do electron-builder, para o .exe incluir módulos hoisted (ex.: color-name via sharp).
 */
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const repoRoot = path.resolve(appRoot, '../..')
const targetNodeModules = path.join(appRoot, 'node_modules')

function listProductionPackagePaths() {
  const result = spawnSync(
    'npm',
    ['ls', '--all', '--omit=dev', '--parseable', '-w', 'openyield'],
    {
      cwd: repoRoot,
      encoding: 'utf8',
      shell: process.platform === 'win32',
    },
  )

  if (result.status !== 0 && !result.stdout?.trim()) {
    console.error(result.stderr || result.stdout)
    process.exit(result.status ?? 1)
  }

  return result.stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

function resolveTargetPath(packagePath) {
  const roots = [
    path.join(repoRoot, 'node_modules'),
    path.join(appRoot, 'node_modules'),
  ]

  for (const root of roots) {
    if (packagePath === root || packagePath.startsWith(`${root}${path.sep}`)) {
      return path.join(targetNodeModules, path.relative(root, packagePath))
    }
  }

  return null
}

function copyProductionTree() {
  const packagePaths = listProductionPackagePaths()

  rmSync(targetNodeModules, { recursive: true, force: true })
  mkdirSync(targetNodeModules, { recursive: true })

  for (const packagePath of packagePaths) {
    const pkgJsonPath = path.join(packagePath, 'package.json')
    if (!existsSync(pkgJsonPath)) continue

    const pkg = JSON.parse(readFileSync(pkgJsonPath, 'utf8'))
    if (pkg.name === 'openyield') continue

    const targetPath = resolveTargetPath(packagePath)
    if (!targetPath) continue

    mkdirSync(path.dirname(targetPath), { recursive: true })
    cpSync(packagePath, targetPath, {
      recursive: true,
      dereference: true,
      filter: (src) => !src.includes(`${path.sep}.bin${path.sep}`),
    })
  }

  const colorNamePath = path.join(targetNodeModules, 'color-name', 'package.json')
  const sharpPath = path.join(targetNodeModules, 'sharp', 'package.json')
  if (!existsSync(colorNamePath) || !existsSync(sharpPath)) {
    console.error('[openyield] pack:deps incompleto — faltam módulos nativos/LLM.')
    process.exit(1)
  }

  const pkg = JSON.parse(readFileSync(colorNamePath, 'utf8'))
  console.info(`[openyield] pack:deps OK (${packagePaths.length} paths, ex.: ${pkg.name})`)
}

copyProductionTree()
