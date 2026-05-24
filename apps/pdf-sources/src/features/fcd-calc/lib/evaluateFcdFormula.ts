export function evaluateFcdFormula(expression: string, scope: Record<string, unknown>): number {
  const expr = expression.trim()
  if (!expr) return Number.NaN
  try {
    const keys = Object.keys(scope)
    const fn = new Function(...keys, `"use strict"; return (${expr})`)
    const result = fn(...keys.map((k) => scope[k]))
    return typeof result === 'number' && Number.isFinite(result) ? result : Number.NaN
  } catch {
    return Number.NaN
  }
}
