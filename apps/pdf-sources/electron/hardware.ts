import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import fs from 'node:fs/promises'
import os from 'node:os'
import type { HardwareSummaryPayload } from '../src/shared/model/hardwareSummary'

const execFileP = promisify(execFile)

/** nvidia-smi devolve MiB na coluna memory.total com format csv,noheader,nounits */
async function tryNvidiaSmiVramBytes(): Promise<{ bytes: number; source: string } | null> {
  try {
    const { stdout } = await execFileP(
      'nvidia-smi',
      ['--query-gpu=memory.total', '--format=csv,noheader,nounits'],
      { timeout: 8000, windowsHide: true },
    )
    const line = stdout.trim().split(/\r?\n/)[0]?.trim()
    const mib = line ? parseInt(line, 10) : NaN
    if (!Number.isFinite(mib) || mib <= 0) return null
    return { bytes: mib * 1024 * 1024, source: 'nvidia-smi' }
  } catch {
    return null
  }
}

async function tryLinuxRamBytes(): Promise<{ bytes: number; source: string } | null> {
  try {
    const txt = await fs.readFile('/proc/meminfo', 'utf8')
    const m = txt.match(/^MemTotal:\s+(\d+)\s+kB/im)
    if (!m) return null
    const kb = parseInt(m[1]!, 10)
    if (!Number.isFinite(kb) || kb <= 0) return null
    return { bytes: kb * 1024, source: '/proc/meminfo' }
  } catch {
    return null
  }
}

async function tryDarwinRamBytes(): Promise<{ bytes: number; source: string } | null> {
  try {
    const { stdout } = await execFileP('sysctl', ['-n', 'hw.memsize'], { timeout: 5000, windowsHide: true })
    const n = parseInt(stdout.trim(), 10)
    if (!Number.isFinite(n) || n <= 0) return null
    return { bytes: n, source: 'sysctl hw.memsize' }
  } catch {
    return null
  }
}

async function tryWindowsRamBytes(): Promise<{ bytes: number; source: string } | null> {
  try {
    const { stdout } = await execFileP(
      'powershell',
      ['-NoProfile', '-Command', '(Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory'],
      { timeout: 8000, windowsHide: true },
    )
    const n = parseInt(stdout.trim(), 10)
    if (!Number.isFinite(n) || n <= 0) return null
    return { bytes: n, source: 'Get-CimInstance TotalPhysicalMemory' }
  } catch {
    return null
  }
}

async function tryTotalRamBytes(): Promise<{ bytes: number; source: string } | null> {
  if (process.platform === 'linux') {
    const r = await tryLinuxRamBytes()
    if (r) return r
  }
  if (process.platform === 'darwin') {
    const r = await tryDarwinRamBytes()
    if (r) return r
  }
  if (process.platform === 'win32') {
    const r = await tryWindowsRamBytes()
    if (r) return r
  }
  const tot = os.totalmem()
  if (tot > 0) return { bytes: tot, source: 'os.totalmem()' }
  return null
}

/**
 * Leitura best-effort no processo principal (Electron). No browser não existe.
 */
export async function readHardwareSummary(): Promise<HardwareSummaryPayload> {
  const sources: HardwareSummaryPayload['sources'] = { ram: 'desconhecido' }
  let vramBytes: number | null = null
  let ramBytes: number | null = null

  const gpu = await tryNvidiaSmiVramBytes()
  if (gpu) {
    vramBytes = gpu.bytes
    sources.vram = gpu.source
  }

  const ram = await tryTotalRamBytes()
  if (ram) {
    ramBytes = ram.bytes
    sources.ram = ram.source
  }

  return { vramBytes, ramBytes, sources }
}
