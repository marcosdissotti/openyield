import type { FcdModelInputs } from '../model/fcdTypes'

/** Campos monetários da planilha em milhares (3 zeros ocultos vs Status Invest). */
export const FCD_MIL_INPUT_KEYS = [
  'ebit',
  'depreciation',
  'capex',
  'workingCapitalChange',
  'currentAssetsPrior',
  'currentLiabilitiesPrior',
  'currentAssetsCurrent',
  'currentLiabilitiesCurrent',
  'equity',
  'totalLiabilities',
] as const satisfies ReadonlyArray<keyof FcdModelInputs>

/**
 * Converte valores colados do Status Invest / Fundamentei (reais completos)
 * para a unidade da planilha (mil). Sites “ocultam” os últimos 3 zeros.
 */
export function normalizeToThousands(value: number): number {
  if (!Number.isFinite(value) || value === 0) return value
  let v = value
  while (Math.abs(v) >= 100_000_000) v /= 1000
  return v
}

/** Ajusta inputs para a convenção da planilha / vídeo antes do cálculo. */
export function normalizeFcdInputs(inputs: FcdModelInputs): FcdModelInputs {
  const next: FcdModelInputs = { ...inputs }
  for (const key of FCD_MIL_INPUT_KEYS) {
    next[key] = normalizeToThousands(next[key] as number) as FcdModelInputs[typeof key]
  }
  // Mantém o sinal informado (folha CSMG3: D9 negativa; CBAV3: D9 positiva).
  return next
}
