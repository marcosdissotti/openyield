import type { FcdComputedValue, FcdModelInputs, FcdModelResult } from '../model/fcdTypes'
import { evaluateFcdFormula } from './evaluateFcdFormula'
import {
  FCD_COMPUTE_ORDER,
  FCD_DEFAULT_FORMULAS,
  FCD_FORMULA_META,
  FCD_STEP_RESULTS,
  type FcdFormulaFieldId,
} from './fcdFormulas'
import { normalizeFcdInputs } from './normalizeFcdInputs'

function field(
  id: FcdFormulaFieldId,
  value: number,
  formula: string,
  defaultFormula: string,
): FcdComputedValue {
  const meta = FCD_FORMULA_META[id]
  return {
    id,
    label: meta.label,
    excelRef: meta.excelRef,
    value,
    formula,
    defaultFormula,
    hint: meta.hint,
  }
}

/** Réplica das fórmulas das folhas do Excel (CSMG3, CBAV3, …). */
export function computeFcdModel(
  rawInputs: FcdModelInputs,
  formulaOverrides: Partial<Record<FcdFormulaFieldId, string>> = {},
): FcdModelResult {
  const inputs = normalizeFcdInputs(rawInputs)
  const scope: Record<string, unknown> = { ...inputs }
  const values: Record<string, FcdComputedValue> = {}

  for (const id of FCD_COMPUTE_ORDER) {
    const defaultFormula = FCD_DEFAULT_FORMULAS[id]
    const formula = formulaOverrides[id]?.trim() || defaultFormula
    const value = evaluateFcdFormula(formula, scope)
    scope[id] = value
    values[id] = field(id, value, formula, defaultFormula)
  }

  return {
    inputs: rawInputs,
    formulaOverrides,
    values,
    sections: [
      { title: '1º Passo — FCL', fieldIds: FCD_STEP_RESULTS.fcl! },
      { title: '2º Passo — WACC', fieldIds: FCD_STEP_RESULTS.wacc! },
      { title: '3º Passo — Taxa de crescimento', fieldIds: [] },
      { title: '4º Passo — Número de ações', fieldIds: [] },
      { title: '5º Passo — FCD', fieldIds: FCD_STEP_RESULTS.fcd! },
    ],
  }
}
