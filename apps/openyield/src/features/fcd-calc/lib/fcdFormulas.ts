export const FCD_COMPUTE_ORDER = [
  'noPat',
  'cgPrior',
  'cgCurrent',
  'varCg',
  'fcl',
  'we',
  'wd',
  'ke',
  'kd',
  'wacc',
  'year1',
  'year2',
  'year3',
  'terminal',
  'enterpriseValue',
  'fairPricePerShare',
] as const

export type FcdFormulaFieldId = (typeof FCD_COMPUTE_ORDER)[number]

export interface FcdFormulaMeta {
  id: FcdFormulaFieldId
  label: string
  excelRef: string
  hint?: string
}

export const FCD_FORMULA_META: Record<FcdFormulaFieldId, FcdFormulaMeta> = {
  noPat: { id: 'noPat', label: 'NoPat (lucro líquido operacional)', excelRef: 'D6' },
  cgPrior: { id: 'cgPrior', label: 'Capital de giro (ano anterior)', excelRef: 'C39' },
  cgCurrent: { id: 'cgCurrent', label: 'Capital de giro (ano corrente)', excelRef: 'C42' },
  varCg: { id: 'varCg', label: 'Variação de capital de giro', excelRef: 'D39' },
  fcl: { id: 'fcl', label: 'Fluxo de caixa livre (FCL)', excelRef: 'D3' },
  we: { id: 'we', label: 'Peso do equity (WE)', excelRef: 'F19' },
  wd: { id: 'wd', label: 'Peso da dívida (WD)', excelRef: 'F30' },
  ke: { id: 'ke', label: 'Custo do equity — KE (CAPM, %)', excelRef: 'F23' },
  kd: { id: 'kd', label: 'Custo da dívida — KD (%)', excelRef: 'F32' },
  wacc: { id: 'wacc', label: 'WACC (decimal)', excelRef: 'D16' },
  year1: { id: 'year1', label: 'FCL descontado — Ano 01', excelRef: 'J13' },
  year2: { id: 'year2', label: 'FCL descontado — Ano 02', excelRef: 'J14' },
  year3: { id: 'year3', label: 'FCL descontado — Ano 03', excelRef: 'J15' },
  terminal: { id: 'terminal', label: 'Valor terminal descontado', excelRef: 'J16' },
  enterpriseValue: {
    id: 'enterpriseValue',
    label: 'Fluxo de caixa descontado (empresa)',
    excelRef: 'K19',
    hint: 'Valores intermediários estão em mil; o total é multiplicado por 1.000 como na planilha.',
  },
  fairPricePerShare: { id: 'fairPricePerShare', label: 'Preço justo por ação', excelRef: 'K20' },
}

/** Expressões JavaScript executáveis (escopo: inputs normalizados + campos já calculados). */
export const FCD_DEFAULT_FORMULAS: Record<FcdFormulaFieldId, string> = {
  noPat: 'ebit * (1 - irRate)',
  cgPrior: 'currentAssetsPrior - currentLiabilitiesPrior',
  cgCurrent: 'currentAssetsCurrent - currentLiabilitiesCurrent',
  varCg:
    'workingCapitalMode === "balance_sheet" ? cgCurrent - cgPrior : workingCapitalChange',
  fcl: 'noPat + depreciation + capex + varCg',
  we: 'equity / totalLiabilities',
  wd: '1 - we',
  ke: 'riskFreeRate + beta * marketPremium',
  kd: 'debtPremiumAdd + costOfDebt',
  wacc: '(we * ke + wd * kd) / 100',
  year1: 'fcl / (1 + wacc)',
  year2: '(year1 * (1 + growthRate3y)) / Math.pow(1 + wacc, 2)',
  year3: '(year2 * (1 + growthRate3y)) / Math.pow(1 + wacc, 3)',
  terminal:
    '(year3 * (1 + growthRateTerminal)) / (wacc - growthRateTerminal) / Math.pow(1 + wacc, 4)',
  enterpriseValue: '(year1 + year2 + year3 + terminal) * 1000',
  fairPricePerShare: 'enterpriseValue / sharesOutstanding',
}

export const FCD_STEP_RESULTS: Record<string, FcdFormulaFieldId[]> = {
  fcl: ['noPat', 'cgPrior', 'cgCurrent', 'varCg', 'fcl'],
  wacc: ['we', 'wd', 'ke', 'kd', 'wacc'],
  fcd: ['year1', 'year2', 'year3', 'terminal', 'enterpriseValue'],
}
