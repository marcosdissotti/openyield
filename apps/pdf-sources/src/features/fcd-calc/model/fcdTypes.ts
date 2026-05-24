/** Inputs espelham células editáveis da planilha CSMG3 (valores em milhares, exceto taxas). */
export interface FcdModelInputs {
  ticker: string
  /** B6 — EBIT (mil) */
  ebit: number
  /** B7 — IR como decimal (0,34 = 34%) */
  irRate: number
  /** D9 — Depreciação e amortização (mil; positiva no FCL, mesmo se negativa no site) */
  depreciation: number
  /** D11 — Capex (mil; sinal conforme Fundamentei / planilha) */
  capex: number
  /** D13 directo ou calculado via balanço circulante */
  workingCapitalMode: 'direct' | 'balance_sheet'
  workingCapitalChange: number
  /** A39 / B39 — ano anterior */
  currentAssetsPrior: number
  currentLiabilitiesPrior: number
  /** A42 / B42 — ano corrente */
  currentAssetsCurrent: number
  currentLiabilitiesCurrent: number
  /** D19 — Patrimônio líquido (mil) */
  equity: number
  /** D20 — Passivo total (mil) */
  totalLiabilities: number
  /** D23 — Taxa livre de risco (%) */
  riskFreeRate: number
  /** D25 — Prêmio de mercado (%) */
  marketPremium: number
  /** D27 — Beta */
  beta: number
  /** D32 — KD base (%) */
  costOfDebt: number
  /** D35 — Acréscimo KD (%) */
  debtPremiumAdd: number
  /** K4 — Crescimento 3 anos (decimal) */
  growthRate3y: number
  /** K5 — Crescimento perenidade (decimal) */
  growthRateTerminal: number
  /** K9 — Número de ações */
  sharesOutstanding: number
}

export interface FcdComputedValue {
  id: string
  label: string
  excelRef: string
  value: number
  /** Expressão activa (pode ser customizada). */
  formula: string
  /** Expressão original da planilha. */
  defaultFormula: string
  hint?: string
}

export interface FcdModelResult {
  inputs: FcdModelInputs
  formulaOverrides?: Partial<Record<string, string>>
  values: Record<string, FcdComputedValue>
  /** Ordem de exibição por secção */
  sections: Array<{ title: string; fieldIds: string[] }>
}

const CSMG3_PRESET: Omit<FcdModelInputs, 'ticker'> = {
  ebit: 1_651_950,
  irRate: 0.34,
  depreciation: -777_010,
  capex: -1_550_000,
  workingCapitalMode: 'balance_sheet',
  workingCapitalChange: -139_920,
  currentAssetsPrior: 2_563_010,
  currentLiabilitiesPrior: 1_910_540,
  currentAssetsCurrent: 2_449_940,
  currentLiabilitiesCurrent: 1_937_390,
  equity: 7_254_510,
  totalLiabilities: 13_189_610,
  riskFreeRate: 6.5,
  marketPremium: 4.47,
  beta: 0.714,
  costOfDebt: 12.32,
  debtPremiumAdd: 0,
  growthRate3y: 0.0738,
  growthRateTerminal: 0.01,
  sharesOutstanding: 380_253_069,
}

/** Cielo / CBAV3 — folha CBAV3 da planilha (preço justo ≈ R$ 20,45). */
const CBAV3_PRESET: Omit<FcdModelInputs, 'ticker'> = {
  ebit: -1_381_380,
  irRate: 0.34,
  depreciation: 572_190,
  capex: 760_000,
  workingCapitalMode: 'direct',
  workingCapitalChange: 2_014_080,
  currentAssetsPrior: 4_454_980,
  currentLiabilitiesPrior: 2_159_630,
  currentAssetsCurrent: 2_469_830,
  currentLiabilitiesCurrent: 2_188_560,
  equity: 5_323_480,
  totalLiabilities: 12_274_710,
  riskFreeRate: 6.5,
  marketPremium: 4.47,
  beta: 1.24,
  costOfDebt: 12.35,
  debtPremiumAdd: 0,
  growthRate3y: 0.069,
  growthRateTerminal: 0.01,
  sharesOutstanding: 651_072_697,
}

const TICKER_PRESETS: Record<string, Omit<FcdModelInputs, 'ticker'>> = {
  CSMG3: CSMG3_PRESET,
  CBAV3: CBAV3_PRESET,
  CIEL3: CBAV3_PRESET,
}

export function defaultFcdInputs(ticker = 'CSMG3'): FcdModelInputs {
  const t = ticker.trim().toUpperCase().replace(/\s+/g, '') || 'CSMG3'
  const preset = TICKER_PRESETS[t] ?? CSMG3_PRESET
  return { ...preset, ticker: t }
}
