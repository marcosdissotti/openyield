import fs from 'node:fs'
import path from 'node:path'

function stripQuotes(raw: string): string {
  const v = raw.trim()
  if (v.length >= 2 && ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))) {
    return v.slice(1, -1)
  }
  return v
}

/**
 * Carrega `PDF_SOURCES_*`, `HF_TOKEN`, etc. do ficheiro `.env` para `process.env`.
 * O processo principal do Electron **não** herda automaticamente o `.env` do Vite;
 * sem isto, variáveis como `HF_TOKEN` em `apps/openyield/.env` podem não chegar ao main.
 */
export function loadOpenYieldDotEnv(...candidateDirs: string[]): void {
  const files: string[] = []
  for (const dir of candidateDirs) {
    if (!dir) continue
    const abs = path.resolve(dir, '.env')
    if (!files.includes(abs)) files.push(abs)
  }
  for (const file of files) {
    if (!fs.existsSync(file)) continue
    let text = fs.readFileSync(file, 'utf8')
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)
    for (let line of text.split('\n')) {
      line = line.replace(/\r$/, '')
      const t = line.trim()
      if (!t || t.startsWith('#')) continue
      const eq = t.indexOf('=')
      if (eq < 1) continue
      let key = t.slice(0, eq).trim()
      if (key.toLowerCase().startsWith('export ')) key = key.slice(7).trim()
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue
      let val = stripQuotes(t.slice(eq + 1))
      if (val === '') continue
      process.env[key] = val
    }
  }
}
