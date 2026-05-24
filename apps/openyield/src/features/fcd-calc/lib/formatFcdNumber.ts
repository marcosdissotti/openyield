export function formatFairPrice(value: number): string {
  if (!Number.isFinite(value)) return '—'
  const magnitude = Math.abs(value)
  return magnitude.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

export function formatFcdNumber(value: number, opts?: { decimals?: number; currency?: boolean }): string {
  if (!Number.isFinite(value)) return '—'
  const decimals = opts?.decimals ?? (Math.abs(value) >= 1000 ? 0 : 2)
  if (opts?.currency) {
    return value.toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    })
  }
  return value.toLocaleString('pt-BR', { maximumFractionDigits: decimals })
}

export function formatFcdPercentFromDecimal(value: number, decimals = 2): string {
  if (!Number.isFinite(value)) return '—'
  return `${(value * 100).toLocaleString('pt-BR', { maximumFractionDigits: decimals })}%`
}

export function formatFcdPercent(value: number, decimals = 2): string {
  if (!Number.isFinite(value)) return '—'
  return `${value.toLocaleString('pt-BR', { maximumFractionDigits: decimals })}%`
}

export function parseLocaleNumber(raw: string): number {
  const t = raw.trim().replace(/\s/g, '').replace(/\./g, '').replace(',', '.')
  const n = parseFloat(t)
  return Number.isFinite(n) ? n : 0
}
